import { t } from '@shared/i18n'
import type { ExtraResult, MediaKind, TitleExtra } from '@shared/media'

/**
 * Metadados de filmes e séries, pelo TMDB.
 *
 * É a mesma fonte que o Jellyfin usa, e as capas da própria lista do usuário
 * já vêm de lá. A lista M3U só carrega nome, ano, categoria e capa — sinopse,
 * nota, gêneros, duração e elenco vêm daqui.
 *
 * **Exige chave**, e ela é do usuário: o TMDB responde 401 sem uma (medido). O
 * Jellyfin embute a dele; um app aberto não pode fazer isso — a chave iria
 * parar no repositório. Por isso o campo em Configurações > Mídia, com o
 * caminho para obtê-la (gratuita).
 *
 * A busca acontece no processo MAIN. A CSP do renderer permite `connect-src
 * 'self'` e nada mais, de propósito.
 */

const API = 'https://api.themoviedb.org/3'
const IMAGENS = 'https://image.tmdb.org/t/p'
const TIMEOUT_MS = 8000
/** Metadados de filme não mudam; o que muda é a nota, e não a cada minuto. */
const CACHE_MS = 24 * 60 * 60 * 1000
/** Teto do cache: um catálogo tem dezenas de milhares de títulos. */
const CACHE_MAX = 600
/** Elenco: os primeiros créditos bastam; a lista inteira não cabe no painel. */
const ELENCO = 5

type Cached = { at: number; resultado: ExtraResult }
const cache = new Map<string, Cached>()

/**
 * O TMDB dá duas credenciais na mesma página, e as pessoas colam qualquer uma.
 *
 * A v3 é uma chave de 32 hexadecimais e vai na URL; a v4 é um JWT (começa com
 * `eyJ`) e vai no cabeçalho `Authorization`. Aceitar as duas evita um 401
 * confuso para quem colou a de cima em vez da de baixo.
 */
function ehTokenV4(key: string): boolean {
  return key.startsWith('eyJ')
}

async function getJson(url: string, key: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      ...(ehTokenV4(key) ? { headers: { Authorization: `Bearer ${key}` } } : {}),
    })
    if (response.status === 401) throw new Error(t('chave do TMDB recusada'))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

type Busca = {
  results?: {
    id: number
    title?: string
    name?: string
    release_date?: string
    first_air_date?: string
    popularity?: number
  }[]
}

type Detalhe = {
  overview?: string
  vote_average?: number
  vote_count?: number
  runtime?: number
  episode_run_time?: number[]
  backdrop_path?: string | null
  genres?: { name: string }[]
  credits?: { cast?: { name: string }[] }
}

/**
 * Escolhe entre os resultados da busca.
 *
 * O ano é o desempate que importa: "Matrix" devolve o filme de 1999, a série de
 * 2015 e meia dúzia de documentários. Sem ano, fica o mais popular — que é o
 * critério do próprio TMDB para ordenar, e acerta na esmagadora maioria.
 */
function escolher(resultados: NonNullable<Busca['results']>, year: number | null) {
  if (year === null) return resultados[0]
  const doAno = resultados.find((r) => {
    const data = r.release_date ?? r.first_air_date ?? ''
    return data.startsWith(String(year))
  })
  // Um ano de diferença é comum: a lista costuma trazer o ano de estreia no
  // país, e o TMDB o da estreia original.
  const perto = resultados.find((r) => {
    const data = r.release_date ?? r.first_air_date ?? ''
    const ano = Number(data.slice(0, 4))
    return Number.isFinite(ano) && Math.abs(ano - year) <= 1
  })
  return doAno ?? perto ?? resultados[0]
}

function limparCache(): void {
  if (cache.size <= CACHE_MAX) return
  // Basta soltar o mais antigo: Map preserva a ordem de inserção.
  const primeiro = cache.keys().next()
  if (!primeiro.done) cache.delete(primeiro.value)
}

/**
 * O que o TMDB sabe sobre um título.
 *
 * Nunca lança: a tela precisa distinguir "sem chave" de "não achei" de "deu
 * erro", e cada caso mostra uma coisa diferente. Falha de rede não pode
 * derrubar o painel de detalhes.
 */
export async function extra(
  kind: MediaKind,
  name: string,
  year: number | null,
  key: string,
): Promise<ExtraResult> {
  if (!key) return { state: 'no-key' }

  const chave = `${kind}|${name.toLowerCase()}|${year ?? ''}`
  const guardado = cache.get(chave)
  if (guardado && Date.now() - guardado.at < CACHE_MS) return guardado.resultado

  const resultado = await buscar(kind, name, year, key).catch(
    (erro: unknown): ExtraResult => ({ state: 'error', message: (erro as Error).message }),
  )

  // Erro não entra no cache: rede que cai volta, e ficar 24h repetindo
  // "não deu" seria pior que tentar de novo.
  if (resultado.state !== 'error') {
    cache.set(chave, { at: Date.now(), resultado })
    limparCache()
  }
  return resultado
}

async function buscar(
  kind: MediaKind,
  name: string,
  year: number | null,
  key: string,
): Promise<ExtraResult> {
  const rota = kind === 'movie' ? 'movie' : 'tv'
  // Com token v4 a credencial vai no cabeçalho, não na URL.
  const comum = ehTokenV4(key)
    ? 'language=pt-BR'
    : `api_key=${encodeURIComponent(key)}&language=pt-BR`

  const busca = (await getJson(
    `${API}/search/${rota}?${comum}&query=${encodeURIComponent(name)}` +
      (year !== null ? `&${kind === 'movie' ? 'year' : 'first_air_date_year'}=${year}` : ''),
    key,
  )) as Busca

  const escolhido = escolher(busca.results ?? [], year)
  if (!escolhido) return { state: 'not-found' }

  const detalhe = (await getJson(
    `${API}/${rota}/${escolhido.id}?${comum}&append_to_response=credits`,
    key,
  )) as Detalhe

  const minutos = detalhe.runtime ?? detalhe.episode_run_time?.[0] ?? null
  const extraDoTitulo: TitleExtra = {
    overview: detalhe.overview?.trim() ?? '',
    rating:
      typeof detalhe.vote_average === 'number' && detalhe.vote_average > 0
        ? Math.round(detalhe.vote_average * 10) / 10
        : null,
    votes: detalhe.vote_count ?? 0,
    runtimeMin: typeof minutos === 'number' && minutos > 0 ? minutos : null,
    genres: (detalhe.genres ?? []).map((g) => g.name).filter(Boolean),
    cast: (detalhe.credits?.cast ?? [])
      .slice(0, ELENCO)
      .map((p) => p.name)
      .filter(Boolean),
    backdrop: detalhe.backdrop_path ? `${IMAGENS}/w780${detalhe.backdrop_path}` : '',
    url: `https://www.themoviedb.org/${rota}/${escolhido.id}`,
  }
  return { state: 'found', extra: extraDoTitulo }
}
