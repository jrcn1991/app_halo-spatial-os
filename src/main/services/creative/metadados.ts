import type { CreativeItem, CreativeKind, CreativeProviderId } from '@shared/creative'

/**
 * O que se pode saber de uma página só pelo que ela publica sobre si.
 *
 * É o Open Graph e o Twitter Card — as mesmas etiquetas que o WhatsApp e o
 * Slack leem para montar a prévia de um link. Elas existem para serem lidas,
 * são declaradas pelo próprio site e não dependem de API nem de credencial: é
 * por isso que "salvar por link" funciona no primeiro dia, sem nada
 * configurado, e para QUALQUER endereço.
 *
 * O que este arquivo NÃO faz, de propósito: raspar o conteúdo da página. Nada
 * de ler o corpo do post, baixar o arquivo 3D ou colher imagens que o site não
 * declarou. O que se guarda são os metadados que a página oferece e o link
 * para o original — a regra de direitos autorais da Social Arte.
 */

/** Uma etiqueta `<meta property="…" content="…">`, nos dois arranjos de atributo. */
function meta(html: string, chave: string): string {
  const escapada = chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const padroes = [
    new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${escapada}["'][^>]*\\scontent\\s*=\\s*["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*\\s(?:property|name)\\s*=\\s*["']${escapada}["']`,
      'i',
    ),
  ]
  for (const padrao of padroes) {
    const achado = html.match(padrao)?.[1]
    if (achado) return desescapar(achado)
  }
  return ''
}

/** Todas as ocorrências de uma etiqueta — `og:image` costuma repetir. */
function metaTodas(html: string, chave: string): string[] {
  const escapada = chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${escapada}["'][^>]*\\scontent\\s*=\\s*["']([^"']*)["']`,
    'gi',
  )
  const achados: string[] = []
  for (const m of html.matchAll(re)) if (m[1]) achados.push(desescapar(m[1]))
  return achados
}

/**
 * Entidades HTML para texto. Nada de HTML aqui — só o texto que ele carrega.
 *
 * As numéricas (`&#8226;`, `&#x2022;`) entram porque são comuns em título de
 * página e apareciam CRUAS na biblioteca: "Tecnoblog &#8226; tecnologia".
 * `&amp;` é resolvida por último, senão `&amp;lt;` viraria `<`.
 */
function desescapar(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

/** Absolutiza uma URL relativa contra a página. Vazio quando não dá. */
function absoluta(bruta: string, base: string): string {
  if (!bruta) return ''
  try {
    const u = new URL(bruta, base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : ''
  } catch {
    return ''
  }
}

/**
 * Adivinha o tipo pelo que a página diz de si.
 *
 * "Adivinha" é a palavra certa, e por isso o padrão é `outro` e não um chute
 * bonito: o usuário troca o tipo na hora de salvar, e um palpite errado que
 * ele não vê seria pior que "outra referência".
 */
function tipoProvavel(url: string, titulo: string, descricao: string): CreativeKind {
  const alvo = `${url} ${titulo} ${descricao}`.toLowerCase()
  if (/thingiverse|printables|\bstl\b|\b3mf\b|impress|printable/.test(alvo)) return 'impressao-3d'
  if (/pinball/.test(alvo)) return 'pinball'
  if (/action.?figure|\bfigure\b|colecion/.test(alvo)) return 'action-figure'
  if (/\bui\b|\bux\b|hud|interface|dashboard/.test(alvo)) return 'interface'
  if (/render|blender|\b3d\b|model/.test(alvo)) return 'modelo-3d'
  if (/photo|fotograf/.test(alvo)) return 'fotografia'
  if (/ilustra|illustration|\bart\b|artwork|deviantart/.test(alvo)) return 'ilustracao'
  return 'outro'
}

/** Qual provedor conhece este endereço — `link` quando nenhum. */
export function provedorDaUrl(url: string): CreativeProviderId {
  const alvo = url.toLowerCase()
  if (/(^|\.)pinterest\./.test(new URL(alvo).hostname) || /\bpin\.it\b/.test(alvo)) {
    return 'pinterest'
  }
  if (/deviantart\.com|\bfav\.me\b/.test(alvo)) return 'deviantart'
  // O Printables não é fonte consultável (saiu em 04/09/2026), mas continua
  // sendo uma PROCEDÊNCIA: um endereço dele salvo por link mostra a marca
  // certa no cartão, e a atribuição é o que os termos de todo mundo pedem.
  if (/printables\.com/.test(alvo)) return 'printables'
  if (/thingiverse\.com/.test(alvo)) return 'thingiverse'
  return 'link'
}

/**
 * Monta a referência a partir do HTML da página.
 *
 * Campo que a página não declara fica vazio ou nulo — nunca preenchido por
 * dedução. O título cai para o `<title>` quando não há `og:title` porque toda
 * página tem um, e uma referência sem nome nenhum é inútil na biblioteca.
 */
export function itemDaPagina(html: string, urlFinal: string): CreativeItem {
  const titulo =
    meta(html, 'og:title') ||
    meta(html, 'twitter:title') ||
    desescapar(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '')

  const descricao =
    meta(html, 'og:description') || meta(html, 'twitter:description') || meta(html, 'description')

  const imagens = [
    ...metaTodas(html, 'og:image'),
    meta(html, 'og:image:secure_url'),
    meta(html, 'twitter:image'),
  ]
    .map((u) => absoluta(u, urlFinal))
    .filter((u, i, todas) => u && todas.indexOf(u) === i)

  const autor =
    meta(html, 'og:site_name') ||
    meta(html, 'article:author') ||
    meta(html, 'author') ||
    new URL(urlFinal).hostname.replace(/^www\./, '')

  const provider = provedorDaUrl(urlFinal)
  const publicado = meta(html, 'article:published_time') || meta(html, 'og:updated_time')

  return {
    // O endereço final é o id: é o que faz "salvar duas vezes o mesmo link"
    // ser o mesmo item, mesmo vindo de um encurtador diferente.
    id: `${provider}:${urlFinal}`,
    provider,
    externalId: urlFinal,
    title: titulo,
    description: descricao,
    author: autor,
    authorAvatar: '',
    cover: imagens[0] ?? '',
    gallery: imagens.slice(1, 8),
    url: urlFinal,
    kind: tipoProvavel(urlFinal, titulo, descricao),
    tags: [],
    license: '',
    // A página não declara métrica nenhuma, e zero seria uma afirmação falsa.
    likes: null,
    views: null,
    downloads: null,
    publishedAt: Number.isNaN(Date.parse(publicado)) ? null : new Date(publicado).toISOString(),
    meta: {},
  }
}
