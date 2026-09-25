import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { t } from '@shared/i18n'
import type { AcaoDoAviso, Aviso, UrgenciaDoAviso } from '@shared/notificacoes'
import dbus from 'dbus-next'
import { iconeDoDesktop, iconeDoNome, imagemDoCaminho, imagemDosPixels } from './icones'

/**
 * A conversa com o servidor de notificações do Plasma.
 *
 * O Halo NÃO é o servidor — brigar com o Plasma pelo nome
 * `org.freedesktop.Notifications` tiraria dele o histórico, o "não perturbe" e
 * as respostas aos aplicativos. Três pedidos, todos medidos nesta máquina em
 * 12/09/2026 (Plasma 6.6.6), fazem o resto:
 *
 * 1. **`org.kde.NotificationManager.RegisterWatcher`** — o Plasma passa a
 *    chamar `org.kde.NotificationWatcher.Notify` em `/NotificationWatcher` de
 *    quem se registrou, a cada notificação, JÁ com o id dele. É o que o KDE
 *    Connect usa para espelhar no celular. O `dbus-monitor` da ilha vê a
 *    chamada do aplicativo, mas não o id que o servidor devolve — e sem o id
 *    não há como responder.
 * 2. **`Inhibit`** da especificação — o mesmo "não perturbe" que a ilha liga:
 *    o Plasma para de desenhar os balões dele, e os vigias CONTINUAM
 *    recebendo (medido: a notificação chegou ao vigia com o Plasma inibido).
 *    Vale enquanto a CONEXÃO que pediu estiver viva (o mesmo que
 *    `island/silencio.ts` descobriu): se o Halo cair, os balões do Plasma
 *    voltam sozinhos, sem nada preso.
 * 3. **`org.kde.NotificationManager.InvokeAction`** — o clique num botão do
 *    nosso balão chega ao aplicativo de origem pelo Plasma, como
 *    `ActionInvoked` (medido). É o que mantém "Responder", "Abrir" e cia.
 *    funcionando: o sinal sai do servidor, que é quem o aplicativo escuta.
 *
 * O que continua do Plasma, de propósito:
 *
 * - **notificação crítica.** Com o "não perturbe" ligado o Plasma AINDA
 *   desenha as críticas (medido: a crítica apareceu no canto, a normal não —
 *   é a opção `CriticalInDndMode`, ligada por padrão). Desenhar a nossa também
 *   daria duas. Então a crítica fica com ele, a não ser que o usuário tenha
 *   desligado aquela opção.
 * - **o "não perturbe" do applet.** Com ele ligado (`DoNotDisturb/Until` no
 *   `plasmanotifyrc`), o Halo também não desenha nada — é o usuário dizendo
 *   que não quer balão, e o balão ser nosso não muda isso.
 *
 * E a regra que torna tudo seguro: **o Halo só esconde os balões do Plasma
 * depois de ter onde desenhar os seus** (quem decide a ordem é
 * `notificacoes/index.ts`). Notificação que chega sem o Plasma inibido é dele,
 * e o Halo nem a guarda.
 */

const SERVICO = 'org.freedesktop.Notifications'
const CAMINHO = '/org/freedesktop/Notifications'
const KDE = 'org.kde.NotificationManager'
const VIGIA = '/NotificationWatcher'
const INTERFACE_DO_VIGIA = 'org.kde.NotificationWatcher'
/** Quantos balões o main segura. A janela desenha só os mais novos. */
const MAX_VIVOS = 20

type Bus = ReturnType<typeof dbus.sessionBus>
type Metodo = (...args: unknown[]) => Promise<unknown>

let bus: Bus | null = null
let fdo: dbus.ClientInterface | null = null
let kde: dbus.ClientInterface | null = null
/**
 * Quem é o servidor agora (nome único no barramento). Só ele pode chamar o
 * vigia: qualquer processo da sessão alcança `/NotificationWatcher`, e sem
 * esta conferência um programa qualquer desenharia balões falsos com a roupa
 * do Halo.
 */
