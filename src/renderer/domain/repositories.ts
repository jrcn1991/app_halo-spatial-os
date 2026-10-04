import type { Agent, AgentMessage, AgentSession, Attachment, PermissionMode } from '@shared/agents'
import type {
  CreativeCollection,
  CreativeConnection,
  CreativeItem,
  CreativeLibrary,
  CreativePartial,
  CreativePreview,
  CreativeProviderId,
  CreativeQuery,
  CreativeSearchResult,
} from '@shared/creative'
import type { DiagnosticoDoSistema } from '@shared/dependencias'
import type { EnvironmentId } from '@shared/environments'
import type { AppInfo, DesktopModeResult, WallpaperResult, WindowSize } from '@shared/ipc-contract'
import type { CatalogEntry } from '@shared/island'
import type { MascotAnimation, MascotChoice, MascotInfo } from '@shared/mascot'
import type {
  CatalogPage,
  CatalogQuery,
  CatalogStatus,
  Category,
  ExtraResult,
  TitleDetail,
} from '@shared/media'
import type { NewsResult } from '@shared/news'
import type { EstadoDosAvisos } from '@shared/notificacoes'
import type { SeafileAuth, SeafileState } from '@shared/seafile'
import type {
  SpotifyAuth,
  SpotifyCommand,
  SpotifyControlResult,
  SpotifyDetail,
  SpotifyLibrary,
  SpotifyPlayback,
  SpotifyResult,
} from '@shared/spotify'
import type { EstadoDoTemaKde } from '@shared/tema-kde'
import type {
  Container,
  DesktopApp,
  DirectoryListing,
  Favorite,
  HostStats,
  Machine,
  Monitor,
  Mount,
  Notifications,
  NowPlaying,
  Project,
  StorageInfo,
  Weather,
} from './types'

/**
 * Contratos de dados.
 *
 * Todos assíncronos de propósito, mesmo os que hoje respondem na hora: quando
 * o serviço real entrar, nenhum componente muda. Um contrato síncrono agora
 * seria uma reescrita depois.
 */

export type WeatherRepository = {
  current(place: string): Promise<Weather>
}

export type LabRepository = {
  host(): Promise<HostStats>
  machines(): Promise<Machine[]>
  containers(): Promise<Container[]>
  monitors(): Promise<Monitor[]>
}

export type FilesRepository = {
  list(path?: string): Promise<DirectoryListing>
  storage(path?: string): Promise<StorageInfo>
  favorites(): Promise<Favorite[]>
  mounts(): Promise<Mount[]>
  /**
   * O caminho em disco de um arquivo arrastado ou colado. Vazio quando ele
   * não veio do disco (um blob) — e sempre vazio fora do Electron.
   */
  pathOf(file: File): Promise<string>
}

export type PlayerRepository = {
  nowPlaying(): Promise<NowPlaying | null>
}

export type ProjectsRepository = {
  list(): Promise<Project[]>
  info(path: string): Promise<Project | null>
}

export type AppsRepository = {
  list(): Promise<DesktopApp[]>
  launch(id: string): Promise<void>
}

/**
 * Social Arte: as fontes criativas e a biblioteca pessoal.
 *
 * O contrato inteiro é assíncrono, como todos — e aqui não é formalidade: toda
 * operação atravessa o IPC e boa parte alcança a rede.
 *
 * Toda operação de biblioteca devolve a biblioteca INTEIRA. Isso é decisão: ela
 * é pequena o bastante para caber numa resposta, e devolver o todo tira a
 * chance de a tela remontar um estado que o disco não tem.
 */
