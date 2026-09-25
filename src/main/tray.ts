import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { t } from '@shared/i18n'
import dbus from 'dbus-next'
import { app, type BrowserWindow, nativeImage } from 'electron'
import { alternarHalo, garantirHaloAVista, haloRecolhido } from './island/halo'

/**
 * O Halo mora na bandeja do sistema.
 *
 * Ele é um widget de área de trabalho: fica na camada do papel de parede, sem
 * moldura, e não é uma janela que se alterna com Alt+Tab. Uma entrada na barra
 * de tarefas para uma janela que vive ATRÁS de todas as outras não ajuda em
 * nada — clicar nela não a traz para frente, porque frente não é onde ela
 * está. O lugar de um app assim é a bandeja, ao lado do relógio e do volume.
 *
 * **A bandeja é a saída de emergência, e por isso ela vem PRIMEIRO.** Com a
 * janela fora da barra de tarefas, esconder o Halo sem bandeja o deixaria sem
 * nenhum caminho de volta — a mesma armadilha que a regra "configuração não
 * pode trancar o usuário para fora" evita em Configurações. Por isso
 * `criarBandeja` só devolve `true` depois de CONFERIR que o vigia do KDE
 * aceitou o ícone; sem isso a janela nasce na barra de tarefas mesmo.
 *
 * ## Por que o item é NOSSO, e não o `Tray` do Electron
 *
 * MEDIDO em 06/09/2026, nesta máquina (KDE Plasma 6, Electron 44): o `Tray` do
 * Electron cria o objeto e pega o nome `org.freedesktop.StatusNotifierItem-
 * <pid>-1` no barramento, mas o `RegisteredStatusNotifierItems` do KDE nunca o
 * inclui — e o que não está na lista do vigia o painel não desenha. São dois
 * desencontros, e o segundo é o que fecha a porta:
 *
 * 1. o Chromium espera o vigia em `org.freedesktop.StatusNotifierWatcher`, que
 *    NÃO existe nesta sessão (`NameHasOwner` → false); o KDE publica
 *    `org.kde.StatusNotifierWatcher` (→ true). Por isso ele nunca se registra;
 * 2. registrar por ele NÃO resolve: quem registra por NOME diz ao vigia para
 *    ler o objeto em `/StatusNotifierItem`, e o do Chromium mora em
 *    `/StatusNotifierItem/1` — ali o KDE acha um nó vazio. Registrar pelo
 *    CAMINHO também não serve: o vigia amarra o registro à conexão de quem
 *    chama, e a nossa (`dbus-next`) não é a do Chromium, ainda que no mesmo
 *    processo.
 *
 * Sobra publicar o item por conta própria, que é o que este arquivo faz: o
 * mesmo protocolo (`org.kde.StatusNotifierItem`) que qualquer app de bandeja
 * fala, no caminho que o vigia vai ler, registrado pelo método oficial. Nada é
 * escrito fora do app — é o mesmo tipo de conversa do Klipper
 * (`launcher/klipper.ts`) e do MPRIS.
 *
 * O menu de botão direito é o segundo protocolo desta história: quem o desenha
 * é o `com.canonical.dbusmenu`, e o item da bandeja só aponta para ele pela
 * propriedade `Menu`. Ele existe porque o usuário pediu um jeito de SAIR do
 * app (06/09/2026) — com a janela fora da barra de tarefas, fechar pelo botão
 * da própria tela exige mostrá-la primeiro, e um app que roda o tempo todo
 * precisa de uma saída no lugar onde ele mora.
 */

const { Interface, ACCESS_READ } = dbus.interface
const { Variant } = dbus

/** Um por processo. O sufixo `-1` é a convenção da spec para o primeiro item. */
const NOME = `org.kde.StatusNotifierItem-${process.pid}-1`
const CAMINHO = '/StatusNotifierItem'
const CAMINHO_MENU = '/MenuBar'

/** Os ids dos itens do menu. O 0 é a raiz, por definição do protocolo. */
const MOSTRAR = 1
const SEPARADOR = 2
const SAIR = 3

let conexao: dbus.MessageBus | null = null

/**
 * Os tamanhos que vão no `IconPixmap`.
 *
 * Dois, e não um: o painel escolhe o mais próximo do que precisa, e numa tela
 * com escala 2× o de 32 seria esticado. O de 1024 não entra — o painel o
 * reamostraria a cada desenho.
 */
