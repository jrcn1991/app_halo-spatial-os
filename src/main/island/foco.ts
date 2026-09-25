import { t } from '@shared/i18n'
import type { FocusSession, Reading } from '@shared/island'
import { currentSettings, saveIslandFocus } from '../settings'

/**
 * As estatísticas de foco: o gráfico de sete dias e a sequência do Notchy.
 *
 * Uma sessão conta quando um temporizador de 5 minutos ou mais CHEGA AO FIM
 * — parar no meio não conta, e o cronômetro também não: foco é o tempo que
 * a pessoa se comprometeu e cumpriu. O histórico vive em `island.focus` no
 * `settings.json`, escrito pelo main quando o temporizador acaba e
 * preservado em `saveSettings`, como a gaveta e a nota.
 */

/** Menos que isto é um lembrete, não uma sessão. */
const MINIMO_MIN = 5

export function registrarFoco(minutos: number): void {
  if (!Number.isFinite(minutos) || minutos < MINIMO_MIN) return
  const atual = currentSettings().island.focus
  saveIslandFocus([...atual, { at: Date.now(), minutes: Math.round(minutos) }])
}

export function limparFoco(): void {
  saveIslandFocus([])
}

/** O dia local de um instante, como `2026-09-02`. */
const dia = (at: number) => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type ResumoDeFoco = {
  hojeMin: number
  hojeSessoes: number
  /** Minutos por dia, do mais antigo (há 6 dias) até hoje. */
  semana: number[]
  /** Dias seguidos com pelo menos uma sessão, contando hoje ou ontem. */
  sequencia: number
  total: number
}

export function resumoDeFoco(
  sessoes: FocusSession[] = currentSettings().island.focus,
): ResumoDeFoco {
  const porDia = new Map<string, number>()
  for (const s of sessoes) porDia.set(dia(s.at), (porDia.get(dia(s.at)) ?? 0) + s.minutes)

  const hoje = dia(Date.now())
  const semana: number[] = []
  for (let n = 6; n >= 0; n -= 1) {
    semana.push(porDia.get(dia(Date.now() - n * 86_400_000)) ?? 0)
  }

  // A sequência: hoje conta se já houve sessão; senão começa em ontem, para
  // o dia de hoje ainda em curso não zerar o que foi construído.
  let sequencia = 0
  let cursor = porDia.has(hoje) ? 0 : 1
  while (porDia.has(dia(Date.now() - cursor * 86_400_000))) {
    sequencia += 1
    cursor += 1
  }

  return {
    hojeMin: porDia.get(hoje) ?? 0,
    hojeSessoes: sessoes.filter((s) => dia(s.at) === hoje).length,
    semana,
    sequencia,
    total: sessoes.length,
  }
}

const horas = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}` : ''}` : `${min} min`

export async function foco(): Promise<Reading[]> {
  const r = resumoDeFoco()
  const semanaMin = r.semana.reduce((a, b) => a + b, 0)
  return [
    {
      id: 'foco-hoje',
      label: t('Foco hoje'),
      value: horas(r.hojeMin),
      detail:
        r.hojeSessoes === 0
          ? t('nenhuma sessão ainda — 25 · foco na home')
          : t(r.hojeSessoes === 1 ? '{n} sessão' : '{n} sessões', { n: r.hojeSessoes }),
      ratio: null,
      level: 'ok',
    },
    {
      id: 'foco-semana',
      label: t('Últimos 7 dias'),
      value: horas(semanaMin),
      // Minutos por dia, do mais antigo para hoje: é o gráfico da home.
      detail: r.semana.join('·'),
      ratio: null,
      level: 'ok',
    },
    {
      id: 'foco-sequencia',
      label: t('Sequência'),
      value: t(r.sequencia === 1 ? '{n} dia' : '{n} dias', { n: r.sequencia }),
      detail:
        r.sequencia > 0
          ? t('seguidos com pelo menos uma sessão')
          : t('{n} sessões no total', { n: r.total }),
      ratio: null,
      level: 'ok',
    },
  ]
}
