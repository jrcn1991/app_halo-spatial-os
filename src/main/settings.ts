import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Progress } from '@shared/media'
import {
  DEFAULT_SETTINGS,
  type HaloSettings,
  parseSettings,
  RECENTES_MAX,
  type RecenteDoLancador,
} from '@shared/settings'
import { app } from 'electron'

/**
 * Configurações em disco: um JSON em `userData`.
 *
 * Não é `localStorage` porque o main precisa delas antes de a janela existir —
 * é ele quem aplica o tamanho salvo, e sem isso a janela abriria no padrão e
 * pularia. Além disso o arquivo é inspecionável, editável à mão e sobrevive à
 * limpeza de dados do navegador embutido.
 */

const FILE = () => join(app.getPath('userData'), 'settings.json')
/** Escrever a cada tecla do slider seria absurdo; junta as mudanças. */
const DEBOUNCE_MS = 400

let pending: NodeJS.Timeout | undefined
/**
 * O estado que vale, já lido do disco.
 *
 * Existe porque nem tudo vem do renderer: `desktop.position` é escrita aqui,
 * conforme a janela é arrastada. Sem esta cópia, o próximo salvamento vindo do
 * renderer — que só conhece as configurações do arranque — devolveria a janela
 * para onde ela estava quando o app abriu.
 */
let current: HaloSettings | undefined
/** Marca que há mudança esperando o debounce. */
let dirty = false
/** O arquivo não existia no arranque: é a primeira vez que o app abre aqui. */
let primeira = false

export function readSettings(): HaloSettings {
  try {
    current = parseSettings(JSON.parse(readFileSync(FILE(), 'utf8')))
    return current
  } catch (error) {
    // Ausente na primeira execução; corrompido é caso de recomeçar no padrão.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[halo] settings.json ilegível, usando o padrão: ${(error as Error).message}`)
    } else {
      primeira = true
    }
    current = DEFAULT_SETTINGS
    return current
  }
}

/**
 * É a primeira abertura nesta máquina? Só quando o arquivo AUSENTE — um
 * arquivo corrompido é de quem já usou o app, e esse sabe onde ele mora.
 */
export const primeiraAbertura = (): boolean => primeira

/**
 * Grava o padrão já no arranque da primeira abertura. Sem isto o arquivo só
 * nasceria no primeiro ajuste, e toda abertura até lá contaria como
 * "primeira" — o app nunca obedeceria o `startHidden`.
 */
export function gravarPadrao(): void {
  if (primeira) schedule()
}

