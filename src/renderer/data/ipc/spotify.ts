import type { SpotifyRepository } from '@/domain/repositories'

/**
 * Spotify de verdade: tudo acontece no processo main.
 *
 * A CSP do renderer permite `connect-src 'self'` e nada mais — nem a Web API
 * nem o D-Bus seriam alcançáveis daqui, e é de propósito. O renderer só pede.
 */
export const ipcSpotify: SpotifyRepository = {
  auth: () => window.halo.spotify.auth(),
  connect: () => window.halo.spotify.connect(),
  disconnect: () => window.halo.spotify.disconnect(),
  library: () => window.halo.spotify.library(),
  detail: (uri) => window.halo.spotify.detail(uri),
  playback: () => window.halo.spotify.playback(),
  control: (command) => window.halo.spotify.control(command),
  play: (uri) => window.halo.spotify.play(uri),
  raise: () => window.halo.spotify.raise(),
}
