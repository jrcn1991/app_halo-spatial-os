import type { NotificacoesRepository } from '@/domain/repositories'

/**
 * Os balões FORA do Electron: não há servidor de notificações. O estado é
 * `null` (a tela não diz nada sobre ele, e o botão de exemplo fica apagado) e
 * o exemplo não manda nada.
 */
export const mockNotificacoes: NotificacoesRepository = {
  estado: async () => null,
  exemplo: async () => {},
}
