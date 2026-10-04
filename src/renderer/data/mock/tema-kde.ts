import type { TemaKdeRepository } from '@/domain/repositories'

/**
 * O CyberKDE FORA do Electron: não há tema a quem perguntar. O estado é
 * `null`, e a seção não diz nada sobre ele — nada inventado.
 */
export const mockTemaKde: TemaKdeRepository = {
  estado: async () => null,
}
