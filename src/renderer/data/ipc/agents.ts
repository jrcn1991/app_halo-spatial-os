import type { AgentsRepository } from '@/domain/repositories'

/** Agentes do Claude: processos vivos no main. */
export const ipcAgents: AgentsRepository = {
  list: () => window.halo.agents.list(),
  create: (project, resume) => window.halo.agents.create(project, resume),
  send: (id, text, attachments) => window.halo.agents.send(id, text, attachments),
  sessions: (project) => window.halo.agents.sessions(project),
  attach: () => window.halo.agents.attach(),
  attachPaths: (paths) => window.halo.agents.attachPaths(paths),
  close: (id) => window.halo.agents.close(id),
  messages: (id) => window.halo.agents.messages(id),
  onChanged: (handler) => window.halo.agents.onChanged(handler),
}
