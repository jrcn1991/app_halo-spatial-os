import type {
  SpotifyDetail,
  SpotifyItem,
  SpotifyLibrary,
  SpotifyResult,
  SpotifyTrack,
} from '@shared/spotify'
import type { SpotifyRepository } from '@/domain/repositories'

/**
 * Spotify de exemplo — só fora do Electron.
 *
 * A fábrica de dados escolhe este repositório quando `window.halo` não existe:
 * é o caso do navegador onde rodam `npm run test:screens` e `npm run layout`.
 * Ali não há D-Bus, não há rede e não há conta — e um app que só mostrasse
 * "conecte o Spotify" não deixaria testar a tela cheia.
 *
 * Todo resultado sai com `state: 'demo'`, e a tela mostra a etiqueta
 * "conteúdo de exemplo" quando o vê. Dado de mentira sem aviso é justamente o
 * que a regra do projeto proíbe (ver MOCKS.md).
 *
 * Dentro do Electron este arquivo nunca roda: lá é a conta do usuário ou o
 * estado honesto de "falta configurar".
 */

/** Sem URL de capa: no navegador não há rede, e o CSS cai no listrado. */
const item = (
  kind: SpotifyItem['kind'],
  id: string,
  name: string,
  meta: string,
  tracks: number,
): SpotifyItem => ({ uri: `spotify:${kind}:${id}`, id, kind, name, meta, image: '', tracks })

const faixa = (name: string, artists: string, album: string, minutos: number, segundos: number) =>
  ({
    uri: `spotify:track:${name.toLowerCase().replace(/\W+/g, '')}`,
    name,
    artists,
    album,
    durationMs: (minutos * 60 + segundos) * 1000,
    image: '',
    playedAt: null,
  }) satisfies SpotifyTrack

const PLAYLISTS = [
  item('playlist', 'p1', 'Curtidas', 'por você', 128),
  item('playlist', 'p2', 'Foco profundo', 'por você', 64),
  item('playlist', 'p3', 'Neblina', 'por você', 41),
  item('playlist', 'p4', 'Estúdio', 'por você', 92),
  item('playlist', 'p5', 'Costa norte', 'por você', 37),
  item('playlist', 'p6', 'Madrugada', 'por você', 55),
]

const ALBUNS = [
  item('album', 'a1', 'Low Fog Over Pines', 'Hana Vale · 2024', 11),
  item('album', 'a2', 'Northbound', 'Hana Vale · 2022', 9),
  item('album', 'a3', 'Cedar Line', 'Volk & Rye · 2023', 12),
  item('album', 'a4', 'Quiet Harbour', 'Marin Oda · 2021', 10),
]

const ARTISTAS = [
  item('artist', 'r1', 'Hana Vale', '1.284.000 seguidores', 0),
  item('artist', 'r2', 'Volk & Rye', '412.000 seguidores', 0),
  item('artist', 'r3', 'Marin Oda', '287.000 seguidores', 0),
  item('artist', 'r4', 'Cinder Hall', '96.400 seguidores', 0),
]

const FAIXAS: SpotifyTrack[] = [
  faixa('Low Fog Over Pines', 'Hana Vale', 'Low Fog Over Pines', 3, 41),
  faixa('Northbound', 'Hana Vale', 'Northbound', 3, 14),
  faixa('Cedar Line', 'Volk & Rye', 'Cedar Line', 3, 28),
  faixa('Quiet Harbour', 'Marin Oda', 'Quiet Harbour', 2, 56),
  faixa('Second Winter', 'Hana Vale', 'Northbound', 3, 53),
  faixa('Harbour Lights', 'Cinder Hall', 'Cinder Hall', 4, 2),
]

const BIBLIOTECA: SpotifyLibrary = {
  playlists: PLAYLISTS,
  albums: ALBUNS,
  artists: ARTISTAS,
  notice: '',
  recent: FAIXAS.map((f, i) => ({
    ...f,
    // Horas fixas: o harness congela o relógio, e um `Date.now()` aqui faria
    // cada execução medir uma tela diferente.
    playedAt: new Date(Date.UTC(2025, 7, 28, 6 - i, 12)).toISOString(),
  })),
}

const demo = <T>(value: T): SpotifyResult<T> => ({ state: 'demo', value })

function detalhe(uri: string): SpotifyDetail {
  const todos = [...PLAYLISTS, ...ALBUNS, ...ARTISTAS]
  const achado = todos.find((i) => i.uri === uri) ?? PLAYLISTS[0] ?? ARTISTAS[0]
  return {
    item: achado as SpotifyItem,
    tracks: FAIXAS,
    albums: [],
    notice: '',
  }
}

export const mockSpotify: SpotifyRepository = {
  auth: async () => ({ state: 'signed-in', user: { displayName: 'Exemplo', product: 'premium' } }),
  connect: async () => ({
    state: 'signed-in',
    user: { displayName: 'Exemplo', product: 'premium' },
  }),
  disconnect: async () => ({ state: 'signed-out' }),
  library: async () => demo(BIBLIOTECA),
  detail: async (uri) => demo(detalhe(uri)),
  // Nada tocando: fora do Electron não há D-Bus nem aparelho, e inventar uma
  // faixa em curso faria o painel direito mentir. É também o estado real de
  // quem abre o app com o Spotify fechado.
  playback: async () => ({
    source: 'none',
    playing: false,
    track: null,
    positionMs: 0,
    shuffle: false,
    volume: null,
    device: '',
  }),
  // Fora do Electron não há o que comandar — e dizer que comandou seria mentir.
  control: async () => ({ done: false, source: 'none', message: 'sem Spotify fora do app' }),
  play: async () => ({ done: false, source: 'none', message: 'sem Spotify fora do app' }),
  raise: async () => ({ done: false, source: 'none', message: 'sem Spotify fora do app' }),
}
