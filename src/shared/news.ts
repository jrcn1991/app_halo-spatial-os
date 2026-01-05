/**
 * Notícias — manchetes dos feeds RSS/Atom que o usuário configurou.
 *
 * Vive em `shared/` porque o processo main também as produz: é ele quem busca
 * os feeds pela rede (a CSP do renderer não alcança host nenhum, de
 * propósito) e faz o parse. O renderer só mostra.
 */

export type NewsItem = {
  /** Estável entre buscas: o `guid`/`id` do feed, ou o link quando não há. */
  id: string
  title: string
  /** Sempre http(s): é o que o navegador do sistema vai abrir. */
  link: string
  /** ISO, ou `null` quando o feed não diz — o app não inventa data. */
  publishedAt: string | null
  /** Nome do feed (o `<title>` do canal), para a manchete dizer de onde veio. */
  source: string
  /** Resumo curto, já sem HTML. Vazio quando o feed não traz. */
  summary: string
  /** URL do feed de origem, para agrupar e para o estado por feed. */
  feed: string
  /**
   * A miniatura, já como `data:` — ou vazio quando o feed não traz.
   *
   * `data:`, e não a URL do feed, porque a CSP do renderer não abre host
   * nenhum de propósito, e um feed traz imagem de onde quiser. Quem busca e
   * converte é o main, do mesmo jeito que já faz com a capa do MPRIS. O
   * comprimento é limitado ali (ver `MAX_IMAGE_BYTES` em `services/rss.ts`):
   * uma miniatura de 64px não justifica atravessar megabytes pelo IPC.
   */
  image: string
}

/**
 * O que aconteceu com cada feed pedido.
 *
 * Um feed fora do ar não pode derrubar os outros, nem sumir em silêncio: a
 * tela mostra as manchetes que vieram E diz qual feed não respondeu.
 */
export type NewsFeedStatus = {
  url: string
  /** `null` enquanto o feed nunca respondeu. */
  name: string | null
  /** Quantas manchetes este feed trouxe. */
  count: number
  /** `null` quando deu certo; senão, a frase que a tela mostra. */
  error: string | null
  /** ISO da última busca que deu certo — é o que diz "de X min atrás". */
  fetchedAt: string | null
}

/**
 * Manchetes de todos os feeds, já misturadas e ordenadas da mais nova para a
 * mais antiga. Nunca lança: sem feed, sem rede e feed inválido são estados,
 * cada um com sua frase — nenhum deles vira dado inventado.
 */
export type NewsResult = {
  items: NewsItem[]
  feeds: NewsFeedStatus[]
  /**
   * Conteúdo de exemplo, e só fora do Electron (ver `data/mock/news.ts`). A
   * tela etiqueta quando vê isto: dado que não é do usuário nunca passa sem
   * aviso.
   */
  demo?: true
}

/** Teto de feeds: a home mostra poucas manchetes de cada vez. */
export const MAX_FEEDS = 20

/**
 * Só http(s) com alguma coisa depois do esquema. É a mesma regra da gaveta da
 * ilha: outro esquema não teria como ser buscado nem aberto.
 */
export function feedUrlValida(url: string): boolean {
  if (!/^https?:\/\/./.test(url) || url.length > 512) return false
  try {
    const u = new URL(url)
    return Boolean(u.hostname)
  } catch {
    return false
  }
}
