/** Entidades do Home Lab. Compartilhadas: quem produz é o processo main. */

/**
 * As últimas leituras, da mais antiga para a mais nova — é o que os gráficos
 * dos medidores desenham. Cada lista guarda só as leituras que EXISTIRAM: sem
 * sensor de temperatura a lista fica vazia, em vez de cheia de zeros.
 */
export type HostHistory = {
  /** % de uso da CPU. */
  cpu: number[]
  /** % da memória em uso. */
  memory: number[]
  /** % de uso da placa de vídeo. */
  gpu: number[]
  /** °C do sensor principal. */
  temperature: number[]
}

/** Quantas leituras o histórico guarda: 40 a cada 3s dão dois minutos. */
export const HOST_HISTORY_MAX = 40

export type HostStats = {
  hostname: string
  cpuPercent: number
  /** O histórico recente, colhido pelo main a cada `AMOSTRA_MS`. */
  history: HostHistory

  memory: { usedMb: number; totalMb: number }
  temperatureC: number | null
  network: { downMbs: number; upMbs: number }
  uptimeDays: number
  dockerVersion: string | null
  /** A placa de vídeo, quando esta máquina tem uma que se deixe ler. */
  gpu: GpuStats | null
}

/**
 * A placa de vídeo.
 *
 * NULA quando não há como ler — e é por isso que ela é anulável, e não um
 * objeto de zeros: máquina com vídeo integrado, driver aberto sem contador de
 * uso, ou simplesmente sem `nvidia-smi` no PATH. A tela diz "sem leitura" em
 * vez de mostrar 0%, que é a mesma regra dos outros números daqui.
 */
export type GpuStats = {
  /** O modelo, como o driver o chama. */
  name: string
  usagePercent: number
  temperatureC: number | null
  memory: { usedMb: number; totalMb: number }
}

export type Machine = {
  name: string
  role: string
  cpuPercent: number
  memoryPercent: number
  temperatureC: number | null
  online: boolean
}

export type ContainerState = 'running' | 'restarting' | 'exited' | 'paused' | 'created'

export type Container = {
  id: string
  name: string
  image: string
  state: ContainerState
  /** Texto do Docker, ex.: "Up 43 hours". */
  status: string
  ports: string
}

export type Monitor = {
  name: string
  target: string
  up: boolean
  /** `null` quando não respondeu. */
  latencyMs: number | null
  note: string | null
}
