import { t } from '@shared/i18n'
import {
  feedUrlValida,
  MAX_FEEDS,
  type NewsFeedStatus,
  type NewsItem,
  type NewsResult,
} from '@shared/news'
import { pedir } from './creative/rede'

/**
 * Leitor de feeds RSS 2.0, RSS 1.0 (RDF) e Atom.
 *
 * A busca acontece no processo MAIN, não no renderer: a CSP da página permite
 * `connect-src 'self'` e nada mais, de propósito. O parse também é daqui —
 * é próprio e pequeno, sem dependência nova. Um feed é uma lista de blocos
 * `<item>`/`<entry>` com meia dúzia de campos de texto; um parser XML
 * completo traria mais superfície (entidades externas, DTDs) do que o
 * problema tem. O que ele NÃO faz de propósito: não interpreta HTML — o
 * resumo é texto puro, com toda tag arrancada.
 *
 * Cache em memória por feed: notícia não muda em segundos, e um feed real
 * pesa (o do Tecnoblog vem com ~900 KB, medido). Um feed que falha não
 * derruba os outros, e não some em silêncio: o estado por feed diz o que
 * aconteceu, e enquanto houver uma leitura anterior ela continua valendo.
 */

/** Quinze minutos: é o intervalo que a home também usa para pedir de novo. */
const CACHE_MS = 15 * 60 * 1000
/** Depois de um erro, tenta de novo bem antes — a rede pode ter voltado. */
const RETRY_MS = 60 * 1000
const TIMEOUT_MS = 10_000
/** Teto do corpo: acima disso não é um feed, é outra coisa. */
const MAX_BYTES = 4 * 1024 * 1024
const MAX_ITEMS_PER_FEED = 30
/** A home mostra poucas de cada vez; mais que isso só atravessa o IPC à toa. */
const MAX_ITEMS_TOTAL = 60
/**
 * Quantas miniaturas são buscadas por atualização.
 *
 * A coluna da home mostra 5 e alterna entre as 12 mais novas: 12 cobre tudo o
 * que pode aparecer, e as outras 48 do resultado não valem uma requisição.
 */
const LIMITE_IMAGENS = 12
/** Uma miniatura de 64px que passe disto não é miniatura. */
const MAX_IMAGE_BYTES = 512 * 1024
/** URL da imagem -> `data:`. Vazio quando falhou, para não tentar de novo. */
const imagens = new Map<string, string>()
const SUMMARY_MAX = 160

type Parsed = { name: string; items: NewsItem[] }

type Cached = {
  /** Quando foi a última tentativa, com ou sem sucesso. */
  checkedAt: number
  /** Quando foi a última leitura que deu certo. */
  fetchedAt: number | null
  /** A última leitura boa — continua valendo enquanto a próxima falha. */
  parsed: Parsed | null
  error: string | null
}

const cache = new Map<string, Cached>()
/** Duas telas pedindo o mesmo feed ao mesmo tempo fazem UMA busca. */
const inflight = new Map<string, Promise<Cached>>()

/**
 * Manchetes de todos os feeds pedidos, misturadas e ordenadas da mais nova
 * para a mais antiga. Nunca lança.
 *
 * A lista chega do renderer e é validada de novo aqui: o que o main busca
 * pela rede é decisão do main.
 */
