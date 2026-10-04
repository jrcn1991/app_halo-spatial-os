import type { TemaKdeRepository } from '@/domain/repositories'

/** O CyberKDE é chamado pelo main; a tela só lê o estado. */
export const ipcTemaKde: TemaKdeRepository = {
  estado: () => window.halo.temaKde.estado(),
}
