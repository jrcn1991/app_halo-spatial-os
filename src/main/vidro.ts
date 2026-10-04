import dbus from 'dbus-next'
import type { BrowserWindow } from 'electron'
import { createClient, type XDisplay } from 'x11'

/**
 * O vidro de verdade: o desfoque do KWin ATRÁS de uma janela nossa — os
 * balões de notificação e a ilha nos estilos de vidro.
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
 * A região é retangular, e as peças têm canto redondo: os cantos viram
 * DEGRAUS de 1px que seguem o raio — sem isso o desfoque apareceria como um
 * quadrado borrado passando da curva. O raio é POR CANTO porque a gota da ilha
 * é colada ao topo da tela: cantos de cima retos, os de baixo redondos.
 *
 * Saiu de `notificacoes/desfoque.ts` em 04/10/2026, quando a ilha passou a
 * pedir o mesmo vidro: um módulo de vidro só, e não a ilha importando dos
 * balões.
 */

const ATOMO = '_KDE_NET_WM_BLUR_BEHIND_REGION'
/** O átomo pré-definido `CARDINAL` do protocolo X. */
const CARDINAL = 6

/**
 * Os raios de uma peça: um número vale para os quatro cantos; o objeto dá um
 * por canto (`te` topo-esquerdo, `td` topo-direito, `bd`, `be`).
 */
export type RaiosDeVidro = number | { te: number; td: number; bd: number; be: number }

export type AreaDeVidro = {
  x: number
  y: number
  width: number
  height: number
  raio: RaiosDeVidro
  /**
   * A curva do canto: 2 é o círculo (o padrão, o `border-radius` comum); 4 é
   * o `corner-shape: squircle` da gota — a superelipse |x|⁴ + |y|⁴ = 1, que
   * entra MENOS no canto que o círculo. Com o círculo no lugar dela o
   * desfoque deixaria uma lasca nítida em cada canto de baixo.
   */
  curva?: number
}

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

/** Quanto o canto de raio `r` recua na linha `i` (contada a partir da borda). */
function recuo(r: number, i: number, curva: number): number {
  if (i >= r) return 0
  const d = (r - i - 0.5) / r
  return Math.round(r - r * (1 - d ** curva) ** (1 / curva))
}

/** Uma peça em faixas: o miolo inteiro e, nos cantos, degraus que seguem o raio. */
function faixas(area: AreaDeVidro): number[] {
  const x = Math.max(0, Math.round(area.x))
  const y = Math.max(0, Math.round(area.y))
  const w = Math.round(area.width)
  const h = Math.round(area.height)
  if (w <= 0 || h <= 0) return []
  const teto = Math.floor(Math.min(w, h) / 2)
  const limite = (v: number) => Math.max(0, Math.min(Math.round(v), teto))
  const r =
    typeof area.raio === 'number'
      ? { te: area.raio, td: area.raio, bd: area.raio, be: area.raio }
      : area.raio
  const te = limite(r.te)
  const td = limite(r.td)
  const bd = limite(r.bd)
  const be = limite(r.be)
  const curva = area.curva ?? 2
  const saida: number[] = []
  const linha = (yy: number, esq: number, dir: number) => {
    if (w - esq - dir > 0) saida.push(x + esq, yy, w - esq - dir, 1)
  }
  const cima = Math.max(te, td)
  const baixo = Math.max(be, bd)
  for (let i = 0; i < cima; i++) linha(y + i, recuo(te, i, curva), recuo(td, i, curva))
  for (let i = 0; i < baixo; i++) {
    linha(y + h - 1 - i, recuo(be, i, curva), recuo(bd, i, curva))
  }
  if (h - cima - baixo > 0) saida.push(x, y + cima, w, h - cima - baixo)
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
 * Por isso a resposta decide o piso do balão (ver `notificacoes.css`) e o da
 * ilha de vidro (`data-desfoque`, em `island.css`).
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
