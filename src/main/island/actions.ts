import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { t } from '@shared/i18n'
import { playerModes } from '../services/player'
import { saidasAudio } from './sources'

/**
 * O que a ilha deixa fazer.
 *
 * Separado das leituras de propósito: aqui está tudo que MEXE no sistema, e
 * ficar num arquivo só torna essa superfície visível de relance. Nada aqui
 * apaga, remove ou escreve arquivo do usuário — são comandos de estado
 * (volume, rede, mídia, sessão) que a própria interface do KDE já oferece.
 */

const run = promisify(execFile)
const TIMEOUT_MS = 5000

async function cmd(comando: string, args: string[]): Promise<string> {
  const { stdout } = await run(comando, args, { timeout: TIMEOUT_MS })
  return stdout
}

/* ——— Áudio ————————————————————————————————————————————— */

export const volumeSubir = () => cmd('pactl', ['set-sink-volume', '@DEFAULT_SINK@', '+5%'])
export const volumeBaixar = () => cmd('pactl', ['set-sink-volume', '@DEFAULT_SINK@', '-5%'])
export const volumeMudo = () => cmd('pactl', ['set-sink-mute', '@DEFAULT_SINK@', 'toggle'])

/** Volume exato, para o controle deslizante da ilha. */
export const volumeDefinir = (porcento: number) =>
  cmd('pactl', [
    'set-sink-volume',
    '@DEFAULT_SINK@',
    `${Math.max(0, Math.min(100, Math.round(porcento)))}%`,
  ])

/**
 * Alterna entre as saídas de áudio.
 *
 * Trocar o padrão não basta: quem já está tocando continua na saída antiga.
 * Por isso os fluxos existentes são movidos junto — é o que a bandeja do KDE
 * faz, e sem isso a troca pareceria não funcionar.
 */
export async function trocarSaida(): Promise<void> {
  const saidas = await saidasAudio()
  if (saidas.length < 2) return
  const atual = (await cmd('pactl', ['get-default-sink'])).trim()
  const proxima = saidas[(saidas.findIndex((s) => s.nome === atual) + 1) % saidas.length]
  if (!proxima) return

  await cmd('pactl', ['set-default-sink', proxima.nome])
  const fluxos = await cmd('pactl', ['-f', 'json', 'list', 'sink-inputs']).catch(() => '[]')
  for (const fluxo of JSON.parse(fluxos) as { index: number }[]) {
    await cmd('pactl', ['move-sink-input', String(fluxo.index), proxima.nome]).catch(() => '')
  }
}

/* ——— Microfone ——————————————————————————————————————————— */

export const micMudo = () => cmd('pactl', ['set-source-mute', '@DEFAULT_SOURCE@', 'toggle'])

/* ——— Mídia (MPRIS) ————————————————————————————————————— */

/** O primeiro player que responde. `null` quando há nenhum. */
export async function playerAtivo(): Promise<string | null> {
  const saida = await cmd('busctl', [
    '--user',
    '--json=short',
    'call',
    'org.freedesktop.DBus',
    '/org/freedesktop/DBus',
    'org.freedesktop.DBus',
    'ListNames',
  ])
  const nomes = (JSON.parse(saida) as { data: string[][] }).data[0] ?? []
  const players = nomes.filter((n) => n.startsWith('org.mpris.MediaPlayer2.'))
  if (players.length === 0) return null

  // Quem está tocando ganha; senão, o primeiro que existir.
  for (const player of players) {
    const estado = await cmd('busctl', [
      '--user',
      '--json=short',
      'get-property',
      player,
      '/org/mpris/MediaPlayer2',
      'org.mpris.MediaPlayer2.Player',
      'PlaybackStatus',
    ]).catch(() => '')
    if (/Playing/i.test(estado)) return player
  }
  return players[0] ?? null
}

