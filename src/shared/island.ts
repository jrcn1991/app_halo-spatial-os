/**
 * Ilha dinâmica — a gota no topo da tela.
 *
 * Código isolado de propósito: vive em `src/main/island/` e
 * `src/renderer/island/`, e o que ela toca fora daí é sempre aditivo. Ela
 * reaproveita os mecanismos do app (janela própria como a do player, IPC
 * tipado, configurações validadas), mas nada dela pode alterar o
 * comportamento das sete telas.
 */

/** Onde a ilha aparece. */
export type IslandDisplay = 'primary' | 'all' | string

/** Como ela se comporta ao chegar e sair. */
export type IslandMotion = 'gota' | 'elastico' | 'desliza' | 'expandir' | 'nenhuma'

export const ISLAND_MOTIONS: readonly IslandMotion[] = [
  'gota',
  'elastico',
  'desliza',
  'expandir',
  'nenhuma',
]

/**
 * Onde a ilha se assenta em relação à barra do sistema.
 *
 * `sobre` — por cima do painel, como o notch de um MacBook fica na barra de
 * menus: a ilha não gasta nenhum pixel de área útil. `abaixo` — colada no
 * topo da área útil, logo abaixo do painel; ela rouba uma faixa da tela, mas
 * nunca cobre o que o painel mostra no centro.
 */
export type IslandPlacement = 'sobre' | 'abaixo'

export const ISLAND_PLACEMENTS: readonly IslandPlacement[] = ['sobre', 'abaixo']

/**
 * O gesto de abrir. `hover` abre ao passar o mouse, depois de um atraso curto
 * — cruzar o topo da tela não pode abrir a ilha. `click` só abre ao clicar,
 * para quem tem o painel logo ali e prefere passar por cima sem nada acontecer.
 */
export type IslandOpening = 'hover' | 'click'

export const ISLAND_OPENINGS: readonly IslandOpening[] = ['hover', 'click']

/**
 * Como a janela VOA para a pílula, e volta de lá.
 *
 * Vale para os dois voos — a janela guardada na gaveta e o próprio Halo
 * recolhido pelo Meta+Espaço —, porque é o mesmo fantasma e seria estranho
 * que a mesma peça se movesse de dois jeitos na mesma tela.
 *
 * Todas duram o mesmo (`VOO_CHEGADA_MS`), e isso não é preguiça: o main
 * revela e esconde a janela REAL em instantes contados a partir daí (ver
 * `island/window.ts`). Uma variação mais longa deixaria a janela aparecer
 * antes do cartão chegar. O que muda é o caminho e a curva.
 *
 * As três `real…` são a exceção às duas regras acima: quem anima é o
 * COMPOSITOR, e o que voa é a janela de verdade, com o conteúdo dela — não um
 * cartão desenhado por cima. Precisam do efeito do KWin (`island.kwinEffect`);
 * sem ele, caem no `sugado`. O preço é que a janela voa na camada em que ela
 * está: a do Halo é a do papel de parede, então outra janela aberta por cima
 * esconde o voo.
 *
 * A TRAJETÓRIA delas é escolhida no próprio pacote do efeito, que é reescrito
 * e recarregado quando a opção muda (ver `island/efeito.ts`) — a `EffectWindow`
 * do compositor não alcança as configurações do app, e um valor cravado no
 * código do efeito é o caminho mais curto entre os dois. São menos que as sete
 * de cartão porque o compositor anima tamanho, posição e opacidade, e nada
 * além disso: dobra, giro e o gargalo do gênio não têm como ser pedidos ali.
 *
 * `nenhuma` não desenha cartão nenhum: a janela some e volta na hora. É a
 * saída para quem não quer animação — e o anúncio e o quique da pílula
 * continuam, porque eles dizem o que aconteceu.
 */
export type IslandFlightStyle =
  | 'real'
  | 'real-foguete'
  | 'real-desmanchar'
  | 'sugado'
  | 'genie'
  | 'foguete'
  | 'dobra'
  | 'giro'
  | 'desmanchar'
  | 'nenhuma'

/** A variação escolhida faz a JANELA voar (pelo compositor), e não um cartão. */
export const vooDaJanelaDeVerdade = (estilo: IslandFlightStyle): boolean =>
  estilo === 'real' || estilo === 'real-foguete' || estilo === 'real-desmanchar'

