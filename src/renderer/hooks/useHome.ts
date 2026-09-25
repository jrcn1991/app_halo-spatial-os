import { useEffect, useState } from 'react'
import { repositories } from '@/data'
import type { DesktopApp, Notifications } from '@/domain/types'
import { type Async, useAsync } from './useAsync'

export function useApps(): Async<DesktopApp[]> {
  return useAsync(() => repositories.apps.list(), [])
}

/** Abre um aplicativo instalado pelo id do `.desktop`. */
export function useLaunchApp(): (id: string) => Promise<void> {
  return repositories.apps.launch
}

/**
 * As notificações do sistema, e o aviso de quando elas mudam.
 *
 * O `nonce` é o que torna a coluna VIVA: sem ele o hook buscaria uma vez na
 * montagem e a tela ficaria parada — medido, ela dizia "nada por aqui" com
 * duas notificações já na lista. Fora do Electron não há a quem escutar, e o
 * mock devolve um cancelador que não faz nada.
 */
export function useNotifications(): Async<Notifications> {
  const [nonce, setNonce] = useState(0)

  useEffect(() => repositories.homeFeed.onChanged(() => setNonce((n) => n + 1)), [])

  return useAsync(() => repositories.homeFeed.notifications(), [nonce])
}
