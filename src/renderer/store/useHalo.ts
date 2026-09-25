import type { PermissionMode } from '@shared/agents'
import type { EnvironmentId } from '@shared/environments'
import { definirIdioma, type Idioma } from '@shared/i18n'
import { type IslandSettings, limitarAltura } from '@shared/island'
import type { MascotLiveliness } from '@shared/mascot'
import type { Progress } from '@shared/media'
import { MAX_FEEDS } from '@shared/news'
import type { NotificacoesSettings } from '@shared/notificacoes'
import type { ClaudeGroup, MediaGroup } from '@shared/settings'
import {
  type AjustesDoAmbiente,
  type Appearance,
  type ContentEntrance,
  DEFAULT_SETTINGS,
  type DockPosition,
  type EnvironmentSettings,
  type GlassTint,
  type HaloSettings,
  HIDEABLE_SCREENS,
  type LauncherSettings,
  type NavigationMode,
  type Widgets,
} from '@shared/settings'
import { create } from 'zustand'
import type { EntranceName } from '@/styles/entrances'

/**
 * Store único do handoff (§ "State Management"). Tudo mockado nesta fase —
 * nenhum destes campos fala com serviço real ainda.
 */

export type Screen = 'home' | 'social' | 'claude' | 'files' | 'lab' | 'media' | 'music' | 'settings'

export type LibTab = 'Playlists' | 'Artistas' | 'Álbuns'
export type ViewMode = 'grid' | 'list'
export type Toggle = 'ambient' | 'dnd' | 'spatial' | 'subs'
export type Player = 'music' | 'home' | 'media'
export type Slider = 'imersao' | 'vol' | 'mvol'

/** ——— Configurações (fora do handoff) —————————————————————————————
 *
 * `Appearance`, `GlassTint` e `DockPosition` moram em `@shared/settings`: o
 * processo main também precisa deles para ler o JSON salvo e para abrir a
 * janela já no tamanho certo.
 */

export type SettingsSection =
  | 'language'
  | 'animation'
  | 'appearance'
  | 'environment'
  | 'window'
  | 'widgets'
  | 'media'
  | 'claude'
  | 'island'
  | 'launcher'
  | 'notificacoes'
  | 'seafile'
  | 'music'
  | 'news'
  | 'system'
  | 'about'
export type {
  AjustesDoAmbiente,
  Appearance,
  ContentEntrance,
  DockPosition,
  EnvironmentSettings,
  GlassTint,
  NavigationMode,
  Widgets,
}

/**
 * Estado inicial: o que veio do disco. Fora do Electron (o harness roda no
 * navegador) cai no padrão do handoff.
 */
const initial: HaloSettings = globalThis.window?.halo?.settings.initial ?? DEFAULT_SETTINGS

