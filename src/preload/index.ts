import type { Agent, AgentMessage, AgentSession, Attachment, PermissionMode } from '@shared/agents'
import type { DesktopApp } from '@shared/apps'
import type {
  CreativeConnection,
  CreativeItem,
  CreativeLibrary,
  CreativePartial,
  CreativePreview,
  CreativeQuery,
  CreativeSearchResult,
} from '@shared/creative'
import type { DiagnosticoDoSistema } from '@shared/dependencias'
import type { EnvironmentId } from '@shared/environments'
import type { DirectoryListing, Favorite, Mount, StorageInfo } from '@shared/files'
import type {
  AppInfo,
  DesktopModeResult,
  HaloApi,
  PlayRequest,
  WallpaperResult,
  WindowSize,
} from '@shared/ipc-contract'
import { IPC } from '@shared/ipc-contract'
import type {
  CatalogEntry,
  IslandActivity,
  IslandClaude,
  IslandEvent,
  IslandFlight,
  IslandSnapshot,
  IslandSpectrum,
  IslandWindow,
  NoticesResult,
  ShelfItem,
} from '@shared/island'
import type { Container, HostStats, Machine, Monitor } from '@shared/lab'
import type { MascotAnimation, MascotChoice, MascotInfo } from '@shared/mascot'
import type {
  CatalogPage,
  CatalogQuery,
  CatalogStatus,
  Category,
  ExtraResult,
  Progress,
  TitleDetail,
} from '@shared/media'
import type { NewsResult } from '@shared/news'
import type { Aviso, EstadoDosAvisos } from '@shared/notificacoes'
import type { NowPlaying } from '@shared/player'
import type { Project } from '@shared/projects'
import type { SeafileAuth, SeafileResolution, SeafileState } from '@shared/seafile'
import type { RecenteDoLancador } from '@shared/settings'
import { type HaloSettings, parseSettings } from '@shared/settings'
import type {
  SpotifyAuth,
  SpotifyCommand,
  SpotifyControlResult,
  SpotifyDetail,
  SpotifyLibrary,
  SpotifyPlayback,
  SpotifyResult,
} from '@shared/spotify'
import type { Weather } from '@shared/weather'
import { contextBridge, ipcRenderer, webUtils } from 'electron'

/*
 * Os arquivos de um arrasto de verdade, contados ao main ANTES de a página ver
 * o evento. A gaveta da ilha só guarda arquivo que chegou assim: a página pode
 * pedir "guarde /qualquer/caminho", mas não consegue fabricar um `drop`
 * confiável com arquivos do disco — um evento sintético tem `isTrusted` falso
 * e um `File` criado por ela não tem caminho. Sem isto, uma tela
 * comprometida punha qualquer arquivo na gaveta e o abria com o programa
 * padrão (auditoria de 26/09/2026).
 */
addEventListener(
  'drop',
  (evento) => {
    if (!evento.isTrusted || !evento.dataTransfer) return
    const caminhos = [...evento.dataTransfer.files]
      .map((arquivo) => {
        try {
          return webUtils.getPathForFile(arquivo)
        } catch {
          return ''
        }
      })
      .filter(Boolean)
    if (caminhos.length > 0) ipcRenderer.send(IPC.arrastoSolto, caminhos)
  },
  true,
)

/**
 * Superfície mínima e tipada. Cresce um método por integração real (F5),
 * nunca expondo `ipcRenderer` inteiro ao renderer.
 */
/**
 * As configurações do arranque. Só a janela marcada pelo main as recebe (ver
 * `window.ts`), por IPC síncrono: a janela precisa delas antes do primeiro
 * desenho, e no argv elas seriam legíveis em `/proc` por qualquer usuário.
 */
function initialSettings(): HaloSettings {
  if (!process.argv.includes('--halo-settings-ipc')) return parseSettings(null)
  try {
    return parseSettings(ipcRenderer.sendSync(IPC.settingsInicial))
  } catch {
    return parseSettings(null)
  }
}

