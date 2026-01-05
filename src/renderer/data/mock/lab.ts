import type {
  AppsRepository,
  FilesRepository,
  LabRepository,
  PlayerRepository,
  ProjectsRepository,
} from '@/domain/repositories'
import type { FileEntry } from '@/domain/types'

/**
 * Espelho dos dados reais para quando não há Electron — é o caso dos
 * guarda-fidelidade, que rodam no navegador. Os valores são os do protótipo.
 */

export const mockLab: LabRepository = {
  host: async () => ({
    hostname: 'arasaka-01',
    cpuPercent: 34,
    // Doze leituras fixas: os gráficos das telas de teste precisam ser iguais
    // a cada rodada, e uma onda com relevo mostra que o traçado funciona.
    history: {
      cpu: [22, 31, 28, 45, 39, 52, 34, 61, 47, 38, 42, 34],
      memory: [33, 33, 34, 34, 34, 35, 35, 34, 34, 34, 34, 34],
      gpu: [12, 18, 40, 44, 61, 58, 72, 66, 49, 51, 46, 46],
      temperature: [39, 40, 40, 41, 43, 44, 44, 43, 42, 41, 41, 41],
    },
    memory: { usedMb: 11_264, totalMb: 32_768 },
    temperatureC: 41,
    network: { downMbs: 84, upMbs: 12 },
    uptimeDays: 62,
    dockerVersion: '27.1',
    gpu: {
      name: 'Exemplo GTX',
      usagePercent: 46,
      temperatureC: 58,
      memory: { usedMb: 4096, totalMb: 12_288 },
    },
  }),
  machines: async () => [
    {
      name: 'arasaka-01',
      role: 'Nó principal',
      cpuPercent: 34,
      memoryPercent: 62,
      temperatureC: 41,
      online: true,
    },
  ],
  monitors: async () => [
    { name: 'seafile', target: 'seafile.arasaka.io', up: true, latencyMs: 42, note: null },
    { name: 'jellyfin', target: 'jellyfin.local', up: true, latencyMs: 318, note: 'LATÊNCIA ALTA' },
    {
      name: 'backup-nightly',
      target: 'backup.arasaka.io',
      up: false,
      latencyMs: null,
      note: 'DOWN',
    },
  ],
  containers: async () => [
    {
      id: 'a1',
      name: 'seafile',
      image: 'seafileltd/seafile-mc',
      state: 'running',
      status: 'Up 62 days',
      ports: '8000',
    },
    {
      id: 'a2',
      name: 'jellyfin',
      image: 'jellyfin/jellyfin',
      state: 'running',
      status: 'Up 62 days',
      ports: '8096',
    },
    {
      id: 'a3',
      name: 'vaultwarden',
      image: 'vaultwarden/server',
      state: 'running',
      status: 'Up 62 days',
      ports: '8080',
    },
    {
      id: 'a4',
      name: 'adguard',
      image: 'adguard/adguardhome',
      state: 'running',
      status: 'Up 62 days',
      ports: '3000',
    },
    {
      id: 'a5',
      name: 'backup-nightly',
      image: 'restic/restic',
      state: 'exited',
      status: 'Exited (1) 2 hours ago',
      ports: '',
    },
  ],
}

/**
 * Uma arvorezinha em memória, não uma lista fixa.
 *
 * Navegar é o comportamento central da tela de Arquivos: se o mock devolvesse
 * sempre a mesma pasta, os testes não conseguiriam cobrar a navegação.
 */
const TREE: Record<string, FileEntry[]> = {
  '/home/halo': [
    entry('Projects', 'folder', { childCount: 2 }),
    entry('Media', 'folder', { childCount: 2 }),
    entry('render-final.mp4', 'video', { sizeBytes: 1_240_000_000 }),
    entry('press-kit.zip', 'archive', { sizeBytes: 86_000_000 }),
  ],
  '/home/halo/Projects': [
    entry('Projects/halo-one', 'folder', { childCount: 0 }),
    entry('Projects/drive-panel', 'folder', { childCount: 0 }),
  ],
  '/home/halo/Media': [
    entry('Media/trilha.flac', 'audio', { sizeBytes: 42_000_000 }),
    entry('Media/poster.png', 'image', { sizeBytes: 2_400_000 }),
  ],
}

