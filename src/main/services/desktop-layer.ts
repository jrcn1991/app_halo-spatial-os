import type { BrowserWindow } from 'electron'
import { createClient, type XDisplay } from 'x11'

/**
 * Camada do desktop: a janela fica sobre o papel de parede e nunca cobre outra.
 *
 * O mecanismo é o `_NET_WM_STATE_BELOW` do EWMH, pedido por ClientMessage à
 * janela raiz — o mesmo caminho de `wmctrl -b add,below`. A escolha veio de
 * medir as alternativas nesta máquina (KDE/KWin, sessão Wayland):
 *
 * - `type: 'desktop'` (`_NET_WM_WINDOW_TYPE_DESKTOP`): o KWin põe a janela
 *   abaixo do desktop do Plasma e ela some da tela — medido, 0% de pixel
 *   visível.
 * - `xprop -set _NET_WM_STATE`: grava a propriedade, mas em janela mapeada o
 *   dono dela é o gerenciador, que ignora a escrita — medido, o empilhamento
 *   não muda (e o `_NET_WM_STATE_FOCUSED` some, sinal de que ninguém releu).
 * - Regra de janela do KWin: funciona, mas escreve em `~/.config/kwinrulesrc`,
 *   fora do app, e só existe no KDE.
 *
 * O ClientMessage não deixa rastro: nada é escrito na configuração do usuário,
 * o efeito morre com a janela e vale em qualquer gerenciador que siga o EWMH.
 *
 * Só existe no X11 — no Wayland um app não pode escolher sua camada nem saber
 * onde está. Por isso o main se relança com `--ozone-platform=x11` quando o
 * modo está ligado (ver `src/main/index.ts`).
 */

/** `_NET_WM_STATE` — ver a spec do EWMH, seção "Application Window Properties". */
const REMOVE = 0
const ADD = 1
/** Origem do pedido: 2 = "aplicação direta", o que pagers e wmctrl usam. */
const SOURCE_PAGER = 2
/** SubstructureRedirect | SubstructureNotify: o que o gerenciador escuta. */
const SUBSTRUCTURE = (1 << 20) | (1 << 19)
/** Código do evento ClientMessage no protocolo X. */
const CLIENT_MESSAGE = 33

/** Uma conexão só, aberta na primeira vez e reaproveitada. */
let connection: Promise<XDisplay> | null = null

function display(): Promise<XDisplay> {
  connection ??= new Promise<XDisplay>((resolve, reject) => {
    createClient((error, value) => {
      if (error || !value) reject(error ?? new Error('sem conexão com o servidor X'))
      else resolve(value)
    })
  }).catch((error: unknown) => {
    // Uma falha não pode envenenar as tentativas seguintes.
    connection = null
    throw error
  })
  return connection
}

/**
 * O identificador X da janela.
 *
 * Só faz sentido no X11: no Wayland o Electron devolve um ponteiro que não é
 * um XID, mas também não é zero — por isso quem decide se estamos no X11 é
 * `isX11()`, e não este valor.
 */
function windowId(win: BrowserWindow): number | null {
  const handle = win.getNativeWindowHandle()
  if (handle.length < 4) return null
  const id = handle.readUInt32LE(0)
  return id === 0 ? null : id
}

/**
 * Evento ClientMessage de 32 bytes, no formato que o EWMH espera.
 *
 * `segunda` existe porque a spec permite DUAS propriedades por mensagem
 * (`data[1]` e `data[2]`) — é assim que "sair da barra de tarefas e do pager"
 * vira um pedido só, e não dois que o gerenciador poderia atender pela metade.
 */
function stateEvent(
  window: number,
  state: number,
  action: number,
  property: number,
  segunda = 0,
): Buffer {
  const event = Buffer.alloc(32)
  event.writeUInt8(CLIENT_MESSAGE, 0)
  event.writeUInt8(32, 1) // formato: 32 bits por item
  event.writeUInt32LE(window, 4)
  event.writeUInt32LE(state, 8)
  event.writeUInt32LE(action, 12) // data[0]
  event.writeUInt32LE(property, 16) // data[1]
  event.writeUInt32LE(segunda, 20) // data[2]
  event.writeUInt32LE(SOURCE_PAGER, 24) // data[3]
  return event
}

function atom(x: XDisplay['client'], name: string): Promise<number> {
  return new Promise((resolve, reject) => {
    x.InternAtom(false, name, (error, value) => {
      if (error) reject(error)
      else resolve(value)
    })
  })
}

/** A flag que o app passa a si mesmo ao se relançar. */
export const X11_FLAG = '--ozone-platform=x11'

/**
 * Se o app está rodando em X11.
 *
 * A plataforma gráfica é escolhida antes de qualquer JS rodar, então isto se
 * lê dos argumentos e do ambiente: `app.commandLine.appendSwitch` não muda a
 * escolha — medido, só o argumento de linha de comando muda.
 */
export function isX11(): boolean {
  return process.env.XDG_SESSION_TYPE === 'x11' || process.argv.includes(X11_FLAG)
}

