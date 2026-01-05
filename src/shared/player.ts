/** Reprodução atual, lida do MPRIS (D-Bus) — o padrão do Linux para players. */

export type PlaybackStatus = 'playing' | 'paused' | 'stopped'

export type NowPlaying = {
  /** Nome amigável do player (Spotify, VLC, Firefox…). */
  player: string
  /**
   * Se quem está tocando é o player do próprio Halo.
   *
   * A tela usa isso para levar ao lugar certo: um filme do Halo pertence à
   * tela de Mídia, não à de Música.
   */
  isHalo: boolean
  status: PlaybackStatus
  title: string
  artist: string
  album: string
  /**
   * Capa, quando o player publica uma — já como `data:`.
   *
   * Os players publicam a arte como `file://` num arquivo temporário, e a CSP
   * do renderer não abre `file:` (nem deve). O main lê e converte.
   */
  artUrl: string | null
  /** Em segundos; `null` quando o player não informa. */
  positionSec: number | null
  durationSec: number | null
}