export async function headlines(feeds: unknown): Promise<NewsResult> {
  const pedidos = Array.isArray(feeds)
    ? [...new Set(feeds.filter((v): v is string => typeof v === 'string').map((v) => v.trim()))]
    : []
  const status: NewsFeedStatus[] = []
  const items: NewsItem[] = []

  const validos = pedidos.slice(0, MAX_FEEDS)
  const resultados = await Promise.all(
    validos.map(async (url) => {
      if (!feedUrlValida(url)) {
        return {
          url,
          cached: {
            checkedAt: Date.now(),
            fetchedAt: null,
            parsed: null,
            error: url
              ? t('endereço inválido — precisa começar com http:// ou https://')
              : t('endereço vazio'),
          } satisfies Cached,
        }
      }
      return { url, cached: await refresh(url) }
    }),
  )

  for (const { url, cached } of resultados) {
    status.push({
      url,
      name: cached.parsed?.name ?? null,
      count: cached.parsed?.items.length ?? 0,
      error: cached.error,
      fetchedAt: cached.fetchedAt ? new Date(cached.fetchedAt).toISOString() : null,
    })
    if (cached.parsed) items.push(...cached.parsed.items)
  }

  const ordenados = ordenar(items).slice(0, MAX_ITEMS_TOTAL)
  return { items: await comImagens(ordenados), feeds: status }
}

/**
 * Troca a URL da miniatura pelo `data:` correspondente.
 *
 * Por que aqui e não no renderer: a CSP dele é `img-src 'self' data:` mais três
 * hosts nomeados, e um feed traz imagem de onde quiser — `files.tecnoblog.net`
 * hoje, outro amanhã. Abrir a CSP para host arbitrário seria desfazer a parede
 * que ela é. O caminho já existe no projeto e é o mesmo da capa do MPRIS: quem
 * alcança a rede é o main, e o que atravessa o IPC é `data:`.
 *
 * Só as `LIMITE_IMAGENS` primeiras, e isso é medida: a coluna mostra 5 e alterna
 * entre 12, então buscar as 60 do resultado seria gastar 48 requisições por
 * atualização em imagem que ninguém vê.
 *
 * O cache é por URL e sem expiração dentro da execução: a mesma manchete
 * reaparece a cada 15 minutos, e a imagem dela não muda.
 */
async function comImagens(items: NewsItem[]): Promise<NewsItem[]> {
  const alvos = items.slice(0, LIMITE_IMAGENS)
  await Promise.all(alvos.map((item) => aquecerImagem(item.image)))
  return items.map((item) => ({ ...item, image: imagens.get(item.image) ?? '' }))
}

async function aquecerImagem(url: string): Promise<void> {
  if (!url || imagens.has(url)) return
  // Grava ANTES de buscar: duas manchetes com a mesma imagem não disparam duas
  // requisições, e uma falha não é tentada de novo a cada atualização.
  imagens.set(url, '')
  try {
    imagens.set(url, await baixarComoDataUrl(url))
  } catch {
    // Miniatura é enfeite: falhar nela não pode tirar a manchete da tela.
  }
}

/**
 * A URL da miniatura vem do FEED, não do usuário: um item pode apontar para
 * `127.0.0.1`, a rede local ou o endereço de metadados da nuvem. Por isso ela
 * passa pela trava de rede (`creative/rede.ts`), que confere o IP na conexão,
 * e cada redirecionamento é conferido de novo (auditoria de 26/09/2026).
 */
async function baixarComoDataUrl(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let alvo = new URL(url)
    for (let salto = 0; salto < 4; salto++) {
      const resposta = await pedir(
        alvo,
        { Accept: 'image/*', 'User-Agent': 'Halo (leitor de RSS)' },
        controller.signal,
      )
      const destino = resposta.headers.location
      if (resposta.status >= 300 && resposta.status < 400 && typeof destino === 'string') {
        resposta.descartar()
        alvo = new URL(destino, alvo)
        continue
      }
      if (resposta.status < 200 || resposta.status >= 300) {
        resposta.descartar()
        return ''
      }

      // O tipo vem do SERVIDOR e não do que a gente espera: sem esta conferência
      // um `text/html` de página de erro viraria um `data:` que o renderer
      // tentaria desenhar. `image/svg+xml` fica de fora de propósito — SVG é
      // documento com script, e isto aqui é uma miniatura de 64px.
      const bruto = resposta.headers['content-type']
      const tipo = (typeof bruto === 'string' ? bruto : '').split(';')[0]?.trim() ?? ''
      if (!/^image\/(png|jpeg|jpg|gif|webp|avif)$/i.test(tipo)) {
        resposta.descartar()
        return ''
      }
      const buffer = await resposta.ler(MAX_IMAGE_BYTES)
      return `data:${tipo};base64,${buffer.toString('base64')}`
    }
    return ''
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

/** Mais nova primeiro; sem data vai para o fim, na ordem em que o feed deu. */
function ordenar(items: NewsItem[]): NewsItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const da = a.item.publishedAt ? Date.parse(a.item.publishedAt) : Number.NEGATIVE_INFINITY
      const db = b.item.publishedAt ? Date.parse(b.item.publishedAt) : Number.NEGATIVE_INFINITY
      return db - da || a.index - b.index
    })
    .map(({ item }) => item)
}

