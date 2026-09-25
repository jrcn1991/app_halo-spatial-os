import type { EstadoDosAvisos } from '@shared/notificacoes'
import { useEffect, useState } from 'react'
import { repositories } from '@/data'

/**
 * O estado dos balões do tema, relido de tempos em tempos.
 *
 * Ele muda sem a tela pedir (a janela carrega, o applet do KDE derruba o
 * silêncio), por isso a leitura se repete a cada `intervaloMs` enquanto quem
 * pergunta está montado. É IPC, sem processo externo. `null` = não se sabe.
 */
export function useEstadoDosAvisos(intervaloMs = 1500): EstadoDosAvisos | null {
  const [estado, setEstado] = useState<EstadoDosAvisos | null>(null)

  useEffect(() => {
    let vivo = true
    const ler = () =>
      void repositories.notificacoes
        .estado()
        .then((e) => vivo && setEstado(e))
        .catch(() => {})
    ler()
    const id = setInterval(ler, intervaloMs)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [intervaloMs])

  return estado
}

/** Manda uma notificação de exemplo. Lança se o servidor não respondeu. */
export function useExemploDeAviso(): () => Promise<void> {
  return repositories.notificacoes.exemplo
}
