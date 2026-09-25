import type { MascotAnimation, MascotChoice, MascotInfo } from '@shared/mascot'
import { useCallback, useEffect, useState } from 'react'
import { repositories } from '@/data'

/**
 * O personagem carregado, sem os pixels. `reload` refaz a pergunta — trocar
 * de personagem troca também as animações que ele sabe fazer.
 */
export function useMascotInfo(): { info: MascotInfo | null; reload: () => void } {
  const [info, setInfo] = useState<MascotInfo | null>(null)
  const reload = useCallback(() => {
    void repositories.mascot.info().then(setInfo)
  }, [])
  useEffect(reload, [reload])
  return { info, reload }
}

/** Os personagens da biblioteca, para a tela de escolha. */
export function useMascotLibrary(): {
  lista: MascotChoice[]
  reload: () => void
  /** Um quadro do personagem, em `data:`. Vazio quando não deu. */
  preview: (file: string) => Promise<string>
  /** Abre o seletor e copia o `.acs` para a biblioteca. `null` = cancelou. */
  choose: () => Promise<string | null>
} {
  const [lista, setLista] = useState<MascotChoice[]>([])
  const reload = useCallback(() => {
    void repositories.mascot.list().then(setLista)
  }, [])
  useEffect(reload, [reload])
  return {
    lista,
    reload,
    preview: repositories.mascot.preview,
    choose: repositories.mascot.choose,
  }
}

/**
 * Os quadros de uma animação, sob pedido.
 *
 * Função, e não estado: quem toca decide quando pedir e guarda o que já veio —
 * mandar todas as imagens de uma vez seriam megabytes pelo IPC por nada.
 */
export function useMascotAnimation(): (name: string) => Promise<MascotAnimation> {
  return repositories.mascot.animation
}
