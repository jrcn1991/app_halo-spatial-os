/**
 * Spotify: o que atravessa main <-> renderer.
 *
 * Duas fontes alimentam a tela de Música, e elas são bem diferentes:
 *
 * - **Web API** (rede, no main): playlists, álbuns salvos, artistas seguidos,
 *   ouvidos recentemente, faixas de cada item. Exige OAuth, e o OAuth exige um
 *   *Client ID* que é do usuário (ver `spotify-auth.ts`).
 * - **MPRIS** (D-Bus, no main): o que o aplicativo do Spotify desta máquina
 *   está tocando, e os comandos de transporte. Não exige credencial nenhuma.
 *
 * Por isso quase tudo vem embrulhado em `SpotifyResult`: a tela precisa
 * distinguir "sem Client ID" de "não conectado" de "deu erro" — e cada um
 * mostra uma coisa diferente, nunca dado inventado.
 */

/** Escopos pedidos no consentimento. Cada um existe por uma leitura da tela. */
export const SPOTIFY_SCOPES = [
  // Nome da conta e se é Premium (comandar aparelhos exige Premium).
  'user-read-private',
  // Painel esquerdo: playlists do usuário.
  'playlist-read-private',
  'playlist-read-collaborative',
  // Painel esquerdo: álbuns salvos.
  'user-library-read',
  // Painel esquerdo: artistas seguidos.
  'user-follow-read',
  // Painel direito: artistas mais ouvidos, quando não há seguidos.
  'user-top-read',
  // Painel central: ouvidos recentemente.
  'user-read-recently-played',
  // Transporte: ler e comandar o aparelho ativo (Spotify Connect).
  'user-read-playback-state',
  'user-modify-playback-state',
] as const

/**
 * Endereço de retorno do consentimento, quando o usuário não escolheu outro.
 *
 * O endereço precisa bater, letra por letra, com o que está registrado em
 * *Redirect URIs* no painel de desenvolvedor do usuário — por isso ele é
 * configurável (`settings.music.spotifyRedirect`) e este é só o padrão.
 *
 * As regras do Spotify, da documentação oficial de Redirect URIs:
 *
 * > "Use HTTPS for your redirect URI, unless you are using a loopback address,
 * > when HTTP is permitted."
 * > "If you are using a loopback address, use the explicit IPv4 or IPv6, like
 * > `http://127.0.0.1:PORT` or `http://[::1]:PORT`."
 * > "`localhost` is not allowed as redirect URI."
 *
 * Ou seja: **HTTP em loopback é o caminho suportado**, e é o único que um app
 * desktop consegue servir sem inventar um certificado. Um `https://127.0.0.1`
 * exigiria TLS num servidor local — certificado autoassinado, aviso vermelho no
 * navegador e o hábito péssimo de clicar "prosseguir mesmo assim".
 *
 * A mesma página permite registrar o loopback **sem porta** e acrescentar a
 * porta no pedido de autorização; `spotify-auth.ts` faz isso quando o endereço
 * configurado não traz porta, e aí sobe numa porta livre qualquer.
 */
export const SPOTIFY_REDIRECT_PADRAO = 'http://127.0.0.1:8898/callback'

/**
 * O endereço de retorno é servido por nós: só HTTP em loopback explícito.
 *
 * Recusar aqui (e explicar na tela) é melhor que aceitar um `https://` que o
 * app nunca conseguiria atender — o usuário ficaria olhando uma aba de erro
 * sem saber por quê.
 */
export function redirectValido(uri: string): boolean {
  try {
    const url = new URL(uri)
    if (url.protocol !== 'http:') return false
    // `localhost` é recusado pelo próprio Spotify; o resto não é loopback.
    return url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1'
  } catch {
    return false
  }
}

/** Onde o usuário cria o app dele e copia o Client ID. */
export const SPOTIFY_DASHBOARD = 'https://developer.spotify.com/dashboard'

export type SpotifyUser = {
  displayName: string
  /** `premium`, `free`, `open`… Comandar aparelhos só vale com Premium. */
  product: string
}

/**
 * Situação da conexão.
 *
 * `no-client-id` é o estado inicial de qualquer instalação: o app não embute
 * credencial nenhuma, e sem o Client ID do usuário não há nem para onde mandar
 * o consentimento.
 */
