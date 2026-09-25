import { join } from 'node:path'
import { idiomaAtual } from '@shared/i18n'
import { IPC } from '@shared/ipc-contract'
import {
  type IslandEvent,
  type IslandFlight,
  type IslandSettings,
  type IslandWindow,
  VOO_CHEGADA_MS,
  VOO_MS,
} from '@shared/island'
import { alturaDaIlha } from '@shared/settings'
import { BrowserWindow, type Display, screen } from 'electron'
import { travarNavegacao } from '../navegacao'
import { setSkipTaskbar } from '../services/desktop-layer'
import { currentSettings } from '../settings'
import { setInputRegion } from './entrada'
import { ativarIlha, devolverFoco } from './kwin'

/**
 * A janela da ilha.
 *
 * Uma por tela escolhida. Ela vive ACIMA de tudo — o oposto da janela do app,
 * que fica na camada do papel de parede — porque uma ilha que some atrás das
 * janelas não serviria para nada.
 *
 * A janela tem SEMPRE o tamanho aberto: 532×470 (a gota aberta tem 488 de
 * largura e até 430 de altura, mais a folga da sombra — 22 de cada lado e
 * 40 embaixo). Ela nunca redimensiona: cada `setBounds` numa janela ARGB do
 * X11 mostra o buffer antigo na posição nova por um quadro (medido em
 * 01/09/2026: a pílula pulava 86px ao recentrar), e é isso que se via como
 * flicker ao passar o mouse.
 *
 * O que impede a janela grande de engolir cliques é a REGIÃO DE ENTRADA
 * (`entrada.ts`): o renderer informa onde a gota e a bolha estão, e o main
 * escreve esses retângulos na shape de entrada do X — fora deles o ponteiro
 * atravessa a janela e cai em quem está embaixo. Com a ilha aberta a janela
 * inteira aceita o mouse, como a folga da sombra sempre aceitou.
 *
 * As duas versões anteriores, e por que morreram: uma faixa larga com
 * `setIgnoreMouseEvents` esperando `mousemove` não recebia o solte de um
 * arquivo (durante um arrasto o ponteiro é do aplicativo de origem e nenhum
 * `mousemove` chega); e a sondagem da posição do cursor pelo vigia do KWin,
 * ligando e desligando o mouse na janela inteira, dependia de uma MUDANÇA de
 * estado para chamar o Electron — e o Chromium apaga a shape por conta própria
 * ao mapear a janela (medido em 02/09/2026: as ilhas nasciam aceitando o mouse
 * na faixa toda, e uma aba do navegador embaixo da pílula fechada ficava
 * inclicável até o cursor entrar e sair dela). A shape por geometria não tem
 * estado para perder: é reescrita a cada pulso do renderer.
 */
const TAMANHO = { width: 532, height: 470 }

const janelas = new Map<string, BrowserWindow>()
/** Quem está aberta agora. */
const abertas = new WeakSet<BrowserWindow>()
/** As regiões clicáveis de cada ilha (gota e bolha), relativas à janela. */
const alvos = new WeakMap<BrowserWindow, Electron.Rectangle[]>()
/**
 * A tela de cada ilha, lembrada na criação: durante o voo a janela cobre mais
 * de uma tela, e `getDisplayMatching` escolheria a errada ao voltar.
 */
const telaDe = new WeakMap<BrowserWindow, number>()

/**
 * Onde a ilha se assenta (`settings.island.placement`), guardado aqui porque
 * o redimensionar ao abrir e ao anunciar precisa recalcular o `y`.
 */
let assentamento: IslandSettings['placement'] = 'sobre'

/**
 * O topo da ilha numa tela.
 *
 * `sobre`: a borda da própria tela — a pílula cobre o centro do painel do
 * KDE, como o notch cobre o centro da barra de menus, e não gasta nenhum
 * pixel de área útil. O "manter acima" NÃO basta para ela ficar sobre o
 * painel: os dois vivem na mesma camada do KWin, e quem a mantém por cima é
 * o vigia (`SOBRE_O_PAINEL`, em `kwin.ts` — medido em 08/09/2026, com a ilha
 * encontrada sob a barra dez horas depois de abrir). `abaixo`: o topo da área
 * útil, que já desconta o painel — a ilha fica logo abaixo dele e rouba uma
 * faixa das janelas maximizadas, mas nunca cobre o que o painel mostra no
 * centro.
 */
