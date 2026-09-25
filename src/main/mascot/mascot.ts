import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { t } from '@shared/i18n'
import type { MascotAnimation, MascotFrame, MascotInfo } from '@shared/mascot'
import { acharAnimacao, MOOD_CANDIDATES } from '@shared/mascot'
import { currentSettings } from '../settings'
import { type AcsCharacter, composeAcsFrame, parseAcs } from './acs'
import { encodePng } from './png'

/**
 * O mascote, servido à tela do Claude.
 *
 * O `.acs` é lido e decodificado **uma vez** por caminho (ver `acs.ts`) e fica
 * em memória. Os pixels não vão junto com a informação do personagem: a tela
 * pede os quadros de uma animação quando vai tocá-la, e recebe PNGs prontos.
 * Mandar as 591 imagens de uma vez seriam megabytes atravessando o IPC por
 * nada — a tela toca uma animação de cada vez.
 */

let carregado: { path: string; character: AcsCharacter } | null = null
let carregando: Promise<AcsCharacter> | null = null

/** Cache dos quadros já compostos, por animação: compor custa e repete. */
const quadros = new Map<string, MascotAnimation>()
/* Teto: o pool de ocioso tem 37–70 animações por personagem, e sem teto o
   main guardava os PNGs de TODAS as já tocadas (DESEMPENHO.md, P2-11). Vinte
   cobrem os estados e as bobagens recentes; a menos usada sai. */
const QUADROS_MAX = 20

function caminho(): string {
  return currentSettings().mascot.file
}

async function personagem(): Promise<AcsCharacter> {
  const alvo = caminho()
  if (!alvo) throw new Error(t('nenhum personagem escolhido'))
  if (carregado?.path === alvo) return carregado.character

  carregando ??= parseAcs(alvo).then(
    (character) => {
      carregado = { path: alvo, character }
      quadros.clear()
      carregando = null
      return character
    },
    (erro: unknown) => {
      carregando = null
      throw erro
    },
  )
  return carregando
}

/** Um PNG `data:` a partir dos pixels de um quadro composto. */
function paraPng(largura: number, altura: number, rgba: Uint8Array): string {
  return `data:image/png;base64,${encodePng(largura, altura, rgba).toString('base64')}`
}

export async function mascotInfo(): Promise<MascotInfo> {
  const alvo = caminho()
  const vazio: MascotInfo = {
    ready: false,
    name: '',
    width: 0,
    height: 0,
    animations: [],
    moods: {
      chegando: null,
      ocioso: null,
      pensando: null,
      ferramenta: null,
      erro: null,
      comemorando: null,
    },
    error: null,
  }
  if (!alvo) return vazio

  try {
    const ch = await personagem()
    const nomes = ch.animations.map((a) => a.name)
    // Cada estado vira o primeiro candidato que ESTE personagem tem: o Genie
    // não tem as mesmas animações que o Clippy, e forçar um nome fixo faria o
    // mascote não reagir em metade dos personagens.
    const moods = Object.fromEntries(
      Object.entries(MOOD_CANDIDATES).map(([mood, candidatos]) => [
        mood,
        acharAnimacao(nomes, candidatos),
      ]),
    ) as MascotInfo['moods']

    return {
      ready: true,
      name: basename(alvo).replace(/\.acs$/i, ''),
      width: ch.width,
      height: ch.height,
      animations: nomes,
      moods,
      error: null,
    }
  } catch (erro) {
    return { ...vazio, name: basename(alvo), error: (erro as Error).message.slice(0, 140) }
  }
}

