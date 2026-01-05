import type { CatalogRepository } from '@/domain/repositories'

/** Biblioteca de mídia: a lista é lida e indexada pelo processo main. */
export const ipcCatalog: CatalogRepository = {
  status: () => window.halo.media.status(),
  categories: () => window.halo.media.categories(),
  page: (query) => window.halo.media.catalog(query),
  title: (id) => window.halo.media.title(id),
  extra: (id) => window.halo.media.extra(id),
  play: (id, episode, startAt) => window.halo.media.play(id, episode, startAt),
  forget: (id, episode) => window.halo.media.forget(id, episode),
}
