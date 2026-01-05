import { deflateSync } from 'node:zlib'

/**
 * PNG sem dependência: assinatura, IHDR, IDAT (deflate) e IEND.
 *
 * Vinte linhas evitam trazer uma biblioteca de imagem inteira para escrever o
 * único formato de que a tela precisa. Fica num módulo, e não dentro da
 * ferramenta de linha de comando, porque o mascote em tempo de execução também
 * precisa dele — duas cópias do mesmo CRC seriam duas para errar.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    // `noUncheckedIndexedAccess`: o índice vem de uma máscara de 8 bits e a
    // tabela tem 256 entradas, mas o compilador não sabe disso.
    crc = (CRC_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
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