let dono = ''
let cookie: number | null = null
/**
 * O applet do KDE derrubou o nosso "não perturbe" (o usuário desligou pelo
 * sino da bandeja). Os balões voltaram a ser do Plasma, e o Halo respeita:
 * não pede de novo sozinho — só quando o interruptor é religado ou o app
 * reabre.
 */
let revogado = false
/** O "não perturbe" da ilha, enquanto os balões são nossos. */
let silencio = false
const vivos = new Map<number, Aviso>()
let aoMudar: () => void = () => {}

function chamar(iface: dbus.ClientInterface | null, nome: string, ...args: unknown[]) {
  const fn = iface?.[nome] as Metodo | undefined
  if (!iface || !fn)
    return Promise.reject(new Error(`${nome} não existe no servidor de notificações`))
  return fn.apply(iface, args)
}

/* ——— O que o Plasma deixou escrito no plasmanotifyrc ——————————————— */

/**
 * O `plasmanotifyrc` do usuário, por grupo. SÓ LEITURA — e lido a cada
 * notificação, não guardado, porque o usuário muda o "não perturbe" pelo
 * applet a qualquer hora e ninguém nos avisa. É um arquivo de poucas linhas.
 */
function plasmanotifyrc(): Record<string, Record<string, string>> {
  const grupos: Record<string, Record<string, string>> = {}
  let atual: Record<string, string> = {}
  try {
    for (const linha of readFileSync(join(homedir(), '.config/plasmanotifyrc'), 'utf8').split(
      '\n',
    )) {
      const grupo = /^\[(.+)\]\s*$/.exec(linha)
      if (grupo?.[1]) {
        atual = {}
        grupos[grupo[1]] = atual
        continue
      }
      const par = /^([^=#]+)=(.*)$/.exec(linha)
      if (par?.[1]) atual[par[1].trim()] = (par[2] ?? '').trim()
    }
  } catch {
    // Sem arquivo: tudo no padrão do Plasma.
  }
  return grupos
}

/** O usuário pôs o Plasma em "não perturbe" pelo applet, até uma hora futura. */
export function naoPerturbeDoPlasma(): boolean {
  const ate = plasmanotifyrc().DoNotDisturb?.Until
  if (!ate) return false
  const quando = Date.parse(ate)
  return Number.isFinite(quando) && quando > Date.now()
}

/** O Plasma desenha as críticas mesmo inibido (o padrão dele é sim). */
function plasmaDesenhaCriticas(): boolean {
  return plasmanotifyrc().DoNotDisturb?.CriticalInDndMode !== 'false'
}

/** O tempo de um balão no Plasma desta sessão (5s, se o usuário não mexeu). */
function tempoDoPlasma(): number {
  const ms = Number(plasmanotifyrc().Notifications?.PopupTimeout)
  return Number.isFinite(ms) && ms >= 1000 ? ms : 5000
}

/* ——— Texto ——————————————————————————————————————————————————— */

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * A especificação permite um HTML mínimo no corpo (`<b>`, `<i>`, `<a>`,
 * `<img>`). O balão mostra TEXTO: marcação vinda de outro programa não vira
 * elemento na nossa janela — mesma regra do Markdown do Claude. As quebras de
 * linha ficam; o resto das tags sai.
 */
function textoPuro(bruto: string, max: number): string {
  return bruto
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (inteira, e: string) => {
      if (e.startsWith('#x')) return String.fromCodePoint(Number.parseInt(e.slice(2), 16) || 32)
      if (e.startsWith('#')) return String.fromCodePoint(Number(e.slice(1)) || 32)
      return ENTIDADES[e.toLowerCase()] ?? inteira
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

/**
 * Quanto o balão fica. A especificação diz: `0` = até ser dispensado; `-1` = o
 * servidor decide; positivo = aquilo. O "servidor decide" aqui é o tempo do
 * Plasma mais um tanto por caractere além da primeira linha — uma mensagem de
 * três linhas não some no tempo de um "Download concluído".
 */
function tempoDoBalao(expira: number, urgencia: UrgenciaDoAviso, texto: string): number | null {
  if (urgencia === 'critica' || expira === 0) return null
  if (expira > 0) return Math.min(60_000, Math.max(3000, expira))
  return Math.min(tempoDoPlasma() + Math.max(0, texto.length - 60) * 40, 15_000)
}

/* ——— O vigia ————————————————————————————————————————————————— */

type Dicas = Record<string, { value?: unknown } | undefined>

function montar(corpo: unknown[]): Aviso | null {
  const [id, app, , icone, titulo, texto, acoes, dicas, expira] = corpo as [
    number,
    string,
    number,
    string,
    string,
    string,
    string[],
    Dicas,
    number,
  ]
  if (!Number.isInteger(id) || id <= 0) return null
  const dica = (k: string) => dicas?.[k]?.value
  const nivel = Number(dica('urgency') ?? 1)
  const urgencia: UrgenciaDoAviso = nivel >= 2 ? 'critica' : nivel <= 0 ? 'baixa' : 'normal'

  const pares: AcaoDoAviso[] = []
  let temPadrao = false
  const lista = Array.isArray(acoes) ? acoes : []
  for (let i = 0; i + 1 < lista.length; i += 2) {
    const chave = String(lista[i])
    const rotulo = textoPuro(String(lista[i + 1] ?? ''), 40)
    if (chave === 'default') temPadrao = true
    // "inline-reply" pede um campo de texto que a gente devolveria por
    // `NotificationReplied` — sinal do SERVIDOR, que o Halo não é. Sem como
    // entregar a resposta, o botão não aparece; o clique no corpo abre o app.
    else if (chave !== 'inline-reply' && rotulo) pares.push({ chave, rotulo })
  }

  const desktop = typeof dica('desktop-entry') === 'string' ? String(dica('desktop-entry')) : ''
  const nomeDoIcone = typeof icone === 'string' ? icone.trim() : ''
  const iconeFinal =
    (nomeDoIcone
      ? nomeDoIcone.startsWith('/') || nomeDoIcone.startsWith('file://')
        ? imagemDoCaminho(nomeDoIcone)
        : iconeDoNome(nomeDoIcone)
      : null) ?? iconeDoDesktop(desktop)
  const bruta = dica('image-path') ?? dica('image_path')
  const caminhoDaImagem = typeof bruta === 'string' ? bruta.trim() : ''
  const ehCaminho = caminhoDaImagem.startsWith('/') || caminhoDaImagem.startsWith('file://')
  // `image-path` pode ser um NOME de ícone — é o que o `notify-send -i` manda
  // (medido: `-i org.kde.dolphin` chegou como `image-path`, com `app_icon`
  // vazio). Nome de ícone é ícone, não retrato: ele vai para o cabeçalho
  // quando o aplicativo não mandou outro, e a imagem grande fica para o que é
  // imagem de verdade — o avatar em pixels, a capa num arquivo.
  const iconeDaDica = caminhoDaImagem && !ehCaminho ? iconeDoNome(caminhoDaImagem) : null
  const imagem =
    imagemDosPixels(dica('image-data') ?? dica('image_data') ?? dica('icon_data')) ??
    (ehCaminho ? imagemDoCaminho(caminhoDaImagem) : iconeFinal ? iconeDaDica : null)
  const iconeDoCabecalho = iconeFinal ?? iconeDaDica

  const corpoLimpo = textoPuro(String(texto ?? ''), 600)
  const tituloLimpo = textoPuro(String(titulo ?? ''), 160)
  if (!tituloLimpo && !corpoLimpo) return null
  return {
    id,
    app: textoPuro(String(app ?? ''), 48),
    titulo: tituloLimpo,
    corpo: corpoLimpo,
    icone: iconeDoCabecalho,
    imagem,
    urgencia,
    acoes: pares.slice(0, 3),
    temPadrao,
    expiraMs: tempoDoBalao(Number(expira), urgencia, corpoLimpo),
    at: Date.now(),
  }
}

function chegou(corpo: unknown[]): void {
  // Sem o Plasma inibido, o balão é DELE — guardar aqui daria dois.
  if (cookie === null) return
  const aviso = montar(corpo)
  if (!aviso) return
  if (aviso.urgencia === 'critica' && plasmaDesenhaCriticas()) return
  if (silencio || naoPerturbeDoPlasma()) return
  // Substituição (`replaces_id`) chega com o MESMO id: o balão muda no lugar,
  // sem entrar de novo. `Map.set` numa chave que já existe mantém a posição.
  vivos.set(aviso.id, aviso)
  while (vivos.size > MAX_VIVOS) {
    const antigo = vivos.keys().next().value
    if (antigo === undefined) break
    vivos.delete(antigo)
  }
  aoMudar()
}

function saiu(id: number): void {
  if (vivos.delete(id)) aoMudar()
}

function tratar(msg: dbus.Message): boolean {
  if (msg.path !== VIGIA || msg.interface !== INTERFACE_DO_VIGIA) return false
  if (msg.sender !== dono) {
    // O `.d.ts` do dbus-next declara o primeiro argumento como `string`, mas a
    // implementação (`lib/message.js`) lê `msg.serial` e `msg.sender` dele: é
    // a mensagem que está sendo respondida. O tipo está errado, não o uso.
    const recusa = dbus.Message.newError(
      msg as unknown as string,
      'org.freedesktop.DBus.Error.AccessDenied',
      'só o servidor de notificações fala com este vigia',
    )
    bus?.send(recusa)
    return true
  }
  // Responde antes de trabalhar: o Plasma espera cada vigia, e resolver um
  // ícone no tema pode levar alguns milissegundos.
  bus?.send(dbus.Message.newMethodReturn(msg, '', []))
  if (msg.member === 'Notify') chegou(msg.body)
  else if (msg.member === 'CloseNotification') saiu(Number(msg.body[0]))
  return true
}

/* ——— Ligar e desligar ——————————————————————————————————————————— */

/**
 * Conecta, registra o vigia e escuta o servidor. NÃO inibe: isso é
 * `inibir()`, chamado quando a janela já pode desenhar. Lança se o servidor
 * não for o do Plasma (sem `org.kde.NotificationManager` não há vigia, e sem
 * vigia o Halo não esconde balão nenhum).
 */
export async function ligarServidor(mudou: () => void): Promise<void> {
  aoMudar = mudou
  if (bus) return
  const novo = dbus.sessionBus()
  // Um erro da conexão não pode derrubar o main.
  novo.on('error', () => {})
  try {
    const objeto = await novo.getProxyObject(SERVICO, CAMINHO)
    const f = objeto.getInterface(SERVICO)
    const k = objeto.getInterface(KDE)
    const props = objeto.getInterface('org.freedesktop.DBus.Properties')
    const barramento = (
      await novo.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus')
    ).getInterface('org.freedesktop.DBus')
    dono = String(await chamar(barramento, 'GetNameOwner', SERVICO))
    novo.addMethodHandler(tratar)
    bus = novo
    fdo = f
    kde = k
    await chamar(k, 'RegisterWatcher')

    f.on('NotificationClosed', (id: number) => saiu(Number(id)))
    // O applet desligou o "não perturbe" por cima do nosso: os balões voltaram
    // a ser do Plasma, e os nossos saem da tela para não haver dois.
    props.on('PropertiesChanged', (iface: string, mudado: Dicas) => {
      if (iface !== SERVICO || mudado.Inhibited?.value !== false || cookie === null) return
      cookie = null
      revogado = true
      vivos.clear()
      aoMudar()
    })
    // O plasmashell reiniciou (tema trocado, travou): o vigia e o silêncio
    // eram do processo antigo. Registra de novo, e pede o silêncio de novo se
    // o tínhamos — senão o Halo desenharia para ninguém.
    barramento.on('NameOwnerChanged', (nome: string, _antigo: string, atual: string) => {
      if (nome !== SERVICO || !atual) return
      dono = atual
      const tinha = cookie !== null
      cookie = null
      vivos.clear()
      void chamar(kde, 'RegisterWatcher')
        .then(() => (tinha ? inibir() : false))
        .catch(() => {})
        .finally(() => aoMudar())
    })
  } catch (erro) {
    bus = null
    fdo = null
    kde = null
    novo.disconnect()
    throw erro
  }
}

/** Esconde os balões do Plasma. Só depois de a janela dos avisos estar pronta. */
export async function inibir(): Promise<boolean> {
  if (!fdo) return false
  if (cookie !== null) return true
  revogado = false
  cookie = Number(
    await chamar(
      fdo,
      'Inhibit',
      'halo-spatial-os',
      t('O Halo desenha as notificações no estilo do ambiente'),
      {},
    ),
  )
  aoMudar()
  return true
}

/** Devolve os balões ao Plasma, na hora. */
export async function desinibir(): Promise<void> {
  if (cookie === null) return
  const c = cookie
  // Zerado ANTES da chamada: o `PropertiesChanged` que ela provoca não pode
  // ser lido como revogação do applet.
  cookie = null
  vivos.clear()
  aoMudar()
  await chamar(fdo, 'UnInhibit', c).catch(() => {})
}

export async function desligarServidor(): Promise<void> {
  await desinibir()
  if (!bus) return
  await chamar(kde, 'UnRegisterWatcher').catch(() => {})
  bus.disconnect()
  bus = null
  fdo = null
  kde = null
  dono = ''
  revogado = false
  silencio = false
  vivos.clear()
}

/* ——— Os gestos da janela ——————————————————————————————————————— */

/** Os balões vivos, o mais novo primeiro. */
export const listaDeAvisos = (): Aviso[] => [...vivos.values()].reverse()

export async function agirNoAviso(id: number, chave: string): Promise<void> {
  const aviso = vivos.get(id)
  if (!aviso) return
  if (chave !== 'default' && !aviso.acoes.some((a) => a.chave === chave)) return
  vivos.delete(id)
  aoMudar()
  await chamar(kde, 'InvokeAction', id, chave).catch(() => {})
}

/** O X do balão: sai do histórico também, como o X do balão do Plasma. */
export async function fecharAviso(id: number): Promise<void> {
  if (!vivos.delete(id)) return
  aoMudar()
  await chamar(fdo, 'CloseNotification', id).catch(() => {})
}

/** O tempo acabou: o balão sai da tela, e no histórico do Plasma ele continua. */
export function esquecerAviso(id: number): void {
  saiu(id)
}

export const estadoDoServidor = () => ({
  dePe: bus !== null,
  inibido: cookie !== null,
  revogado,
  silencio,
})

/** O "não perturbe" da ilha, quando os balões são nossos. */
export function alternarSilencioDosAvisos(): boolean {
  silencio = !silencio
  if (silencio) vivos.clear()
  aoMudar()
  return silencio
}

export const silencioDosAvisos = (): boolean => silencio

/**
 * Uma notificação DE VERDADE, pelo Plasma — é o botão "Mostrar um exemplo" da
 * tela de Configurações. Ela percorre o caminho inteiro (Plasma → vigia →
 * janela), então o que aparece é exatamente o que um aplicativo veria.
 */
export async function mandarExemplo(ambiente: string): Promise<void> {
  const proprio = !bus
  const conexao = bus ?? dbus.sessionBus()
  try {
    const f = fdo ?? (await conexao.getProxyObject(SERVICO, CAMINHO)).getInterface(SERVICO)
    await chamar(
      f,
      'Notify',
      'Halo',
      0,
      'halo-spatial-os',
      t('Assim chegam os avisos no {ambiente}', { ambiente }),
      t(
        'Cada notificação do sistema passa a vestir o tema do ambiente. Troque de ambiente na home e mande outro exemplo.',
      ),
      ['default', t('Abrir'), 'ok', t('Entendi')],
      {
        urgency: new dbus.Variant('y', 1),
        'desktop-entry': new dbus.Variant('s', 'halo-spatial-os'),
      },
      -1,
    )
  } finally {
    if (proprio) conexao.disconnect()
  }
}
