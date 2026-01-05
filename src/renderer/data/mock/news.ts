import type { NewsRepository } from '@/domain/repositories'
import type { NewsItem } from '@/domain/types'

/** Latência falsa: expõe os estados de carregamento desde já. */
const LATENCY_MS = 220

/**
 * Manchetes de exemplo — e só fora do Electron.
 *
 * Alimenta `npm run test:screens` e `npm run layout`, onde não há rede. Vem
 * marcado com `demo: true`, e a home etiqueta quando o vê: dado que não é do
 * usuário nunca passa sem aviso. As datas são relativas ao agora para a
 * coluna mostrar "2 H" e "ONTEM" como faria com um feed real.
 */
const FEED = 'https://exemplo.invalid/feed/'

function haHoras(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
}

const ITENS: NewsItem[] = [
  {
    id: 'demo-1',
    title: 'O que muda quando a interface deixa de ter moldura',
    link: 'https://exemplo.invalid/interface-sem-moldura',
    publishedAt: haHoras(2),
    source: 'Spatial Weekly',
    summary:
      'Painéis que flutuam sobre a tela real pedem outra gramática de foco e de profundidade.',
    feed: FEED,
    // Exemplo não tem miniatura: fora do Electron não há main para buscá-la.
    image: '',
  },
  {
    id: 'demo-2',
    title: 'Grotescas variáveis para leitura a 2 metros',
    link: 'https://exemplo.invalid/grotescas-variaveis',
    publishedAt: haHoras(5),
    source: 'Type Journal',
    summary: 'Eixos de peso e largura ajustados para o texto continuar legível de longe.',
    feed: FEED,
    // Exemplo não tem miniatura: fora do Electron não há main para buscá-la.
    image: '',
  },
  {
    id: 'demo-3',
    title: 'Misturando trilhas de ambiente para o filme',
    link: 'https://exemplo.invalid/trilhas-de-ambiente',
    publishedAt: haHoras(27),
    source: 'Studio Log',
    summary: 'Camadas de campo, chuva e sala vazia, e o que cada uma faz com a cena.',
    feed: FEED,
    // Exemplo não tem miniatura: fora do Electron não há main para buscá-la.
    image: '',
  },
  {
    id: 'demo-4',
    title: 'Vidro, blur e o custo de compor em tempo real',
    link: 'https://exemplo.invalid/vidro-e-blur',
    publishedAt: haHoras(31),
    source: 'Spatial Weekly',
    summary: 'Onde o backdrop-filter pesa e como manter 60 quadros num overlay transparente.',
    feed: FEED,
    // Exemplo não tem miniatura: fora do Electron não há main para buscá-la.
    image: '',
  },
]

export const mockNews: NewsRepository = {
  headlines: (feeds) =>
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve(
            feeds.length === 0
              ? { items: [], feeds: [], demo: true }
              : {
                  items: ITENS,
                  feeds: [
                    {
                      url: feeds[0] ?? FEED,
                      name: 'Exemplo',
                      count: ITENS.length,
                      error: null,
                      fetchedAt: new Date().toISOString(),
                    },
                  ],
                  demo: true,
                },
          ),
        LATENCY_MS,
      ),
    ),
}
