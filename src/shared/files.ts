/** Entidades da tela de Arquivos. */

export type FileKind = 'folder' | 'video' | 'image' | 'audio' | 'archive' | 'document' | 'file'

export type FileEntry = {
  name: string
  path: string
  kind: FileKind
  /** `null` em pastas: somar o tamanho de uma pasta custa caro e não é usado. */
  sizeBytes: number | null
  modifiedAt: string
  /** Quantos itens a pasta tem. `null` fora de pastas ou sem permissão. */
  childCount: number | null
  owner: string
}

/** Pasta favoritada pelo usuário. */
export type Favorite = { name: string; path: string; kind: FileKind }

/**
 * Disco montado.
 *
 * `usedBytes`/`totalBytes` vêm do próprio `lsblk`; `null` quando o sistema não
 * informa (acontece em alguns sistemas de arquivo montados por FUSE).
 */
export type Mount = {
  /** Rótulo do disco quando existe; senão, o nome do ponto de montagem. */
  name: string
  path: string
  device: string
  fsType: string
  usedBytes: number | null
  totalBytes: number | null
  /** O disco onde o sistema está. */
  isSystem: boolean
}

export type DirectoryListing = {
  path: string
  parent: string | null
  entries: FileEntry[]
}

export type StorageInfo = { totalBytes: number; usedBytes: number }
