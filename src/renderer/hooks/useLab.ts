import { useEffect, useState } from 'react'
import { repositories } from '@/data'
import type { Container, HostStats, Machine, Monitor } from '@/domain/types'
import { type Async, useAsync } from './useAsync'

/** Estado da máquina muda o tempo todo; 3s é vivo sem ser desperdício. */
const HOST_MS = 3000
/** Containers mudam devagar. */
const CONTAINERS_MS = 10_000

function useTick(period: number): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), period)
    return () => clearInterval(id)
  }, [period])
  return tick
}

export function useHost(): Async<HostStats> {
  const tick = useTick(HOST_MS)
  return useAsync(() => repositories.lab.host(), [tick])
}

export function useMachines(): Async<Machine[]> {
  const tick = useTick(HOST_MS)
  return useAsync(() => repositories.lab.machines(), [tick])
}

export function useContainers(): Async<Container[]> {
  const tick = useTick(CONTAINERS_MS)
  return useAsync(() => repositories.lab.containers(), [tick])
}

export function useMonitors(): Async<Monitor[]> {
  const tick = useTick(CONTAINERS_MS)
  return useAsync(() => repositories.lab.monitors(), [tick])
}
