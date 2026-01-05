import dbus from 'dbus-next'
import type { BrowserWindow } from 'electron'
import { createClient, type XDisplay } from 'x11'

/**
 * O vidro de verdade: o desfoque do KWin ATRÁS dos balões.
 *
 * O `backdrop-filter` do CSS não serve — medido no lançador (05/09/2026), o
 * Chromium só desfoca o conteúdo da própria página, e o que está atrás da
 * janela passa nítido. Quem enxerga o que está atrás é o compositor, e o KWin
 * tem um pedido para isso: a janela declara no X a propriedade
 * `_KDE_NET_WM_BLUR_BEHIND_REGION` (retângulos em CARDINAL: x, y, largura,
 * altura, …), e o efeito de desfoque desfoca o que fica atrás dela. É o que o
 * painel do Plasma e o Konsole fazem.
 *
 * MEDIDO em 12/09/2026, nesta sessão Wayland (a janela é do Xwayland): com a
 * propriedade posta à mão pelo `xprop` numa faixa da janela dos avisos, a
 * coluna em volta do balão saiu com o papel de parede desfocado, e as árvores
 * ao lado continuaram nítidas.
 *
 * Isto NÃO é escrever fora do app: a propriedade é da NOSSA janela, some com
 * ela, e nada é gravado na configuração do KDE.
 *
 * A região é retangular, e o balão tem canto redondo: os cantos viram DEGRAUS
 * de 1px que seguem o raio — sem isso o desfoque apareceria como um quadrado
 * borrado passando da curva do balão.
 */

const ATOMO = '_KDE_NET_WM_BLUR_BEHIND_REGION'
/** O átomo pré-definido `CARDINAL` do protocolo X. */
const CARDINAL = 6

export type AreaDeVidro = { x: number; y: number; width: number; height: number; raio: number }

type Cliente = XDisplay['client'] & {
  ChangeProperty(
    mode: number,
    wid: number,
    atom: number,
    type: number,
    units: number,
    data: number[],
  ): void
  DeleteProperty(wid: number, atom: number): void
}

/** Uma conexão só, aberta na primeira vez e reaproveitada (como `island/entrada.ts`). */
let conexao: Promise<{ cliente: Cliente; atomo: number }> | null = null

function abrir(): Promise<{ cliente: Cliente; atomo: number }> {
  conexao ??= new Promise<{ cliente: Cliente; atomo: number }>((resolve, reject) => {
    createClient((erro, display) => {
      if (erro || !display) return reject(erro ?? new Error('sem conexão com o servidor X'))
      // Um erro de protocolo (janela que já morreu) não pode derrubar o main.
      display.client.on('error', () => {})
      display.client.InternAtom(false, ATOMO, (e, atomo) =>
        e ? reject(e) : resolve({ cliente: display.client as Cliente, atomo }),
      )
    })
  }).catch((erro: unknown) => {
    conexao = null
    throw erro
  })
  return conexao
}

function xid(win: BrowserWindow): number | null {
  if (win.isDestroyed()) return null
  const handle = win.getNativeWindowHandle()
  if (handle.length < 4) return null
  const id = handle.readUInt32LE(0)
  return id === 0 ? null : id
}

/** Um balão em faixas: o miolo inteiro e, nos cantos, degraus que seguem o raio. */
function faixas(area: AreaDeVidro): number[] {
  const x = Math.max(0, Math.round(area.x))
  const y = Math.max(0, Math.round(area.y))
  const w = Math.round(area.width)
  const h = Math.round(area.height)
  if (w <= 0 || h <= 0) return []
  const r = Math.max(0, Math.min(Math.round(area.raio), Math.floor(Math.min(w, h) / 2)))
  const saida: number[] = []
  for (let i = 0; i < r; i++) {
    const dy = r - i - 0.5
    const recuo = Math.round(r - Math.sqrt(r * r - dy * dy))
    saida.push(x + recuo, y + i, w - 2 * recuo, 1)
    saida.push(x + recuo, y + h - 1 - i, w - 2 * recuo, 1)
  }
  saida.push(x, y + r, w, h - 2 * r)
  return saida
}

/**
 * Pede o desfoque atrás destas áreas (relativas à janela). Lista vazia APAGA
 * a propriedade — e não a deixa vazia: vazia, para o KWin, quer dizer "a janela
 * inteira", e a coluna toda viraria vidro fosco sobre a tela.
 */
export async function desfocarAtras(win: BrowserWindow, areas: AreaDeVidro[]): Promise<boolean> {
  const id = xid(win)
  if (id === null) return false
  try {
    const { cliente, atomo } = await abrir()
    if (win.isDestroyed()) return false
    const dados = areas.flatMap(faixas)
    if (dados.length === 0) cliente.DeleteProperty(id, atomo)
    else cliente.ChangeProperty(0, id, atomo, CARDINAL, 32, dados)
    return true
  } catch {
    return false
  }
}

/**
 * O efeito de desfoque do KWin está carregado? Sem ele o pedido acima não faz
 * nada — e um balão de vidro aberto sem desfoque atrás é texto sobre texto.
 * Por isso a resposta decide o piso do balão (ver `notificacoes.css`).
 */
export async function kwinDesfoca(): Promise<boolean> {
  const bus = dbus.sessionBus()
  bus.on('error', () => {})
  try {
    const efeitos = (await bus.getProxyObject('org.kde.KWin', '/Effects')).getInterface(
      'org.kde.kwin.Effects',
    )
    const carregado = efeitos.isEffectLoaded as ((nome: string) => Promise<boolean>) | undefined
    return carregado ? Boolean(await carregado.call(efeitos, 'blur')) : false
  } catch {
    return false
  } finally {
    bus.disconnect()
  }
}
