import { execFile } from 'node:child_process'
import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { ENVIRONMENTS, type EnvironmentId, environmentById } from '@shared/environments'
import type { WallpaperResult } from '@shared/ipc-contract'
import { app, nativeImage } from 'electron'
import { currentSettings } from '../settings'
import { guardarPapelOriginal } from './papel-original'

const exec = promisify(execFile)

/**
 * Troca o papel de parede da sessão do Plasma.
 *
 * EXCEÇÃO AUTORIZADA à regra "nunca escrever fora do app para conseguir um
 * efeito de sistema" (CLAUDE.md § Janela e camada). O usuário pediu
 * explicitamente que escolher um ambiente troque o papel de parede da máquina;
 * é a ÚNICA coisa que o ambiente muda lá fora — o tema é da aplicação.
 *
 * O caminho é o `plasma-apply-wallpaperimage`, utilitário oficial do KDE
 * (kdeplasma-addons): ele fala com o plasmashell pelo D-Bus e grava em
 * `~/.config/plasma-org.kde.plasma.desktop-appletsrc`. Escrever nesse arquivo
 * à mão foi descartado — o Plasma o mantém em memória e o reescreveria por
 * cima, e o formato (uma seção por containment) muda entre versões.
 *
 * Medido nesta máquina (Plasma 6): sucesso sai com código 0 e uma frase no
 * stdout; arquivo inexistente sai com código 1 e a explicação. Por isso o erro
 * vira texto para a tela mostrar, em vez de virar exceção silenciosa.
 */

/** Fora do KDE (ou sem o pacote) o utilitário não existe — e isso é uma frase, não um crash. */
const COMANDO = 'plasma-apply-wallpaperimage'

/**
 * Onde está a imagem daquele ambiente.
 *
 * O que o usuário configurou vem primeiro; vazio cai no padrão do ambiente,
 * que é relativo à pasta do usuário (ver `shared/environments.ts`).
 */
export function wallpaperPath(id: EnvironmentId): string {
  const escolhido = currentSettings().environment.wallpapers[id]
  if (escolhido) return escolhido
  const padrao = environmentById(id)?.wallpaper
  if (!padrao) return ''
  const destino = join(homedir(), padrao)
  materializar(id, destino)
  return destino
}

/**
 * Papéis de parede que vêm COM o app, e onde eles ficam no pacote.
 *
 * Os QUATRO ambientes prontos têm a sua, e a imagem PERTENCE ao ambiente — não
 * é uma foto que já estava na máquina, e por isso viaja com o app. A
 * proveniência de cada uma está em `docs/MOCKS.md`.
 *
 * É isto que faz o app abrir inteiro numa máquina nova: sem nenhuma
 * configuração, cada ambiente acha o papel de parede dele. Ambiente novo que
 * queira o seu entra aqui e em `extraResources`, no `electron-builder.yml`.
 */
const EMBUTIDOS: Partial<Record<EnvironmentId, string>> = {
  bioshock: 'env/bioshock/fundo.jpg',
  citypop: 'env/citypop/fundo.jpg',
  floresta: 'env/floresta/fundo.jpg',
  cyberpunk: 'env/cyberpunk/fundo.jpg',
}

/**
 * Põe no disco, uma vez, o papel de parede que veio no pacote.
 *
 * O `plasma-apply-wallpaperimage` precisa de um ARQUIVO de verdade, e num app
 * empacotado a imagem estaria dentro do asar — que não é um caminho que outro
 * programa consiga abrir. Por isso ela é copiada para
 * `~/.local/share/halo-spatial-os/wallpapers/`, o mesmo padrão que os mascotes
 * já usam (`src/main/mascot/mascot.ts`): o que o app precisa que exista fora
 * dele vai para o lugar do XDG, e fica.
 *
 * Copia só se ainda não estiver lá: assim o usuário pode trocar o arquivo por
 * outro sem o app desfazer a troca na próxima abertura. E quem quiser apontar
 * outra imagem tem `environment.wallpapers.bioshock`, que vem antes disto.
 */
