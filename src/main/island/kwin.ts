import { randomBytes } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC } from '@shared/ipc-contract'
import type { IslandWindow } from '@shared/island'
import dbus from 'dbus-next'
import { app } from 'electron'
import { broadcastToIslands } from './window'

/**
 * Janelas do computador, pelo scripting do KWin.
 *
 * No Wayland do KDE um cliente comum NÃO enxerga as janelas dos outros — o
 * protocolo `org_kde_plasma_window_management` é só do plasmashell (medido no
 * caso da barra superior; ver a memória do projeto). O que o KWin expõe a
 * qualquer processo é o **scripting por D-Bus**: `loadScript` carrega um
 * script que roda DENTRO do compositor, com acesso pleno a `workspace`.
 *
 * O caminho de volta é o script chamar `callDBus` para um nome que este
 * processo possui (`com.halo.Ilha`). Tudo isso foi medido nesta máquina em
 * 31/08/2026: listar janelas, minimizar, restaurar e ativar funcionaram de
 * ponta a ponta antes de este arquivo existir.
 *
 * Cada chamada é um ciclo completo — escrever o script, carregar, rodar,
 * descarregar, apagar — porque script residente no compositor sobreviveria ao
 * app e ficaria órfão.
 */

const TIMEOUT_MS = 4000
/** As janelas guardadas na gaveta. Memória do main: minimizar não sobrevive ao reboot. */
const guardadas: IslandWindow[] = []

const esperas = new Map<string, (json: string) => void>()
let busPronto: Promise<void> | null = null

/** Quem ouve os eventos do vigia (tela cheia, atalho). Ver `iniciarVigia`. */
let ouvinteDoVigia: ((evento: EventoDoVigia) => void) | null = null

export type EventoDoVigia =
  /** As telas (geometria da saída, no espaço do KWin) com janela em tela cheia. */
  | { tipo: 'tela-cheia'; telas: { x: number; y: number; width: number; height: number }[] }
  | { tipo: 'atalho-guardar' }
  | { tipo: 'atalho-halo' }
  | { tipo: 'atalho-lancador' }
  /** Alguma janela abriu, fechou, mudou de título ou de foco: a lista mudou. */
  | { tipo: 'janelas' }

/** Recebe o `callDBus` que o script do KWin faz de volta. */
class Entrega extends dbus.interface.Interface {
  entrega(nonce: string, json: string): void {
    if (nonce === 'vigia') {
      try {
        ouvinteDoVigia?.(JSON.parse(json) as EventoDoVigia)
      } catch {
        // Um evento mal formado do próprio script: ignora, não derruba.
      }
      return
    }
    const resolve = esperas.get(nonce)
    if (resolve) resolve(json)
  }
}
Entrega.configureMembers({
  methods: { entrega: { inSignature: 'ss', outSignature: '' } },
})

function prepararBus(): Promise<void> {
  busPronto ??= (async () => {
    const bus = dbus.sessionBus()
    await bus.requestName('com.halo.Ilha', 0)
    bus.export('/ilha', new Entrega('com.halo.Ilha'))
  })()
  return busPronto
}

export async function qdbus(...args: string[]): Promise<string> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)('qdbus6', args, { timeout: TIMEOUT_MS })
  return stdout
}

/**
 * Roda um trecho de script dentro do KWin e devolve o JSON que ele entregar.
 *
 * O trecho recebe duas funções prontas: `entregar(valor)` — manda o resultado
 * para cá — e `janela(id)` — acha uma janela pelo `internalId`.
 */
async function rodarNoKWin(trecho: string): Promise<string> {
  await prepararBus()
  const nonce = randomBytes(8).toString('hex')
  const plugin = `halo-ilha-${nonce}`
  const arquivo = join(app.getPath('temp'), `${plugin}.js`)

  const codigo = `
function entregar(valor) {
  callDBus('com.halo.Ilha', '/ilha', 'com.halo.Ilha', 'entrega', ${JSON.stringify(nonce)}, JSON.stringify(valor))
}
function janela(id) {
  var lista = workspace.windowList()
  for (var i = 0; i < lista.length; i++) if (String(lista[i].internalId) === id) return lista[i]
  return null
}
${trecho}
`
  await writeFile(arquivo, codigo, 'utf8')

  try {
    const resposta = new Promise<string>((resolve, reject) => {
      const relogio = setTimeout(() => {
        esperas.delete(nonce)
        reject(new Error('o KWin não respondeu ao script'))
      }, TIMEOUT_MS)
      esperas.set(nonce, (json) => {
        clearTimeout(relogio)
        esperas.delete(nonce)
        resolve(json)
      })
    })

    await qdbus('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting.loadScript', arquivo, plugin)
    await qdbus('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting.start')
    return await resposta
  } finally {
    void qdbus('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting.unloadScript', plugin).catch(
      () => '',
    )
    void unlink(arquivo).catch(() => {})
  }
}

