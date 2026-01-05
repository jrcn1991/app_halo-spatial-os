import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { RedeError } from './rede'

/**
 * A capa de uma referência, convertida para `data:`.
 *
 * A CSP do renderer é `img-src 'self' data:` mais três hosts nomeados, e cada
 * host ali entrou com um motivo escrito. As fontes criativas não cabem nessa
 * lista: o DeviantArt serve de `*.wixmp.com`, o Printables de
 * `media.printables.com`, e "qualquer endereço" serve de qualquer lugar —
 * abrir a CSP para host arbitrário seria desfazer a parede que ela é.
 *
 * Então a imagem vem pelo main, como já vem a capa do MPRIS e a miniatura do
 * RSS. É a mesma decisão pela terceira vez, e é ela que mantém `connect-src`
 * e `img-src` fechados enquanto a tela mostra imagem do mundo inteiro.
 *
 * O cache é por URL e limitado: uma grade de resultados pede dezenas de
 * imagens, e sem teto a memória do main cresceria com a rolagem.
 */

/** Uma capa de grade não passa disto; acima, é imagem de página, não miniatura. */
const MAX_BYTES = 1024 * 1024
const TIMEOUT_MS = 8000
/** Quantas capas ficam em memória. Cobre a grade visível e a rolagem recente. */
const MAX_CACHE = 120
/* Teto em BYTES, além do de entradas: 120 capas de até 1 MB em base64 podiam
   chegar a ~160 MB no main (DESEMPENHO.md, P2-11). 24 MB guardam dezenas de
   capas e o Map, por ordem de inserção, solta as mais antigas primeiro. */
const MAX_BYTES_CACHE = 24 * 1024 * 1024

const cache = new Map<string, string>()
let bytesNoCache = 0

/** Mesma conferência de `rede.ts`: imagem também vem de URL do usuário. */
async function publico(url: URL): Promise<boolean> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const host = url.hostname.replace(/^\[|\]$/g, '')
  try {
    const enderecos = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
    return enderecos.every(({ address }) => {
      if (isIP(address) === 6) return !/^(::1|::|f[cd]|fe[89ab])/i.test(address)
      const [a = 0, b = 0] = address.split('.').map(Number)
      return !(
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 168 || b === 0)) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224
      )
    })
  } catch {
    return false
  }
}

export async function creativeThumb(bruta: string): Promise<string> {
  if (!bruta) return ''
  const guardada = cache.get(bruta)
  if (guardada !== undefined) return guardada

  let valor = ''
  try {
    const url = new URL(bruta)
    if (await publico(url)) valor = await baixar(url)
  } catch {
    // Endereço inválido ou host bloqueado: a tela desenha o lugar da imagem.
  }

  // Guarda até o vazio: uma capa que falhou não deve ser tentada a cada
  // rolagem. O mais antigo sai quando o teto chega.
  bytesNoCache += valor.length
  while (cache.size >= MAX_CACHE || (bytesNoCache > MAX_BYTES_CACHE && cache.size > 0)) {
    const primeira = cache.keys().next().value
    if (primeira === undefined) break
    bytesNoCache -= cache.get(primeira)?.length ?? 0
    cache.delete(primeira)
  }
  cache.set(bruta, valor)
  return valor
}

async function baixar(url: URL): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resposta = await fetch(url, {
      signal: controller.signal,
      redirect: 'error',
      headers: {
        Accept: 'image/*',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Halo/1.0',
      },
    })
    if (!resposta.ok) return ''

    // O tipo vem do SERVIDOR, e é ele que decide se isto vira `data:`. SVG
    // fica de fora: é documento com script, e aqui é uma capa.
    const tipo = (resposta.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''
    if (!/^image\/(png|jpeg|jpg|gif|webp|avif)$/i.test(tipo)) return ''

    const buffer = Buffer.from(await resposta.arrayBuffer())
    if (buffer.byteLength > MAX_BYTES) return ''
    return `data:${tipo};base64,${buffer.toString('base64')}`
  } catch (erro) {
    if (erro instanceof RedeError) return ''
    return ''
  } finally {
    clearTimeout(timer)
  }
}
