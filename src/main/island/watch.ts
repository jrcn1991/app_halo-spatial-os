import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { t } from '@shared/i18n'
import { IPC } from '@shared/ipc-contract'
import type { IslandEvent, IslandNotice, IslandSettings } from '@shared/island'
import { BrowserWindow } from 'electron'
import { quemGrava } from './sources'

/**
 * Os vigias da ilha: o que ela OUVE do sistema em tempo real.
 *
 * O instantâneo bate a cada 2s, e isso serve para mostrar estado — mas não
 * para reagir. Um HUD de volume que aparece dois segundos depois da tecla não
 * é um HUD; uma notificação que a ilha conta depois do popup do KDE já sumir
 * não é anúncio. Por isso estes dois são processos vivos, que falam quando o
 * fato acontece:
 *
 * - **volume**: `pactl subscribe` emite um evento a cada mudança no sink. É o
 *   mesmo canal que o applet de volume do Plasma escuta. Cada evento vira uma
 *   leitura do volume, e só a MUDANÇA vira HUD — o sink também "muda" quando
 *   um fluxo começa, e anunciar isso seria ruído.
 * - **notificações**: `dbus-monitor` com filtro em `Notify` vê cada chamada
 *   que os aplicativos fazem ao servidor de notificações (o do Plasma). Medido
 *   nesta máquina em 31/08/2026: o `BecomeMonitor` do bus de sessão é aberto
 *   ao usuário, e um `notify-send` de prova chegou com app, título e corpo. A
 *   ilha NÃO substitui o servidor — o popup do KDE continua — ela só escuta.
 *
 * Os dois morrem com a ilha e são recriados quando ela sobe. Se o binário não
 * existe, o vigia diz isso na leitura dele em vez de fingir que ouve.
 */

const run = promisify(execFile)

type Anunciar = (evento: IslandEvent) => void

/** Quanto tempo cada anúncio fica. O HUD é rápido; a notificação, o tempo de ler. */
const HUD_MS = 1500
const AVISO_MS = 4500
/** Quantas notificações a ilha lembra. Memória do main, morre com o app. */
const AVISOS_MAX = 20

let anunciar: Anunciar | null = null
let processoVolume: ChildProcess | null = null
let processoAvisos: ChildProcess | null = null

/* ——— Volume ————————————————————————————————————————————— */

/** O último volume visto, para anunciar só o que mudou. */
let volumeVisto: { nivel: number; mudo: boolean } | null = null
/**
 * Quantas vezes o sink mudou desde o arranque. O instantâneo da ilha usa isto
 * como parte da chave da memória do áudio: enquanto nada muda, as leituras
 * `pactl` do áudio não se repetem; mudou, a chave muda e a leitura é refeita.
 */
let mudancasDoSink = 0
export const versaoDoSink = (): number => mudancasDoSink
let leituraPendente: ReturnType<typeof setTimeout> | undefined

async function lerVolume(): Promise<{ nivel: number; mudo: boolean }> {
  const [volume, mudo] = await Promise.all([
    run('pactl', ['get-sink-volume', '@DEFAULT_SINK@'], { timeout: 2000 }),
    run('pactl', ['get-sink-mute', '@DEFAULT_SINK@'], { timeout: 2000 }),
  ])
  return {
    nivel: Number(/(\d+)%/.exec(volume.stdout)?.[1] ?? 0),
    // `pactl` responde no idioma do sistema: "yes"/"no", "sim"/"não".
    mudo: /:\s*(yes|sim)/i.test(mudo.stdout),
  }
}

/**
 * O sink mudou. Vários eventos chegam num piscar (o Plasma aplica o volume em
 * passos), então a leitura espera um instante e lê uma vez só.
 */
function sinkMudou(): void {
  mudancasDoSink += 1
  clearTimeout(leituraPendente)
  leituraPendente = setTimeout(() => {
    void lerVolume()
      .then((agora) => {
        const antes = volumeVisto
        volumeVisto = agora
        // A primeira leitura só calibra: anunciar o volume que já estava
        // seria contar uma novidade que não houve.
        if (!antes || (antes.nivel === agora.nivel && antes.mudo === agora.mudo)) return
        anunciar?.({
          icon: agora.mudo ? 'SpeakerSlash' : agora.nivel > 50 ? 'SpeakerHigh' : 'SpeakerLow',
          text: agora.mudo ? t('Mudo') : t('Volume'),
          detail: agora.mudo ? '' : `${agora.nivel}%`,
          level: agora.mudo ? 'alerta' : 'ok',
          kind: 'hud',
          key: 'volume',
          ratio: agora.mudo ? 0 : Math.min(1, agora.nivel / 100),
          ttlMs: HUD_MS,
        })
      })
      .catch(() => {
        // Sem sink padrão (fones desconectados no meio): nada a anunciar.
      })
  }, 60)
}

/* ——— Saída padrão ————————————————————————————————————————— */

let saidaVista: string | null = null

