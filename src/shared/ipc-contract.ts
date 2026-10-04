import type { Agent, AgentMessage, AgentSession, Attachment, PermissionMode } from './agents'
import type { DesktopApp } from './apps'
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
} from './creative'
import type { DiagnosticoDoSistema } from './dependencias'
import type { EnvironmentId } from './environments'
import type { DirectoryListing, Favorite, Mount, StorageInfo } from './files'
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
} from './island'
import type { Container, HostStats, Machine, Monitor } from './lab'
import type { MascotAnimation, MascotChoice, MascotInfo } from './mascot'
import type {
  CatalogPage,
  CatalogQuery,
  CatalogStatus,
  Category,
  ExtraResult,
  Progress,
  TitleDetail,
} from './media'
import type { NewsResult } from './news'
import type { Aviso, EstadoDosAvisos } from './notificacoes'
import type { NowPlaying } from './player'
import type { Project } from './projects'
import type { SeafileAuth, SeafileResolution, SeafileState } from './seafile'
import type { HaloSettings, RecenteDoLancador } from './settings'
import type {
  SpotifyAuth,
  SpotifyCommand,
  SpotifyControlResult,
  SpotifyDetail,
  SpotifyLibrary,
  SpotifyPlayback,
  SpotifyResult,
} from './spotify'
import type { EstadoDoTemaKde } from './tema-kde'
import type { Weather } from './weather'

/**
 * Contrato main <-> renderer.
 *
 * Regra do projeto: TODA integração real (Docker, Uptime Kuma, Jellyfin,
 * Seafile, MPRIS, Claude Code) vive no processo main e chega ao renderer
 * exclusivamente por aqui. O renderer nunca importa Node.
 *
 * Nesta fase (F0/F1) existe só o mínimo: janela e info do app.
 */