type HaloState = {
  screen: Screen
  drawer: boolean
  tg: Record<Toggle, boolean>
  tabs: { lib: LibTab; view: ViewMode }
  /**
   * O ambiente ativo, as imagens de cada um e se a troca alcança a máquina.
   *
   * Fora de `appearance` de propósito — ver `EnvironmentSettings` em
   * `@shared/settings`.
   */
  environment: EnvironmentSettings
  playing: Record<Player, boolean>
  follow: boolean
  lab: 0 | 1 | 2
  sliders: Record<Slider, number>
  /** Variação de entrada, escolhida em Configurações. */
  /** Muda para remontar os painéis e repetir a animação de entrada. */
  nonce: number
  settingsSection: SettingsSection
  /** O idioma da interface; trocar remonta o app inteiro (ver `app/idioma.tsx`). */
  language: Idioma
  setLanguage: (idioma: Idioma) => void
  appearance: Appearance
  widgets: Widgets
  /** Telas fora do dock. Home e Configurações nunca entram aqui. */
  hiddenScreens: Screen[]
  /**
   * A coluna de navegação embutida está aberta (ícone + nome)? Não persiste:
   * ela nasce recolhida a cada abertura, e mora no store (e não no componente)
   * porque a coluna vive dentro do painel central, que é remontado a cada
   * troca de tela.
   */
  dockExpanded: boolean
  /** Pastas favoritadas (caminhos), na ordem do carrossel de Arquivos. */
  favorites: string[]
  /**
   * Modo desktop ligado. Só o "ligado" mora aqui: a posição da janela é do
   * processo main, que é quem vê a janela se mover.
   */
  desktopMode: boolean
  /**
   * O app nasce recolhido na ilha, e a janela espera ser chamada. Quem obedece
   * (e quem confere se há caminho de volta) é o main, no arranque.
   */
  desktopStartHidden: boolean
  /** Caminho da lista M3U da biblioteca de mídia. Vazio = nenhuma escolhida. */
  playlist: string
  /** Títulos favoritados, na ordem escolhida pelo usuário. */
  mediaFavorites: string[]
  /** Listas com nome dentro dos favoritos. */
  mediaGroups: MediaGroup[]
  /** Onde parou em cada título. Escrito pelo main; aqui só se lê. */
  recent: Progress[]
  /** Chave da API do TMDB. Vazia = sem metadados. */
  tmdbKey: string
  /** Repositórios fixados na tela do Claude. */
  claudeProjects: string[]
  /** Grupos da lista de projetos ("Jogos"), cada um recolhível. */
  claudeGroups: ClaudeGroup[]
  /** O quanto os agentes podem fazer. Nasce em `plan`: só leitura. */
  claudeMode: PermissionMode
  /** Caminho do programa `claude`. Vazio = o app procura sozinho. */
  claudeCli: string
  /** A ilha dinâmica — código isolado, ver `src/shared/island.ts`. */
  island: IslandSettings
  /** O lançador em janela própria (Meta+V). */
  launcher: LauncherSettings
  /** As notificações do sistema no estilo do ambiente (a janela dos avisos). */
  notificacoes: NotificacoesSettings
  /** Endereço do servidor Seafile do usuário. */
  seafileServer: string
  /** Biblioteca que recebe os arquivos arrastados na ilha. */
  seafileLibrary: string
  /** Caminho do `.acs` do mascote, e se ele substitui o orbe. */
  mascotFile: string
  mascotOn: boolean
  /** Com que frequência o mascote faz bobagem sozinho. */
  mascotLiveliness: MascotLiveliness
  /**
   * Client ID do Spotify, criado pelo usuário no painel de desenvolvedor dele.
   *
   * Só o Client ID mora aqui. O refresh token do OAuth é escrito pelo main, e
   * o renderer nem o recebe de volta — ver `saveSpotifyToken` em
   * `src/main/settings.ts`.
   */
  spotifyClientId: string
  /**
   * Endereço de retorno do consentimento, quando o usuário registrou outro no
   * painel do Spotify. Vazio usa o padrão do app.
   */
  spotifyRedirect: string
  /** Feeds RSS/Atom da coluna de leitura, na ordem em que o usuário os pôs. */
  newsFeeds: string[]

  setScreen: (screen: Screen) => void
  toggleDrawer: () => void
  toggle: (key: Toggle) => void
  setTab: <K extends keyof HaloState['tabs']>(key: K, value: HaloState['tabs'][K]) => void
  /** Troca o tema do app. Quem manda no papel de parede é quem chama. */
  setEnvironment: (id: EnvironmentId) => void
  /** Trocar (ou não) o papel de parede do sistema junto com o ambiente. */
  setEnvironmentWallpaper: (on: boolean) => void
  /**
   * A imagem de UM ambiente. Caminho vazio devolve o padrão daquele ambiente
   * — é a mesma regra de "campo ausente quer dizer não escolhi" que vale para
   * os ajustes do ambiente.
   */
  setEnvironmentImage: (id: EnvironmentId, path: string) => void
  /** O vídeo de fundo de um ambiente; vazio tira o vídeo e volta à imagem. */
  setEnvironmentVideo: (id: EnvironmentId, path: string) => void
  togglePlay: (player: Player) => void
  toggleFollow: () => void
  setLab: (index: 0 | 1 | 2) => void
  setSlider: (key: Slider, value: number) => void
  setEntrance: (entrance: EntranceName) => void
  /** Volta ao preset do ambiente: apaga a escolha, não escolhe outra. */
  resetEntrance: () => void
  /** Ajusta o vidro e a transição DO AMBIENTE ATIVO. */
  setAjuste: (patch: AjustesDoAmbiente) => void
  /**
   * A altura da pílula da ilha NAQUELE ambiente; `undefined` devolve a global
   * de Configurações → Ilha.
   */
  setIslandHeight: (id: EnvironmentId, px: number | undefined) => void
  /** Volta os gráficos dos medidores ao preset do ambiente ativo. */
  resetGraphs: () => void
  replay: () => void
  setSettingsSection: (section: SettingsSection) => void
  setAppearance: (patch: Partial<Appearance>) => void
  setWidgets: (patch: Partial<Widgets>) => void
  toggleScreen: (screen: Screen) => void
  toggleDockExpanded: () => void
  toggleFavorite: (path: string) => void
  setDesktopMode: (on: boolean) => void
  setDesktopStartHidden: (on: boolean) => void
  setPlaylist: (path: string) => void
  toggleMediaFavorite: (id: string) => void
  createGroup: (name: string) => void
  renameGroup: (groupId: string, name: string) => void
  deleteGroup: (groupId: string) => void
  toggleInGroup: (groupId: string, titleId: string) => void
  /** Move um título para a posição de outro, na lista dada (ou nos favoritos). */
  reorderTitles: (groupId: string | null, fromId: string, toId: string) => void
  setRecent: (recent: Progress[]) => void
  setTmdbKey: (key: string) => void
  addClaudeProject: (path: string) => void
  removeClaudeProject: (path: string) => void
  /** Cria um grupo; com `first`, já o põe dentro (é o que o clique pediu). */
  createClaudeGroup: (name: string, first?: string) => void
  renameClaudeGroup: (groupId: string, name: string) => void
  /** Apaga o grupo; os projetos voltam para "Sem grupo", nenhum sai da lista. */
  deleteClaudeGroup: (groupId: string) => void
  toggleClaudeGroup: (groupId: string) => void
  /** Põe o grupo antes de `before`; `null` o manda para o fim. */
  reorderClaudeGroup: (groupId: string, before: string | null) => void
  /**
   * Leva um projeto para um grupo (`null` = "Sem grupo"). Com `before`, ele
   * entra no lugar daquele projeto — é assim que arrastar também reordena.
   */
  moveClaudeProject: (path: string, groupId: string | null, before?: string) => void
  setClaudeMode: (mode: PermissionMode) => void
  setClaudeCli: (cli: string) => void
  setIsland: (patch: Partial<IslandSettings>) => void
  setLauncher: (patch: Partial<LauncherSettings>) => void
  setNotificacoes: (patch: Partial<NotificacoesSettings>) => void
  setSeafileServer: (server: string) => void
  setSeafileLibrary: (library: string) => void
  setMascot: (patch: { file?: string; on?: boolean; liveliness?: MascotLiveliness }) => void
  setSpotifyClientId: (id: string) => void
  setSpotifyRedirect: (uri: string) => void
  /** Acrescenta no fim: a ordem é do usuário. Repetido não entra. */
  addNewsFeed: (url: string) => void
  removeNewsFeed: (url: string) => void
  seedFavorites: (paths: string[]) => void
  resetAppearance: () => void
}

