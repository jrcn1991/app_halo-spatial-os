import type { SystemRepository, WindowRepository } from '@/domain/repositories'

/**
 * O app e a janela, FORA do Electron.
 *
 * Nada aqui é inventado: sem o main não há versão para ler nem programa para
 * procurar, e a tela mostra o estado de espera (`null`). Os comandos de janela
 * não fazem nada — no navegador não há janela nossa a mexer.
 */
export const mockSystem: SystemRepository = {
  appInfo: async () => null,
  dependencies: async () => null,
}

export const mockWindow: WindowRepository = {
  setScale: async () => null,
  setDesktopMode: async () => null,
  relaunch: async () => {},
}