export const IPC = {
  windowClose: 'window:close',
  windowDormindo: 'window:dormindo',
  appInfo: 'app:info',
  windowSetScale: 'window:set-scale',
  windowDesktopMode: 'window:desktop-mode',
  windowRelaunch: 'window:relaunch',
  settingsSave: 'settings:save',
  /** As configurações do arranque, pedidas pelo preload (síncrono). */
  settingsInicial: 'settings:inicial',
  wallpaperApply: 'wallpaper:apply',
  wallpaperPreviews: 'wallpaper:previews',
  wallpaperChoose: 'wallpaper:choose',
  wallpaperChooseVideo: 'wallpaper:choose-video',
  wallpaperVideoPlugin: 'wallpaper:video-plugin',
  wallpaperOriginal: 'wallpaper:original',
  wallpaperRestaurar: 'wallpaper:restaurar',
  systemDependencies: 'system:dependencies',
  /** A integração opcional com o CyberKDE — ver `main/services/tema-kde.ts`. */
  temaKdeEstado: 'tema-kde:estado',
  weatherCurrent: 'weather:current',
  newsHeadlines: 'news:headlines',
  labHost: 'lab:host',
  labMachines: 'lab:machines',
  labContainers: 'lab:containers',
  labMonitors: 'lab:monitors',
  filesList: 'files:list',
  filesStorage: 'files:storage',
  filesFavorites: 'files:favorites',
  filesMounts: 'files:mounts',
  playerNowPlaying: 'player:now-playing',
  projectsList: 'projects:list',
  appsList: 'apps:list',
  appsLaunch: 'apps:launch',
  mediaStatus: 'media:status',
  mediaCategories: 'media:categories',
  mediaCatalog: 'media:catalog',
  mediaTitle: 'media:title',
  mediaChoose: 'media:choose',
  mediaExtra: 'media:extra',
  claudeProjectAdd: 'claude:project-add',
  claudeProjectOpen: 'claude:project-open',
  claudeChooseCli: 'claude:choose-cli',
  claudeSetMode: 'claude:set-mode',
  agentsList: 'agents:list',
  agentsCreate: 'agents:create',
  agentsSend: 'agents:send',
  agentsClose: 'agents:close',
  agentsMessages: 'agents:messages',
  agentsChanged: 'agents:changed',
  agentsSessions: 'agents:sessions',
  agentsAttach: 'agents:attach',
  projectsInfo: 'projects:info',
  launcherHide: 'launcher:hide',
  launcherToggle: 'launcher:toggle',
  launcherEnv: 'launcher:env',
  launcherUso: 'launcher:uso',
  launcherRecentes: 'launcher:recentes',
  launcherArrastar: 'launcher:arrastar',
  launcherArrastou: 'launcher:arrastou',
  /** As notificações do sistema no estilo do ambiente — ver `main/notificacoes/`. */
  notificacoesEnv: 'notificacoes:env',
  notificacoesAvisos: 'notificacoes:avisos',
  notificacoesLista: 'notificacoes:lista',
  notificacoesFechar: 'notificacoes:fechar',
  notificacoesEsquecer: 'notificacoes:esquecer',
  notificacoesAgir: 'notificacoes:agir',
  notificacoesRegiao: 'notificacoes:regiao',
  notificacoesDesfoque: 'notificacoes:desfoque',
  notificacoesEstado: 'notificacoes:estado',
  notificacoesExemplo: 'notificacoes:exemplo',
  islandSnapshot: 'island:snapshot',
  islandAction: 'island:action',
  /** O preload avisa os caminhos de um arrasto DE VERDADE (`isTrusted`). */
  arrastoSolto: 'arrasto:solto',
  islandOpen: 'island:open',
  islandDisplays: 'island:displays',
  islandCatalog: 'island:catalog',
  islandPush: 'island:push',
  islandShelf: 'island:shelf',
  /** As notificações do sistema, para a home (o vigia é o da ilha). */
  islandNotices: 'island:notices',
  islandShelfChanged: 'island:shelf-changed',
  /** Chegou ou saiu notificação: a home refaz a leitura. */
  islandNoticesChanged: 'island:notices-changed',

  /* ——— Social Arte ———————————————————————————————————————— */
  creativeConnections: 'creative:connections',
  creativeSearch: 'creative:search',
  creativeTrending: 'creative:trending',
  creativePartial: 'creative:partial',
  creativeSignIn: 'creative:sign-in',
  creativeSignOut: 'creative:sign-out',
  creativeRelease: 'creative:release',
  creativePreview: 'creative:preview',
  creativeThumb: 'creative:thumb',
  creativeLibrary: 'creative:library',
  creativeSave: 'creative:save',
  creativeRemove: 'creative:remove',
  creativeFavorite: 'creative:favorite',
  creativeMove: 'creative:move',
  creativeAnnotate: 'creative:annotate',
  creativeCollectionCreate: 'creative:collection-create',
  creativeCollectionEdit: 'creative:collection-edit',
  creativeCollectionDelete: 'creative:collection-delete',
  islandDragStart: 'island:drag-start',
  islandJanelas: 'island:janelas',
  islandJanelasGuardadas: 'island:janelas-guardadas',
  islandEvento: 'island:evento',
  islandVoo: 'island:voo',
  islandFoco: 'island:foco',
  islandAssentou: 'island:assentou',
  islandAlvo: 'island:alvo',
  islandVidro: 'island:vidro',
  islandVooPronto: 'island:voo-pronto',
  islandAtividades: 'island:atividades',
  islandEspectro: 'island:espectro',
  islandClaude: 'island:claude',
  idiomaMudou: 'idioma:mudou',
  islandAltura: 'island:altura',
  seafileState: 'seafile:state',
  seafileLogin: 'seafile:login',
  seafileLogout: 'seafile:logout',
  seafileLibrary: 'seafile:library',
  seafileUpload: 'seafile:upload',
  seafileClear: 'seafile:clear',
  seafileResolve: 'seafile:resolve',
  seafileChanged: 'seafile:changed',
  mascotInfo: 'mascot:info',
  mascotAnimation: 'mascot:animation',
  mascotChoose: 'mascot:choose',
  mascotList: 'mascot:list',
  mascotPreview: 'mascot:preview',
  mediaPlay: 'media:play',
  playerLoad: 'player:load',
  playerFullscreen: 'player:fullscreen',
  playerMini: 'player:mini',
  playerPin: 'player:pin',
  playerClose: 'player:close',
  playerProgress: 'player:progress',
  playerPinSupported: 'player:pin-supported',
  mediaForget: 'media:forget',
  mediaRecent: 'media:recent',
  spotifyAuth: 'spotify:auth',
  spotifyConnect: 'spotify:connect',
  spotifyDisconnect: 'spotify:disconnect',
  spotifyLibrary: 'spotify:library',
  spotifyDetail: 'spotify:detail',
  spotifyPlayback: 'spotify:playback',
  spotifyControl: 'spotify:control',
  spotifyPlay: 'spotify:play',
  spotifyRaise: 'spotify:raise',
} as const