function materializar(id: EnvironmentId, destino: string): void {
  const relativo = EMBUTIDOS[id]
  if (!relativo) return
  try {
    if (statSync(destino).isFile()) return
  } catch {
    // Ainda não existe: é o caso normal da primeira vez.
  }
  try {
    mkdirSync(dirname(destino), { recursive: true })
    copyFileSync(origemEmbutida(relativo), destino)
  } catch {
    // Sem a imagem, `applyWallpaper` devolve "não encontrada" e a tela diz.
  }
}

/**
 * Onde a imagem empacotada está, nos dois modos de execução.
 *
 * Empacotado ela vai em `extraResources` (ver `electron-builder.yml`), FORA do
 * asar de propósito — dentro dele não haveria arquivo para copiar. Em
 * desenvolvimento ela está onde o renderer a guarda, ao lado dos outros
 * recursos do ambiente; `import.meta.dirname` é `out/main`.
 */
function origemEmbutida(relativo: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, relativo)
    : join(import.meta.dirname, '../../src/renderer/assets', relativo)
}

/**
 * O plugin que toca VÍDEO como papel de parede.
 *
 * Pedido do usuário (13/09/2026): um ambiente pode ter um vídeo de fundo. O
 * plugin NÃO é do app — é o `org.local.videowallpaper`, que o usuário instalou
 * na pasta dele —, e por isso o Halo só o escolhe e aponta o arquivo, sem
 * nunca editar nem instalar o plugin. O contrato dele é uma chave só
 * (`Video`, uma URL `file://`); sem som, em loop e cobrindo a tela são fixos
 * no QML dele. Sem o plugin, a imagem do ambiente fica e a tela diz por quê.
 *
 * Continua sendo a MESMA exceção do papel de parede, pelo mesmo interruptor:
 * o que muda é o fundo da sessão, gravado pelo próprio plasmashell.
 */
const PLUGIN_DE_VIDEO = 'org.local.videowallpaper'

/** As que o plugin aceita. Testado de verdade só `.mp4` H.264. */
export const EXTENSOES_DE_VIDEO = ['mp4', 'webm', 'mkv', 'mov', 'm4v', 'avi'] as const

/** Onde o Plasma procura plugins de papel de parede: o do usuário e o do sistema. */
export function pluginDeVideoInstalado(): boolean {
  const doUsuario = process.env.XDG_DATA_HOME || join(homedir(), '.local/share')
  return [doUsuario, '/usr/share'].some((base) => {
    try {
      return statSync(join(base, 'plasma/wallpapers', PLUGIN_DE_VIDEO, 'metadata.json')).isFile()
    } catch {
      return false
    }
  })
}

export async function applyWallpaper(id: EnvironmentId): Promise<WallpaperResult> {
  const ambiente = environmentById(id)
  if (!ambiente) return { ok: false, error: `ambiente desconhecido: ${id}` }

  // Antes da PRIMEIRA troca, o fundo que a pessoa tinha fica guardado — é a
  // volta de "Restaurar o meu papel de parede" (ver `papel-original.ts`).
  await guardarPapelOriginal()
  const imagem = await aplicarImagem(ambiente.name, wallpaperPath(id))
  const video = currentSettings().environment.videos[id]
  if (!video) return imagem

  // A imagem vai ANTES, mesmo havendo vídeo: ela é a capa do ambiente. É o
  // que fica se o vídeo não tocar, e um serviço do usuário que lê o `Image=`
  // do Plasma (para tingir ícones, por exemplo) depende dele — e o plugin de
  // vídeo não o escreve. O custo é a imagem aparecer por um instante antes do vídeo.
  const resultado = await aplicarVideo(video)
  if (resultado.ok || !imagem.ok) return resultado
  return { ok: false, error: `${resultado.error} — ficou a imagem do ambiente` }
}

