import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

/**
 * As capturas de tela do Spectacle.
 *
 * O "screenshot shelf" do Notchy: cada captura salva vira um item na ilha.
 * Aqui ela vira uma REFERÊNCIA na gaveta (a regra do projeto: o app não copia
 * arquivo do usuário) e um anúncio — o arquivo continua onde o Spectacle o
 * pôs. A pasta é a que o Spectacle usa: `imageSaveLocation` do `spectaclerc`
 * quando existe, senão a pasta de imagens do XDG mais o nome traduzido
 * (`translatedScreenshotsFolder`, "Capturas de tela" em pt-BR).
 */

const run = promisify(execFile)
const IMAGEM = /\.(png|jpe?g|webp|avif|bmp)$/i

let pasta: string | null = null

export async function pastaDeCapturas(): Promise<string> {
  if (pasta) return pasta
  let dentro = 'Screenshots'
  try {
    const rc = await readFile(join(homedir(), '.config', 'spectaclerc'), 'utf8')
    const explicita = /^imageSaveLocation=file:\/\/(.+)$/m.exec(rc)?.[1]
    if (explicita) {
      pasta = decodeURIComponent(explicita)
      return pasta
    }
    dentro = /^translatedScreenshotsFolder=(.+)$/m.exec(rc)?.[1]?.trim() ?? dentro
  } catch {
    // Sem spectaclerc: os padrões do Spectacle.
  }
  let imagens = join(homedir(), 'Pictures')
  try {
    imagens = (await run('xdg-user-dir', ['PICTURES'], { timeout: 2000 })).stdout.trim() || imagens
  } catch {
    // Sem xdg-user-dir, fica ~/Pictures.
  }
  pasta = join(imagens, dentro)
  return pasta
}

export type Captura = { path: string; name: string; at: number }

/** As capturas mais novas que `desde` (epoch ms), da mais recente para a mais antiga. */
export async function capturasDesde(desde: number): Promise<Captura[]> {
  const dir = await pastaDeCapturas()
  const nomes = (await readdir(dir).catch(() => [])).filter((n) => IMAGEM.test(n))
  const lista = await Promise.all(
    nomes.map(async (name) => {
      const info = await stat(join(dir, name)).catch(() => null)
      return info && info.mtimeMs > desde ? { path: join(dir, name), name, at: info.mtimeMs } : null
    }),
  )
  return lista.filter((c): c is Captura => c !== null).sort((a, b) => b.at - a.at)
}

/** Quantas capturas há na pasta, e a última. */
export async function resumoDeCapturas(): Promise<{ total: number; ultima: Captura | null }> {
  const dir = await pastaDeCapturas()
  const nomes = (await readdir(dir).catch(() => [])).filter((n) => IMAGEM.test(n))
  const recentes = await capturasDesde(0)
  return { total: nomes.length, ultima: recentes[0] ?? null }
}
