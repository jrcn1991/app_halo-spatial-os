import { join } from 'node:path'
import type { EnvironmentId } from '@shared/environments'
import { idiomaAtual } from '@shared/i18n'
import { IPC } from '@shared/ipc-contract'
import type { Aviso, CantoDosAvisos } from '@shared/notificacoes'
import { BrowserWindow, screen } from 'electron'
import { setInputRegion } from '../island/entrada'
import { travarNavegacao } from '../navegacao'
import { setSkipTaskbar } from '../services/desktop-layer'
import { type AreaDeVidro, desfocarAtras } from '../vidro'

/**
 * A janela dos avisos — a terceira carcaça que veste o tema (depois do app e
 * do lançador de Meta+V).
 *
 * Uma coluna transparente, da altura da área útil da tela PRINCIPAL, colada no
 * canto escolhido: é onde o Plasma punha os balões dele nesta máquina (medido:
 * topo à direita, logo abaixo do painel). Ela não muda de tamanho — cada
 * `setBounds` numa janela ARGB do X11 mostra o buffer velho por um quadro, que
 * foi o flicker da ilha (ver `island/window.ts`). Quem impede a coluna de
 * engolir cliques é a REGIÃO DE ENTRADA do X (`island/entrada.ts`): o renderer
 * diz onde os balões estão, e fora deles o ponteiro atravessa.
 *
 * - `type: 'notification'`: o tipo EWMH de balão. O KWin o põe acima das
 *   janelas comuns e não o posiciona por conta própria.
 * - `focusable: false`: um balão nunca rouba o teclado de quem está digitando.
 *   O clique continua chegando — foco e ponteiro são coisas diferentes no X.
 * - Escondida enquanto não há aviso: mostrar e esconder é barato, e uma
 *   janela mapeada à toa é uma janela a mais para o compositor.
 */

export const TITULO = 'Halo · Avisos'
/** O balão tem 380px; o resto é folga para a sombra e o ornamento do tema. */
const LARGURA = 440

let janela: BrowserWindow | null = null
let canto: CantoDosAvisos = 'topo-direita'
let ambiente: EnvironmentId = 'floresta'
let regiao: Electron.Rectangle[] = []
let temAvisos = false
let vigilia: NodeJS.Timeout | undefined
let telasOuvidas = false
/** O KWin desfoca atrás de janela? Decide o piso do balão (`?desfoque=` na página). */
let desfoque = false

function limites(): Electron.Rectangle {
  const area = screen.getPrimaryDisplay().workArea
  return {
    x: canto.endsWith('direita') ? area.x + area.width - LARGURA : area.x,
    y: area.y,
    width: LARGURA,
    height: area.height,
  }
}

function carregar(win: BrowserWindow): void {
  const consulta = `env=${encodeURIComponent(ambiente)}&canto=${canto}&desfoque=${desfoque ? 'sim' : 'nao'}&lang=${idiomaAtual()}`
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void win.loadURL(`${devUrl}/notificacoes.html?${consulta}`)
  else
    void win.loadFile(join(import.meta.dirname, '../renderer/notificacoes.html'), {
      search: consulta,
    })
}

/**
 * Escreve onde o mouse vale. O Chromium APAGA a shape de entrada ao mapear a
 * janela e a cada mudança de bounds (medido na ilha, 02/09/2026), então ela é
 * reescrita nos instantes seguintes e, enquanto a janela está à vista, a cada
 * meio segundo — o mesmo remédio da ilha.
 */
function escrever(): void {
  if (janela && !janela.isDestroyed()) void setInputRegion(janela, regiao)
}

function escreverComEcos(): void {
  escrever()
  setImmediate(escrever)
  for (const ms of [100, 300]) setTimeout(escrever, ms)
}

