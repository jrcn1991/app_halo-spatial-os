import type { Title } from '@shared/media'
import type { CatalogRepository } from '@/domain/repositories'

/**
 * Catálogo de exemplo, para fora do Electron.
 *
 * Não é "dado do protótipo": é o mínimo para os guarda-telas rodarem no
 * navegador sem depender de uma lista no disco. Dentro do app, o catálogo é
 * sempre o de verdade — ver `src/renderer/data/index.ts`.
 */

const TITULOS: Title[] = [
  {
    id: '0',
    name: 'Cidade Submersa',
    year: 2024,
    tags: ['4K'],
    poster: '',
    group: 'Lançamento',
    kind: 'movie',
    seasons: 0,
    episodes: 0,
  },
  {
    id: '1',
    name: 'O Vale dos Relógios',
    year: 2023,
    tags: ['L'],
    poster: '',
    group: 'Drama',
    kind: 'movie',
    seasons: 0,
    episodes: 0,
  },
  {
    id: '2',
    name: 'Estação Norte',
    year: 2022,
    tags: [],
    poster: '',
    group: 'Drama',
    kind: 'series',
    seasons: 2,
    episodes: 16,
  },
]

export const mockCatalog: CatalogRepository = {
  status: async () => ({
    ready: true,
    path: '/exemplo/lista.m3u',
    movies: 2,
    series: 1,
    episodes: 16,
    error: null,
  }),
  categories: async () => [
    { name: 'Lançamento', movies: 1, series: 0 },
    { name: 'Drama', movies: 1, series: 1 },
  ],
  page: async ({ query, group, kind, only }) => {
    const alvo = (query ?? '').trim().toLowerCase()
    const fonte = only ? only.map((id) => TITULOS.find((t) => t.id === id)) : TITULOS
    const items = fonte
      .filter((t): t is Title => Boolean(t))
      .filter(
        (t) =>
          (!group || t.group === group) &&
          (!kind || kind === 'all' || t.kind === kind) &&
          (!alvo || t.name.toLowerCase().includes(alvo)),
      )
    return { total: items.length, items }
  },
  title: async (id) => {
    const achado = TITULOS.find((t) => t.id === id)
    if (!achado) return null
    return {
      ...achado,
      list: Array.from({ length: achado.episodes }, (_v, i) => ({
        id: String(i),
        season: Math.floor(i / 8) + 1,
        number: (i % 8) + 1,
        title: '',
      })),
    }
  },
  // Fora do Electron não há chave nem rede: o mesmo estado de quem não
  // configurou, que é o que a tela precisa saber desenhar.
  extra: async () => ({ state: 'no-key' }),
  play: async () => undefined,
  forget: () => undefined,
}