/** O sink padrão mudou (fones plugados, troca no applet): HUD com o nome. */
function servidorMudou(): void {
  void run('pactl', ['get-default-sink'], { timeout: 2000 })
    .then(({ stdout }) => {
      const nome = stdout.trim()
      const antes = saidaVista
      saidaVista = nome
      if (antes === null || antes === nome) return
      anunciar?.({
        icon: 'SpeakerHigh',
        text: t('Saída de áudio'),
        detail: (nome.split('.').at(-1) ?? nome).replace(/[-_]/g, ' ').slice(0, 30),
        level: 'ok',
        kind: 'hud',
        key: 'saida',
        ratio: null,
        ttlMs: 2200,
      })
    })
    .catch(() => {})
}

/* ——— Microfone ——————————————————————————————————————————— */

let micVisto: boolean | null = null
let gravandoVistos: Set<string> | null = null
let leituraMicPendente: ReturnType<typeof setTimeout> | undefined

async function lerMicMudo(): Promise<boolean> {
  const { stdout } = await run('pactl', ['get-source-mute', '@DEFAULT_SOURCE@'], { timeout: 2000 })
  return /:\s*(yes|sim)/i.test(stdout)
}

/** O microfone mudou (mudo) ou alguém começou/parou de gravar. */
function microfoneMudou(): void {
  clearTimeout(leituraMicPendente)
  leituraMicPendente = setTimeout(() => {
    void lerMicMudo()
      .then((mudo) => {
        const antes = micVisto
        micVisto = mudo
        if (antes === null || antes === mudo) return
        anunciar?.({
          icon: mudo ? 'MicrophoneSlash' : 'Microphone',
          text: mudo ? t('Microfone mudo') : t('Microfone aberto'),
          detail: '',
          level: mudo ? 'alerta' : 'ok',
          kind: 'hud',
          key: 'mic',
          ratio: null,
          ttlMs: HUD_MS,
        })
      })
      .catch(() => {})
    void quemGrava()
      .then((agora) => {
        const antes = gravandoVistos
        gravandoVistos = new Set(agora)
        if (!antes) return
        // Só quem ENTROU: é o "ponto laranja" — alguém abriu o microfone.
        for (const nome of agora) {
          if (antes.has(nome)) continue
          anunciar?.({
            icon: 'Microphone',
            text: t('Microfone em uso'),
            detail: nome.slice(0, 40),
            level: 'erro',
            kind: 'aviso',
            ttlMs: AVISO_MS,
          })
        }
      })
      .catch(() => {})
  }, 80)
}

