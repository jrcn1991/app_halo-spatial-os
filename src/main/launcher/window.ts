import { join } from 'node:path'
import type { EnvironmentId } from '@shared/environments'
import { IPC } from '@shared/ipc-contract'
import { BrowserWindow, type Display, screen } from 'electron'
import { ativarJanelaPorTitulo, geometriaDaJanelaAtiva } from '../island/kwin'
import { setSkipTaskbar } from '../services/desktop-layer'
import { currentSettings, saveLauncherPosition } from '../settings'

/**
 * A janela do lançador — a "carcaça" de Meta+V.
 *
 * O lançador da ilha e este são o MESMO motor (`src/renderer/launcher/motor.ts`)
 * com duas carcaças: a ilha mantém a estética dela; esta janela veste o tema
 * do app (os mesmos tokens e `data-env` da home). Uma janela só, criada
 * escondida no arranque e mostrada/escondida pelo atalho — recriar a cada
 * Meta+V custaria o carregamento do renderer a cada abertura.
 *
 * Aparece na tela da janela ATIVA (o usuário viu: na tela do cursor ela caía
 * sobre o Halo enquanto ele trabalhava noutra), na posição em que ele a
 * deixou da última vez — o arrasto é livre, e o deslocamento é guardado
 * relativo à área útil da tela, para valer em qualquer uma. Sem posição
 * guardada: centrada, um pouco acima do meio, como o Raycast. Esc, perder o
 * foco ou executar algo escondem.
 */

export const TITULO = 'Halo · Lançador'
/** 720×460 de painel mais 24px de folga por lado, onde a sombra cabe inteira. */
const TAMANHO = { width: 768, height: 508 }

let janela: BrowserWindow | null = null
let ambienteAtual: EnvironmentId | null = null

function criar(env: EnvironmentId): BrowserWindow {
  const win = new BrowserWindow({
    ...TAMANHO,
    title: TITULO,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  win.setMenuBarVisibility(false)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // O título é como o KWin acha a janela para ativá-la; o renderer não o muda.
  win.on('page-title-updated', (e) => e.preventDefault())
  win.on('blur', () => {
    if (!win.isDestroyed() && win.isVisible()) win.hide()
  })
  const consulta = `env=${encodeURIComponent(env)}`
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void win.loadURL(`${devUrl}/launcher.html?${consulta}`)
  else
    void win.loadFile(join(import.meta.dirname, '../renderer/launcher.html'), { search: consulta })
  return win
}

/** Sobe (escondida) ou derruba a janela conforme a configuração. */
export function applyLauncher(on: boolean, env: EnvironmentId): void {
  if (!on) {
    closeLauncher()
    return
  }
  if (janela && !janela.isDestroyed()) {
    if (env !== ambienteAtual) janela.webContents.send(IPC.launcherEnv, env)
  } else {
    janela = criar(env)
  }
  ambienteAtual = env
}

export function closeLauncher(): void {
  if (janela && !janela.isDestroyed()) janela.destroy()
  janela = null
}

export function hideLauncher(): void {
  if (janela && !janela.isDestroyed() && janela.isVisible()) janela.hide()
}

/** A tela da janela ativa; sem janela ativa (ou sem KWin), a do cursor. */
async function telaAtiva(): Promise<Display> {
  const ativa = await geometriaDaJanelaAtiva().catch(() => null)
  if (ativa) {
    const centro = { x: ativa.x + ativa.width / 2, y: ativa.y + ativa.height / 2 }
    return screen.getDisplayNearestPoint({ x: Math.round(centro.x), y: Math.round(centro.y) })
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

/** Onde a janela fica numa tela: a posição guardada se cabe nela, senão o padrão. */
function posicaoEm(tela: Display): { x: number; y: number } {
  const area = tela.workArea
  const guardada = currentSettings().launcher.position
  if (
    guardada &&
    guardada.dx + TAMANHO.width <= area.width &&
    guardada.dy + TAMANHO.height <= area.height
  ) {
    return { x: area.x + guardada.dx, y: area.y + guardada.dy }
  }
  return {
    x: Math.round(area.x + (area.width - TAMANHO.width) / 2),
    // Um pouco acima do centro, como o Raycast: o olho procura o campo no
    // terço superior, e a lista cresce para baixo.
    y: Math.round(area.y + area.height * 0.22),
  }
}

/** Na tela ativa, na posição guardada, e ATIVADA pelo compositor (ver `ativarJanelaPorTitulo`). */
export async function showLauncher(): Promise<void> {
  if (!janela || janela.isDestroyed()) return
  const tela = await telaAtiva()
  janela.setBounds({ ...posicaoEm(tela), ...TAMANHO })
  janela.show()
  janela.focus()
  // O `skipTaskbar: true` da criação não vale no Linux — a opção do Electron é
  // de Windows e macOS (MEDIDO; ver `setSkipTaskbar`). Sem esta linha o
  // lançador entrava na barra de tarefas a cada Meta+V, e ele é uma janela de
  // dois segundos: ninguém a alterna, ninguém a procura ali. Depois do
  // `show()`, porque o pedido só é aceito com a janela já mapeada.
  void setSkipTaskbar(janela, true)
  janela.webContents.send(IPC.launcherEnv, ambienteAtual)
  await ativarJanelaPorTitulo(TITULO).catch(() => {
    // Sem KWin o `focus()` acima é o que há.
  })
}

/** Um passo do arrasto: o renderer manda o deslocamento desde o último evento. */
export function moveLauncherBy(dx: number, dy: number): void {
  if (!janela || janela.isDestroyed() || !janela.isVisible()) return
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
  const [x = 0, y = 0] = janela.getPosition()
  janela.setPosition(Math.round(x + dx), Math.round(y + dy))
}

/**
 * O arrasto acabou: guarda o deslocamento relativo à área útil da tela em que
 * a janela ficou. Fora da área (arrastada para além da borda) não grava — o
 * próximo Meta+V voltaria a um lugar meio invisível.
 */
export function launcherMoved(): void {
  if (!janela || janela.isDestroyed()) return
  const [x = 0, y = 0] = janela.getPosition()
  const area = screen.getDisplayNearestPoint({
    x: x + TAMANHO.width / 2,
    y: y + TAMANHO.height / 2,
  }).workArea
  const dx = x - area.x
  const dy = y - area.y
  if (dx < 0 || dy < 0 || dx + TAMANHO.width > area.width || dy + TAMANHO.height > area.height) {
    return
  }
  saveLauncherPosition({ dx, dy })
}

export async function toggleLauncher(): Promise<void> {
  if (!janela || janela.isDestroyed()) return
  if (janela.isVisible()) janela.hide()
  else await showLauncher()
}