export type CreativeRepository = {
  connections(): Promise<CreativeConnection[]>
  search(query: CreativeQuery, pedido?: number): Promise<CreativeSearchResult>
  /** A home das fontes: o que elas mostram sem ninguém procurar nada. */
  trending(limite: number, cursor: string, pedido?: number): Promise<CreativeSearchResult>
  /** Cada fonte, assim que ela responde. Devolve o cancelador. */
  onPartial(handler: (parcial: CreativePartial) => void): () => void
  /** Abre a página de acesso DA PLATAFORMA. Quem pede a senha é o site. */
  signIn(provider: CreativeProviderId): Promise<void>
  /** Esquece a sessão desta fonte nesta máquina. */
  signOut(provider: CreativeProviderId): Promise<void>
  /** Saiu da tela Social Arte: os navegadores de fundo podem fechar. */
  release(): void
  preview(url: string): Promise<CreativePreview>
  /** A capa como `data:`. Vazio quando não deu — a tela desenha o lugar. */
  thumb(url: string): Promise<string>
  library(): Promise<CreativeLibrary>
  save(
    item: CreativeItem,
    onde: { collections?: string[]; tags?: string[]; note?: string; favorite?: boolean },
  ): Promise<CreativeLibrary>
  remove(id: string): Promise<CreativeLibrary>
  favorite(id: string, on: boolean): Promise<CreativeLibrary>
  move(id: string, collections: string[]): Promise<CreativeLibrary>
  annotate(id: string, note: string, tags: string[]): Promise<CreativeLibrary>
  collectionCreate(dados: {
    name: string
    description: string
    color: string
    icon: string
  }): Promise<CreativeLibrary>
  collectionEdit(id: string, dados: Partial<CreativeCollection>): Promise<CreativeLibrary>
  collectionDelete(id: string): Promise<CreativeLibrary>
}

/** As notificações do sistema, pelo vigia do D-Bus da ilha. */
export type HomeFeedRepository = {
  notifications(): Promise<Notifications>
  /** Avisa que a lista mudou. Devolve o cancelador. */
  onChanged(handler: () => void): () => void
}

/**
 * Notícias: manchetes dos feeds RSS/Atom que o usuário configurou.
 *
 * Recebe a lista como o clima recebe o lugar — a tela sabe o que está
 * configurado e o main busca. Nunca lança: cada feed tem seu estado dentro
 * de `NewsResult`, porque um feed fora do ar não pode esvaziar a coluna.
 */
export type NewsRepository = {
  headlines(feeds: string[]): Promise<NewsResult>
}

/**
 * Biblioteca de mídia lida de uma lista M3U.
 *
 * Paginado porque o catálogo real tem dezenas de milhares de títulos: mandar
 * tudo de uma vez pelo IPC travaria a tela.
 */
export type CatalogRepository = {
  status(): Promise<CatalogStatus>
  categories(): Promise<Category[]>
  page(query: CatalogQuery): Promise<CatalogPage>
  title(id: string): Promise<TitleDetail | null>
  /** Metadados de uma base externa (TMDB). Nunca lança — ver `ExtraResult`. */
  extra(id: string): Promise<ExtraResult>
  /** Abre a janela do player, retomando em `startAt`. Sem efeito fora do Electron. */
  play(id: string, episode?: string | null, startAt?: number): Promise<void>
  /** Tira um título de "Continuar assistindo". */
  forget(id: string, episode: string | null): void
  /** Abre o seletor da lista M3U. `null` quando nada foi escolhido. */
  choose(): Promise<string | null>
}

/**
 * Agentes do Claude.
 *
 * Diferente dos outros: além de buscar, ele empurra. `onChanged` devolve a
 * função que cancela a escuta.
 */
export type AgentsRepository = {
  list(): Promise<Agent[]>
  create(project: string, resume?: string): Promise<Agent>
  send(id: string, text: string, attachments?: Attachment[]): void
  sessions(project: string): Promise<AgentSession[]>
  attach(): Promise<Attachment[]>
  attachPaths(paths: string[]): Promise<Attachment[]>
  close(id: string): void
  messages(id: string): Promise<AgentMessage[]>
  onChanged(handler: (agents: Agent[]) => void): () => void
  /** Abre o seletor de pasta para fixar um projeto. `null` = cancelou. */
  addProject(): Promise<string | null>
  /** Abre a pasta de um projeto fixado no gerenciador de arquivos. */
  openProject(path: string): Promise<boolean>
  /** Abre o seletor para apontar o programa `claude`. `null` = cancelou. */
  chooseCli(): Promise<string | null>
  /** Troca o modo de permissão; subir pede confirmação. Devolve o que valeu. */
  setMode(mode: PermissionMode): Promise<PermissionMode>
}

/**
 * Spotify: biblioteca pela Web API, transporte pelo MPRIS.
 *
 * Nenhum método lança. "Falta o Client ID", "falta conectar" e "deu erro" são
 * estados dentro de `SpotifyResult`, porque cada um mostra uma coisa diferente
 * na tela — e nenhum deles pode virar dado inventado.
 */