export const ISLAND_FLIGHTS: readonly IslandFlightStyle[] = [
  'real',
  'real-foguete',
  'real-desmanchar',
  'sugado',
  'genie',
  'foguete',
  'dobra',
  'giro',
  'desmanchar',
  'nenhuma',
]

/**
 * A altura da pílula FECHADA, em px.
 *
 * 36 é o número do handoff (e o da ilha da Apple). Ela pode ser baixada:
 * sobre o painel do KDE a faixa preta fica alta demais. Vale SÓ para a pílula — a ilha aberta continua
 * crescendo com o conteúdo, porque ali a altura é o painel, não a moldura.
 *
 * O piso é 24: abaixo disso o texto de 13px de uma atividade não cabe sem
 * cortar, e a pílula deixaria de mostrar o que promete. O teto é 48 — mais
 * que isso é uma faixa, não um notch. Quem encolhe junto é a bolha (ela é um
 * círculo do tamanho da pílula), o raio de baixo (metade da altura), a capa
 * da faixa e a onda; o texto não muda de corpo.
 */
export const ALTURA_PILULA_PADRAO = 36
export const ALTURA_PILULA_MIN = 24
export const ALTURA_PILULA_MAX = 48

/** O piso e o teto acima, aplicados. Arquivo editável à mão precisa sobreviver
 * a lixo, e a altura vem de dois lugares (o ambiente e a global). */
export function limitarAltura(px: number): number {
  return Math.round(Math.max(ALTURA_PILULA_MIN, Math.min(ALTURA_PILULA_MAX, px)))
}

export type IslandSettings = {
  on: boolean
  /** `primary`, `all`, ou o nome de uma tela (ex.: `DP-1`). */
  display: IslandDisplay
  placement: IslandPlacement
  /** Como ela abre: ao passar o mouse (com um atraso curto) ou só ao clicar. */
  opening: IslandOpening
  motion: IslandMotion
  /** Como o fantasma voa para a pílula e volta. Ver `IslandFlightStyle`. */
  flight: IslandFlightStyle
  /** O HUD de volume: a pílula mostra a barra quando o volume muda. */
  hud: boolean
  /** Anunciar as notificações do sistema (a ilha escuta o D-Bus, não substitui o KDE). */
  notices: boolean
  /** Guardar o histórico da área de transferência (só em memória). */
  clipboard: boolean
  /** Buscar letras sincronizadas no LRCLIB para o que está tocando. */
  lyrics: boolean
  /**
   * Atalho global Meta+Shift+H para guardar a janela ativa. Desligado por
   * padrão: ligá-lo grava um atalho do KWin em `~/.config/kglobalshortcutsrc`
   * — fora do app, e por isso só com o usuário pedindo.
   */
  shortcut: boolean
  /**
   * O efeito do KWin que faz a janela de verdade voar para a pílula (ver
   * `island/efeito.ts`). Escreve um pacote em `~/.local/share/kwin-wayland/
   * effects/` — exceção documentada; desligar remove o pacote.
   */
  kwinEffect: boolean
  /** Esconder a ilha enquanto a janela ativa está em tela cheia. */
  fullscreenHide: boolean
  /**
   * A nota rápida. Escrita pelo MAIN pela ação `nota-salvar` e preservada em
   * `saveSettings`, como a gaveta — o renderer das configurações não a vê.
   */
  note: string
  /** 0–100: o quanto ela some quando ninguém está olhando. */
  idleOpacity: number
  /**
   * A altura da pílula fechada, em px (24–48; ver `ALTURA_PILULA_PADRAO`). A
   * ilha ABERTA não muda — ali a altura é do conteúdo.
   */
  pillHeight: number
  /** Módulos ligados, por id. Vazio = todos. */
  modules: string[]
  /**
   * A gaveta de arquivos: caminhos guardados ao soltar arquivos na gota.
   * Escrito pelo MAIN (o renderer pede via ação) e preservado em
   * `saveSettings`, como `desktop.position` — o renderer não acompanha.
   */
  shelf: string[]
  /**
   * Relógios de outros fusos (nomes IANA, ex.: `Europe/Lisbon`), mostrados no
   * panorama da home e no módulo de relógio. Vazio = só o local.
   */
  clocks: string[]
  /**
   * O espectro de áudio de verdade: enquanto algo toca, o main ouve o monitor
   * da saída (`parec`) e a onda da pílula segue a música em vez de dançar
   * sozinha. Custa ~1% de CPU só enquanto toca.
   */
  spectrum: boolean
  /**
   * A API local: um socket Unix em `$XDG_RUNTIME_DIR/halo-ilha.sock` onde
   * scripts do usuário (o shell, os hooks do Claude Code) publicam atividades
   * e avisos para a pílula. Só o próprio usuário alcança o arquivo (0600).
   */
  api: boolean
  /**
   * Atalho global Meta+Space para recolher o Halo para a ilha e trazê-lo de
   * volta (ver `island/halo.ts`). Como o `shortcut` da janela ativa, ele grava
   * uma linha em `~/.config/kglobalshortcutsrc` — fora do app —, e desligar a
   * apaga. Nasce LIGADO porque é o gesto principal da ilha; a chave
   * existe para desfazer sem editar arquivo nenhum.
   */
  appShortcut: boolean
  /**
   * As sessões de foco concluídas (temporizadores que chegaram ao fim), para
   * o gráfico dos sete dias e a sequência. Escrito pelo MAIN ao acabar o
   * temporizador e preservado em `saveSettings`, como a gaveta.
   */
  focus: FocusSession[]
}

