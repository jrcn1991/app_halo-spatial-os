import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'
import type {
  Agent,
  AgentApproval,
  AgentMessage,
  AgentOptions,
  AgentSession,
  AgentState,
  Attachment,
  PermissionMode,
} from '@shared/agents'
import { t } from '@shared/i18n'
import { currentSettings } from '../settings'

/**
 * Agentes do Claude, um processo por terminal.
 *
 * O CLI roda em `--print` com `--input-format stream-json` e
 * `--output-format stream-json`: um processo vivo por agente, que aceita várias
 * mensagens pela entrada e devolve eventos JSON pela saída. Foi medido nesta
 * máquina — dois turnos no mesmo processo, com `session_id`, duração e erro.
 *
 * A alternativa seria emular um terminal (PTY) e ler a interface de texto do
 * CLI. Seria pior: exigiria dependência nativa, e o status viria de adivinhar
 * o desenho da tela em vez de vir dos eventos. Webhook também não é preciso —
 * o processo é local, e ele já conta o que está fazendo.
 */

/** Teto do histórico por agente: a tela não mostra mais que isso mesmo. */
const MAX_MENSAGENS = 300

type Vivo = {
  agent: Agent
  processo: ChildProcess
  /** Sobra da leitura anterior: um evento pode chegar partido em dois pedaços. */
  resto: string
  mensagens: AgentMessage[]
}

const agentes = new Map<string, Vivo>()
let avisar: (() => void) | null = null

/** Quem receber isto é chamado a cada mudança, para empurrar ao renderer. */
export function onAgentsChanged(callback: () => void): void {
  avisar = callback
}

function mudou(): void {
  avisar?.()
}

/**
 * Onde está o `claude`.
 *
 * O processo do Electron não herda necessariamente o PATH do shell do usuário
 * — quando o app é aberto pelo menu, e não pelo terminal, `~/.local/bin` não
 * costuma estar lá. Procurar nos lugares conhecidos evita um "não encontrado"
 * que não é culpa do usuário.
 *
 * Exportada porque o diagnóstico de Configurações → Sistema pergunta AQUI se o
 * CLI existe: ele é o único programa da lista que o app procura fora do PATH,
 * e um teste próprio lá diria "faltando" sobre um `claude` que a tela abre sem
 * reclamar (`services/dependencias.ts`).
 */
