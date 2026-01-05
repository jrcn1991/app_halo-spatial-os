import { useEffect, useState } from 'react'
import { repositories } from '@/data'
import type { Weather } from '@/domain/types'
import { useHalo } from '@/store/useHalo'
import { type Async, useAsync } from './useAsync'

/** Mesmo intervalo do cache no main: pedir mais que isso não traz novidade. */
const REFRESH_MS = 10 * 60 * 1000

/** Sem cidade escolhida não há o que buscar — o cartão pede uma. */
export class SemCidade extends Error {}

/** Clima do lugar configurado. A tela não sabe (nem precisa) de onde vem. */
export function useWeather(): Async<Weather> {
  const place = useHalo((s) => s.widgets.weather.place)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  return useAsync(
    () => (place ? repositories.weather.current(place) : Promise.reject(new SemCidade())),
    [place, tick],
  )
}
