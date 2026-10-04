import { PERMISSION_MODES, type PermissionMode } from './agents'
import { hueToRgb, type Rgb } from './color'
import {
  DEFAULT_ENVIRONMENT,
  ENVIRONMENT_IDS,
  type EnvironmentId,
  isEnvironmentId,
} from './environments'
import { ehIdioma, IDIOMA_PADRAO, type Idioma } from './i18n'
import {
  ALTURA_PILULA_MAX,
  ALTURA_PILULA_MIN,
  ALTURA_PILULA_PADRAO,
  ISLAND_FLIGHTS,
  ISLAND_MOTIONS,
  ISLAND_OPENINGS,
  ISLAND_PLACEMENTS,
  type IslandSettings,
  limitarAltura,
} from './island'
import { MASCOT_LIVELINESS, type MascotLiveliness } from './mascot'
import type { Progress } from './media'
import { feedUrlValida, MAX_FEEDS } from './news'
import { CANTOS_DOS_AVISOS, type CantoDosAvisos, type NotificacoesSettings } from './notificacoes'
import { normalizarServidor } from './seafile'
import { redirectValido } from './spotify'
import { ehCorHex, type TemaKdeSettings } from './tema-kde'

/**
 * Configurações persistidas.
 *
 * O tipo e a validação vivem aqui, em `shared/`, porque os dois processos
 * precisam deles: o renderer para editar, o main para ler no arranque — ele
 * aplica o tamanho da janela ANTES de mostrá-la, e é isso que evita a janela
 * abrir no padrão e pular para o tamanho salvo.
 */

export type DockPosition = 'top' | 'bottom' | 'left' | 'right'
/**
 * Onde a navegação mora: `floating` é o dock do handoff, flutuando sobre a
 * tela; `embedded` é a mesma navegação como coluna dentro do painel central.
 */
export type NavigationMode = 'floating' | 'embedded'
/**
 * Como o miolo do painel central troca de tela, na navegação embutida (a
 * moldura fica parada, só o conteúdo entra). `surgir` é o fade curto original.
 */
export type ContentEntrance =
  | 'surgir'
  | 'elastico'
  | 'recarregar'
  | 'materializar'
  | 'deslize'
  | 'dobra'
  | 'implodir'
  | 'datamosh'
  | 'nenhuma'
export type GlassTint = { on: boolean; rgb: Rgb }

export type Appearance = {
  tint: GlassTint
  /** Lado do dock flutuante. Ignorado quando `navigation` é `embedded`. */
  dock: DockPosition
  navigation: NavigationMode
  /** Tamanho da janela, em múltiplos do palco de 1440x900. */
  scale: number
}

/**
 * Ambiente: o tema da interface e o papel de parede que vai com ele.
 *
 * Chave de PRIMEIRO NÍVEL, e não um campo de `appearance`, por dois motivos:
 *
 * 1. "Restaurar padrões" da Aparência (`resetAppearance`) devolve o vidro ao
 *    handoff. Se o ambiente morasse ali, esse botão trocaria o tema sem
 *    trocar o papel de parede da máquina — app e área de trabalho ficariam
 *    contando histórias diferentes, sem ninguém ter pedido.
 * 2. O ambiente é o único ajuste que escreve FORA do app. Misturá-lo com
 *    transparência e claridade esconderia isso.
 */
/**
 * O que o usuário ajustou EM UM ambiente.
 *
 * Estes quatro são os campos que um tema pode sugerir por preset, e por isso
 * são os que precisam de memória própria: trocar de ambiente tem de trazer de
 * volta o que a pessoa deixou naquele ambiente, e não carregar o ajuste do
 * anterior por cima do tema novo. O defeito era esse — mexer
 * na transparência da Floresta e reencontrá-la no BioShock.
 *
 * Campo AUSENTE significa "não escolhi": vale o preset do ambiente
 * (`PRESETS_DO_AMBIENTE`, em `src/renderer/app/environment.ts`), e na falta
 * dele o valor do handoff. É o botão "Restaurar padrão" de cada seção que
 * devolve a ausência.
 *
 * O que NÃO entra aqui: `tint`, `dock`, `navigation` e `scale`. Os três últimos
 * são estruturais — onde a navegação mora, que tamanho a janela tem —, e a cor
 * do vidro já é decidida por ambiente em `appearanceVars` (só a Floresta a
 * aceita). Campo novo entra aqui quando um tema quiser sugeri-lo.
 */
export type AjustesDoAmbiente = {
  /** Nome da variação de entrada (validado contra a lista no renderer). */
  entrance?: string
  /** Só vale com `navigation: 'embedded'`. */
  contentEntrance?: ContentEntrance
  /** Opacidade do vidro, 0–100. */
  transparency?: number
  /** Claridade do vidro, 0–100. */
  clarity?: number
  /** Gráfico do histórico nos medidores da home. */
  graphs?: StatGraphs
  /**
   * A altura da pílula da ilha NESTE ambiente, em px (24–48). AUSENTE = a
   * escolhida em Configurações → Ilha. Na Floresta, uma pílula um pouco mais baixa, para não passar
   * muito da barra do painel.
   */
  islandHeight?: number
}

/**
 * Como os medidores da home (CPU, memória, GPU, temperatura) mostram o
 * histórico: nenhum gráfico, uma onda ou barras. É ajuste POR AMBIENTE, como o
 * vidro: a referência do City Pop tem as ondas, e a Floresta é o handoff, que
 * não tem gráfico nenhum.
 */
export type StatGraphs = 'none' | 'wave' | 'bars'
export const STAT_GRAPHS: readonly StatGraphs[] = ['none', 'wave', 'bars']

export type EnvironmentSettings = {
  /** Ambiente ativo. Só ids com tema pronto (ver `shared/environments.ts`). */
  id: EnvironmentId
  /** Trocar o papel de parede do sistema ao mudar de ambiente. */
  wallpaper: boolean
  /**
   * Imagem escolhida para cada ambiente, caminho absoluto.
   *
   * Vazio = o padrão do ambiente, resolvido contra a pasta do usuário pelo
   * main. É por aqui que se troca a imagem sem mexer no código.
   */
  wallpapers: Record<EnvironmentId, string>
  /**
   * Vídeo de fundo de cada ambiente, caminho absoluto.
   * AUSENTE = sem vídeo, fica a imagem.
   *
   * Não substitui `wallpapers`: a imagem continua sendo a capa do ambiente —
   * a miniatura da Home e o que fica se o vídeo não puder tocar. Quem toca é
   * um plugin do Plasma que não vem com o app (ver `services/wallpaper.ts`).
   */
  videos: Partial<Record<EnvironmentId, string>>
  /**
   * O que o usuário ajustou em CADA ambiente. Ambiente sem entrada aqui está
   * inteiro no preset dele.
   */
  ajustes: Partial<Record<EnvironmentId, AjustesDoAmbiente>>
}

