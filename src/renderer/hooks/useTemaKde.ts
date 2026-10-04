import type { EstadoDoTemaKde } from '@shared/tema-kde'
import { useEffect, useState } from 'react'
import { repositories } from '@/data'

/**
 * O estado do CyberKDE, relido enquanto a seção está aberta: uma aplicação
 * anda sozinha (a barra de progresso) e termina sem a tela pedir. O `status`
 * do tema é um processo externo, mas quem segura o ritmo é o main (ele guarda
 * a leitura por alguns segundos). `null` = não se sabe.
 */
export function useEstadoDoTemaKde(intervaloMs = 1000): EstadoDoTemaKde | null {
  const [estado, setEstado] = useState<EstadoDoTemaKde | null>(null)

  useEffect(() => {
    let vivo = true
    const ler = () =>
      void repositories.temaKde
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