const TAMANHOS = [32, 64] as const

/**
 * Onde estão os ícones, nos dois modos de execução.
 *
 * Empacotados eles vão em `extraResources` (ver `electron-builder.yml`), fora
 * do asar, porque aqui a leitura é de arquivo mesmo. Em desenvolvimento é o
 * conjunto que `tools/icone.mjs` gera; `import.meta.dirname` é `out/main`.
 */
function caminhoDoIcone(lado: number): string {
  const relativo = `icons/${lado}x${lado}.png`
  return app.isPackaged
    ? join(process.resourcesPath, relativo)
    : join(import.meta.dirname, '../../build', relativo)
}

/**
 * O ícone no formato que a spec pede: ARGB32 em ordem de rede (big-endian).
 *
 * Quem lê o PNG é o `nativeImage` do Electron — `toBitmap()` devolve BGRA na
 * ordem da máquina, e o que sai daqui é A, R, G, B por pixel. Sem biblioteca
 * de imagem nova: o Chromium já está aqui dentro.
 */
function pixmap(lado: number): [number, number, Buffer] | null {
  const arquivo = caminhoDoIcone(lado)
  if (!existsSync(arquivo)) return null

  const imagem = nativeImage.createFromPath(arquivo)
  if (imagem.isEmpty()) return null

  const { width, height } = imagem.getSize()
  const bgra = imagem.toBitmap()
  const argb = Buffer.alloc(bgra.length)
  for (let i = 0; i < bgra.length; i += 4) {
    argb[i] = bgra[i + 3] as number // A
    argb[i + 1] = bgra[i + 2] as number // R
    argb[i + 2] = bgra[i + 1] as number // G
    argb[i + 3] = bgra[i] as number // B
  }
  return [width, height, argb]
}

/** O item da bandeja, como a spec do StatusNotifierItem o descreve. */
class ItemDeBandeja extends Interface {
  private readonly pixmaps: [number, number, Buffer][]

  constructor(pixmaps: [number, number, Buffer][]) {
    super('org.kde.StatusNotifierItem')
    this.pixmaps = pixmaps
  }

  // Os três gestos fazem a mesma coisa: o ícone é um interruptor. `Activate` é
  // o clique esquerdo, `SecondaryActivate` o do meio, `ContextMenu` o direito.
  Activate(): void {
    void alternarHalo()
  }
  SecondaryActivate(): void {
    void alternarHalo()
  }
  ContextMenu(): void {
    void alternarHalo()
  }
  /** A roda sobre o ícone não faz nada, mas o método precisa existir. */
  Scroll(): void {}

  get Category(): string {
    return 'ApplicationStatus'
  }
  /** O id com que o painel guarda a preferência de mostrar ou esconder. */
  get Id(): string {
    return 'halo-spatial-os'
  }
  get Title(): string {
    return 'Halo'
  }
  get Status(): string {
    return 'Active'
  }
  /**
   * Vazio de propósito: o nome só resolveria com o app instalado (é o `.deb`
   * que põe o ícone no `hicolor`), e em desenvolvimento não haveria nada. O
   * pixmap funciona nos dois casos, e é o que a spec manda usar quando não há
   * nome de tema.
   */
  get IconName(): string {
    return ''
  }
  get IconPixmap(): [number, number, Buffer][] {
    return this.pixmaps
  }
  /** `(nome do ícone, pixmaps, título, descrição)`. */
  get ToolTip(): [string, [number, number, Buffer][], string, string] {
    return ['', [], 'Halo', t('Mostrar ou esconder o Halo')]
  }
  /** `false`: o clique esquerdo chama `Activate`, e não abre o menu. */
  get ItemIsMenu(): boolean {
    return false
  }
  /** Onde mora o menu do botão direito, no protocolo do dbusmenu. */
  get Menu(): string {
    return CAMINHO_MENU
  }
}