export type TemperatureUnit = 'c' | 'f'
/**
 * O conjunto de ícones do clima. `phosphor` é o do handoff; `animated` é o
 * conjunto CSS animado; os três seguintes são imagens vindas de skins do
 * Rainmeter (créditos e licenças em
 * `THIRD-PARTY.md`).
 */
export type WeatherIcon = 'phosphor' | 'animated' | 'astro' | 'weathercast'
export const WEATHER_ICONS: readonly WeatherIcon[] = [
  'phosphor',
  'animated',
  'astro',
  'weathercast',
]

/** O que os widgets da home precisam saber. */
export type Widgets = {
  clock: { hour12: boolean; seconds: boolean }
  weather: { place: string; unit: TemperatureUnit; icon: WeatherIcon }
}

/**
 * Telas escondidas do dock.
 *
 * `home` e `settings` nunca entram aqui: sem a engrenagem não haveria como
 * voltar e reativar as outras, e a home é o ponto de partida do app.
 */
export type HiddenScreens = string[]

/**
 * Modo desktop: a janela mora na camada do papel de parede.
 *
 * Ligado, o app fica sobre o desktop e nunca cobre outra janela — clicar nele
 * continua funcionando, ele só não sobe. E ele reabre na tela e no lugar onde
 * estava. Ver `src/main/services/desktop-layer.ts` para o mecanismo e por que
 * ele exige X11.
 */
export type DesktopMode = {
  on: boolean
  /**
   * Último canto superior esquerdo conhecido, em coordenadas da área de
   * trabalho inteira — com dois monitores é isto que distingue as telas.
   *
   * Quem escreve é só o processo main (ver `savePosition`): o renderer recebeu
   * as configurações no arranque e não acompanha os arrastos da janela.
   */
  position: { x: number; y: number } | null
  /**
   * O app nasce recolhido na ilha: sobe só a ilha, e a janela espera ser
   * chamada (Meta+Espaço, o botão da pílula, o ícone da bandeja).
   *
   * É o que o Halo é levado a sério — um widget que fica à disposição, não uma
   * janela que se impõe ao ligar a máquina. A janela é criada e carregada do
   * mesmo jeito; ela só não é MOSTRADA, e por isso voltar é instantâneo.
   *
   * **Só vale quando existe caminho de volta** (ilha ligada ou bandeja de pé).
   * Sem nenhum dos dois o app abre à vista, custe o que custar: é a mesma regra
   * que mantém Home e Configurações no dock — uma opção não pode trancar o
   * usuário para fora. Quem decide é `nasceRecolhido`, no main.
   */
  startHidden: boolean
}

/** As telas que o usuário pode esconder — as duas fixas ficam de fora. */
export const HIDEABLE_SCREENS = ['social', 'claude', 'files', 'lab', 'media', 'music'] as const

/**
 * Mídia — de onde vem a biblioteca.
 *
 * O app não embute nem baixa lista nenhuma: o usuário aponta um arquivo M3U do
 * disco dele em Configurações. Vazio quer dizer "ainda não escolhida", e a
 * tela diz isso em vez de fingir uma biblioteca vazia.
 */
/** Uma lista com nome, dentro dos favoritos. */
export type MediaGroup = {
  /** Gerado na criação; sobrevive a renomear. */
  id: string
  name: string
  /** Títulos da lista, na ordem escolhida. */
  titles: string[]
}

export type Media = {
  playlist: string
  /**
   * Títulos favoritados, por id estável do catálogo, na ordem escolhida.
   *
   * A ordem é do usuário — ele arrasta as capas — e por isso não é ordenada
   * em lugar nenhum.
   */
  favorites: string[]
  /**
   * Listas com nome dentro dos favoritos: "Assistidos", "Talvez assistir".
   *
   * Uma lista é um subconjunto dos favoritos: pôr um título numa lista o
   * favorita, e desfavoritar o tira de todas. É o que mantém um modelo só —
   * um título numa lista que não aparece em Favoritos seria armadilha.
   */
  groups: MediaGroup[]
  /**
   * Onde parou em cada título, do mais recente para o mais antigo.
   *
   * Quem escreve é o main, conforme o player avança — o renderer só lê. Ver a
   * mesma proteção de `desktop.position` em `src/main/settings.ts`.
   */
  recent: Progress[]
  /**
   * Chave da API do TMDB, para sinopse, nota, gêneros, duração e elenco.
   *
   * É do usuário, e gratuita. O app não embute uma: ela iria parar no
   * repositório. Vazia significa "sem metadados", e a tela mostra só o que a
   * lista traz — nunca inventa.
   *
   * No renderer este campo NÃO é a chave: é `TMDB_GUARDADA` quando há uma, e
   * vazio quando não há (ver `paraRenderer`, em `src/main/window.ts`). A chave
   * só volta por aqui quando o usuário digita uma nova.
   */
  tmdbKey: string
}

/**
 * O que o renderer recebe no lugar da chave do TMDB, quando há uma.
 *
 * As configurações chegam à janela por argumento de linha de comando, legível
 * em `/proc/<pid>/cmdline` por qualquer processo da máquina — a chave não pode
 * ir junto. A tela só precisa saber que ELA EXISTE (para dizer "configurada"),
 * e quem a usa é o main. Na volta, `saveSettings` troca esta marca pela chave
 * guardada. O texto não tem forma de chave (32 hexadecimais ou um token v4),
 * então não há chave de verdade que se confunda com ela.
 */
export const TMDB_GUARDADA = 'halo: chave guardada no main'

/**
 * Um grupo de projetos na lista da esquerda da tela do Claude ("Jogos").
 *
 * Para listas longas de projetos: agrupar e recolher por categoria. Um projeto mora em NO MÁXIMO um grupo — é pasta, não
 * etiqueta: a lista mostra cada projeto uma vez só.
 */
export type ClaudeGroup = {
  /** Gerado na criação; sobrevive a renomear. */
  id: string
  name: string
  /** Projetos do grupo, na ordem em que ele os arrastou. Todos estão em `projects`. */
  projects: string[]
  /** Guardado: quem recolhe "Jogos" hoje quer encontrá-lo recolhido amanhã. */
  collapsed: boolean
}

/**
 * Tela do Claude: os projetos fixados e o quanto os agentes podem fazer.
 *
 * O modo de permissão é decisão do usuário e nasce no mais contido. Um agente
 * solto dentro de um repositório dele pode editar arquivos e rodar comandos —
 * isso tem de ser escolha explícita, não padrão.
 */