async function refresh(url: string): Promise<Cached> {
  const hit = cache.get(url)
  if (hit) {
    const validade = hit.error ? RETRY_MS : CACHE_MS
    if (Date.now() - hit.checkedAt < validade) return hit
  }

  const emCurso = inflight.get(url)
  if (emCurso) return emCurso

  const busca = (async () => {
    const anterior = cache.get(url)
    let proximo: Cached
    try {
      const xml = await getText(url)
      const parsed = parseFeed(xml, url)
      proximo = { checkedAt: Date.now(), fetchedAt: Date.now(), parsed, error: null }
    } catch (error) {
      proximo = {
        checkedAt: Date.now(),
        fetchedAt: anterior?.fetchedAt ?? null,
        // A leitura anterior continua: manchete de uma hora atrás é melhor
        // que coluna vazia, desde que a tela diga que a busca falhou.
        parsed: anterior?.parsed ?? null,
        error: descreverErro(error),
      }
    }
    cache.set(url, proximo)
    return proximo
  })()

  inflight.set(url, busca)
  try {
    return await busca
  } finally {
    inflight.delete(url)
  }
}

/** Erros viram frases — é o que a home mostra ao lado do nome do feed. */
function descreverErro(error: unknown): string {
  if (error instanceof FeedError) return error.message
  const e = error as { name?: string; message?: string; cause?: { code?: string } }
  if (e?.name === 'AbortError')
    return t('demorou mais de {n} s para responder', { n: TIMEOUT_MS / 1000 })
  const code = e?.cause?.code
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return t('sem rede, ou o endereço não existe')
  if (code === 'ECONNREFUSED') return t('o servidor recusou a conexão')
  if (code === 'CERT_HAS_EXPIRED' || code?.startsWith('ERR_TLS')) {
    return t('o certificado do servidor não é válido')
  }
  if (code) return t('sem resposta ({codigo})', { codigo: code })
  return t('não consegui buscar: {motivo}', { motivo: e?.message ?? String(error) })
}

/** Erro com frase pronta para a tela, para distinguir do erro de rede. */
class FeedError extends Error {}

async function getText(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept:
          'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
        'User-Agent': 'Halo (leitor de RSS)',
      },
    })
    if (!response.ok)
      throw new FeedError(t('o servidor respondeu HTTP {status}', { status: response.status }))
    const tamanho = Number(response.headers.get('content-length') ?? 0)
    if (tamanho > MAX_BYTES) throw new FeedError(t('feed grande demais (mais de 4 MB)'))
    const text = await response.text()
    if (text.length > MAX_BYTES) throw new FeedError(t('feed grande demais (mais de 4 MB)'))
    return text
  } finally {
    clearTimeout(timer)
  }
}

// ——— parse ———————————————————————————————————————————————————————————

/**
 * Reconhece o formato pelo bloco que repete: `<entry>` é Atom, `<item>` é RSS
 * (2.0 ou 1.0/RDF — os campos de item são os mesmos).
 */
