import type { MascotRepository } from '@/domain/repositories'

/**
 * Mascote FORA do Electron: nenhum personagem carregado.
 *
 * `ready: false` é o mesmo estado de quem não escolheu personagem, e é nele
 * que a tela desenha o orbe do handoff — é o que os guarda-telas conferem.
 */
export const mockMascot: MascotRepository = {
  info: async () => ({
    ready: false,
    name: '',
    width: 0,
    height: 0,
    animations: [],
    moods: {
      ocioso: null,
      pensando: null,
      ferramenta: null,
      comemorando: null,
      erro: null,
      chegando: null,
    },
    error: null,
  }),
  animation: async (name) => ({ name, frames: [] }),
  list: async () => [],
  preview: async () => '',
  choose: async () => null,
}