export type ClaudeSettings = {
  /**
   * Repositórios fixados na tela, na ordem em que ele os pôs.
   *
   * Continua sendo a lista de TODOS, com ou sem grupo: é ela que a ilha lê
   * (projeto padrão e caminhos permitidos), e ela não precisa saber de grupo.
   */
  projects: string[]
  /** Grupos da lista; o projeto que não está em nenhum aparece em "Sem grupo". */
  groups: ClaudeGroup[]
  mode: PermissionMode
  /**
   * Caminho do programa `claude`, quando o usuário precisa apontá-lo.
   *
   * Vazio quer dizer "procure sozinho": o app olha nos lugares conhecidos
   * (`~/.local/bin`, `/usr/local/bin`, `/usr/bin`, bun, volta, nvm, fnm,
   * asdf) e por fim no PATH. Isso cobre a maioria das instalações, mas não
   * todas — e o app é aberto pelo menu, sem o PATH que o shell montaria.
   * Sem este campo, quem instalou o CLI num lugar incomum não teria como
   * dizer onde ele está, a não ser editando o JSON à mão.
   */
  cli: string
}

/**
 * Música — a conta do Spotify.
 *
 * Duas coisas, e nenhuma delas pode estar no repositório:
 *
 * - `spotifyClientId` é o identificador do app que o **usuário** cria no
 *   painel de desenvolvedor dele. O Halo não embute nenhum: num repositório
 *   aberto ele seria entregue a quem clonasse, e apps em modo de
 *   desenvolvimento aceitam no máximo 25 usuários cadastrados à mão.
 * - `spotifyRefreshToken` é o resultado do consentimento OAuth. Quem escreve é
 *   o **main** (ver `saveSpotifyToken` em `src/main/settings.ts`): o renderer
 *   recebeu as configurações no arranque e não acompanha o fluxo de login.
 *   Por isso `saveSettings` preserva este campo, como faz com
 *   `desktop.position` e `media.recent`.
 */
export type Music = {
  spotifyClientId: string
  /**
   * Endereço de retorno do consentimento, se o usuário registrou outro.
   *
   * Vazio usa `SPOTIFY_REDIRECT_PADRAO`. É configurável porque tem de bater
   * letra por letra com o que está em *Redirect URIs* no painel do Spotify —
   * e quem já registrou um endereço não deveria ter de mexer lá por nossa
   * causa.
   */
  spotifyRedirect: string
  spotifyRefreshToken: string
}

/**
 * Seafile — o servidor de arquivos do usuário, em outra máquina.
 *
 * `token` é escrito pelo **main** (ver `saveSeafileToken`): ele nasce de um
 * login que acontece no processo main, e o renderer nunca o vê. A senha não é
 * guardada em lugar nenhum — ela é trocada pelo token e descartada.
 */
export type SeafileSettings = {
  /** Endereço do servidor, ex.: `http://nas.local:8000`. */
  server: string
  /** Token da Web API. Vazio = falta entrar. */
  token: string
  /** Id da biblioteca que recebe os arquivos arrastados. */
  library: string
}

/**
 * O mascote da tela do Claude.
 *
 * Um `.acs` do Microsoft Agent apontado pelo usuário. Vazio = o orbe do
 * handoff continua no lugar, que é o padrão.
 */
export type MascotSettings = {
  file: string
  /** Ligar troca o orbe pelo personagem. */
  on: boolean
  /** Com que frequência ele faz bobagem sozinho quando não há trabalho. */
  liveliness: MascotLiveliness
}

/**
 * Notícias — os feeds RSS/Atom que a coluna de leitura da home mostra.
 *
 * A lista é do usuário, na ordem em que ele a montou: nada aqui reordena.
 * Vazia quer dizer "ele tirou todos", e a home diz isso e aponta para cá em
 * vez de mostrar manchete inventada.
 */
export type News = {
  feeds: string[]
}

export type HaloSettings = {
  /**
   * O idioma da interface. Português é o padrão, e o que um arquivo antigo ou
   * editado à mão trouxer de estranho volta para ele. Ver `shared/i18n.ts`.
   */
  language: Idioma
  appearance: Appearance
  /** O ambiente ativo e as imagens de cada um. Ver `EnvironmentSettings`. */
  environment: EnvironmentSettings
  widgets: Widgets
  hiddenScreens: HiddenScreens
  /**
   * Pastas favoritadas (caminhos absolutos), na ordem do carrossel.
   *
   * Na primeira execução o main semeia com as pastas do XDG (Documentos,
   * Downloads…) — lista vazia por padrão faria o carrossel nascer inútil.
   */
  favorites: string[]
  desktop: DesktopMode
  media: Media
  claude: ClaudeSettings
  /** A ilha dinâmica. Ver `src/shared/island.ts`. */
  island: IslandSettings
  /** O lançador em janela própria (Meta+V). Ver `src/main/launcher/`. */
  launcher: LauncherSettings
  /** As notificações do sistema no estilo do ambiente. Ver `src/shared/notificacoes.ts`. */
  notificacoes: NotificacoesSettings
  /** A integração opcional com o CyberKDE. Ver `src/shared/tema-kde.ts`. */
  temaKde: TemaKdeSettings
  seafile: SeafileSettings
  mascot: MascotSettings
  music: Music
  news: News
}

/** Matiz inicial: o verde-menta da paleta do handoff. */
export const DEFAULT_TINT_HUE = 160

/**
 * A transição de conteúdo do handoff.
 *
 * Existe separada de `DEFAULT_SETTINGS` desde que o campo passou a aceitar
 * vazio: o padrão DE FÁBRICA é "automático", e o piso — o que vale quando nem
 * o usuário nem o ambiente escolheram — é este. Sem os dois nomes, resolver o
 * automático cairia em vazio de novo.
 */
export const CONTENT_ENTRANCE_HANDOFF: ContentEntrance = 'surgir'
/** O handoff não tem gráfico nos medidores. */
export const GRAFICOS_HANDOFF: StatGraphs = 'none'

/**
 * A transparência do vidro no handoff.
 *
 * Pelo mesmo motivo da constante acima: o padrão DE FÁBRICA é "automático", e
 * este é o piso. Continua valendo o que o CLAUDE.md diz — 50 devolve
 * exatamente o protótipo —, só que agora por um caminho a mais.
 */
export const TRANSPARENCIA_HANDOFF = 50

/** A claridade do vidro no handoff. Mesmo papel da constante acima. */
export const CLARIDADE_HANDOFF = 50

