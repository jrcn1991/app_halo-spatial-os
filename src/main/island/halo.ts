import { type IslandWindow, vooDaJanelaDeVerdade } from '@shared/island'
import { BrowserWindow } from 'electron'
import { reaplicarSkipTaskbar, setDesktopLayer } from '../services/desktop-layer'
import { currentSettings } from '../settings'
import { efeitoCarregado } from './efeito'
import {
  idDaJanelaDoHalo,
  liberarBarra,
  mostrarJanela,
  prepararVoltaDoHalo,
  recolherHaloNoKWin,
} from './kwin'
import { announceToIslands, flyBackFromIslands, flyToIslands } from './window'

/**
 * O app dentro da ilha.
 *
 * O gesto que o usuário pediu: Meta+Space recolhe a janela do Halo para a
 * pílula, onde ela vira o botão aceso do início; de novo (ou um clique nesse
 * botão) a traz de volta. O voo é o mesmo da gaveta de janelas — o fantasma
 * que encolhe até a boca e a cuspida de volta (ver `island/window.ts`).
 *
 * Duas diferenças em relação a `guardarComVoo`, e as duas simplificam:
 *
 * - **a janela é NOSSA.** Não há KWin no caminho: esconder é `hide()` do
 *   Electron, e por isso o efeito do compositor (`island/efeito.ts`) não
 *   entra aqui — ele parte de um minimizar, que não acontece. O cartão do
 *   fantasma é sempre desenhado, e o gesto funciona igual sem o efeito
 *   instalado;
 * - **ela não some da barra de tarefas por nossa conta.** Janela escondida já
 *   sai da lista sozinha, e volta ao aparecer — nada de `skipTaskbar` para
 *   desfazer depois.
 *
 * O que ela É continua igual: ao voltar, a janela reaparece no mesmo canto e
 * na camada do papel de parede, sem foco. Recolher e trazer não mudam o app,
 * só o escondem — foi o que o usuário pediu.
 */

/** A janela do app, achada pelo título (o mesmo caminho de `halo-tela`). */
function janelaDoHalo(): BrowserWindow | null {
  const win = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Halo')
  return win && !win.isDestroyed() ? win : null
}

let recolhido = false
/**
 * Onde a janela estava quando foi recolhida.
 *
 * Guardado porque `getBounds` de janela escondida não é confiável em todo
 * gerenciador, e porque é dele que sai o destino do voo de volta: o cartão
 * cresce ATÉ o lugar de onde saiu, e não até onde o Electron acha que ela
 * está agora.
 */
let lugar: { x: number; y: number; width: number; height: number } | null = null
/**
 * O `internalId` da janela no KWin quando ela foi recolhida PELO EFEITO.
 *
 * Vazio quando o voo foi por cartão (ou seco): aí quem escondeu foi o
 * Electron, e é ele quem tem de mostrar. Guardar isto é o que impede os dois
 * caminhos de se misturarem — desminimizar pelo KWin uma janela escondida por
 * `hide()` não a traria de volta, e o contrário deixaria o efeito sem gatilho.
 */
let noKWin = ''

export const haloRecolhido = (): boolean => recolhido

/**
 * O app nasce recolhido: o arranque sobe a ilha, e a janela espera ser chamada.
 *
 * Não há voo aqui — não houve saída para animar. O que este ponto faz é
 * ensinar o estado deste módulo que a janela existe e está escondida: sem
 * isso, `recolhido` seria `false` com a janela invisível, e o primeiro
 * Meta+Espaço (ou o clique na bandeja) tentaria RECOLHER o que já estava
 * recolhido — o gesto não faria nada, em silêncio.
 *
 * `lugar` sai de `getBounds()` com a janela ainda não mostrada, e isso é
 * confiável aqui porque quem escolheu esses limites fomos nós, no
 * `createMainWindow` — é a posição salva do usuário, não um palpite do
 * gerenciador. É dela que sai o destino do voo de volta.
 *
 * Quem decide SE isto acontece é o main (`nasceRecolhido`), e a decisão inclui
 * haver caminho de volta: sem ilha e sem bandeja, o app abre à vista.
 */
export function nascerRecolhido(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  lugar = win.getBounds()
  noKWin = ''
  recolhido = true
}

/**
 * Quem voa: a janela DE VERDADE, ou um cartão desenhado por cima dela?
 *
 * Com o efeito do KWin carregado, quem anima é o compositor — e o que se vê
 * subir é o app com o conteúdo dele. Sem ele (ou com o efeito desligado em
 * Configurações), sobra a camada do fantasma, que só consegue desenhar uma
 * placa: **é ela o "preto" que aparece antes do voo**, e não um carregamento.
 *
 * `nenhuma` dispensa os dois: sem cartão, `flyToIslands` resolve na hora e a
 * janela some sem espera. O anúncio e o quique da pílula continuam — eles
 * dizem o que aconteceu, e isso não é enfeite.
 */
