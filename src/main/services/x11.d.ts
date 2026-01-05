/**
 * Tipos mínimos do `x11` (o pacote não traz os seus).
 *
 * Só o que `desktop-layer.ts` e `island/entrada.ts` usam: abrir a conexão,
 * resolver átomos, mandar um evento e carregar a extensão de shape. Nada além
 * disso entra aqui — a superfície pequena é o ponto.
 */
declare module 'x11' {
  export type XClient = {
    InternAtom(
      onlyIfExists: boolean,
      name: string,
      callback: (error: Error | null, atom: number) => void,
    ): void
    SendEvent(destination: number, propagate: number, eventMask: number, event: Buffer): void
    /** Carrega uma extensão do servidor (`shape`, `xtest`…) e a entrega pronta. */
    require<T>(name: string, callback: (error: Error | null, extension: T) => void): void
    /** Erros de protocolo chegam aqui; sem ouvinte, derrubam o processo. */
    on(event: 'error', listener: (error: Error) => void): void
  }
  export type XDisplay = { client: XClient; screen: { root: number }[] }
  export function createClient(callback: (error: Error | null, display: XDisplay) => void): unknown
}
