import type { SeafileRepository } from '@/domain/repositories'

/** Seafile: a conta e os envios moram no main; o token nunca chega aqui. */
export const ipcSeafile: SeafileRepository = {
  state: () => window.halo.seafile.state(),
  onChanged: (handler) => window.halo.seafile.onChanged(handler),
  login: (user, password) => window.halo.seafile.login(user, password),
  logout: async () => window.halo.seafile.logout(),
  setLibrary: async (id) => window.halo.seafile.setLibrary(id),
}