export function acharClaude(): string {
  const escolhido = currentSettings().claude.cli
  if (escolhido) return escolhido

  const casa = homedir()
  const candidatos = [
    join(casa, '.local/bin/claude'),
    // Instalação local do próprio Claude Code, fora do PATH por desenho.
    join(casa, '.claude/local/claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
    // Gerenciadores de versão do Node: quem instalou o CLI por `npm i -g`
    // dentro de um deles não tem nada em `~/.local/bin`, e o app é aberto
    // pelo menu, sem o PATH que o shell montaria.
    join(casa, '.bun/bin/claude'),
    join(casa, '.volta/bin/claude'),
    join(casa, '.npm-global/bin/claude'),
    ...emVersoesDeNode(join(casa, '.nvm/versions/node'), 'bin/claude'),
    ...emVersoesDeNode(join(casa, '.local/share/fnm/node-versions'), 'installation/bin/claude'),
    ...emVersoesDeNode(join(casa, '.asdf/installs/nodejs'), 'bin/claude'),
  ]
  // Sem nada encontrado, o literal: o PATH pode ter o binário mesmo assim, e
  // quem decide se ele existe é o `spawn` — que agora sabe dizer que falhou.
  return candidatos.find((caminho) => existsSync(caminho)) ?? 'claude'
}

/** Cada versão instalada por um gerenciador de Node, do mais novo ao mais velho. */
function emVersoesDeNode(raiz: string, sufixo: string): string[] {
  try {
    return readdirSync(raiz)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((versao) => join(raiz, versao, sufixo))
  } catch {
    // Gerenciador não instalado é o caso comum, não um erro.
    return []
  }
}

/**
 * O que dizer quando o CLI não está aqui.
 *
 * A regra do projeto é que a tela diga onde configurar em vez de fingir
 * (CLAUDE.md § Segredos e dados do usuário). Um `spawn claude ENOENT` cru não
 * ensina nada: esta frase diz o que falta, como resolver e onde apontar.
 */
function explicarFalha(erro: NodeJS.ErrnoException): string {
  if (erro.code !== 'ENOENT') return erro.message
  return t(
    'O Claude Code (comando `claude`) não foi encontrado nesta máquina. Instale-o e reabra o agente, ou aponte o caminho do programa em Configurações → Claude.',
  )
}

function novoId(): string {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** "meu-projeto" e, havendo outro no mesmo projeto, "…  2". */
function nomear(project: string): string {
  const base = basename(project)
  const quantos = [...agentes.values()].filter((v) => v.agent.project === project).length
  return quantos === 0 ? base : `${base} ${quantos + 1}`
}

export function listAgents(): Agent[] {
  return [...agentes.values()].map((v) => v.agent)
}

export function agentById(id: string): Agent | null {
  return agentes.get(id)?.agent ?? null
}

export function agentMessages(id: string): AgentMessage[] {
  return agentes.get(id)?.mensagens ?? []
}

function anotar(vivo: Vivo, role: AgentMessage['role'], text: string): void {
  if (!text.trim()) return
  vivo.mensagens.push({ id: novoId(), role, text, at: Date.now() })
  if (vivo.mensagens.length > MAX_MENSAGENS) vivo.mensagens.shift()
}

function estado(vivo: Vivo, state: AgentState, activity = ''): void {
  vivo.agent = { ...vivo.agent, state, activity, lastAt: Date.now() }
  mudou()
}

/**
 * Um evento do CLI.
 *
 * Só o que a tela usa é lido; o resto é ignorado de propósito, para o formato
 * do CLI poder crescer sem quebrar aqui.
 */
function processarEvento(vivo: Vivo, evento: Record<string, unknown>): void {
  const tipo = evento.type

  if (tipo === 'system' && evento.subtype === 'init') {
    // Só guarda a sessão. O estado NÃO vem daqui: com
    // `--input-format stream-json` o CLI só anuncia a sessão depois da
    // primeira mensagem — ele espera trabalho antes de falar. Esperar o
    // anúncio para dizer "pronto" travava o agente em "iniciando" para
    // sempre, porque ninguém manda mensagem para quem não está pronto.
    vivo.agent = {
      ...vivo.agent,
      sessionId: typeof evento.session_id === 'string' ? evento.session_id : null,
    }
    mudou()
    return
  }

  if (tipo === 'assistant') {
    const conteudo = (evento.message as { content?: unknown[] } | undefined)?.content ?? []
    const blocos = conteudo.filter(
      (b): b is Record<string, unknown> => typeof b === 'object' && b !== null,
    )
    const texto = blocos
      .filter((b) => b.type === 'text')
      .map((b) => String(b.text ?? ''))
      .join('')
    const ferramenta = blocos.find((b) => b.type === 'tool_use')

    if (texto.trim()) anotar(vivo, 'assistant', texto)
    if (ferramenta) {
      const nome = String(ferramenta.name ?? 'ferramenta')
      anotar(vivo, 'tool', nome)
      estado(vivo, 'ferramenta', nome)
    } else if (texto.trim()) {
      estado(vivo, 'pensando')
    }
    return
  }

  if (tipo === 'result') {
    const falhou = evento.is_error === true
    vivo.agent = {
      ...vivo.agent,
      turns: vivo.agent.turns + 1,
      error: falhou ? String(evento.result ?? t('erro sem descrição')) : null,
      approval: null,
    }
    estado(vivo, falhou ? 'erro' : 'ocioso')
    return
  }

  // O CLI pede permissão (só com `prompts`): fica parado até a resposta.
  // Medido em 02/09/2026: sem resposta ele desiste com "permission stream
  // closed" e tenta de novo — por isso todo pedido precisa de um `sim` ou
  // `não`, e os subtipos que não se conhece recebem erro na hora.
  if (tipo === 'control_request') {
    const requestId = String(evento.request_id ?? '')
    const pedido = (evento.request ?? {}) as Record<string, unknown>
    if (pedido.subtype !== 'can_use_tool') {
      responderControle(vivo, requestId, { subtype: 'error', error: 'pedido não suportado' })
      return
    }
    const entrada = (pedido.input ?? {}) as Record<string, unknown>
    const aprovacao: AgentApproval = {
      id: requestId,
      tool: String(pedido.display_name ?? pedido.tool_name ?? t('ferramenta')),
      description: String(pedido.description ?? resumirEntrada(entrada)).slice(0, 160),
      input: resumirEntrada(entrada).slice(0, 600),
      at: Date.now(),
    }
    vivo.agent = { ...vivo.agent, approval: aprovacao }
    anotar(
      vivo,
      'system',
      t('pede permissão: {ferramenta} — {descricao}', {
        ferramenta: aprovacao.tool,
        descricao: aprovacao.description,
      }),
    )
    mudou()
  }
}

/**
 * A entrada de uma ferramenta em uma linha: o comando, o arquivo, o padrão —
 * ou, no `ExitPlanMode`, o plano (sem a cerquilha do título).
 */
function resumirEntrada(entrada: Record<string, unknown>): string {
  const chave = ['command', 'file_path', 'pattern', 'url', 'query', 'path', 'plan'].find(
    (k) => typeof entrada[k] === 'string',
  )
  if (chave === 'plan') {
    return String(entrada.plan)
      .split('\n')
      .map((l) => l.replace(/^#+\s*/, '').trim())
      .filter(Boolean)
      .join(' · ')
  }
  if (chave) return String(entrada[chave])
  try {
    return JSON.stringify(entrada)
  } catch {
    return ''
  }
}

function responderControle(vivo: Vivo, requestId: string, resposta: Record<string, unknown>): void {
  vivo.processo.stdin?.write(
    `${JSON.stringify({ type: 'control_response', response: { request_id: requestId, ...resposta } })}\n`,
  )
}

/**
 * Responde ao pedido de permissão parado no agente. `allow` deixa a
 * ferramenta rodar com a entrada que o CLI propôs; negar devolve o motivo
 * ao modelo, que segue sem ela.
 */
export function resolveApproval(id: string, allow: boolean, motivo = ''): void {
  const vivo = agentes.get(id)
  const pedido = vivo?.agent.approval
  if (!vivo || !pedido) throw new Error(t('não há pedido de permissão esperando'))
  responderControle(vivo, pedido.id, {
    subtype: 'success',
    response: allow
      ? { behavior: 'allow' }
      : { behavior: 'deny', message: motivo || 'negado pelo usuário na ilha' },
  })
  anotar(
    vivo,
    'system',
    allow
      ? t('permitido: {ferramenta}', { ferramenta: pedido.tool })
      : t('negado: {ferramenta}', { ferramenta: pedido.tool }),
  )
  vivo.agent = { ...vivo.agent, approval: null }
  mudou()
}

function lerSaida(vivo: Vivo, pedaco: string): void {
  vivo.resto += pedaco
  const linhas = vivo.resto.split('\n')
  vivo.resto = linhas.pop() ?? ''
  for (const linha of linhas) {
    if (!linha.trim()) continue
    try {
      processarEvento(vivo, JSON.parse(linha) as Record<string, unknown>)
    } catch {
      // Linha que não é JSON não é erro: o CLI escreve avisos soltos às vezes.
    }
  }
}

/** Abre um agente no projeto. Devolve o id para a tela já focar nele. */
export function createAgent(
  project: string,
  mode: PermissionMode,
  resume?: string,
  opcoes: AgentOptions = {},
): Agent {
  const id = novoId()
  const processo = spawn(
    acharClaude(),
    [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      // `--verbose` é o que faz o CLI emitir os eventos de sessão e de turno,
      // e sem eles não haveria status para mostrar.
      '--verbose',
      '--permission-mode',
      mode,
      // Retomar uma conversa antiga é abrir o agente já com ela dentro.
      ...(resume ? ['--resume', resume] : []),
      ...(opcoes.systemPrompt ? ['--append-system-prompt', opcoes.systemPrompt] : []),
      ...(opcoes.model ? ['--model', opcoes.model] : []),
      // Os pedidos de permissão vêm pela saída como `control_request` e são
      // respondidos pela entrada — em vez de negados por conta própria.
      ...(opcoes.prompts ? ['--permission-prompt-tool', 'stdio'] : []),
    ],
    { cwd: project, env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'] },
  )

  const vivo: Vivo = {
    agent: {
      id,
      project,
      name: opcoes.name ?? nomear(project),
      state: 'iniciando',
      sessionId: null,
      activity: '',
      turns: 0,
      lastAt: Date.now(),
      error: null,
      approval: null,
    },
    processo,
    resto: '',
    mensagens: [],
  }
  agentes.set(id, vivo)

  // Processo de pé é agente pronto: ele aceita entrada desde já.
  processo.on('spawn', () => estado(vivo, 'ocioso'))
  processo.stdout?.on('data', (d: Buffer) => lerSaida(vivo, d.toString()))
  processo.stderr?.on('data', (d: Buffer) => {
    const texto = d.toString().trim()
    if (texto) anotar(vivo, 'system', texto.slice(0, 400))
  })
  processo.on('error', (erro) => {
    vivo.agent = { ...vivo.agent, error: explicarFalha(erro) }
    estado(vivo, 'erro')
  })
  // `exit` e `close` — e não só `exit`. Quando o `spawn` falha por não achar o
  // programa, o Node emite `error` e `close`, e NUNCA `exit`: escutando só o
  // primeiro, o agente ficava eternamente "iniciando" e a tela dizia que ele
  // estava pronto. `close` chega uma vez só, e depois de `error`, então o
  // estado de erro é preservado.
  const encerrou = (codigo: number | null) => {
    if (vivo.agent.state === 'encerrado') return
    vivo.agent = {
      ...vivo.agent,
      error:
        codigo && codigo !== 0
          ? t('o processo saiu com código {codigo}', { codigo })
          : vivo.agent.error,
    }
    // Quem morreu por erro fica em erro: "encerrado" pareceria fim normal.
    estado(vivo, vivo.agent.state === 'erro' ? 'erro' : 'encerrado')
  }
  processo.on('exit', encerrou)
  processo.on('close', encerrou)

  mudou()
  return vivo.agent
}

/**
 * Manda uma mensagem, com ou sem anexos.
 *
 * Imagem vai como bloco de imagem — o CLI aceita base64, e foi medido: ele
 * descreveu corretamente uma imagem de teste. Arquivo de texto vai embutido no
 * próprio pedido, com o nome, porque assim funciona mesmo estando fora da pasta
 * do projeto, onde o agente não conseguiria abri-lo sozinho. O resto vira
 * menção ao caminho.
 */
export function sendToAgent(id: string, text: string, attachments: Attachment[] = []): void {
  const vivo = agentes.get(id)
  if (!vivo) return
  if (!text.trim() && attachments.length === 0) return
  if (vivo.agent.state === 'encerrado') return
  // Agente que nem chegou a nascer não recebe mensagem. Sem isto o estado ia
  // para "pensando", o `write` caía no `?.` de um stdin nulo, e a tela ficava
  // pensando para sempre — sem nada acontecendo do outro lado.
  if (vivo.agent.state === 'erro' || !vivo.processo.stdin?.writable) return

  const blocos: Record<string, unknown>[] = []
  const partes: string[] = []

  for (const anexo of attachments) {
    if (anexo.kind === 'image') {
      blocos.push({
        type: 'image',
        source: { type: 'base64', media_type: anexo.mediaType, data: anexo.data },
      })
    } else if (anexo.kind === 'text') {
      partes.push(`Arquivo anexado — ${anexo.name}:\n\n\`\`\`\n${anexo.data}\n\`\`\``)
    } else {
      partes.push(`Arquivo anexado: ${anexo.path}`)
    }
  }
  if (text.trim()) partes.push(text)

  const corpo = partes.join('\n\n')
  if (corpo) blocos.push({ type: 'text', text: corpo })

  const rotulo = attachments.length
    ? `${text.trim()}${text.trim() ? '\n' : ''}[${attachments.map((a) => a.name).join(', ')}]`
    : text
  anotar(vivo, 'user', rotulo)
  estado(vivo, 'pensando')
  vivo.processo.stdin?.write(
    `${JSON.stringify({ type: 'user', message: { role: 'user', content: blocos } })}\n`,
  )
}

/**
 * Como o CLI nomeia a pasta de sessões de um projeto.
 *
 * Tudo que não é letra ou número vira `-`: `/home/usuario/meus projetos/app`
 * vira `-home-usuario-meus-projetos-app` (letra acentuada também vira `-`).
 */
function pastaDeSessoes(project: string): string {
  return join(homedir(), '.claude/projects', project.replace(/[^a-zA-Z0-9]/g, '-'))
}

/** Teto do que se lê de um arquivo de sessão só para achar o título. */
const CABECALHO_LINHAS = 40

/** As conversas antigas daquele projeto, da mais recente para a mais antiga. */
export async function agentSessions(project: string): Promise<AgentSession[]> {
  const pasta = pastaDeSessoes(project)
  let arquivos: string[]
  try {
    arquivos = (await readdir(pasta)).filter((nome) => nome.endsWith('.jsonl'))
  } catch {
    // Projeto sem conversa nenhuma ainda: lista vazia, não erro.
    return []
  }

  const sessoes = await Promise.all(
    arquivos.map(async (nome): Promise<AgentSession | null> => {
      try {
        const caminho = join(pasta, nome)
        const info = await stat(caminho)
        const bruto = await readFile(caminho, 'utf8')
        const linhas = bruto.split('\n').filter(Boolean)

        let title = ''
        for (const linha of linhas.slice(0, CABECALHO_LINHAS)) {
          const evento = JSON.parse(linha) as Record<string, unknown>
          if (evento.type !== 'user') continue
          const mensagem = evento.message as { content?: unknown } | undefined
          const conteudo = mensagem?.content
          const texto =
            typeof conteudo === 'string'
              ? conteudo
              : Array.isArray(conteudo)
                ? conteudo
                    .filter(
                      (b): b is { text?: string } =>
                        typeof b === 'object' && b !== null && 'text' in b,
                    )
                    .map((b) => b.text ?? '')
                    .join(' ')
                : ''
          if (texto.trim()) {
            title = texto.trim().replace(/\s+/g, ' ').slice(0, 80)
            break
          }
        }

        // Sessão sem nenhuma fala do usuário não é retomável de forma útil.
        if (!title) return null
        return {
          id: nome.replace(/\.jsonl$/, ''),
          title,
          at: info.mtime.toISOString(),
          messages: linhas.length,
        }
      } catch {
        return null
      }
    }),
  )

  return sessoes
    .filter((s): s is AgentSession => s !== null)
    .sort((a, b) => b.at.localeCompare(a.at))
}

/** Extensões que valem embutir como texto no pedido. */
const TEXTO = new Set([
  '.txt',
  '.md',
  '.json',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.css',
  '.html',
  '.yml',
  '.yaml',
  '.toml',
  '.sh',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.sql',
  '.csv',
  '.xml',
  '.ini',
  '.conf',
  '.log',
])
const IMAGEM: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}
/** Teto por anexo: o pedido inteiro viaja pelo IPC e pela API. */
const ANEXO_MAX = 4_000_000
const TEXTO_MAX = 200_000

/** Lê um arquivo do disco e o prepara como anexo. */
export async function readAttachment(path: string): Promise<Attachment | null> {
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size > ANEXO_MAX) return null

    const name = basename(path)
    const ext = extname(path).toLowerCase()
    const mediaType = IMAGEM[ext]

    if (mediaType) {
      const conteudo = await readFile(path)
      return {
        path,
        name,
        kind: 'image',
        data: conteudo.toString('base64'),
        mediaType,
        bytes: info.size,
      }
    }
    if (TEXTO.has(ext) && info.size <= TEXTO_MAX) {
      return {
        path,
        name,
        kind: 'text',
        data: await readFile(path, 'utf8'),
        mediaType: 'text/plain',
        bytes: info.size,
      }
    }
    return { path, name, kind: 'outro', data: '', mediaType: '', bytes: info.size }
  } catch {
    return null
  }
}

export function closeAgent(id: string): void {
  const vivo = agentes.get(id)
  if (!vivo) return
  vivo.processo.stdin?.end()
  vivo.processo.kill()
  agentes.delete(id)
  mudou()
}

/** Fechar o app não pode deixar processos do CLI órfãos. */
export function closeAllAgents(): void {
  for (const id of [...agentes.keys()]) closeAgent(id)
}