async function mpris(metodo: string): Promise<void> {
  const player = await playerAtivo()
  if (!player) throw new Error(t('nenhum player aberto'))
  await cmd('busctl', [
    '--user',
    'call',
    player,
    '/org/mpris/MediaPlayer2',
    'org.mpris.MediaPlayer2.Player',
    metodo,
  ])
}

/** Uma propriedade do player, já sem o envelope do `busctl --json`. */
async function propriedade(player: string, nome: string): Promise<unknown> {
  const saida = await cmd('busctl', [
    '--user',
    '--json=short',
    'get-property',
    player,
    '/org/mpris/MediaPlayer2',
    'org.mpris.MediaPlayer2.Player',
    nome,
  ])
  return (JSON.parse(saida) as { data: unknown }).data
}

/** Embaralhar e repetir, do jeito que o player diz. `null` quando não há player. */
export async function midiaModos(): Promise<{ shuffle: boolean; loop: string } | null> {
  // Da memória do cliente MPRIS (`services/player.ts`): era `busctl`×2 por
  // pulso, e o pulso bate a cada 2s. Ver DESEMPENHO.md, P0-1.
  return playerModes()
}

export async function midiaEmbaralhar(): Promise<void> {
  const player = await playerAtivo()
  if (!player) throw new Error(t('nenhum player aberto'))
  const atual = Boolean(await propriedade(player, 'Shuffle').catch(() => false))
  await cmd('busctl', [
    '--user',
    'set-property',
    player,
    '/org/mpris/MediaPlayer2',
    'org.mpris.MediaPlayer2.Player',
    'Shuffle',
    'b',
    atual ? 'false' : 'true',
  ])
}

/** Nenhuma → lista inteira → uma faixa → nenhuma, como no botão do Spotify. */
export async function midiaRepetir(): Promise<void> {
  const player = await playerAtivo()
  if (!player) throw new Error(t('nenhum player aberto'))
  const atual = String(await propriedade(player, 'LoopStatus').catch(() => 'None'))
  const proximo = atual === 'None' ? 'Playlist' : atual === 'Playlist' ? 'Track' : 'None'
  await cmd('busctl', [
    '--user',
    'set-property',
    player,
    '/org/mpris/MediaPlayer2',
    'org.mpris.MediaPlayer2.Player',
    'LoopStatus',
    's',
    proximo,
  ])
}

/**
 * Vai para um instante da faixa (segundos). O `SetPosition` do MPRIS exige o
 * id da faixa junto — é a garantia de que o pedido é para a faixa que está
 * tocando, não para a próxima que entrou no meio.
 */
export async function midiaBuscar(segundos: number): Promise<void> {
  const player = await playerAtivo()
  if (!player) throw new Error(t('nenhum player aberto'))
  const metadata = (await propriedade(player, 'Metadata')) as Record<
    string,
    { data?: unknown } | unknown
  >
  const bruto = metadata?.['mpris:trackid']
  const trackid = String(
    bruto && typeof bruto === 'object' && 'data' in bruto
      ? (bruto as { data: unknown }).data
      : bruto,
  )
  if (!trackid.startsWith('/')) throw new Error(t('o player não informa o id da faixa'))
  await cmd('busctl', [
    '--user',
    'call',
    player,
    '/org/mpris/MediaPlayer2',
    'org.mpris.MediaPlayer2.Player',
    'SetPosition',
    'ox',
    trackid,
    String(Math.max(0, Math.round(segundos * 1_000_000))),
  ])
}

/** Escolhe a saída pelo nome do sink, movendo os fluxos junto (ver `trocarSaida`). */
export async function definirSaida(nome: string): Promise<void> {
  const saidas = await saidasAudio()
  if (!saidas.some((s) => s.nome === nome)) throw new Error(t('saída desconhecida'))
  await cmd('pactl', ['set-default-sink', nome])
  const fluxos = await cmd('pactl', ['-f', 'json', 'list', 'sink-inputs']).catch(() => '[]')
  for (const fluxo of JSON.parse(fluxos) as { index: number }[]) {
    await cmd('pactl', ['move-sink-input', String(fluxo.index), nome]).catch(() => '')
  }
}

