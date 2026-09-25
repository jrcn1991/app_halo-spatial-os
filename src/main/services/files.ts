import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { DirectoryListing, Favorite, FileEntry, Mount, StorageInfo } from '@shared/files'
import { marcar, t } from '@shared/i18n'

/**
 * Sistema de arquivos real.
 *
 * **Somente leitura.** Não existe aqui — nem no contrato de IPC — nenhuma
 * operação de escrita, remoção, renomeação ou execução. É essa ausência que
 * garante que navegar não corrompe nada; as permissões do sistema operacional
 * cuidam do resto (uma pasta sem acesso simplesmente falha ao listar).
 *
 * A navegação alcança os discos montados, e não só a pasta do usuário: um
 * gerenciador que não vê os discos não serve para o que foi pedido.
 */

const run = promisify(execFile)
const ROOT = homedir()

/** Caminho absoluto, sem `..` — a pasta pessoal é só o ponto de partida. */
function normalize(path?: string): string {
  return path ? resolve(path) : ROOT
}

function kindOf(name: string, directory: boolean): FileEntry['kind'] {
  if (directory) return 'folder'
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (['.mp4', '.mkv', '.mov', '.webm', '.avi'].includes(ext)) return 'video'
  if (['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg'].includes(ext)) return 'image'
  if (['.zip', '.tar', '.gz', '.xz', '.7z', '.rar'].includes(ext)) return 'archive'
  if (['.md', '.txt', '.pdf', '.doc', '.docx', '.odt'].includes(ext)) return 'document'
  if (['.mp3', '.flac', '.wav', '.ogg', '.m4a'].includes(ext)) return 'audio'
  return 'file'
}

export async function listDirectory(path?: string): Promise<DirectoryListing> {
  const dir = normalize(path)
  const entries = await readdir(dir, { withFileTypes: true })

  const files = await Promise.all(
    entries
      // Ocultos poluem a tela e não é um gerenciador de sistema.
      .filter((e) => !e.name.startsWith('.'))
      .map(async (e): Promise<FileEntry | null> => {
        try {
          const full = join(dir, e.name)
          const info = await stat(full)
          return {
            name: e.name,
            path: full,
            kind: kindOf(e.name, e.isDirectory()),
            sizeBytes: e.isDirectory() ? null : info.size,
            modifiedAt: info.mtime.toISOString(),
            childCount: e.isDirectory() ? await countChildren(full) : null,
            owner: info.uid === userInfo().uid ? userInfo().username : String(info.uid),
          }
        } catch {
          // Link quebrado ou sem permissão: some da lista.
          return null
        }
      }),
  )

  const visible = files.filter((f): f is FileEntry => f !== null)
  visible.sort((a, b) =>
    a.kind === b.kind || (a.kind === 'folder') === (b.kind === 'folder')
      ? a.name.localeCompare(b.name, 'pt-BR')
      : a.kind === 'folder'
        ? -1
        : 1,
  )

  return {
    path: dir,
    // A raiz do sistema não tem "acima".
    parent: dir === '/' ? null : resolve(dir, '..'),
    entries: visible,
  }
}

/** Só a contagem, sem `stat` por item: é o que a tela mostra e é barato. */
async function countChildren(dir: string): Promise<number | null> {
  try {
    const entries = await readdir(dir)
    return entries.filter((name) => !name.startsWith('.')).length
  } catch {
    return null
  }
}

/**
 * Atalhos do usuário. Lidos do `user-dirs.dirs` do XDG quando existe — é onde o
 * sistema guarda os nomes reais dessas pastas, que variam com o idioma.
 */
export async function favorites(): Promise<Favorite[]> {
  const wanted = [
    ['XDG_DOCUMENTS_DIR', marcar('Documentos')],
    ['XDG_DOWNLOAD_DIR', marcar('Downloads')],
    ['XDG_PICTURES_DIR', marcar('Imagens')],
    ['XDG_VIDEOS_DIR', marcar('Vídeos')],
    ['XDG_MUSIC_DIR', marcar('Música')],
  ] as const

  let config = ''
  try {
    config = await readFile(join(ROOT, '.config/user-dirs.dirs'), 'utf8')
  } catch {
    // Sem XDG: caímos nos nomes em inglês, que é o padrão do Linux.
  }

  const found: Favorite[] = []
  for (const [key, label] of wanted) {
    const raw = new RegExp(`^${key}="([^"]+)"`, 'm').exec(config)?.[1]
    const path = raw ? raw.replace('$HOME', ROOT) : join(ROOT, label)
    try {
      if ((await stat(path)).isDirectory()) found.push({ name: t(label), path, kind: 'folder' })
    } catch {
      // Pasta não existe nesta máquina: some da lista em vez de dar erro.
    }
  }
  return found
}

export async function storage(path?: string): Promise<StorageInfo> {
  const { stdout } = await run('df', ['-B1', '--output=size,used,target', normalize(path)])
  const [size = '0', used = '0'] = (stdout.split('\n')[1] ?? '').trim().split(/\s+/)
  return { totalBytes: Number(size), usedBytes: Number(used) }
}

/**
 * Discos montados.
 *
 * Vem do `lsblk`, que já traz rótulo e uso do sistema de arquivos — melhor que
 * ler `/proc/mounts` e depois chamar `df` para cada um. Partições de sistema
 * que não interessam a quem navega (`/boot`, snaps) ficam de fora.
 */
export async function mounts(): Promise<Mount[]> {
  type Node = {
    name: string
    label: string | null
    fstype: string | null
    mountpoint: string | null
    fssize: string | null
    fsused: string | null
    children?: Node[]
  }

  try {
    const { stdout } = await run('lsblk', [
      '--json',
      '--bytes',
      '-o',
      'NAME,LABEL,FSTYPE,MOUNTPOINT,FSSIZE,FSUSED',
    ])
    const tree = (JSON.parse(stdout) as { blockdevices: Node[] }).blockdevices

    const flat: Node[] = []
    const walk = (nodes: Node[]) => {
      for (const node of nodes) {
        flat.push(node)
        if (node.children) walk(node.children)
      }
    }
    walk(tree)

    return flat
      .filter((n) => n.mountpoint && n.fstype)
      .filter((n) => !ignored(n.mountpoint as string))
      .map((n) => ({
        name: n.mountpoint === '/' ? 'Sistema' : (n.label ?? basename(n.mountpoint as string)),
        path: n.mountpoint as string,
        device: `/dev/${n.name}`,
        fsType: n.fstype as string,
        usedBytes: n.fsused ? Number(n.fsused) : null,
        totalBytes: n.fssize ? Number(n.fssize) : null,
        isSystem: n.mountpoint === '/',
      }))
      .sort((a, b) => (a.isSystem ? -1 : b.isSystem ? 1 : a.name.localeCompare(b.name, 'pt-BR')))
  } catch {
    // Sem `lsblk`: a tela mostra só a pasta do usuário.
    return []
  }
}

/** Montagens que só poluem a lista de quem quer navegar. */
function ignored(mountpoint: string): boolean {
  return (
    mountpoint.startsWith('/boot') ||
    mountpoint.startsWith('/snap') ||
    mountpoint.startsWith('/var/snap')
  )
}
