import type { MascotRepository } from '@/domain/repositories'

/** O mascote: o main decodifica o `.acs` e serve os quadros em PNG. */
export const ipcMascot: MascotRepository = {
  info: () => window.halo.mascot.info(),
  animation: (name) => window.halo.mascot.animation(name),
  list: () => window.halo.mascot.list(),
  preview: (file) => window.halo.mascot.preview(file),
  choose: () => window.halo.mascot.choose(),
}