export const useHalo = create<HaloState>((set) => ({
  screen: 'home',
  drawer: false,
  tg: { ambient: true, dnd: false, spatial: true, subs: true },
  tabs: { lib: 'Playlists', view: 'grid' },
  environment: initial.environment,
  playing: { music: false, home: true, media: false },
  follow: false,
  lab: 0,
  sliders: { imersao: 70, vol: 64, mvol: 58 },
  nonce: 0,
  settingsSection: 'animation',
  language: initial.language,
  setLanguage: (language) => {
    definirIdioma(language)
    set({ language })
  },
  appearance: initial.appearance,
  widgets: initial.widgets,
  hiddenScreens: initial.hiddenScreens as Screen[],
  dockExpanded: false,
  favorites: initial.favorites,
  desktopMode: initial.desktop.on,
  desktopStartHidden: initial.desktop.startHidden,
  playlist: initial.media.playlist,
  mediaFavorites: initial.media.favorites,
  mediaGroups: initial.media.groups,
  recent: initial.media.recent,
  tmdbKey: initial.media.tmdbKey,
  claudeProjects: initial.claude.projects,
  claudeGroups: initial.claude.groups,
  claudeMode: initial.claude.mode,
  claudeCli: initial.claude.cli,
  island: initial.island,
  launcher: initial.launcher,
  notificacoes: initial.notificacoes,
  seafileServer: initial.seafile.server,
  seafileLibrary: initial.seafile.library,
  mascotFile: initial.mascot.file,
  mascotOn: initial.mascot.on,
  mascotLiveliness: initial.mascot.liveliness,
  spotifyClientId: initial.music.spotifyClientId,
  spotifyRedirect: initial.music.spotifyRedirect,
  newsFeeds: initial.news.feeds,

  // Fechar a gaveta ao trocar de tela: ela é ancorada na home.
  setScreen: (screen) => set({ screen, drawer: false }),
  toggleDrawer: () => set((s) => ({ drawer: !s.drawer })),
  toggle: (key) => set((s) => ({ tg: { ...s.tg, [key]: !s.tg[key] } })),
  setTab: (key, value) => set((s) => ({ tabs: { ...s.tabs, [key]: value } })),
  setEnvironment: (id) => set((s) => ({ environment: { ...s.environment, id } })),
  setEnvironmentWallpaper: (wallpaper) =>
    set((s) => ({ environment: { ...s.environment, wallpaper } })),
  setEnvironmentImage: (id, path) =>
    set((s) => {
      const wallpapers = { ...s.environment.wallpapers }
      // Apagar a chave, e não guardar string vazia: ausência é o que significa
      // "use o padrão", e um campo vazio no JSON diria a mesma coisa por outro
      // caminho — dois jeitos de dizer o mesmo é como um deles fica para trás.
      if (path) wallpapers[id] = path
      else delete wallpapers[id]
      return { environment: { ...s.environment, wallpapers } }
    }),
  // Mesma regra: sem vídeo é chave AUSENTE, nunca string vazia.
  setEnvironmentVideo: (id, path) =>
    set((s) => {
      const videos = { ...s.environment.videos }
      if (path) videos[id] = path
      else delete videos[id]
      return { environment: { ...s.environment, videos } }
    }),
  togglePlay: (player) => set((s) => ({ playing: { ...s.playing, [player]: !s.playing[player] } })),
  toggleFollow: () => set((s) => ({ follow: !s.follow })),
  setLab: (lab) => set({ lab }),
  setSlider: (key, value) =>
    set((s) => ({
      sliders: { ...s.sliders, [key]: Math.max(0, Math.min(100, Math.round(value))) },
    })),
  // Trocar de animação já mostra a nova: remonta e roda de novo.
  setEntrance: (entrance) =>
    set((s) => ({ environment: comAjuste(s.environment, { entrance }), nonce: s.nonce + 1 })),
  resetEntrance: () =>
    set((s) => ({ environment: semAjuste(s.environment, ['entrance']), nonce: s.nonce + 1 })),
  setAjuste: (patch) => set((s) => ({ environment: comAjuste(s.environment, patch) })),
  setIslandHeight: (id, px) =>
    set((s) => ({
      environment: comAltura(s.environment, id, px === undefined ? undefined : limitarAltura(px)),
    })),
  resetGraphs: () => set((s) => ({ environment: semAjuste(s.environment, ['graphs']) })),
  replay: () => set((s) => ({ nonce: s.nonce + 1 })),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  setAppearance: (patch) => set((s) => ({ appearance: { ...s.appearance, ...patch } })),
  setWidgets: (patch) => set((s) => ({ widgets: { ...s.widgets, ...patch } })),

  /**
   * Esconde ou mostra uma tela no dock.
   *
   * Se a tela escondida for a que está aberta, volta para a home — deixar o
   * usuário preso numa tela que ele acabou de tirar do dock seria armadilha.
   */
  toggleFavorite: (path) =>
    set((s) => ({
      favorites: s.favorites.includes(path)
        ? s.favorites.filter((p) => p !== path)
        : [...s.favorites, path],
    })),

  /**
   * Primeira execução: as pastas do XDG entram como favoritas iniciais.
   *
   * Só semeia se a lista nunca foi mexida — depois disso, tirar uma favorita
   * precisa continuar valendo, inclusive se sobrar nenhuma.
   */
  seedFavorites: (paths) => set((s) => (s.favorites.length === 0 ? { favorites: paths } : s)),

  toggleScreen: (screen) =>
    set((s) => {
      if (!(HIDEABLE_SCREENS as readonly string[]).includes(screen)) return s
      const hidden = s.hiddenScreens.includes(screen)
        ? s.hiddenScreens.filter((x) => x !== screen)
        : [...s.hiddenScreens, screen]
      return { hiddenScreens: hidden, screen: hidden.includes(s.screen) ? 'home' : s.screen }
    }),
  toggleDockExpanded: () => set((s) => ({ dockExpanded: !s.dockExpanded })),
  setDesktopMode: (desktopMode) => set({ desktopMode }),
  setDesktopStartHidden: (desktopStartHidden) => set({ desktopStartHidden }),
  setPlaylist: (playlist) => set({ playlist }),
  /**
   * Favorita ou desfavorita.
   *
   * Desfavoritar tira o título de todas as listas: uma lista é um subconjunto
   * dos favoritos, e deixar um título órfão numa lista invisível em Favoritos
   * seria armadilha.
   */
  toggleMediaFavorite: (id) =>
    set((s) => {
      const tinha = s.mediaFavorites.includes(id)
      return {
        mediaFavorites: tinha
          ? s.mediaFavorites.filter((x) => x !== id)
          : [...s.mediaFavorites, id],
        mediaGroups: tinha
          ? s.mediaGroups.map((g) => ({ ...g, titles: g.titles.filter((x) => x !== id) }))
          : s.mediaGroups,
      }
    }),

  createGroup: (name) =>
    set((s) => {
      const limpo = name.trim().slice(0, 32)
      if (!limpo) return s
      // Id próprio, e não o nome: renomear não pode perder os títulos.
      const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      return { mediaGroups: [...s.mediaGroups, { id, name: limpo, titles: [] }] }
    }),

  renameGroup: (groupId, name) =>
    set((s) => {
      const limpo = name.trim().slice(0, 32)
      if (!limpo) return s
      return {
        mediaGroups: s.mediaGroups.map((g) => (g.id === groupId ? { ...g, name: limpo } : g)),
      }
    }),

  // Apagar a lista não desfavorita nada: o título continua em Favoritos.
  deleteGroup: (groupId) =>
    set((s) => ({ mediaGroups: s.mediaGroups.filter((g) => g.id !== groupId) })),

  /** Põe ou tira um título de uma lista — e pôr também favorita. */
  toggleInGroup: (groupId, titleId) =>
    set((s) => {
      const grupo = s.mediaGroups.find((g) => g.id === groupId)
      if (!grupo) return s
      const dentro = grupo.titles.includes(titleId)
      return {
        mediaGroups: s.mediaGroups.map((g) =>
          g.id === groupId
            ? {
                ...g,
                titles: dentro ? g.titles.filter((x) => x !== titleId) : [...g.titles, titleId],
              }
            : g,
        ),
        mediaFavorites:
          !dentro && !s.mediaFavorites.includes(titleId)
            ? [...s.mediaFavorites, titleId]
            : s.mediaFavorites,
      }
    }),

  /**
   * Reordena arrastando: tira o título de onde está e o põe onde o outro
   * estava. `groupId` nulo reordena os próprios favoritos.
   */
  reorderTitles: (groupId, fromId, toId) =>
    set((s) => {
      if (fromId === toId) return s
      const mover = (lista: string[]) => {
        const de = lista.indexOf(fromId)
        const para = lista.indexOf(toId)
        if (de === -1 || para === -1) return lista
        const copia = [...lista]
        copia.splice(de, 1)
        copia.splice(para, 0, fromId)
        return copia
      }
      return groupId === null
        ? { mediaFavorites: mover(s.mediaFavorites) }
        : {
            mediaGroups: s.mediaGroups.map((g) =>
              g.id === groupId ? { ...g, titles: mover(g.titles) } : g,
            ),
          }
    }),
  setRecent: (recent) => set({ recent }),
  setTmdbKey: (tmdbKey) => set({ tmdbKey }),
  addClaudeProject: (path) =>
    set((s) =>
      s.claudeProjects.includes(path) ? s : { claudeProjects: [...s.claudeProjects, path] },
    ),
  // Tirar da lista tira do grupo também: um grupo só guarda projeto fixado.
  removeClaudeProject: (path) =>
    set((s) => ({
      claudeProjects: s.claudeProjects.filter((p) => p !== path),
      claudeGroups: semProjeto(s.claudeGroups, path),
    })),

  createClaudeGroup: (name, first) =>
    set((s) => {
      const limpo = name.trim().slice(0, 32)
      if (!limpo) return s
      // Id próprio, e não o nome: renomear não pode perder os projetos.
      const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      const grupos = first ? semProjeto(s.claudeGroups, first) : s.claudeGroups
      return {
        claudeGroups: [
          ...grupos,
          { id, name: limpo, projects: first ? [first] : [], collapsed: false },
        ],
      }
    }),

  renameClaudeGroup: (groupId, name) =>
    set((s) => {
      const limpo = name.trim().slice(0, 32)
      if (!limpo) return s
      return {
        claudeGroups: s.claudeGroups.map((g) => (g.id === groupId ? { ...g, name: limpo } : g)),
      }
    }),

  deleteClaudeGroup: (groupId) =>
    set((s) => ({ claudeGroups: s.claudeGroups.filter((g) => g.id !== groupId) })),

  toggleClaudeGroup: (groupId) =>
    set((s) => ({
      claudeGroups: s.claudeGroups.map((g) =>
        g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
      ),
    })),

  // Pedido do usuário depois de usar os grupos: a ordem deles também é dele.
  reorderClaudeGroup: (groupId, before) =>
    set((s) => {
      if (groupId === before) return s
      const grupo = s.claudeGroups.find((g) => g.id === groupId)
      if (!grupo) return s
      const lista = s.claudeGroups.filter((g) => g.id !== groupId)
      const para = before ? lista.findIndex((g) => g.id === before) : -1
      if (para !== -1) lista.splice(para, 0, grupo)
      else lista.push(grupo)
      return { claudeGroups: lista }
    }),

  moveClaudeProject: (path, groupId, before) =>
    set((s) => {
      if (path === before || !s.claudeProjects.includes(path)) return s
      const grupos = semProjeto(s.claudeGroups, path)
      if (groupId === null) {
        // "Sem grupo" não tem lista própria: a ordem dele é a de
        // `claudeProjects`, então reordenar ali é mover na lista de todos.
        if (!before) return { claudeGroups: grupos }
        const lista = s.claudeProjects.filter((p) => p !== path)
        const para = lista.indexOf(before)
        if (para !== -1) lista.splice(para, 0, path)
        else lista.push(path)
        return { claudeGroups: grupos, claudeProjects: lista }
      }
      return {
        claudeGroups: grupos.map((g) => {
          if (g.id !== groupId) return g
          const lista = [...g.projects]
          const para = before ? lista.indexOf(before) : -1
          if (para !== -1) lista.splice(para, 0, path)
          else lista.push(path)
          // Soltar num grupo recolhido abre ele: senão o projeto some da
          // vista no instante em que o usuário o solta.
          return { ...g, projects: lista, collapsed: false }
        }),
      }
    }),
  setClaudeMode: (claudeMode) => set({ claudeMode }),
  setClaudeCli: (claudeCli) => set({ claudeCli }),
  setIsland: (patch) => set((s) => ({ island: { ...s.island, ...patch } })),
  setLauncher: (patch) => set((s) => ({ launcher: { ...s.launcher, ...patch } })),
  setNotificacoes: (patch) => set((s) => ({ notificacoes: { ...s.notificacoes, ...patch } })),
  setSeafileServer: (seafileServer) => set({ seafileServer }),
  setSeafileLibrary: (seafileLibrary) => set({ seafileLibrary }),
  setMascot: (patch) =>
    set((s) => ({
      mascotFile: patch.file ?? s.mascotFile,
      mascotOn: patch.on ?? s.mascotOn,
      mascotLiveliness: patch.liveliness ?? s.mascotLiveliness,
    })),
  setSpotifyClientId: (spotifyClientId) => set({ spotifyClientId }),
  setSpotifyRedirect: (spotifyRedirect) => set({ spotifyRedirect }),
  addNewsFeed: (url) =>
    set((s) => {
      const limpo = url.trim()
      if (!limpo || s.newsFeeds.includes(limpo) || s.newsFeeds.length >= MAX_FEEDS) return s
      return { newsFeeds: [...s.newsFeeds, limpo] }
    }),
  removeNewsFeed: (url) => set((s) => ({ newsFeeds: s.newsFeeds.filter((f) => f !== url) })),
  // A seção Aparência cuida do vidro e da transição — não da entrada, que tem
  // botão próprio na seção Animação.
  //
  // E não da AMPLIAÇÃO. `scale` mora em `appearance` por herança, mas quem o
  // controla é a seção Janela, e quem aplica é o `setScale` do main, chamado
  // por um efeito que só existe enquanto AQUELA seção está montada. Devolver
  // `DEFAULT_SETTINGS.appearance` inteiro daqui gravava `scale: 1` no disco
  // sem redimensionar a janela — e, como este botão aparece no painel direito
  // de quase toda seção, um clique em "Notícias" mudava o tamanho da janela do
  // usuário na próxima abertura. O que é da Janela volta na Janela.
  resetAppearance: () =>
    set((s) => ({
      appearance: { ...DEFAULT_SETTINGS.appearance, scale: s.appearance.scale },
      environment: semAjuste(s.environment, ['transparency', 'clarity', 'contentEntrance']),
    })),
}))