const api: HaloApi = {
  window: {
    onDormindo: (handler: (dormindo: boolean) => void) => {
      const ouvinte = (_e: unknown, dormindo: boolean) => handler(dormindo)
      ipcRenderer.on(IPC.windowDormindo, ouvinte)
      return () => ipcRenderer.removeListener(IPC.windowDormindo, ouvinte)
    },
    close: () => ipcRenderer.send(IPC.windowClose),
    setScale: (scale: number) =>
      ipcRenderer.invoke(IPC.windowSetScale, scale) as Promise<WindowSize>,
    setDesktopMode: (on: boolean) =>
      ipcRenderer.invoke(IPC.windowDesktopMode, on) as Promise<DesktopModeResult>,
    relaunch: () => ipcRenderer.send(IPC.windowRelaunch),
  },
  appInfo: () => ipcRenderer.invoke(IPC.appInfo) as Promise<AppInfo>,
  wallpaper: {
    apply: (id: EnvironmentId) =>
      ipcRenderer.invoke(IPC.wallpaperApply, id) as Promise<WallpaperResult>,
    previews: () =>
      ipcRenderer.invoke(IPC.wallpaperPreviews) as Promise<Partial<Record<EnvironmentId, string>>>,
    choose: () => ipcRenderer.invoke(IPC.wallpaperChoose) as Promise<string | null>,
    chooseVideo: () => ipcRenderer.invoke(IPC.wallpaperChooseVideo) as Promise<string | null>,
    videoPlugin: () => ipcRenderer.invoke(IPC.wallpaperVideoPlugin) as Promise<boolean>,
    original: () => ipcRenderer.invoke(IPC.wallpaperOriginal) as Promise<boolean>,
    restaurar: () => ipcRenderer.invoke(IPC.wallpaperRestaurar) as Promise<WallpaperResult>,
  },
  idioma: {
    onMudou: (handler: (idioma: string) => void) => {
      const ouvinte = (_e: unknown, idioma: string) => handler(idioma)
      ipcRenderer.on(IPC.idiomaMudou, ouvinte)
      return () => ipcRenderer.removeListener(IPC.idiomaMudou, ouvinte)
    },
  },
  system: {
    dependencies: () => ipcRenderer.invoke(IPC.systemDependencies) as Promise<DiagnosticoDoSistema>,
  },
  weather: {
    current: (place: string) => ipcRenderer.invoke(IPC.weatherCurrent, place) as Promise<Weather>,
  },
  news: {
    headlines: (feeds: string[]) =>
      ipcRenderer.invoke(IPC.newsHeadlines, feeds) as Promise<NewsResult>,
  },
  lab: {
    host: () => ipcRenderer.invoke(IPC.labHost) as Promise<HostStats>,
    machines: () => ipcRenderer.invoke(IPC.labMachines) as Promise<Machine[]>,
    containers: () => ipcRenderer.invoke(IPC.labContainers) as Promise<Container[]>,
    monitors: () => ipcRenderer.invoke(IPC.labMonitors) as Promise<Monitor[]>,
  },
  files: {
    list: (path?: string) => ipcRenderer.invoke(IPC.filesList, path) as Promise<DirectoryListing>,
    storage: (path?: string) => ipcRenderer.invoke(IPC.filesStorage, path) as Promise<StorageInfo>,
    favorites: () => ipcRenderer.invoke(IPC.filesFavorites) as Promise<Favorite[]>,
    mounts: () => ipcRenderer.invoke(IPC.filesMounts) as Promise<Mount[]>,
    pathOf: (file: File) => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    },
  },
  media: {
    status: () => ipcRenderer.invoke(IPC.mediaStatus) as Promise<CatalogStatus>,
    categories: () => ipcRenderer.invoke(IPC.mediaCategories) as Promise<Category[]>,
    catalog: (query: CatalogQuery) =>
      ipcRenderer.invoke(IPC.mediaCatalog, query) as Promise<CatalogPage>,
    title: (id: string) => ipcRenderer.invoke(IPC.mediaTitle, id) as Promise<TitleDetail | null>,
    extra: (id: string) => ipcRenderer.invoke(IPC.mediaExtra, id) as Promise<ExtraResult>,
    choose: () => ipcRenderer.invoke(IPC.mediaChoose) as Promise<string | null>,
    play: (id: string, episode?: string | null, startAt?: number) =>
      ipcRenderer.invoke(IPC.mediaPlay, id, episode ?? null, startAt ?? 0) as Promise<void>,
    forget: (id: string, episode: string | null) => ipcRenderer.send(IPC.mediaForget, id, episode),
    onRecent: (handler: (recent: Progress[]) => void) => {
      const ouvinte = (_e: unknown, recent: Progress[]) => handler(recent)
      ipcRenderer.on(IPC.mediaRecent, ouvinte)
      return () => ipcRenderer.removeListener(IPC.mediaRecent, ouvinte)
    },
  },
  player: {
    nowPlaying: () => ipcRenderer.invoke(IPC.playerNowPlaying) as Promise<NowPlaying | null>,
    /**
     * O main manda o que tocar; devolve a função que cancela a escuta.
     *
     * O evento é reenviado a cada `play`, inclusive com a janela já aberta —
     * é assim que trocar de episódio não abre um player novo.
     */
    onLoad: (handler: (request: PlayRequest) => void) => {
      const ouvinte = (_e: unknown, request: PlayRequest) => handler(request)
      ipcRenderer.on(IPC.playerLoad, ouvinte)
      return () => ipcRenderer.removeListener(IPC.playerLoad, ouvinte)
    },
    fullscreen: () => ipcRenderer.invoke(IPC.playerFullscreen) as Promise<boolean>,
    mini: () => ipcRenderer.invoke(IPC.playerMini) as Promise<boolean>,
    pin: () => ipcRenderer.invoke(IPC.playerPin) as Promise<{ on: boolean; supported: boolean }>,
    pinSupported: () => ipcRenderer.invoke(IPC.playerPinSupported) as Promise<boolean>,
    progress: (seconds: number, duration: number) =>
      ipcRenderer.send(IPC.playerProgress, seconds, duration),
    close: () => ipcRenderer.send(IPC.playerClose),
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC.projectsList) as Promise<Project[]>,
    info: (path: string) => ipcRenderer.invoke(IPC.projectsInfo, path) as Promise<Project | null>,
  },
  apps: {
    list: () => ipcRenderer.invoke(IPC.appsList) as Promise<DesktopApp[]>,
    launch: (id: string) => ipcRenderer.invoke(IPC.appsLaunch, id) as Promise<void>,
  },
  agents: {
    list: () => ipcRenderer.invoke(IPC.agentsList) as Promise<Agent[]>,
    create: (project: string, resume?: string) =>
      ipcRenderer.invoke(IPC.agentsCreate, project, resume ?? null) as Promise<Agent>,
    send: (id: string, text: string, attachments?: Attachment[]) =>
      ipcRenderer.send(IPC.agentsSend, id, text, attachments ?? []),
    sessions: (project: string) =>
      ipcRenderer.invoke(IPC.agentsSessions, project) as Promise<AgentSession[]>,
    attach: () => ipcRenderer.invoke(IPC.agentsAttach, null) as Promise<Attachment[]>,
    attachPaths: (paths: string[]) =>
      ipcRenderer.invoke(IPC.agentsAttach, paths) as Promise<Attachment[]>,
    close: (id: string) => ipcRenderer.send(IPC.agentsClose, id),
    messages: (id: string) => ipcRenderer.invoke(IPC.agentsMessages, id) as Promise<AgentMessage[]>,
    onChanged: (handler: (agents: Agent[]) => void) => {
      const ouvinte = (_e: unknown, agents: Agent[]) => handler(agents)
      ipcRenderer.on(IPC.agentsChanged, ouvinte)
      return () => ipcRenderer.removeListener(IPC.agentsChanged, ouvinte)
    },
    addProject: () => ipcRenderer.invoke(IPC.claudeProjectAdd) as Promise<string | null>,
    openProject: (path: string) =>
      ipcRenderer.invoke(IPC.claudeProjectOpen, path) as Promise<boolean>,
    chooseCli: () => ipcRenderer.invoke(IPC.claudeChooseCli) as Promise<string | null>,
    setMode: (mode: PermissionMode) =>
      ipcRenderer.invoke(IPC.claudeSetMode, mode) as Promise<PermissionMode>,
  },
  island: {
    snapshot: () => ipcRenderer.invoke(IPC.islandSnapshot) as Promise<IslandSnapshot>,
    run: (actionId: string, arg?: string) =>
      ipcRenderer.invoke(IPC.islandAction, actionId, arg ?? null) as Promise<void>,
    setOpen: (on: boolean) => ipcRenderer.send(IPC.islandOpen, on),
    displays: () =>
      ipcRenderer.invoke(IPC.islandDisplays) as Promise<
        { id: string; label: string; primary: boolean }[]
      >,
    catalog: () => ipcRenderer.invoke(IPC.islandCatalog) as Promise<CatalogEntry[]>,
    onSnapshot: (handler: (snapshot: IslandSnapshot) => void) => {
      const ouvinte = (_e: unknown, snapshot: IslandSnapshot) => handler(snapshot)
      ipcRenderer.on(IPC.islandPush, ouvinte)
      return () => ipcRenderer.removeListener(IPC.islandPush, ouvinte)
    },
    shelf: () => ipcRenderer.invoke(IPC.islandShelf) as Promise<ShelfItem[]>,
    notices: () => ipcRenderer.invoke(IPC.islandNotices) as Promise<NoticesResult>,
    onNoticesChanged: (handler: () => void) => {
      const ouvinte = () => handler()
      ipcRenderer.on(IPC.islandNoticesChanged, ouvinte)
      return () => ipcRenderer.removeListener(IPC.islandNoticesChanged, ouvinte)
    },
    onShelf: (handler: (items: ShelfItem[]) => void) => {
      const ouvinte = (_e: unknown, items: ShelfItem[]) => handler(items)
      ipcRenderer.on(IPC.islandShelfChanged, ouvinte)
      return () => ipcRenderer.removeListener(IPC.islandShelfChanged, ouvinte)
    },
    dragStart: (path: string) => ipcRenderer.send(IPC.islandDragStart, path),
    janelas: () => ipcRenderer.invoke(IPC.islandJanelas) as Promise<IslandWindow[]>,
    janelasGuardadas: () =>
      ipcRenderer.invoke(IPC.islandJanelasGuardadas) as Promise<IslandWindow[]>,
    onJanelasGuardadas: (handler: (janelas: IslandWindow[]) => void) => {
      const ouvinte = (_e: unknown, janelas: IslandWindow[]) => handler(janelas)
      ipcRenderer.on(IPC.islandJanelasGuardadas, ouvinte)
      return () => ipcRenderer.removeListener(IPC.islandJanelasGuardadas, ouvinte)
    },
    onEvento: (handler: (evento: IslandEvent) => void) => {
      const ouvinte = (_e: unknown, evento: IslandEvent) => handler(evento)
      ipcRenderer.on(IPC.islandEvento, ouvinte)
      return () => ipcRenderer.removeListener(IPC.islandEvento, ouvinte)
    },
    setFocus: (on: boolean) => ipcRenderer.send(IPC.islandFoco, on),
    assentou: (altura: number) => ipcRenderer.send(IPC.islandAssentou, altura),
    alvo: (retangulos: { x: number; y: number; width: number; height: number }[]) =>
      ipcRenderer.send(IPC.islandAlvo, retangulos),
    vooPronto: () => ipcRenderer.send(IPC.islandVooPronto),
    onVoo: (handler: (voo: IslandFlight) => void) => {
      const ouvinte = (_e: unknown, voo: IslandFlight) => handler(voo)
      ipcRenderer.on(IPC.islandVoo, ouvinte)
      return () => ipcRenderer.removeListener(IPC.islandVoo, ouvinte)
    },
    atividades: () => ipcRenderer.invoke(IPC.islandAtividades) as Promise<IslandActivity[]>,
    onAtividades: (handler: (atividades: IslandActivity[]) => void) => {
      const ouvinte = (_e: unknown, atividades: IslandActivity[]) => handler(atividades)
      ipcRenderer.on(IPC.islandAtividades, ouvinte)
      return () => ipcRenderer.removeListener(IPC.islandAtividades, ouvinte)
    },
    onEspectro: (handler: (niveis: IslandSpectrum) => void) => {
      const ouvinte = (_e: unknown, niveis: IslandSpectrum) => handler(niveis)
      ipcRenderer.on(IPC.islandEspectro, ouvinte)
      return () => ipcRenderer.removeListener(IPC.islandEspectro, ouvinte)
    },
    claude: () => ipcRenderer.invoke(IPC.islandClaude) as Promise<IslandClaude>,
    onClaude: (handler: (estado: IslandClaude) => void) => {
      const ouvinte = (_e: unknown, estado: IslandClaude) => handler(estado)
      ipcRenderer.on(IPC.islandClaude, ouvinte)
      return () => ipcRenderer.removeListener(IPC.islandClaude, ouvinte)
    },
    onAltura: (handler: (altura: number) => void) => {
      const ouvinte = (_e: unknown, altura: number) => handler(altura)
      ipcRenderer.on(IPC.islandAltura, ouvinte)
      return () => ipcRenderer.removeListener(IPC.islandAltura, ouvinte)
    },
  } /**
   * Social Arte. Tudo pelo main: as plataformas pedem credencial, e a CSP do
   * renderer não alcança host nenhum.
   */,
  creative: {
    connections: () => ipcRenderer.invoke(IPC.creativeConnections) as Promise<CreativeConnection[]>,
    search: (query: CreativeQuery, pedido?: number) =>
      ipcRenderer.invoke(IPC.creativeSearch, query, pedido) as Promise<CreativeSearchResult>,
    trending: (limite: number, cursor: string, pedido?: number) =>
      ipcRenderer.invoke(
        IPC.creativeTrending,
        limite,
        cursor,
        pedido,
      ) as Promise<CreativeSearchResult>,
    onPartial: (handler: (parcial: CreativePartial) => void) => {
      const ouvinte = (_e: unknown, parcial: CreativePartial) => handler(parcial)
      ipcRenderer.on(IPC.creativePartial, ouvinte)
      return () => ipcRenderer.removeListener(IPC.creativePartial, ouvinte)
    },
    signIn: (provider: string) => ipcRenderer.invoke(IPC.creativeSignIn, provider) as Promise<void>,
    release: () => ipcRenderer.send(IPC.creativeRelease),
    signOut: (provider: string) =>
      ipcRenderer.invoke(IPC.creativeSignOut, provider) as Promise<void>,
    preview: (url: string) =>
      ipcRenderer.invoke(IPC.creativePreview, url) as Promise<CreativePreview>,
    thumb: (url: string) => ipcRenderer.invoke(IPC.creativeThumb, url) as Promise<string>,
    library: () => ipcRenderer.invoke(IPC.creativeLibrary) as Promise<CreativeLibrary>,
    save: (item: CreativeItem, onde: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC.creativeSave, item, onde) as Promise<CreativeLibrary>,
    remove: (id: string) => ipcRenderer.invoke(IPC.creativeRemove, id) as Promise<CreativeLibrary>,
    favorite: (id: string, on: boolean) =>
      ipcRenderer.invoke(IPC.creativeFavorite, id, on) as Promise<CreativeLibrary>,
    move: (id: string, collections: string[]) =>
      ipcRenderer.invoke(IPC.creativeMove, id, collections) as Promise<CreativeLibrary>,
    annotate: (id: string, note: string, tags: string[]) =>
      ipcRenderer.invoke(IPC.creativeAnnotate, id, note, tags) as Promise<CreativeLibrary>,
    collectionCreate: (dados: Record<string, string>) =>
      ipcRenderer.invoke(IPC.creativeCollectionCreate, dados) as Promise<CreativeLibrary>,
    collectionEdit: (id: string, dados: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC.creativeCollectionEdit, id, dados) as Promise<CreativeLibrary>,
    collectionDelete: (id: string) =>
      ipcRenderer.invoke(IPC.creativeCollectionDelete, id) as Promise<CreativeLibrary>,
  },
  launcher: {
    hide: () => ipcRenderer.send(IPC.launcherHide),
    toggle: () => ipcRenderer.send(IPC.launcherToggle),
    onEnv: (handler: (env: string) => void) => {
      const ouvinte = (_e: unknown, env: string) => handler(env)
      ipcRenderer.on(IPC.launcherEnv, ouvinte)
      return () => ipcRenderer.removeListener(IPC.launcherEnv, ouvinte)
    },
    uso: (uso: Omit<RecenteDoLancador, 'n' | 'at'>) => ipcRenderer.send(IPC.launcherUso, uso),
    recentes: () => ipcRenderer.invoke(IPC.launcherRecentes) as Promise<RecenteDoLancador[]>,
    arrastar: (dx: number, dy: number) => ipcRenderer.send(IPC.launcherArrastar, dx, dy),
    arrastou: () => ipcRenderer.send(IPC.launcherArrastou),
  },
  notificacoes: {
    lista: () => ipcRenderer.invoke(IPC.notificacoesLista) as Promise<Aviso[]>,
    onAvisos: (handler: (avisos: Aviso[]) => void) => {
      const ouvinte = (_e: unknown, avisos: Aviso[]) => handler(avisos)
      ipcRenderer.on(IPC.notificacoesAvisos, ouvinte)
      return () => ipcRenderer.removeListener(IPC.notificacoesAvisos, ouvinte)
    },
    onEnv: (handler: (env: string) => void) => {
      const ouvinte = (_e: unknown, env: string) => handler(env)
      ipcRenderer.on(IPC.notificacoesEnv, ouvinte)
      return () => ipcRenderer.removeListener(IPC.notificacoesEnv, ouvinte)
    },
    agir: (id: number, chave: string) => ipcRenderer.send(IPC.notificacoesAgir, id, chave),
    fechar: (id: number) => ipcRenderer.send(IPC.notificacoesFechar, id),
    esquecer: (id: number) => ipcRenderer.send(IPC.notificacoesEsquecer, id),
    regiao: (retangulos: { x: number; y: number; width: number; height: number }[]) =>
      ipcRenderer.send(IPC.notificacoesRegiao, retangulos),
    desfoque: (areas: { x: number; y: number; width: number; height: number; raio: number }[]) =>
      ipcRenderer.send(IPC.notificacoesDesfoque, areas),
    estado: () => ipcRenderer.invoke(IPC.notificacoesEstado) as Promise<EstadoDosAvisos>,
    exemplo: () => ipcRenderer.invoke(IPC.notificacoesExemplo) as Promise<void>,
  },

  seafile: {
    state: () => ipcRenderer.invoke(IPC.seafileState) as Promise<SeafileState>,
    login: (user: string, password: string) =>
      ipcRenderer.invoke(IPC.seafileLogin, user, password) as Promise<SeafileAuth>,
    logout: () => ipcRenderer.send(IPC.seafileLogout),
    setLibrary: (id: string) => ipcRenderer.send(IPC.seafileLibrary, id),
    upload: (paths: string[]) => ipcRenderer.invoke(IPC.seafileUpload, paths) as Promise<void>,
    resolve: (id: string, choice: SeafileResolution) =>
      ipcRenderer.send(IPC.seafileResolve, id, choice),
    clearDone: () => ipcRenderer.send(IPC.seafileClear),
    onChanged: (handler: (state: SeafileState) => void) => {
      const ouvinte = (_e: unknown, state: SeafileState) => handler(state)
      ipcRenderer.on(IPC.seafileChanged, ouvinte)
      return () => ipcRenderer.removeListener(IPC.seafileChanged, ouvinte)
    },
  },
  mascot: {
    info: () => ipcRenderer.invoke(IPC.mascotInfo) as Promise<MascotInfo>,
    animation: (name: string) =>
      ipcRenderer.invoke(IPC.mascotAnimation, name) as Promise<MascotAnimation>,
    list: () => ipcRenderer.invoke(IPC.mascotList) as Promise<MascotChoice[]>,
    preview: (file: string) => ipcRenderer.invoke(IPC.mascotPreview, file) as Promise<string>,
    choose: () => ipcRenderer.invoke(IPC.mascotChoose) as Promise<string | null>,
  },
  settings: {
    initial: initialSettings(),
    save: (settings: HaloSettings) => ipcRenderer.send(IPC.settingsSave, settings),
  },
  spotify: {
    auth: () => ipcRenderer.invoke(IPC.spotifyAuth) as Promise<SpotifyAuth>,
    connect: () => ipcRenderer.invoke(IPC.spotifyConnect) as Promise<SpotifyAuth>,
    disconnect: () => ipcRenderer.invoke(IPC.spotifyDisconnect) as Promise<SpotifyAuth>,
    library: () => ipcRenderer.invoke(IPC.spotifyLibrary) as Promise<SpotifyResult<SpotifyLibrary>>,
    detail: (uri: string) =>
      ipcRenderer.invoke(IPC.spotifyDetail, uri) as Promise<SpotifyResult<SpotifyDetail>>,
    playback: () => ipcRenderer.invoke(IPC.spotifyPlayback) as Promise<SpotifyPlayback>,
    control: (command: SpotifyCommand) =>
      ipcRenderer.invoke(IPC.spotifyControl, command) as Promise<SpotifyControlResult>,
    play: (uri: string) =>
      ipcRenderer.invoke(IPC.spotifyPlay, uri) as Promise<SpotifyControlResult>,
    raise: () => ipcRenderer.invoke(IPC.spotifyRaise) as Promise<SpotifyControlResult>,
  },
}

contextBridge.exposeInMainWorld('halo', api)