/** O pedaço de script que reconhece a janela da ilha. */
const EH_ILHA = `
function ehIlha(w) {
  var c = String(w.caption)
  return String(w.resourceClass) === 'halo-spatial-os' && (c === '' || c.indexOf('Ilha') >= 0)
}
`

/**
 * A "janela ativa" para o gesto de guardar. Depois de um clique no painel a
 * ativa É a ilha (janela `dock`, sem `normalWindow`), e "guardar a ativa"
 * falhava com "nenhuma janela". Aí vale a primeira janela normal da pilha,
 * de cima para baixo, na área de trabalho atual — a que o usuário via por
 * baixo da ilha.
 */
const ATIVA = `
var alvo = workspace.activeWindow
if (!alvo || !alvo.normalWindow || alvo.skipTaskbar) {
  alvo = null
  var pilha = workspace.stackingOrder
  for (var i = pilha.length - 1; i >= 0; i--) {
    var w = pilha[i]
    if (w.normalWindow && !w.minimized && !w.skipTaskbar && w.onCurrentDesktop !== false) { alvo = w; break }
  }
}
`

/** O pedaço de script que resume uma janela para o formato da ilha. */
const RESUMO = `
function resumo(w) {
  var g = w.frameGeometry
  return {
    id: String(w.internalId),
    title: String(w.caption),
    appClass: String(w.resourceClass),
    minimized: !!w.minimized,
    active: workspace.activeWindow === w,
    geometry: { x: Math.round(g.x), y: Math.round(g.y), width: Math.round(g.width), height: Math.round(g.height) },
  }
}
`

/* ——— Cache da lista ————————————————————————————————————
 *
 * O instantâneo da ilha é refeito a cada 2s; carregar um script no compositor
 * nesse ritmo seria abuso. A lista vale por alguns segundos — janela aberta ou
 * fechada aparece no pulso seguinte ao vencimento, e isso basta.
 */
/* 60s e não 10: o vigia avisa quando uma janela abre, fecha, muda de título
   ou de foco (`invalidarJanelas`), então a lista só é refeita quando algo
   mudou — o prazo é a rede de segurança (DESEMPENHO.md, P1-7). */
const CACHE_MS = 60_000
let cache: { at: number; janelas: IslandWindow[] } | null = null

/** O vigia disse que a lista de janelas mudou. */
export function invalidarJanelas(): void {
  cache = null
}

export async function listarJanelas(): Promise<IslandWindow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.janelas
  const json = await rodarNoKWin(`${RESUMO}${EH_ILHA}
var todas = workspace.windowList()
var vistas = []
for (var i = 0; i < todas.length; i++) {
  var w = todas[i]
  // A própria ilha não entra (sem título, ou "Halo · Ilha").
  if (!w.normalWindow || w.skipTaskbar || !String(w.caption) || ehIlha(w)) continue
  vistas.push(resumo(w))
}
entregar(vistas)
`)
  const janelas = JSON.parse(json) as IslandWindow[]
  cache = { at: Date.now(), janelas }
  return janelas
}

function invalidarCache(): void {
  cache = null
}

export function janelasGuardadas(): IslandWindow[] {
  return [...guardadas]
}

function avisarGuardadas(): void {
  broadcastToIslands(IPC.islandJanelasGuardadas, janelasGuardadas())
}

/**
 * Só lê a janela (com a geometria), sem mexer nela — o primeiro passo do voo:
 * o fantasma precisa ser desenhado ANTES de a janela real sumir.
 */
export async function lerJanela(id: string | null): Promise<IslandWindow> {
  const acha = id ? `var alvo = janela(${JSON.stringify(id)})` : ATIVA
  const json = await rodarNoKWin(`${RESUMO}
${acha}
if (!alvo || !alvo.normalWindow || alvo.skipTaskbar) entregar({ erro: 'nenhuma janela para guardar' })
else entregar(resumo(alvo))
`)
  const resultado = JSON.parse(json) as IslandWindow | { erro: string }
  if ('erro' in resultado) throw new Error(resultado.erro)
  return resultado
}