async function aplicarVideo(caminho: string): Promise<WallpaperResult> {
  if (!isAbsolute(caminho)) return { ok: false, error: `caminho não é absoluto: ${caminho}` }
  const extensao = extname(caminho).slice(1).toLowerCase()
  if (!(EXTENSOES_DE_VIDEO as readonly string[]).includes(extensao)) {
    return { ok: false, error: `não parece um vídeo: ${caminho}` }
  }
  try {
    if (!statSync(caminho).isFile()) return { ok: false, error: `não é um arquivo: ${caminho}` }
  } catch {
    return { ok: false, error: `vídeo não encontrado: ${caminho}` }
  }
  if (!pluginDeVideoInstalado()) {
    return {
      ok: false,
      error: `o vídeo precisa do plugin "Vídeo" do Plasma (${PLUGIN_DE_VIDEO}), que não está nesta máquina`,
    }
  }

  // O mesmo script que o plugin documenta, em todas as telas. A URL vai
  // codificada (espaço e acento — "Área de trabalho" — viram %xx) e entra no
  // JavaScript por `JSON.stringify`, nunca por concatenação: o caminho é do
  // usuário e pode ter aspas. E vai como ARGUMENTO do `execFile`, sem shell.
  const url = JSON.stringify(pathToFileURL(caminho).href)
  const plugin = JSON.stringify(PLUGIN_DE_VIDEO)
  const script =
    `var url = ${url}; desktops().forEach(function (d) {` +
    ` d.wallpaperPlugin = ${plugin};` +
    ` d.currentConfigGroup = ["Wallpaper", ${plugin}, "General"];` +
    ` d.writeConfig("Video", url); });`
  try {
    await exec(
      'qdbus6',
      ['org.kde.plasmashell', '/PlasmaShell', 'org.kde.PlasmaShell.evaluateScript', script],
      { timeout: 10_000 },
    )
    return { ok: true, path: caminho }
  } catch (error) {
    return { ok: false, error: motivo(error, caminho, 'qdbus6') }
  }
}

/**
 * Para o vídeo de fundo ANTES de trocar o plugin.
 *
 * Medido em 24/09/2026: com o plasmashell aberto havia 35 horas, uma troca de
 * vídeo para imagem deixou o vídeo TOCANDO numa das duas telas — a
 * configuração dizia imagem (e até cor sólida, testada à parte), e a tela
 * seguia mostrando o vídeo por cima. O papel de parede foi destruído, mas a
 * saída de vídeo do QtMultimedia ficou desenhando na janela do desktop; só o
 * reinício do plasmashell a tirou. Não reproduziu em seis tentativas com o
 * plasmashell recém-aberto, e o defeito é do Qt, não do plugin nem do app.
 *
 * O que o app pode fazer é não sair do vídeo com ele tocando: esvaziar a
 * fonte faz o `MediaPlayer` do plugin parar (`source` vazia), e só então o
 * plugin é trocado. Se a saída vazar de novo, ela vaza PARADA. Custa um
 * processo a mais só quando alguma tela está no vídeo — o script devolve
 * cedo nas outras.
 */
async function pararVideo(): Promise<void> {
  const plugin = JSON.stringify(PLUGIN_DE_VIDEO)
  const script =
    'var n = 0; desktops().forEach(function (d) {' +
    ` if (d.wallpaperPlugin !== ${plugin}) return;` +
    ` d.currentConfigGroup = ["Wallpaper", ${plugin}, "General"];` +
    ' d.writeConfig("Video", ""); n++; }); print(n);'
  try {
    const { stdout } = await exec(
      'qdbus6',
      ['org.kde.plasmashell', '/PlasmaShell', 'org.kde.PlasmaShell.evaluateScript', script],
      { timeout: 5_000 },
    )
    // O player precisa de um instante para soltar o decodificador.
    if (Number(stdout.trim()) > 0) await new Promise((ok) => setTimeout(ok, 400))
  } catch {
    // Sem qdbus6 ou sem plasmashell: a troca segue como sempre foi.
  }
}

