import type { WallpaperRepository } from '@/domain/repositories'

/**
 * Papel de parede FORA do Electron: nenhum.
 *
 * Sem prévias o quadrado de cada ambiente fica com as listras de sempre; sem
 * plugin nem fundo guardado a resposta é "não se sabe" (`null`), e os
 * seletores se comportam como um cancelamento. Nada toca a sessão.
 */
export const mockWallpaper: WallpaperRepository = {
  previews: async () => ({}),
  choose: async () => null,
  chooseVideo: async () => null,
  videoPlugin: async () => null,
  original: async () => null,
  restaurar: async () => null,
}
