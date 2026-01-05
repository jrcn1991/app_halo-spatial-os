import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GpuStats } from '@shared/lab'

/**
 * A placa de vídeo, pelo utilitário do próprio driver.
 *
 * Só NVIDIA por enquanto, e isso é honestidade e não preguiça: `nvidia-smi`
 * vem com o driver proprietário e responde uso, temperatura e memória num
 * comando só. Não há equivalente universal — o `gpu_busy_percent` da AMD mora
 * sob `/sys/class/drm/`, o Intel precisa de `intel_gpu_top` com privilégio, e
 * inventar um número para eles seria pior que não mostrar.
 * Máquina sem leitura devolve `null`, e a tela DIZ que não leu.
 *
 * O formato de saída é fixado no pedido (`--query-gpu` + `--format=csv`), o que
 * torna o parse uma divisão por vírgula. `noheader` e `nounits` tiram as duas
 * coisas que atrapalhariam isso.
 */

const run = promisify(execFile)

/** O `nvidia-smi` responde em ~40ms com o driver carregado; 2s é folga larga. */
const TIMEOUT_MS = 2000

/**
 * Quanto tempo uma leitura vale.
 *
 * A home pede o estado da máquina a cada poucos segundos, e disparar um
 * processo a cada pedido custaria mais que o dado vale. O uso da GPU muda
 * rápido, então a janela é curta — só o bastante para várias telas pedindo ao
 * mesmo tempo dividirem uma leitura.
 */
const CACHE_MS = 1500

let cache: { at: number; valor: GpuStats | null } | null = null

export async function gpuStats(): Promise<GpuStats | null> {
  const agora = Date.now()
  if (cache && agora - cache.at < CACHE_MS) return cache.valor

  const valor = await ler()
  cache = { at: agora, valor }
  return valor
}

async function ler(): Promise<GpuStats | null> {
  try {
    const { stdout } = await run(
      'nvidia-smi',
      [
        '--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total',
        '--format=csv,noheader,nounits',
      ],
      { timeout: TIMEOUT_MS },
    )

    // Só a primeira placa: a home tem espaço para um cartão, e máquina com duas
    // é caso raro o bastante para não valer uma lista aqui.
    const linha = stdout.split('\n')[0]
    if (!linha) return null

    const [name, uso, temp, usada, total] = linha.split(',').map((c) => c.trim())
    if (!name) return null

    // `nvidia-smi` escreve "[N/A]" no lugar do número quando o driver não
    // expõe aquele campo — e `Number('[N/A]')` é NaN, que viraria "NaN%" na
    // tela. Cada campo é conferido antes de entrar.
    const numero = (v: string | undefined): number | null => {
      const n = Number(v)
      return v !== undefined && v !== '' && Number.isFinite(n) ? n : null
    }

    return {
      name,
      usagePercent: numero(uso) ?? 0,
      temperatureC: numero(temp),
      memory: { usedMb: numero(usada) ?? 0, totalMb: numero(total) ?? 0 },
    }
  } catch {
    // Sem driver, sem `nvidia-smi` no PATH, ou placa que não responde.
    return null
  }
}
