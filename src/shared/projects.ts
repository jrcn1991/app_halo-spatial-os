/** Projetos locais: repositórios git encontrados na pasta do usuário. */

export type Project = {
  name: string
  path: string
  branch: string
  /** Arquivos modificados não commitados. */
  dirtyFiles: number
  insertions: number
  deletions: number
  lastCommit: string
  lastCommitAt: string | null
}
