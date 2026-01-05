import { useEffect, useState } from 'react'

export type Async<T> = { data: T | null; loading: boolean; error: Error | null }

/**
 * Executa uma busca e devolve dados/carregando/erro.
 *
 * Existe desde a fase de mocks para que as telas já lidem com os três estados.
 * Ligar o serviço real depois não deve virar caça a `undefined`.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<Async<T>>({ data: null, loading: true, error: null })

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))

    load()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error: Error) => alive && setState({ data: null, loading: false, error }))

    return () => {
      alive = false
    }
    // Quem chama declara as dependências, como no `useEffect`: `load` costuma
    // ser uma seta nova a cada render e não serviria como dependência.
    // biome-ignore lint/correctness/useExhaustiveDependencies: ver acima
  }, deps)

  return state
}
