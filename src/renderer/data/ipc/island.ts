import type { IslandSettingsRepository } from '@/domain/repositories'

/** O que Configurações → Ilha lê da ilha, que mora no main. */
export const ipcIslandSettings: IslandSettingsRepository = {
  displays: () => window.halo.island.displays(),
  catalog: () => window.halo.island.catalog(),
}
