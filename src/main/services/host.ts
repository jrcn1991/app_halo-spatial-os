import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { t } from '@shared/i18n'
import { HOST_HISTORY_MAX, type HostHistory, type HostStats, type Machine } from '@shared/lab'
import { gpuStats } from './gpu'

/**
 * Estado da máquina, lido direto do /proc e /sys — sem dependência externa.
 *
 * CPU precisa de duas amostras: /proc/stat dá contadores acumulados desde o
 * boot, então a porcentagem só existe entre duas leituras.
 *
 * ## O histórico é colhido AQUI, e num ritmo só
 *
 * Os medidores da home podem mostrar o gráfico das últimas leituras (como na
 * referência do City Pop). O histórico mora no main, e não na tela, por
 * dois motivos medidos no desenho:
 *
 * - a tela remonta a cada troca de aba, e um histórico guardado nela nasceria
 *   vazio toda vez que a home voltasse;
 * - a CPU é diferença entre duas leituras, e a leitura guarda a anterior num
 *   módulo só. Se a tela e um amostrador lessem os dois, uma leitura logo
 *   depois da outra veria um intervalo de milissegundos e devolveria lixo.
 *
 * Por isso existe UM amostrador (`iniciarHistorico`), e enquanto ele roda
 * `hostStats()` devolve a última amostra em vez de ler de novo. Fora do app
 * — nos testes, que chamam o serviço direto — ele não roda, e cada chamada lê
 * na hora, como antes.
 */

/** Intervalo do amostrador. É o mesmo ritmo em que a home pedia antes. */
export const AMOSTRA_MS = 3000

const historico: HostHistory = { cpu: [], memory: [], gpu: [], temperature: [] }
let ultima: HostStats | null = null
let amostrador: NodeJS.Timeout | null = null

function guardar(lista: number[], valor: number | null) {
  if (valor == null || !Number.isFinite(valor)) return
  lista.push(Math.round(valor))
  if (lista.length > HOST_HISTORY_MAX) lista.splice(0, lista.length - HOST_HISTORY_MAX)
}

/** Liga o amostrador. Idempotente: a segunda chamada não cria outro. */
export function iniciarHistorico() {
  if (amostrador) return
  const colher = () => {
    void lerHost().catch(() => undefined)
  }
  amostrador = setInterval(colher, AMOSTRA_MS)
  amostrador.unref?.()
  colher()
}

const run = promisify(execFile)

type CpuSample = { idle: number; total: number }
let previous: CpuSample | null = null

async function cpuSample(): Promise<CpuSample> {
  const line = (await readFile('/proc/stat', 'utf8')).split('\n')[0] ?? ''
  const values = line.split(/\s+/).slice(1).map(Number)
  const idle = (values[3] ?? 0) + (values[4] ?? 0)
  return { idle, total: values.reduce((sum, v) => sum + (v || 0), 0) }
}

/** Nula na primeira leitura: sem intervalo não há porcentagem, e 0 seria mentira. */
async function cpuPercent(): Promise<number | null> {
  const now = await cpuSample()
  const before = previous
  previous = now
  if (!before) return null

  const total = now.total - before.total
  const idle = now.idle - before.idle
  return total > 0 ? Math.max(0, Math.min(100, ((total - idle) / total) * 100)) : 0
}

async function memory(): Promise<{ usedMb: number; totalMb: number }> {
  const text = await readFile('/proc/meminfo', 'utf8')
  const field = (name: string) =>
    Number(new RegExp(`^${name}:\\s+(\\d+)`, 'm').exec(text)?.[1] ?? 0) / 1024
  const total = field('MemTotal')
  return { usedMb: Math.round(total - field('MemAvailable')), totalMb: Math.round(total) }
}

async function temperature(): Promise<number | null> {
  try {
    const raw = await readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8')
    return Math.round(Number(raw) / 1000)
  } catch {
    return null
  }
}

/** Vazão da rede: como a CPU, é diferença entre duas leituras. */
let previousNet: { at: number; rx: number; tx: number } | null = null