function vigiarVolume(): void {
  if (processoVolume) return
  // `LC_ALL=C`: a saída do `pactl` é traduzida ("Evento 'alterar' em coletor"),
  // e o vigia procura a palavra `sink` — no idioma de origem ela é estável.
  const proc = spawn('pactl', ['subscribe'], {
    env: { ...process.env, LC_ALL: 'C' },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  processoVolume = proc
  proc.stdout?.setEncoding('utf8')
  proc.stdout?.on('data', (pedaco: string) => {
    if (/on sink #/.test(pedaco)) sinkMudou()
    if (/on source(-output)? #/.test(pedaco)) microfoneMudou()
    if (/on server #/.test(pedaco)) servidorMudou()
  })
  proc.on('exit', () => {
    if (processoVolume === proc) processoVolume = null
  })
  proc.on('error', () => {
    if (processoVolume === proc) processoVolume = null
  })
  // Calibra o ponto de partida sem anunciar.
  void lerVolume()
    .then((v) => {
      volumeVisto = v
    })
    .catch(() => {})
  void lerMicMudo()
    .then((m) => {
      micVisto = m
    })
    .catch(() => {})
  void quemGrava()
    .then((g) => {
      gravandoVistos = new Set(g)
    })
    .catch(() => {})
  void run('pactl', ['get-default-sink'], { timeout: 2000 })
    .then(({ stdout }) => {
      saidaVista = stdout.trim()
    })
    .catch(() => {})
}

/* ——— Notificações ———————————————————————————————————————— */

const avisos: IslandNotice[] = []
let sequenciaAvisos = 0

/**
 * Lê os argumentos de uma chamada `Notify` na saída do `dbus-monitor`.
 *
 * O formato é o da ferramenta, uma linha por argumento, e os cinco primeiros
 * são fixos pela especificação: app_name, replaces_id, app_icon, summary,
 * body. O que vem depois (ações, dicas, expiração) a ilha não usa, exceto a
 * urgência dentro das dicas, que decide a cor.
 */
function interpretarNotify(bloco: string): IslandNotice | null {
  const strings = [...bloco.matchAll(/^\s{3}string "((?:[^"\\]|\\.)*)"$/gm)].map((m) =>
    (m[1] ?? '').replace(/\\"/g, '"').replace(/\\n/g, '\n'),
  )
  // app_name, app_icon, summary, body — o `uint32` do meio não é string.
  const [app = '', , titulo = '', corpo = ''] = strings
  if (!titulo && !corpo) return null
  const urgencia = Number(/"urgency"\s*\n\s*variant\s+byte (\d)/.exec(bloco)?.[1] ?? 1)
  // A dica `desktop-entry` diz o `.desktop` do remetente: é o que deixa
  // "clicar na notificação abre o app" funcionar sem adivinhar pelo nome.
  const desktop = /"desktop-entry"\s*\n\s*variant\s+string "([^"]+)"/.exec(bloco)?.[1] ?? ''
  return {
    id: ++sequenciaAvisos,
    at: Date.now(),
    app: app.slice(0, 40),
    title: semMarcacao(titulo).slice(0, 120),
    body: semMarcacao(corpo).slice(0, 240),
    urgent: urgencia >= 2,
    desktopEntry: desktop.slice(0, 80),
  }
}

/** O corpo pode vir com marcação (a especificação permite `<b>`, `<a>`): só texto. */
const semMarcacao = (texto: string) =>
  texto
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

function chegouAviso(aviso: IslandNotice): void {
  avisos.unshift(aviso)
  if (avisos.length > AVISOS_MAX) avisos.length = AVISOS_MAX
  avisarMudanca()
  anunciar?.({
    icon: aviso.urgent ? 'WarningCircle' : 'BellRinging',
    text: aviso.title || aviso.body,
    detail: aviso.app,
    level: aviso.urgent ? 'alerta' : 'ok',
    kind: 'aviso',
    ttlMs: AVISO_MS,
  })
}

function vigiarAvisos(): void {
  if (processoAvisos) return
  const proc = spawn(
    'dbus-monitor',
    ["interface='org.freedesktop.Notifications',member='Notify'"],
    { env: { ...process.env, LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'ignore'] },
  )
  processoAvisos = proc
  proc.stdout?.setEncoding('utf8')

  // A saída chega em pedaços que não respeitam a fronteira de uma chamada; o
  // que se acumula é fatiado a cada novo cabeçalho "method call".
  let acumulado = ''
  proc.stdout?.on('data', (pedaco: string) => {
    acumulado += pedaco
    const partes = acumulado.split(/^(?=method call )/m)
    // A última parte pode estar pela metade: fica para o próximo pedaço.
    acumulado = partes.pop() ?? ''
    for (const parte of partes) tratarBloco(parte)
    // Um bloco inteiro que terminou no fim do pedaço (a expiração `int32` é o
    // último argumento) já pode ser tratado.
    if (/^\s{3}int32 -?\d+\s*$/m.test(acumulado)) {
      tratarBloco(acumulado)
      acumulado = ''
    }
  })
  proc.on('exit', () => {
    if (processoAvisos === proc) processoAvisos = null
  })
  proc.on('error', () => {
    if (processoAvisos === proc) processoAvisos = null
  })
}

function tratarBloco(bloco: string): void {
  if (!/member=Notify\b/.test(bloco)) return
  const aviso = interpretarNotify(bloco)
  // O que a própria ilha manda (`kde-notificar`, o fim do temporizador) já
  // foi anunciado por ela: repetir seria eco.
  if (!aviso || aviso.app === 'Halo') return
  chegouAviso(aviso)
}

/* ——— Liga e desliga ————————————————————————————————————— */

/** Sobe os vigias conforme a configuração, derrubando o que ela desligou. */
export function applyWatchers(settings: IslandSettings, aoAnunciar: Anunciar): void {
  anunciar = aoAnunciar
  if (settings.on && settings.hud) vigiarVolume()
  else pararVolume()
  if (settings.on && settings.notices) vigiarAvisos()
  else pararAvisos()
}

export function stopWatchers(): void {
  pararVolume()
  pararAvisos()
  anunciar = null
}

function pararVolume(): void {
  clearTimeout(leituraPendente)
  clearTimeout(leituraMicPendente)
  processoVolume?.kill()
  processoVolume = null
  volumeVisto = null
  micVisto = null
  gravandoVistos = null
  saidaVista = null
}

function pararAvisos(): void {
  processoAvisos?.kill()
  processoAvisos = null
}

/** As últimas notificações vistas, mais recente primeiro. */
export const recentNotices = (): IslandNotice[] => [...avisos]

/**
 * Avisa TODAS as janelas que a lista mudou.
 *
 * `getAllWindows`, e não `broadcastToIslands`: a home também mostra estas
 * notificações agora, e ela mora na janela principal. Sem este empurrão a
 * coluna dela buscaria uma vez na montagem e ficaria parada — foi o que
 * aconteceu na primeira medição, e a tela dizia "nada por aqui" com duas
 * notificações já na lista.
 */
function avisarMudanca(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.islandNoticesChanged)
  }
}

export function clearNotices(): void {
  avisos.length = 0
  avisarMudanca()
}

/** Dispensa uma notificação da lista da ilha (a do KDE já sumiu). */
export function removeNotice(id: number): void {
  const n = avisos.findIndex((a) => a.id === id)
  if (n >= 0) {
    avisos.splice(n, 1)
    avisarMudanca()
  }
}

/** O estado de cada vigia, para a leitura do catálogo dizer a verdade. */
export const watcherState = () => ({
  volume: processoVolume !== null && processoVolume.exitCode === null,
  avisos: processoAvisos !== null && processoAvisos.exitCode === null,
})
