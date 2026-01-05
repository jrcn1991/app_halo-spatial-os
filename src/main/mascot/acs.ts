import { readFile } from 'node:fs/promises'

/**
 * Decodificador de arquivos ACS (Microsoft Agent Character) — Genie, Clippy,
 * Merlin, Robby.
 *
 * O formato nunca foi publicado. **Tudo aqui foi medido** no arquivo do Genie
 * (2.004.847 bytes, 76 animações, 591 imagens): cada campo declarado abaixo tem
 * o comentário do que o provou. Onde a medição não fecha o caso, o comentário
 * diz isso com todas as letras — é melhor uma incerteza declarada do que um bug
 * escondido depois.
 *
 * As duas provas que sustentam o resto:
 *
 * 1. **Soma dos tamanhos.** Cada animação e cada imagem trazem um `LOCATION`
 *    (deslocamento + tamanho). Se a leitura campo a campo termina exatamente no
 *    byte que o `LOCATION` promete, a estrutura está certa. Fecha nas 76
 *    animações e nas 591 imagens.
 * 2. **A região contra os pixels.** Cada imagem carrega, além dos pixels, uma
 *    `RGNDATA` do Windows — a lista de retângulos opacos. Descomprimir as duas
 *    e conferir "pixel opaco ⇔ pixel dentro da região" é um teste que a
 *    descompressão só passa se estiver byte a byte correta. Passa em 590 das
 *    591 (a 591ª tem região vazia, então não há o que conferir).
 *
 *    E foi exatamente nessa 591ª que um erro se escondeu por meses: é a única
 *    imagem de 166 de largura, a única onde o enchimento de linha do DIB
 *    importa, e a única que este teste não alcança. Um cheque que cobre 590 de
 *    591 casos parece ótimo até o caso que falta ser o único diferente.
 * 3. **O tamanho real do fluxo.** Descomprimir pedindo mais do que se espera e
 *    ver onde o marcador de fim cai mede o tamanho sem supor nada. É o que
 *    achou o enchimento; ver `readImage`.
 *
 * O que este módulo **não** faz: áudio (as 14 trilhas são RIFF/WAVE cru, sem
 * compressão, mas o mascote é mudo), balão de fala, voz e a lista de estados.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Uma camada de um quadro.
 *
 * Um quadro tem de 1 a 3 camadas (medido: `maxImgs` = 3 no Genie) e elas vêm
 * **da frente para trás**: em `Blink`, o quadro 0 é `[8, 0]`, onde 0 é o corpo
 * inteiro e 8 é o remendo dos olhos fechados. Desenhar na ordem do arquivo
 * esconderia o remendo debaixo do corpo — por isso `composeAcsFrame` percorre
 * a lista ao contrário.
 */
export type AcsFrameImage = { imageIndex: number; xOffset: number; yOffset: number }

/**
 * Salto probabilístico ao fim do quadro.
 *
 * `probability` é porcentagem. As somas medidas são 10, 15, 50, 70 e 100 — ou
 * seja, **pode sobrar**: o que resta é a chance de simplesmente seguir para o
 * quadro seguinte. É esse mecanismo que faz as animações `Idle` variarem.
 */
export type AcsBranch = { frameIndex: number; probability: number }

export type AcsFrame = {
  images: AcsFrameImage[]
  /** Convertido de centésimos de segundo (medido: 8 → 80 ms, ~12 fps). */
  durationMs: number
  /** Índice na lista de áudio do arquivo; `-1` quando o quadro é mudo. */
  audioIndex: number
  /**
   * Para onde pular quando o app pede que a animação pare no meio.
   *
   * Negativo (`-1` e `-2` aparecem no Genie) significa "não há saída". Não
   * consegui provar a diferença entre os dois com um arquivo só.
   */
  exitFrameIndex: number
  branches: AcsBranch[]
}

/**
 * Sobreposição de boca, usada pela sincronia labial da fala.
 *
 * Decodificada porque é preciso consumi-la para achar o próximo quadro, e
 * exposta porque é barato. Um mascote mudo pode ignorá-la.
 */
