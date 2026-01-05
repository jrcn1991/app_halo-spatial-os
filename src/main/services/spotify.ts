import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  SpotifyAuth,
  SpotifyCommand,
  SpotifyControlResult,
  SpotifyDetail,
  SpotifyItem,
  SpotifyLibrary,
  SpotifyPlayback,
  SpotifyResult,
  SpotifyTrack,
} from '@shared/spotify'
import {
  accessToken,
  clientId,
  conectado,
  conectar,
  desconectar,
  invalidarAcesso,
  SemClientId,
  SemConexao,
} from './spotify-auth'

/**
 * Spotify: biblioteca pela Web API, transporte pelo MPRIS.
 *
 * ## Por que o áudio NÃO toca dentro do Halo
 *
 * O único jeito de um app web tocar Spotify é o *Web Playback SDK*, e ele
 * entrega mídia protegida por DRM (Widevine). O Electron não distribui o
 * módulo do Widevine — **medido nesta máquina**, no próprio Electron 44 do
 * projeto:
 *
 * ```
 * navigator.requestMediaKeySystemAccess('com.widevine.alpha', …)
 *   → NotSupportedError: Unsupported keySystem or supportedConfigurations.
 * navigator.requestMediaKeySystemAccess('org.w3.clearkey', …)       → OK
 * ```
 *
 * Ou seja: a API de DRM existe, o Widevine é que não. Não é limitação de
 * permissão nem de conta Premium — é o binário. Empacotar o CDM do Widevine
 * exigiria licença da Google e sair do Electron oficial.
 *
 * ## O caminho escolhido: comandar quem sabe tocar
 *
 * O aplicativo do Spotify já está instalado nesta máquina (`/usr/bin/spotify`)
 * e publica MPRIS no D-Bus. Comandá-lo por ali é o caminho preferido, e por
 * três motivos medidos:
 *
 * 1. **Funciona sem credencial nenhuma.** `Pause` → `PlaybackStatus: Paused`,
 *    `Play` → `Playing`, `OpenUri("spotify:track:…")` começa a tocar. Testado.
 * 2. **É instantâneo e não gasta cota.** O Connect é uma chamada HTTP para os
 *    servidores do Spotify que volta em centenas de milissegundos, e responde
 *    404 `NO_ACTIVE_DEVICE` quando não há aparelho tocando.
 * 3. **Acerta o aparelho certo.** Quem está com o Spotify aberto na frente
 *    quer comandar *aquele* Spotify, não o último aparelho que a nuvem
 *    lembrou.
 *
 * O **Spotify Connect** entra como segundo caminho, para quando o aplicativo
 * desta máquina está fechado e a música toca no celular ou numa caixa de som.
 * Ele exige Premium e um aparelho ativo — e é isso que a tela diz quando não
 * dá.
 *
 * Uma coisa o MPRIS não faz: o cliente Linux do Spotify publica `Volume: 0`
 * o tempo todo (medido), então volume só existe pelo Connect.
 */

const API = 'https://api.spotify.com/v1'
const TIMEOUT_MS = 8000
/** A biblioteca muda devagar; relê a cada minuto em vez de a cada render. */
const CACHE_LIB_MS = 60_000
/** Faixas de um álbum não mudam nunca; de uma playlist, raramente. */
const CACHE_DETALHE_MS = 5 * 60_000
const CACHE_DETALHE_MAX = 40
/** Teto de cada lista: o painel mostra uma coluna, não um catálogo. */
const LIMITE = 50

const run = promisify(execFile)
const BUS = 'org.mpris.MediaPlayer2.spotify'
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player'

// ——— MPRIS ———————————————————————————————————————————————————————

async function busctl(args: string[]): Promise<unknown> {
  const { stdout } = await run('busctl', ['--user', '--json=short', ...args], { timeout: 3000 })
  return stdout.trim() ? JSON.parse(stdout) : null
}

/** O D-Bus devolve variantes aninhadas: `{ type, data }` em vários níveis. */
function unwrap(value: unknown): unknown {
  if (value && typeof value === 'object' && 'data' in value) {
    return unwrap((value as { data: unknown }).data)
  }
  return value
}

function texto(value: unknown): string {
  const cru = unwrap(value)
  if (Array.isArray(cru)) return cru.map(texto).filter(Boolean).join(', ')
  return typeof cru === 'string' ? cru : ''
}