ItemDeBandeja.configureMembers({
  methods: {
    Activate: { inSignature: 'ii' },
    SecondaryActivate: { inSignature: 'ii' },
    ContextMenu: { inSignature: 'ii' },
    Scroll: { inSignature: 'is' },
  },
  properties: {
    Category: { signature: 's', access: ACCESS_READ },
    Id: { signature: 's', access: ACCESS_READ },
    Title: { signature: 's', access: ACCESS_READ },
    Status: { signature: 's', access: ACCESS_READ },
    IconName: { signature: 's', access: ACCESS_READ },
    IconPixmap: { signature: 'a(iiay)', access: ACCESS_READ },
    ToolTip: { signature: '(sa(iiay)ss)', access: ACCESS_READ },
    ItemIsMenu: { signature: 'b', access: ACCESS_READ },
    Menu: { signature: 'o', access: ACCESS_READ },
  },
})

/**
 * O menu do botão direito, no protocolo `com.canonical.dbusmenu`.
 *
 * Duas entradas e um traço: mostrar/esconder e sair. O rótulo do primeiro
 * muda com o estado da janela, e é por isso que `AboutToShow` devolve `true`:
 * é a forma que o protocolo tem de dizer "repergunte o desenho antes de
 * abrir". Sem isso o menu abriria com o rótulo de quando foi lido pela
 * primeira vez, e diria "Esconder" com o Halo já escondido.
 */
class MenuDaBandeja extends Interface {
  /** Sobe a cada mudança de desenho: é assim que o painel sabe reler. */
  private revisao = 1

  constructor() {
    super('com.canonical.dbusmenu')
  }

  private itens(): [number, Record<string, dbus.Variant>][] {
    return [
      [
        MOSTRAR,
        {
          label: new Variant('s', haloRecolhido() ? t('Mostrar o Halo') : t('Esconder o Halo')),
          enabled: new Variant('b', true),
          visible: new Variant('b', true),
        },
      ],
      [SEPARADOR, { type: new Variant('s', 'separator'), visible: new Variant('b', true) }],
      [
        SAIR,
        {
          label: new Variant('s', t('Sair do Halo')),
          enabled: new Variant('b', true),
          visible: new Variant('b', true),
        },
      ],
    ]
  }

  /** `(id, propriedades, filhos)` — a estrutura é recursiva, e os filhos são variantes. */
  GetLayout(): [number, [number, Record<string, dbus.Variant>, dbus.Variant[]]] {
    const filhos = this.itens().map(
      ([id, props]) => new Variant('(ia{sv}av)', [id, props, []] as unknown as never),
    )
    return [
      this.revisao,
      [0, { 'children-display': new Variant('s', 'submenu') }, filhos as dbus.Variant[]],
    ]
  }

  GetGroupProperties(ids: number[]): [number, Record<string, dbus.Variant>][] {
    const todos = this.itens()
    return ids.length === 0 ? todos : todos.filter(([id]) => ids.includes(id))
  }

  GetProperty(id: number, nome: string): dbus.Variant {
    const item = this.itens().find(([i]) => i === id)
    return item?.[1][nome] ?? new Variant('s', '')
  }

  Event(id: number, tipo: string): void {
    if (tipo !== 'clicked') return
    if (id === MOSTRAR) void alternarHalo()
    // `app.quit()`, e não `exit`: é o `before-quit` do main que salva o que
    // está no debounce das configurações, solta as janelas guardadas na gaveta
    // da ilha e encerra os processos do CLI do Claude.
    //
    // E FORA deste tratador, num `setImmediate`. Chamado aqui dentro, o
    // `before-quit` corria antes de a resposta sair — e ele fecha a bandeja,
    // que é a MESMA conexão que está no meio da chamada. MEDIDO em
    // 06/09/2026: o processo travava inteiro (a janela ficava na tela, o
    // D-Bus parava de responder) e só morria com `kill -9`. Assim a resposta
    // vai embora, o tratador termina, e só então o app se despede.
    if (id === SAIR) setImmediate(() => app.quit())
  }

  EventGroup(eventos: [number, string, dbus.Variant, number][]): number[] {
    for (const [id, tipo] of eventos) this.Event(id, tipo)
    return []
  }

  /** `true` = "releia o desenho": o rótulo de mostrar/esconder depende do estado. */
  AboutToShow(): boolean {
    this.revisao += 1
    return true
  }

  AboutToShowGroup(ids: number[]): [number[], number[]] {
    this.revisao += 1
    return [ids, []]
  }

