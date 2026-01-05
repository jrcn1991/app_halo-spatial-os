import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { nativeImage } from 'electron'

/**
 * Ícone e imagem de uma notificação, em `data:`.
 *
 * O renderer não alcança disco (CSP `img-src 'self' data:`), e tudo aqui veio
 * de OUTRO programa pelo D-Bus — nada é de confiança. A especificação manda
 * três coisas, e cada uma tem o seu cuidado:
 *
 * - **`image-data`**: pixels crus (largura, altura, passo, alfa, 8 bits, 3 ou 4
 *   canais). É o avatar do Telegram, a capa do player. Vira PNG pelo
 *   `nativeImage`, com teto de tamanho — um aplicativo não pode fazer o main
 *   alocar uma imagem de 20 mil pixels de lado.
 * - **um caminho** (`app_icon` ou a dica `image-path`): só PNG e JPEG, e só
 *   depois de conferir os primeiros bytes — o mesmo cuidado da capa do MPRIS
 *   (CLAUDE.md § "Quem toca precisa se anunciar"). SVG de caminho qualquer
 *   não entra: é documento, e o caminho é de quem mandou.
 * - **um nome** (`thunderbird`, `dialog-information`): procurado no tema de
 *   ícones da sessão e no `hicolor`, como o Plasma faz. Aqui o SVG entra, e é
 *   a única porta dele: o arquivo vem das pastas de ícones do sistema e do
 *   usuário, não de um caminho que o remetente escolheu — e numa `<img>` um
 *   SVG não roda script nem busca nada de fora. Sem isso metade dos ícones do
 *   Breeze (que é todo SVG) sumiria.
 *
 * Cada nome é resolvido uma vez e lembrado: um chat que manda vinte mensagens
 * não varre as pastas de ícones vinte vezes.
 */

/** O maior lado que a janela desenha (o avatar tem 44px; 2× para hidpi, com folga). */
const LADO = 96
/** Imagem crua acima disso é recusada antes de alocar qualquer coisa. */
const MAX_PIXELS = 2048 * 2048
/** SVG maior que isso não é ícone. */
const MAX_SVG = 256 * 1024

const lembrados = new Map<string, string | null>()
const LEMBRAR_MAX = 300

function lembrar(chave: string, valor: string | null): string | null {
  if (lembrados.size >= LEMBRAR_MAX) {
    const primeira = lembrados.keys().next().value
    if (primeira !== undefined) lembrados.delete(primeira)
  }
  lembrados.set(chave, valor)
  return valor
}

/** PNG a partir de `nativeImage`, reduzido ao lado que a janela usa. */
function emDataUrl(imagem: Electron.NativeImage): string | null {
  if (imagem.isEmpty()) return null
  const { width, height } = imagem.getSize()
  const reduzida =
    Math.max(width, height) > LADO
      ? imagem.resize(width >= height ? { width: LADO } : { height: LADO, quality: 'best' })
      : imagem
  return reduzida.toDataURL()
}

/**
 * `image-data`, a estrutura `(iiibiiay)` da especificação.
 *
 * O `nativeImage` quer BGRA; a especificação manda RGB(A) linha a linha, com
 * passo (`rowstride`) que pode ser maior que a largura × canais.
 */
export function imagemDosPixels(valor: unknown): string | null {
  if (!Array.isArray(valor) || valor.length < 7) return null
  const [largura, altura, passo, , bits, canais, dados] = valor as [
    number,
    number,
    number,
    boolean,
    number,
    number,
    unknown,
  ]
  if (!Buffer.isBuffer(dados)) return null
  if (![largura, altura, passo].every((n) => Number.isInteger(n) && n > 0)) return null
  if (bits !== 8 || (canais !== 3 && canais !== 4)) return null
  if (largura * altura > MAX_PIXELS) return null
  if (dados.length < passo * (altura - 1) + largura * canais) return null

  const bgra = Buffer.alloc(largura * altura * 4)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const de = y * passo + x * canais
      const para = (y * largura + x) * 4
      bgra[para] = dados[de + 2] ?? 0
      bgra[para + 1] = dados[de + 1] ?? 0
      bgra[para + 2] = dados[de] ?? 0
      bgra[para + 3] = canais === 4 ? (dados[de + 3] ?? 255) : 255
    }
  }
  return emDataUrl(nativeImage.createFromBitmap(bgra, { width: largura, height: altura }))
}

