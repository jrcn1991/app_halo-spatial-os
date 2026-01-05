import { useEffect, useState } from 'react'
import { repositories } from '@/data'
import type { DesktopApp, Notifications } from '@/domain/types'
import { type Async, useAsync } from './useAsync'

export function useApps(): Async<DesktopApp[]> {
  return useAsync(() => repositories.apps.list(), [])
}

/**
 * As notificações do sistema, e o aviso de quando elas mudam.
 *
 * O `nonce` é o que torna a coluna VIVA: sem ele o hook buscaria uma vez na
 * montagem e a tela ficaria parada — medido, ela dizia "nada por aqui" com
 * duas notificações já na lista. Fora do Electron não há a quem escutar, e o
 * efeito simplesmente não assina nada.
 */
export function useNotifications(): Async<Notifications> {
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const api = globalThis.window?.halo
    if (!api) return
    return api.island.onNoticesChanged(() => setNonce((n) => n + 1))
  }, [])

  return useAsync(() => repositories.homeFeed.notifications(), [nonce])
}