  get Version(): number {
    return 3
  }
  get TextDirection(): string {
    return 'ltr'
  }
  get Status(): string {
    return 'normal'
  }
  get IconThemePath(): string[] {
    return []
  }
}

MenuDaBandeja.configureMembers({
  methods: {
    GetLayout: { inSignature: 'iias', outSignature: 'u(ia{sv}av)' },
    GetGroupProperties: { inSignature: 'aias', outSignature: 'a(ia{sv})' },
    GetProperty: { inSignature: 'is', outSignature: 'v' },
    Event: { inSignature: 'isvu' },
    EventGroup: { inSignature: 'a(isvu)', outSignature: 'ai' },
    AboutToShow: { inSignature: 'i', outSignature: 'b' },
    AboutToShowGroup: { inSignature: 'ai', outSignature: 'aiai' },
  },
  properties: {
    Version: { signature: 'u', access: ACCESS_READ },
    TextDirection: { signature: 's', access: ACCESS_READ },
    Status: { signature: 's', access: ACCESS_READ },
    IconThemePath: { signature: 'as', access: ACCESS_READ },
  },
})

/**
 * Publica o ícone e o registra no vigia do KDE.
 *
 * Devolve se ele está de pé DE VERDADE — conferido na lista do vigia, não
 * suposto: é este `true` que autoriza a janela a nascer fora da barra de
 * tarefas, e um registro que falhasse em silêncio deixaria o usuário sem
 * caminho de volta.
 */
export async function criarBandeja(): Promise<boolean> {
  const pixmaps = TAMANHOS.map(pixmap).filter((p) => p !== null)
  if (pixmaps.length === 0) {
    console.warn('[bandeja] sem ícone em build/icons — a janela fica na barra de tarefas')
    return false
  }

  const bus = dbus.sessionBus()
  try {
    bus.export(CAMINHO, new ItemDeBandeja(pixmaps))
    bus.export(CAMINHO_MENU, new MenuDaBandeja())
    // Flags 0: sem fila e sem substituir ninguém. O nome carrega o nosso pid,
    // então ele já é único — se estiver ocupado, alguma coisa está errada e é
    // melhor falhar do que herdar o ícone de outro processo.
    await bus.requestName(NOME, 0)

    const vigia = await bus.getProxyObject(
      'org.kde.StatusNotifierWatcher',
      '/StatusNotifierWatcher',
    )
    await (
      vigia.getInterface('org.kde.StatusNotifierWatcher') as unknown as {
        RegisterStatusNotifierItem(servico: string): Promise<void>
      }
    ).RegisterStatusNotifierItem(NOME)

    const props = vigia.getInterface('org.freedesktop.DBus.Properties') as unknown as {
      Get(iface: string, prop: string): Promise<{ value: string[] }>
    }
    const lista = (
      await props.Get('org.kde.StatusNotifierWatcher', 'RegisteredStatusNotifierItems')
    ).value
    if (!lista.some((item) => item.startsWith(NOME))) {
      console.warn('[bandeja] o vigia não listou o ícone — a janela fica na barra de tarefas')
      bus.disconnect()
      return false
    }

    conexao = bus
    return true
  } catch (erro) {
    // Sem vigia (um ambiente que não seja KDE, ou o kded fora do ar) não há
    // bandeja — e é por isso que quem chama precisa de uma resposta, e não de
    // uma exceção: o app abre igual, com a janela na barra.
    console.warn(`[bandeja] não foi possível publicar o ícone: ${String(erro)}`)
    bus.disconnect()
    return false
  }
}

/** Solta o nome no barramento. O ícone some do painel na hora. */
/** O ícone está de pé — é um caminho de volta para a janela recolhida. */
export const bandejaDePe = (): boolean => conexao !== null

export function fecharBandeja(): void {
  conexao?.disconnect()
  conexao = null
}

/**
 * Traz a janela de volta e a mostra, venha o pedido de onde vier.
 *
 * Usada por `second-instance` (abrir o app com ele já aberto): o usuário quer
 * VER a janela, e ela pode estar recolhida pela gaveta da ilha, minimizada ou
 * escondida — três estados, um caminho só.
 */
export function trazerParaAVista(principal: BrowserWindow): void {
  garantirHaloAVista()
  if (principal.isDestroyed()) return
  if (principal.isMinimized()) principal.restore()
  if (!principal.isVisible()) principal.showInactive()
}