/** O endereço da faixa (`xesam:url`), quando o player o dá — o Spotify dá. */
export async function midiaLink(): Promise<string> {
  const player = await playerAtivo()
  if (!player) throw new Error(t('nenhum player aberto'))
  const metadata = (await propriedade(player, 'Metadata')) as Record<string, unknown>
  const bruto = metadata?.['xesam:url']
  const url = String(
    bruto && typeof bruto === 'object' && 'data' in bruto
      ? (bruto as { data: unknown }).data
      : (bruto ?? ''),
  )
  if (!/^https?:\/\//.test(url)) throw new Error(t('o player não dá um link para a faixa'))
  return url
}

export const midiaAlternar = () => mpris('PlayPause')
export const midiaProxima = () => mpris('Next')
export const midiaAnterior = () => mpris('Previous')

/** Traz a janela do player para a frente. */
export async function midiaAbrir(): Promise<void> {
  const player = await playerAtivo()
  if (!player) throw new Error(t('nenhum player aberto'))
  await cmd('busctl', [
    '--user',
    'call',
    player,
    '/org/mpris/MediaPlayer2',
    'org.mpris.MediaPlayer2',
    'Raise',
  ])
}

/* ——— Rede e bluetooth ————————————————————————————————— */

export async function wifiAlternar(): Promise<void> {
  const estado = (await cmd('nmcli', ['radio', 'wifi'])).trim()
  await cmd('nmcli', ['radio', 'wifi', /enabled|habilitado/i.test(estado) ? 'off' : 'on'])
}

export async function bluetoothAlternar(): Promise<void> {
  const estado = await cmd('bluetoothctl', ['show'])
  await cmd('bluetoothctl', ['power', /Powered:\s*yes/i.test(estado) ? 'off' : 'on'])
}

/* ——— Sessão e área de trabalho ————————————————————————— */

export const bloquearTela = () =>
  cmd('qdbus6', ['org.freedesktop.ScreenSaver', '/ScreenSaver', 'Lock'])

/** Captura a tela pelo Spectacle, que é o do KDE e já está instalado. */
export const capturarTela = () => cmd('spectacle', ['-b', '-c'])

/**
 * Vai para a área de trabalho seguinte ou anterior.
 *
 * `nextDesktop`/`previousDesktop` existem no `/KWin` desta versão — conferido
 * com `qdbus6 org.kde.KWin /KWin`. Nada de inventar método: a primeira versão
 * disto chamava `workspaceWidth`, que não existe, e explodia.
 */
export async function trocarAreaDeTrabalho(direcao: 1 | -1): Promise<void> {
  await cmd('qdbus6', ['org.kde.KWin', '/KWin', direcao === 1 ? 'nextDesktop' : 'previousDesktop'])
}

/** Quantas áreas de trabalho existem, para a ilha saber se vale mostrar o controle. */
export async function totalAreasDeTrabalho(): Promise<number> {
  const saida = await cmd('qdbus6', ['org.kde.KWin', '/VirtualDesktopManager', 'count'])
  return Number(saida.trim()) || 1
}

/** Mostra ou esconde tudo, revelando a área de trabalho. */
export const mostrarAreaDeTrabalho = (mostrar: boolean) =>
  cmd('qdbus6', ['org.kde.KWin', '/KWin', 'showDesktop', mostrar ? 'true' : 'false'])

/** Aviso na bandeja do sistema — o mesmo canal que os apps do KDE usam. */
export const avisar = (titulo: string, corpo: string) =>
  cmd('notify-send', ['-a', 'Halo', titulo, corpo])

/* ——— Abrir coisas ————————————————————————————————————— */

/** Abre pasta, arquivo ou endereço no aplicativo padrão do sistema. */
export const abrir = (alvo: string) => cmd('gio', ['open', alvo])

/** Abre um `.desktop` instalado, pelo id. */
export const abrirApp = (id: string) => cmd('gio', ['launch', id])
