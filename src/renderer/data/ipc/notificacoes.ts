import type { NotificacoesRepository } from '@/domain/repositories'

/** Os balões do tema: o vigia do servidor de notificações mora no main. */
export const ipcNotificacoes: NotificacoesRepository = {
  estado: () => window.halo.notificacoes.estado(),
  exemplo: () => window.halo.notificacoes.exemplo(),
}