function topo(display: Display): number {
  return assentamento === 'sobre' ? display.bounds.y : display.workArea.y
}

function telaDaIlha(win: BrowserWindow): Display {
  const lembrada = telaDe.get(win)
  return (
    screen.getAllDisplays().find((d) => d.id === lembrada) ??
    screen.getDisplayMatching(win.getBounds())
  )
}

/** A página da ilha, com a consulta (`a=1&b=2`) — a mesma para a ilha e para a camada. */
function carregar(win: BrowserWindow, consultaSemIdioma: string): void {
  // O idioma vai na consulta, como as outras opções da página: a ilha precisa
  // dele no primeiro desenho. Trocas depois chegam por `IPC.idiomaMudou`.
  const consulta = `${consultaSemIdioma}&lang=${idiomaAtual()}`
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void win.loadURL(`${devUrl}/island.html?${consulta}`)
  else {
    void win.loadFile(join(import.meta.dirname, '../renderer/island.html'), { search: consulta })
  }
}

function criar(display: Display, settings: IslandSettings): BrowserWindow {
  const area = display.workArea
  const win = new BrowserWindow({
    width: TAMANHO.width,
    height: TAMANHO.height,
    x: Math.round(area.x + (area.width - TAMANHO.width) / 2),
    // É de onde a gota escorre: o topo da tela ou o topo da área útil.
    y: topo(display),
    frame: false,
    transparent: true,
    // `dock`, o tipo do próprio painel do Plasma: o KWin não o posiciona nem
    // o prende à área de trabalho — uma janela normal focável (e também uma
    // `toolbar`) era empurrada de y=0 para y=33 no mapeamento e ficava lá
    // (medido em 01/09/2026). Dock aceita foco por clique e não reserva
    // espaço (não há `_NET_WM_STRUT`): a área de trabalho fica intacta.
    type: 'dock',
    // Sem isto, no quadro entre o `setBounds` e o próximo frame do renderer
    // a região nova pode vir preta por um instante no X11.
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // Focável, mas nunca ATIVADA por conta própria: o KWin só dá foco em
    // clique (nunca no hover), e ao fechar a ilha devolve o foco (`blur`).
    // `focusable: false` matava a Nota e o lançador: medido em 01/09/2026,
    // o `setFocusable(true)` do Electron não muda o `wantsInput` que o KWin
    // vê, então nenhum pedido de foco chegava.
    focusable: true,
    show: false,
    // `toolbar` fica acima até de janelas em tela cheia na maioria dos gerenciadores.
    alwaysOnTop: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  travarNavegacao(win.webContents)

  carregar(
    win,
    `motion=${settings.motion}&idle=${settings.idleOpacity}&open=${settings.opening}&h=${alturaDaIlha(currentSettings())}`,
  )

  win.once('ready-to-show', () => {
    win.showInactive()
    // A ilha é `_NET_WM_WINDOW_TYPE_DOCK`, e mesmo assim o gerenciador de
    // tarefas do KDE a listava: MEDIDO em 06/09/2026, o ícone do Halo na
    // barra mostrava DOIS pontos de janela aberta, um por camada da ilha. O
    // `skipTaskbar: true` da criação não vale no Linux (a opção do Electron é
    // de Windows e macOS), e é este pedido EWMH que resolve — depois do
    // `showInactive`, porque o gerenciador só o aceita com a janela mapeada.
    //
    // E o `setAlwaysOnTop` VOLTA logo depois: mudar `_NET_WM_STATE` faz o KWin
    // recalcular a camada da janela, e a ilha caía para BAIXO do painel do
    // Plasma — só a barriga dela aparecia sob a barra superior (relatado pelo
    // usuário, e visto na captura). Repetir o pedido a devolve para cima —
    // neste instante. Quem a mantém lá depois, a cada clique no painel, é o
    // vigia do KWin (`SOBRE_O_PAINEL`, em `kwin.ts`).
    void setSkipTaskbar(win, true).then(() => {
      if (!win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver')
    })
  })
  telaDe.set(win, display.id)
  // Até o renderer dizer onde a gota está, a janela é transparente ao mouse;
  // e o Chromium apaga a shape de entrada ao mostrar a janela pela primeira
  // vez (ver `entrada.ts`) — mover e redimensionar entram por precaução, que
  // é onde o Chromium também recalcula a região da janela.
  aplicarEntrada(win)
  win.on('show', () => reaplicarEntrada(win))
  win.on('move', () => reaplicarEntrada(win))
  win.on('resize', () => reaplicarEntrada(win))
  return win
}

/** As telas onde a ilha deve aparecer, conforme a configuração. */
function telasEscolhidas(settings: IslandSettings): Display[] {
  const todas = screen.getAllDisplays()
  if (settings.display === 'all') return todas
  if (settings.display === 'primary') {
    const principal = screen.getPrimaryDisplay()
    return [principal]
  }
  // Nome de tela (`DP-1`): se ela sumiu, cai na principal em vez de não aparecer.
  const achada = todas.find((d) => d.label === settings.display)
  return [achada ?? screen.getPrimaryDisplay()]
}

/** Sobe, desce ou reposiciona a ilha conforme as configurações. */
export function applyIsland(settings: IslandSettings): void {
  closeIsland()
  assentamento = settings.placement
  if (!settings.on) return
  for (const display of telasEscolhidas(settings)) {
    janelas.set(String(display.id), criar(display, settings))
  }
  criarCamada()
}

export function closeIsland(): void {
  for (const win of janelas.values()) if (!win.isDestroyed()) win.destroy()
  janelas.clear()
  if (camada && !camada.isDestroyed()) camada.destroy()
  camada = null
  camadaPronta = false
}

/* ——— A região de entrada ————————————————————————————————— */

/** O renderer disse onde a gota e a bolha estão. */
export function setIslandTargets(win: BrowserWindow, retangulos: Electron.Rectangle[]): void {
  alvos.set(win, retangulos)
  aplicarEntrada(win)
}

/**
 * Escreve no X onde o mouse vale nesta ilha: a janela inteira quando ela está
 * aberta (o painel ocupa quase tudo, e a folga da sombra em volta sempre
 * aceitou o mouse), senão só a gota e a bolha. Não guarda "já está assim"
 * como verdade — é a reescrita periódica que desfaz o apagamento do Chromium.
 */
function aplicarEntrada(win: BrowserWindow, forcar = false): void {
  if (win.isDestroyed()) return
  const b = win.getBounds()
  const regiao = abertas.has(win)
    ? [{ x: 0, y: 0, width: b.width, height: b.height }]
    : (alvos.get(win) ?? [])
  // Região igual à última só é reescrita a cada 500ms: o renderer pulsa a
  // cada 100ms, e cada escrita faz o KWin reler a shape (um ShapeNotify por
  // pulso por ilha, medido). O apagamento do Chromium vem junto de eventos
  // que já forçam a reescrita; a de 500ms é a rede de segurança.
  const chave = JSON.stringify(regiao)
  const ultima = escritas.get(win)
  const agora = Date.now()
  if (!forcar && ultima?.chave === chave && agora - ultima.at < REESCRITA_MS) return
  escritas.set(win, { chave, at: agora })
  void setInputRegion(win, regiao)
}
/** A última região escrita em cada ilha, e quando. */
const escritas = new WeakMap<BrowserWindow, { chave: string; at: number }>()
const REESCRITA_MS = 500

/**
 * Depois de um evento de janela: agora, no próximo giro do loop e nos
 * instantes seguintes, porque o apagamento do Chromium não vem junto do
 * evento — medido ~120ms depois de a janela aparecer — e escrever só durante
 * ele deixaria a shape apagada por cima.
 */
const ECOS_MS = [100, 300]
function reaplicarEntrada(win: BrowserWindow): void {
  aplicarEntrada(win, true)
  setImmediate(() => aplicarEntrada(win, true))
  for (const ms of ECOS_MS) setTimeout(() => aplicarEntrada(win, true), ms)
}

/**
 * Abre ou fecha. A janela não muda de tamanho — só se lembra de quem está
 * aberta e devolve o foco ao fechar.
 */
export function setIslandOpen(win: BrowserWindow, aberta: boolean): void {
  if (win.isDestroyed()) return
  if (aberta) abertas.add(win)
  else {
    abertas.delete(win)
    // Ao fechar, o foco (se a ilha o tinha, por um clique) volta à pilha do KWin.
    if (win.isFocused()) void devolverFoco().catch(() => {})
  }
  aplicarEntrada(win)
}

/** Mantido por compatibilidade: a janela não redimensiona mais. */
export function islandSettled(_win: BrowserWindow, _altura: number): void {}

/* ——— Anúncios ————————————————————————————————————————————— */

/** Anuncia um evento a todas as ilhas: o renderer alarga a pílula por dentro. */
export function announceToIslands(evento: IslandEvent): void {
  for (const win of janelas.values()) {
    if (win.isDestroyed()) continue
    win.webContents.send(IPC.islandEvento, evento)
  }
}

/** Manda um instantâneo para todas as ilhas abertas. */
export function broadcastToIslands(canal: string, dados: unknown): void {
  for (const win of janelas.values()) {
    if (!win.isDestroyed()) win.webContents.send(canal, dados)
  }
}

/** Alguma ilha está ABERTA (painel à vista)? Recolhida, o pulso pode ser leve. */
export function algumaIlhaAberta(): boolean {
  return islandWindows().some((w) => abertas.has(w))
}

export function islandWindows(): BrowserWindow[] {
  return [...janelas.values()].filter((w) => !w.isDestroyed())
}

/** As telas desta máquina, para a tela de Configurações oferecer a escolha. */
export function listDisplays(): { id: string; label: string; primary: boolean }[] {
  const principal = screen.getPrimaryDisplay()
  return screen.getAllDisplays().map((d) => ({
    id: d.label || String(d.id),
    label: d.label || `Tela ${d.id}`,
    primary: d.id === principal.id,
  }))
}

/* ——— O voo de uma janela para a gaveta ——————————————————————
 *
 * A janela da ilha NUNCA muda de tamanho (ver TAMANHO): cada `setBounds`
 * mostra o buffer velho por um quadro, e a primeira versão do voo fazia isso
 * duas vezes — alargava a ilha até cobrir a tela e a encolhia de volta — e
 * era a "barra maluca" que se via (01/09/2026). Quem voa agora é outra
 * janela: a CAMADA DO FANTASMA, transparente ao mouse, que cobre a união
 * das telas (no X11 uma janela atravessa monitores) e fica ESCONDIDA até
 * haver voo. Ela nasce junto com a ilha — criar uma janela leva uns 200ms, e
 * o gesto não pode esperar — e é só mostrada e escondida. Ao esconder, o
 * renderer já desmontou o fantasma e o buffer é transparente: mostrar de
 * novo não tem quadro velho para exibir.
 *
 * A ordem importa (revisão de movimento): o fantasma é desenhado ANTES de a
 * janela real ser minimizada — `flyToIslands` resolve quando a camada
 * responde `vooPronto` e já foi mapeada — senão o usuário veria a janela
 * real indo para baixo pelo efeito do KWin enquanto o vulto surge por cima.
 * A ilha recebe o mesmo evento: fecha o painel e quica quando o fantasma
 * chega à boca.
 */
/**
 * A boca: onde o fantasma some, contado do topo da pílula fechada — dois px
 * acima da barriga dela. Segue a altura que vale agora (`alturaDaIlha`, que é
 * o ambiente, depois a global), senão numa pílula fina o
 * cartão sumiria abaixo dela.
 */
const bocaY = (): number => alturaDaIlha(currentSettings()) - 2

let camada: BrowserWindow | null = null
let camadaPronta = false
let esconderCamada: NodeJS.Timeout | undefined
const prontos = new WeakMap<BrowserWindow, () => void>()

function uniaoDasTelas(): Electron.Rectangle {
  const telas = screen.getAllDisplays().map((d) => d.bounds)
  const x = Math.min(...telas.map((t) => t.x))
  const y = Math.min(...telas.map((t) => t.y))
  return {
    x,
    y,
    width: Math.max(...telas.map((t) => t.x + t.width)) - x,
    height: Math.max(...telas.map((t) => t.y + t.height)) - y,
  }
}

function criarCamada(): void {
  const win = new BrowserWindow({
    ...uniaoDasTelas(),
    frame: false,
    transparent: true,
    // O mesmo tipo da ilha: o KWin não a posiciona nem a prende; sem strut.
    type: 'dock',
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
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Transparente ao mouse em toda a extensão — e reescrita a cada mostrar e
  // mudança de bounds, porque o Chromium apaga a shape nesses passos (ver
  // `entrada.ts`); sem isto, durante o voo a camada cobriria as duas telas
  // engolindo cliques.
  win.setIgnoreMouseEvents(true)
  const vazia = () => {
    void setInputRegion(win, [])
    setImmediate(() => void setInputRegion(win, []))
    for (const ms of ECOS_MS) setTimeout(() => void setInputRegion(win, []), ms)
  }
  vazia()
  win.on('move', vazia)
  win.on('resize', vazia)
  // Enquanto está à vista (o voo dura ~1s), reescrita a cada 100ms: escondida,
  // a shape dela foi lida cheia minutos depois de criada, sem evento nenhum.
  let vigilia: NodeJS.Timeout | undefined
  win.on('show', () => {
    vazia()
    clearInterval(vigilia)
    vigilia = setInterval(() => void setInputRegion(win, []), 100)
  })
  win.on('hide', () => clearInterval(vigilia))
  win.on('closed', () => clearInterval(vigilia))
  // O construtor corta a janela a UMA tela (3840×1080 virou 1919×1079, medido
  // em 01/09/2026); um `setBounds` logo depois, ainda escondida, fixa a
  // união e o tamanho segura ao mostrar.
  win.setBounds(uniaoDasTelas())
  win.webContents.once('did-finish-load', () => {
    camadaPronta = true
  })
  travarNavegacao(win.webContents)
  carregar(win, 'modo=voo')
  camada = win
  if (!ouvindoTelas) {
    ouvindoTelas = true
    // Tela entrou ou saiu: a camada só muda de tamanho ESCONDIDA — invisível,
    // o quadro velho não aparece para ninguém.
    const ajustar = () => {
      if (camada && !camada.isDestroyed() && !camada.isVisible()) camada.setBounds(uniaoDasTelas())
    }
    screen.on('display-added', ajustar)
    screen.on('display-removed', ajustar)
    screen.on('display-metrics-changed', ajustar)
  }
}
let ouvindoTelas = false

type OpcoesDoVoo = {
  cartao: boolean
  /**
   * Que cartão o fantasma desenha. O padrão é `janela` — uma janela alheia; o
   * app recolhido pela ilha (`island/halo.ts`) manda `halo`, e o cartão imita
   * o vidro do Halo em vez de uma placa preta.
   */
  tipo?: IslandFlight['tipo']
}

/** Ida: resolve quando o cartão já cobre a janela real (aí ela pode sumir). */
export const flyToIslands = (janela: IslandWindow, opcoes: OpcoesDoVoo): Promise<void> =>
  voar(janela, 'ida', opcoes)

/** Volta: resolve quando o cartão chegou ao lugar da janela (aí ela reaparece). */
export const flyBackFromIslands = (janela: IslandWindow, opcoes: OpcoesDoVoo): Promise<void> =>
  voar(janela, 'volta', opcoes)

/**
 * `cartao: false` é o voo pelo efeito do KWin (ver `efeito.ts`): a janela de
 * verdade voa, a camada fica escondida, e só a ilha recebe o evento — fecha
 * o painel e quica. Resolve na hora, porque o efeito parte sozinho quando a
 * janela é minimizada ou desminimizada.
 */
function voar(
  janela: IslandWindow,
  sentido: IslandFlight['sentido'],
  opcoes: OpcoesDoVoo,
): Promise<void> {
  const g = janela.geometry
  const win = camada
  if (!g || !win || win.isDestroyed() || !camadaPronta) return Promise.resolve()
  const daJanela = screen.getDisplayMatching({ x: g.x, y: g.y, width: g.width, height: g.height })
  const ilhas = [...janelas.values()].filter((w) => !w.isDestroyed())
  const ilha = ilhas.find((w) => telaDe.get(w) === daJanela.id) ?? ilhas[0]
  if (!ilha) return Promise.resolve()
  const tela = telaDaIlha(ilha)
  const b = win.getBounds()
  const voo: IslandFlight = {
    sentido,
    from: { x: g.x - b.x, y: g.y - b.y, width: g.width, height: g.height },
    mouth: { x: tela.bounds.x + tela.bounds.width / 2 - b.x, y: topo(tela) + bocaY() - b.y },
    title: janela.title,
    appClass: janela.appClass,
    tipo: opcoes.tipo ?? 'janela',
    // Lida AGORA, e não guardada: a camada do fantasma nasce junto com a ilha
    // e viveria com o valor do arranque se a variação viajasse pela URL.
    estilo: currentSettings().island.flight,
  }
  ilha.webContents.send(IPC.islandVoo, voo)
  if (!opcoes.cartao) return Promise.resolve()
  win.webContents.send(IPC.islandVoo, voo)

  clearTimeout(esconderCamada)
  esconderCamada = setTimeout(() => {
    if (!win.isDestroyed()) win.hide()
  }, VOO_MS)

  return new Promise((resolve) => {
    let feito = false
    const pronto = () => {
      if (feito) return
      feito = true
      clearTimeout(relogio)
      prontos.delete(win)
      if (!win.isDestroyed() && !win.isVisible()) {
        // A shape da camada pode ter sido apagada enquanto ela ficou
        // escondida (medido: lida cheia minutos depois de criada, sem evento
        // nenhum); reescrita antes de aparecer, e de novo no `show`.
        void setInputRegion(win, [])
        win.showInactive()
        // Mesma razão da ilha, e a mesma devolução da camada depois.
        void setSkipTaskbar(win, true).then(() => {
          if (!win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver')
        })
      }
      // Ida: o compositor mapeia a camada e o cartão fica opaco (55ms) antes
      // de a janela real sumir; sem isto ela sumia com o fantasma a 30%.
      // Volta: o pedido de revelar a janela sai ANTES de o cartão assentar —
      // a chamada ao KWin leva uns 80ms, e ela precisa estar lá quando o
      // cartão some (medido: com -60ms o cartão ficava parado esperando).
      setTimeout(resolve, sentido === 'ida' ? 90 : VOO_CHEGADA_MS - 100)
    }
    const relogio = setTimeout(pronto, 150)
    prontos.set(win, pronto)
  })
}

/** O renderer desenhou o fantasma: a camada pode aparecer e a janela real sumir. */
export function flightReady(win: BrowserWindow): void {
  prontos.get(win)?.()
}

/**
 * Tela cheia: a ilha some enquanto a janela ativa ocupa a tela inteira — um
 * filme não merece uma pílula por cima. `hide`/`showInactive`, sem destruir:
 * o estado do renderer (gaveta, abas) continua vivo.
 */
/**
 * Esconde as ilhas das telas dadas (ids de `Display`) e mostra as outras.
 *
 * Por TELA, e não todas de uma vez: com um
 * jogo em tela cheia numa tela, a ilha sumia nas duas. A tela do jogo perde a
 * ilha; a outra continua com a dela. Lista vazia = todas à vista.
 */
export function setIslandsHidden(telas: readonly number[]): void {
  for (const win of janelas.values()) {
    if (win.isDestroyed()) continue
    if (telas.includes(telaDe.get(win) ?? -1)) {
      if (win.isVisible()) win.hide()
    } else if (!win.isVisible()) {
      win.showInactive()
      // Voltar da tela cheia é mapear de novo, e o pedido de ficar fora da
      // barra de tarefas é um estado da janela MAPEADA: sem repeti-lo aqui, a
      // ilha reapareceria na barra depois do primeiro vídeo em tela cheia.
      void setSkipTaskbar(win, true).then(() => {
        if (!win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver')
      })
    }
  }
}

/**
 * Foco de teclado sob demanda.
 *
 * A janela nasce `focusable: false` — passar o mouse na pílula não pode
 * roubar o teclado de quem está digitando. Mas a Nota, o lançador e a busca
 * de cópias precisam de teclado. `win.focus()` do Electron NÃO basta: o KWin
 * recusa a ativação (prevenção de roubo de foco — medido em 01/09/2026, a
 * janela ativa não mudou). Quem ativa é o próprio KWin, por script, como as
 * outras ações de janela. Ao sair do campo a janela volta a não ser focável
 * e o KWin devolve o foco à pilha.
 */
export async function setIslandFocus(win: BrowserWindow, on: boolean): Promise<void> {
  if (win.isDestroyed()) return
  if (on) {
    if (!win.isFocused()) await ativarIlha().catch(() => {})
  } else if (win.isFocused()) {
    await devolverFoco().catch(() => {})
  }
}
