import { useCallback, useState } from 'react'
import { repositories } from '@/data'
import type { DirectoryListing, Favorite, Mount, StorageInfo } from '@/domain/types'
import { type Async, useAsync } from './useAsync'

/** Navegação real pela pasta do usuário. O main não deixa sair dela. */
export function useDirectory(): Async<DirectoryListing> & {
  open: (path: string) => void
  path: string | undefined
} {
  const [path, setPath] = useState<string | undefined>(undefined)
  const open = useCallback((next: string) => setPath(next), [])
  const state = useAsync(() => repositories.files.list(path), [path])
  return { ...state, open, path }
}

export function useStorage(path?: string): Async<StorageInfo> {
  return useAsync(() => repositories.files.storage(path), [path])
}

export function useMounts(): Async<Mount[]> {
  return useAsync(() => repositories.files.mounts(), [])
}

export function useFavorites(): Async<Favorite[]> {
  return useAsync(() => repositories.files.favorites(), [])
}
