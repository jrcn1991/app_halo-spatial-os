import { chmod, unlink } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import { join } from 'node:path'
import { t } from '@shared/i18n'
import { IPC } from '@shared/ipc-contract'
import type { IslandActivity, IslandEvent } from '@shared/island'
import { app } from 'electron'
import { announceToIslands, broadcastToIslands } from './window'

/**
 * A API local da ilha: atividades e avisos vindos de fora.
 *
 * O "Developer API" e o "Shell Activity" do Notchy num mecanismo só — e mais
 * seguro que o dele: em vez de uma porta TCP com token, um SOCKET UNIX em
 * `$XDG_RUNTIME_DIR/halo-ilha.sock`, com permissão 0600. Só processos do
 * próprio usuário alcançam o arquivo; nada entra pela rede. Quem publica:
 * o shell (`tools/ilha-shell.sh`, que o usuário carrega no `.zshrc` se
 * quiser — o app NUNCA escreve lá), os hooks do Claude Code, qualquer
 * script com `tools/ilha-avisar.sh`.
 *
 * Protocolo: uma linha JSON por mensagem, resposta `ok` ou `erro: motivo`.
 *
 *   {"tipo":"atividade","id":"build-1","titulo":"npm run build"}
 *   {"tipo":"atividade","id":"build-1","estado":"ok","detalhe":"12s"}
 *   {"tipo":"atividade","id":"cp","titulo":"copiando","progresso":0.4}
 *   {"tipo":"aviso","titulo":"Deploy pronto","detalhe":"produção","nivel":"ok"}
 *
 * Uma atividade em `andamento` mora na pílula; ao virar `ok`/`erro` ela é
 * anunciada e some da lista um minuto depois. Comandos rápidos não viram
 * anúncio: só o que durou 8 segundos ou mais, ou deu erro.
 */

const NOME = 'halo-ilha.sock'
const MAXIMO = 20
/** Quanto uma atividade terminada ainda fica na lista. */
const RESQUICIO_MS = 60_000
/** Um comando mais curto que isto não merece anúncio. */
const CURTO_MS = 8000
const LINHA_MAX = 16 * 1024

let servidor: Server | null = null
let caminho: string | null = null
const atividades = new Map<string, IslandActivity>()
let faxina: ReturnType<typeof setInterval> | undefined

export function caminhoDoSocket(): string {
  caminho ??= join(process.env.XDG_RUNTIME_DIR ?? app.getPath('temp'), NOME)
  return caminho
}

