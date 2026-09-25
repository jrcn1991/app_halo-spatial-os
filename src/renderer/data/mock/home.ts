import type { HomeFeedRepository } from '@/domain/repositories'

/**
 * Notificações da home, FORA do Electron.
 *
 * Dentro do app elas são as do sistema, pelo vigia do D-Bus da ilha (ver
 * `data/ipc/home.ts`). Aqui não há D-Bus nenhum — este é o caminho do
 * navegador, onde os guarda-fidelidade rodam —, então valem os exemplos do
 * protótipo. `listening: true` porque, para a tela, esta lista é o estado
 * "está ouvindo e chegou isto": o outro estado tem tela própria.
 */
export const mockHomeFeed: HomeFeedRepository = {
  notifications: async () => ({
    listening: true,
    items: [
      {
        kind: 'error',
        title: 'Claude · halo-api',
        body: '2 testes falhando após o último commit',
        app: '',
      },
      { kind: 'info', title: 'Nora Vale', body: 'Consegue enviar até as 18h?', app: '' },
      { kind: 'info', title: 'Drive', body: 'press-kit.zip compartilhado com 4 pessoas', app: '' },
      { kind: 'ok', title: 'Ambiente', body: 'Floresta ajustada para a luz da manhã', app: '' },
    ],
  }),
  // A lista de exemplo não muda: não há o que avisar.
  onChanged: () => () => {},
}
