import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { NowPlaying, PlaybackStatus } from '@shared/player'
import dbus from 'dbus-next'
import { pedir } from './creative/rede'

/**
 * O que está tocando, pelo MPRIS — por uma conexão D-Bus que FICA, com sinais.
 *
 * A primeira versão perguntava ao bus a cada leitura, por `busctl`: três
 * processos por player (ListNames, GetAll, Identity), e a leitura acontecia
 * quatro vezes a cada 2s (o pulso da ilha, as duas ilhas, a home) — MEDIDO em
 * 05/09/2026: ~10 processos por segundo enquanto tocava música, 10–14% de um
 * núcleo só nos filhos do main, e a "faixa nova" anunciada com até 2s de
 * atraso. Ver DESEMPENHO.md, P0-1.
 *
 * Agora há UM cliente `dbus-next` (já é dependência; a ilha o usa para o
 * Klipper e o KWin): `ListNames` uma vez e `NameOwnerChanged` para players
 * entrando e saindo; por player, `GetAll` uma vez e `PropertiesChanged` para o
 * resto — o estado mora em memória e `nowPlaying()` só o lê. A posição é a
 * exceção: não há sinal para ela, e a leitura pede `Get Position` ao player
 * escolhido, uma chamada em processo (~1 ms), sem fork.
 *
 * Duas redes de segurança: um `GetAll` de revisão a cada `REVISAO_MS` por
 * player, porque nem todo player emite `PropertiesChanged` para tudo (o
 * Chromium emite; outros, nem sempre). Sem bus de sessão a tela mostra o
 * estado vazio, como antes — as AÇÕES (tocar, pausar…) seguem por `busctl`
 * em `island/actions.ts`, porque são raras e disparadas pelo usuário.
 */

const PLAYER = 'org.mpris.MediaPlayer2.Player'
const RAIZ = 'org.mpris.MediaPlayer2'
const PROPS = 'org.freedesktop.DBus.Properties'
const CAMINHO = '/org/mpris/MediaPlayer2'
const PREFIXO = 'org.mpris.MediaPlayer2.'
const REVISAO_MS = 15_000

function toStatus(raw: string): PlaybackStatus {
  const value = raw.toLowerCase()
  return value === 'playing' ? 'playing' : value === 'paused' ? 'paused' : 'stopped'
}

/** Tira o envelope `Variant` (e aninhados), e converte BigInt (`x`) em número. */
function plano(valor: unknown): unknown {
  if (valor instanceof dbus.Variant) return plano(valor.value)
  if (typeof valor === 'bigint') return Number(valor)
  if (Array.isArray(valor)) return valor.map(plano)
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, plano(v)]),
    )
  }
  return valor
}

function texto(valor: unknown): string {
  const v = plano(valor)
  if (Array.isArray(v)) return v.map(texto).filter(Boolean).join(', ')
  return typeof v === 'string' ? v : ''
}

