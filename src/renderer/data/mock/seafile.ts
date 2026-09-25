import type { SeafileRepository } from '@/domain/repositories'

/**
 * Seafile FORA do Electron: não há servidor a consultar nem senha a trocar.
 * O estado é `null` — a tela mostra só o endereço — e os comandos não fazem
 * nada. Nenhum pedido sai daqui.
 */
export const mockSeafile: SeafileRepository = {
  state: async () => null,
  onChanged: () => () => {},
  login: async () => null,
  logout: async () => {},
  setLibrary: async () => {},
}
