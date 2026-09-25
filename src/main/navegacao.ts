import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WebContents } from 'electron'

/**
 * A trava de navegação das janelas do app.
 *
 * Toda janela nossa carrega uma página NOSSA — o bundle em `out/renderer`, ou
 * o servidor do electron-vite em desenvolvimento — e tem preload, isto é, uma
 * ponte para o main. Se ela navegasse para outro endereço (um link solto num
 * texto vindo de fora, um `location =` num conteúdo renderizado), a página
 * de lá herdaria a janela e, com ela, a ponte. Por isso nenhuma janela do app
 * sai da própria origem, e nenhuma abre janela nova.
 *
 * As janelas da Social Arte (`services/creative/navegador.ts`) NÃO passam por
 * aqui: navegar é o trabalho delas, e é por isso que elas nascem sem preload.
 */

/** A pasta das páginas empacotadas — o mesmo lugar de onde `loadFile` as tira. */
const PAGINAS = join(import.meta.dirname, '../renderer')

/** Se o endereço é uma página do próprio app. */
export function paginaDoApp(url: string): boolean {
  let alvo: URL
  try {
    alvo = new URL(url)
  } catch {
    return false
  }
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    try {
      return alvo.origin === new URL(devUrl).origin
    } catch {
      return false
    }
  }
  if (alvo.protocol !== 'file:') return false
  return fileURLToPath(alvo).startsWith(PAGINAS + sep)
}

/**
 * Prende a janela na origem do app e nega janela nova.
 *
 * `aoAbrir` recebe o endereço que a página tentou abrir em janela nova — é
 * como a janela principal manda link externo para o navegador do sistema. A
 * janela nova em si é sempre negada.
 */
export function travarNavegacao(contents: WebContents, aoAbrir?: (url: string) => void): void {
  // Só o quadro principal: é ele que carrega a ponte (o preload não entra em
  // iframe). Um redirecionamento de subquadro não troca a página da janela.
  const barrar = (evento: { preventDefault(): void; url: string; isMainFrame: boolean }) => {
    if (evento.isMainFrame && !paginaDoApp(evento.url)) evento.preventDefault()
  }
  contents.on('will-navigate', barrar)
  contents.on('will-redirect', barrar)
  contents.setWindowOpenHandler(({ url }) => {
    aoAbrir?.(url)
    return { action: 'deny' }
  })
}
