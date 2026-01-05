import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
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

export async function apps(): Promise<DesktopApp[]> {
  const files: string[] = []
  for (const dir of DIRS) {
    try {
      const entries = await readdir(dir)
      files.push(...entries.filter((f) => f.endsWith('.desktop')).map((f) => join(dir, f)))
    } catch {
      // Diretório ausente nesta máquina: segue para o próximo.
    }
  }

  const parsed = await Promise.all(files.map(parse))
  const found = parsed.filter((a): a is DesktopApp => a !== null)

  // Sem duplicatas por nome (o mesmo app pode vir de flatpak e do sistema).
  const unique = new Map(found.map((app) => [app.name, app]))
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function launchApp(id: string): Promise<void> {
  await run('gio', ['launch', id])
}
