/**
 * Catálogo de mídia lido de uma lista M3U.
 *
 * O modelo não é "uma entrada por linha": numa lista real a esmagadora maioria
 * das linhas são episódios soltos (`Série S01E07`), e mostrar isso cru daria
 * uma parede de dezenas de milhares de linhas. Por isso o main agrupa em
 * títulos — filme é um título, série é um título com seus episódios dentro.
 */

export type MediaKind = 'movie' | 'series'

/** Um título da biblioteca, já agrupado. */
export type Title = {
  /** Estável enquanto a lista não muda — é por ele que se pede o stream. */
  id: string
  name: string
  /** Ano do nome, quando havia. */
  year: number | null
  /** Marcadores achados no nome: `L` (legendado), `4K`, `HDR`… */
  tags: string[]
  poster: string
  /** A categoria da lista (`group-title`). */
  group: string
  kind: MediaKind
  seasons: number
  episodes: number
}

export type Episode = {
  id: string
  season: number
  number: number
  /** O que vinha depois do `SxxExx`, quando vinha alguma coisa. */
  title: string
}

export type TitleDetail = Title & { list: Episode[] }

/**
 * O que uma base de metadados sabe sobre o título e a lista M3U não sabe.
 *
 * A lista traz nome, ano, categoria e capa — nada mais. Sinopse, nota, gêneros,
 * duração e elenco vêm do TMDB, a mesma fonte que o Jellyfin usa. Buscar exige
 * uma chave gratuita, que o usuário informa em Configurações.
 */
export type TitleExtra = {
  overview: string
  /** Nota de 0 a 10, como o TMDB publica. `null` quando ninguém votou. */
  rating: number | null
  votes: number
  runtimeMin: number | null
  genres: string[]
  /** Os primeiros nomes do elenco, na ordem de crédito. */
  cast: string[]
  /** Imagem larga, para o topo do painel. */
  backdrop: string
  /** A página do título no TMDB, para quem quiser ver o resto. */
  url: string
}

/**
 * Resultado de uma busca de metadados.
 *
 * Os três casos são diferentes e a tela mostra coisas diferentes em cada um:
 * sem chave configurada, com chave mas sem achar o título, e achou.
 */
export type ExtraResult =
  | { state: 'no-key' }
  | { state: 'not-found' }
  | { state: 'error'; message: string }
  | { state: 'found'; extra: TitleExtra }

/** Uma categoria da lista e o que ela contém. */
export type Category = { name: string; movies: number; series: number }

export type CatalogQuery = {
  /**
   * Texto da busca.
   *
   * Ignora acento, espaço e pontuação, e aceita palavras fora de ordem:
   * "cacador", "killbill" e "bill kill" acham o que se espera. O resultado
   * volta por relevância — quem começa com o que foi digitado vem primeiro.
   */
  query?: string
  group?: string
  kind?: MediaKind | 'all'
  /**
   * Restringe a estes títulos, na ordem em que vierem.
   *
   * É como os favoritos são listados: quem sabe quais são é o renderer (estão
   * nas configurações), então ele diz — o catálogo não guarda preferência.
   */
  only?: string[]
  offset?: number
  limit?: number
}

/**
 * Onde alguém parou de assistir.
 *
 * Nome, capa e legenda vêm guardados junto de propósito: a lista muda, e o
 * título pode sumir dela. Guardando só o id, "Continuar assistindo" viraria
 * uma fileira de espaços em branco — assim ele continua legível, e só o botão
 * de tocar deixa de funcionar.
 */
export type Progress = {
  id: string
  /** Índice do episódio, ou `null` num filme. */
  episode: string | null
  seconds: number
  duration: number
  /** Quando foi, em milissegundos desde a época. */
  at: number
  name: string
  poster: string
  subtitle: string
}

/** Uma fatia do catálogo. `total` é o tamanho do resultado inteiro. */
export type CatalogPage = { total: number; items: Title[] }

/**
 * Como está a biblioteca.
 *
 * `ready: false` com `path` vazio quer dizer que ninguém escolheu uma lista
 * ainda — é o estado da primeira execução, e a tela diz isso em vez de fingir
 * uma biblioteca vazia.
 */
export type CatalogStatus = {
  ready: boolean
  path: string
  movies: number
  series: number
  episodes: number
  error: string | null
}
