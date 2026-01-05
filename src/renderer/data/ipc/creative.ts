import type { CreativeRepository } from '@/domain/repositories'

/**
 * Social Arte, de verdade — tudo pelo main.
 *
 * A tela não muda nada por causa disso: é o que a camada de repositórios
 * existe para garantir. Cada método é uma linha porque a lógica inteira mora
 * em `main/services/creative/` — as plataformas pedem credencial e a CSP do
 * renderer não alcança host nenhum, de propósito.
 */
export const ipcCreative: CreativeRepository = {
  connections: () => window.halo.creative.connections(),
  search: (query, pedido) => window.halo.creative.search(query, pedido),
  trending: (limite, cursor, pedido) => window.halo.creative.trending(limite, cursor, pedido),
  onPartial: (handler) => window.halo.creative.onPartial(handler),
  signIn: (provider) => window.halo.creative.signIn(provider),
  signOut: (provider) => window.halo.creative.signOut(provider),
  release: () => window.halo.creative.release(),
  preview: (url) => window.halo.creative.preview(url),
  thumb: (url) => window.halo.creative.thumb(url),
  library: () => window.halo.creative.library(),
  save: (item, onde) => window.halo.creative.save(item, onde),
  remove: (id) => window.halo.creative.remove(id),
  favorite: (id, on) => window.halo.creative.favorite(id, on),
  move: (id, collections) => window.halo.creative.move(id, collections),
  annotate: (id, note, tags) => window.halo.creative.annotate(id, note, tags),
  collectionCreate: (dados) => window.halo.creative.collectionCreate(dados),
  collectionEdit: (id, dados) => window.halo.creative.collectionEdit(id, dados),
  collectionDelete: (id) => window.halo.creative.collectionDelete(id),
}