/** Os padrões reproduzem o protótipo do handoff exatamente. */
export const DEFAULT_SETTINGS: HaloSettings = {
  language: IDIOMA_PADRAO,
  appearance: {
    tint: { on: false, rgb: hueToRgb(DEFAULT_TINT_HUE) },
    dock: 'bottom',
    navigation: 'floating',
    scale: 1,
  },
  // `floresta` é a interface de hoje, intacta — e ligado por padrão porque o
  // ambiente sem o papel de parede seria meio ambiente.
  environment: {
    id: DEFAULT_ENVIRONMENT,
    wallpaper: true,
    wallpapers: {
      floresta: '',
      citypop: '',
      cyberpunk: '',
      bioshock: '',
      estudio: '',
      espaco: '',
      costa: '',
    },
    videos: {},
    // Vazio: nenhum ambiente ajustado, todos no preset deles. E o preset da
    // Floresta é não ter preset — ou seja, o handoff, exatamente.
    ajustes: {},
  },
  widgets: {
    clock: { hour12: false, seconds: false },
    // O lugar do protótipo, até existir serviço de clima de verdade.
    // Sem cidade: o protótipo trazia Sintra, e numa máquina nova isso seria
    // dado inventado sem aviso. Vazio, o cartão pede a cidade (ver WeatherWidget).
    weather: { place: '', unit: 'c', icon: 'phosphor' },
  },
  hiddenScreens: [],
  favorites: [],
  // Ligado por padrão: este app é um overlay de área de trabalho — ficar sobre
  // o papel de parede sem cobrir janela nenhuma é o que ele é, não um extra.
  desktop: { on: true, position: null, startHidden: true },
  media: { playlist: '', favorites: [], recent: [], groups: [], tmdbKey: '' },
  // `plan` é só leitura: o agente estuda e propõe, mas não mexe. Subir daqui
  // é decisão consciente, tomada na tela de Configurações.
  claude: { projects: [], groups: [], mode: 'plan', cli: '' },
  // Desligado por padrão: ligar tira o Meta+V do Klipper (ver `launcher/klipper.ts`),
  // e nada que mexe num atalho do sistema começa ligado sem o usuário pedir.
  launcher: { on: false, recentes: [] },
  // Os balões seguem o tema. O que torna
  // isso seguro é o desenho, não o padrão — o Halo só esconde os balões do
  // Plasma DEPOIS de conseguir desenhar os seus, e a inibição morre junto com
  // a conexão dele (ver `main/notificacoes/servidor.ts`). O canto é o que o
  // Plasma já usava nesta máquina (medido: topo à direita, na tela principal).
  // Desligadas numa instalação nova (24/09/2026): ligar faz o Halo esconder os
  // balões do Plasma e desenhar os dele, e isso não se faz sem a pessoa pedir.
  // Quem já as ligou tem `on: true` gravado, e o padrão não o alcança.
  notificacoes: { on: false, canto: 'topo-direita' },
  // Desligada: ligar faz a troca de ambiente recolorir o KDE pelo CyberKDE, e
  // só quem tem o tema e pediu isso a liga (29/09/2026).
  temaKde: { on: false, cores: {} },
  // Ligada por padrão numa instalação nova, a pedido do usuário (26/09/2026):
  // a ilha é a porta de entrada do app, e com a janela nascendo recolhida é
  // ela quem mostra que o Halo está de pé. Já foi desligada ("nada que ocupa o
  // topo da tela começa ligado sem pedir"); quem a desligou tem `on: false`
  // gravado, e o padrão não o alcança.
  island: {
    on: true,
    display: 'primary',
    // Sobre a barra: a ilha é o notch, e o notch mora na barra de menus. Abaixo
    // dela a pílula roubaria uma faixa da área útil de cada janela maximizada.
    placement: 'sobre',
    opening: 'hover',
    motion: 'gota',
    // A janela de verdade voando: é o que o
    // efeito do KWin já fazia com as janelas guardadas, agora também com o
    // app. Sem o efeito carregado, cai no `sugado` sozinho.
    flight: 'real',
    hud: true,
    notices: true,
    clipboard: true,
    lyrics: true,
    shortcut: false,
    // Ligado: o Meta+Space é o gesto principal da ilha. Ver `appShortcut` em
    // `shared/island.ts` — desligar apaga a linha do kglobalshortcutsrc.
    appShortcut: true,
    kwinEffect: true,
    fullscreenHide: true,
    note: '',
    idleOpacity: 55,
    // O número do handoff. Quem quiser a faixa mais fina baixa em
    // Configurações → Ilha (ver `ALTURA_PILULA_PADRAO`).
    pillHeight: ALTURA_PILULA_PADRAO,
    modules: [],
    shelf: [],
    clocks: [],
    spectrum: true,
    api: true,
    focus: [],
  },
  seafile: { server: '', token: '', library: '' },
  mascot: { file: '', on: false, liveliness: 'normal' },
  music: { spotifyClientId: '', spotifyRedirect: '', spotifyRefreshToken: '' },
  // Feeds de exemplo, para a coluna de leitura nascer com conteúdo de verdade
  // — e para o usuário ver onde trocar: um de tecnologia e dois de notícia
  // geral, um nacional e um internacional. A CNN é a Brasil: os feeds da CNN
  // internacional (`rss.cnn.com`) pararam de ser atualizados (medido em
  // 26/09/2026: o mais novo era de 2024).
  news: {
    feeds: [
      'https://tecnoblog.net/feed/',
      'https://www.cnnbrasil.com.br/feed/',
      'https://feeds.bbci.co.uk/news/world/rss.xml',
    ],
  },
}

const DOCKS: DockPosition[] = ['top', 'bottom', 'left', 'right']
const NAVIGATIONS: NavigationMode[] = ['floating', 'embedded']
export const CONTENT_ENTRANCES: ContentEntrance[] = [
  'surgir',
  'elastico',
  'recarregar',
  'materializar',
  'deslize',
  'dobra',
  'implodir',
  // Do tema Cyberpunk 2077 — ver `styles/animations.css`. Fica na lista para
  // todos: a variação é do app, não do ambiente; é só o PADRÃO que muda.
  'datamosh',
  'nenhuma',
]

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const percent = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : fallback

const channel = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(255, Math.round(v))) : null

function parseRgb(value: unknown, fallback: Rgb): Rgb {
  if (!Array.isArray(value) || value.length !== 3) return fallback
  const [r, g, b] = value.map(channel)
  return r !== null &&
    r !== undefined &&
    g !== null &&
    g !== undefined &&
    b !== null &&
    b !== undefined
    ? [r, g, b]
    : fallback
}