/** Uma sessão de foco concluída: quando acabou e quantos minutos durou. */
export type FocusSession = { at: number; minutes: number }

/** Um valor lido do sistema. */
export type Reading = {
  id: string
  /** O que mostrar em uma linha. */
  label: string
  value: string
  /** Detalhe secundário, quando houver. */
  detail: string
  /** 0–1, para as barras. `null` quando não é proporção. */
  ratio: number | null
  /** `alerta` pinta de âmbar; `erro`, de vermelho. */
  level: 'ok' | 'alerta' | 'erro'
  /** Imagem pequena (data: ou https:), quando a leitura tem uma — a capa da faixa. */
  art?: string
}

/** Um agrupamento de leituras, do jeito que a ilha mostra. */
export type IslandModule = {
  id: string
  name: string
  /** Nome do ícone Phosphor, resolvido no renderer. */
  icon: string
  readings: Reading[]
  /** Ações que este módulo oferece. */
  actions: IslandAction[]
  /** `false` quando a fonte não respondeu — a ilha diz isso, não inventa. */
  ok: boolean
  error: string | null
}

export type IslandAction = {
  id: string
  label: string
  icon: string
  /** `true` quando a ação alterna algo que está ligado agora. */
  active?: boolean
}

/** O que a ilha inteira mostra num instante. */
export type IslandSnapshot = {
  at: number
  modules: IslandModule[]
  /** O temporizador em andamento, se houver — o renderer conta sozinho até `end`. */
  timer: IslandTimer | null
  /** As últimas notificações do sistema, mais recente primeiro. */
  notices: IslandNotice[]
  /**
   * Arquivos parciais do navegador em ~/Downloads. `parado` é o que deixou
   * de ser escrito há mais de um minuto — pausado ou abandonado —, e a pílula
   * só mostra os que NÃO estão parados (ver `baixandoAgora`, em `snapshot.ts`).
   */
  downloads: { nome: string; bytes: number; parado: boolean }[]
  /** O histórico da área de transferência (memória do main, ver `island/clipboard.ts`). */
  clips: IslandClip[]
  /** A nota rápida, guardada em `island.note` nas configurações. */
  note: string
  /** A letra sincronizada da faixa que toca, se o LRCLIB a tem. */
  lyrics: IslandLyricLine[] | null
  /** As atividades publicadas pela API local (ver `island/api.ts`). */
  activities: IslandActivity[]
  /** O app em si: recolhido para a ilha, ou à vista. Ver `island/halo.ts`. */
  halo: IslandHalo
}

/**
 * O Halo visto pela ilha.
 *
 * `recolhido` é a janela do app escondida — ela vive na pílula, no botão do
 * início. Não é a gaveta de janelas (`janelasGuardadas`): aquela guarda
 * janelas ALHEIAS pelo KWin, e esta é a nossa, escondida pelo Electron.
 */
