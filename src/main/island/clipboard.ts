import type { IslandClip } from '@shared/island'
import dbus from 'dbus-next'
import { clipboard } from 'electron'

/**
 * O histórico da área de transferência.
 *
 * O "clipboard shelf" dos apps de notch: cada cópia vira um item que dá para
 * pegar de volta depois. O main olha a área de transferência a cada segundo
 * enquanto a ilha está de pé — o mesmo que o Klipper do KDE faz.
 *
 * De onde se lê, e por que não é do Electron: a ilha roda pelo Xwayland, e o
 * KWin só entrega o clipboard Wayland a um cliente X11 ENQUANTO UMA JANELA
 * X11 ESTÁ ATIVA — é proteção deliberada contra janelas X bisbilhoteiras. A
 * ilha nunca tem foco, então `clipboard.readText()` devolvia vazio com o
 * Klipper cheio (medido em 31/08/2026). O Klipper expõe o conteúdo pelo
 * D-Bus (`org.kde.klipper.klipper`), e é ele que se pergunta; fora do KDE,
 * sem Klipper, o Electron continua como reserva.
 *
 * Duas regras de privacidade, e as duas são deliberadas:
 *
 * - **Memória, nunca disco.** Senhas e tokens passam pela área de
 *   transferência o dia inteiro; um histórico em arquivo seria um cofre
 *   aberto. Ele morre com o app.
 * - **Gerenciador de senhas manda.** O KeePassXC, o Bitwarden e o próprio
 *   Klipper marcam a cópia com `x-kde-passwordManagerHint`; o Klipper já
 *   nem guarda essas, e o caminho pelo Electron confere a marca.
 */

/* 5s, e não 1s: o sinal do Klipper é o caminho normal; a sondagem é o
   fallback para quando ele não emite (DESEMPENHO.md, P2-9). */
const RITMO_MS = 5000
const MAXIMO = 30
/** O que viaja para a tela. O texto inteiro fica aqui, para colar de volta. */
const PREVIA = 160

let relogio: ReturnType<typeof setInterval> | undefined
let ultimo = ''
let sequencia = 0
const itens: (IslandClip & { texto: string })[] = []

/* ——— Klipper (KDE) ou Electron ————————————————————————— */

let bus: ReturnType<typeof dbus.sessionBus> | null = null
/** `null` = ainda não se sabe; `false` = não há Klipper nesta sessão. */
let klipper: dbus.ClientInterface | false | null = null

async function klipperInterface(): Promise<dbus.ClientInterface | false> {
  if (klipper !== null) return klipper
  try {
    bus ??= dbus.sessionBus()
    const objeto = await bus.getProxyObject('org.kde.klipper', '/klipper')
    klipper = objeto.getInterface('org.kde.klipper.klipper')
    // O Klipper AVISA quando o histórico muda (`clipboardHistoryUpdated`): a
    // leitura acontece no sinal, e o relógio abaixo vira rede de segurança.
    klipper.on('clipboardHistoryUpdated', () => void olhar())
  } catch {
    klipper = false
  }
  return klipper
}

async function lerTexto(): Promise<string> {
  const k = await klipperInterface()
  if (k) {
    const fn = k.getClipboardContents as (() => Promise<string>) | undefined
    if (fn) return String((await fn()) ?? '')
  }
  if (await clipboard.has('x-kde-passwordManagerHint')) return ''
  return clipboard.readText()
}

async function escreverTexto(texto: string): Promise<void> {
  const k = await klipperInterface()
  if (k) {
    const fn = k.setClipboardContents as ((t: string) => Promise<void>) | undefined
    if (fn) {
      await fn(texto)
      return
    }
  }
  await clipboard.writeText(texto)
}

/** A espécie de um trecho: endereço, cor, e-mail ou texto qualquer. */
function especie(texto: string): IslandClip['kind'] {
  if (/^https?:\/\/\S+$/.test(texto)) return 'url'
  if (/^(#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(texto))
    return 'cor'
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) return 'email'
  return 'texto'
}

/* ——— O vigia ———————————————————————————————————————————— */

/** Uma leitura por vez: o relógio bate a cada segundo, e a leitura é assíncrona. */
let lendo = false

async function olhar(): Promise<void> {
  if (lendo) return
  lendo = true
  let texto: string
  try {
    texto = await lerTexto()
  } catch {
    return
  } finally {
    lendo = false
  }
  if (!texto || texto === ultimo || texto.length > 200_000) return
  ultimo = texto
  const limpo = texto.trim()
  if (!limpo) return

  // A mesma coisa copiada de novo sobe para o topo, sem duplicar.
  const repetido = itens.findIndex((i) => i.texto === texto)
  if (repetido >= 0) {
    const [item] = itens.splice(repetido, 1)
    if (item) itens.unshift({ ...item, at: Date.now() })
    return
  }
  itens.unshift({
    id: ++sequencia,
    at: Date.now(),
    preview: limpo.replace(/\s+/g, ' ').slice(0, PREVIA),
    length: texto.length,
    kind: especie(limpo),
    pinned: false,
    texto,
  })
  // Os fixados ficam; o resto cai pelo fim.
  while (itens.length > MAXIMO) {
    const solto = itens
      .map((i, n) => (i.pinned ? -1 : n))
      .filter((n) => n >= 0)
      .at(-1)
    if (solto === undefined) break
    itens.splice(solto, 1)
  }
}

export function startClipboardWatch(): void {
  if (relogio) return
  // O que já estava lá quando a ilha subiu não é novidade.
  void lerTexto()
    .then((t) => {
      ultimo = t
    })
    .catch(() => {})
  relogio = setInterval(() => void olhar(), RITMO_MS)
}

export function stopClipboardWatch(): void {
  clearInterval(relogio)
  relogio = undefined
}

export const clipboardWatching = (): boolean => relogio !== undefined

/** De onde o histórico está lendo, para a leitura do catálogo dizer. */
export const clipboardSource = (): 'klipper' | 'electron' | 'desconhecido' =>
  klipper === null ? 'desconhecido' : klipper ? 'klipper' : 'electron'

/** O texto inteiro do item mais recente — para o Claude da ilha ler o que foi copiado. */
export const clipUltimoTexto = (): string => itens[0]?.texto ?? ''

/** O que a tela vê: sem o texto inteiro. */
export const clipsList = (): IslandClip[] => itens.map(({ texto: _texto, ...resto }) => resto)

/** Põe um item de volta na área de transferência. */
export async function clipCopiar(id: number): Promise<void> {
  const item = itens.find((i) => i.id === id)
  if (!item) throw new Error('item não está mais no histórico')
  ultimo = item.texto
  await escreverTexto(item.texto)
}

/** Põe um texto qualquer na área de transferência (o "copiar link" da faixa). */
export async function clipEscrever(texto: string): Promise<void> {
  ultimo = texto
  await escreverTexto(texto)
}

export function clipFixar(id: number): void {
  const item = itens.find((i) => i.id === id)
  if (!item) throw new Error('item não está mais no histórico')
  item.pinned = !item.pinned
}

export function clipRemover(id: number): void {
  const n = itens.findIndex((i) => i.id === id)
  if (n >= 0) itens.splice(n, 1)
}

/** Limpa o histórico. Os fixados ficam — foram escolha explícita. */
export function clipLimpar(): void {
  for (let n = itens.length - 1; n >= 0; n -= 1) if (!itens[n]?.pinned) itens.splice(n, 1)
}