async function aplicarImagem(nome: string, caminho: string): Promise<WallpaperResult> {
  // Ambiente sem imagem não é erro de instalação: Floresta e Cyberpunk nascem
  // assim de propósito (ver `shared/environments.ts`). A frase diz ONDE
  // resolver, como a regra do projeto pede — não "não configurado".
  if (!caminho) {
    return {
      ok: false,
      error: `${nome} ainda não tem imagem — escolha uma em Configurações → Ambiente.`,
    }
  }

  // Absoluto e existente ANTES de chamar o utilitário: assim o erro na tela
  // diz o que houve, em vez de repetir a mensagem genérica dele.
  if (!isAbsolute(caminho)) return { ok: false, error: `caminho não é absoluto: ${caminho}` }
  try {
    if (!statSync(caminho).isFile()) return { ok: false, error: `não é um arquivo: ${caminho}` }
  } catch {
    return { ok: false, error: `imagem não encontrada: ${caminho}` }
  }

  await pararVideo()
  try {
    await exec(COMANDO, [caminho], { timeout: 10_000 })
    return { ok: true, path: caminho }
  } catch (error) {
    return { ok: false, error: motivo(error, caminho) }
  }
}

/** A primeira linha do que o utilitário disse — ou o que faltou nesta máquina. */
function motivo(error: unknown, caminho: string, comando: string = COMANDO): string {
  const e = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
  if (e.code === 'ENOENT') {
    const origem = comando === COMANDO ? 'o KDE Plasma' : 'o pacote qdbus-qt6'
    return `${comando} não está nesta máquina (ele vem com ${origem})`
  }
  const saida = `${e.stdout ?? ''}\n${e.stderr ?? ''}`
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l)
  return saida || `não consegui aplicar ${caminho}`
}

/**
 * As miniaturas dos papéis de parede, para o painel de Ambientes mostrar cada
 * tema com a imagem dele.
 *
 * Quem lê o disco é o main: o renderer não o alcança (a CSP dele permite
 * `img-src 'self' data:` e nada de `file:`), e é a mesma travessia que a capa
 * do MPRIS já faz — arquivo vira `data:` aqui, e só então atravessa. A imagem
 * encolhe antes de viajar: o papel de parede do Cyberpunk tem 3840×2160, e
 * mandar isso pelo IPC para desenhar um quadrado de 246×76 seria desperdício.
 *
 * `nativeImage` é do próprio Electron — sem dependência nova — e devolve JPEG,
 * que num fundo fotográfico pesa uma fração do PNG.
 */
const LARGURA_PREVIA = 480
const QUALIDADE_PREVIA = 72

/** Miniatura por caminho, invalidada pela data de modificação do arquivo. */
const previas = new Map<string, { mtimeMs: number; url: string }>()

export function wallpaperPreviews(): Partial<Record<EnvironmentId, string>> {
  const saida: Partial<Record<EnvironmentId, string>> = {}
  for (const ambiente of ENVIRONMENTS) {
    const caminho = wallpaperPath(ambiente.id)
    if (!caminho || !isAbsolute(caminho)) continue
    try {
      const info = statSync(caminho)
      if (!info.isFile()) continue
      const guardada = previas.get(caminho)
      if (guardada?.mtimeMs === info.mtimeMs) {
        saida[ambiente.id] = guardada.url
        continue
      }
      const imagem = nativeImage.createFromPath(caminho)
      // Arquivo que não é imagem (ou que o Electron não decodifica) volta
      // vazio: aí o quadrado fica com as listras de sempre, sem mentir.
      if (imagem.isEmpty()) continue
      const url = `data:image/jpeg;base64,${imagem
        .resize({ width: LARGURA_PREVIA, quality: 'good' })
        .toJPEG(QUALIDADE_PREVIA)
        .toString('base64')}`
      previas.set(caminho, { mtimeMs: info.mtimeMs, url })
      saida[ambiente.id] = url
    } catch {
      // Sumiu, sem permissão, ilegível: o ambiente fica sem prévia.
    }
  }
  return saida
}