/**
 * Aceita qualquer coisa e devolve configurações válidas.
 *
 * O arquivo é editável à mão e sobrevive a versões futuras do app: campo
 * ausente, corrompido ou fora de faixa cai no padrão em vez de quebrar a
 * abertura.
 */
export function parseSettings(input: unknown): HaloSettings {
  if (!isRecord(input)) return DEFAULT_SETTINGS

  const base = DEFAULT_SETTINGS.appearance
  const a = isRecord(input.appearance) ? input.appearance : {}
  const tint = isRecord(a.tint) ? a.tint : {}

  return {
    language: ehIdioma(input.language) ? input.language : DEFAULT_SETTINGS.language,
    appearance: {
      tint: {
        on: typeof tint.on === 'boolean' ? tint.on : base.tint.on,
        rgb: parseRgb(tint.rgb, base.tint.rgb),
      },
      dock: DOCKS.includes(a.dock as DockPosition) ? (a.dock as DockPosition) : base.dock,
      navigation: NAVIGATIONS.includes(a.navigation as NavigationMode)
        ? (a.navigation as NavigationMode)
        : base.navigation,
      // O teto real é a tela; aqui só barramos absurdo.
      scale:
        typeof a.scale === 'number' && Number.isFinite(a.scale)
          ? Math.max(0.5, Math.min(99, a.scale))
          : base.scale,
    },
    environment: parseEnvironment(input.environment, input),
    widgets: parseWidgets(input.widgets),
    hiddenScreens: parseHidden(input.hiddenScreens),
    favorites: parseFavorites(input.favorites),
    desktop: parseDesktop(input.desktop),
    media: parseMedia(input.media),
    claude: parseClaude(input.claude),
    island: parseIsland(input.island),
    launcher: parseLauncher(input.launcher),
    notificacoes: parseNotificacoes(input.notificacoes),
    temaKde: parseTemaKde(input.temaKde),
    seafile: parseSeafile(input.seafile),
    mascot: parseMascot(input.mascot),
    music: parseMusic(input.music),
    news: parseNews(input.news),
  }
}

/**
 * Ambiente, campo a campo.
 *
 * Um id que não existe (ou que ainda não tem tema — os três "em breve") cai no
 * padrão: escolher um ambiente sem tokens deixaria a interface sem tema
 * nenhum. E só caminho absoluto entra como papel de parede: relativo não
 * apontaria para lugar nenhum na hora de aplicar.
 */
function parseEnvironment(input: unknown, raiz: Record<string, unknown>): EnvironmentSettings {
  const base = DEFAULT_SETTINGS.environment
  const bruto = isRecord(input) ? input : {}

  const wallpapers = isRecord(bruto.wallpapers) ? bruto.wallpapers : {}
  const caminhos = { ...base.wallpapers }
  const brutos = isRecord(bruto.videos) ? bruto.videos : {}
  const videos: Partial<Record<EnvironmentId, string>> = {}
  for (const id of ENVIRONMENT_IDS) {
    const valor = wallpapers[id]
    if (typeof valor === 'string' && valor.startsWith('/')) caminhos[id] = valor.slice(0, 1024)
    const video = brutos[id]
    if (typeof video === 'string' && video.startsWith('/')) videos[id] = video.slice(0, 1024)
  }

  const id = isEnvironmentId(bruto.id) ? bruto.id : base.id
  const ajustes: Partial<Record<EnvironmentId, AjustesDoAmbiente>> = {}
  const guardados = isRecord(bruto.ajustes) ? bruto.ajustes : null
  for (const alvo of ENVIRONMENT_IDS) {
    const ajuste = parseAjuste(guardados?.[alvo])
    if (ajuste) ajustes[alvo] = ajuste
  }

  // ——— Migração, uma vez ———
  // Até esta versão os quatro campos eram GLOBAIS: `entrance` na raiz,
  // `transparency`, `clarity` e `contentEntrance` dentro de `appearance`. Quem
  // já tem um arquivo gravado tem eles lá, e jogá-los fora apagaria ajuste que
  // a pessoa fez. Eles entram como o ajuste DO AMBIENTE ATIVO, que é o único
  // ambiente em que eles chegaram a ser vistos — e só se aquele ambiente ainda
  // não tiver ajuste próprio, para uma migração não passar por cima de uma
  // escolha nova.
  if (!guardados && !ajustes[id]) {
    const legado = parseAjuste({
      entrance: raiz.entrance,
      ...(isRecord(raiz.appearance) ? raiz.appearance : {}),
    })
    if (legado) ajustes[id] = legado
  }

  return {
    id,
    wallpaper: typeof bruto.wallpaper === 'boolean' ? bruto.wallpaper : base.wallpaper,
    wallpapers: caminhos,
    videos,
    ajustes,
  }
}

/**
 * Um ajuste de ambiente, campo a campo — e devolve `null` se não sobrou nada.
 *
 * Ausente é o valor CHEIO de significado aqui ("não escolhi"), então nada tem
 * padrão: campo que não veio, ou veio lixo, simplesmente não entra.
 */
function parseAjuste(input: unknown): AjustesDoAmbiente | null {
  if (!isRecord(input)) return null
  const ajuste: AjustesDoAmbiente = {}

  if (typeof input.entrance === 'string' && input.entrance !== '') {
    ajuste.entrance = input.entrance.slice(0, 64)
  }
  if (CONTENT_ENTRANCES.includes(input.contentEntrance as ContentEntrance)) {
    ajuste.contentEntrance = input.contentEntrance as ContentEntrance
  }
  for (const campo of ['transparency', 'clarity'] as const) {
    const valor = input[campo]
    if (typeof valor === 'number' && Number.isFinite(valor)) {
      ajuste[campo] = Math.max(0, Math.min(100, valor))
    }
  }
  if (STAT_GRAPHS.includes(input.graphs as StatGraphs)) {
    ajuste.graphs = input.graphs as StatGraphs
  }
  if (typeof input.islandHeight === 'number' && Number.isFinite(input.islandHeight)) {
    ajuste.islandHeight = limitarAltura(input.islandHeight)
  }
  return Object.keys(ajuste).length > 0 ? ajuste : null
}

/**
 * Só http(s), sem repetidos, na ordem do usuário.
 *
 * `feeds` presente e vazio é escolha ("tirei todos") e é respeitado; é só a
 * AUSÊNCIA do campo — arquivo de versão anterior — que cai no padrão.
 */
function parseNews(input: unknown): News {
  const base = DEFAULT_SETTINGS.news
  if (!isRecord(input) || !Array.isArray(input.feeds)) return base
  const feeds = input.feeds
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(feedUrlValida)
  return { feeds: [...new Set(feeds)].slice(0, MAX_FEEDS) }
}