/**
 * Minimiza a janela já lida (o segundo passo do voo) e a guarda na gaveta.
 * A opacidade vai a zero antes: o efeito de minimizar do KWin roda sobre uma
 * janela invisível, e quem conta a história é o fantasma. Guardada, a janela
 * SAI da barra de tarefas e do Alt+Tab (`skipTaskbar`, `skipSwitcher`): ela
 * está na gaveta, e só a gaveta a devolve — o que o usuário pediu. Por isso
 * `soltarGuardadas` ao fechar o app: sem o Halo ninguém a traria de volta.
 */
export async function esconderEMinimizar(
  janela: IslandWindow,
  opcoes: { invisivel: boolean } = { invisivel: true },
): Promise<void> {
  // Com o efeito do KWin de pé a janela voa VISÍVEL — é o efeito quem a
  // apaga ao chegar; a opacidade zero é só para o cartão da camada.
  const json = await rodarNoKWin(`
var alvo = janela(${JSON.stringify(janela.id)})
if (!alvo) entregar({ erro: 'a janela não existe mais' })
else {
  ${opcoes.invisivel ? 'try { alvo.opacity = 0 } catch (e) {}' : ''}
  try { alvo.skipTaskbar = true; alvo.skipSwitcher = true } catch (e) {}
  alvo.minimized = true
  entregar({ ok: true })
}
`)
  const resultado = JSON.parse(json) as { erro?: string }
  if (resultado.erro) throw new Error(resultado.erro)
  invalidarCache()
  if (!guardadas.some((j) => j.id === janela.id)) {
    guardadas.push({ ...janela, minimized: true, active: false })
  }
  avisarGuardadas()
}

/* ——— A janela do próprio Halo ————————————————————————————
 *
 * Ela não é uma "janela guardada": não entra em `guardadas`, não aparece na
 * aba Janelas e o quem-a-traz-de-volta é o Meta+Espaço, não a gaveta (ver
 * `island/halo.ts`). Mas o caminho para o EFEITO DO KWIN é o mesmo — marcar
 * com `skipSwitcher` e minimizar —, e é por ele que a janela DE VERDADE voa,
 * com o conteúdo dela, em vez de um cartão preto.
 *
 * Achada pela classe mais o título: `ehIlha` já usa a classe para separar as
 * janelas da ilha, e a principal é a que NÃO tem "Ilha" no título.
 */
const EH_HALO = `
function ehHalo(w) {
  return String(w.resourceClass) === 'halo-spatial-os' && String(w.caption) === 'Halo'
}
`

/** O `internalId` da janela principal, ou vazio se ela não estiver na pilha. */
export async function idDaJanelaDoHalo(): Promise<string> {
  const json = await rodarNoKWin(`${EH_HALO}
var lista = workspace.windowList()
var achado = ''
for (var i = 0; i < lista.length && !achado; i++) {
  if (ehHalo(lista[i])) achado = String(lista[i].internalId)
}
entregar({ id: achado })
`)
  return (JSON.parse(json) as { id?: string }).id ?? ''
}

/**
 * Marca e minimiza a janela do app, para o efeito do KWin levá-la à pílula.
 *
 * VISÍVEL, ao contrário de `esconderEMinimizar`: é o efeito quem a apaga ao
 * chegar, e opacidade zero aqui faria a janela sumir antes de voar.
 */
export async function recolherHaloNoKWin(id: string): Promise<void> {
  const json = await rodarNoKWin(`
var alvo = janela(${JSON.stringify(id)})
if (!alvo) entregar({ erro: 'a janela do Halo não está na pilha' })
else {
  try { alvo.skipTaskbar = true; alvo.skipSwitcher = true } catch (e) {}
  alvo.minimized = true
  entregar({ ok: true })
}
`)
  const resultado = JSON.parse(json) as { erro?: string }
  if (resultado.erro) throw new Error(resultado.erro)
  invalidarCache()
}

