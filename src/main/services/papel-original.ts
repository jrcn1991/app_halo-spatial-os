import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { t } from '@shared/i18n'
import type { WallpaperResult } from '@shared/ipc-contract'

const exec = promisify(execFile)

/**
 * O papel de parede que a pessoa tinha ANTES de o Halo trocar o primeiro.
 *
 * Achado da análise de portabilidade (24/09/2026): trocar de ambiente
 * substituía o fundo da sessão e o original se perdia — quem instalasse o app
 * perdia o papel de parede dele no primeiro clique num cartão. Agora, antes da
 * primeira troca, o main lê o que o Plasma tem em cada tela e guarda; a tela de
 * Ambiente oferece "Restaurar o meu papel de parede".
 *
 * Guardado UMA vez: o arquivo existindo, ninguém o reescreve — senão a segunda
 * troca guardaria o fundo do primeiro ambiente, e "o meu" passaria a ser o do
 * Halo. Mora no XDG de dados, como os papéis de parede e os mascotes, e não em
 * `settings.json`: é escrito pelo main, e ali entraria na lista de campos que
 * `saveSettings` precisa proteger.
 *
 * A leitura e a restauração falam com o plasmashell pelo `evaluateScript`, o
 * mesmo caminho que o vídeo de fundo já usa. É o próprio Plasma quem lê e
 * grava a configuração dele — o app não abre `plasma-org.kde.plasma.desktop-appletsrc`.
 */

const ARQUIVO = () =>
  join(
    process.env.XDG_DATA_HOME || join(homedir(), '.local/share'),
    'halo-spatial-os',
    'papel-original.json',
  )

/** O que cada tela tinha: o plugin e as chaves dele (`Image`, `Video`, `FillMode`…). */
type Tela = { plugin: string; config: Record<string, string | number | boolean> }

const LER =
  'print(JSON.stringify(desktops().map(function (d) {' +
  ' var p = d.wallpaperPlugin;' +
  ' d.currentConfigGroup = ["Wallpaper", p, "General"];' +
  ' var c = {}; d.configKeys.forEach(function (k) { c[k] = d.readConfig(k); });' +
  ' return { plugin: p, config: c }; })));'

/** Nome de plugin ou de chave: só o que o Plasma usa. O arquivo é editável à mão. */
const NOME = /^[\w.-]{1,120}$/

function valida(bruto: unknown): Tela[] | null {
  if (!Array.isArray(bruto) || bruto.length === 0) return null
  const telas: Tela[] = []
  for (const t of bruto) {
    if (!t || typeof t !== 'object') return null
    const { plugin, config } = t as Record<string, unknown>
    if (typeof plugin !== 'string' || !NOME.test(plugin)) return null
    if (!config || typeof config !== 'object') return null
    const limpa: Tela['config'] = {}
    for (const [k, v] of Object.entries(config)) {
      if (!NOME.test(k)) continue
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') limpa[k] = v
    }
    telas.push({ plugin, config: limpa })
  }
  return telas
}

async function plasma(script: string): Promise<string> {
  const { stdout } = await exec(
    'qdbus6',
    ['org.kde.plasmashell', '/PlasmaShell', 'org.kde.PlasmaShell.evaluateScript', script],
    { timeout: 10_000 },
  )
  return stdout
}

export const temPapelOriginal = (): boolean => existsSync(ARQUIVO())

/**
 * Guarda o fundo atual, se ainda não houver um guardado. Nunca falha para
 * quem chama: sem plasmashell não há o que guardar, e a troca segue — ficar
 * sem a volta é melhor do que travar o ambiente.
 */
export async function guardarPapelOriginal(): Promise<void> {
  const arquivo = ARQUIVO()
  if (existsSync(arquivo)) return
  try {
    const telas = valida(JSON.parse((await plasma(LER)).trim()))
    if (!telas) return
    mkdirSync(dirname(arquivo), { recursive: true })
    writeFileSync(`${arquivo}.tmp`, `${JSON.stringify(telas, null, 2)}\n`, 'utf8')
    renameSync(`${arquivo}.tmp`, arquivo)
  } catch {
    // Fora do KDE, ou o plasmashell não respondeu: fica sem a volta.
  }
}

/**
 * Devolve a cada tela o que ela tinha. Com mais telas agora do que quando foi
 * guardado, as novas recebem o fundo da primeira.
 *
 * O dado entra no script por `JSON.stringify`, nunca por concatenação: veio de
 * um arquivo editável à mão. E vai como ARGUMENTO do `execFile`, sem shell.
 */
export async function restaurarPapelOriginal(): Promise<WallpaperResult> {
  let telas: Tela[] | null = null
  try {
    telas = valida(JSON.parse(readFileSync(ARQUIVO(), 'utf8')))
  } catch {
    // ausente ou ilegível: cai na frase abaixo
  }
  if (!telas) return { ok: false, error: t('não há papel de parede original guardado') }

  const script =
    `var telas = ${JSON.stringify(telas)};` +
    ' desktops().forEach(function (d, i) {' +
    ' var t = telas[i] || telas[0];' +
    ' d.wallpaperPlugin = t.plugin;' +
    ' d.currentConfigGroup = ["Wallpaper", t.plugin, "General"];' +
    ' Object.keys(t.config).forEach(function (k) { d.writeConfig(k, t.config[k]); }); });'
  try {
    await plasma(script)
    return { ok: true, path: ARQUIVO() }
  } catch (error) {
    const e = error as NodeJS.ErrnoException
    return {
      ok: false,
      error:
        e.code === 'ENOENT'
          ? t('qdbus6 não está nesta máquina (ele vem com o pacote qdbus-qt6)')
          : t('o plasmashell não respondeu'),
    }
  }
}
