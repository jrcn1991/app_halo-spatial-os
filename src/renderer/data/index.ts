import type { Repositories } from '@/domain/repositories'
import { ipcAgents } from './ipc/agents'
import { ipcCatalog } from './ipc/catalog'
import { ipcCreative } from './ipc/creative'
import { ipcHomeFeed } from './ipc/home'
import { ipcApps, ipcFiles, ipcLab, ipcPlayer, ipcProjects } from './ipc/lab'
import { ipcNews } from './ipc/news'
import { ipcSpotify } from './ipc/spotify'
import { ipcWeather } from './ipc/weather'
import { mockAgents } from './mock/agents'
import { mockCatalog } from './mock/catalog'
import { mockCreative } from './mock/creative'
import { mockHomeFeed } from './mock/home'
import { mockApps, mockFiles, mockLab, mockPlayer, mockProjects } from './mock/lab'
import { mockNews } from './mock/news'
import { mockSpotify } from './mock/spotify'
import { mockWeather } from './mock/weather'

/**
 * De onde os dados vêm — o ponto único de virada.
 *
 * Dentro do Electron, os serviços reais (o main faz a busca). Fora dele, os
 * mocks: é assim que os guarda-fidelidade rodam no navegador comparando com o
 * protótipo, sem depender de rede nem do tempo que estiver fazendo lá fora.
 */
const inApp = typeof window !== 'undefined' && Boolean(window.halo)

export const repositories: Repositories = {
  weather: inApp ? ipcWeather : mockWeather,
  lab: inApp ? ipcLab : mockLab,
  files: inApp ? ipcFiles : mockFiles,
  player: inApp ? ipcPlayer : mockPlayer,
  projects: inApp ? ipcProjects : mockProjects,
  apps: inApp ? ipcApps : mockApps,
  // Sem fonte real nesta máquina: mock nos dois ambientes (ver MOCKS.md).
  // Dentro do app são as notificações do SISTEMA, pelo vigia do D-Bus da ilha;
  // fora dele, os exemplos do protótipo — ver `mock/home.ts`.
  homeFeed: inApp ? ipcHomeFeed : mockHomeFeed,
  // Dentro do app são os feeds do usuário; fora dele, exemplo etiquetado —
  // ver `mock/news.ts`.
  news: inApp ? ipcNews : mockNews,
  // Dentro do app, as fontes criativas e a biblioteca em disco; fora dele, uma
  // biblioteca em memória e nenhuma rede — ver `mock/creative.ts`.
  creative: inApp ? ipcCreative : mockCreative,
  catalog: inApp ? ipcCatalog : mockCatalog,
  agents: inApp ? ipcAgents : mockAgents,
  // Dentro do app é a conta do usuário (ou o estado honesto de "falta
  // configurar"); fora dele, exemplo etiquetado — ver `mock/spotify.ts`.
  spotify: inApp ? ipcSpotify : mockSpotify,
}