/**
 * Liga ou desliga a camada do desktop na janela.
 *
 * Devolve se conseguiu aplicar agora. `false` não é erro: fora do X11 não há
 * o que aplicar, e a tela de configurações usa isso para dizer ao usuário que
 * o app precisa reabrir.
 */
export async function setDesktopLayer(win: BrowserWindow, on: boolean): Promise<boolean> {
  // A checagem vem antes de tudo porque numa sessão Wayland o XWayland está
  // no ar: a conexão X abriria, o evento sairia para um identificador que não
  // existe e nada falharia — o app diria que aplicou sem ter aplicado.
  if (!isX11()) return false

  const id = windowId(win)
  if (id === null) return false

  try {
    const { client, screen } = await display()
    const root = screen[0]?.root
    if (root === undefined) return false

    const [state, below] = await Promise.all([
      atom(client, '_NET_WM_STATE'),
      atom(client, '_NET_WM_STATE_BELOW'),
    ])
    client.SendEvent(root, 0, SUBSTRUCTURE, stateEvent(id, state, on ? ADD : REMOVE, below))
    return true
  } catch (error) {
    console.warn(`[halo] não consegui mudar a camada da janela: ${(error as Error).message}`)
    return false
  }
}

/**
 * Quem pediu para ficar fora da barra. Ver `reaplicarSkipTaskbar`.
 *
 * `WeakSet` e não um booleano: quem sabe o que a janela quer é a janela, e uma
 * variável de módulo se perderia se um dia houvesse mais de uma.
 */
const semBarra = new WeakSet<BrowserWindow>()

/**
 * Reaplica o que a janela já pedia.
 *
 * O voo da ilha DEVOLVE a barra de tarefas ao trazer o Halo de volta
 * (`liberarBarra`, em `island/kwin.ts`) — ele foi escrito quando a janela
 * morava na barra, e desfaz o `_NET_WM_STATE_SKIP_TASKBAR` junto com o resto.
 * MEDIDO em 06/09/2026: esconder e trazer pela bandeja uma vez bastava para o
 * Halo reaparecer na barra de tarefas, e nada avisava. Esta é a linha que o
 * põe de volta no lugar; sem ela, "apenas no tray" duraria um ciclo.
 */
export function reaplicarSkipTaskbar(win: BrowserWindow): void {
  if (semBarra.has(win)) void setSkipTaskbar(win, true)
}

/**
 * Registra a intenção sem mandar o pedido — para a janela que nasce escondida.
 *
 * `setSkipTaskbar` só vale com a janela MAPEADA, e a que nasce recolhida na
 * ilha (`desktop.startHidden`) nunca foi mostrada: não há o que pedir ainda.
 * Mas quem a tira da barra quando ela finalmente aparece é
 * `reaplicarSkipTaskbar`, e ele só age sobre quem JÁ PEDIU. Sem esta linha o
 * Halo reapareceria na barra de tarefas na primeira vez que fosse chamado —
 * o mesmo estrago de 06/09/2026, por outro caminho.
 */
export function marcarForaDaBarra(win: BrowserWindow): void {
  semBarra.add(win)
}

/**
 * Tira (ou devolve) a janela da barra de tarefas e do pager.
 *
 * O `skipTaskbar` do Electron **não existe no Linux** — a opção do
 * `BrowserWindow` e o `setSkipTaskbar()` são documentados para Windows e
 * macOS. MEDIDO em 06/09/2026: com `skipTaskbar: true` na criação, o
 * `_NET_WM_STATE` da janela não trazia `_NET_WM_STATE_SKIP_TASKBAR`; com o
 * ClientMessage daqui, traz. Nada falhava e nada avisava — o pedido
 * simplesmente não saía.
 *
 * É o mesmo caminho de `setDesktopLayer`, e vale a mesma advertência: só com a
 * janela já MAPEADA. Antes disso o gerenciador descarta o pedido.
 *
 * O pager vai junto: uma janela que vive na camada do papel de parede, em
 * todas as áreas de trabalho, aparecendo como um retângulo no seletor de
 * áreas seria ruído pelo mesmo motivo que ela não cabe na barra.
 */
export async function setSkipTaskbar(win: BrowserWindow, on: boolean): Promise<boolean> {
  if (on) semBarra.add(win)
  else semBarra.delete(win)
  if (!isX11()) return false

  const id = windowId(win)
  if (id === null) return false

  try {
    const { client, screen } = await display()
    const root = screen[0]?.root
    if (root === undefined) return false

    const [state, semBarra, semPager] = await Promise.all([
      atom(client, '_NET_WM_STATE'),
      atom(client, '_NET_WM_STATE_SKIP_TASKBAR'),
      atom(client, '_NET_WM_STATE_SKIP_PAGER'),
    ])
    client.SendEvent(
      root,
      0,
      SUBSTRUCTURE,
      stateEvent(id, state, on ? ADD : REMOVE, semBarra, semPager),
    )
    return true
  } catch (error) {
    console.warn(`[halo] não consegui tirar a janela da barra: ${(error as Error).message}`)
    return false
  }
}