async function network(): Promise<{ downMbs: number; upMbs: number }> {
  const text = await readFile('/proc/net/dev', 'utf8')
  let rx = 0
  let tx = 0
  for (const line of text.split('\n').slice(2)) {
    const [name, rest] = line.split(':')
    if (!rest || name?.trim() === 'lo') continue
    const values = rest.trim().split(/\s+/).map(Number)
    rx += values[0] ?? 0
    tx += values[8] ?? 0
  }

  const now = { at: Date.now(), rx, tx }
  const before = previousNet
  previousNet = now
  if (!before) return { downMbs: 0, upMbs: 0 }

  const seconds = (now.at - before.at) / 1000 || 1
  const toMbs = (bytes: number) => Math.max(0, bytes / seconds / 1e6)
  return { downMbs: toMbs(rx - before.rx), upMbs: toMbs(tx - before.tx) }
}

async function uptimeDays(): Promise<number> {
  const seconds = Number((await readFile('/proc/uptime', 'utf8')).split(' ')[0] ?? 0)
  return Math.floor(seconds / 86400)
}

/**
 * A versão do Docker muda quando o Docker é atualizado — não a cada 3s. Um
 * processo `docker version` por amostra era o custo mais bobo do amostrador
 * (MEDIDO em 05/09/2026: ~16ms de parede e um fork do Electron a cada 3s).
 * Uma leitura por minuto basta, e a primeira vem na hora.
 */
const DOCKER_VERSAO_MS = 60_000
let dockerCache: { at: number; valor: string | null } | null = null

async function dockerVersion(): Promise<string | null> {
  if (dockerCache && Date.now() - dockerCache.at < DOCKER_VERSAO_MS) return dockerCache.valor
  let valor: string | null = null
  try {
    const { stdout } = await run('docker', ['version', '--format', '{{.Server.Version}}'])
    valor = stdout.trim() || null
  } catch {
    valor = null
  }
  dockerCache = { at: Date.now(), valor }
  return valor
}

/** A leitura completa. Grava o histórico e vira a "última". */
async function lerHost(): Promise<HostStats> {
  const [cpu, mem, temp, net, uptime, docker, gpu] = await Promise.all([
    cpuPercent(),
    memory(),
    temperature(),
    network(),
    uptimeDays(),
    dockerVersion(),
    gpuStats(),
  ])

  guardar(historico.cpu, cpu)
  guardar(historico.memory, mem.totalMb > 0 ? (mem.usedMb / mem.totalMb) * 100 : null)
  guardar(historico.gpu, gpu?.usagePercent ?? null)
  guardar(historico.temperature, temp)

  ultima = {
    hostname: (await readFile('/proc/sys/kernel/hostname', 'utf8')).trim(),
    cpuPercent: Math.round(cpu ?? 0),
    // Cópias: o renderer recebe um retrato, e o histórico continua crescendo.
    history: {
      cpu: [...historico.cpu],
      memory: [...historico.memory],
      gpu: [...historico.gpu],
      temperature: [...historico.temperature],
    },
    memory: mem,
    temperatureC: temp,
    network: net,
    uptimeDays: uptime,
    dockerVersion: docker,
    gpu,
  }
  return ultima
}

/**
 * O estado da máquina. Com o amostrador de pé, é a última amostra (no máximo
 * `AMOSTRA_MS` atrás); sem ele, lê na hora.
 */
export async function hostStats(): Promise<HostStats> {
  if (amostrador && ultima) return ultima
  return lerHost()
}

/**
 * O carrossel de máquinas do handoff mostra três nós. Aqui só existe uma
 * máquina de verdade — esta —, então é ela que aparece.
 */
export async function machines(): Promise<Machine[]> {
  const stats = await hostStats()
  return [
    {
      name: stats.hostname,
      role: t('Esta máquina'),
      cpuPercent: stats.cpuPercent,
      memoryPercent: Math.round((stats.memory.usedMb / stats.memory.totalMb) * 100),
      temperatureC: stats.temperatureC,
      online: true,
    },
  ]
}
