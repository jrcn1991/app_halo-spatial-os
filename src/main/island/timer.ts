import { t } from '@shared/i18n'
import type { IslandEvent, IslandTimer } from '@shared/island'
import { avisar } from './actions'
import { registrarFoco } from './foco'

/**
 * O temporizador da ilha.
 *
 * Um só, e no main: com "Todas" em Configurações há uma ilha por tela, e cada
 * uma precisa mostrar a MESMA contagem. O renderer recebe o instante em que
 * termina e conta sozinho, segundo a segundo — o instantâneo bate a cada 2s,
 * o que seria uma contagem aos trancos.
 *
 * Quando acaba, a ilha anuncia e o KDE também recebe uma notificação: o
 * usuário pode estar em outra tela, e a pílula alargada não gritaria por ele.
 */

let vivo: IslandTimer | null = null
let relogio: ReturnType<typeof setTimeout> | undefined
let anunciar: ((evento: IslandEvent) => void) | null = null

export function bindTimer(aoAnunciar: (evento: IslandEvent) => void): void {
  anunciar = aoAnunciar
}

/** Começa (ou recomeça) a contagem. Minutos fora do razoável são recusados. */
export function startTimer(minutos: number, label = ''): IslandTimer {
  if (!Number.isFinite(minutos) || minutos <= 0 || minutos > 24 * 60) {
    throw new Error(t('minutos entre 1 e 1440'))
  }
  clearTimeout(relogio)
  const ms = Math.round(minutos * 60_000)
  const agora = Date.now()
  vivo = { end: agora + ms, start: agora, label: label.slice(0, 40), minutes: minutos }
  relogio = setTimeout(terminou, ms)
  return vivo
}

/** O cronômetro: conta para cima até ser parado. */
export function startStopwatch(label = ''): IslandTimer {
  clearTimeout(relogio)
  relogio = undefined
  vivo = { end: null, start: Date.now(), label: label.slice(0, 40), minutes: 0 }
  return vivo
}

export function stopTimer(): void {
  clearTimeout(relogio)
  relogio = undefined
  vivo = null
}

export const timerState = (): IslandTimer | null => vivo

function terminou(): void {
  const acabado = vivo
  vivo = null
  if (!acabado) return
  // Chegou ao fim: conta como sessão de foco (ver `foco.ts`).
  registrarFoco(acabado.minutes)
  const detalhe = acabado.label || `${acabado.minutes} min`
  anunciar?.({
    icon: 'Timer',
    text: t('Tempo esgotado'),
    detail: detalhe,
    level: 'alerta',
    kind: 'aviso',
    ttlMs: 6000,
  })
  void avisar(t('Tempo esgotado'), detalhe).catch(() => {})
}