/** Os primeiros bytes dizem se é PNG ou JPEG — a extensão é de quem mandou. */
function ehImagemRaster(caminho: string): boolean {
  try {
    const cabeca = readFileSync(caminho).subarray(0, 4)
    const png = cabeca[0] === 0x89 && cabeca[1] === 0x50 && cabeca[2] === 0x4e && cabeca[3] === 0x47
    const jpeg = cabeca[0] === 0xff && cabeca[1] === 0xd8 && cabeca[2] === 0xff
    return png || jpeg
  } catch {
    return false
  }
}

/** Um caminho de arquivo (ou `file://`) mandado pelo remetente. Só PNG e JPEG. */
export function imagemDoCaminho(bruto: string): string | null {
  let caminho = bruto
  if (caminho.startsWith('file://')) {
    try {
      caminho = decodeURIComponent(new URL(caminho).pathname)
    } catch {
      return null
    }
  }
  if (!caminho.startsWith('/')) return null
  const chave = `caminho:${caminho}`
  if (lembrados.has(chave)) return lembrados.get(chave) ?? null
  try {
    if (statSync(caminho).size > 8 * 1024 * 1024) return lembrar(chave, null)
  } catch {
    return lembrar(chave, null)
  }
  if (!ehImagemRaster(caminho)) return lembrar(chave, null)
  return lembrar(chave, emDataUrl(nativeImage.createFromPath(caminho)))
}

/* ——— Pelo nome, no tema de ícones ————————————————————————————— */

const CASA = homedir()
const BASES = [
  join(CASA, '.local/share/icons'),
  join(CASA, '.icons'),
  '/usr/share/icons',
  join(CASA, '.local/share/flatpak/exports/share/icons'),
  '/var/lib/flatpak/exports/share/icons',
]
const CATEGORIAS = ['apps', 'status', 'devices', 'actions', 'places', 'categories', 'mimetypes']
const TAMANHOS = [64, 48, 96, 128, 256, 32, 22]

/**
 * O tema de ícones da sessão, lido do `kdeglobals` — é o que o Plasma usa. Lido
 * a cada resolução que não está na memória (é um arquivo pequeno), porque o
 * usuário pode trocar de tema com o app aberto.
 */
function temaDaSessao(): string {
  try {
    const kdeglobals = readFileSync(join(CASA, '.config/kdeglobals'), 'utf8')
    const grupo = kdeglobals.split(/^\[Icons\]\s*$/m)[1] ?? ''
    const tema = /^Theme=(.+)$/m.exec(grupo.split(/^\[/m)[0] ?? '')?.[1]?.trim()
    return tema || 'breeze'
  } catch {
    return 'breeze'
  }
}

/** O tema, os que ele herda (`index.theme`) e o `hicolor`, que é o piso de todos. */
function cadeiaDeTemas(): string[] {
  const cadeia: string[] = []
  const visitar = (tema: string, profundidade: number) => {
    if (cadeia.includes(tema) || profundidade > 4) return
    cadeia.push(tema)
    for (const base of BASES) {
      const indice = join(base, tema, 'index.theme')
      if (!existsSync(indice)) continue
      try {
        const herda = /^Inherits=(.+)$/m.exec(readFileSync(indice, 'utf8'))?.[1] ?? ''
        for (const pai of herda
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)) {
          visitar(pai, profundidade + 1)
        }
      } catch {
        // index.theme ilegível: segue sem os pais dele.
      }
      break
    }
  }
  visitar(temaDaSessao(), 0)
  if (!cadeia.includes('hicolor')) cadeia.push('hicolor')
  return cadeia
}

