import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { t } from '@shared/i18n'
import { app } from 'electron'
import { arquivoSolto } from '../services/arquivo-solto'

/**
 * Ler o texto de uma imagem — e de um pedaço da tela.
 *
 * O "OCR & Search" do Notchy, com o tesseract que já está nesta máquina. Dois
 * caminhos: uma imagem que já existe (uma captura na gaveta) vai direto ao
 * tesseract; "ler a tela" pede ao Spectacle uma região (`-r`, o usuário
 * desenha o retângulo), que é salva num arquivo temporário DO APP, lida e
 * apagada — arquivo do usuário não é escrito em momento nenhum.
 *
 * Os idiomas são os que o tesseract tem instalados: `por` quando existe,
 * senão `eng` (que lê português sem acentos razoavelmente). A leitura diz
 * qual usou, para o usuário saber o que esperar.
 */

const run = promisify(execFile)
const TIMEOUT_MS = 30_000
/** Uma captura de tela 8K em PNG fica bem abaixo disto; acima, não é imagem para OCR. */
const OCR_MAX = 64 * 1024 * 1024

let idiomas: string | null = null

/** `por+eng` quando o pacote de português existe; senão o que houver. */
export async function idiomasDoOcr(): Promise<string> {
  if (idiomas) return idiomas
  const { stdout, stderr } = await run('tesseract', ['--list-langs'], { timeout: 5000 })
  const lista = `${stdout}\n${stderr}`
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[a-z_]+$/.test(l) && l !== 'osd')
  const escolha = ['por', 'eng'].filter((l) => lista.includes(l))
  idiomas = (escolha.length > 0 ? escolha : lista.slice(0, 1)).join('+') || 'eng'
  return idiomas
}

export async function lerTextoDaImagem(imagem: string): Promise<string> {
  if (!imagem.startsWith('/')) throw new Error(t('a imagem precisa de um caminho absoluto'))
  // O caminho vem do renderer: só arquivo comum, fora de `/proc` e afins.
  const { caminho } = await arquivoSolto(imagem, OCR_MAX)
  const lang = await idiomasDoOcr()
  const { stdout } = await run('tesseract', [caminho, 'stdout', '-l', lang], {
    timeout: TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  })
  const texto = stdout.replace(/\f/g, '').trim()
  if (!texto) throw new Error(t('nenhum texto reconhecido na imagem'))
  return texto
}

/** Uma região da tela, desenhada pelo usuário no Spectacle, lida e descartada. */
export async function lerTextoDaTela(): Promise<string> {
  // Pasta própria, criada agora e só nossa (0700): num nome previsível em
  // `/tmp` outro usuário da máquina podia criar o arquivo antes e trocar a
  // imagem lida (auditoria de 26/09/2026). `XDG_RUNTIME_DIR` já é só do
  // usuário; sem ele, o temporário do sistema.
  const base = process.env.XDG_RUNTIME_DIR || app.getPath('temp')
  const pasta = await mkdtemp(join(base, 'halo-ocr-'))
  const arquivo = join(pasta, 'regiao.png')
  try {
    // `-b` sem interface, `-n` sem notificação, `-r` região: o Spectacle só
    // volta depois que o usuário solta o retângulo (ou cancela, e aí não há
    // arquivo — o tesseract falha e a ilha diz que não deu).
    await run('spectacle', ['-b', '-n', '-r', '-o', arquivo], { timeout: 120_000 })
    return await lerTextoDaImagem(arquivo)
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {})
  }
}
