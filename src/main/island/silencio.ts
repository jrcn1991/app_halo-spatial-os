import { t } from '@shared/i18n'
import dbus from 'dbus-next'
import {
  alternarSilencioDosAvisos,
  avisosDoHalo,
  emSilencioComAvisos,
  silencioDosAvisos,
} from '../notificacoes'

/**
 * "Não perturbe" de verdade, pelo servidor de notificações do KDE.
 *
 * A especificação de notificações tem `Inhibit(desktop_entry, reason, hints)`
 * → cookie, e o Plasma a implementa: é o que o applet faz quando o usuário
 * liga "Não perturbe". O detalhe que custou uma medição (31/08/2026): a
 * inibição vale ENQUANTO A CONEXÃO QUE PEDIU ESTIVER VIVA — pelo `busctl` ela
 * some no instante em que o comando termina (`Inhibited` voltou a `false`).
 * Por isso a conexão é do `dbus-next`, que o main mantém aberta, e o cookie
 * fica guardado para o `UnInhibit`.
 */

const SERVICO = 'org.freedesktop.Notifications'
const CAMINHO = '/org/freedesktop/Notifications'

let bus: ReturnType<typeof dbus.sessionBus> | null = null
let cookie: number | null = null

/**
 * Um método de uma interface do `dbus-next`. A biblioteca os expõe por índice
 * (`iface[nome]`), então o tipo diz "talvez indefinido" — um método que o
 * servidor não anuncia é erro dito, não chamada em `undefined`.
 */
async function metodo(interfaceNome: string, nome: string) {
  bus ??= dbus.sessionBus()
  const objeto = await bus.getProxyObject(SERVICO, CAMINHO)
  const fn = objeto.getInterface(interfaceNome)[nome] as
    | ((...args: unknown[]) => Promise<unknown>)
    | undefined
  if (!fn) throw new Error(`${interfaceNome}.${nome} não existe no servidor de notificações`)
  return fn
}

/** Se o KDE está silenciando as notificações agora (por nós ou pelo applet). */
export async function estaEmSilencio(): Promise<boolean> {
  // Com os balões desenhados pelo Halo, o `Inhibited` do servidor fica ligado
  // o tempo todo — é assim que os do Plasma se escondem. Ele deixou de dizer
  // "não perturbe"; quem diz é o silêncio dos avisos (ver `notificacoes/`).
  if (avisosDoHalo()) return emSilencioComAvisos()
  const get = await metodo('org.freedesktop.DBus.Properties', 'Get')
  const valor = (await get(SERVICO, 'Inhibited')) as { value: unknown }
  return Boolean(valor.value)
}

/** Liga ou desliga o silêncio. Ligar duas vezes não empilha cookies. */
export async function alternarSilencio(): Promise<boolean> {
  // Os balões são nossos: o "não perturbe" da ilha cala a janela dos avisos. O
  // Plasma já está inibido — pedir de novo não mudaria nada na tela.
  if (avisosDoHalo()) return alternarSilencioDosAvisos()
  if (cookie !== null) {
    const unInhibit = await metodo(SERVICO, 'UnInhibit')
    await unInhibit(cookie)
    cookie = null
    return false
  }
  if (await estaEmSilencio()) {
    // Foi o applet que ligou: não temos cookie, e desligar o dele não é nosso.
    throw new Error(t('o KDE já está em "não perturbe" — desligue pelo applet'))
  }
  const inhibit = await metodo(SERVICO, 'Inhibit')
  cookie = Number(await inhibit('halo-spatial-os', t('Foco pedido na ilha'), {}))
  return true
}

/** Se fomos NÓS que silenciamos (temos o cookie). */
export const silencioNosso = (): boolean =>
  cookie !== null || (avisosDoHalo() && silencioDosAvisos())