export type SpotifyAuth =
  | { state: 'no-client-id' }
  | { state: 'signed-out' }
  | { state: 'signed-in'; user: SpotifyUser }
  | { state: 'error'; message: string }

/**
 * Resposta de qualquer leitura da Web API.
 *
 * `demo` só acontece FORA do Electron (navegador, `test:screens`), onde a
 * fábrica de dados cai nos mocks. A tela mostra um aviso quando o vê — dado de
 * exemplo sem etiqueta seria mentira (ver MOCKS.md).
 */
export type SpotifyResult<T> =
  | { state: 'ok'; value: T }
  | { state: 'demo'; value: T }
  | { state: 'no-client-id' }
  | { state: 'signed-out' }
  | { state: 'error'; message: string }

export type SpotifyItemKind = 'playlist' | 'album' | 'artist'

/** Uma playlist, um álbum ou um artista — o que a coluna esquerda lista. */
export type SpotifyItem = {
  /** `spotify:playlist:37i9…` — é isto que se manda tocar. */
  uri: string
  id: string
  kind: SpotifyItemKind
  name: string
  /** Dono da playlist, artistas do álbum, seguidores do artista. */
  meta: string
  /** URL da capa (CDN do Spotify), ou vazio quando não há arte. */
  image: string
  /** Faixas, quando a fonte informa. `0` para artista. */
  tracks: number
}

export type SpotifyTrack = {
  uri: string
  name: string
  artists: string
  album: string
  durationMs: number
  image: string
  /** ISO, só em "ouvidos recentemente". `null` no resto. */
  playedAt: string | null
}

/** O que a tela carrega de uma vez, ao abrir. */
export type SpotifyLibrary = {
  playlists: SpotifyItem[]
  albums: SpotifyItem[]
  artists: SpotifyItem[]
  recent: SpotifyTrack[]
  /**
   * O que não veio, e por quê. Vazio quando veio tudo.
   *
   * Existe porque cada coleção depende de um escopo diferente: quem autorizou
   * só a reprodução recebe 403 nas playlists. Uma lista vazia sem explicação
   * pareceria "você não tem playlists" — que é mentira, e do tipo pior: a que
   * o usuário não tem como desconfiar.
   */
  notice: string
}

/** Um item aberto no painel central, já com as faixas dele. */
export type SpotifyDetail = {
  item: SpotifyItem
  tracks: SpotifyTrack[]
  /**
   * Álbuns, quando o item é um artista.
   *
   * Existe porque `/artists/{id}/top-tracks` é recusado para apps em modo de
   * desenvolvimento (403, medido) enquanto `/artists/{id}/albums` responde. A
   * discografia acaba sendo mais útil que as dez mais tocadas, então não é
   * consolo: é o que a tela mostra.
   */
  albums: SpotifyItem[]
  /**
   * O que não deu para trazer, em uma frase.
   *
   * Vazio quando veio tudo. Um item que abre sem faixas e sem explicação
   * parece o app quebrado — e o motivo aqui não é o app, é a permissão que o
   * app do usuário tem no Spotify.
   */
  notice: string
}

/**
 * De onde a leitura veio, ou por onde o comando saiu.
 *
 * Não é detalhe interno: a tela diz isso ao usuário, porque as duas fontes têm
 * limites diferentes (o MPRIS não sabe o volume do Spotify, o Connect precisa
 * de um aparelho ativo).
 */
export type SpotifySource = 'mpris' | 'connect' | 'none'

export type SpotifyPlayback = {
  source: SpotifySource
  playing: boolean
  track: SpotifyTrack | null
  positionMs: number
  shuffle: boolean
  /** 0–100, ou `null` quando a fonte não informa — ver `spotify.ts`. */
  volume: number | null
  /** Nome do aparelho ("Spotify", "iPhone de…"), vazio quando não há. */
  device: string
}

export type SpotifyCommand = 'play' | 'pause' | 'next' | 'previous' | 'shuffle'

/**
 * O que aconteceu com um comando.
 *
 * `done: false` não é exceção: "nenhum aparelho ativo" é o caso comum de quem
 * tem o Spotify fechado, e a tela precisa dizer isso em vez de engolir.
 */
export type SpotifyControlResult = {
  done: boolean
  source: SpotifySource
  message: string
}
