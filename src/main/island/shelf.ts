import { existsSync } from 'node:fs'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { t } from '@shared/i18n'
import { IPC } from '@shared/ipc-contract'
import type { IslandEvent, ShelfItem } from '@shared/island'
import { app, type BrowserWindow } from 'electron'
import { currentSettings, saveIslandShelf } from '../settings'
import { announceToIslands, broadcastToIslands } from './window'

/**
 * A gaveta da ilha — o "file shelf" dos apps de notch do macOS.
 *
 * Três espécies de item, e a diferença importa:
 *
 * - **arquivo**: um arquivo do usuário. A gaveta guarda a REFERÊNCIA (o
 *   caminho), nunca cópia — copiar seria escrever arquivo do usuário, e a
 *   regra do projeto é que arquivos são somente leitura. O preço é honesto e
 *   está na tela: se o arquivo sumir do disco, o item aparece como perdido.
 * - **texto**: um trecho solto na pílula (seleção arrastada de outro app).
 *   Texto não tem dono no disco, então o app o salva NA PASTA DELE —
 *   `~/.local/share/halo-spatial-os/gaveta/` — como faz com os mascotes.
 *   Vira um arquivo de verdade, e por isso sai da gaveta por arrasto nativo.
 * - **url**: um endereço. Não há arquivo nenhum; abrir vai pro navegador.
 *
 * Tirar da gaveta apaga SÓ o que é do app (os trechos de texto, na pasta da
 * gaveta): apagar um arquivo do usuário está fora do alcance por desenho.
 *
 * A lista persiste em `settings.json` (`island.shelf`), escrita pelo main —
 * o mesmo regime de `desktop.position`.
 */

/**
 * Onde os trechos de texto vivem. É pasta do APP, nunca do usuário — o mesmo
 * teto dos mascotes (`~/.local/share/halo-spatial-os/`).
 */
const PASTA_TEXTOS = join(app.getPath('home'), '.local', 'share', 'halo-spatial-os', 'gaveta')

const eUrl = (path: string) => /^https?:\/\//.test(path)
/* Pelo DIRETÓRIO resolvido, não pelo prefixo do texto: `…/gaveta/../../x`
   começa com a pasta e aponta para fora dela — e `eTexto` é o que autoriza o
   `unlink` de `shelfRemove` e `shelfClear`. Um trecho de texto mora direto
   na pasta, nunca numa subpasta, então a igualdade basta. */
const eTexto = (path: string) => dirname(resolve(path)) === PASTA_TEXTOS

/** Um nome curto para mostrar: o host da URL, ou o nome do arquivo. */
function nomeDe(path: string): string {
  if (!eUrl(path)) return basename(path)
  try {
    const u = new URL(path)
    const resto = u.pathname === '/' ? '' : u.pathname
    return `${u.host}${resto}`.slice(0, 60)
  } catch {
    return path.slice(0, 60)
  }
}

function itens(): ShelfItem[] {
  return currentSettings().island.shelf.map((path) => ({
    path,
    name: nomeDe(path),
    exists: eUrl(path) ? true : existsSync(path),
    kind: eUrl(path) ? ('url' as const) : eTexto(path) ? ('texto' as const) : ('arquivo' as const),
  }))
}

export function shelfList(): ShelfItem[] {
  return itens()
}

function avisar(evento?: IslandEvent): void {
  broadcastToIslands(IPC.islandShelfChanged, itens())
  if (evento) announceToIslands(evento)
}

/**
 * Arquivos que chegaram por um arrasto de verdade há pouco (o preload conta,
 * ver `IPC.arrastoSolto`). Só eles entram na gaveta vindos da tela.
 */
const arrastados = new Map<string, number>()
const ARRASTO_VALE_MS = 60_000