type Mensagem = {
  tipo?: unknown
  id?: unknown
  titulo?: unknown
  detalhe?: unknown
  estado?: unknown
  progresso?: unknown
  origem?: unknown
  nivel?: unknown
  icone?: unknown
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function publicar(): void {
  broadcastToIslands(IPC.islandAtividades, listaDeAtividades())
}

function tratar(m: Mensagem): void {
  if (m.tipo === 'aviso') {
    const titulo = texto(m.titulo, 120)
    if (!titulo) throw new Error('aviso sem título')
    const nivel = m.nivel === 'alerta' || m.nivel === 'erro' ? m.nivel : 'ok'
    announceToIslands({
      icon: texto(m.icone, 40) || (nivel === 'erro' ? 'WarningCircle' : 'Broadcast'),
      text: titulo,
      detail: texto(m.detalhe, 120),
      level: nivel,
      kind: 'aviso',
      ttlMs: 4500,
    })
    return
  }
  if (m.tipo !== 'atividade') throw new Error('tipo desconhecido (atividade ou aviso)')
  const id = texto(m.id, 80)
  if (!id) throw new Error('atividade sem id')
  const agora = Date.now()
  const antes = atividades.get(id)
  const estado =
    m.estado === 'ok' || m.estado === 'erro' || m.estado === 'andamento'
      ? m.estado
      : (antes?.state ?? 'andamento')
  const titulo = texto(m.titulo, 120) || antes?.title || id
  const progresso =
    typeof m.progresso === 'number' && Number.isFinite(m.progresso)
      ? Math.max(0, Math.min(1, m.progresso))
      : (antes?.progress ?? null)
  const atividade: IslandActivity = {
    id,
    title: titulo,
    detail: texto(m.detalhe, 160) || (antes?.detail ?? ''),
    state: estado,
    progress: progresso,
    source: texto(m.origem, 40) || antes?.source || 'script',
    startedAt: antes?.startedAt ?? agora,
    updatedAt: agora,
  }
  atividades.set(id, atividade)
  while (atividades.size > MAXIMO) {
    const primeira = atividades.keys().next().value
    if (primeira === undefined) break
    atividades.delete(primeira)
  }

  // Terminou: anuncia se valeu a pena — durou o bastante, ou deu errado.
  const durou = agora - atividade.startedAt
  if (
    estado !== 'andamento' &&
    antes?.state === 'andamento' &&
    (durou >= CURTO_MS || estado === 'erro')
  ) {
    const evento: IslandEvent = {
      icon: estado === 'ok' ? 'Check' : 'WarningCircle',
      text: atividade.title,
      detail: atividade.detail || (estado === 'ok' ? 'terminou' : 'falhou'),
      level: estado === 'ok' ? 'ok' : 'erro',
      kind: 'aviso',
      ttlMs: 4500,
    }
    announceToIslands(evento)
  }
  publicar()
}

function atender(socket: Socket): void {
  socket.setEncoding('utf8')
  let acumulado = ''
  socket.on('data', (pedaco: string) => {
    acumulado += pedaco
    if (acumulado.length > LINHA_MAX) {
      socket.end('erro: mensagem grande demais\n')
      return
    }
    const linhas = acumulado.split('\n')
    acumulado = linhas.pop() ?? ''
    for (const linha of linhas) {
      if (!linha.trim()) continue
      try {
        tratar(JSON.parse(linha) as Mensagem)
        socket.write('ok\n')
      } catch (erro) {
        socket.write(`erro: ${(erro as Error).message}\n`)
      }
    }
  })
  socket.on('error', () => {})
}

export async function startApi(): Promise<void> {
  if (servidor) return
  const arquivo = caminhoDoSocket()
  // Um socket antigo de um app que morreu sem limpar impediria o `listen`.
  await unlink(arquivo).catch(() => {})
  const s = createServer(atender)
  s.on('error', () => {})
  await new Promise<void>((resolve, reject) => {
    s.once('error', reject)
    // O arquivo tem de NASCER 0600. O `chmod` depois do `listen` deixava uma
    // fresta em que o socket existia com a permissão do umask — e, sem
    // `XDG_RUNTIME_DIR`, ele mora no `/tmp` de todo mundo. O `bind` acontece
    // dentro da chamada a `listen`, então o umask só precisa valer nela.
    const umaskAnterior = process.umask(0o177)
    try {
      s.listen(arquivo, () => {
        s.off('error', reject)
        resolve()
      })
    } finally {
      process.umask(umaskAnterior)
    }
  })
  // Rede de segurança, caso o umask não tenha valido (um `bind` adiado).
  await chmod(arquivo, 0o600).catch(() => {})
  servidor = s
  faxina = setInterval(() => {
    const agora = Date.now()
    let mudou = false
    for (const [id, a] of atividades) {
      if (a.state !== 'andamento' && agora - a.updatedAt > RESQUICIO_MS) {
        atividades.delete(id)
        mudou = true
      }
    }
    if (mudou) publicar()
  }, 10_000)
}

export async function stopApi(): Promise<void> {
  clearInterval(faxina)
  faxina = undefined
  const s = servidor
  servidor = null
  if (s) await new Promise<void>((resolve) => s.close(() => resolve()))
  if (caminho) await unlink(caminho).catch(() => {})
}

export const apiOuvindo = (): boolean => servidor?.listening ?? false

/** Mais recente primeiro; as em andamento na frente. */
export function listaDeAtividades(): IslandActivity[] {
  return [...atividades.values()].sort(
    (a, b) =>
      Number(b.state === 'andamento') - Number(a.state === 'andamento') ||
      b.updatedAt - a.updatedAt,
  )
}

export function limparAtividade(id: string): void {
  if (!atividades.delete(id)) throw new Error(t('essa atividade já não está na lista'))
  publicar()
}
