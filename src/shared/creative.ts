import { marcar } from './i18n'

/**
 * Social Arte — o vocabulário comum das fontes criativas.
 *
 * Vive em `shared/` porque os dois processos precisam dele: o main busca nas
 * plataformas (a CSP do renderer não alcança host nenhum, de propósito) e o
 * renderer desenha. Nenhum tipo daqui é de uma plataforma específica — é
 * exatamente esse o ponto.
 *
 * A REGRA que atravessa este arquivo: **campo que o provedor não deu não é
 * inventado**. Texto ausente é string vazia, número ausente é `null`. Um `0`
 * em "curtidas" seria uma afirmação — "ninguém curtiu" —, e ela seria falsa.
 */

/**
 * As fontes. `link` não é uma plataforma: é o item salvo por URL, que existe
 * mesmo sem integração nenhuma configurada e é o que faz a biblioteca útil no
 * primeiro dia.
 */
export type CreativeProviderId =
  | 'pinterest'
  | 'deviantart'
  | 'artstation'
  | 'behance'
  | 'printables'
  | 'thingiverse'
  | 'link'

/**
 * O que um provedor sabe fazer.
 *
 * Declarado por provedor e não presumido: o Pinterest lê as pastas de quem
 * autorizou mas não tem busca pública; o Printables não tem API oficial. A
 * tela usa isto para não oferecer um botão que não faria nada.
 */
export type CreativeCapability = 'search' | 'trending' | 'item' | 'collections'

/** O tipo de conteúdo, na taxonomia desta tela — não na de cada plataforma. */
export type CreativeKind =
  | 'arte-digital'
  | 'ilustracao'
  | 'fotografia'
  | 'design'
  | 'conceito'
  | 'modelo-3d'
  | 'impressao-3d'
  | 'decoracao'
  | 'action-figure'
  | 'pinball'
  | 'interface'
  | 'outro'

export const CREATIVE_KINDS: readonly CreativeKind[] = [
  'arte-digital',
  'ilustracao',
  'fotografia',
  'design',
  'conceito',
  'modelo-3d',
  'impressao-3d',
  'decoracao',
  'action-figure',
  'pinball',
  'interface',
  'outro',
]

/**
 * Rótulo de tela para cada tipo. A tela não traduz enum à mão.
 *
 * Marcado, não traduzido: a tabela nasce na importação, antes de o idioma ser
 * conhecido. Quem desenha chama `t(CREATIVE_KIND_LABEL[tipo])`.
 */
export const CREATIVE_KIND_LABEL: Record<CreativeKind, string> = {
  'arte-digital': marcar('Arte digital'),
  ilustracao: marcar('Ilustração'),
  fotografia: marcar('Fotografia'),
  design: marcar('Design'),
  conceito: marcar('Conceito'),
  'modelo-3d': marcar('Modelo 3D'),
  'impressao-3d': marcar('Impressão 3D'),
  decoracao: marcar('Decoração'),
  'action-figure': marcar('Action figure'),
  pinball: marcar('Pinball'),
  interface: marcar('Interface e HUD'),
  outro: marcar('Outra referência'),
}

/** Uma referência, já normalizada — de qualquer fonte. */
export type CreativeItem = {
  /** Interno e estável: `<provedor>:<id externo>`. É a chave da biblioteca. */
  id: string
  provider: CreativeProviderId
  /** O id na plataforma de origem, como ela o escreve. */
  externalId: string
  title: string
  /** Já sem HTML. Vazio quando o provedor não dá. */
  description: string
  author: string
  /** URL do avatar do autor, ou vazio. */
  authorAvatar: string
  /** A capa. Vazio quando não há — a tela desenha o lugar dela mesmo assim. */
  cover: string
  /** Outras imagens, quando a publicação tem mais de uma. */
  gallery: string[]
  /** A publicação ORIGINAL. É para onde "Abrir original" leva. */
  url: string
  kind: CreativeKind
  tags: string[]
  /** Como a plataforma a nomeia (ex.: "CC BY 4.0"). Vazio quando não informa. */
  license: string
  /** NULO quando o provedor não informa — nunca 0 para "não sei". */
  likes: number | null
  views: number | null
  downloads: number | null
  /** ISO, ou nulo. */
  publishedAt: string | null
  /** O que só faz sentido naquela plataforma. Sempre texto, para atravessar o IPC. */
  meta: Record<string, string>
}