function comoVoar(): 'efeito' | 'cartao' | 'seco' {
  const escolha = currentSettings().island.flight
  if (escolha === 'nenhuma') return 'seco'
  // As três `real…` pedem o compositor — e sem o efeito carregado caem no
  // cartão, que sempre funciona. As outras SÃO cartão por definição.
  return vooDaJanelaDeVerdade(escolha) && efeitoCarregado() ? 'efeito' : 'cartao'
}

/**
 * O que o efeito do KWin custa, em tempo.
 *
 * Os mesmos números de `restaurarComVoo` (`island/act.ts`), e pela mesma
 * razão: o YetAnotherMagicLamp anima o desminimizar em ~400ms sobre a janela
 * invisível, e a barra só pode voltar depois do voo e do prazo em que ele
 * desiste de esperar um ícone.
 */
const YAML_MS = 450
const LIBERAR_BARRA_MS = 1100

/** O que o voo precisa saber: uma janela, no formato que a camada entende. */
function comoJanela(geometry: {
  x: number
  y: number
  width: number
  height: number
}): IslandWindow {
  return { id: 'halo', title: 'Halo', appClass: 'halo', minimized: false, active: false, geometry }
}

/**
 * Recolhe o app para a ilha.
 *
 * A ordem é a da revisão de movimento, a mesma de `guardarComVoo`: o fantasma
 * é desenhado ANTES de a janela sumir — `flyToIslands` só resolve quando a
 * camada responde que o cartão já a cobre —, e o anúncio sai aos 380ms, com o
 * cartão ainda a caminho.
 */
export async function recolherHalo(): Promise<void> {
  const win = janelaDoHalo()
  if (!win) throw new Error('a janela do Halo não está aberta')
  if (recolhido) return
  lugar = win.getBounds()
  const modo = comoVoar()

  if (modo === 'efeito') {
    // A janela de verdade voa: a camada não desenha nada, e a ilha só fecha o
    // painel e quica na chegada. Quem esconde a janela é o próprio efeito, ao
    // fim do voo — `hide()` do Electron aqui a arrancaria da tela no primeiro
    // quadro, que é justamente o que este caminho existe para evitar.
    // `.catch`: o script do KWin tem timeout de 4s, e a rejeição subia até o
    // `void alternarHalo().catch(() => {})` do atalho — o Meta+Espaço não fazia
    // absolutamente NADA, em silêncio, e o estado ficava consistente, então nem
    // dava para desconfiar. Id vazio cai na reserva do cartão, que sempre
    // funciona; o aviso vai para o log, não para a pílula: falha de compositor
    // não é assunto do usuário.
    const idKWin = await idDaJanelaDoHalo().catch((erro: Error) => {
      console.warn(`[halo] o KWin não devolveu a janela, voando de cartão: ${erro.message}`)
      return ''
    })
    if (idKWin) {
      noKWin = idKWin
      await flyToIslands(comoJanela(lugar), { cartao: false, tipo: 'halo' })
      await recolherHaloNoKWin(idKWin)
      recolhido = true
      anunciar()
      return
    }
    // Sem KWin na pilha (outro ambiente): cai no cartão, que sempre funciona.
  }

  noKWin = ''
  // `!== 'seco'`, e não `=== 'cartao'`: aqui é a RESERVA do modo "efeito" —
  // chegar nesta linha com `modo === 'efeito'` significa que o KWin não
  // devolveu a janela. Com `cartao: false` o `voar()` sai na primeira linha e
  // NADA é desenhado: a janela sumia seca, sem voo nenhum, e o usuário não
  // tinha como saber que a ilha estava com ela. Só 'nenhuma' pede voo seco.
  await flyToIslands(comoJanela(lugar), { cartao: modo !== 'seco', tipo: 'halo' })
  win.hide()
  recolhido = true
  anunciar()
}

/** O anúncio da pílula, aos 380ms — com o voo ainda a caminho. */
function anunciar(): void {
  setTimeout(() => {
    announceToIslands({
      key: 'halo',
      icon: 'House',
      text: 'Halo na ilha',
      detail: 'Meta+Space traz de volta',
      level: 'ok',
      ttlMs: 2600,
    })
  }, 380)
}

/**
 * Traz o app de volta ao lugar de onde saiu.
 *
 * A janela reaparece por baixo do cartão pouco antes de ele assentar — é o
 * que `flyBackFromIslands` promete ao resolver ~100ms antes do fim. E ela
 * volta com `showInactive`, não `show`: o Halo é um widget de área de
 * trabalho, e roubar o teclado de quem está digitando seria o contrário do
 * que ele é.
 */