/**
 * Desminimiza a janela do app INVISÍVEL, e sem ativá-la.
 *
 * É o `prepararVolta` das janelas guardadas menos o `workspace.activeWindow`:
 * o Halo é um widget de área de trabalho, e voltar da ilha não pode tirar o
 * teclado de quem está digitando. Quem revela é `mostrarJanela`, depois — e é
 * a opacidade indo a 1 que dispara o voo de volta no efeito.
 */
export async function prepararVoltaDoHalo(id: string): Promise<void> {
  const json = await rodarNoKWin(`
var alvo = janela(${JSON.stringify(id)})
if (!alvo) entregar({ erro: 'a janela do Halo não está na pilha' })
else {
  try { alvo.opacity = 0 } catch (e) {}
  alvo.minimized = false
  entregar({ ok: true })
}
`)
  const resultado = JSON.parse(json) as { erro?: string }
  if (resultado.erro) throw new Error(resultado.erro)
  invalidarCache()
}

/** Ativa a janela da própria ilha, para ela receber teclado (ver `setIslandFocus`). */
export async function ativarIlha(): Promise<void> {
  const json = await rodarNoKWin(`${EH_ILHA}
var lista = workspace.windowList()
var achou = false
for (var i = 0; i < lista.length && !achou; i++) {
  if (ehIlha(lista[i])) { workspace.activeWindow = lista[i]; achou = true }
}
entregar(achou ? { ok: true } : { erro: 'ilha não encontrada' })
`)
  const resultado = JSON.parse(json) as { erro?: string }
  if (resultado.erro) throw new Error(resultado.erro)
}

/**
 * Devolve o foco: ativa a janela normal mais alta na pilha que não seja a
 * ilha. `blur()` do Electron não devolve nada no X11 (medido) — quem decide
 * o foco é o KWin, e a pilha dele é a memória de "quem estava antes".
 */
export async function devolverFoco(): Promise<void> {
  await rodarNoKWin(`${EH_ILHA}
var pilha = workspace.stackingOrder
for (var i = pilha.length - 1; i >= 0; i--) {
  var w = pilha[i]
  if (!w || ehIlha(w) || !w.normalWindow || w.minimized || w.skipTaskbar) continue
  workspace.activeWindow = w
  break
}
entregar({ ok: true })
`)
}

/**
 * O primeiro passo da volta: tira da barra, desminimiza e ativa, mas AINDA
 * INVISÍVEL (opacidade 0). O efeito de desminimizar do KWin roda sem que se
 * veja — senão a janela saía da barra de tarefas com a animação dele, em vez
 * de sair da pílula com o cartão (01/09/2026). `mostrarJanela` revela quando
 * o cartão assenta. Sai da gaveta aqui: a partir de agora ela é do usuário.
 */
export async function prepararVolta(id: string): Promise<void> {
  // Desminimiza INVISÍVEL e ainda fora da barra: o efeito de minimizar do
  // sistema roda sobre uma janela de opacidade 0 (ninguém vê), e é
  // `mostrarJanela`, depois, que revela — com o cartão, por baixo dele; com
  // o efeito do KWin, é a opacidade 1 que dispara o voo de volta. A barra
  // volta em `liberarBarra`, mais tarde.
  const json = await rodarNoKWin(`
var alvo = janela(${JSON.stringify(id)})
if (!alvo) {
  entregar({ erro: 'a janela não existe mais' })
} else {
  try { alvo.opacity = 0 } catch (e) {}
  alvo.minimized = false
  workspace.activeWindow = alvo
  entregar({ ok: true })
}
`)
  const resultado = JSON.parse(json) as { erro?: string }
  const posicao = guardadas.findIndex((j) => j.id === id)
  if (posicao >= 0) guardadas.splice(posicao, 1)
  invalidarCache()
  avisarGuardadas()
  if (resultado.erro) throw new Error(resultado.erro)
}

/** A janela devolvida volta à barra de tarefas e ao Alt+Tab. */
export async function liberarBarra(id: string): Promise<void> {
  await rodarNoKWin(`
var alvo = janela(${JSON.stringify(id)})
if (alvo) { try { alvo.skipTaskbar = false; alvo.skipSwitcher = false } catch (e) {} }
entregar({ ok: true })
`)
}

/** O último passo da volta com cartão: a janela reaparece (opacidade 1) sob ele. */
export async function mostrarJanela(id: string): Promise<void> {
  await rodarNoKWin(`
var alvo = janela(${JSON.stringify(id)})
if (alvo) { try { alvo.opacity = 1 } catch (e) {} }
entregar({ ok: true })
`)
}