export function registrarArrasto(caminhos: unknown): void {
  if (!Array.isArray(caminhos)) return
  const agora = Date.now()
  for (const [c, quando] of arrastados) if (agora - quando > ARRASTO_VALE_MS) arrastados.delete(c)
  for (const c of caminhos.slice(0, 200)) {
    if (typeof c === 'string' && c.startsWith('/')) arrastados.set(resolve(c), agora)
  }
}

/**
 * Guarda um arquivo do usuário (referência) ou um endereço http(s).
 *
 * `origem: 'tela'` é o pedido vindo do renderer: arquivo só entra se acabou de
 * ser arrastado de verdade. O main (a captura de tela nova) guarda direto.
 */
export function shelfAdd(bruto: string, origem: 'tela' | 'main' = 'tela'): void {
  if (eUrl(bruto)) {
    const path = bruto
    const atual = currentSettings().island.shelf
    if (atual.includes(path)) return
    saveIslandShelf([path, ...atual])
    avisar({ icon: 'Link', text: nomeDe(path), detail: t('guardado na gaveta'), level: 'ok' })
    return
  }
  if (!bruto.startsWith('/'))
    throw new Error(t('a gaveta só guarda caminhos absolutos ou endereços'))
  // Guarda o caminho já resolvido: `..` na lista seria um nome enganoso na
  // tela e um jeito de fingir que um arquivo de fora é trecho da gaveta.
  const path = resolve(bruto)
  if (!existsSync(path)) throw new Error(t('esse arquivo não existe'))
  if (origem === 'tela' && !arrastados.has(path)) {
    throw new Error(t('a gaveta só guarda arquivos arrastados para ela'))
  }
  const atual = currentSettings().island.shelf
  if (atual.includes(path)) return
  saveIslandShelf([path, ...atual])
  avisar({ icon: 'Tray', text: basename(path), detail: t('guardado na gaveta'), level: 'ok' })
}

/**
 * Guarda um trecho de texto: vira um arquivo na pasta da gaveta.
 *
 * O nome nasce das primeiras palavras — é o que se vê no chip — e um sufixo
 * de relógio evita colisão de dois trechos parecidos.
 */
export async function shelfAddText(texto: string): Promise<void> {
  const limpo = texto.trim()
  if (!limpo) throw new Error(t('nada para guardar'))
  const cabeca = limpo
    .slice(0, 32)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  const arquivo = join(PASTA_TEXTOS, `${cabeca || 'texto'}-${Date.now().toString(36)}.txt`)
  await mkdir(PASTA_TEXTOS, { recursive: true })
  await writeFile(arquivo, `${limpo}\n`, 'utf8')
  saveIslandShelf([arquivo, ...currentSettings().island.shelf])
  avisar({ icon: 'TextT', text: limpo.slice(0, 48), detail: t('guardado na gaveta'), level: 'ok' })
}

export function shelfRemove(path: string): void {
  const atual = currentSettings().island.shelf
  if (!atual.includes(path)) return
  saveIslandShelf(atual.filter((p) => p !== path))
  // Trecho de texto é do app: sai da gaveta, sai do disco. Arquivo do usuário
  // NUNCA é apagado — só a referência some.
  if (eTexto(path)) void unlink(path).catch(() => {})
  avisar()
}

export function shelfClear(): void {
  for (const path of currentSettings().island.shelf) {
    if (eTexto(path)) void unlink(path).catch(() => {})
  }
  saveIslandShelf([])
  avisar()
}

/**
 * Começa um arrasto nativo de um item da gaveta para fora do app.
 *
 * É o main que arrasta (`webContents.startDrag`): o renderer não alcança o
 * disco, e é assim que soltar no Dolphin ou num e-mail entrega o arquivo de
 * verdade. URL não tem arquivo, então não arrasta — ela abre.
 */
export async function shelfDragStart(win: BrowserWindow, path: string): Promise<void> {
  if (eUrl(path)) return
  if (!currentSettings().island.shelf.includes(path)) return
  const icon = await app.getFileIcon(path).catch(() => null)
  if (!icon) return
  win.webContents.startDrag({ file: path, icon })
}