function entry(
  relative: string,
  kind: FileEntry['kind'],
  extra: { sizeBytes?: number; childCount?: number },
): FileEntry {
  return {
    name: relative.split('/').at(-1) ?? relative,
    path: `/home/halo/${relative}`,
    kind,
    sizeBytes: extra.sizeBytes ?? null,
    modifiedAt: '2025-08-28T09:00:00Z',
    childCount: extra.childCount ?? null,
    owner: 'halo',
  }
}

export const mockFiles: FilesRepository = {
  list: async (path = '/home/halo') => ({
    path,
    parent: path === '/home/halo' ? null : path.split('/').slice(0, -1).join('/'),
    entries: TREE[path] ?? [],
  }),
  storage: async () => ({ totalBytes: 512e9, usedBytes: 318e9 }),
  mounts: async () => [
    {
      name: 'Sistema',
      path: '/',
      device: '/dev/sda2',
      fsType: 'ext4',
      usedBytes: 111e9,
      totalBytes: 234e9,
      isSystem: true,
    },
    {
      name: 'Projetos',
      path: '/media/halo/Projetos',
      device: '/dev/nvme1n1p1',
      fsType: 'ext4',
      usedBytes: 312e9,
      totalBytes: 1000e9,
      isSystem: false,
    },
    {
      name: 'Arquivo',
      path: '/media/halo/Arquivo',
      device: '/dev/sdc1',
      fsType: 'exfat',
      usedBytes: 1.4e12,
      totalBytes: 2e12,
      isSystem: false,
    },
  ],
  // Seis, e não três: com mais de quatro o carrossel ganha setas, e é isso que
  // os testes precisam exercitar.
  favorites: async () =>
    ['Documentos', 'Downloads', 'Imagens', 'Vídeos', 'Músicas', 'Projetos'].map((name) => ({
      name,
      path: `/home/halo/${name}`,
      kind: 'folder' as const,
    })),
}

/** O que o protótipo mostra tocando na home e na tela de Música. */
export const mockPlayer: PlayerRepository = {
  nowPlaying: async () => ({
    player: 'Halo',
    // Mock de player de música: o do Halo é de vídeo e leva a outra tela.
    isHalo: false,
    status: 'playing',
    title: 'Low Fog Over Pines',
    artist: 'Hana Vale',
    album: 'Northbound',
    artUrl: null,
    positionSec: 84,
    durationSec: 221,
  }),
}

/** Os projetos que o protótipo mostra. */
export const mockProjects: ProjectsRepository = {
  list: async () => [
    {
      name: 'halo-one',
      path: '/home/halo/projects/halo-one',
      branch: 'feat/spatial-feed',
      dirtyFiles: 3,
      insertions: 248,
      deletions: 96,
      lastCommit: 'ajusta o painel de vidro',
      lastCommitAt: '2025-08-28T06:40:00Z',
    },
    {
      name: 'drive-panel',
      path: '/home/halo/projects/drive-panel',
      branch: 'main',
      dirtyFiles: 0,
      insertions: 0,
      deletions: 0,
      lastCommit: 'revisa upload',
      lastCommitAt: '2025-08-27T19:10:00Z',
    },
    {
      name: 'halo-api',
      path: '/home/halo/projects/halo-api',
      branch: 'main',
      dirtyFiles: 1,
      insertions: 12,
      deletions: 4,
      lastCommit: 'corrige testes',
      lastCommitAt: '2025-08-26T12:00:00Z',
    },
  ],
  // Fora do Electron não há git de verdade; devolve um repositório plausível
  // para a tela ser exercitada com branch e contagem.
  info: async (path) => ({
    name: path.split('/').filter(Boolean).at(-1) ?? 'projeto',
    path,
    branch: 'main',
    dirtyFiles: 3,
    insertions: 42,
    deletions: 7,
    lastCommit: 'exemplo',
    lastCommitAt: new Date().toISOString(),
  }),
}

/** Os favoritos que o protótipo mostra na gaveta. */
export const mockApps: AppsRepository = {
  list: async () =>
    ['Terminal', 'Navegador', 'Código', 'Notas', 'Fotos', 'Ajustes'].map((name) => ({
      id: name,
      name,
      comment: null,
      categories: [],
    })),
  launch: async () => {},
}