/** Devolve uma janela guardada sem voo: restaura, ativa e tira da gaveta. */
export async function restaurarJanela(id: string): Promise<void> {
  const json = await rodarNoKWin(`
var alvo = janela(${JSON.stringify(id)})
if (!alvo) {
  entregar({ erro: 'a janela não existe mais' })
} else {
  try { alvo.skipTaskbar = false; alvo.skipSwitcher = false } catch (e) {}
  try { alvo.opacity = 1 } catch (e) {}
  alvo.minimized = false
  workspace.activeWindow = alvo
  entregar({ ok: true })
}
`)
  const resultado = JSON.parse(json) as { erro?: string }
  // Janela que fechou some da gaveta do mesmo jeito: guardá-la seria mentira.
  const posicao = guardadas.findIndex((j) => j.id === id)
  if (posicao >= 0) guardadas.splice(posicao, 1)
  invalidarCache()
  avisarGuardadas()
  if (resultado.erro) throw new Error(resultado.erro)
}

/**
 * Ao fechar o app: toda janela guardada volta a ser visível na barra, no
 * Alt+Tab e com opacidade 1 — continua minimizada, mas o usuário consegue
 * trazê-la de volta sem a ilha. Sem isto ela ficaria invisível para sempre.
 */
export async function soltarGuardadas(): Promise<void> {
  if (guardadas.length === 0) return
  const ids = guardadas.map((j) => j.id)
  guardadas.length = 0
  await rodarNoKWin(`
var ids = ${JSON.stringify(ids)}
for (var i = 0; i < ids.length; i++) {
  var alvo = janela(ids[i])
  if (!alvo) continue
  try { alvo.skipTaskbar = false; alvo.skipSwitcher = false } catch (e) {}
  try { alvo.opacity = 1 } catch (e) {}
}
entregar({ ok: true })
`)
}

/** Só traz a janela para a frente, sem mexer na gaveta. */
export async function focarJanela(id: string): Promise<void> {
  const json = await rodarNoKWin(`
var alvo = janela(${JSON.stringify(id)})
if (!alvo) {
  entregar({ erro: 'a janela não existe mais' })
} else {
  alvo.minimized = false
  workspace.activeWindow = alvo
  entregar({ ok: true })
}
`)
  const resultado = JSON.parse(json) as { erro?: string }
  invalidarCache()
  if (resultado.erro) throw new Error(resultado.erro)
}

/**
 * Encaixa uma janela: metade esquerda, metade direita ou maximizada.
 *
 * O "window snapping" do Notchy, pelo mesmo scripting do KWin das outras
 * ações: `workspace.clientArea(MaximizeArea)` dá a área útil da tela em que a
 * janela está (já sem o painel), e `frameGeometry` recebe o retângulo. A
 * janela é ativada junto — encaixar e deixar atrás de outra não faria sentido.
 */
export async function encaixarJanela(
  id: string,
  lado: 'esquerda' | 'direita' | 'maximizar',
): Promise<void> {
  const json = await rodarNoKWin(`
var alvo = janela(${JSON.stringify(id)})
if (!alvo) {
  entregar({ erro: 'a janela não existe mais' })
} else {
  alvo.minimized = false
  var area = workspace.clientArea(KWin.MaximizeArea, alvo)
  var lado = ${JSON.stringify(lado)}
  if (lado === 'maximizar') {
    alvo.setMaximize(true, true)
  } else {
    alvo.setMaximize(false, false)
    var w = Math.round(area.width / 2)
    alvo.frameGeometry = {
      x: lado === 'esquerda' ? area.x : area.x + area.width - w,
      y: area.y,
      width: w,
      height: area.height,
    }
  }
  workspace.activeWindow = alvo
  entregar({ ok: true })
}
`)
  const resultado = JSON.parse(json) as { erro?: string }
  invalidarCache()
  if (resultado.erro) throw new Error(resultado.erro)
}

