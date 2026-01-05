/** Aplicativo instalado, lido dos arquivos `.desktop`. */
export type DesktopApp = {
  /** Caminho do `.desktop` — é ele que abre o app. */
  id: string
  name: string
  comment: string | null
  categories: string[]
}
