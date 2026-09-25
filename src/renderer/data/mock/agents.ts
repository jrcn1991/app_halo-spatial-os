import type { Agent, AgentMessage } from '@shared/agents'
import type { AgentsRepository } from '@/domain/repositories'

/**
 * Agentes de mentira, para fora do Electron.
 *
 * Não há CLI do Claude no navegador, e os guarda-telas precisam de algo para
 * desenhar. Ele responde de verdade ao criar e ao mandar mensagem — só não há
 * ninguém do outro lado.
 */

let agentes: Agent[] = []
const mensagens = new Map<string, AgentMessage[]>()
const ouvintes = new Set<(agents: Agent[]) => void>()

const avisar = () => {
  for (const ouvinte of ouvintes) ouvinte([...agentes])
}

export const mockAgents: AgentsRepository = {
  list: async () => [...agentes],
  create: async (project) => {
    const id = `mock-${agentes.length + 1}`
    const agente: Agent = {
      id,
      project,
      name: project.split('/').filter(Boolean).at(-1) ?? 'projeto',
      state: 'ocioso',
      sessionId: `sessao-${id}`,
      activity: '',
      turns: 0,
      lastAt: Date.now(),
      error: null,
    }
    agentes = [...agentes, agente]
    mensagens.set(id, [
      {
        id: `${id}-1`,
        role: 'system',
        text: 'Agente de exemplo (fora do Electron).',
        at: Date.now(),
      },
    ])
    avisar()
    return agente
  },
  sessions: async () => [
    {
      id: 'sessao-exemplo',
      title: 'Conversa de exemplo (fora do Electron)',
      at: new Date().toISOString(),
      messages: 8,
    },
  ],
  attach: async () => [],
  attachPaths: async () => [],
  send: (id, text) => {
    const lista = mensagens.get(id) ?? []
    mensagens.set(id, [
      ...lista,
      { id: `${id}-u${lista.length}`, role: 'user', text, at: Date.now() },
      {
        id: `${id}-a${lista.length}`,
        role: 'assistant',
        text:
          'Sem CLI aqui — esta resposta é de exemplo, com `código` e um bloco:\n\n' +
          '```ts\nexport const soma = (a: number, b: number) => a + b\n```',
        at: Date.now(),
      },
    ])
    agentes = agentes.map((a) => (a.id === id ? { ...a, turns: a.turns + 1 } : a))
    avisar()
  },
  close: (id) => {
    agentes = agentes.filter((a) => a.id !== id)
    mensagens.delete(id)
    avisar()
  },
  messages: async (id) => mensagens.get(id) ?? [],
  onChanged: (handler) => {
    ouvintes.add(handler)
    return () => ouvintes.delete(handler)
  },
  // Sem seletor nem gerenciador de arquivos no navegador: cancelar e "não abriu".
  addProject: async () => null,
  openProject: async () => false,
  chooseCli: async () => null,
}
