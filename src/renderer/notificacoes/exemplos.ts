import type { Aviso } from '@shared/notificacoes'

/**
 * Avisos de EXEMPLO, para quando a página abre fora do Electron — o navegador
 * dos guarda-fidelidade (`npm run test:screens`), onde não há D-Bus nem
 * `window.halo`. Dentro do app eles nunca aparecem: lá a lista vem do main.
 *
 * Os textos DIZEM que são exemplo (regra do projeto: nada de dado inventado
 * sem aviso na tela), e nenhum vence o tempo — o teste precisa deles parados.
 * Os três cobrem o que o balão desenha de diferente: com ações, sem imagem e
 * com a urgência baixa. Registrado em `docs/MOCKS.md`.
 */
export const AVISOS_DE_EXEMPLO: Aviso[] = [
  {
    id: 3,
    app: 'Exemplo · Mensagens',
    titulo: 'Notificação de exemplo',
    corpo: 'Fora do app não há servidor de notificações — estes balões são só a vitrine do tema.',
    icone: null,
    imagem: null,
    urgencia: 'normal',
    acoes: [
      { chave: 'responder', rotulo: 'Responder' },
      { chave: 'lida', rotulo: 'Marcar como lida' },
    ],
    temPadrao: true,
    expiraMs: null,
    at: 0,
  },
  {
    id: 2,
    app: 'Exemplo · Downloads',
    titulo: 'Download concluído (exemplo)',
    corpo: 'arquivo-de-exemplo.zip',
    icone: null,
    imagem: null,
    urgencia: 'normal',
    acoes: [],
    temPadrao: false,
    expiraMs: null,
    at: 0,
  },
  {
    id: 1,
    app: 'Exemplo · Sistema',
    titulo: 'Aviso de urgência baixa',
    corpo: 'Exemplo de um aviso discreto.',
    icone: null,
    imagem: null,
    urgencia: 'baixa',
    acoes: [],
    temPadrao: false,
    expiraMs: null,
    at: 0,
  },
]
