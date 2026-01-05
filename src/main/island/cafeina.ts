import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import dbus from 'dbus-next'

/**
 * Cafeína: manter a tela acordada.
 *
 * O "Caffeinate" dos apps de notch do macOS. No KDE é o `Inhibit` de
 * `org.freedesktop.ScreenSaver` — o mesmo que um player de vídeo pede — e,
 * como o "não perturbe" (ver `silencio.ts`), vale enquanto a conexão que
 * pediu estiver viva: medido em 31/08/2026, o cookie devolvido ao `busctl`
 * sumia da lista no instante em que o comando acabava. Por isso a conexão é
 * do `dbus-next`, mantida pelo main.
 *
 * A leitura vem de `ListInhibitions` do PolicyAgent do KDE, que diz QUEM está
 * segurando a tela e por quê — a ilha mostra isso em vez de só "ligado".
 */

const run = promisify(execFile)

let bus: ReturnType<typeof dbus.sessionBus> | null = null
let cookie: number | null = null
/** Solta sozinho quando a cafeína foi pedida por um tempo ("por 1 hora"). */
let soltar: ReturnType<typeof setTimeout> | undefined
/** Quando solta, se foi por tempo (epoch ms); `null` = até desligar. */
let ate: number | null = null

async function metodo(nome: 'Inhibit' | 'UnInhibit') {
  bus ??= dbus.sessionBus()
  const objeto = await bus.getProxyObject('org.freedesktop.ScreenSaver', '/ScreenSaver')
  const fn = objeto.getInterface('org.freedesktop.ScreenSaver')[nome] as
    | ((...args: unknown[]) => Promise<unknown>)
    | undefined
  if (!fn) throw new Error(`org.freedesktop.ScreenSaver.${nome} não existe`)
  return fn
}

/**
 * Liga ou desliga. Com `minutos`, liga por esse tempo e solta sozinha — o
 * "until 6:30 PM" do Notchy; ligada sem tempo, fica até desligar.
 */
export async function alternarCafeina(minutos?: number): Promise<boolean> {
  clearTimeout(soltar)
  if (cookie !== null && !minutos) {
    await (await metodo('UnInhibit'))(cookie)
    cookie = null
    ate = null
    return false
  }
  if (cookie === null) {
    cookie = Number(await (await metodo('Inhibit'))('halo-spatial-os', 'Cafeína pedida na ilha'))
  }
  if (minutos && minutos > 0) {
    ate = Date.now() + minutos * 60_000
    soltar = setTimeout(() => void alternarCafeina().catch(() => {}), minutos * 60_000)
  } else ate = null
  return true
}

export const cafeinaNossa = (): boolean => cookie !== null
export const cafeinaAte = (): number | null => ate

/** Quem está segurando a tela acordada agora, pelo PolicyAgent do KDE. */
export async function inibicoes(): Promise<{ quem: string; motivo: string }[]> {
  const { stdout } = await run(
    'busctl',
    [
      '--user',
      '--json=short',
      'call',
      'org.kde.Solid.PowerManagement.PolicyAgent',
      '/org/kde/Solid/PowerManagement/PolicyAgent',
      'org.kde.Solid.PowerManagement.PolicyAgent',
      'ListInhibitions',
    ],
    { timeout: 3000 },
  )
  const dados = (JSON.parse(stdout) as { data: string[][][] }).data[0] ?? []
  return dados.map(([quem = '', motivo = '']) => ({
    quem: quem.split('/').at(-1) ?? quem,
    motivo,
  }))
}
