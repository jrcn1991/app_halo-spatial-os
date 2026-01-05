import { useEffect, useState } from 'react'
import { repositories } from '@/data'
import type { NewsResult } from '@/domain/types'
import { useHalo } from '@/store/useHalo'
import { type Async, useAsync } from './useAsync'

/** Mesmo intervalo do cache no main: pedir mais que isso não traz novidade. */
const REFRESH_MS = 15 * 60 * 1000

/**
 * Manchetes dos feeds configurados. A tela não sabe (nem precisa) de onde vêm.
 *
 * Refaz a busca quando a lista de feeds muda e a cada 15 minutos — é o
 * "periódico" da coluna de leitura. A rotação entre as manchetes, que é
 * coisa de segundos, fica na tela: ela não pede nada novo, só mostra outra.
 */
export function useNews(): Async<NewsResult> {
  const feeds = useHalo((s) => s.newsFeeds)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  return useAsync(() => repositories.news.headlines(feeds), [feeds, tick])
}