/** O que a janela do player recebe para tocar. */
export type PlayRequest = {
  url: string
  title: string
  subtitle: string
  /** Capa, para a Media Session — é ela que vira a arte no MPRIS. */
  poster: string
  /** Segundo em que começar — é a continuidade de quem já tinha assistido. */
  startAt: number
}

/**
 * Tamanho que a janela realmente assumiu, já limitado pela tela, e o maior
 * fator que aquela tela comporta.
 */
export type WindowSize = { width: number; height: number; scale: number; max: number }

/**
 * O que aconteceu ao ligar/desligar o modo desktop.
 *
 * `applied: false` não é falha: fora do X11 a camada não existe e o app
 * precisa reabrir para assumi-la — a tela de configurações usa isto para
 * oferecer o "Reabrir agora" em vez de mentir que já está valendo.
 */
export type DesktopModeResult = {
  on: boolean
  applied: boolean
  server: 'x11' | 'wayland'
}

/**
 * O que aconteceu ao trocar o papel de parede da máquina.
 *
 * Nunca lança: "a imagem sumiu" e "não tem KDE aqui" são frases para a tela
 * mostrar, e o app diz o que houve em vez de fingir que trocou.
 */
export type WallpaperResult = { ok: true; path: string } | { ok: false; error: string }

export type AppInfo = {
  version: string
  electron: string
  chrome: string
  platform: NodeJS.Platform
}