/* ——— O vigia: um script que fica ————————————————————————
 *
 * Os outros scripts entram e saem por chamada. Este fica carregado enquanto a
 * ilha está de pé, porque escuta o compositor: uma janela entrou ou saiu de
 * tela cheia (a ilha DAQUELA tela some, para não cobrir um filme), e o atalho global de
 * guardar a janela ativa — que só é registrado se o usuário pediu, porque
 * `registerShortcut` grava em `~/.config/kglobalshortcutsrc` (medido em
 * 01/09/2026: a linha aparece no grupo `[kwin]`). Desligar o atalho apaga a
 * linha com o `kwriteconfig6`, para não deixar rastro fora do app.
 *
 * Ele já mandou a posição do cursor a cada 60ms, para o main ligar e desligar
 * o mouse na janela conforme o ponteiro entrava na pílula. Não manda mais: a
 * região de entrada da janela é escrita direto no X (`entrada.ts`), e quem
 * decide se o ponteiro está sobre a pílula é o compositor, pela geometria.
 */
/**
 * A regra: a ilha fica SEMPRE sobre o painel do Plasma.
 *
 * "Manter acima" não garante isso. MEDIDO em 08/09/2026 (KWin 6.6.6, pela
 * propriedade `layer` das janelas): a ilha (`dock` + `keepAbove`), os painéis
 * do Plasma e o Latte Dock vivem na MESMA camada do KWin — a 3, "acima" —, e
 * dentro de uma camada vale quem foi erguido por último. Cada clique no
 * painel o ergue, e a ilha ia para baixo dele: só a barriga da pílula
 * aparecia sob a barra superior. Foi assim que o usuário a encontrou, dez
 * horas depois de o app abrir, com `_NET_WM_STATE` ainda dizendo ABOVE e
 * STAYS_ON_TOP. Não há camada mais alta a pedir por EWMH sem mudar o tipo
 * da janela (e `dock` é o tipo que impede o KWin de empurrá-la para baixo do
 * painel ao mapear — ver `window.ts`).
 *
 * Então quem garante é o vigia: cada ilha avisa quando a pilha muda
 * (`stackingOrderChanged`, sinal da janela — o do `workspace` não existe no
 * 6.6), e se qualquer janela de outro programa na mesma camada estiver por
 * cima de uma ilha, `workspace.raiseWindow` ergue as ilhas de novo — de
 * dentro do compositor, sem D-Bus, no mesmo giro do evento. Medido: ao erguer
 * o painel por script, a ilha voltou para cima na hora; 11 chamadas em 3s,
 * duas erguidas, nenhum pingue-pongue. As janelas do próprio Halo (a camada do
 * voo, o lançador) não contam: o voo se mostra sobre a ilha de propósito. O
 * freio (oito erguidas por segundo) existe para o caso de outro programa
 * responder a cada erguida com a sua — não aconteceu com o Plasma nem com o
 * Latte, mas um vigia que trava o compositor seria pior que a barriga.
 *
 * E o painel que NASCE por cima (14/09/2026): o usuário viu a ilha atrás da
 * barra superior logo depois de trocar de ambiente, e voltar ao normal com um
 * clique. Um reinício do plasmashell (na época, o que o script de cor do tema
 * do KDE fazia) recria o
 * painel, e o painel novo é uma janela nova, mapeada acima da ilha — a posição DA ILHA na pilha não
 * muda, e o sinal dela não dispara. Por isso o vigia escuta também os painéis
 * (toda janela `dock` que não é ilha) e confere a pilha quando um aparece.
 */
const SOBRE_O_PAINEL = `
var erguendoIlhas = false
var erguidas = []
function sobreOPainel() {
  if (erguendoIlhas) return
  var pilha = workspace.stackingOrder
  var ilhas = [], precisa = false
  for (var i = 0; i < pilha.length; i++) {
    var w = pilha[i]
    if (ehIlha(w)) { ilhas.push(w); continue }
    if (ilhas.length === 0 || String(w.resourceClass) === 'halo-spatial-os') continue
    if (w.layer === ilhas[0].layer) precisa = true
  }
  if (!precisa) return
  var agora = Date.now(), recentes = []
  for (var j = 0; j < erguidas.length; j++) if (agora - erguidas[j] < 1000) recentes.push(erguidas[j])
  erguidas = recentes
  if (erguidas.length >= 8) return
  erguidas.push(agora)
  erguendoIlhas = true
  try { for (var k = 0; k < ilhas.length; k++) workspace.raiseWindow(ilhas[k]) } finally { erguendoIlhas = false }
}
sobreOPainel()
`
const VIGIA = 'halo-ilha-vigia'
const ATALHO_TITULO = 'Halo: guardar a janela ativa na ilha'
const ATALHO_TECLAS = 'Meta+Shift+H'
/**
 * O segundo atalho: recolher o próprio Halo para a ilha, e trazê-lo de volta
 * (ver `island/halo.ts`). Mesmo caminho do primeiro, e pelo mesmo motivo —
 * `globalShortcut` do Electron não pega numa sessão Wayland, onde o app é um
 * cliente X11 pelo Xwayland e nunca vê a tecla; quem entrega é o compositor.
 *
 * Meta+Space estava livre nesta máquina (conferido em `kglobalshortcutsrc` e
 * em `kxkbrc`, que é onde moraria um `grp:win_space_toggle` de troca de
 * layout). Se estiver ocupado em outra, o KDE simplesmente não entrega a
 * tecla — e a chave em Configurações é como o usuário desiste dela.
 */