export function parseFeed(xml: string, url: string): Parsed {
  const corpo = xml.replace(/^﻿/, '')
  const cabeca = corpo.slice(0, 4096).toLowerCase()

  if (/^\s*<!doctype html|<html[\s>]/.test(cabeca)) {
    throw new FeedError(
      t('esse endereço é uma página, não um feed — procure o link do RSS no site'),
    )
  }

  const atom = /<feed[\s>]/.test(cabeca) && /<entry[\s>]/.test(corpo)
  const rss = /<(rss|rdf:RDF|channel)[\s>]/.test(cabeca) && /<item[\s>]/.test(corpo)
  if (!atom && !rss) {
    // Um feed sem nenhum item ainda é um feed: vazio, mas válido.
    if (/<(rss|rdf:RDF|channel|feed)[\s>]/.test(cabeca)) {
      return { name: canalNome(corpo, url), items: [] }
    }
    throw new FeedError(t('não é um feed RSS nem Atom'))
  }

  const name = canalNome(corpo, url)
  const blocos = atom ? blocosDe(corpo, 'entry') : blocosDe(corpo, 'item')
  const items: NewsItem[] = []

  for (const bloco of blocos.slice(0, MAX_ITEMS_PER_FEED)) {
    const item = atom ? itemAtom(bloco, name, url) : itemRss(bloco, name, url)
    if (item) items.push(item)
  }
  return { name, items }
}