/** O estado de uma fonte, para a área "Fontes conectadas". */
export type CreativeConnection = {
  provider: CreativeProviderId
  /** Nome de tela da plataforma. */
  name: string
  /** Uma linha dizendo o que ela traz. */
  description: string
  connected: boolean
  capabilities: CreativeCapability[]
  /** ISO da última busca que deu certo, ou nulo. */
  lastSyncAt: string | null
  /**
   * O que impede de usar, em português e acionável — "falta o Client ID,
   * informe em Configurações → Social Arte". Vazio quando está tudo bem.
   */
  error: string
  /**
   * O endereço da busca no SITE da plataforma, com `%s` no lugar do termo.
   *
   * Existe para as fontes que não podem ser consultadas de dentro do app — os
   * termos do Printables proíbem extração do conteúdo, o Thingiverse exige
   * revisão do aplicativo, o Pinterest não abriu a busca pública. Em vez de um
   * botão morto ou de uma raspagem escondida, a tela leva a pessoa até lá.
   * Vazio quando não há.
   */
  /**
   * O endereço da busca no SITE da plataforma, com `%s` no lugar do termo.
   *
   * Vazio hoje em todas as fontes: as três integradas são consultadas de
   * dentro do app, e o Printables — a única que já teve este botão — saiu por
   * completo em 04/09/2026. O campo fica porque uma fonte nova pode precisar
   * dele; a tela só desenha o botão quando ele vem preenchido.
   */
  searchUrl: string
  /**
   * Esta fonte tem conta, e o app sabe abrir a página de acesso dela.
   *
   * Quem pede a senha é o SITE, numa janela com moldura e com o endereço à
   * vista — o app não desenha campo de senha nenhum. Ver `creative/navegador.ts`.
   */
  signIn: boolean
  /** Há sessão gravada agora. Muda o QUE a fonte mostra, não se ela funciona. */
  signedIn: boolean
}

/**
 * O que UMA fonte respondeu, entregue assim que ela responde.
 *
 * A busca unificada consulta cinco páginas reais e leva de 25 a 35 segundos
 * para todas — e esperar por todas para mostrar qualquer coisa faz a tela
 * parecer travada. Cada fonte manda o que achou pelo caminho, e a grade vai
 * enchendo.
 *
 * `pedido` é o número da consulta: o que chega de uma busca velha, enquanto a
 * pessoa já digitou outra coisa, é descartado por ele.
 */
export type CreativePartial = {
  pedido: number
  provider: CreativeProviderId
  items: CreativeItem[]
  cursor: string
  /** Vazio quando deu certo. */
  error: string
  /** Quantas fontes ainda vão responder depois desta. */
  faltam: number
}

/** Como ordenar os resultados. */
export type CreativeSort = 'relevancia' | 'recentes' | 'populares'

/** A orientação da imagem, para filtrar. */
export type CreativeOrientation = 'qualquer' | 'retrato' | 'paisagem' | 'quadrada'

/** O que a tela pede. Campo vazio ou ausente é "não filtrar por isto". */
export type CreativeQuery = {
  text: string
  /** Vazio = todas as fontes conectadas. */
  providers: CreativeProviderId[]
  kinds: CreativeKind[]
  license: string
  orientation: CreativeOrientation
  sort: CreativeSort
  /** Cursor devolvido pela página anterior. Vazio na primeira. */
  cursor: string
  limit: number
}

/**
 * O resultado de uma busca unificada.
 *
 * `falhas` existe porque uma fonte fora do ar NÃO pode derrubar a página: os
 * resultados das outras aparecem, e a tela diz discretamente qual falhou. É a
 * mesma forma que `NewsResult` já usa para os feeds RSS.
 */
export type CreativeSearchResult = {
  items: CreativeItem[]
  /**
   * Cursor para a próxima página, ou VAZIO quando acabou.
   *
   * Opaco: a tela o guarda e o devolve, e nunca o interpreta. Por dentro ele é
   * um mapa de cursor POR FONTE, porque uma busca unificada acaba em ritmos
   * diferentes — a página 3 do DeviantArt pode existir enquanto outra fonte já
   * entregou tudo o que tinha. Quem sabe ler isso é `creative/index.ts`.
   *
   * Vazio significa "não há mais", e é assim que o botão "Carregar mais"
   * desaparece sozinho. Uma fonte cuja página é única — a home do DeviantArt é
   * — devolve vazio de saída, e isso não é falta: é a verdade dela.
   */
  cursor: string
  falhas: { provider: CreativeProviderId; error: string }[]
}

/** Uma coleção da biblioteca pessoal. */
export type CreativeCollection = {
  id: string
  name: string
  description: string
  /** Um token de cor do tema (ex.: `--accent-violet`), nunca um valor literal. */
  color: string
  /** Nome de ícone do Phosphor, como a ilha já faz. */
  icon: string
  createdAt: string
}

/**
 * Um item guardado.
 *
 * Guarda o `CreativeItem` INTEIRO, e não só o id: a regra do usuário é que a
 * referência continue disponível mesmo com a integração desconectada. O que se
 * guarda são metadados e a URL original — nunca o arquivo.
 */
export type CreativeSaved = {
  item: CreativeItem
  /** Ids de coleção. Um item pode estar em várias, ou em nenhuma. */
  collections: string[]
  /** Tags do usuário, separadas das tags da plataforma. */
  tags: string[]
  note: string
  savedAt: string
  favorite: boolean
}

/** A biblioteca inteira, como ela é guardada. */
export type CreativeLibrary = {
  collections: CreativeCollection[]
  items: CreativeSaved[]
}

/**
 * A prévia de uma URL colada, antes de salvar.
 *
 * `provider` é `link` quando nenhuma plataforma integrada reconheceu o
 * endereço — e isso é um caminho de primeira classe, não um fracasso: salvar
 * qualquer URL com título, imagem, nota e coleção é o que a biblioteca precisa
 * saber fazer sem nenhuma credencial configurada.
 */
export type CreativePreview = {
  ok: boolean
  /** A frase do que impediu, quando `ok` é falso. */
  error: string
  item: CreativeItem | null
}
