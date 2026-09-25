import { join } from 'node:path'
import { idiomaAtual } from '@shared/i18n'
import { IPC } from '@shared/ipc-contract'
import { BrowserWindow, screen } from 'electron'
import { travarNavegacao } from '../navegacao'
import { isX11 } from './desktop-layer'

/**
 * O player, numa janela própria.
 *
 * Ele é destacado do app de propósito, e não um painel dentro do palco:
 *
 * - A janela do Halo é transparente, sem moldura e (no modo desktop) presa
 *   atrás de todas as outras. Vídeo ali dentro herdaria tudo isso — ficaria
 *   atrás das janelas do usuário, que é o oposto do que se quer ao assistir.
 * - O palco é escalado por `transform`, e vídeo dentro de subárvore
 *   transformada perde aceleração no Chromium.
 * - Uma janela separada é o que dá tela cheia de verdade e o modo mini que
 *   continua por cima enquanto se mexe em outra coisa.
 *
 * A janela é única: mandar tocar outro título reaproveita a que já existe, em
 * vez de encher a tela de players.
 */

/** 16:9 — a proporção de quase tudo que se assiste. */
const PROPORCAO = 16 / 9
/** Mini: cabe num canto sem atrapalhar. Normal: confortável sem ocupar a tela. */
const MINI = { width: 480, height: Math.round(480 / PROPORCAO) }
const NORMAL = { width: 960, height: Math.round(960 / PROPORCAO) }

let player: BrowserWindow | null = null

export type PlayRequest = {
  url: string
  title: string
  subtitle: string
  /** Capa, para a Media Session — é ela que vira a arte no MPRIS. */
  poster: string
  /** Segundo em que a reprodução deve começar — é a continuidade. */
  startAt: number
}

/** O que está tocando agora, para casar o progresso com o título certo. */
export type Tocando = {
  id: string
  episode: string | null
  name: string
  poster: string
  subtitle: string
}

let tocando: Tocando | null = null

export function nowPlayingTitle(): Tocando | null {
  return tocando
}

function criar(): BrowserWindow {
  const win = new BrowserWindow({
    ...NORMAL,
    minWidth: 360,
    minHeight: Math.round(360 / PROPORCAO),
    useContentSize: true,
    show: false,
    frame: false,
    backgroundColor: '#000000',
    title: 'Halo · Player',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.setAspectRatio(PROPORCAO)
  travarNavegacao(win.webContents)
  // Mini janela só faz sentido se ela ficar visível enquanto se usa outra
  // coisa. No Wayland isto não pega (ver `togglePinned`), e a janela nasce
  // sem fixar em vez de nascer mentindo.
  win.setAlwaysOnTop(isX11())
  win.on('closed', () => {
    player = null
    tocando = null
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  // O idioma vai na consulta, como nas outras janelas; trocas chegam por IPC.
  const consulta = `lang=${idiomaAtual()}`
  if (devUrl) void win.loadURL(`${devUrl}/player.html?${consulta}`)
  else void win.loadFile(join(import.meta.dirname, '../renderer/player.html'), { search: consulta })

  return win
}

/** Abre (ou reaproveita) o player e manda tocar. */
export function play(request: PlayRequest, titulo: Tocando): void {
  tocando = titulo
  player ??= criar()
  const win = player

  const enviar = () => {
    win.webContents.send(IPC.playerLoad, request)
    if (!win.isVisible()) win.show()
    win.focus()
  }

  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', enviar)
  else enviar()
}

export function closePlayer(): void {
  player?.close()
}

/**
 * Alterna a tela cheia.
 *
 * Sair da tela cheia devolve a proporção: o Chromium a esquece ao entrar, e
 * sem restaurar a janela voltaria deformada.
 */
export function toggleFullscreen(): boolean {
  if (!player) return false
  const proximo = !player.isFullScreen()
  player.setFullScreen(proximo)
  if (!proximo) player.setAspectRatio(PROPORCAO)
  return proximo
}

/** Alterna entre o tamanho mini e o normal, ancorando o mini num canto. */
export function toggleMini(): boolean {
  if (!player) return false
  const { width } = player.getContentBounds()
  const mini = width > MINI.width + 40

  if (mini) {
    const area = screen.getDisplayMatching(player.getBounds()).workArea
    player.setContentBounds({
      ...MINI,
      x: area.x + area.width - MINI.width - 24,
      y: area.y + area.height - MINI.height - 24,
    })
  } else {
    player.setContentSize(NORMAL.width, NORMAL.height)
    player.center()
  }
  return mini
}

/**
 * Fixar por cima de tudo — o que faz a mini janela valer a pena.
 *
 * Só existe no X11. No Wayland um app comum não pode pedir para ficar acima
 * das outras janelas: o Electron aceita a chamada, `isAlwaysOnTop()` passa a
 * responder `true`, e o compositor ignora — foi medido, a janela continua
 * sendo coberta. Por isso `supported` vem junto: melhor o botão dizer que não
 * dá do que fingir que fixou.
 *
 * Ligar o modo desktop põe o app em X11, e aí o fixar passa a valer.
 */
export function togglePinned(): { on: boolean; supported: boolean } {
  const supported = isX11()
  if (!player) return { on: false, supported }
  const proximo = supported && !player.isAlwaysOnTop()
  player.setAlwaysOnTop(proximo)
  return { on: proximo, supported }
}

/** Se dá para fixar nesta sessão — a tela do player usa para nascer certa. */
export function pinSupported(): boolean {
  return isX11()
}
