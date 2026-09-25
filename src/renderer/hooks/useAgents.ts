import type { Agent, AgentMessage, AgentSession, Attachment } from '@shared/agents'
import { useCallback, useEffect, useState } from 'react'
import { repositories } from '@/data'
import type { AgentsRepository } from '@/domain/repositories'

/**
 * Os agentes vivos e o que eles disseram.
 *
 * Diferente dos outros hooks, este não busca de tempos em tempos: o main
 * empurra a lista a cada mudança de estado, e é isso que faz o indicador de
 * status acompanhar o agente em vez de piscar atrasado.
 */
export function useAgents(): {
  agents: Agent[]
  create: (project: string, resume?: string) => Promise<Agent>
  send: (id: string, text: string, attachments?: Attachment[]) => void
  close: (id: string) => void
  attach: () => Promise<Attachment[]>
  attachPaths: (paths: string[]) => Promise<Attachment[]>
} {
  const [agents, setAgents] = useState<Agent[]>([])

  useEffect(() => {
    let vivo = true
    void repositories.agents.list().then((lista) => vivo && setAgents(lista))
    const cancelar = repositories.agents.onChanged(setAgents)
    return () => {
      vivo = false
      cancelar()
    }
  }, [])

  return {
    agents,
    create: useCallback(
      (project: string, resume?: string) => repositories.agents.create(project, resume),
      [],
    ),
    send: useCallback(
      (id: string, text: string, attachments?: Attachment[]) =>
        repositories.agents.send(id, text, attachments),
      [],
    ),
    close: useCallback((id: string) => repositories.agents.close(id), []),
    attach: useCallback(() => repositories.agents.attach(), []),
    attachPaths: useCallback((paths: string[]) => repositories.agents.attachPaths(paths), []),
  }
}

/**
 * A conversa de um agente.
 *
 * Rebusca a cada mudança de estado dele: é quando chega mensagem nova. Assim a
 * transcrição não precisa de um canal próprio, e o main continua sendo o dono
 * do histórico.
 */
export function useAgentMessages(id: string | null, marca: unknown): AgentMessage[] {
  const [messages, setMessages] = useState<AgentMessage[]>([])

  // `marca` é dependência de propósito: ela muda a cada evento do agente, e é
  // o que faz a transcrição ser rebuscada. O Biome a vê como supérflua porque
  // o corpo não a lê — mas é justamente esse o papel dela.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ver acima
  useEffect(() => {
    if (!id) {
      setMessages([])
      return
    }
    let vivo = true
    void repositories.agents.messages(id).then((lista) => vivo && setMessages(lista))
    return () => {
      vivo = false
    }
  }, [id, marca])

  return messages
}

/** As conversas antigas de um projeto. Busca só quando alguém pede. */
export function useSessions(project: string | null): AgentSession[] {
  const [sessions, setSessions] = useState<AgentSession[]>([])

  useEffect(() => {
    if (!project) {
      setSessions([])
      return
    }
    let vivo = true
    void repositories.agents.sessions(project).then((lista) => vivo && setSessions(lista))
    return () => {
      vivo = false
    }
  }, [project])

  return sessions
}

/**
 * Os seletores e o "abrir a pasta" da tela do Claude e de Configurações.
 * Separado de `useAgents` para quem só precisa disto não assinar a lista.
 */
export function useAgentTools(): Pick<
  AgentsRepository,
  'addProject' | 'openProject' | 'chooseCli'
> {
  return repositories.agents
}