export type SpotifyRepository = {
  auth(): Promise<SpotifyAuth>
  connect(): Promise<SpotifyAuth>
  disconnect(): Promise<SpotifyAuth>
  library(): Promise<SpotifyResult<SpotifyLibrary>>
  detail(uri: string): Promise<SpotifyResult<SpotifyDetail>>
  playback(): Promise<SpotifyPlayback>
  control(command: SpotifyCommand): Promise<SpotifyControlResult>
  play(uri: string): Promise<SpotifyControlResult>
  raise(): Promise<SpotifyControlResult>
}

/**
 * O próprio app: versão e o que ele precisa da máquina.
 *
 * `null` é "não há como saber aqui" (fora do Electron) — a tela mostra o
 * estado de espera, nunca um número inventado.
 */
export type SystemRepository = {
  appInfo(): Promise<AppInfo | null>
  dependencies(): Promise<DiagnosticoDoSistema | null>
}

/**
 * A janela do app. Não é dado, é comando — mas passa pelo mesmo caminho para
 * que nenhuma tela alcance o `window.halo`, e para que fora do Electron o
 * pedido caia num mock que não faz nada. `null` = não houve janela a mexer.
 */
export type WindowRepository = {
  setScale(scale: number): Promise<WindowSize | null>
  setDesktopMode(on: boolean): Promise<DesktopModeResult | null>
  relaunch(): Promise<void>
}

/**
 * O papel de parede da sessão — a exceção autorizada de escrita fora do app
 * (ver `main/services/wallpaper.ts`). A aplicação em si (`apply`) mora em
 * `app/environment.ts`, que é quem troca de ambiente.
 *
 * `null` nas perguntas de sim/não é "não se sabe" (fora do Electron).
 */
export type WallpaperRepository = {
  previews(): Promise<Partial<Record<EnvironmentId, string>>>
  choose(): Promise<string | null>
  chooseVideo(): Promise<string | null>
  videoPlugin(): Promise<boolean | null>
  original(): Promise<boolean | null>
  /** `null` quando não havia a quem pedir. */
  restaurar(): Promise<WallpaperResult | null>
}

/**
 * Seafile: a conta e a biblioteca que recebem o que vai para a ilha.
 *
 * A senha atravessa uma vez, no `login`; o token fica no main. `state` é
 * `null` fora do Electron — não há servidor a consultar.
 */
export type SeafileRepository = {
  state(): Promise<SeafileState | null>
  onChanged(handler: (state: SeafileState) => void): () => void
  login(user: string, password: string): Promise<SeafileAuth | null>
  logout(): Promise<void>
  setLibrary(id: string): Promise<void>
}

/**
 * O mascote da tela do Claude (um `.acs` do Microsoft Agent).
 *
 * Os quadros vêm por animação, sob pedido: mandar todas as imagens de uma vez
 * seriam megabytes pelo IPC por nada.
 */
export type MascotRepository = {
  info(): Promise<MascotInfo>
  animation(name: string): Promise<MascotAnimation>
  list(): Promise<MascotChoice[]>
  /** Um quadro do personagem, em `data:`. Vazio quando não deu. */
  preview(file: string): Promise<string>
  choose(): Promise<string | null>
}

/** O que Configurações → Ilha precisa saber da ilha. */
export type IslandSettingsRepository = {
  displays(): Promise<{ id: string; label: string; primary: boolean }[]>
  catalog(): Promise<CatalogEntry[]>
}

/**
 * Os balões de notificação vestidos pelo tema. `estado` é `null` fora do
 * Electron: não há servidor de notificações a quem perguntar.
 */
export type NotificacoesRepository = {
  estado(): Promise<EstadoDosAvisos | null>
  /** Manda uma notificação de exemplo. Lança se o servidor não respondeu. */
  exemplo(): Promise<void>
}

/**
 * A integração opcional com o CyberKDE. `null` fora do Electron: não há tema
 * do KDE a quem perguntar.
 */
export type TemaKdeRepository = {
  estado(): Promise<EstadoDoTemaKde | null>
}

export type Repositories = {
  weather: WeatherRepository
  lab: LabRepository
  files: FilesRepository
  player: PlayerRepository
  projects: ProjectsRepository
  apps: AppsRepository
  homeFeed: HomeFeedRepository
  news: NewsRepository
  creative: CreativeRepository
  catalog: CatalogRepository
  agents: AgentsRepository
  spotify: SpotifyRepository
  system: SystemRepository
  window: WindowRepository
  wallpaper: WallpaperRepository
  seafile: SeafileRepository
  mascot: MascotRepository
  islandSettings: IslandSettingsRepository
  notificacoes: NotificacoesRepository
  temaKde: TemaKdeRepository
}