/** Chama um método do player do Spotify. Devolve `false` se ele não está no bus. */
async function mprisChamar(metodo: string, assinatura?: string, arg?: string): Promise<boolean> {
  try {
    const args = ['call', BUS, '/org/mpris/MediaPlayer2', PLAYER_IFACE, metodo]
    if (assinatura !== undefined && arg !== undefined) args.push(assinatura, arg)
    await busctl(args)
    return true
  } catch {
    return false
  }
}

async function mprisPropriedades(): Promise<Record<string, unknown> | null> {
  try {
    const resultado = (await busctl([
      'call',
      BUS,
      '/org/mpris/MediaPlayer2',
      'org.freedesktop.DBus.Properties',
      'GetAll',
      's',
      PLAYER_IFACE,
    ])) as { data: Record<string, unknown>[] } | null
    return resultado?.data[0] ?? null
  } catch {
    // Sem o aplicativo aberto (ou sem D-Bus) não há nada a comandar: é estado
    // normal, não falha.
    return null
  }
}

/** O que o aplicativo do Spotify desta máquina está tocando. */
function mprisParaPlayback(props: Record<string, unknown>): SpotifyPlayback {
  const metadata = (unwrap(props.Metadata) ?? {}) as Record<string, unknown>
  const duracao = unwrap(metadata['mpris:length'])
  const posicao = unwrap(props.Position)
  const nome = texto(metadata['xesam:title'])

  return {
    source: 'mpris',
    playing: texto(props.PlaybackStatus).toLowerCase() === 'playing',
    track: nome
      ? {
          // O MPRIS do Spotify traz o trackid como caminho
          // (`/com/spotify/track/ID`); convertido, ele volta a ser um URI.
          uri: texto(metadata['mpris:trackid']).replace(/^\/com\/spotify\/(\w+)\//, 'spotify:$1:'),
          name: nome,
          artists: texto(metadata['xesam:artist']),
          album: texto(metadata['xesam:album']),
          durationMs: typeof duracao === 'number' ? Math.round(duracao / 1000) : 0,
          image: texto(metadata['mpris:artUrl']),
          playedAt: null,
        }
      : null,
    positionMs: typeof posicao === 'number' ? Math.round(posicao / 1000) : 0,
    shuffle: unwrap(props.Shuffle) === true,
    // O cliente Linux publica 0 sempre — devolver isso viraria "mudo" na tela.
    volume: null,
    device: 'Spotify (este computador)',
  }
}

// ——— Web API ——————————————————————————————————————————————————————

type Cache<T> = { at: number; valor: T }
let libCache: Cache<SpotifyLibrary> | undefined
const detalheCache = new Map<string, Cache<SpotifyDetail>>()

/** Some com o que estava em cache: usado ao conectar/desconectar. */
function limparCache(): void {
  libCache = undefined
  detalheCache.clear()
}

async function api<T>(caminho: string, init?: RequestInit): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let token = await accessToken()
    let resposta = await pedir(caminho, token, controller.signal, init)

    // 401 com token que ainda não expirou acontece (revogação, relógio fora de
    // hora). Uma renovação e uma segunda tentativa resolvem; insistir mais
    // seria laço.
    if (resposta.status === 401) {
      invalidarAcesso()
      token = await accessToken()
      resposta = await pedir(caminho, token, controller.signal, init)
    }

    if (resposta.status === 204 || resposta.status === 202) return null
    if (resposta.status === 403) {
      // 403 tem duas causas bem diferentes — escopo que não foi autorizado e
      // conta sem Premium — e o Spotify diz qual no corpo. Trocar isso por uma
      // frase nossa esconderia justamente a pista que resolve.
      throw new SemPermissao(await detalhe403(resposta))
    }
    if (resposta.status === 429) {
      const espera = resposta.headers.get('retry-after') ?? '?'
      throw new Error(`limite de chamadas do Spotify atingido (tente em ${espera}s)`)
    }
    if (resposta.status === 404) return null
    if (!resposta.ok) throw new Error(`Spotify respondeu HTTP ${resposta.status}`)

    const corpo = await resposta.text()
    return corpo ? (JSON.parse(corpo) as T) : null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Falta de permissão: escopo não autorizado, ou conta sem Premium.
 *
 * Tem classe própria porque a biblioteca trata isso sem desistir do resto —
 * quem autorizou só a reprodução ainda vê o transporte funcionando.
 */
class SemPermissao extends Error {}

async function detalhe403(resposta: Response): Promise<string> {
  const corpo = (await resposta.json().catch(() => null)) as {
    error?: { message?: string }
  } | null
  const dito = corpo?.error?.message?.trim()
  return dito
    ? `o Spotify recusou: ${dito}`
    : 'o Spotify recusou (escopo não autorizado ou conta sem Premium)'
}

function pedir(
  caminho: string,
  token: string,
  signal: AbortSignal,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${API}${caminho}`, {
    ...init,
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
}

/**
 * Traduz exceção em estado de tela.
 *
 * A tela distingue "sem Client ID" (falta configurar) de "não conectado"
 * (falta autorizar) de "erro" — cada um mostra um caminho diferente, e nenhum
 * deles pode virar dado inventado.
 */
async function resultado<T>(carregar: () => Promise<T>): Promise<SpotifyResult<T>> {
  try {
    return { state: 'ok', value: await carregar() }
  } catch (erro) {
    if (erro instanceof SemClientId) return { state: 'no-client-id' }
    if (erro instanceof SemConexao) return { state: 'signed-out' }
    return { state: 'error', message: (erro as Error).message }
  }
}

type Imagem = { url?: string }
type ArtistaBruto = { name?: string }

function capa(imagens: Imagem[] | undefined): string {
  // A primeira é a maior; o painel mostra 34–196px, e a maior evita capa
  // borrada no herói. As URLs são do CDN do Spotify (ver a CSP em index.html).
  return imagens?.[0]?.url ?? ''
}

function nomes(artistas: ArtistaBruto[] | undefined): string {
  return (artistas ?? [])
    .map((a) => a.name ?? '')
    .filter(Boolean)
    .join(', ')
}

type PlaylistBruta = {
  id?: string
  uri?: string
  name?: string
  images?: Imagem[]
  owner?: { id?: string; display_name?: string }
  /**
   * A contagem de faixas, nos dois nomes que a API usa.
   *
   * O Spotify renomeou o campo de `tracks` para `items` — as respostas de hoje
   * trazem `items: { href: '.../playlists/{id}/items', total: 18 }`. Ler os
   * dois faz o app funcionar antes e depois da troca, sem depender de qual
   * chegou.
   */
  tracks?: { total?: number }
  items?: { total?: number }
}

type AlbumBruto = {
  id?: string
  uri?: string
  name?: string
  images?: Imagem[]
  artists?: ArtistaBruto[]
  release_date?: string
  total_tracks?: number
}

type ArtistaCompleto = {
  id?: string
  uri?: string
  name?: string
  images?: Imagem[]
  followers?: { total?: number }
  genres?: string[]
}

type FaixaBruta = {
  uri?: string
  name?: string
  duration_ms?: number
  artists?: ArtistaBruto[]
  album?: { name?: string; images?: Imagem[] }
}

function milhar(valor: number): string {
  return valor.toLocaleString('pt-BR')
}

function comoItem(bruto: PlaylistBruta): SpotifyItem {
  return {
    uri: bruto.uri ?? '',
    id: bruto.id ?? '',
    kind: 'playlist',
    name: bruto.name ?? '',
    meta: bruto.owner?.display_name ? `por ${bruto.owner.display_name}` : 'playlist',
    image: capa(bruto.images),
    tracks: bruto.items?.total ?? bruto.tracks?.total ?? 0,
  }
}

function albumComoItem(bruto: AlbumBruto): SpotifyItem {
  const ano = (bruto.release_date ?? '').slice(0, 4)
  return {
    uri: bruto.uri ?? '',
    id: bruto.id ?? '',
    kind: 'album',
    name: bruto.name ?? '',
    meta: [nomes(bruto.artists), ano].filter(Boolean).join(' · '),
    image: capa(bruto.images),
    tracks: bruto.total_tracks ?? 0,
  }
}

function artistaComoItem(bruto: ArtistaCompleto): SpotifyItem {
  const seguidores = bruto.followers?.total ?? 0
  return {
    uri: bruto.uri ?? '',
    id: bruto.id ?? '',
    kind: 'artist',
    name: bruto.name ?? '',
    meta: seguidores ? `${milhar(seguidores)} seguidores` : ((bruto.genres ?? [])[0] ?? 'artista'),
    image: capa(bruto.images),
    tracks: 0,
  }
}

function faixa(
  bruta: FaixaBruta | undefined,
  capaPadrao: string,
  tocadaEm: string | null = null,
): SpotifyTrack | null {
  if (!bruta?.name) return null
  return {
    uri: bruta.uri ?? '',
    name: bruta.name,
    artists: nomes(bruta.artists),
    album: bruta.album?.name ?? '',
    durationMs: bruta.duration_ms ?? 0,
    image: capa(bruta.album?.images) || capaPadrao,
    playedAt: tocadaEm,
  }
}

/** Só itens que dá para mostrar E mandar tocar. */
function utilizavel(item: SpotifyItem): boolean {
  return Boolean(item.uri && item.name)
}

// ——— O que a tela pede ————————————————————————————————————————————

/** Situação da conexão, já com o nome da conta quando há uma. */
export async function auth(): Promise<SpotifyAuth> {
  if (!clientId()) return { state: 'no-client-id' }
  if (!conectado()) return { state: 'signed-out' }

  try {
    const eu = await api<{ display_name?: string; product?: string }>('/me')
    return {
      state: 'signed-in',
      user: { displayName: eu?.display_name ?? '', product: eu?.product ?? '' },
    }
  } catch (erro) {
    if (erro instanceof SemClientId) return { state: 'no-client-id' }
    if (erro instanceof SemConexao) return { state: 'signed-out' }
    return { state: 'error', message: (erro as Error).message }
  }
}

/** Abre o consentimento no navegador e devolve a situação depois dele. */
export async function connect(): Promise<SpotifyAuth> {
  const r = await conectar()
  limparCache()
  if (!r.ok) return { state: 'error', message: r.message }
  return auth()
}

export async function disconnect(): Promise<SpotifyAuth> {
  desconectar()
  limparCache()
  return auth()
}

/**
 * A biblioteca inteira, numa ida só.
 *
 * São cinco chamadas em paralelo porque a Web API não tem um "tudo": cada
 * coleção é um endpoint. Em série isso levaria mais de um segundo.
 */
export function library(): Promise<SpotifyResult<SpotifyLibrary>> {
  return resultado(async () => {
    if (libCache && Date.now() - libCache.at < CACHE_LIB_MS) return libCache.valor

    // Cada coleção depende de um escopo diferente, e o usuário pode ter
    // autorizado só alguns. Uma recusa não pode derrubar as outras — nem
    // virar lista vazia sem explicação, que pareceria "você não tem nada".
    const faltando: string[] = []
    const tolerante = async <T>(escopo: string, buscar: () => Promise<T | null>) => {
      try {
        return await buscar()
      } catch (erro) {
        if (erro instanceof SemPermissao) {
          faltando.push(escopo)
          return null
        }
        throw erro
      }
    }

    const [playlists, albuns, seguidos, top, recentes] = await Promise.all([
      tolerante('playlist-read-private', () =>
        api<{ items?: PlaylistBruta[] }>(`/me/playlists?limit=${LIMITE}`),
      ),
      tolerante('user-library-read', () =>
        api<{ items?: { album?: AlbumBruto }[] }>(`/me/albums?limit=${LIMITE}`),
      ),
      tolerante('user-follow-read', () =>
        api<{ artists?: { items?: ArtistaCompleto[] } }>(
          `/me/following?type=artist&limit=${LIMITE}`,
        ),
      ),
      tolerante('user-top-read', () =>
        api<{ items?: ArtistaCompleto[] }>('/me/top/artists?limit=20'),
      ),
      tolerante('user-read-recently-played', () =>
        api<{ items?: { track?: FaixaBruta; played_at?: string }[] }>(
          '/me/player/recently-played?limit=30',
        ),
      ),
    ])

    const artistas = (seguidos?.artists?.items ?? []).map(artistaComoItem).filter(utilizavel)
    // Quem não segue ninguém tem a lista vazia, e um painel vazio não diz nada.
    // Os mais ouvidos são a resposta honesta à mesma pergunta.
    const maisOuvidos = (top?.items ?? []).map(artistaComoItem).filter(utilizavel)

    const valor: SpotifyLibrary = {
      playlists: (playlists?.items ?? []).map(comoItem).filter(utilizavel),
      albums: (albuns?.items ?? []).map((i) => albumComoItem(i.album ?? {})).filter(utilizavel),
      artists: artistas.length ? artistas : maisOuvidos,
      recent: (recentes?.items ?? [])
        .map((i) => faixa(i.track, '', i.played_at ?? null))
        .filter((t): t is SpotifyTrack => t !== null),
      notice: faltando.length
        ? `Faltou autorizar ${faltando.join(', ')} — reconecte em Configurações → Música ` +
          'para ver o que está faltando.'
        : '',
    }

    libCache = { at: Date.now(), valor }
    return valor
  })
}

/** As faixas de uma playlist, de um álbum, ou as mais tocadas de um artista. */
export function detail(uri: string): Promise<SpotifyResult<SpotifyDetail>> {
  return resultado(async () => {
    const guardado = detalheCache.get(uri)
    if (guardado && Date.now() - guardado.at < CACHE_DETALHE_MS) return guardado.valor

    const [, tipo, id] = uri.split(':')
    if (!tipo || !id) throw new Error(`URI do Spotify inesperada: ${uri}`)

    const valor =
      tipo === 'playlist'
        ? await detalhePlaylist(id)
        : tipo === 'album'
          ? await detalheAlbum(id)
          : await detalheArtista(id)

    detalheCache.set(uri, { at: Date.now(), valor })
    // Map preserva a ordem de inserção: soltar a primeira chave solta a mais
    // antiga.
    if (detalheCache.size > CACHE_DETALHE_MAX) {
      const primeira = detalheCache.keys().next()
      if (!primeira.done) detalheCache.delete(primeira.value)
    }
    return valor
  })
}

/**
 * O aviso de quando o Spotify recusa um endereço.
 *
 * Apps em modo de desenvolvimento não alcançam alguns deles — medido nesta
 * conta: `/playlists/{id}/tracks` e `/artists/{id}/top-tracks` respondem 403
 * enquanto `/playlists/{id}`, `/albums/{id}/tracks` e `/artists/{id}/albums`
 * respondem 200. Dizer isso é melhor que abrir um painel vazio.
 */
/**
 * Por que uma lista não veio, dito com precisão.
 *
 * Foram três respostas diferentes, medidas nesta conta, e cada uma tem um
 * motivo próprio — um aviso genérico mandaria o usuário procurar no lugar
 * errado:
 *
 * - playlist DELE: 200. Funciona.
 * - playlist de outra pessoa: 403.
 * - playlist editorial do Spotify: 404 (essas saíram do alcance de apps novos).
 * - `/artists/{id}/top-tracks`: 403, e aí a discografia entra no lugar.
 */
const AVISO_DE_OUTRO =
  'O Spotify não deixa este app abrir as faixas de playlists de outras pessoas. ' +
  'Dá para tocar direto pelo botão, ou abrir no Spotify.'
const AVISO_GENERICO =
  'O Spotify não devolveu as faixas desta lista. Dá para tocar direto pelo botão.'

/** Quem está logado, para saber se a playlist é dele. */
let donoAtual: string | null = null

async function meuId(): Promise<string> {
  if (donoAtual !== null) return donoAtual
  const eu = await tentar(api<{ id?: string }>('/me'))
  donoAtual = eu?.id ?? ''
  return donoAtual
}

/** Tenta, e devolve `null` em vez de derrubar o resto do painel. */
async function tentar<T>(promessa: Promise<T | null>): Promise<T | null> {
  return promessa.catch(() => null)
}

async function detalhePlaylist(id: string): Promise<SpotifyDetail> {
  // Separado do `Promise.all` de propósito: a lista de faixas pode ser
  // recusada, e derrubar o cabeçalho junto deixava o clique sem NENHUM efeito
  // visível — foi o defeito que o usuário viu.
  const bruta = await api<PlaylistBruta>(`/playlists/${id}`)
  if (!bruta) throw new Error('playlist não encontrada')
  const item = comoItem(bruta)

  /**
   * As faixas vêm de `/items`, não de `/tracks`.
   *
   * O Spotify renomeou o endereço, e o antigo passou a responder **403** — o
   * que parecia falta de permissão e não era: o próprio objeto da playlist
   * aponta para `.../playlists/{id}/items`. A chave de cada item também mudou,
   * de `track` para `item`. Foi isto que fazia clicar numa playlist não
   * mostrar nada.
   *
   * `/tracks` fica como reserva para servidores que ainda não trocaram.
   */
  type ItemDaPlaylist = { item?: FaixaBruta; track?: FaixaBruta }
  const faixas =
    (await tentar(api<{ items?: ItemDaPlaylist[] }>(`/playlists/${id}/items?limit=${LIMITE}`))) ??
    (await tentar(api<{ items?: ItemDaPlaylist[] }>(`/playlists/${id}/tracks?limit=${LIMITE}`)))

  const tracks = (faixas?.items ?? [])
    .map((i) => faixa(i.item ?? i.track, item.image))
    .filter((t): t is SpotifyTrack => t !== null)

  const deOutraPessoa = Boolean(bruta.owner?.id) && bruta.owner?.id !== (await meuId())
  return {
    item,
    tracks,
    albums: [],
    notice: faixas === null ? (deOutraPessoa ? AVISO_DE_OUTRO : AVISO_GENERICO) : '',
  }
}

async function detalheAlbum(id: string): Promise<SpotifyDetail> {
  const bruto = await api<AlbumBruto & { tracks?: { items?: FaixaBruta[] } }>(`/albums/${id}`)
  if (!bruto) throw new Error('álbum não encontrado')
  const item = albumComoItem(bruto)
  return {
    item,
    // As faixas de um álbum não repetem a capa dele; a do próprio álbum serve.
    tracks: (bruto.tracks?.items ?? [])
      .map((f) => faixa(f, item.image))
      .filter((t): t is SpotifyTrack => t !== null),
    albums: [],
    notice: '',
  }
}

async function detalheArtista(id: string): Promise<SpotifyDetail> {
  const bruto = await api<ArtistaCompleto>(`/artists/${id}`)
  if (!bruto) throw new Error('artista não encontrado')
  const item = artistaComoItem(bruto)

  const top = await tentar(api<{ tracks?: FaixaBruta[] }>(`/artists/${id}/top-tracks`))
  const tracks = (top?.tracks ?? [])
    .map((f) => faixa(f, item.image))
    .filter((t): t is SpotifyTrack => t !== null)

  // Sem as mais tocadas, a discografia — que responde — vale mais que um
  // painel vazio. `include_groups` tira as participações, que poluiriam.
  const discos =
    tracks.length > 0
      ? null
      : await tentar(
          // `limit` aqui NÃO é o `LIMITE` dos outros endereços: este recusa
          // acima de ~10 com "Invalid limit" (medido: 10 passa, 20 não), e
          // `market` é obrigatório — sem ele também dá 400.
          api<{ items?: AlbumBruto[] }>(
            `/artists/${id}/albums?include_groups=album,single&limit=10&market=from_token`,
          ),
        )

  return {
    item,
    tracks,
    albums: (discos?.items ?? []).map(albumComoItem),
    notice: top === null && (discos?.items?.length ?? 0) === 0 ? AVISO_GENERICO : '',
  }
}

/**
 * O que está tocando — MPRIS primeiro, Connect depois.
 *
 * O MPRIS responde em milissegundos e sem token; o Connect só é consultado
 * quando o aplicativo desta máquina está fechado. Consultar os dois sempre
 * gastaria cota da Web API a cada 2 segundos de polling da tela.
 */
export async function playback(): Promise<SpotifyPlayback> {
  const props = await mprisPropriedades()
  if (props) return mprisParaPlayback(props)

  const vazio: SpotifyPlayback = {
    source: 'none',
    playing: false,
    track: null,
    positionMs: 0,
    shuffle: false,
    volume: null,
    device: '',
  }

  if (!clientId() || !conectado()) return vazio

  try {
    const estado = await api<{
      is_playing?: boolean
      progress_ms?: number
      shuffle_state?: boolean
      device?: { name?: string; volume_percent?: number }
      item?: FaixaBruta
    }>('/me/player')
    if (!estado) return vazio

    return {
      source: 'connect',
      playing: estado.is_playing === true,
      track: faixa(estado.item, ''),
      positionMs: estado.progress_ms ?? 0,
      shuffle: estado.shuffle_state === true,
      volume:
        typeof estado.device?.volume_percent === 'number' ? estado.device.volume_percent : null,
      device: estado.device?.name ?? '',
    }
  } catch {
    // Transporte é secundário: rede fora do ar não pode derrubar a tela.
    return vazio
  }
}

const MPRIS_POR_COMANDO: Record<SpotifyCommand, string> = {
  play: 'Play',
  pause: 'Pause',
  next: 'Next',
  previous: 'Previous',
  // O MPRIS não tem "alternar aleatório": é uma propriedade booleana.
  shuffle: '',
}

/** Play/pausa/próxima/anterior/aleatório, no caminho que estiver disponível. */
export async function control(comando: SpotifyCommand): Promise<SpotifyControlResult> {
  if (comando === 'shuffle') return alternarAleatorio()

  const metodo = MPRIS_POR_COMANDO[comando]
  if (metodo && (await mprisChamar(metodo))) {
    return { done: true, source: 'mpris', message: '' }
  }
  return connectControl(comando)
}

async function alternarAleatorio(): Promise<SpotifyControlResult> {
  const props = await mprisPropriedades()
  if (props) {
    const alvo = unwrap(props.Shuffle) === true ? 'false' : 'true'
    try {
      await busctl([
        'set-property',
        BUS,
        '/org/mpris/MediaPlayer2',
        PLAYER_IFACE,
        'Shuffle',
        'b',
        alvo,
      ])
      return { done: true, source: 'mpris', message: '' }
    } catch {
      // Cai no Connect abaixo.
    }
  }
  return connectControl('shuffle')
}

async function connectControl(comando: SpotifyCommand): Promise<SpotifyControlResult> {
  if (!clientId()) return { done: false, source: 'none', message: 'Spotify não configurado' }
  if (!conectado()) return { done: false, source: 'none', message: 'Spotify não conectado' }

  try {
    const estado = comando === 'shuffle' ? await playback() : null
    const rota =
      comando === 'play'
        ? { metodo: 'PUT', caminho: '/me/player/play' }
        : comando === 'pause'
          ? { metodo: 'PUT', caminho: '/me/player/pause' }
          : comando === 'next'
            ? { metodo: 'POST', caminho: '/me/player/next' }
            : comando === 'previous'
              ? { metodo: 'POST', caminho: '/me/player/previous' }
              : { metodo: 'PUT', caminho: `/me/player/shuffle?state=${!estado?.shuffle}` }

    await api(rota.caminho, { method: rota.metodo })
    return { done: true, source: 'connect', message: '' }
  } catch (erro) {
    return { done: false, source: 'connect', message: (erro as Error).message }
  }
}

/**
 * Manda tocar uma playlist, um álbum, um artista ou uma faixa.
 *
 * **O Connect vem primeiro aqui**, ao contrário do resto do transporte. O
 * motivo é o efeito colateral: no MPRIS, mandar tocar um endereço é `OpenUri`,
 * que tem semântica de "abra este link" — o cliente do Spotify traz a própria
 * janela para a frente e a tira de minimizada. Comandar o que já está tocando
 * não deveria roubar a tela de ninguém.
 *
 * `PUT /me/player/play` faz a mesma coisa sem tocar em janela. Exige a conta
 * conectada e um aparelho ativo; quando isso falta, o `OpenUri` continua como
 * reserva — melhor tocar trazendo a janela do que não tocar.
 *
 * Faixa vai em `uris`, o resto vai em `context_uri` (a API recusa um
 * `context_uri` de faixa).
 */
export async function play(uri: string): Promise<SpotifyControlResult> {
  if (!uri.startsWith('spotify:')) {
    return { done: false, source: 'none', message: 'URI do Spotify inválida' }
  }

  if (clientId() && conectado()) {
    try {
      const corpo = uri.startsWith('spotify:track:') ? { uris: [uri] } : { context_uri: uri }
      await api('/me/player/play', { method: 'PUT', body: JSON.stringify(corpo) })
      return { done: true, source: 'connect', message: '' }
    } catch {
      // 404 do Connect é literalmente "nenhum aparelho ativo". Cai no MPRIS.
    }
  }

  if (await mprisChamar('OpenUri', 's', uri)) {
    return { done: true, source: 'mpris', message: '' }
  }

  return {
    done: false,
    source: 'none',
    message: 'abra o aplicativo do Spotify, ou conecte a conta em Configurações',
  }
}

/** Traz a janela do Spotify para a frente (MPRIS `Raise`). */
export async function raise(): Promise<SpotifyControlResult> {
  try {
    await busctl(['call', BUS, '/org/mpris/MediaPlayer2', 'org.mpris.MediaPlayer2', 'Raise'])
    return { done: true, source: 'mpris', message: '' }
  } catch {
    return { done: false, source: 'none', message: 'o aplicativo do Spotify não está aberto' }
  }
}
