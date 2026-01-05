import type { IslandNotice } from '@shared/island'
import type { HomeFeedRepository } from '@/domain/repositories'
import type { Notification } from '@/domain/types'

/**
 * As notificações da home — as do SISTEMA, de verdade.
 *
 * Elas vêm do vigia do D-Bus da ilha (`main/island/watch.ts`), e não de um
 * vigia próprio: o servidor de notificações é um só, e dois ouvintes dariam
 * duas listas que discordam entre si. A consequência é que a home só as tem
 * com a ilha ligada — e a tela DIZ isso, em vez de mostrar uma coluna vazia.
 */
export const ipcHomeFeed: HomeFeedRepository = {
  notifications: async () => {
    const { listening, items } = await window.halo.island.notices()
    return { listening, items: items.map(paraTela) }
  },
}

/**
 * De uma notificação do D-Bus para a linha do handoff.
 *
 * O servidor do freedesktop tem urgência 0/1/2 e o desenho tem três tons.
 * Urgente vira `error`; o resto vira `info`. `ok` fica de fora de propósito:
 * ele é para o que o próprio app anuncia, e o D-Bus não distingue "deu certo"
 * de "aconteceu".
 */
function paraTela(aviso: IslandNotice): Notification {
  return {
    kind: aviso.urgent ? 'error' : 'info',
    // O nome do app na frente do título é o que dá contexto quando o título é
    // curto ("Concluído") — e é o que o popup do KDE também mostra.
    title: aviso.app && aviso.app !== aviso.title ? `${aviso.app} · ${aviso.title}` : aviso.title,
    body: aviso.body,
    app: aviso.desktopEntry,
  }
}