/** Tira o projeto de qualquer grupo: ele mora em um só, nunca em dois. */
function semProjeto(grupos: ClaudeGroup[], path: string): ClaudeGroup[] {
  return grupos.map((g) =>
    g.projects.includes(path) ? { ...g, projects: g.projects.filter((p) => p !== path) } : g,
  )
}

/**
 * Grava um ajuste NO AMBIENTE ATIVO.
 *
 * É aqui que mora a resposta para "por que mexer na transparência da Floresta
 * aparecia no BioShock": os quatro campos com preset são por ambiente, e não
 * globais. Trocar de ambiente não copia nada — cada um lê o que é dele.
 */
function comAjuste(
  environment: EnvironmentSettings,
  patch: AjustesDoAmbiente,
): EnvironmentSettings {
  const atual = environment.ajustes[environment.id] ?? {}
  return {
    ...environment,
    ajustes: { ...environment.ajustes, [environment.id]: { ...atual, ...patch } },
  }
}

/** Apaga campos do ajuste do ambiente ativo — o "Restaurar padrão" das seções. */
function semAjuste(
  environment: EnvironmentSettings,
  campos: (keyof AjustesDoAmbiente)[],
): EnvironmentSettings {
  const atual = { ...(environment.ajustes[environment.id] ?? {}) }
  for (const campo of campos) delete atual[campo]
  const ajustes = { ...environment.ajustes }
  // Ambiente sem nenhum ajuste sai do mapa: assim "está no preset" é a
  // ausência da chave, e o arquivo não enche de objetos vazios.
  if (Object.keys(atual).length === 0) delete ajustes[environment.id]
  else ajustes[environment.id] = atual
  return { ...environment, ajustes }
}

/**
 * A altura da pílula de UM ambiente, qualquer um. `undefined` apaga a escolha,
 * e a altura global volta a valer.
 */
function comAltura(
  environment: EnvironmentSettings,
  id: EnvironmentId,
  px: number | undefined,
): EnvironmentSettings {
  const atual = { ...(environment.ajustes[id] ?? {}) }
  if (px === undefined) delete atual.islandHeight
  else atual.islandHeight = px
  const ajustes = { ...environment.ajustes }
  if (Object.keys(atual).length === 0) delete ajustes[id]
  else ajustes[id] = atual
  return { ...environment, ajustes }
}
