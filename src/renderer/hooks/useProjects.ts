import { useEffect, useState } from 'react'
import { repositories } from '@/data'
import type { Project } from '@/domain/types'
import { type Async, useAsync } from './useAsync'

export function useProjects(): Async<Project[]> {
  return useAsync(() => repositories.projects.list(), [])
}

/**
 * O que o git sabe de cada pasta fixada.
 *
 * Uma busca por caminho, num mapa só: a tela do Claude aceita qualquer pasta
 * como projeto, e as que não são repositório simplesmente não aparecem aqui —
 * "sem git" é informação, não falha.
 */
export function useProjectInfos(paths: string[]): Map<string, Project> {
  const [infos, setInfos] = useState<Map<string, Project>>(new Map())
  const chave = paths.join('|')

  // A chave é o que identifica o conjunto; o array é novo a cada render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ver acima
  useEffect(() => {
    let vivo = true
    void Promise.all(
      paths.map(async (path) => [path, await repositories.projects.info(path)] as const),
    ).then((pares) => {
      if (!vivo) return
      const mapa = new Map<string, Project>()
      for (const [path, info] of pares) if (info) mapa.set(path, info)
      setInfos(mapa)
    })
    return () => {
      vivo = false
    }
  }, [chave])

  return infos
}