/** Só caminho absoluto para um `.acs`: o resto não seria decodificável. */
function parseMascot(input: unknown): MascotSettings {
  if (!isRecord(input)) return DEFAULT_SETTINGS.mascot
  const file = typeof input.file === 'string' ? input.file.trim() : ''
  const agitacao = input.liveliness
  return {
    file: file.startsWith('/') && /\.acs$/i.test(file) ? file : '',
    on: typeof input.on === 'boolean' ? input.on : false,
    liveliness: (MASCOT_LIVELINESS as readonly string[]).includes(agitacao as string)
      ? (agitacao as MascotLiveliness)
      : 'normal',
  }
}

/** Campo a campo: o arquivo é editável à mão e precisa sobreviver a lixo. */
function parseNotificacoes(input: unknown): NotificacoesSettings {
  const base = DEFAULT_SETTINGS.notificacoes
  if (!isRecord(input)) return base
  return {
    on: typeof input.on === 'boolean' ? input.on : base.on,
    canto: CANTOS_DOS_AVISOS.includes(input.canto as CantoDosAvisos)
      ? (input.canto as CantoDosAvisos)
      : base.canto,
  }
}

/**
 * A cor de cada ambiente vai para a linha de comando do `cyberkde`: só entra
 * `#RRGGBB`, e só para ambiente que existe. O resto some, e vale o padrão.
 */
function parseTemaKde(input: unknown): TemaKdeSettings {
  const base = DEFAULT_SETTINGS.temaKde
  if (!isRecord(input)) return base
  const brutas = isRecord(input.cores) ? input.cores : {}
  const cores: TemaKdeSettings['cores'] = {}
  for (const id of ENVIRONMENT_IDS) {
    const cor = brutas[id]
    if (ehCorHex(cor)) cores[id] = cor.toUpperCase()
  }
  return { on: typeof input.on === 'boolean' ? input.on : base.on, cores }
}

/** Endereço tem de ser http(s); o resto é texto curto. */
function parseSeafile(input: unknown): SeafileSettings {
  if (!isRecord(input)) return DEFAULT_SETTINGS.seafile
  const server = typeof input.server === 'string' ? input.server.slice(0, 256) : ''
  return {
    // Guarda já normalizado: o que o usuário cola costuma trazer o caminho da
    // página de login junto.
    server: normalizarServidor(server),
    token: typeof input.token === 'string' ? input.token.trim().slice(0, 256) : '',
    library: typeof input.library === 'string' ? input.library.trim().slice(0, 64) : '',
  }
}

/** Campo a campo: o arquivo é editável à mão e precisa sobreviver a lixo. */
/**
 * O lançador em janela própria.
 *
 * Um campo só, por enquanto: ligado ou não. A tecla é fixa (Meta+V) porque foi
 * o pedido — abrir o lançador no lugar do clipboard do sistema — e porque
 * mudar de tecla exigiria ensinar o app a liberar OUTRO atalho de outro
 * programa; o Meta+V do Klipper é o único que ele sabe liberar e devolver.
 */
export type LauncherSettings = {
  on: boolean
  /**
   * O que foi executado pelo lançador (qualquer carcaça), para os itens mais
   * usados subirem na lista e o campo vazio mostrar os recentes. Escrito pelo
   * MAIN a cada execução (ver `saveLauncherUso`), nunca pelo renderer.
   */
  recentes: RecenteDoLancador[]
  /**
   * Onde o usuário deixou a janela, como deslocamento a partir do canto da
   * área útil da tela em que ela estava. Relativo, e não absoluto, de
   * propósito: o lançador aparece na tela ATIVA, e a mesma posição vale em
   * qualquer uma delas. Escrito pelo MAIN ao fim de um arrasto; ausente, a
   * janela vai para o padrão (centrada, um pouco acima do meio).
   */
  position?: { dx: number; dy: number }
}

/** Um item que o lançador executou. `n` e `at` dão a frequência com recência. */
export type RecenteDoLancador = {
  /** Identidade estável: `tipo:id[:arg]`. */
  chave: string
  tipo: 'app' | 'comando' | 'resposta' | 'clip' | 'janela'
  id: string
  arg?: string
  titulo: string
  icone: string
  n: number
  /** Epoch ms da última execução. */
  at: number
}

export const RECENTES_MAX = 200

function parseLauncher(input: unknown): LauncherSettings {
  const base = DEFAULT_SETTINGS.launcher
  if (!isRecord(input)) return { ...base, recentes: [] }
  const recentes: RecenteDoLancador[] = []
  if (Array.isArray(input.recentes)) {
    for (const bruto of input.recentes) {
      if (!isRecord(bruto)) continue
      const tipo = bruto.tipo
      if (
        typeof bruto.chave !== 'string' ||
        typeof bruto.id !== 'string' ||
        typeof bruto.titulo !== 'string' ||
        typeof bruto.n !== 'number' ||
        typeof bruto.at !== 'number' ||
        !['app', 'comando', 'resposta', 'clip', 'janela'].includes(tipo as string)
      ) {
        continue
      }
      recentes.push({
        chave: bruto.chave,
        tipo: tipo as RecenteDoLancador['tipo'],
        id: bruto.id,
        ...(typeof bruto.arg === 'string' ? { arg: bruto.arg } : {}),
        titulo: bruto.titulo.slice(0, 120),
        icone: typeof bruto.icone === 'string' ? bruto.icone : 'Lightning',
        n: Math.max(1, Math.floor(bruto.n)),
        at: bruto.at,
      })
      if (recentes.length >= RECENTES_MAX) break
    }
  }
  const pos = input.position
  const position =
    isRecord(pos) &&
    typeof pos.dx === 'number' &&
    typeof pos.dy === 'number' &&
    Number.isFinite(pos.dx) &&
    Number.isFinite(pos.dy)
      ? { dx: Math.max(0, Math.round(pos.dx)), dy: Math.max(0, Math.round(pos.dy)) }
      : undefined
  return {
    on: typeof input.on === 'boolean' ? input.on : base.on,
    recentes,
    ...(position ? { position } : {}),
  }
}

