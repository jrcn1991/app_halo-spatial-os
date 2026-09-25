import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { DesktopApp } from '@shared/apps'

/**
 * Aplicativos instalados, pelos arquivos `.desktop` do padrão freedesktop.
 *
 * É o mesmo lugar de onde qualquer menu do Linux tira a lista — GNOME, KDE,
 * rofi. Abrir usa `gio launch`, que respeita o `.desktop` (variáveis, terminal,
 * campos de execução) em vez de tentar interpretar o `Exec` na mão.
 */

const run = promisify(execFile)
const DIRS = [
  '/usr/share/applications',
  '/usr/local/share/applications',
  '/var/lib/flatpak/exports/share/applications',
  join(homedir(), '.local/share/applications'),
]

function field(text: string, name: string): string | null {
  // Só a seção [Desktop Entry]; as ações extras têm campos de mesmo nome.
  const entry = text.split(/^\[/m).find((block) => block.startsWith('Desktop Entry]')) ?? text
  return new RegExp(`^${name}=(.*)$`, 'm').exec(entry)?.[1]?.trim() ?? null
}

async function parse(path: string): Promise<DesktopApp | null> {
  try {
    const text = await readFile(path, 'utf8')
    if (field(text, 'NoDisplay') === 'true' || field(text, 'Hidden') === 'true') return null
    if (field(text, 'Type') !== 'Application') return null

    const name = field(text, 'Name')
    if (!name) return null

    return {
      id: path,
      name,
      comment: field(text, 'Comment'),
      categories: (field(text, 'Categories') ?? '').split(';').filter(Boolean),
    }
  } catch {
    return null
  }
}

async function arquivosDesktop(): Promise<string[]> {
  const files: string[] = []
  for (const dir of DIRS) {
    try {
      const entries = await readdir(dir)
      files.push(...entries.filter((f) => f.endsWith('.desktop')).map((f) => join(dir, f)))
    } catch {
      // Diretório ausente nesta máquina: segue para o próximo.
    }
  }
  return files
}

export async function apps(): Promise<DesktopApp[]> {
  const files = await arquivosDesktop()
  const parsed = await Promise.all(files.map(parse))
  const found = parsed.filter((a): a is DesktopApp => a !== null)

  // Sem duplicatas por nome (o mesmo app pode vir de flatpak e do sistema).
  const unique = new Map(found.map((app) => [app.name, app]))
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/**
 * O `.desktop` instalado que responde por este id — ou `null`.
 *
 * O id vem do renderer (e, na ilha, até do remetente de uma notificação), e
 * `gio launch` roda o `Exec` de QUALQUER `.desktop` que receber: um arquivo
 * escrito numa pasta temporária viraria "rodar este comando". Por isso só
 * sai daqui um arquivo das pastas de aplicativos que a lista já varre.
 *
 * Aceita o caminho completo (o que `apps()` devolve como id) ou só o nome do
 * arquivo (o `desktop-entry` que uma notificação declara); neste caso a pasta
 * do usuário vence a do sistema, como no padrão freedesktop.
 */
export async function desktopConhecido(id: string): Promise<string | null> {
  if (!id.endsWith('.desktop')) return null
  const files = await arquivosDesktop()
  const achado = id.includes('/')
    ? files.find((f) => f === resolve(id))
    : files.reverse().find((f) => basename(f) === id)
  if (!achado) return null
  // Sem o filtro de `NoDisplay` de `parse`: o remetente de uma notificação
  // costuma ser um serviço escondido do menu, e abri-lo é legítimo.
  const text = await readFile(achado, 'utf8').catch(() => '')
  return field(text, 'Type') === 'Application' ? achado : null
}

export async function launchApp(id: string): Promise<void> {
  const caminho = await desktopConhecido(id)
  if (!caminho) throw new Error(`aplicativo desconhecido: ${id}`)
  // `--`: o caminho nunca é lido como opção do `gio`.
  await run('gio', ['launch', '--', caminho])
}