/** O `<title>` do canal é o que vem ANTES do primeiro item. */
function canalNome(xml: string, url: string): string {
  const primeiroItem = xml.search(/<(item|entry)[\s>]/)
  const cabecalho = primeiroItem === -1 ? xml : xml.slice(0, primeiroItem)
  const titulo = texto(campo(cabecalho, 'title'))
  if (titulo) return titulo
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Todos os blocos `<tag …>…</tag>` — com atributos, como o `<item rdf:about>` do RSS 1.0. */
function blocosDe(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g')
  const blocos: string[] = []
  for (const m of xml.matchAll(re)) blocos.push(m[1] ?? '')
  return blocos
}

function itemRss(bloco: string, source: string, feed: string): NewsItem | null {
  const title = texto(campo(bloco, 'title'))
  const link = normalizarLink(texto(campo(bloco, 'link')) || guidComoLink(bloco))
  if (!title || !link) return null
  const guid = texto(campo(bloco, 'guid'))
  const data = texto(campo(bloco, 'pubDate')) || texto(campo(bloco, 'dc:date'))
  const resumo = campo(bloco, 'description') || campo(bloco, 'content:encoded')
  return {
    id: guid || link,
    title,
    link,
    publishedAt: dataIso(data),
    source,
    summary: resumir(texto(resumo), title),
    feed,
    image: imagemDoBloco(bloco),
  }
}

/** Sem `<link>`, alguns feeds só trazem o `guid` como permalink. */
function guidComoLink(bloco: string): string {
  const m = bloco.match(/<guid\b([^>]*)>([\s\S]*?)<\/guid>/)
  if (!m) return ''
  if (/isPermaLink\s*=\s*["']false["']/i.test(m[1] ?? '')) return ''
  return texto(m[2] ?? '')
}

function itemAtom(bloco: string, source: string, feed: string): NewsItem | null {
  const title = texto(campo(bloco, 'title'))
  const link = normalizarLink(linkAtom(bloco))
  if (!title || !link) return null
  const id = texto(campo(bloco, 'id'))
  const data = texto(campo(bloco, 'published')) || texto(campo(bloco, 'updated'))
  const resumo = campo(bloco, 'summary') || campo(bloco, 'content')
  return {
    id: id || link,
    title,
    link,
    publishedAt: dataIso(data),
    source,
    summary: resumir(texto(resumo), title),
    feed,
    image: imagemDoBloco(bloco),
  }
}

/**
 * A URL da miniatura, procurada nos quatro lugares onde os feeds a põem.
 *
 * A ordem é por TAMANHO, não por preferência de formato: `media:thumbnail` é a
 * versão pequena que o WordPress publica (340px no feed que motivou isto), e
 * ela é a certa para um quadro de 64px na tela. As outras três são o mesmo
 * arquivo em tamanho de capa, e só entram quando a primeira falta.
 *
 * Aqui sai só a URL. Quem a busca e converte para `data:` é `comImagens`, e é
 * lá que moram os limites — a CSP do renderer não abre host nenhum.
 */
function imagemDoBloco(bloco: string): string {
  const atributo = (tag: string, attr: string): string => {
    const m = bloco.match(new RegExp(`<${tag}\\b[^>]*\\b${attr}\\s*=\\s*["']([^"']+)["']`, 'i'))
    return m?.[1] ?? ''
  }

  const candidatos = [
    atributo('media:thumbnail', 'url'),
    atributo('media:content', 'url'),
    // `enclosure` carrega qualquer anexo (áudio de podcast, PDF): só serve se
    // o próprio feed disser que é imagem.
    /<enclosure\b[^>]*type\s*=\s*["']image\//i.test(bloco) ? atributo('enclosure', 'url') : '',
    // Último recurso: a primeira `<img>` do corpo do post.
    atributo('img', 'src'),
  ]

  return candidatos.find((u) => /^https?:\/\//i.test(u)) ?? ''
}

/** Atom: `<link rel="alternate" href>` vale mais; sem `rel` também é alternate. */
function linkAtom(bloco: string): string {
  let semRel = ''
  for (const m of bloco.matchAll(/<link\b([^>]*?)\/?>/g)) {
    const attrs = m[1] ?? ''
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/)?.[1]
    if (!href) continue
    const rel = attrs.match(/\brel\s*=\s*["']([^"']+)["']/)?.[1]
    if (rel === 'alternate') return decodificar(href)
    if (!rel && !semRel) semRel = decodificar(href)
  }
  return semRel
}

/** O conteúdo cru de `<tag>…</tag>` — CDATA ainda embrulhado, entidades intactas. */
function campo(bloco: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`)
  return bloco.match(re)?.[1] ?? ''
}

/**
 * De conteúdo XML para texto puro: tira o CDATA, resolve entidades, arranca
 * tags. Dentro de CDATA o HTML vem literal; fora, vem escapado — os dois
 * caminhos terminam no mesmo lugar.
 */
function texto(cru: string): string {
  const cdata = cru.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  const html = cdata ? (cdata[1] ?? '') : decodificar(cru)
  return decodificar(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
}

function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, corpo: string) => {
    if (corpo[0] === '#') {
      const codigo =
        corpo[1] === 'x' || corpo[1] === 'X'
          ? parseInt(corpo.slice(2), 16)
          : parseInt(corpo.slice(1), 10)
      return Number.isFinite(codigo) && codigo > 0 && codigo < 0x110000
        ? String.fromCodePoint(codigo)
        : m
    }
    return ENTIDADES[corpo.toLowerCase()] ?? m
  })
}

/** Resumo curto, sem repetir o título (feeds do WordPress o colam no fim). */
function resumir(s: string, title: string): string {
  let r = s
  if (title && r.endsWith(title)) r = r.slice(0, -title.length).trim()
  if (r === title) return ''
  if (r.length <= SUMMARY_MAX) return r
  const corte = r.lastIndexOf(' ', SUMMARY_MAX)
  return `${r.slice(0, corte > SUMMARY_MAX / 2 ? corte : SUMMARY_MAX).trim()}…`
}

/** RFC 822 (RSS) e ISO 8601 (Atom, dc:date): o V8 lê os dois. */
function dataIso(s: string): string | null {
  if (!s) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** Só http(s) chega à tela: é o que o navegador do sistema vai abrir. */
function normalizarLink(s: string): string {
  const link = s.trim()
  return /^https?:\/\/./.test(link) ? link : ''
}
