import { createConnection } from 'node:net'
import type { Monitor } from '@shared/lab'
import { containers } from './docker'

/**
 * Monitores de disponibilidade, no espírito do Uptime Kuma do handoff — só que
 * medindo os serviços que existem NESTA máquina.
 *
 * Cada container com porta publicada vira um monitor: abrimos um TCP na porta e
 * cronometramos. É o mesmo teste que um "está no ar?" faz, sem depender de
 * instalar o Kuma.
 */

const TIMEOUT_MS = 1500

/** "0.0.0.0:8080->80/tcp, :::8080->80/tcp" → 8080 */
function publishedPort(ports: string): number | null {
  const match = /(?:^|,\s*)[\d.:[\]*]*:(\d+)->/.exec(ports)
  return match?.[1] ? Number(match[1]) : null
}

function probe(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const started = Date.now()
    const socket = createConnection({ host: '127.0.0.1', port })
    const done = (latency: number | null) => {
      socket.destroy()
      resolve(latency)
    }

    socket.setTimeout(TIMEOUT_MS)
    socket.once('connect', () => done(Date.now() - started))
    socket.once('timeout', () => done(null))
    socket.once('error', () => done(null))
  })
}

export async function monitors(): Promise<Monitor[]> {
  const withPorts = (await containers())
    .map((c) => ({ container: c, port: publishedPort(c.ports) }))
    .filter((c): c is { container: (typeof c)['container']; port: number } => c.port !== null)

  return Promise.all(
    withPorts.map(async ({ container, port }) => {
      const latencyMs = await probe(port)
      return {
        name: container.name,
        target: `127.0.0.1:${port}`,
        up: latencyMs !== null,
        latencyMs,
        // O container pode estar de pé e a porta ainda não responder.
        note: container.state === 'running' ? null : container.status,
      }
    }),
  )
}
