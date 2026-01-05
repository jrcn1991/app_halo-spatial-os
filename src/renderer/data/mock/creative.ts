import type { CreativeLibrary, CreativeProviderId } from '@shared/creative'
import type { CreativeRepository } from '@/domain/repositories'

/**
 * Social Arte FORA do Electron — o caminho do navegador, onde os
 * guarda-fidelidade rodam.
 *
 * Aqui não há main, não há rede e não há disco. A biblioteca vive na memória
 * da página e some ao recarregar, e é isso que permite o teste de tela
 * exercitar salvar, favoritar e criar coleção sem inventar conteúdo: **não há
 * item de exemplo nenhum**. A tela começa vazia, como começa numa instalação
 * nova, e o vazio dela tem texto próprio.
 */
const lib: CreativeLibrary = { collections: [], items: [] }

const clone = (): CreativeLibrary => JSON.parse(JSON.stringify(lib)) as CreativeLibrary

export const mockCreative: CreativeRepository = {
  connections: async () =>
    [
      ['deviantart', 'DeviantArt', 'Arte digital, ilustração e fotografia da comunidade.'],
      ['artstation', 'ArtStation', 'Arte de concept, 3D e ilustração profissional.'],
      ['behance', 'Behance', 'Portfólios de design, ilustração e direção de arte.'],
      ['pinterest', 'Pinterest', 'Pins e pastas do seu feed.'],
      ['thingiverse', 'Thingiverse', 'Modelos 3D da comunidade, para imprimir.'],
      ['link', 'Qualquer endereço', 'Salva de qualquer site pelo que a página publica sobre si.'],
    ].map(([provider, name, description]) => ({
      provider: provider as CreativeProviderId,
      name: name as string,
      description: description as string,
      connected: false,
      capabilities: [],
      lastSyncAt: null,
      error: 'fora do app não há rede: abra o Halo para usar as fontes',
      searchUrl: '',
      signIn: false,
      signedIn: false,
    })),
  search: async () => ({ items: [], cursor: '', falhas: [] }),
  // Fora do Electron não há navegador de segundo plano nem sessão: a home das
  // fontes vem vazia, e a tela mostra o vazio que ela tem para esse caso.
  trending: async () => ({ items: [], cursor: '', falhas: [] }),
  // Fora do Electron não há main para emitir parcial nenhum: a promessa já
  // devolve tudo (vazio), e desinscrever é o que sobra de trabalho.
  onPartial: () => () => undefined,
  signIn: async () => undefined,
  signOut: async () => undefined,
  release: () => undefined,
  preview: async () => ({
    ok: false,
    error: 'fora do app não há rede para ler o endereço',
    item: null,
  }),
  // Fora do Electron não há main para converter a imagem, e a CSP não abre
  // host de imagem: a tela desenha o lugar da capa, como faz quando falha.
  thumb: async () => '',
  library: async () => clone(),
  save: async (item, onde) => {
    lib.items = [
      {
        item,
        collections: onde.collections ?? [],
        tags: onde.tags ?? [],
        note: onde.note ?? '',
        savedAt: new Date().toISOString(),
        favorite: onde.favorite ?? false,
      },
      ...lib.items.filter((s) => s.item.id !== item.id),
    ]
    return clone()
  },
  remove: async (id) => {
    lib.items = lib.items.filter((s) => s.item.id !== id)
    return clone()
  },
  favorite: async (id, on) => {
    const s = lib.items.find((x) => x.item.id === id)
    if (s) s.favorite = on
    return clone()
  },
  move: async (id, collections) => {
    const s = lib.items.find((x) => x.item.id === id)
    if (s) s.collections = collections
    return clone()
  },
  annotate: async (id, note, tags) => {
    const s = lib.items.find((x) => x.item.id === id)
    if (s) {
      s.note = note
      s.tags = tags
    }
    return clone()
  },
  collectionCreate: async (dados) => {
    const id = dados.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `c${lib.collections.length}`
    lib.collections.push({ ...dados, id, createdAt: new Date().toISOString() })
    return clone()
  },
  collectionEdit: async (id, dados) => {
    const c = lib.collections.find((x) => x.id === id)
    if (c) Object.assign(c, dados)
    return clone()
  },
  collectionDelete: async (id) => {
    lib.collections = lib.collections.filter((c) => c.id !== id)
    for (const s of lib.items) s.collections = s.collections.filter((c) => c !== id)
    return clone()
  },
}
