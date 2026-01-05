import type { NewsRepository } from '@/domain/repositories'

/**
 * Notícias de verdade, buscadas pelo processo main (`services/rss.ts`).
 *
 * A tela não muda nada por causa disso — é o que a camada de repositórios
 * existe para garantir. O contrato já era assíncrono desde o mock.
 */
export const ipcNews: NewsRepository = {
  headlines: (feeds) => window.halo.news.headlines(feeds),
}
