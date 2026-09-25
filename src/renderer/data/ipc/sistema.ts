import type { SystemRepository, WindowRepository } from '@/domain/repositories'

/** O app e a máquina: o main sabe a versão e procura os programas de fora. */
export const ipcSystem: SystemRepository = {
  appInfo: () => window.halo.appInfo(),
  dependencies: () => window.halo.system.dependencies(),
}

/** A janela do app: quem mexe nela é o main. */
export const ipcWindow: WindowRepository = {
  setScale: (scale) => window.halo.window.setScale(scale),
  setDesktopMode: (on) => window.halo.window.setDesktopMode(on),
  relaunch: async () => window.halo.window.relaunch(),
}