function mostrar(win: BrowserWindow): void {
  win.setBounds(limites())
  win.showInactive()
  // Fora da barra de tarefas por EWMH (o `skipTaskbar` do Electron não vale
  // no Linux), e o "manter acima" repetido depois: mudar `_NET_WM_STATE` faz
  // o KWin recalcular a camada — o mesmo que a ilha mediu.
  void setSkipTaskbar(win, true).then(() => {
    if (!win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver')
  })
  escreverComEcos()
  clearInterval(vigilia)
  vigilia = setInterval(escrever, 500)
}

function esconder(win: BrowserWindow): void {
  clearInterval(vigilia)
  vigilia = undefined
  // Sem balão, sem vidro: a propriedade sai junto, para a próxima vez que a
  // janela aparecer não trazer o desfoque de um balão que já foi.
  void desfocarAtras(win, [])
  if (win.isVisible()) win.hide()
}

function ouvirTelas(): void {
  if (telasOuvidas) return
  telasOuvidas = true
  const reposicionar = () => {
    if (janela && !janela.isDestroyed() && janela.isVisible()) {
      janela.setBounds(limites())
      escreverComEcos()
    }
  }
  screen.on('display-metrics-changed', reposicionar)
  screen.on('display-added', reposicionar)
  screen.on('display-removed', reposicionar)
}

export function janelaDosAvisosAberta(): boolean {
  return janela !== null && !janela.isDestroyed()
}

/**
 * Cria a janela (escondida). `aoPronta` é chamada quando a página carregou —
 * é o sinal para o Plasma ser inibido; `aoCair`, quando o renderer morre — o
 * sinal para devolver os balões ao Plasma na hora.
 */
export function abrirJanelaDosAvisos(
  env: EnvironmentId,
  cantoEscolhido: CantoDosAvisos,
  comDesfoque: boolean,
  aoPronta: () => void,
  aoCair: () => void,
): void {
  fecharJanelaDosAvisos()
  ambiente = env
  canto = cantoEscolhido
  desfoque = comDesfoque
  regiao = []
  temAvisos = false
  ouvirTelas()
  const win = new BrowserWindow({
    ...limites(),
    title: TITULO,
    type: 'notification',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
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
  win.on('page-title-updated', (e) => e.preventDefault())
  // Transparente ao mouse até o renderer dizer onde estão os balões.
  void setInputRegion(win, [])
  win.on('show', escreverComEcos)
  win.on('move', escreverComEcos)
  win.on('resize', escreverComEcos)
  win.webContents.on('did-finish-load', aoPronta)
  win.webContents.on('render-process-gone', () => aoCair())
  travarNavegacao(win.webContents)
  janela = win
  carregar(win)
}

export function fecharJanelaDosAvisos(): void {
  clearInterval(vigilia)
  vigilia = undefined
  if (janela && !janela.isDestroyed()) janela.destroy()
  janela = null
}

/** Trocar de canto recarrega a página: ela monta a pilha a partir da borda certa. */
export function reposicionarAvisos(cantoNovo: CantoDosAvisos): void {
  canto = cantoNovo
  if (!janela || janela.isDestroyed()) return
  janela.setBounds(limites())
  carregar(janela)
}

/** O ambiente trocou: a janela fica viva e só troca o tema. */
export function envDosAvisos(env: EnvironmentId): void {
  ambiente = env
  if (janela && !janela.isDestroyed()) janela.webContents.send(IPC.notificacoesEnv, env)
}

/** A lista mudou. Aviso novo mostra a janela; ela só esconde depois da saída do último. */
export function empurrarAvisos(lista: Aviso[]): void {
  temAvisos = lista.length > 0
  if (!janela || janela.isDestroyed()) return
  janela.webContents.send(IPC.notificacoesAvisos, lista)
  if (temAvisos && !janela.isVisible()) mostrar(janela)
}

/**
 * Onde os balões estão agora. Lista vazia com a pilha vazia é o renderer
 * dizendo que a saída do último acabou: a janela se esconde.
 */
export function regiaoDosAvisos(retangulos: Electron.Rectangle[]): void {
  regiao = retangulos
  if (!janela || janela.isDestroyed()) return
  escrever()
  if (retangulos.length === 0 && !temAvisos) esconder(janela)
}

/**
 * Os balões de VIDRO assentados, relativos à janela: o KWin desfoca atrás
 * deles (ver `main/vidro.ts`). Sem o efeito de desfoque não há o que pedir — o
 * balão já nasceu com piso sólido.
 */
export function vidroDosAvisos(areas: AreaDeVidro[]): void {
  if (!desfoque || !janela || janela.isDestroyed()) return
  void desfocarAtras(janela, areas)
}