export type AcsOverlay = {
  /** 0 a 6 no Genie: as posições de boca. */
  type: number
  replaceTopImage: boolean
  imageIndex: number
  xOffset: number
  yOffset: number
  width: number
  height: number
}

export type AcsAnimation = {
  name: string
  /**
   * Como o app deve entrar na animação. Só `1` e `2` aparecem no Genie e não
   * consegui provar o significado de cada um — está aqui cru, sem interpretação.
   */
  transitionType: number
  /** Animação para onde voltar. Vazia nas 76 do Genie. */
  returnAnimationName: string
  frames: AcsFrame[]
  overlaysByFrame: AcsOverlay[][]
}

/** Imagem já em RGBA, com a cor de transparência zerada no canal alfa. */
export type AcsImage = { width: number; height: number; rgba: Uint8Array }

export type AcsCharacter = {
  /** Tamanho declarado do personagem (128×128 no Genie). */
  width: number
  height: number
  /** Índice da paleta que vale como transparente (10 no Genie = magenta). */
  transparentColorIndex: number
  animations: AcsAnimation[]
  images: AcsImage[]
}

// ---------------------------------------------------------------------------
// Leitura crua
// ---------------------------------------------------------------------------

/** Provado pelos 4 primeiros bytes do arquivo do Genie. */
const SIGNATURE = 0xabcdabc3

/** `DWORD offset; DWORD size`, deslocamento absoluto no arquivo. */
type Location = { offset: number; size: number }

function readLocation(buf: Buffer, at: number): Location {
  return { offset: buf.readUInt32LE(at), size: buf.readUInt32LE(at + 4) }
}

/**
 * `DWORD` com o comprimento **em caracteres**, os caracteres em UTF-16LE e um
 * `WORD` nulo no fim. Quando o comprimento é 0 não há caracteres nem o nulo —
 * provado pelo campo "animação de retorno" de `RestPose`, que é vazio e ocupa
 * exatamente 4 bytes.
 */
function readString(buf: Buffer, at: number): { value: string; next: number } {
  const length = buf.readUInt32LE(at)
  if (length === 0) return { value: '', next: at + 4 }
  const start = at + 4
  const value = buf.toString('utf16le', start, start + length * 2)
  return { value, next: start + length * 2 + 2 }
}

// ---------------------------------------------------------------------------
// Descompressão
// ---------------------------------------------------------------------------

/**
 * Larguras do campo de deslocamento por classe, e o primeiro deslocamento que
 * cada classe representa.
 *
 * As classes são cumulativas: 6 bits cobrem 1..64, 9 bits cobrem 65..576, 12
 * bits cobrem 577..4672 e 20 bits vão daí para cima. Provado decodificando à
 * mão a região da imagem 8, cujo conteúdo é conhecido de antemão (um cabeçalho
 * `RGNDATA` começa obrigatoriamente com `20 00 00 00 01 00 00 00`).
 */
const OFFSET_BITS = [6, 9, 12, 20]
const OFFSET_BASE = [1, 65, 577, 4673]

/**
 * O LZ próprio do ACS.
 *
 * Fluxo de **bits lidos do bit menos significativo para o mais significativo**
 * dentro de cada byte:
 *
 * - bit `0` → literal: os próximos 8 bits são um byte de saída;
 * - bit `1` → cópia da janela já escrita:
 *   - classe do deslocamento em unário limitado a 3: `0`, `10`, `110`, `111`;
 *   - o deslocamento, com a largura e a base de `OFFSET_BITS`/`OFFSET_BASE`;
 *   - o comprimento, em código gama: `k` bits `1`, um bit `0`, e mais `k` bits
 *     de valor — `k = 0` significa comprimento 2, senão `2^k + 1 + valor`.
 * - na classe 3, um deslocamento com todos os bits em 1 é o fim do fluxo. Os
 *   6 bytes `FF` no fim de todo fluxo são esse marcador mais o enchimento.
 *
 * Dois detalhes que custaram medição:
 *
 * - **O primeiro byte do fluxo não entra na conta.** É sempre `00` nos 1182
 *   fluxos do Genie e a decodificação só se alinha começando no byte 1.
 * - **A classe 3 soma 1 ao comprimento.** Um casamento com deslocamento grande
 *   nunca vale a pena com menos de 3 bytes, então o codificador desloca a
 *   escala. Sem esse `+1`, 353 das 591 imagens saem deslocadas de um byte a
 *   partir do primeiro casamento de classe 3 — foi assim que o desvio
 *   apareceu, comparando os pixels opacos com a região.
 */
