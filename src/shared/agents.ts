/**
 * Agentes do Claude, um por terminal.
 *
 * Cada agente é um processo `claude` vivo, rodando dentro de um projeto do
 * usuário. Conversar com ele é mandar uma mensagem e ler o que volta — não há
 * emulação de terminal aqui, e é de propósito: o CLI fala JSON em streaming,
 * que dá status de verdade em vez de texto para adivinhar.
 */

/**
 * O que o agente está fazendo agora.
 *
 * Sai dos eventos do próprio CLI, não de suposição: `iniciando` até ele
 * anunciar a sessão, `pensando` entre a pergunta e a resposta, `ferramenta`
 * enquanto ele usa uma, `ocioso` quando terminou o turno.
 */
export type AgentState = 'iniciando' | 'ocioso' | 'pensando' | 'ferramenta' | 'erro' | 'encerrado'

export type AgentMessage = {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  text: string
  at: number
}

export type Agent = {
  id: string
  /** Caminho do projeto onde ele roda — é o `cwd` do processo. */
  project: string
  /** Nome curto para a lista: a pasta, e um número quando há mais de um. */
  name: string
  state: AgentState
  /** Sessão do CLI, quando ele já anunciou. */
  sessionId: string | null
  /** O que ele está fazendo: nome da ferramenta, ou vazio. */
  activity: string
  turns: number
  lastAt: number
  error: string | null
  /**
   * Um pedido de permissão parado à espera de resposta. Só existe em agentes
   * abertos com `prompts` (ver `AgentOptions`): o CLI pergunta pela entrada
   * e fica esperando — quem responde é quem abriu o agente.
   */
  approval?: AgentApproval | null
}

/**
 * Um pedido de permissão do CLI (`control_request` com `can_use_tool`): a
 * ferramenta que ele quer usar e o que vai fazer com ela, para alguém
 * decidir. Vem do protocolo de controle do CLI em stream-json — medido em
 * 02/09/2026 com `--permission-prompt-tool stdio`.
 */
export type AgentApproval = {
  /** O `request_id` do CLI, que volta na resposta. */
  id: string
  tool: string
  /** O resumo que o CLI dá ("prova.txt", "git status"), ou o que se extraiu da entrada. */
  description: string
  /** A entrada da ferramenta, resumida em texto para a tela. */
  input: string
  at: number
}

/** Opções além do projeto e do modo, para quem precisa de um agente diferente do padrão. */
export type AgentOptions = {
  /** Nome para a lista, no lugar do nome da pasta. */
  name?: string
  /** Texto acrescentado ao system prompt do CLI. */
  systemPrompt?: string
  /** Modelo (`sonnet`, `opus`…). Sem isto, o padrão do CLI. */
  model?: string
  /**
   * Pedidos de permissão chegam como `approval` no agente, em vez de serem
   * negados por conta própria — quem abriu o agente os responde.
   */
  prompts?: boolean
}

/** Modos de permissão do CLI, na ordem do mais contido ao mais solto. */
export const PERMISSION_MODES = ['plan', 'acceptEdits', 'bypassPermissions'] as const
export type PermissionMode = (typeof PERMISSION_MODES)[number]

/**
 * Uma conversa antiga daquele projeto.
 *
 * O CLI guarda cada sessão em `~/.claude/projects/<caminho-codificado>/`, um
 * arquivo por sessão. Retomar é abrir um agente com `--resume`.
 */
export type AgentSession = {
  id: string
  /** A primeira coisa que o usuário pediu, que serve de título. */
  title: string
  /** ISO da última escrita no arquivo. */
  at: string
  messages: number
}

/**
 * Um anexo indo para o agente.
 *
 * Imagem vai como bloco de imagem (o CLI aceita base64 — medido). Arquivo de
 * texto vai embutido no pedido, com o nome, porque assim funciona mesmo quando
 * ele está fora da pasta do projeto. O resto vira menção ao caminho.
 */
export type Attachment = {
  path: string
  name: string
  kind: 'image' | 'text' | 'outro'
  /** Base64 da imagem, ou o conteúdo do texto. Vazio em `outro`. */
  data: string
  mediaType: string
  bytes: number
}
