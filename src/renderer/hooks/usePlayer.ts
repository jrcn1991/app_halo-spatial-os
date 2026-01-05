import { useEffect, useState } from 'react'
import { repositories } from '@/data'
import type { NowPlaying } from '@/domain/types'
import { type Async, useAsync } from './useAsync'

/** A posição da faixa anda; 2s mantém a barra viva sem custar caro. */
const POLL_MS = 2000

/**
 * O que está tocando agora.
 *
 * `data: null` sem erro significa "nenhum player aberto" — é estado normal,
 * não falha, e a tela mostra isso em vez de fingir uma faixa.
 */
export function useNowPlaying(): Async<NowPlaying | null> {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), POLL_MS)
    return () => clearInterval(id)
  }, [])

  return useAsync(() => repositories.player.nowPlaying(), [tick])
}
