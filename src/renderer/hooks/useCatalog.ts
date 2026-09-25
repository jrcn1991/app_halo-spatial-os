import type {
  CatalogPage,
  CatalogQuery,
  CatalogStatus,
  Category,
  ExtraResult,
  TitleDetail,
} from '@shared/media'
import { useCallback, useEffect, useRef, useState } from 'react'
import { repositories } from '@/data'
import type { CatalogRepository } from '@/domain/repositories'
import { type Async, useAsync } from './useAsync'

/** Quanto o catálogo pede por vez. Uma tela cheia de capas cabe folgada. */
export const PAGINA = 60

export function useCatalogStatus(playlist: string): Async<CatalogStatus> {
  // `playlist` é dependência para trocar a lista em Configurações refletir aqui
  // sem reabrir o app.
  return useAsync(() => repositories.catalog.status(), [playlist])
}

export function useCategories(playlist: string, ready: boolean): Async<Category[]> {
  return useAsync(
    () => (ready ? repositories.catalog.categories() : Promise.resolve([])),
    [playlist, ready],
  )
}

export function useTitle(id: string | null): Async<TitleDetail | null> {
  return useAsync(() => (id ? repositories.catalog.title(id) : Promise.resolve(null)), [id])
}

/**
 * Metadados externos do título escolhido.
 *
 * `tmdbKey` entra nas dependências para que informar a chave em Configurações
 * preencha o painel na hora, sem reabrir a tela.
 */
export function useTitleExtra(id: string | null, tmdbKey: string): Async<ExtraResult> {
  return useAsync(
    () => (id ? repositories.catalog.extra(id) : Promise.resolve({ state: 'no-key' as const })),
    [id, tmdbKey],
  )
}

/**
 * Uma busca no catálogo, com "carregar mais".
 *
 * A página acumula em vez de trocar: rolar a grade tem que continuar de onde
 * estava, não recomeçar. Trocar filtro ou busca zera a pilha.
 */
export function useCatalogPage(query: CatalogQuery): {
  items: CatalogPage['items']
  total: number
  loading: boolean
  error: Error | null
  more: boolean
  loadMore: () => void
} {
  const [items, setItems] = useState<CatalogPage['items']>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  /**
   * O que identifica esta busca.
   *
   * `only` entra inteiro, e na ordem: é ele que carrega os favoritos e as
   * listas. Sem isso, trocar de lista não refazia a consulta — a grade ficava
   * mostrando o resultado anterior — e arrastar uma capa não reordenava nada
   * na tela. A lista tem teto (400 ids), então comparar a string é barato.
   */
  const chave = [
    query.query ?? '',
    query.group ?? '',
    query.kind ?? 'all',
    query.only?.join(',') ?? '',
  ].join('|')
  const anterior = useRef(chave)

  useEffect(() => {
    if (anterior.current !== chave) {
      anterior.current = chave
      setItems([])
      setOffset(0)
    }
  }, [chave])

  // A consulta é um objeto novo a cada render; o que identifica de verdade a
  // busca é a chave (termo + filtros) e o deslocamento. Declarar `query` aqui
  // refaria a busca a cada tecla digitada em qualquer outro lugar da tela.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ver acima
  useEffect(() => {
    let vivo = true
    setLoading(true)
    repositories.catalog
      .page({ ...query, offset, limit: PAGINA })
      .then((pagina) => {
        if (!vivo) return
        setTotal(pagina.total)
        // Recomeço (offset 0) troca; continuação acumula.
        setItems((atuais) => (offset === 0 ? pagina.items : [...atuais, ...pagina.items]))
        setError(null)
      })
      .catch((erro: Error) => vivo && setError(erro))
      .finally(() => vivo && setLoading(false))
    return () => {
      vivo = false
    }
  }, [chave, offset])

  const loadMore = useCallback(() => setOffset((atual) => atual + PAGINA), [])

  return { items, total, loading, error, more: items.length < total, loadMore }
}

/**
 * O que a tela faz com o catálogo além de ler: tocar, tirar de "Continuar
 * assistindo" e apontar a lista M3U. Fora do Electron nada disso tem efeito.
 */
export function useCatalogActions(): Pick<CatalogRepository, 'play' | 'forget' | 'choose'> {
  return repositories.catalog
}