function decompress(source: Buffer, expected: number, fill = 0): Uint8Array {
  // `fill` é o que sobra se o fluxo acabar antes de encher o destino. Nas 591
  // imagens do Genie isso nunca acontece, mas com outro personagem o resto
  // precisa sair transparente — um bloco preto no meio do mascote seria pior
  // do que um pedaço faltando.
  const out = new Uint8Array(expected).fill(fill)
  let bytePos = 1
  let bitPos = 0
  let written = 0

  const readBit = (): number => {
    if (bytePos >= source.length) throw new Error('fluxo ACS terminou antes da hora')
    const bit = (source.readUInt8(bytePos) >> bitPos) & 1
    bitPos += 1
    if (bitPos === 8) {
      bitPos = 0
      bytePos += 1
    }
    return bit
  }
  const readBits = (count: number): number => {
    let value = 0
    for (let i = 0; i < count; i += 1) value += readBit() * 2 ** i
    return value
  }

  while (written < expected) {
    if (readBit() === 0) {
      out[written] = readBits(8)
      written += 1
      continue
    }

    let cls = 0
    while (cls < 3 && readBit() === 1) cls += 1
    const width = OFFSET_BITS[cls] ?? 20
    const raw = readBits(width)
    if (cls === 3 && raw === 2 ** width - 1) break

    const offset = raw + (OFFSET_BASE[cls] ?? 1)
    if (offset > written) throw new Error('deslocamento ACS aponta para fora da janela')

    let k = 0
    while (readBit() === 1) {
      k += 1
      if (k > 30) throw new Error('comprimento ACS fora de escala')
    }
    const length = (k === 0 ? 2 : 2 ** k + 1 + readBits(k)) + (cls === 3 ? 1 : 0)

    for (let i = 0; i < length && written < expected; i += 1) {
      out[written] = out[written - offset] ?? 0
      written += 1
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Paleta
// ---------------------------------------------------------------------------

type Palette = { colors: Uint8Array; transparentIndex: number }

/**
 * Acha a paleta dentro do bloco `CharacterInfo`.
 *
 * O começo do bloco é fixo e conferido byte a byte no Genie:
 *
 * ```
 *  +0  USHORT   versão menor (1)          +28 USHORT largura (128)
 *  +2  USHORT   versão maior (2)          +30 USHORT altura (128)
 *  +4  LOCATION textos localizados        +32 BYTE   índice transparente (10)
 * +12  BYTE[16] GUID do personagem        +33 ULONG  sinalizadores
 * ```
 *
 * Depois disso vêm a voz e o balão de fala, **de tamanho variável e presentes
 * conforme bits dos sinalizadores que um arquivo só não permite provar**. Por
 * isso a paleta é achada por assinatura em vez de por caminhada: um `ULONG` 256
 * seguido de 256 `RGBQUAD` com o quarto byte zerado. No Genie existe exatamente
 * um ponto do bloco que satisfaz isso (em `CharacterInfo+168`), e as 16
 * primeiras entradas são a paleta VGA padrão — que é o que se espera de um
 * bitmap de 8 bits da época.
 *
 * Esta é a única parte do decodificador que não é caminhada estrutural. Se um
 * outro personagem falhar aqui, é aqui que se olha primeiro.
 */
/**
 * A paleta do personagem, dentro do `CharacterInfo`.
 *
 * Achada por varredura, e não caminhando pela estrutura: o que vem antes dela
 * tem blocos de tamanho variável (voz, balão de fala) que dependem de
 * sinalizadores, e mapeá-los exigiria mais arquivos do que eu tenho.
 *
 * **A contagem NÃO é sempre 256.** O Genie e o Merlin têm 256 cores; o Alien
 * tem 128 — e a primeira versão disto exigia 256, então ele nem abria. Nos dois
 * casos a paleta começa em +0xA8, mas a varredura não depende disso.
 *
 * O que separa a paleta de um falso positivo: o quarto byte de cada RGBQUAD é
 * sempre zero, a paleta inteira cabe no bloco, e o índice transparente aponta
 * para uma entrada que existe. Os nomes de estado logo depois (texto UTF-16)
 * chegam a passar nos dois primeiros testes, mas ficam para trás porque a
 * varredura para na primeira ocorrência — e a paleta vem antes deles.
 */
function readPalette(buf: Buffer, info: Location): Palette {
  const transparentIndex = buf.readUInt8(info.offset + 32)
  const fixedEnd = info.offset + 41
  const blockEnd = info.offset + info.size

  for (let at = fixedEnd; at < blockEnd - 8; at += 1) {
    const count = buf.readUInt32LE(at)
    // Menos de 2 cores não é paleta; mais de 256 não cabe num índice de 8 bits.
    if (count < 2 || count > 256) continue
    if (at + 4 + count * 4 > blockEnd) continue
    // O índice transparente precisa existir nela.
    if (transparentIndex >= count) continue

    let plausible = true
    for (let i = 0; i < count; i += 1) {
      if (buf.readUInt8(at + 4 + i * 4 + 3) !== 0) {
        plausible = false
        break
      }
    }
    if (!plausible) continue

    // Paleta curta: o resto fica preto. Índice fora dela não deveria aparecer,
    // mas um arquivo estranho não pode virar leitura fora dos limites.
    const colors = new Uint8Array(1024)
    colors.set(buf.subarray(at + 4, at + 4 + count * 4))
    return { colors, transparentIndex }
  }
  throw new Error('paleta não encontrada no CharacterInfo do ACS')
}

// ---------------------------------------------------------------------------
// Imagens
// ---------------------------------------------------------------------------

/**
 * Uma entrada das listas de imagem e de áudio: `LOCATION` mais 4 bytes que
 * parecem uma soma de verificação e não são usados. Medido pela aritmética: a
 * lista de imagens tem 7096 bytes para 591 entradas — `(7096 - 4) / 591 = 12`.
 */
function readLocationList(buf: Buffer, info: Location): Location[] {
  const count = buf.readUInt32LE(info.offset)
  const list: Location[] = []
  for (let i = 0; i < count; i += 1) {
    list.push(readLocation(buf, info.offset + 4 + i * 12))
  }
  return list
}

/**
 * Bloco de uma imagem:
 *
 * ```
 *  +0 BYTE   desconhecido (sempre 1 no Genie)
 *  +1 USHORT largura        +3 USHORT altura
 *  +5 BYTE   comprimida (sempre 1 no Genie; o caminho não comprimido nunca
 *            aparece, então não está escrito aqui)
 *  +6 ULONG  bytes comprimidos, seguidos dos próprios bytes
 *     ULONG  bytes comprimidos da região
 *     ULONG  bytes da região já descomprimida
 *     BYTE[] a região comprimida — uma RGNDATA do Windows
 * ```
 *
 * Provado pela soma: `10 + dados + 8 + região` bate com o tamanho declarado nas
 * 591 imagens.
 *
 * Os pixels são índices da paleta, **de baixo para cima** (é um DIB), e cada
 * linha é enchida até um múltiplo de 4 bytes — o alinhamento de todo DIB do
 * Windows.
 *
 * A primeira versão disto dizia que não havia enchimento, e a prova era falsa:
 * `decompress` para no alvo que recebe, então pedir `width * height` e receber
 * `width * height` não prova nada. Medindo o fluxo até o marcador de fim, o
 * tamanho real é `stride * height` em 591 das 591 imagens do Genie e em 100 de
 * 100 da Elaine.
 *
 * Só apareceu na Elaine porque ela tem 250 de largura. Genie e Merlin têm 128,
 * Clippit 124, Rover 80, Cop 400 — todos múltiplos de 4, onde `stride` é igual
 * a `width` e o erro não muda nada. O Genie tem UMA imagem de 166, e essa saía
 * torta desde o começo.
 */
function readImage(buf: Buffer, at: Location, palette: Palette): AcsImage {
  const width = buf.readUInt16LE(at.offset + 1)
  const height = buf.readUInt16LE(at.offset + 3)
  const dataSize = buf.readUInt32LE(at.offset + 6)
  const stride = (width + 3) & ~3
  const pixels = decompress(
    buf.subarray(at.offset + 10, at.offset + 10 + dataSize),
    stride * height,
    palette.transparentIndex,
  )

  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sourceRow = height - 1 - y
    for (let x = 0; x < width; x += 1) {
      const index = pixels[sourceRow * stride + x] ?? palette.transparentIndex
      const entry = index * 4
      const target = (y * width + x) * 4
      // RGBQUAD é azul, verde, vermelho, reservado.
      rgba[target] = palette.colors[entry + 2] ?? 0
      rgba[target + 1] = palette.colors[entry + 1] ?? 0
      rgba[target + 2] = palette.colors[entry] ?? 0
      rgba[target + 3] = index === palette.transparentIndex ? 0 : 255
    }
  }
  return { width, height, rgba }
}

// ---------------------------------------------------------------------------
// Animações
// ---------------------------------------------------------------------------

type ParsedAnimation = { animation: AcsAnimation; end: number }

/**
 * Bloco de uma animação:
 *
 * ```
 * ACSSTRING nome
 * BYTE      tipo de transição
 * ACSSTRING animação de retorno
 * USHORT    quantidade de quadros, seguida dos quadros
 * ```
 *
 * Cada quadro:
 *
 * ```
 * USHORT quantidade de camadas
 *   ULONG índice da imagem; SHORT deslocamento x; SHORT deslocamento y
 * SHORT  índice do áudio (-1 = mudo)
 * USHORT duração em centésimos de segundo
 * SHORT  quadro de saída
 * BYTE   quantidade de saltos
 *   USHORT quadro de destino; USHORT probabilidade
 * BYTE   quantidade de sobreposições de boca
 *   BYTE tipo; BYTE substitui; ULONG imagem; SHORT x; SHORT y; USHORT w; USHORT h
 * ```
 *
 * Provado pela soma: a leitura termina no último byte que o `LOCATION` promete
 * nas 76 animações do Genie.
 */
function readAnimation(buf: Buffer, at: Location): ParsedAnimation {
  const name = readString(buf, at.offset)
  let p = name.next
  const transitionType = buf.readUInt8(p)
  p += 1
  const returnAnimation = readString(buf, p)
  p = returnAnimation.next
  const frameCount = buf.readUInt16LE(p)
  p += 2

  const frames: AcsFrame[] = []
  const overlaysByFrame: AcsOverlay[][] = []
  for (let f = 0; f < frameCount; f += 1) {
    const imageCount = buf.readUInt16LE(p)
    p += 2
    const images: AcsFrameImage[] = []
    for (let i = 0; i < imageCount; i += 1) {
      images.push({
        imageIndex: buf.readUInt32LE(p),
        xOffset: buf.readInt16LE(p + 4),
        yOffset: buf.readInt16LE(p + 6),
      })
      p += 8
    }
    const audioIndex = buf.readInt16LE(p)
    const durationMs = buf.readUInt16LE(p + 2) * 10
    const exitFrameIndex = buf.readInt16LE(p + 4)
    p += 6

    const branchCount = buf.readUInt8(p)
    p += 1
    const branches: AcsBranch[] = []
    for (let i = 0; i < branchCount; i += 1) {
      branches.push({ frameIndex: buf.readUInt16LE(p), probability: buf.readUInt16LE(p + 2) })
      p += 4
    }

    const overlayCount = buf.readUInt8(p)
    p += 1
    const overlays: AcsOverlay[] = []
    for (let i = 0; i < overlayCount; i += 1) {
      overlays.push({
        type: buf.readUInt8(p),
        replaceTopImage: buf.readUInt8(p + 1) !== 0,
        imageIndex: buf.readUInt32LE(p + 2),
        xOffset: buf.readInt16LE(p + 6),
        yOffset: buf.readInt16LE(p + 8),
        width: buf.readUInt16LE(p + 10),
        height: buf.readUInt16LE(p + 12),
      })
      p += 14
    }

    frames.push({ images, durationMs, audioIndex, exitFrameIndex, branches })
    overlaysByFrame.push(overlays)
  }

  return {
    animation: {
      name: name.value,
      transitionType,
      returnAnimationName: returnAnimation.value,
      frames,
      overlaysByFrame,
    },
    end: p,
  }
}

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------

/**
 * Achata as camadas de um quadro numa imagem só, do tamanho do personagem.
 *
 * A lista de camadas vem da frente para trás (ver `AcsFrameImage`), então a
 * composição percorre ao contrário e cada camada só escreve onde é opaca.
 */
export function composeAcsFrame(character: AcsCharacter, frame: AcsFrame): AcsImage {
  const { width, height } = character
  const rgba = new Uint8Array(width * height * 4)
  for (let i = frame.images.length - 1; i >= 0; i -= 1) {
    const layer = frame.images[i]
    if (!layer) continue
    const image = character.images[layer.imageIndex]
    if (!image) continue
    for (let y = 0; y < image.height; y += 1) {
      const targetY = y + layer.yOffset
      if (targetY < 0 || targetY >= height) continue
      for (let x = 0; x < image.width; x += 1) {
        const targetX = x + layer.xOffset
        if (targetX < 0 || targetX >= width) continue
        const from = (y * image.width + x) * 4
        if ((image.rgba[from + 3] ?? 0) === 0) continue
        const to = (targetY * width + targetX) * 4
        rgba[to] = image.rgba[from] ?? 0
        rgba[to + 1] = image.rgba[from + 1] ?? 0
        rgba[to + 2] = image.rgba[from + 2] ?? 0
        rgba[to + 3] = 255
      }
    }
  }
  return { width, height, rgba }
}

/**
 * Lê um `.acs` inteiro: animações e imagens já em RGBA.
 *
 * Decodifica tudo de uma vez porque o uso previsto é converter o personagem
 * **uma vez** com `tools/acs-extract.mjs`. O Genie ocupa cerca de 39 MB de RGBA
 * enquanto isso acontece; se um dia o app precisar decodificar em tempo de
 * execução, é aqui que entra uma leitura sob demanda.
 */
export async function parseAcs(path: string): Promise<AcsCharacter> {
  const buf = await readFile(path)
  const signature = buf.readUInt32LE(0)
  if (signature !== SIGNATURE) {
    throw new Error(`assinatura ACS inesperada: 0x${signature.toString(16)}`)
  }

  // O cabeçalho tem 36 bytes (0x24) e as animações começam logo depois dele —
  // no Genie a primeira, RestPose, está exatamente no deslocamento 0x24.
  const characterInfo = readLocation(buf, 4)
  const animationInfo = readLocation(buf, 12)
  const imageInfo = readLocation(buf, 20)

  const palette = readPalette(buf, characterInfo)

  const images = readLocationList(buf, imageInfo).map((at) => readImage(buf, at, palette))

  // A lista de animações é `DWORD quantidade` seguida de `ACSSTRING nome` mais
  // `LOCATION`. Aqui a entrada não tem os 4 bytes extras da lista de imagens.
  const animations: AcsAnimation[] = []
  let p = animationInfo.offset
  const animationCount = buf.readUInt32LE(p)
  p += 4
  for (let i = 0; i < animationCount; i += 1) {
    const name = readString(buf, p)
    p = name.next
    const at = readLocation(buf, p)
    p += 8
    const parsed = readAnimation(buf, at)
    if (parsed.end !== at.offset + at.size) {
      throw new Error(`animação ${name.value} não fecha no tamanho declarado`)
    }
    // O nome aparece duas vezes: aqui na lista, com a caixa que o autor
    // escreveu (`RestPose`), e de novo dentro do bloco, sempre em maiúsculas
    // (`RESTPOSE`). Vale o da lista — é o nome que o mascote vai procurar.
    animations.push({ ...parsed.animation, name: name.value })
  }

  return {
    width: buf.readUInt16LE(characterInfo.offset + 28),
    height: buf.readUInt16LE(characterInfo.offset + 30),
    transparentColorIndex: palette.transparentIndex,
    animations,
    images,
  }
}