const ATALHO_APP_TITULO = 'Halo: recolher o app para a ilha'
const ATALHO_APP_TECLAS = 'Meta+Space'
/**
 * O terceiro: abrir o lançador em janela própria. Meta+V é do Klipper, e é
 * de propósito — o pedido foi abrir o lançador no lugar do clipboard do
 * sistema. O
 * KDE não entrega uma tecla ocupada, então quem liga este atalho libera antes
 * o do Klipper pelo kglobalaccel (`launcher/klipper.ts`) e devolve ao desligar.
 */
const ATALHO_LANCADOR_TITULO = 'Halo: abrir o lançador'
const ATALHO_LANCADOR_TECLAS = 'Meta+V'
let vigia = false
export const vigiaDePe = (): boolean => vigia

export async function iniciarVigia(
  opcoes: { atalho: boolean; atalhoApp: boolean; atalhoLancador: boolean },
  ouvinte: (evento: EventoDoVigia) => void,
): Promise<void> {
  ouvinteDoVigia = ouvinte
  await pararVigia()
  await prepararBus()
  const arquivo = join(app.getPath('temp'), `${VIGIA}.js`)
  const codigo = `${EH_ILHA}
function avisar(evento) {
  callDBus('com.halo.Ilha', '/ilha', 'com.halo.Ilha', 'entrega', 'vigia', JSON.stringify(evento))
}
function telaCheia() {
  var atual = workspace.currentDesktop, telas = [], vistas = {}
  var l = workspace.windowList()
  for (var i = 0; i < l.length; i++) {
    var w = l[i]
    if (!w.fullScreen || w.minimized || !w.output || ehIlha(w)) continue
    var naAtual = w.onAllDesktops
    for (var k = 0; k < w.desktops.length; k++) if (w.desktops[k].id === atual.id) naAtual = true
    if (!naAtual) continue
    var g = w.output.geometry, chave = g.x + ',' + g.y
    if (vistas[chave]) continue
    vistas[chave] = true
    telas.push({ x: g.x, y: g.y, width: g.width, height: g.height })
  }
  avisar({ tipo: 'tela-cheia', telas: telas })
}
function janelasMudaram() { avisar({ tipo: 'janelas' }) }
function liga(w) {
  if (w && w.fullScreenChanged) w.fullScreenChanged.connect(telaCheia)
  if (w && w.minimizedChanged) w.minimizedChanged.connect(telaCheia)
  if (w && w.outputChanged) w.outputChanged.connect(telaCheia)
  if (w && w.captionChanged) w.captionChanged.connect(janelasMudaram)
  if (w && (ehIlha(w) || w.dock) && w.stackingOrderChanged) w.stackingOrderChanged.connect(sobreOPainel)
}
function painelNovo(w) { if (w && w.dock && !ehIlha(w)) sobreOPainel() }
var lista = workspace.windowList()
for (var i = 0; i < lista.length; i++) liga(lista[i])
workspace.windowAdded.connect(liga)
workspace.windowAdded.connect(painelNovo)
workspace.windowAdded.connect(janelasMudaram)
workspace.windowRemoved.connect(janelasMudaram)
workspace.windowRemoved.connect(telaCheia)
if (workspace.currentDesktopChanged) workspace.currentDesktopChanged.connect(telaCheia)
workspace.windowActivated.connect(telaCheia)
workspace.windowActivated.connect(janelasMudaram)
${SOBRE_O_PAINEL}
${
  opcoes.atalho
    ? `registerShortcut(${JSON.stringify(ATALHO_TITULO)}, ${JSON.stringify(ATALHO_TITULO)}, ${JSON.stringify(ATALHO_TECLAS)}, function () { avisar({ tipo: 'atalho-guardar' }) })`
    : ''
}
${
  opcoes.atalhoApp
    ? `registerShortcut(${JSON.stringify(ATALHO_APP_TITULO)}, ${JSON.stringify(ATALHO_APP_TITULO)}, ${JSON.stringify(ATALHO_APP_TECLAS)}, function () { avisar({ tipo: 'atalho-halo' }) })`
    : ''
}
${
  opcoes.atalhoLancador
    ? `registerShortcut(${JSON.stringify(ATALHO_LANCADOR_TITULO)}, ${JSON.stringify(ATALHO_LANCADOR_TITULO)}, ${JSON.stringify(ATALHO_LANCADOR_TECLAS)}, function () { avisar({ tipo: 'atalho-lancador' }) })`
    : ''
}
telaCheia()
`
  await writeFile(arquivo, codigo, 'utf8')
  await qdbus('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting.loadScript', arquivo, VIGIA)
  await qdbus('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting.start')
  vigia = true
  if (!opcoes.atalho) await apagarAtalho(ATALHO_TITULO)
  if (!opcoes.atalhoApp) await apagarAtalho(ATALHO_APP_TITULO)
  if (!opcoes.atalhoLancador) await apagarAtalho(ATALHO_LANCADOR_TITULO)
}