function parseIsland(input: unknown): IslandSettings {
  const base = DEFAULT_SETTINGS.island
  if (!isRecord(input)) return base
  const motion = input.motion
  const placement = input.placement
  const opening = input.opening
  return {
    opening: (ISLAND_OPENINGS as readonly string[]).includes(opening as string)
      ? (opening as IslandSettings['opening'])
      : base.opening,
    on: typeof input.on === 'boolean' ? input.on : base.on,
    placement: (ISLAND_PLACEMENTS as readonly string[]).includes(placement as string)
      ? (placement as IslandSettings['placement'])
      : base.placement,
    // Nome de tela é livre (`DP-1`, `HDMI-A-1`): só exige texto curto.
    display:
      typeof input.display === 'string' && input.display.trim()
        ? input.display.trim().slice(0, 40)
        : base.display,
    motion: (ISLAND_MOTIONS as readonly string[]).includes(motion as string)
      ? (motion as IslandSettings['motion'])
      : base.motion,
    flight: (ISLAND_FLIGHTS as readonly string[]).includes(input.flight as string)
      ? (input.flight as IslandSettings['flight'])
      : base.flight,
    idleOpacity: percent(input.idleOpacity, base.idleOpacity),
    // Inteiro entre 24 e 48: o arquivo é editável à mão, e uma pílula de 4px
    // (ou de 400) não mostraria nada. Fora da faixa vale o padrão do handoff.
    pillHeight:
      typeof input.pillHeight === 'number' && Number.isFinite(input.pillHeight)
        ? Math.max(ALTURA_PILULA_MIN, Math.min(ALTURA_PILULA_MAX, Math.round(input.pillHeight)))
        : base.pillHeight,
    hud: typeof input.hud === 'boolean' ? input.hud : base.hud,
    notices: typeof input.notices === 'boolean' ? input.notices : base.notices,
    clipboard: typeof input.clipboard === 'boolean' ? input.clipboard : base.clipboard,
    lyrics: typeof input.lyrics === 'boolean' ? input.lyrics : base.lyrics,
    shortcut: typeof input.shortcut === 'boolean' ? input.shortcut : base.shortcut,
    appShortcut: typeof input.appShortcut === 'boolean' ? input.appShortcut : base.appShortcut,
    kwinEffect: typeof input.kwinEffect === 'boolean' ? input.kwinEffect : base.kwinEffect,
    fullscreenHide:
      typeof input.fullscreenHide === 'boolean' ? input.fullscreenHide : base.fullscreenHide,
    note: typeof input.note === 'string' ? input.note.slice(0, 4000) : base.note,
    modules: Array.isArray(input.modules)
      ? [...new Set(input.modules.filter((v): v is string => typeof v === 'string' && !!v))].slice(
          0,
          40,
        )
      : [],
    // Caminho absoluto (arquivo ou trecho de texto salvo pelo app) ou um
    // endereço http(s). Relativo não apontaria para lugar nenhum no arranque,
    // e outro esquema de URL não teria como abrir.
    shelf: Array.isArray(input.shelf)
      ? [
          ...new Set(
            input.shelf.filter(
              (v): v is string =>
                typeof v === 'string' &&
                (v.startsWith('/') || /^https?:\/\/./.test(v)) &&
                v.length <= 1024,
            ),
          ),
        ].slice(0, 30)
      : base.shelf,
    // Só fusos que o Intl desta máquina conhece: um nome errado quebraria o
    // `toLocaleTimeString` inteiro do relógio.
    clocks: Array.isArray(input.clocks)
      ? [
          ...new Set(
            input.clocks.filter(
              (v): v is string => typeof v === 'string' && fusoValido(v) && v.length <= 64,
            ),
          ),
        ].slice(0, 8)
      : base.clocks,
    spectrum: typeof input.spectrum === 'boolean' ? input.spectrum : base.spectrum,
    api: typeof input.api === 'boolean' ? input.api : base.api,
    // Sessões de foco: instante e minutos, ambos números razoáveis. Guarda
    // até 400 (mais de um ano de pomodoros diários).
    focus: Array.isArray(input.focus)
      ? input.focus
          .filter(
            (v): v is { at: number; minutes: number } =>
              isRecord(v) &&
              typeof v.at === 'number' &&
              Number.isFinite(v.at) &&
              typeof v.minutes === 'number' &&
              v.minutes > 0 &&
              v.minutes <= 24 * 60,
          )
          .map((v) => ({ at: Math.round(v.at), minutes: Math.round(v.minutes) }))
          .slice(-400)
      : base.focus,
  }
}

/** Um fuso é válido quando o Intl o aceita sem lançar. */
export function fusoValido(nome: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: nome })
    return true
  } catch {
    return false
  }
}

/** Só caminhos absolutos, e só modos que o CLI conhece. */
function parseClaude(input: unknown): ClaudeSettings {
  const base = DEFAULT_SETTINGS.claude
  if (!isRecord(input)) return base
  const modo = input.mode
  const projects = Array.isArray(input.projects)
    ? [
        ...new Set(
          input.projects.filter((v): v is string => typeof v === 'string' && v.startsWith('/')),
        ),
      ].slice(0, MAX_PROJETOS)
    : []
  return {
    projects,
    groups: parseClaudeGroups(input.groups, projects),
    mode: (PERMISSION_MODES as readonly string[]).includes(modo as string)
      ? (modo as PermissionMode)
      : base.mode,
    // Caminho absoluto ou vazio: um caminho relativo dependeria de onde o app
    // foi aberto, e o `spawn` roda com o `cwd` do projeto, não com o do app.
    cli:
      typeof input.cli === 'string' && input.cli.startsWith('/')
        ? input.cli.slice(0, 512)
        : base.cli,
  }
}

/**
 * Teto dos projetos fixados. Era 40, e o store não corta ao adicionar: o 41º
 * aparecia na tela e sumia no arranque seguinte, sem aviso. Com grupos a lista
 * foi feita para crescer, e 200 ainda barra um arquivo absurdo escrito à mão.
 */
const MAX_PROJETOS = 200

/**
 * Grupos da tela do Claude, conferidos contra a lista de projetos.
 *
 * Projeto que não está fixado sai do grupo (ninguém o veria), e um projeto em
 * dois grupos fica só no primeiro — a lista mostra cada um uma vez.
 */
function parseClaudeGroups(input: unknown, projects: string[]): ClaudeGroup[] {
  if (!Array.isArray(input)) return []
  const fixados = new Set(projects)
  const usados = new Set<string>()
  const vistos = new Set<string>()
  return input
    .filter(isRecord)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      name: typeof item.name === 'string' ? item.name.trim().slice(0, MAX_NOME) : '',
      projects: Array.isArray(item.projects)
        ? item.projects.filter((v): v is string => {
            if (typeof v !== 'string' || !fixados.has(v) || usados.has(v)) return false
            usados.add(v)
            return true
          })
        : [],
      collapsed: item.collapsed === true,
    }))
    .filter((grupo) => {
      if (!grupo.id || !grupo.name || vistos.has(grupo.id)) return false
      vistos.add(grupo.id)
      return true
    })
    .slice(0, MAX_GRUPOS)
}