function numero(valor: unknown): number | null {
  const v = plano(valor)
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** O que sabemos de um player, em memória. */
type Player = {
  nome: string
  identidade: string
  props: Record<string, unknown>
  /** Leitor de `Position`, em processo. */
  posicao: () => Promise<number | null>
  revisar: () => Promise<void>
  revisadoEm: number
}

const players = new Map<string, Player>()
let bus: ReturnType<typeof dbus.sessionBus> | null = null
let arranque: Promise<boolean> | null = null

async function abrirPlayer(nome: string): Promise<void> {
  if (!bus || players.has(nome)) return
  try {
    const objeto = await bus.getProxyObject(nome, CAMINHO)
    const props = objeto.getInterface(PROPS) as unknown as {
      GetAll(iface: string): Promise<Record<string, unknown>>
      Get(iface: string, nome: string): Promise<unknown>
      on(
        sinal: 'PropertiesChanged',
        f: (iface: string, mudou: Record<string, unknown>) => void,
      ): void
    }
    const [todas, identidade] = await Promise.all([
      props.GetAll(PLAYER),
      props
        .Get(RAIZ, 'Identity')
        .then(texto)
        .catch(() => ''),
    ])
    const player: Player = {
      nome,
      identidade,
      props: plano(todas) as Record<string, unknown>,
      posicao: () =>
        props
          .Get(PLAYER, 'Position')
          .then((v) => numero(v))
          .catch(() => null),
      revisar: async () => {
        player.props = plano(await props.GetAll(PLAYER)) as Record<string, unknown>
        player.revisadoEm = Date.now()
      },
      revisadoEm: Date.now(),
    }
    props.on('PropertiesChanged', (iface, mudou) => {
      if (iface !== PLAYER) return
      Object.assign(player.props, plano(mudou) as Record<string, unknown>)
    })
    players.set(nome, player)
  } catch {
    // O player sumiu entre o ListNames e o proxy: fica de fora até voltar.
  }
}

/** Liga o cliente uma vez. `false` quando não há bus de sessão. */
function ligar(): Promise<boolean> {
  arranque ??= (async () => {
    try {
      bus = dbus.sessionBus()
      const objeto = await bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus')
      const daemon = objeto.getInterface('org.freedesktop.DBus') as unknown as {
        ListNames(): Promise<string[]>
        on(
          sinal: 'NameOwnerChanged',
          f: (nome: string, antes: string, depois: string) => void,
        ): void
      }
      const nomes = await daemon.ListNames()
      await Promise.all(nomes.filter((n) => n.startsWith(PREFIXO)).map(abrirPlayer))
      daemon.on('NameOwnerChanged', (nome, _antes, depois) => {
        if (!nome.startsWith(PREFIXO)) return
        if (depois) void abrirPlayer(nome)
        else players.delete(nome)
      })
      return true
    } catch {
      bus = null
      return false
    }
  })()
  return arranque
}

async function leitura(p: Player): Promise<NowPlaying> {
  if (Date.now() - p.revisadoEm > REVISAO_MS) await p.revisar().catch(() => {})
  const metadata = (p.props.Metadata ?? {}) as Record<string, unknown>
  const posicao = await p.posicao()
  const duracao = numero(metadata['mpris:length'])
  return {
    player: p.identidade || p.nome.replace(PREFIXO, ''),
    isHalo: p.identidade === IDENTIDADE_HALO,
    status: toStatus(texto(p.props.PlaybackStatus)),
    title: texto(metadata['xesam:title']),
    artist: texto(metadata['xesam:artist']),
    album: texto(metadata['xesam:album']),
    artUrl: await capaEmbutida(texto(metadata['mpris:artUrl'])),
    positionSec: posicao === null ? null : posicao / 1e6,
    durationSec: duracao === null ? null : duracao / 1e6,
  }
}

/** O player que vale: o que está tocando; senão, o primeiro. */
function escolhido(): Player | null {
  const lista = [...players.values()]
  return (
    lista.find((p) => toStatus(texto(p.props.PlaybackStatus)) === 'playing') ?? lista[0] ?? null
  )
}

export async function nowPlaying(): Promise<NowPlaying | null> {
  if (!(await ligar())) return null
  const p = escolhido()
  if (!p) return null
  try {
    return await leitura(p)
  } catch {
    return null
  }
}

/** Embaralhar e repetir do player que vale, da memória — sem processo. */
export async function playerModes(): Promise<{ shuffle: boolean; loop: string } | null> {
  if (!(await ligar())) return null
  const p = escolhido()
  if (!p) return null
  return { shuffle: Boolean(plano(p.props.Shuffle)), loop: texto(p.props.LoopStatus) || 'None' }
}

const IDENTIDADE_HALO = 'halo-spatial-os'

/** Teto da capa: arte de álbum não passa disso, e evita inchar o IPC. */
const CAPA_MAX = 3_000_000

/** Assinaturas de JPEG, PNG, GIF e WebP. */
const IMAGENS: [string, Uint8Array][] = [
  ['image/jpeg', new Uint8Array([0xff, 0xd8, 0xff])],
  ['image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
  ['image/gif', new Uint8Array([0x47, 0x49, 0x46, 0x38])],
  ['image/webp', new Uint8Array([0x52, 0x49, 0x46, 0x46])],
]

/** A mesma capa é pedida a cada leitura do "tocando agora"; busca uma vez. */
const capas = new Map<string, string | null>()
const CAPA_CACHE_MAX = 40

/**
 * Converte a capa em `data:`.
 *
 * A CSP do renderer não abre `file:` (nem deve — o renderer não alcança disco)
 * nem hosts arbitrários, e é o main que sabe buscar. Os dois casos aparecem na
 * prática: o Chromium publica a arte como arquivo temporário; o Spotify publica
 * uma URL do CDN dele. Sem tratar os dois, o card fica sem arte para metade dos
 * players — foi assim que a do Spotify sumia.
 *
 * A origem vem de outro programa pelo D-Bus, então não é de confiança: só passa
 * o que REALMENTE é imagem, conferido pelos primeiros bytes, e com teto de
 * tamanho. Sem isso um player mal-intencionado apontaria para qualquer arquivo
 * legível do usuário, e ele viraria conteúdo dentro do app.
 */
async function capaEmbutida(url: string): Promise<string | null> {
  if (!url) return null
  if (capas.has(url)) return capas.get(url) ?? null

  const resultado = await buscarCapa(url)
  // Cache pequeno e simples: o que interessa é não rebuscar a mesma faixa a
  // cada leitura. Map preserva a ordem de inserção, então o mais antigo sai.
  if (capas.size >= CAPA_CACHE_MAX) {
    const primeiro = capas.keys().next()
    if (!primeiro.done) capas.delete(primeiro.value)
  }
  capas.set(url, resultado)
  return resultado
}

async function buscarCapa(url: string): Promise<string | null> {
  try {
    const conteudo = await lerOrigem(url)
    if (!conteudo || conteudo.byteLength === 0 || conteudo.byteLength > CAPA_MAX) return null

    const tipo = IMAGENS.find(([, assinatura]) =>
      assinatura.every((byte, i) => conteudo[i] === byte),
    )?.[0]
    if (!tipo) return null

    return `data:${tipo};base64,${conteudo.toString('base64')}`
  } catch {
    return null
  }
}

async function lerOrigem(url: string): Promise<Buffer | null> {
  if (url.startsWith('file://')) {
    // O caminho veio de outro programa: só arquivo comum e dentro do teto —
    // `/dev/zero` ou um vídeo de gigabytes seriam lidos inteiros para a memória.
    const caminho = fileURLToPath(url)
    const info = await stat(caminho)
    if (!info.isFile() || info.size > CAPA_MAX) return null
    return readFile(caminho)
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null

  // A URL também veio de outro programa pelo D-Bus: passa pela trava contra
  // SSRF da Social Arte (nada de rede local) e pelo mesmo teto do arquivo,
  // contado no corpo que chega.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const resposta = await pedir(new URL(url), {}, controller.signal)
    if (resposta.status < 200 || resposta.status >= 300) {
      resposta.descartar()
      return null
    }
    return await resposta.ler(CAPA_MAX)
  } finally {
    clearTimeout(timer)
  }
}