export async function trazerHalo(): Promise<void> {
  const win = janelaDoHalo()
  if (!win) throw new Error('a janela do Halo não está aberta')
  if (!recolhido || !lugar) return
  const destino = lugar

  if (noKWin) {
    // Volta em três tempos, a mesma de `restaurarComVoo`: a janela é
    // desminimizada INVISÍVEL (o efeito de minimizar do sistema roda no
    // escuro em direção ao ícone antigo, que era a janela
    // vista saindo da posição dela); passado o prazo dele, a ilha quica e a opacidade vai a 1, o
    // que dispara o voo de volta no nosso efeito; e a barra só é liberada
    // depois de tudo.
    const id = noKWin
    await prepararVoltaDoHalo(id)
    await new Promise((r) => setTimeout(r, YAML_MS))
    await flyBackFromIslands(comoJanela(destino), { cartao: false, tipo: 'halo' })
    await mostrarJanela(id)
    recolhido = false
    noKWin = ''
    // A camada precisa ser repedida também aqui: minimizar e desminimizar
    // passa pelo mesmo desmapeamento que `hide()`/`show()`.
    if (currentSettings().desktop.on) void setDesktopLayer(win, true).catch(() => {})
    await new Promise((r) => setTimeout(r, LIBERAR_BARRA_MS))
    await liberarBarra(id)
    // DEPOIS do `liberarBarra`, e não antes: é ele quem devolve a barra de
    // tarefas, e reaplicar primeiro seria desfeito no passo seguinte.
    reaplicarSkipTaskbar(win)
    return
  }

  // O espelho da ida, pelo mesmo motivo: chegar aqui significa `noKWin === ''`,
  // isto é, quem escondeu a janela foi o `hide()` do Electron — e o efeito do
  // KWin não anima uma janela escondida assim (ele ouve `minimizedChanged` e
  // `windowOpacityChanged`, ver o corpo do script em `efeito.ts`). Logo o
  // cartão é sempre o certo aqui, exceto no voo seco. Corrigir só a ida
  // deixaria a volta ainda sem desenho.
  await flyBackFromIslands(comoJanela(destino), {
    cartao: comoVoar() !== 'seco',
    tipo: 'halo',
  })
  // Ainda escondida: um `setBounds` com a janela à vista mostra o buffer
  // velho na posição nova por um quadro (medido na ilha, ver `window.ts`).
  // Aqui ele existe porque o gerenciador pode devolver a janela em outro
  // canto depois de desmapeá-la — o usuário deixou ela onde deixou.
  win.setBounds(destino)
  win.showInactive()
  recolhido = false
  // A camada do papel de parede é um estado da janela MAPEADA: desmapear e
  // mapear de novo a perde, e sem isto o Halo voltaria por cima de tudo —
  // que é justamente o que ele não é (CLAUDE.md § Janela e camada).
  if (currentSettings().desktop.on) void setDesktopLayer(win, true).catch(() => {})
  // A ilha devolveu a barra de tarefas ao restaurar; se a janela vive fora
  // dela (há bandeja), este é o ponto que a tira de novo.
  reaplicarSkipTaskbar(win)
}

/**
 * O gesto do atalho e do botão da pílula: um só, que alterna.
 *
 * `emVoo` é uma trava, e ela é necessária porque `recolhido` só é escrito no
 * FIM do voo: dois Meta+Espaço em sequência rápida liam `recolhido === false`
 * os dois, e recolhiam duas vezes em vez de recolher e trazer de volta. Não há
 * debounce no caminho — nem no registro do atalho no KWin, nem na pílula.
 *
 * A trava fica só aqui, e não em `recolherHalo`/`trazerHalo`: aqueles dois são
 * explícitos (`halo-recolher` e `halo-trazer` da pílula), não alternam, e a
 * rede de segurança `garantirHaloAVista` precisa poder chamá-los a qualquer
 * momento.
 */
let emVoo: Promise<void> | null = null

export async function alternarHalo(): Promise<void> {
  if (emVoo) return emVoo
  emVoo = (recolhido ? trazerHalo() : recolherHalo()).finally(() => {
    emVoo = null
  })
  return emVoo
}

/**
 * Rede de segurança: ninguém pode ficar sem caminho de volta.
 *
 * Se a ilha for desligada em Configurações — ou fechada por qualquer motivo —
 * com o app recolhido, o botão que o traria de volta deixaria de existir e a
 * janela ficaria escondida sem gesto nenhum que a alcançasse. É a mesma regra
 * que mantém Home e Configurações no dock (CLAUDE.md § Configurações): uma
 * opção não pode trancar o usuário para fora.
 *
 * Aqui não há voo: a ilha para onde o cartão voltaria já não está lá.
 */
export function garantirHaloAVista(): void {
  if (!recolhido) return
  const win = janelaDoHalo()
  recolhido = false
  // Recolhida pelo efeito, a janela está MINIMIZADA no KWin, e não escondida
  // pelo Electron: desminimizar e devolver a barra é o que a traz de volta, e
  // um `showInactive` por cima disso disputaria com o compositor.
  if (noKWin) {
    const id = noKWin
    noKWin = ''
    void prepararVoltaDoHalo(id)
      .then(() => mostrarJanela(id))
      .then(() => liberarBarra(id))
      .then(() => {
        if (!win) return
        if (currentSettings().desktop.on) void setDesktopLayer(win, true).catch(() => {})
        reaplicarSkipTaskbar(win)
      })
      .catch(() => {})
    return
  }
  if (!win) return
  if (lugar) win.setBounds(lugar)
  win.showInactive()
  if (currentSettings().desktop.on) void setDesktopLayer(win, true).catch(() => {})
  // A ilha devolveu a barra de tarefas ao restaurar; se a janela vive fora
  // dela (há bandeja), este é o ponto que a tira de novo.
  reaplicarSkipTaskbar(win)
}