export type IslandHalo = { recolhido: boolean }

/**
 * Uma atividade vinda de fora — um comando longo no shell, um build, um
 * agente do Claude Code num terminal — publicada no socket da ilha. Em
 * `andamento` ela mora na pílula; ao acabar (`ok`/`erro`) vira anúncio e fica
 * na lista por um tempo. Memória do main, morre com o app.
 */
export type IslandActivity = {
  id: string
  title: string
  detail: string
  state: 'andamento' | 'ok' | 'erro'
  /** 0–1 quando quem publicou informou progresso; senão `null`. */
  progress: number | null
  /** Quem publicou (`shell`, `claude`, o que vier no campo `source`). */
  source: string
  /** Quando começou e quando mudou pela última vez (epoch ms). */
  startedAt: number
  updatedAt: number
}

/**
 * Os cinco níveis (0–1) das barras da onda, medidos do áudio que toca (ver
 * `island/espectro.ts`). Chegam ~15 vezes por segundo enquanto há som.
 */
export type IslandSpectrum = number[]

/**
 * O Claude da ilha (ver `island/claude.ts`): um agente do CLI aberto pela
 * própria ilha, com a conversa dele e o projeto onde roda. `agent` é nulo
 * enquanto ninguém perguntou nada.
 */
export type IslandClaude = {
  agent: import('./agents').Agent | null
  messages: import('./agents').AgentMessage[]
  /** Onde o próximo agente vai rodar (a pasta do projeto ou a pessoal). */
  project: string
  /** Os projetos fixados em Configurações → Claude, para escolher. */
  projects: string[]
  /** O modo de permissão que vale para o próximo agente (Configurações → Claude). */
  mode: string
}

/** Um item do histórico da área de transferência. Só a prévia viaja. */
export type IslandClip = {
  id: number
  at: number
  preview: string
  length: number
  /** `cor` é um `#hex`/`rgb()`; `email` um endereço — as "ações inteligentes" do Notchy. */
  kind: 'texto' | 'url' | 'cor' | 'email'
  pinned: boolean
}

/**
 * Um temporizador em andamento. Um só, no main (ver `island/timer.ts`).
 * Com `end` nulo é um CRONÔMETRO: conta para cima a partir de `start`.
 */
export type IslandTimer = {
  /** Instante (epoch ms) em que acaba; `null` no cronômetro. */
  end: number | null
  /** Instante (epoch ms) em que começou. */
  start: number
  label: string
  minutes: number
}

/** Uma linha de letra sincronizada: o instante (segundos) e o texto. */
export type IslandLyricLine = { at: number; text: string }

/** Uma notificação do sistema, vista pelo vigia do D-Bus (ver `island/watch.ts`). */
export type IslandNotice = {
  id: number
  at: number
  app: string
  title: string
  body: string
  urgent: boolean
  /** O `.desktop` do remetente (dica `desktop-entry`), para abrir o app de origem. */
  desktopEntry: string
}

/**
 * As notificações do sistema, para a HOME.
 *
 * A home lê a mesma lista que a ilha: o vigia do D-Bus é um só
 * (`island/watch.ts`), e duplicá-lo daria duas listas que discordam. A
 * consequência honesta está em `listening`: o vigia só existe com a ilha ligada
 * e as notificações ligadas nela, e sem isso a home DIZ onde ligar em vez de
 * mostrar uma coluna vazia que parece "nada aconteceu".
 */
export type NoticesResult = {
  /** O vigia do D-Bus está de pé agora? */
  listening: boolean
  /** Mais recente primeiro. Vazio é vazio de verdade quando `listening`. */
  items: IslandNotice[]
}

/** Um item guardado na gaveta da ilha. */
export type ShelfItem = {
  /**
   * Caminho absoluto (arquivo do usuário ou trecho de texto salvo pelo app)
   * ou um endereço `http(s)://`. Para arquivos do usuário a gaveta guarda
   * REFERÊNCIAS, nunca cópias.
   */
  path: string
  name: string
  /** `false` quando o arquivo sumiu do disco — a gaveta diz, não esconde. */
  exists: boolean
  /**
   * `arquivo` aponta para o disco; `texto` é um trecho solto na pílula, salvo
   * pelo app na pasta dele; `url` é um endereço, sem arquivo nenhum.
   */
  kind: 'arquivo' | 'texto' | 'url'
}