export type HaloApi = {
  window: {
    close: () => void
    /**
     * A janela foi escondida ou minimizada (recolhida para a ilha, por
     * exemplo), ou voltou. Escondida, o renderer pausa as animações: um laço
     * infinito num palco de 1440×900 gera um quadro por vsync mesmo sem
     * ninguém ver (DESEMPENHO.md, P3-12).
     */
    onDormindo: (handler: (dormindo: boolean) => void) => () => void
    /**
     * Redimensiona a janela para `scale` vezes o palco (1440x900), limitado à
     * área útil da tela. Devolve o que coube de fato.
     */
    setScale: (scale: number) => Promise<WindowSize>
    /**
     * Põe a janela na camada do desktop (ou tira). Ver
     * `src/main/services/desktop-layer.ts`.
     */
    setDesktopMode: (on: boolean) => Promise<DesktopModeResult>
    /** Reabre o app — é o que troca o servidor gráfico para X11. */
    relaunch: () => void
  }
  appInfo: () => Promise<AppInfo>
  /** O que o app precisa de fora, e o que esta máquina tem. */
  /** O idioma da interface mudou em Configurações: o main avisa TODAS as janelas. */
  idioma: {
    onMudou: (handler: (idioma: string) => void) => () => void
  }
  system: {
    /**
     * Quais dos programas de `shared/dependencias.ts` existem aqui, e que
     * sessão gráfica está de pé.
     *
     * O app chama 26 programas de fora e nenhum vem no pacote. Quase todos
     * degradam bem — a leitura some, a lista fica vazia —, mas sumiam em
     * SILÊNCIO: sem `sensors` a temperatura simplesmente não aparecia, e não
     * havia como distinguir isso de um módulo desligado. Isto é o que a tela
     * de Configurações → Sistema mostra, e é a mesma lista que
     * `npm run doctor` percorre no terminal.
     */
    dependencies: () => Promise<DiagnosticoDoSistema>
  }
  /**
   * A integração OPCIONAL com o CyberKDE, o tema do KDE do usuário. Quem
   * chama o tema é o main, na troca de ambiente; a tela só lê o estado.
   */
  temaKde: {
    estado: () => Promise<EstadoDoTemaKde>
  }
  /**
   * O papel de parede da máquina — a única coisa que um ambiente muda fora do
   * app. Exceção documentada; ver `src/main/services/wallpaper.ts`.
   */
  wallpaper: {
    /** Aplica a imagem daquele ambiente. Qual é ela, quem sabe é o main. */
    apply: (id: EnvironmentId) => Promise<WallpaperResult>
    /**
     * As miniaturas dos papéis de parede, em `data:`, para o painel de
     * Ambientes mostrar cada tema com a imagem dele. O renderer não alcança o
     * disco; quem encolhe e converte é o main. Ambiente sem imagem legível
     * simplesmente não vem na lista.
     */
    previews: () => Promise<Partial<Record<EnvironmentId, string>>>
    /** Abre o seletor para o vídeo de um ambiente. Só devolve o caminho. */
    chooseVideo: () => Promise<string | null>
    /**
     * Se o plugin que toca vídeo como papel de parede está instalado nesta
     * máquina. Ele não vem com o app, e sem ele o vídeo guardado não toca —
     * a tela de Ambiente diz isso antes de o usuário descobrir sozinho.
     */
    videoPlugin: () => Promise<boolean>
    /**
     * Se há um papel de parede ORIGINAL guardado — o que a pessoa tinha antes
     * da primeira troca de ambiente (ver `main/services/papel-original.ts`).
     */
    original: () => Promise<boolean>
    /** Devolve às telas o papel de parede original. */
    restaurar: () => Promise<WallpaperResult>
    /**
     * Abre o seletor para o usuário apontar a imagem de um ambiente.
     *
     * Sem isto a única forma de trocar a imagem era editar
     * `~/.config/halo-spatial-os/settings.json` à mão — o único ponto do app
     * que pedia isso, e o que mais estorva numa máquina nova, onde os
     * caminhos padrão não existem. Devolve o caminho escolhido, ou `null`.
     */
    choose: () => Promise<string | null>
  }
  /** Integração real: a busca acontece no main (ver `src/main/weather.ts`). */
  weather: {
    current: (place: string) => Promise<Weather>
  }
  /**
   * Notícias: manchetes dos feeds RSS/Atom configurados, buscadas pelo main
   * (ver `src/main/services/rss.ts`). Nunca lança — feed fora do ar, página
   * que não é feed e lista vazia são estados dentro de `NewsResult`.
   */
  news: {
    headlines: (feeds: string[]) => Promise<NewsResult>
  }
  /** Home Lab: tudo real, lido desta máquina. */
  lab: {
    host: () => Promise<HostStats>
    machines: () => Promise<Machine[]>
    containers: () => Promise<Container[]>
    monitors: () => Promise<Monitor[]>
  }
  /** Arquivos: leitura real, presa à pasta do usuário. */
  files: {
    list: (path?: string) => Promise<DirectoryListing>
    storage: (path?: string) => Promise<StorageInfo>
    favorites: () => Promise<Favorite[]>
    mounts: () => Promise<Mount[]>
    /**
     * O caminho de um `File` arrastado ou colado. `File.path` deixou de
     * existir no Electron 32; só o preload alcança `webUtils`. Vazio quando o
     * arquivo não veio do disco (um blob, por exemplo).
     */
    pathOf: (file: File) => string
  }
  /** Projetos: repositórios git desta máquina. */
  projects: {
    list: () => Promise<Project[]>
    /** O que o git sabe de uma pasta. `null` quando ela não é repositório. */
    info: (path: string) => Promise<Project | null>
  }
  /** Aplicativos instalados (arquivos .desktop). */
  apps: {
    list: () => Promise<DesktopApp[]>
    launch: (id: string) => Promise<void>
  }
  /**
   * Biblioteca de mídia, lida da lista M3U apontada em Configurações.
   *
   * A URL de reprodução não vem no catálogo: ela fica no main e só é usada
   * quando `play` é chamado.
   */
  media: {
    status: () => Promise<CatalogStatus>
    categories: () => Promise<Category[]>
    catalog: (query: CatalogQuery) => Promise<CatalogPage>
    title: (id: string) => Promise<TitleDetail | null>
    /** Metadados do TMDB para o título. Nunca lança — ver `ExtraResult`. */
    extra: (id: string) => Promise<ExtraResult>
    /** Abre o seletor de arquivo e devolve o caminho escolhido. */
    choose: () => Promise<string | null>
    /** Abre a janela do player no título (e episódio) pedido. */
    play: (id: string, episode?: string | null, startAt?: number) => Promise<void>
    /** Tira um título de "Continuar assistindo". */
    forget: (id: string, episode: string | null) => void
    /** O main avisa quando o histórico muda; devolve o cancelamento. */
    onRecent: (handler: (recent: Progress[]) => void) => () => void
  }
  /** Comandos da janela do player — só ela usa. */
  player: {
    nowPlaying: () => Promise<NowPlaying | null>
    onLoad: (handler: (request: PlayRequest) => void) => () => void
    fullscreen: () => Promise<boolean>
    mini: () => Promise<boolean>
    /** `supported: false` no Wayland, onde fixar não existe. */
    pin: () => Promise<{ on: boolean; supported: boolean }>
    pinSupported: () => Promise<boolean>
    /** Onde a reprodução está, para o main guardar a continuidade. */
    progress: (seconds: number, duration: number) => void
    close: () => void
  }
  /**
   * Agentes do Claude: um processo do CLI por terminal, vivo no main.
   *
   * O estado chega por `onChanged` — o main empurra a lista inteira a cada
   * mudança, que é pequena e evita a tela ficar perguntando.
   */
  agents: {
    list: () => Promise<Agent[]>
    create: (project: string, resume?: string) => Promise<Agent>
    send: (id: string, text: string, attachments?: Attachment[]) => void
    /** Conversas antigas daquele projeto, para retomar. */
    sessions: (project: string) => Promise<AgentSession[]>
    /** Abre o seletor e lê os arquivos escolhidos como anexos. */
    attach: () => Promise<Attachment[]>
    /** Lê um arquivo já conhecido (colado, arrastado) como anexo. */
    attachPaths: (paths: string[]) => Promise<Attachment[]>
    close: (id: string) => void
    messages: (id: string) => Promise<AgentMessage[]>
    onChanged: (handler: (agents: Agent[]) => void) => () => void
    /** Abre o seletor de pasta para fixar um repositório. */
    addProject: () => Promise<string | null>
    /**
     * Abre a pasta de um projeto FIXADO no gerenciador de arquivos do sistema
     * (o Dolphin, no KDE). Devolve `false` quando não abriu: caminho que não é
     * projeto fixado, que não é pasta, ou `gio` ausente.
     */
    openProject: (path: string) => Promise<boolean>
    /**
     * Abre o seletor para o usuário apontar o programa `claude`.
     *
     * O app é aberto pelo menu, sem o PATH que o shell montaria, e o CLI pode
     * estar dentro de um gerenciador de versão do Node. O app procura nos
     * lugares conhecidos; quando não acha, este é o caminho de dizer onde ele
     * está — em vez de um `spawn claude ENOENT` que não ensina nada.
     */
    chooseCli: () => Promise<string | null>
    /**
     * Troca o modo de permissão dos agentes. Quem grava é o main, e SUBIR o
     * modo passa por uma confirmação nativa que a tela não consegue forjar.
     * Devolve o modo que ficou valendo.
     */
    setMode: (mode: PermissionMode) => Promise<PermissionMode>
  }
  /**
   * Ilha dinâmica — código isolado, ver `src/main/island/`.
   *
   * Superfície pequena de propósito: um instantâneo, uma ação por id, e o
   * aviso de quando o ponteiro entra na gota (é o que devolve o clique à
   * janela, que por padrão é atravessável).
   */
  island: {
    snapshot: () => Promise<IslandSnapshot>
    run: (actionId: string, arg?: string) => Promise<void>
    setOpen: (on: boolean) => void
    displays: () => Promise<{ id: string; label: string; primary: boolean }[]>
    catalog: () => Promise<CatalogEntry[]>
    onSnapshot: (handler: (snapshot: IslandSnapshot) => void) => () => void
    /** A gaveta de arquivos: o que está guardado agora. */
    shelf: () => Promise<ShelfItem[]>
    /** As notificações do sistema, para a home. Ver `NoticesResult`. */
    notices: () => Promise<NoticesResult>
    /** Avisa que a lista mudou. Devolve o cancelador. */
    onNoticesChanged: (handler: () => void) => () => void
    onShelf: (handler: (items: ShelfItem[]) => void) => () => void
    /**
     * Começa um arrasto NATIVO de um arquivo da gaveta para fora do app.
     * Quem arrasta é o main (`webContents.startDrag`) — só ele alcança o disco.
     */
    dragStart: (path: string) => void
    /** As janelas do computador, pelo scripting do KWin. Sob demanda. */
    janelas: () => Promise<IslandWindow[]>
    /** As janelas guardadas na gaveta (memória do main, morre com o app). */
    janelasGuardadas: () => Promise<IslandWindow[]>
    onJanelasGuardadas: (handler: (janelas: IslandWindow[]) => void) => () => void
    /** O anúncio curto — a pílula alarga, mostra e recolhe. */
    onEvento: (handler: (evento: IslandEvent) => void) => () => void
    /**
     * Pede (ou devolve) o foco de teclado. A janela da ilha nasce sem foco —
     * uma pílula que rouba o teclado seria um desastre — e só o recebe
     * enquanto um campo dela está em uso.
     */
    setFocus: (on: boolean) => void
    /**
     * A gota assentou numa geometria (fim da transição de altura). É o
     * sinal para o main ENCOLHER a janela — crescer é imediato, encolher só
     * depois que o renderer terminou de animar.
     */
    assentou: (altura: number) => void
    /**
     * Onde a gota (e a bolha) estão dentro da janela. A janela da ilha tem o
     * tamanho ABERTO o tempo todo e nunca redimensiona; o main usa estes
     * retângulos para tornar o resto transparente ao mouse.
     */
    alvo: (retangulos: { x: number; y: number; width: number; height: number }[]) => void
    /**
     * A gota de vidro ASSENTADA, com o raio dos cantos de baixo: o KWin
     * desfoca o que está atrás dela. `null` apaga o pedido (fechada, preta,
     * animando). Nada é gravado — é uma propriedade da janela.
     */
    vidro: (
      area: { x: number; y: number; width: number; height: number; raio: number } | null,
    ) => void
    /** O fantasma do voo já está desenhado sobre a janela: pode minimizá-la. */
    vooPronto: () => void
    /** O voo de uma janela guardada: o fantasma sai do retângulo dela e entra na pílula. */
    onVoo: (handler: (voo: IslandFlight) => void) => () => void
    /** As atividades publicadas na API local (ver `island/api.ts`). */
    atividades: () => Promise<IslandActivity[]>
    onAtividades: (handler: (atividades: IslandActivity[]) => void) => () => void
    /** Os níveis da onda, medidos do áudio que toca (ver `island/espectro.ts`). */
    onEspectro: (handler: (niveis: IslandSpectrum) => void) => () => void
    /** O Claude da ilha: o agente, a conversa e o projeto (ver `island/claude.ts`). */
    claude: () => Promise<IslandClaude>
    onClaude: (handler: (estado: IslandClaude) => void) => () => void
    /**
     * A altura da pílula fechada mudou em Configurações (px). Chega por aqui, e
     * não pela consulta da URL como as outras opções da ilha, porque ela é só
     * CSS: recriar a janela a cada passo do slider faria a pílula sumir e cair
     * do topo de novo a cada pixel. Ver `island.pillHeight`.
     */
    onAltura: (handler: (altura: number) => void) => () => void
  } /**
   * Social Arte: as fontes criativas e a biblioteca pessoal.
   *
   * Tudo passa pelo main — as plataformas exigem credencial e a CSP do
   * renderer não alcança host nenhum, de propósito. Toda operação de
   * biblioteca devolve a biblioteca INTEIRA: ela é pequena o bastante para
   * isso, e devolver o todo tira a chance de a tela e o disco discordarem.
   */
  creative: {
    connections: () => Promise<CreativeConnection[]>
    search: (query: CreativeQuery, pedido?: number) => Promise<CreativeSearchResult>
    /** A home das fontes: o que elas mostram sem ninguém procurar nada. */
    trending: (limite: number, cursor: string, pedido?: number) => Promise<CreativeSearchResult>
    /**
     * Cada fonte, assim que ela responde.
     *
     * A promessa de `search`/`trending` continua devolvendo o conjunto
     * completo — é ela que manda no resultado final. Isto aqui é o que permite
     * a grade ir enchendo em vez de esperar 30s pela mais lenta.
     */
    onPartial: (handler: (parcial: CreativePartial) => void) => () => void
    /**
     * Abre a página de acesso DA PLATAFORMA, numa janela com moldura e com o
     * endereço à vista. O app não desenha campo de senha, não injeta script na
     * página de login e não lê o que é digitado — ver `creative/navegador.ts`.
     */
    signIn: (provider: CreativeProviderId) => Promise<void>
    /** Esquece a sessão desta fonte nesta máquina. */
    signOut: (provider: CreativeProviderId) => Promise<void>
    /** Saiu da tela: fecha os navegadores de fundo (a sessão fica). */
    release: () => void
    /** A prévia de uma URL colada, antes de salvar. */
    preview: (url: string) => Promise<CreativePreview>
    /** A capa como `data:` — a CSP não abre host de imagem arbitrário. */
    thumb: (url: string) => Promise<string>
    library: () => Promise<CreativeLibrary>
    save: (
      item: CreativeItem,
      onde: { collections?: string[]; tags?: string[]; note?: string; favorite?: boolean },
    ) => Promise<CreativeLibrary>
    remove: (id: string) => Promise<CreativeLibrary>
    favorite: (id: string, on: boolean) => Promise<CreativeLibrary>
    move: (id: string, collections: string[]) => Promise<CreativeLibrary>
    annotate: (id: string, note: string, tags: string[]) => Promise<CreativeLibrary>
    collectionCreate: (dados: {
      name: string
      description: string
      color: string
      icon: string
    }) => Promise<CreativeLibrary>
    collectionEdit: (id: string, dados: Partial<CreativeCollection>) => Promise<CreativeLibrary>
    collectionDelete: (id: string) => Promise<CreativeLibrary>
  }
  /**
   * O lançador em janela própria (Meta+V). A janela é do main; o renderer só
   * pede para esconder (Esc, perder o foco, executar) e recebe o ambiente
   * quando ele muda, para o vidro seguir o tema sem recarregar.
   */
  launcher: {
    hide: () => void
    /** Abre ou fecha — o mesmo que o atalho global faz. É o que o guarda usa. */
    toggle: () => void
    onEnv: (handler: (env: string) => void) => () => void
    /** Uma execução, de qualquer carcaça: o main guarda para os recentes. */
    uso: (uso: Omit<RecenteDoLancador, 'n' | 'at'>) => void
    recentes: () => Promise<RecenteDoLancador[]>
    /**
     * Arrasto da janela: deslocamento em px desde o último evento; `arrastou`
     * fecha o gesto e grava a posição. Os nomes evitam "move"/"moved" de
     * propósito: o `test:live` varre a API inteira atrás de nomes de escrita
     * em disco, e mover uma janela não é isso — mas o nome diria que é.
     */
    arrastar: (dx: number, dy: number) => void
    arrastou: () => void
  }

  /**
   * As notificações do sistema, desenhadas pelo Halo no estilo do ambiente.
   *
   * O servidor é o do Plasma; quem fala com ele é o main. A janela dos avisos
   * recebe a lista viva e devolve os gestos: a ação clicada (`agir`, que vira
   * `InvokeAction` no Plasma), o X (`fechar`, que tira do histórico como o X do
   * balão do Plasma) e o balão que venceu o tempo (`esquecer`, que só some da
   * tela — no histórico do Plasma ele continua). Nenhum destes escreve em
   * disco: são conversa por D-Bus.
   */
  notificacoes: {
    lista: () => Promise<Aviso[]>
    onAvisos: (handler: (avisos: Aviso[]) => void) => () => void
    onEnv: (handler: (env: string) => void) => () => void
    agir: (id: number, chave: string) => void
    fechar: (id: number) => void
    esquecer: (id: number) => void
    /** Onde os balões estão, relativo à janela: fora disso o mouse atravessa. */
    regiao: (retangulos: { x: number; y: number; width: number; height: number }[]) => void
    /**
     * Os balões de vidro já assentados, com o raio do canto: o KWin desfoca o
     * que está atrás deles. Nada é gravado — é uma propriedade da janela.
     */
    desfoque: (
      areas: { x: number; y: number; width: number; height: number; raio: number }[],
    ) => void
    estado: () => Promise<EstadoDosAvisos>
    /** Manda uma notificação de verdade, pelo Plasma, para ver o balão do tema. */
    exemplo: () => Promise<void>
  }

  /**
   * Seafile — o servidor de arquivos do usuário, em outra máquina.
   *
   * A senha atravessa uma vez, no `login`, e não é guardada: o que fica é o
   * token, escrito pelo main. O renderer nunca vê o token.
   */
  seafile: {
    state: () => Promise<SeafileState>
    login: (user: string, password: string) => Promise<SeafileAuth>
    logout: () => void
    setLibrary: (id: string) => void
    /** Envia arquivos pelos caminhos. Quem lê o disco é o main. */
    upload: (paths: string[]) => Promise<void>
    /** Decide um envio parado porque o nome já existia na biblioteca. */
    resolve: (id: string, choice: SeafileResolution) => void
    clearDone: () => void
    onChanged: (handler: (state: SeafileState) => void) => () => void
  }
  /**
   * O mascote da tela do Claude: um personagem `.acs` do Microsoft Agent.
   *
   * Os pixels não vêm com a informação do personagem: a tela pede os quadros
   * de uma animação quando vai tocá-la. Mandar as centenas de imagens de uma
   * vez seriam megabytes atravessando o IPC por nada.
   */
  mascot: {
    info: () => Promise<MascotInfo>
    animation: (name: string) => Promise<MascotAnimation>
    /** Os personagens da biblioteca, para a tela de escolha. */
    list: () => Promise<MascotChoice[]>
    /** Uma imagem do personagem, para mostrar quem é cada um. */
    preview: (file: string) => Promise<string>
    /** Abre o seletor e copia o `.acs` escolhido para a biblioteca. */
    choose: () => Promise<string | null>
  }
  settings: {
    /**
     * Configurações lidas do disco pelo main e entregues junto com a janela —
     * disponíveis de forma síncrona, para o app já montar no estado salvo em
     * vez de piscar no padrão.
     */
    initial: HaloSettings
    save: (settings: HaloSettings) => void
  }
  /**
   * Spotify: biblioteca pela Web API, transporte pelo MPRIS.
   *
   * Tudo no main — a CSP do renderer não alcança nem `api.spotify.com` nem o
   * D-Bus, de propósito. Nenhum método lança: os estados de "falta o Client
   * ID", "falta conectar" e "deu erro" vêm dentro de `SpotifyResult`, porque
   * cada um é uma tela diferente.
   */
  spotify: {
    auth: () => Promise<SpotifyAuth>
    /** Abre o consentimento no navegador do sistema e espera o retorno. */
    connect: () => Promise<SpotifyAuth>
    disconnect: () => Promise<SpotifyAuth>
    library: () => Promise<SpotifyResult<SpotifyLibrary>>
    detail: (uri: string) => Promise<SpotifyResult<SpotifyDetail>>
    playback: () => Promise<SpotifyPlayback>
    control: (command: SpotifyCommand) => Promise<SpotifyControlResult>
    /** Manda tocar uma playlist, álbum, artista ou faixa. */
    play: (uri: string) => Promise<SpotifyControlResult>
    /** Traz a janela do aplicativo do Spotify para a frente. */
    raise: () => Promise<SpotifyControlResult>
  }
}
