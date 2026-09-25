import type { CatalogEntry } from '@shared/island'
import { repositories } from '@/data'
import { type Async, useAsync } from './useAsync'

/** As telas onde a ilha pode morar. Vazio fora do Electron. */
export function useDisplays(): Async<{ id: string; label: string; primary: boolean }[]> {
  return useAsync(() => repositories.islandSettings.displays(), [])
}

/** As integrações que a ilha conhece. */
export function useIslandCatalog(): Async<CatalogEntry[]> {
  return useAsync(() => repositories.islandSettings.catalog(), [])
}