/** Uma janela do computador, vista pelo scripting do KWin. */
export type IslandWindow = {
  /** O `internalId` do KWin — estável enquanto a janela viver. */
  id: string
  title: string
  /** Classe do aplicativo (`org.kde.dolphin`), para o glifo e o agrupamento. */
  appClass: string
  minimized: boolean
  active: boolean
  /** Onde a janela estava (na tela, em px) — para o fantasma voar de lá. */
  geometry?: { x: number; y: number; width: number; height: number }
}

/**
 * O voo: uma janela guardada "sobe e entra" na pílula. Quem desenha é a
 * CAMADA DO FANTASMA (uma janela própria, transparente, que cobre as telas
 * e só aparece durante o voo); a janela da ilha nunca muda de tamanho. Os
 * retângulos chegam relativos à camada. A ilha recebe o mesmo evento para
 * fechar o painel e quicar quando o fantasma chega. Ver `island/window.ts`
 * e `Voo.tsx`.
 */
export type IslandFlight = {
  /** `ida`: a janela entra na pílula. `volta`: sai dela e volta ao lugar. */
  sentido: 'ida' | 'volta'
  from: { x: number; y: number; width: number; height: number }
  /** A boca da pílula: centro em x, e o y onde o fantasma some (px). */
  mouth: { x: number; y: number }
  title: string
  appClass: string
  /**
   * Que cartão desenhar. `janela` é o vulto de uma janela alheia; `halo` é o
   * próprio app, e o fantasma imita o vidro dele em vez de uma placa preta —
   * é a nossa janela indo para a ilha, e ela devia se parecer com ela mesma.
   */
  tipo: 'janela' | 'halo'
  /**
   * A variação escolhida em Configurações. Viaja NO EVENTO, e não na consulta
   * da página: a camada do fantasma é criada uma vez, junto com a ilha, e
   * viveria com o valor do arranque se a variação chegasse pela URL.
   */
  estilo: IslandFlightStyle
}

/**
 * Quando o fantasma chega (à boca na ida; ao lugar da janela na volta — a
 * ilha quica na ida, e a janela real reaparece na volta) e quanto dura a
 * camada.
 */
export const VOO_CHEGADA_MS = 560
export const VOO_MS = 900

/**
 * Um anúncio curto: a pílula alarga por um instante, mostra e se recolhe —
 * o gesto do HyperIsland da Xiaomi. Vem do main, que é quem vê os fatos
 * (faixa nova, envio concluído, janela guardada).
 */
export type IslandEvent = {
  icon: string
  text: string
  detail: string
  level: 'ok' | 'alerta' | 'erro'
  /**
   * `hud` é um mostrador (volume): traz `ratio` e some rápido. `aviso` é uma
   * notícia (notificação, temporizador): fica o tempo de ler. Sem `kind`, é
   * o anúncio comum de três segundos.
   */
  kind?: 'hud' | 'aviso'
  /** 0–1 para a barra do HUD. */
  ratio?: number | null
  /**
   * Chave de substituição: dois eventos com a mesma chave são o MESMO assunto
   * mudando (o volume subindo em passos), e o novo toma o lugar do velho em
   * vez de empilhar mais um chip.
   */
  key?: string
  /** Quanto tempo fica na tela. Sem isso, o padrão do anúncio. */
  ttlMs?: number
  /** Uma cor para mostrar como amostra (o conta-gotas): `#rrggbb`. */
  color?: string
}

/**
 * O catálogo do que a ilha integra.
 *
 * Existe como dado, e não só como código, porque é ele que a homologação
 * percorre: `tools/island-check.mjs` exercita item a item e falha se algum
 * deixar de responder. Cada linha é uma leitura do sistema ou uma ação sobre
 * ele — as duas coisas contam como integração.
 */
export type CatalogEntry = {
  id: string
  module: string
  kind: 'leitura' | 'acao'
  /** O que ela faz, em uma linha. */
  what: string
  /** De onde vem o dado, ou o que a ação chama. */
  source: string
}
