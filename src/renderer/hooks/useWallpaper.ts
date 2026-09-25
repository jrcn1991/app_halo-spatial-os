import type { EnvironmentId } from '@shared/environments'
import { useEffect, useState } from 'react'
import { repositories } from '@/data'
import type { WallpaperRepository } from '@/domain/repositories'

/**
 * As miniaturas dos papéis de parede, uma por ambiente.
 *
 * Quem lê o disco e encolhe a imagem é o main (ver
 * `src/main/services/wallpaper.ts`): o renderer não alcança arquivo, e a CSP
 * dele só abre `data:`. Fora do Electron a lista vem vazia, e o quadrado fica
 * com as listras de sempre.
 *
 * Refaz a busca quando o usuário troca a imagem de um ambiente nas
 * configurações; o main guarda cada miniatura pela data do arquivo, então
 * pedir de novo é barato.
 */
export function useWallpaperPreviews(
  imagens: Record<string, string>,
): Partial<Record<EnvironmentId, string>> {
  const [previas, setPrevias] = useState<Partial<Record<EnvironmentId, string>>>({})
  // `imagens` não é lido aqui dentro de propósito: quem sabe o caminho de cada
  // ambiente é o main. Ele está na lista para a busca refazer quando o usuário
  // troca a imagem nas configurações — sem isso o quadrado ficaria com a
  // miniatura antiga até o app reabrir.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ver acima
  useEffect(() => {
    let vivo = true
    void repositories.wallpaper
      .previews()
      .then((lista) => vivo && setPrevias(lista))
      .catch(() => {
        // Sem prévia o painel continua inteiro: é enfeite, não conteúdo.
      })
    return () => {
      vivo = false
    }
  }, [imagens])
  return previas
}

/**
 * O que a seção de Ambiente precisa saber da máquina: se o plugin de vídeo
 * está instalado e se há um fundo original guardado. `null` = não se sabe
 * (fora do Electron, ainda perguntando, ou a pergunta falhou).
 */
export function useWallpaperStatus(): { plugin: boolean | null; original: boolean | null } {
  const [plugin, setPlugin] = useState<boolean | null>(null)
  const [original, setOriginal] = useState<boolean | null>(null)

  useEffect(() => {
    let vivo = true
    repositories.wallpaper.videoPlugin().then(
      (instalado) => vivo && setPlugin(instalado),
      () => {},
    )
    repositories.wallpaper.original().then(
      (guardado) => vivo && setOriginal(guardado),
      () => {},
    )
    return () => {
      vivo = false
    }
  }, [])

  return { plugin, original }
}

/** Os seletores e o "restaurar o meu papel de parede". */
export function useWallpaperActions(): Pick<
  WallpaperRepository,
  'choose' | 'chooseVideo' | 'restaurar'
> {
  return repositories.wallpaper
}