/** Os caminhos candidatos, nas duas disposições que existem (Breeze e hicolor). */
function* candidatos(nome: string, temas: string[]): Generator<string> {
  for (const tema of temas) {
    for (const base of BASES) {
      const raiz = join(base, tema)
      if (!existsSync(raiz)) continue
      for (const lado of TAMANHOS) {
        for (const cat of CATEGORIAS) {
          // hicolor: `48x48/apps/nome.png`; Breeze: `apps/48/nome.svg`.
          yield join(raiz, `${lado}x${lado}`, cat, `${nome}.png`)
          yield join(raiz, cat, String(lado), `${nome}.svg`)
          yield join(raiz, `${lado}x${lado}`, cat, `${nome}.svg`)
        }
      }
      for (const cat of CATEGORIAS) {
        yield join(raiz, 'scalable', cat, `${nome}.svg`)
        yield join(raiz, 'scalable', cat, `${nome}.svgz`)
      }
    }
  }
  yield join('/usr/share/pixmaps', `${nome}.png`)
  yield join('/usr/share/pixmaps', `${nome}.svg`)
}

function svgEmDataUrl(caminho: string): string | null {
  try {
    const bruto = readFileSync(caminho)
    if (bruto.length > MAX_SVG) return null
    const svg = caminho.endsWith('.svgz') ? gunzipSync(bruto) : bruto
    if (svg.length > MAX_SVG * 4 || !/<svg[\s>]/.test(svg.subarray(0, 2048).toString('utf8'))) {
      return null
    }
    return `data:image/svg+xml;base64,${svg.toString('base64')}`
  } catch {
    return null
  }
}

/** Um nome de ícone do tema, em `data:`. Nome com barra não é nome: é caminho. */
export function iconeDoNome(nome: string): string | null {
  if (!nome || nome.includes('/') || nome.length > 128) return null
  const chave = `nome:${nome}`
  if (lembrados.has(chave)) return lembrados.get(chave) ?? null
  for (const caminho of candidatos(nome, cadeiaDeTemas())) {
    if (!existsSync(caminho)) continue
    const achado = caminho.endsWith('.png')
      ? emDataUrl(nativeImage.createFromPath(caminho))
      : svgEmDataUrl(caminho)
    if (achado) return lembrar(chave, achado)
  }
  return lembrar(chave, null)
}

/* ——— Pelo `.desktop` do remetente ————————————————————————————— */

const PASTAS_DE_APPS = [
  join(CASA, '.local/share/applications'),
  '/usr/share/applications',
  '/usr/local/share/applications',
  join(CASA, '.local/share/flatpak/exports/share/applications'),
  '/var/lib/flatpak/exports/share/applications',
  '/var/lib/snapd/desktop/applications',
]

/**
 * O `Icon=` do `.desktop` que a dica `desktop-entry` nomeia. É o que dá ícone a
 * quem manda `app_icon` vazio — a maioria dos aplicativos em Electron.
 */
export function iconeDoDesktop(entrada: string): string | null {
  if (!entrada || entrada.includes('/') || entrada.length > 200) return null
  const chave = `desktop:${entrada}`
  if (lembrados.has(chave)) return lembrados.get(chave) ?? null
  for (const pasta of PASTAS_DE_APPS) {
    const arquivo = join(pasta, `${entrada}.desktop`)
    if (!existsSync(arquivo)) continue
    try {
      const icone = /^Icon=(.+)$/m.exec(readFileSync(arquivo, 'utf8'))?.[1]?.trim() ?? ''
      const achado = icone.startsWith('/') ? imagemDoCaminho(icone) : iconeDoNome(icone)
      return lembrar(chave, achado)
    } catch {
      break
    }
  }
  return lembrar(chave, null)
}
