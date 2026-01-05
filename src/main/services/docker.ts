import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Container, ContainerState } from '@shared/lab'

/**
 * Containers reais, pelo CLI do Docker.
 *
 * Pelo CLI e não pelo socket de propósito: é o mesmo caminho que o usuário já
 * usa, respeita o contexto e as permissões dele, e não exige biblioteca nova.
 * Se o Docker não estiver instalado ou o daemon estiver parado, a lista volta
 * vazia em vez de derrubar a tela.
 */

const run = promisify(execFile)
const FORMAT = '{{json .}}'

type DockerPs = {
  ID: string
  Names: string
  Image: string
  State: string
  Status: string
  Ports: string
}

function toState(raw: string): ContainerState {
  switch (raw) {
    case 'running':
    case 'restarting':
    case 'paused':
    case 'created':
      return raw
    default:
      return 'exited'
  }
}

export async function containers(): Promise<Container[]> {
  try {
    const { stdout } = await run('docker', ['ps', '-a', '--no-trunc', '--format', FORMAT], {
      maxBuffer: 4 * 1024 * 1024,
    })

    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as DockerPs)
      .map((c) => ({
        id: c.ID.slice(0, 12),
        name: c.Names,
        image: c.Image,
        state: toState(c.State),
        status: c.Status,
        ports: c.Ports,
      }))
  } catch {
    // Docker ausente ou parado: o painel mostra "sem containers".
    return []
  }
}