/** Escrita atômica: um arquivo pela metade seria pior que nenhum. */
function flush(): void {
  if (!dirty || !current) return
  const file = FILE()
  const temp = `${file}.tmp`
  try {
    writeFileSync(temp, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
    renameSync(temp, file)
  } catch (error) {
    console.warn(`[halo] não consegui salvar as configurações: ${(error as Error).message}`)
  }
  dirty = false
}

function schedule(): void {
  dirty = true
  clearTimeout(pending)
  pending = setTimeout(flush, DEBOUNCE_MS)
}

/**
 * Salva o que veio do renderer, preservando o que é do main.
 *
 * SÃO NOVE campos, e a contagem importa: este comentário dizia "dois" desde
 * que os dois primeiros entraram, e é dele que o próximo autor tira a
 * impressão de que a lista é curta. Cada um é escrito AQUI, pelo main, e o
 * renderer conhece só o que veio no arranque — aceitar a cópia dele apagaria
 * o campo no primeiro ajuste de tela feito depois:
 *
 *   1. `desktop.position`     a janela, ao ser arrastada
 *   2. `media.recent`         o player, enquanto avança
 *   3. `music.spotifyRefreshToken`  o consentimento OAuth
 *   4. `seafile.token`        o login do Seafile
 *   5. `island.shelf`         a gaveta, conforme arquivos são soltos na gota
 *   6. `island.note`          a nota rápida da ilha
 *   7. `island.focus`         as sessões de foco, quando um temporizador acaba
 *   8. `launcher.recentes`    o que o lançador executou, a cada execução
 *   9. `launcher.position`    onde o usuário deixou a janela do lançador
 *
 * Campo novo que o main escreva sozinho entra nesta lista, nesta contagem, e
 * no `??` abaixo. Esquecer é apagar dado do usuário em silêncio.
 */
export function saveSettings(input: unknown): void {
  const next = parseSettings(input)
  const position = current?.desktop.position ?? next.desktop.position
  const recent = current?.media.recent ?? next.media.recent
  // Terceiro campo com o mesmo problema: o refresh token do Spotify nasce do
  // consentimento OAuth, que acontece aqui no main. O renderer conhece só o
  // que veio no arranque; aceitar a cópia dele desconectaria a conta no
  // primeiro ajuste de tela feito depois de conectar.
  const spotifyRefreshToken = current?.music.spotifyRefreshToken ?? next.music.spotifyRefreshToken
  // E o quarto: o token do Seafile nasce de um login feito aqui.
  const seafileToken = current?.seafile.token ?? next.seafile.token
  // Quinto: a gaveta da ilha é escrita aqui conforme arquivos são soltos na
  // gota. O renderer das configurações não a acompanha; aceitar a cópia dele
  // esvaziaria a gaveta no primeiro ajuste de tela.
  const shelf = current?.island.shelf ?? next.island.shelf
  // Sexto: a nota rápida da ilha, pelo mesmo motivo da gaveta.
  const note = current?.island.note ?? next.island.note
  // Sétimo: as sessões de foco, escritas aqui quando um temporizador acaba.
  // A cópia do renderer apagaria o histórico no primeiro ajuste de tela.
  const focus = current?.island.focus ?? next.island.focus
  // Oitavo: os recentes do lançador, escritos aqui a cada execução (as duas
  // carcaças mandam o uso por IPC). A cópia do renderer os apagaria.
  const recentes = current?.launcher.recentes ?? next.launcher.recentes
  // Nono: a posição do lançador, escrita aqui ao fim de um arrasto.
  const posicaoDoLancador = current?.launcher.position ?? next.launcher.position
  current = {
    ...next,
    desktop: { ...next.desktop, position },
    media: { ...next.media, recent },
    music: { ...next.music, spotifyRefreshToken },
    seafile: { ...next.seafile, token: seafileToken },
    island: { ...next.island, shelf, note, focus },
    launcher: {
      ...next.launcher,
      recentes,
      ...(posicaoDoLancador ? { position: posicaoDoLancador } : {}),
    },
  }
  schedule()
}

/** O usuário arrastou a janela do lançador. Só o main escreve isto. */
export function saveLauncherPosition(position: { dx: number; dy: number }): void {
  if (!current) return
  current = { ...current, launcher: { ...current.launcher, position } }
  schedule()
}

/**
 * O lançador executou algo. Só o main escreve isto.
 *
 * Frequência com recência: `n` cresce a cada uso e `at` marca o último; quem
 * ordena (o motor) combina os dois, para o que foi usado ontem dez vezes não
 * ficar para sempre acima do que foi usado agora. A lista tem teto
 * (`RECENTES_MAX`) e, cheia, perde o mais antigo.
 */
export function saveLauncherUso(uso: Omit<RecenteDoLancador, 'n' | 'at'>): void {
  if (!current) return
  const agora = Date.now()
  const lista = current.launcher.recentes.filter((r) => r.chave !== uso.chave)
  const antes = current.launcher.recentes.find((r) => r.chave === uso.chave)
  lista.unshift({ ...uso, n: (antes?.n ?? 0) + 1, at: agora })
  current = {
    ...current,
    launcher: { ...current.launcher, recentes: lista.slice(0, RECENTES_MAX) },
  }
  schedule()
}

/** Uma sessão de foco acabou. Só o main escreve isto (ver `island/foco.ts`). */
export function saveIslandFocus(focus: HaloSettings['island']['focus']): void {
  if (!current) return
  current = { ...current, island: { ...current.island, focus: focus.slice(-400) } }
  schedule()
}

/** A nota rápida da ilha mudou. Só o main escreve isto, pela ação `nota-salvar`. */
export function saveIslandNote(note: string): void {
  if (!current) return
  current = { ...current, island: { ...current.island, note: note.slice(0, 4000) } }
  schedule()
}

/** A gaveta da ilha mudou. Só o main escreve isto, via ações da ilha. */
export function saveIslandShelf(shelf: string[]): void {
  if (!current) return
  current = { ...current, island: { ...current.island, shelf: shelf.slice(0, 30) } }
  schedule()
}

/**
 * Guarda o token do Seafile. Só o main escreve isto.
 *
 * Ele nasce de um login feito aqui, e o renderer nunca o vê — mesma proteção
 * do refresh token do Spotify.
 */
export function saveSeafileToken(token: string): void {
  if (!current) return
  if (current.seafile.token === token) return
  current = { ...current, seafile: { ...current.seafile, token } }
  schedule()
}

/** A biblioteca do Seafile que recebe os arquivos arrastados. */
export function saveSeafileLibrary(library: string): void {
  if (!current) return
  current = { ...current, seafile: { ...current.seafile, library } }
  schedule()
}

/** Guarda (ou apaga) o refresh token do Spotify. Só o main escreve isto. */
export function saveSpotifyToken(token: string): void {
  if (!current) return
  if (current.music.spotifyRefreshToken === token) return
  current = { ...current, music: { ...current.music, spotifyRefreshToken: token } }
  schedule()
}

/**
 * Guarda onde alguém parou de assistir.
 *
 * O mesmo título entra uma vez só, sempre no topo: reassistir não pode encher
 * a lista de repetições do mesmo filme.
 */
export function saveProgress(progresso: Progress): void {
  if (!current) return
  const resto = current.media.recent.filter(
    (item) => !(item.id === progresso.id && item.episode === progresso.episode),
  )
  current = {
    ...current,
    media: { ...current.media, recent: [progresso, ...resto].slice(0, 16) },
  }
  schedule()
}

/** Tira um título do histórico. */
export function forgetProgress(id: string, episode: string | null): void {
  if (!current) return
  current = {
    ...current,
    media: {
      ...current.media,
      recent: current.media.recent.filter((item) => !(item.id === id && item.episode === episode)),
    },
  }
  schedule()
}

/**
 * As configurações que valem agora, para quem no main precisa delas.
 *
 * É por aqui que os serviços leem o caminho da lista de mídia, em vez de o
 * renderer mandar o caminho a cada chamada — quem manda no que está salvo é o
 * main.
 */
export function currentSettings(): HaloSettings {
  return current ?? DEFAULT_SETTINGS
}

/** A janela mudou de lugar. Ignora repetição para não reescrever à toa. */
export function savePosition(x: number, y: number): void {
  if (!current) return
  const previous = current.desktop.position
  if (previous && previous.x === x && previous.y === y) return
  current = { ...current, desktop: { ...current.desktop, position: { x, y } } }
  schedule()
}

/** Fechar o app não pode perder o que ainda não foi gravado. */
export function flushSettings(): void {
  clearTimeout(pending)
  flush()
}
