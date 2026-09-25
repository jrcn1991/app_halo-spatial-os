import type { IslandSettingsRepository } from '@/domain/repositories'

/**
 * A ilha FORA do Electron: ela não existe. Sem telas além das duas opções
 * fixas ("Tela principal" e "Todas") e sem integrações a contar.
 */
export const mockIslandSettings: IslandSettingsRepository = {
  displays: async () => [],
  catalog: async () => [],
}
