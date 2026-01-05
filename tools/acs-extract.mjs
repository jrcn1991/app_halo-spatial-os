#!/usr/bin/env node
/**
 * Converte um personagem ACS (Microsoft Agent — Genie, Clippy, Merlin) em PNGs
 * mais um `animacoes.json`.
 *
 * ```
 * node tools/acs-extract.mjs ~/Downloads/Genie.acs public/mascote/genie
 * ```
 *
 * A conversão é feita **uma vez**, fora do app: decodificar 591 imagens custa
 * segundos e memória, e nada disso precisa acontecer a cada abertura. O app lê
 * o JSON e os PNGs.
 *
 * É também com esta ferramenta que se homologa o decodificador: se os PNGs
 * saírem com um gênio azul em vez de ruído, `src/main/mascot/acs.ts` está certo.
 *
 * O decodificador é importado direto do TypeScript — o Node remove os tipos
 * sozinho desde a versão 22.18, e assim não existe uma segunda cópia do formato
 * binário para sair de sincronia.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { composeAcsFrame, parseAcs } from '../src/main/mascot/acs.ts'

const [, , input, outDir] = process.argv
if (!input || !outDir) {
  console.error('uso: node tools/acs-extract.mjs <arquivo.acs> <pasta-de-saida>')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// PNG sem dependência: assinatura, IHDR, IDAT (deflate) e IEND.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(width, height, rgba) {
  const stride = width * 4
  // Cada linha do PNG começa com o byte do filtro; 0 é "sem filtro".
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y += 1) {
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 8 bits por canal
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------

const character = await parseAcs(input)
const framesDir = join(outDir, 'quadros')
mkdirSync(framesDir, { recursive: true })

// Quadros iguais viram o mesmo arquivo: as 76 animações repetem muito a pose de
// descanso, e escrever a mesma imagem dezenas de vezes só engorda o pacote.
const byHash = new Map()
const files = []

/**
 * O índice do PNG do quadro, ou `null` quando o quadro não tem camada nenhuma.
 *
 * 53 das 76 animações do Genie terminam num quadro sem imagens e com duração 0
 * — é o marcador de fim do formato, não um quadro para desenhar. Gerar um PNG
 * transparente para ele convidaria o app a piscar o mascote no fim de cada
 * animação.
 */
function frameFile(frame) {
  if (frame.images.length === 0) return null
  const composed = composeAcsFrame(character, frame)
  const hash = createHash('sha1').update(composed.rgba).digest('hex')
  const known = byHash.get(hash)
  if (known !== undefined) return known
  const index = files.length
  const name = `quadros/q${String(index).padStart(4, '0')}.png`
  writeFileSync(join(outDir, name), encodePng(composed.width, composed.height, composed.rgba))
  files.push(name)
  byHash.set(hash, index)
  return index
}

const animations = character.animations.map((animation) => ({
  name: animation.name,
  transitionType: animation.transitionType,
  frames: animation.frames.map((frame) => ({
    frame: frameFile(frame),
    durationMs: frame.durationMs,
    exitFrameIndex: frame.exitFrameIndex,
    branches: frame.branches,
  })),
}))

const manifest = {
  source: basename(input),
  character: { width: character.width, height: character.height },
  frames: files,
  animations,
}
writeFileSync(join(outDir, 'animacoes.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const totalFrames = animations.reduce((sum, a) => sum + a.frames.length, 0)
console.log(
  `${animations.length} animações, ${totalFrames} quadros (${files.length} PNGs distintos) em ${outDir}`,
)