export async function pararVigia(): Promise<void> {
  if (!vigia) return
  vigia = false
  await qdbus('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting.unloadScript', VIGIA).catch(
    () => '',
  )
}

/**
 * Tira as DUAS linhas: a ilha foi desligada, e o que ela escreveu fora do app
 * não pode sobreviver a ela. Sem isto, desligar a ilha deixaria Meta+Space
 * gravado no KDE apontando para um atalho que ninguém mais atende.
 */
export async function apagarAtalhos(): Promise<void> {
  await apagarAtalho(ATALHO_TITULO)
  await apagarAtalho(ATALHO_APP_TITULO)
  await apagarAtalho(ATALHO_LANCADOR_TITULO)
}

/**
 * Onde está a janela ATIVA — é a tela dela que o lançador deve usar.
 *
 * O cursor não serve de guia: quem aperta Meta+V está com as mãos no teclado,
 * e o mouse pode ter ficado em outra tela horas atrás. A janela em foco é onde
 * a pessoa está olhando. Nula sem janela ativa (área de trabalho vazia).
 */
export async function geometriaDaJanelaAtiva(): Promise<Electron.Rectangle | null> {
  const json = await rodarNoKWin(`
var w = workspace.activeWindow
if (!w) entregar({})
else { var g = w.frameGeometry; entregar({ x: g.x, y: g.y, width: g.width, height: g.height }) }
`)
  const g = JSON.parse(json) as Partial<Electron.Rectangle>
  return typeof g.x === 'number' && typeof g.width === 'number'
    ? { x: g.x, y: g.y ?? 0, width: g.width, height: g.height ?? 0 }
    : null
}

/**
 * Ativa uma janela pelo título — o que a do lançador precisa ao aparecer.
 *
 * Mesmo motivo da ilha: o KWin não dá foco a uma janela que se mostra sozinha
 * (prevenção de roubo de foco), e `win.focus()` do Electron não chega como
 * pedido do usuário. O compositor é quem ativa, por script.
 */
export async function ativarJanelaPorTitulo(titulo: string): Promise<void> {
  const json = await rodarNoKWin(`
var lista = workspace.windowList()
var achou = false
for (var i = 0; i < lista.length && !achou; i++) {
  if (lista[i].caption === ${JSON.stringify(titulo)}) { workspace.activeWindow = lista[i]; achou = true }
}
entregar(achou ? { ok: true } : { erro: 'janela não encontrada' })
`)
  const resultado = JSON.parse(json) as { erro?: string }
  if (resultado.erro) throw new Error(resultado.erro)
}

/** Tira a linha do atalho do `kglobalshortcutsrc` — só a nossa, uma por vez. */
async function apagarAtalho(titulo: string): Promise<void> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  await promisify(execFile)(
    'kwriteconfig6',
    ['--file', 'kglobalshortcutsrc', '--group', 'kwin', '--key', titulo, '--delete'],
    { timeout: TIMEOUT_MS },
  ).catch(() => {})
}
