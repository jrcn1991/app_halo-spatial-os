import type {
  AppsRepository,
  FilesRepository,
  LabRepository,
  PlayerRepository,
  ProjectsRepository,
} from '@/domain/repositories'

/** Home Lab e Arquivos: dados desta máquina, lidos pelo processo main. */

export const ipcLab: LabRepository = {
  host: () => window.halo.lab.host(),
  machines: () => window.halo.lab.machines(),
  containers: () => window.halo.lab.containers(),
  monitors: () => window.halo.lab.monitors(),
}

export const ipcFiles: FilesRepository = {
  list: (path) => window.halo.files.list(path),
  storage: (path) => window.halo.files.storage(path),
  favorites: () => window.halo.files.favorites(),
  mounts: () => window.halo.files.mounts(),
}

export const ipcPlayer: PlayerRepository = {
  nowPlaying: () => window.halo.player.nowPlaying(),
}

export const ipcProjects: ProjectsRepository = {
  list: () => window.halo.projects.list(),
  info: (path) => window.halo.projects.info(path),
}

export const ipcApps: AppsRepository = {
  list: () => window.halo.apps.list(),
  launch: (id) => window.halo.apps.launch(id),
}
