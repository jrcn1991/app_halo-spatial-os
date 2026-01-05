import { useRef } from 'react'
import type { Monitor } from '@/domain/types'

/** Quantas medições a sparkline do handoff mostra. */
const POINTS = 12

/**
 * Guarda as últimas latências de cada monitor.
 *
 * A sparkline do protótipo é decorativa; aqui ela mostra medição de verdade —
 * mas para isso alguém precisa lembrar do passado, e a API só dá o agora. O
 * histórico vive em memória e recomeça a cada abertura, que é honesto: não
 * inventamos passado que não medimos.
 */
export function useLatencyHistory(monitors: Monitor[] | null): Map<string, number[]> {
  const history = useRef(new Map<string, number[]>())
  const lastSeen = useRef<Monitor[] | null>(null)

  if (monitors && monitors !== lastSeen.current) {
    lastSeen.current = monitors
    for (const monitor of monitors) {
      const series = history.current.get(monitor.name) ?? []
      series.push(monitor.latencyMs ?? 0)
      history.current.set(monitor.name, series.slice(-POINTS))
    }
  }

  return history.current
}