/** Os quadros de uma animação, já em PNG. */
export async function mascotAnimation(nome: string): Promise<MascotAnimation> {
  const guardada = quadros.get(nome)
  if (guardada) {
    // Reinsere para ficar como a mais recente (LRU pela ordem do Map).
    quadros.delete(nome)
    quadros.set(nome, guardada)
    return guardada
  }

  const ch = await personagem()
  const animacao = ch.animations.find((a) => a.name === nome)
  if (!animacao) throw new Error(t('o personagem não tem a animação "{nome}"', { nome }))

  const lista: MascotFrame[] = []
  for (const quadro of animacao.frames) {
    // O último quadro de muitas animações é um terminador vazio: sem camadas e
    // com duração zero. Ele marca o fim no formato, não é para ser desenhado.
    if (quadro.images.length === 0) continue
    const composto = composeAcsFrame(ch, quadro)
    lista.push({
      image: paraPng(composto.width, composto.height, composto.rgba),
      // Chão de 40ms: o formato aceita zero, e um quadro de duração zero
      // faria a animação piscar sem ser vista.
      durationMs: Math.max(40, quadro.durationMs),
    })
  }

  const pronta: MascotAnimation = { name: nome, frames: lista }
  quadros.set(nome, pronta)
  while (quadros.size > QUADROS_MAX) {
    const antiga = quadros.keys().next().value
    if (antiga === undefined) break
    quadros.delete(antiga)
  }
  return pronta
}

/**
 * A pasta dos personagens.
 *
 * Fica em `~/.local/share` (o lugar do XDG para dado de aplicativo), e não no
 * repositório: os `.acs` são arquivos do usuário, e alguns têm licença que não
 * permitiria redistribuir.
 */
export function mascotFolder(): string {
  return join(homedir(), '.local/share/halo-spatial-os/mascotes')
}

/** Um personagem disponível para escolher. */
export type MascotChoice = { file: string; name: string; current: boolean }

/**
 * Os personagens que dá para escolher.
 *
 * A pasta da biblioteca, mais o que estiver escolhido agora — se o usuário
 * apontou um `.acs` de outro lugar, ele continua na lista em vez de sumir.
 */
export async function mascotList(): Promise<MascotChoice[]> {
  const pasta = mascotFolder()
  const atual = caminho()
  let nomes: string[] = []
  try {
    nomes = (await readdir(pasta)).filter((n) => /\.acs$/i.test(n))
  } catch {
    // Pasta ainda não existe: só o que estiver escolhido aparece.
  }

  const lista = nomes.map((nome) => ({
    file: join(pasta, nome),
    name: nome.replace(/\.acs$/i, ''),
    current: join(pasta, nome) === atual,
  }))
  if (atual && !lista.some((c) => c.file === atual)) {
    lista.push({ file: atual, name: basename(atual).replace(/\.acs$/i, ''), current: true })
  }
  return lista.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/**
 * Copia um `.acs` para a biblioteca.
 *
 * Copiar, e não só apontar: o arquivo escolhido pode estar numa pasta
 * temporária ou num pendrive, e o personagem sumiria na próxima abertura.
 */
export async function mascotAdd(origem: string): Promise<string> {
  const pasta = mascotFolder()
  await mkdir(pasta, { recursive: true })
  const destino = join(pasta, basename(origem))
  if (destino !== origem) await copyFile(origem, destino)
  return destino
}

/** Cache das amostras: compor de novo a cada abertura da tela seria desperdício. */
const amostras = new Map<string, string>()

/**
 * Uma imagem de um personagem, para a tela de escolha.
 *
 * Decodifica o arquivo inteiro para tirar um quadro — é o preço de mostrar
 * quem é cada um. Fica em cache, e o personagem decodificado é descartado: são
 * megabytes de pixels que só interessam a quem está escolhido.
 */
export async function mascotPreview(arquivo: string): Promise<string> {
  const guardada = amostras.get(arquivo)
  if (guardada) return guardada

  const ch = await parseAcs(arquivo)
  const pose =
    ch.animations.find((a) => a.name === 'RestPose') ??
    ch.animations.find((a) => a.frames.some((f) => f.images.length > 0))
  const quadro = pose?.frames.find((f) => f.images.length > 0)
  if (!quadro) throw new Error(t('personagem sem quadro desenhável'))

  const composto = composeAcsFrame(ch, quadro)
  const png = paraPng(composto.width, composto.height, composto.rgba)
  amostras.set(arquivo, png)
  return png
}
