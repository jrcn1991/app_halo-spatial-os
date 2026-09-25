import type { WallpaperRepository } from '@/domain/repositories'

/** O papel de parede da sessão, pelo main (`main/services/wallpaper.ts`). */
export const ipcWallpaper: WallpaperRepository = {
  previews: () => window.halo.wallpaper.previews(),
  choose: () => window.halo.wallpaper.choose(),
  chooseVideo: () => window.halo.wallpaper.chooseVideo(),
  videoPlugin: () => window.halo.wallpaper.videoPlugin(),
  original: () => window.halo.wallpaper.original(),
  restaurar: () => window.halo.wallpaper.restaurar(),
}
