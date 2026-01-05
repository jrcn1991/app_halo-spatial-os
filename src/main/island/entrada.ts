import type { BrowserWindow } from 'electron'
import { createClient, type XDisplay } from 'x11'

/**
 * A região de ENTRADA da janela da ilha: onde o mouse vale.
 *
 * A janela tem sempre o tamanho aberto (532×470, quase toda transparente), e
 * o que impede essa faixa de engolir os cliques do que está embaixo é a shape
 * de entrada do X11 (`XShape`, kind `Input`): fora dos retângulos que ela
 * lista, o ponteiro atravessa a janela e cai em quem está atrás. O Xwayland
 * traduz essa shape na região de entrada da superfície Wayland, e é por ela
 * que o KWin decide quem recebe o ponteiro — hover, clique e solte de arquivo,
 * tudo pela geometria, sem ninguém precisar sondar onde o cursor está.
 *
 * É a mesma propriedade que o `setIgnoreMouseEvents` do Electron mexe (ele
 * escreve um retângulo de 1×1 para ignorar e apaga a shape para aceitar). O
 * problema, medido em 02/09/2026: o Chromium APAGA a shape de entrada por
 * conta própria — ao mapear a janela e a cada mudança de bounds — sem avisar
 * ninguém. As duas ilhas nasciam com `setIgnoreMouseEvents(true)` e, lidas
 * pelo X logo depois de aparecer, tinham a shape cheia (`[[0,0,532,470]]`):
 * a faixa inteira engolindo cliques até o cursor entrar e sair da pílula uma
 * vez, porque só a MUDANÇA de estado fazia o main chamar o Electron de novo.
 * Era isso que deixava uma aba do navegador, embaixo da ilha fechada, inclicável.
 *
 * Por isso a região é escrita daqui, direto no X, e REAPLICADA: a cada
 * retângulo diferente que o renderer manda, ao mostrar, mover ou
 * redimensionar a janela (com repetições nos instantes seguintes, porque o
 * apagamento chega depois do evento), e a cada 500ms de qualquer jeito. Um
 * apagamento do Chromium dura no máximo isso. Lido com a extensão de shape
 * pelo X, o apagamento medido veio ~120ms depois de a janela aparecer, uma
 * vez só — reaparecer depois de esconder (tela cheia) não apagou nada.
 */

type Shape = {
  Kind: { Input: number }
  Op: { Set: number }
  Ordering: { Unsorted: number }
  Rectangles: (
    op: number,
    kind: number,
    window: number,
    x: number,
    y: number,
    rectangles: [number, number, number, number][],
    ordering?: number,
  ) => void
}

/** Uma conexão só, aberta na primeira vez e reaproveitada. */
let conexao: Promise<{ display: XDisplay; shape: Shape }> | null = null

function abrir(): Promise<{ display: XDisplay; shape: Shape }> {
  conexao ??= new Promise<{ display: XDisplay; shape: Shape }>((resolve, reject) => {
    createClient((erro, display) => {
      if (erro || !display) return reject(erro ?? new Error('sem conexão com o servidor X'))
      // Um erro de protocolo (janela que já morreu, por exemplo) não pode
      // derrubar o processo: a conexão emite `error` e alguém precisa ouvir.
      display.client.on('error', () => {})
      display.client.require<Shape>('shape', (e, ext) =>
        e ? reject(e) : resolve({ display, shape: ext }),
      )
    })
  }).catch((erro: unknown) => {
    // Uma falha não pode envenenar as tentativas seguintes.
    conexao = null
    throw erro
  })
  return conexao
}

/** O identificador X da janela — só faz sentido no X11 (ver `desktop-layer.ts`). */
function xid(win: BrowserWindow): number | null {
  if (win.isDestroyed()) return null
  const handle = win.getNativeWindowHandle()
  if (handle.length < 4) return null
  const id = handle.readUInt32LE(0)
  return id === 0 ? null : id
}

/**
 * Escreve a região de entrada da janela: só dentro destes retângulos
 * (relativos à janela) o mouse chega nela. Lista vazia = transparente ao
 * mouse em toda a janela. Fora do X11 não há o que escrever, e a função
 * devolve `false` sem reclamar — a ilha vive sem isso, como já vivia.
 */
export async function setInputRegion(
  win: BrowserWindow,
  retangulos: Electron.Rectangle[],
): Promise<boolean> {
  const id = xid(win)
  if (id === null) return false
  const b = win.getBounds()
  const rects: [number, number, number, number][] = []
  for (const r of retangulos) {
    // O protocolo pede inteiros; as bordas são presas à janela, porque um
    // retângulo que sai dela (a folga de 6px da pílula colada na borda) não
    // muda nada e um valor negativo em `uint16` viraria lixo.
    const x0 = Math.max(0, Math.floor(r.x))
    const y0 = Math.max(0, Math.floor(r.y))
    const x1 = Math.min(b.width, Math.ceil(r.x + r.width))
    const y1 = Math.min(b.height, Math.ceil(r.y + r.height))
    if (x1 > x0 && y1 > y0) rects.push([x0, y0, x1 - x0, y1 - y0])
  }
  try {
    const { shape } = await abrir()
    if (win.isDestroyed()) return false
    shape.Rectangles(shape.Op.Set, shape.Kind.Input, id, 0, 0, rects, shape.Ordering.Unsorted)
    return true
  } catch {
    return false
  }
}