/**
 * Credenciais do Spotify.
 *
 * O Client ID do Spotify é hexadecimal de 32 caracteres; aqui só barramos o
 * absurdo (espaço em volta, tamanho fora de escala), porque um formato novo do
 * lado deles não pode trancar quem colou a credencial certa. O refresh token é
 * opaco — nada a validar além do tipo e do tamanho.
 */
function parseMusic(input: unknown): Music {
  if (!isRecord(input)) return DEFAULT_SETTINGS.music
  const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const redirect = texto(input.spotifyRedirect, 256)
  return {
    spotifyClientId: texto(input.spotifyClientId, 128),
    // Endereço que o app não conseguiria servir (https, host que não é
    // loopback) cai no padrão: guardá-lo só renderia uma aba de erro no
    // navegador, sem dizer por quê.
    spotifyRedirect: redirectValido(redirect) ? redirect : '',
    spotifyRefreshToken: texto(input.spotifyRefreshToken, 1024),
  }
}

/** Só caminho absoluto: o resto não seria abrível de qualquer forma. */
function parseMedia(input: unknown): Media {
  if (!isRecord(input)) return DEFAULT_SETTINGS.media
  const playlist = typeof input.playlist === 'string' ? input.playlist.trim() : ''
  return {
    playlist: playlist.startsWith('/') ? playlist : '',
    favorites: Array.isArray(input.favorites)
      ? [
          ...new Set(input.favorites.filter((v): v is string => typeof v === 'string' && !!v)),
        ].slice(0, MAX_FAVORITOS)
      : [],
    recent: parseRecent(input.recent),
    groups: parseGroups(input.groups),
    // Só o formato do TMDB (32 hexadecimais) ou um token v4; qualquer outra
    // coisa é engano de digitação e viraria 401 a cada título aberto.
    tmdbKey: typeof input.tmdbKey === 'string' ? input.tmdbKey.trim().slice(0, 512) : '',
  }
}

/** Tetos das listas: nomes longos e listas infinitas não cabem na tela. */
const MAX_GRUPOS = 40
const MAX_NOME = 32

function parseGroups(input: unknown): MediaGroup[] {
  if (!Array.isArray(input)) return []
  const vistos = new Set<string>()
  return (
    input
      .filter(isRecord)
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : '',
        name: typeof item.name === 'string' ? item.name.trim().slice(0, MAX_NOME) : '',
        // Mesmo teto dos favoritos: uma lista é subconjunto deles, e o
        // arquivo é editável à mão — um `titles` gigante escrito na unha não
        // pode atravessar até a busca do catálogo.
        titles: Array.isArray(item.titles)
          ? [
              ...new Set(item.titles.filter((v): v is string => typeof v === 'string' && !!v)),
            ].slice(0, MAX_FAVORITOS)
          : [],
      }))
      // Lista sem id ou sem nome não teria como ser mostrada nem escolhida.
      .filter((grupo) => {
        if (!grupo.id || !grupo.name || vistos.has(grupo.id)) return false
        vistos.add(grupo.id)
        return true
      })
      .slice(0, MAX_GRUPOS)
  )
}

/** Teto do histórico: o arquivo não pode crescer sem fim. */
const MAX_RECENTES = 16
const MAX_FAVORITOS = 400

function parseRecent(input: unknown): Progress[] {
  if (!Array.isArray(input)) return []
  const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return input
    .filter(isRecord)
    .filter((item) => typeof item.id === 'string' && item.id)
    .map((item) => ({
      id: item.id as string,
      episode: typeof item.episode === 'string' ? item.episode : null,
      seconds: Math.max(0, numero(item.seconds)),
      duration: Math.max(0, numero(item.duration)),
      at: numero(item.at),
      name: typeof item.name === 'string' ? item.name : '',
      poster: typeof item.poster === 'string' ? item.poster : '',
      subtitle: typeof item.subtitle === 'string' ? item.subtitle : '',
    }))
    .slice(0, MAX_RECENTES)
}

/** Posição fora da faixa de um desktop plausível não é aceita: ver `window.ts`. */
function parseDesktop(input: unknown): DesktopMode {
  const base = DEFAULT_SETTINGS.desktop
  if (!isRecord(input)) return base

  const p = isRecord(input.position) ? input.position : null
  const coord = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)
  const x = p ? coord(p.x) : null
  const y = p ? coord(p.y) : null

  return {
    on: typeof input.on === 'boolean' ? input.on : base.on,
    position: x !== null && y !== null ? { x, y } : null,
    startHidden: typeof input.startHidden === 'boolean' ? input.startHidden : base.startHidden,
  }
}

/** Caminhos absolutos, sem repetidos, com teto para o arquivo não crescer sem fim. */
function parseFavorites(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const paths = input.filter((v): v is string => typeof v === 'string' && v.startsWith('/'))
  return [...new Set(paths)].slice(0, 24)
}

/** Só telas que podem ser escondidas — ver `HIDEABLE_SCREENS`. */
function parseHidden(input: unknown): HiddenScreens {
  if (!Array.isArray(input)) return []
  const allowed = new Set<string>(HIDEABLE_SCREENS)
  return [...new Set(input.filter((s): s is string => typeof s === 'string' && allowed.has(s)))]
}

function parseWidgets(input: unknown): Widgets {
  const base = DEFAULT_SETTINGS.widgets
  if (!isRecord(input)) return base

  const clock = isRecord(input.clock) ? input.clock : {}
  const weather = isRecord(input.weather) ? input.weather : {}
  const place = typeof weather.place === 'string' ? weather.place.trim().slice(0, 40) : ''

  return {
    clock: {
      hour12: typeof clock.hour12 === 'boolean' ? clock.hour12 : base.clock.hour12,
      seconds: typeof clock.seconds === 'boolean' ? clock.seconds : base.clock.seconds,
    },
    weather: {
      place: place || base.weather.place,
      unit: weather.unit === 'f' || weather.unit === 'c' ? weather.unit : base.weather.unit,
      icon: WEATHER_ICONS.includes(weather.icon as WeatherIcon)
        ? (weather.icon as WeatherIcon)
        : base.weather.icon,
    },
  }
}

/**
 * A altura da pílula da ilha que vale AGORA.
 *
 * Duas camadas, e a regra de sempre: ausente é "não escolhi". A escolha do
 * ambiente ganha da altura global de Configurações → Ilha. Uma função só, no
 * compartilhado, porque quem precisa dela são o main (que monta a janela da
 * ilha e a boca da gaveta) e a tela de Configurações — e duas contas iguais em
 * lugares diferentes divergem.
 */
export function alturaDaIlha(settings: HaloSettings): number {
  const { id, ajustes } = settings.environment
  return limitarAltura(ajustes[id]?.islandHeight ?? settings.island.pillHeight)
}
