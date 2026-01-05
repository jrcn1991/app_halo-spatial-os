import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Project } from '@shared/projects'

/**
 * Projetos locais — repositórios git de verdade desta máquina.
 *
 * A varredura é rasa (3 níveis a partir da pasta do usuário) e ignora pastas
 * pesadas: procurar em tudo travaria a abertura da tela por segundos.
 */

const run = promisify(execFile)
const ROOT = homedir()
const DEPTH = 3
const MAX = 12
const SKIP = new Set(['node_modules', '.cache', '.local', '.npm', 'snap', '.venv', 'venv', 'dist'])

async function findRepos(dir: string, depth: number, found: string[]): Promise<void> {
  if (depth > DEPTH || found.length >= MAX) return

  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null)
  if (!entries) return

  if (entries.some((e) => e.name === '.git')) {
    // Repositório encontrado: não descemos mais dentro dele.
    found.push(dir)
    return
  }

  await Promise.all(
    entries
      .filter((e) => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.'))
      .map((e) => findRepos(join(dir, e.name), depth + 1, found)),
  )
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, timeout: 4000 })
  return stdout.trim()
}

async function describe(path: string): Promise<Project | null> {
  try {
    const [branch, status, numstat, last] = await Promise.all([
      git(path, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'sem commits'),
      git(path, ['status', '--porcelain']),
      git(path, ['diff', '--numstat']).catch(() => ''),
      git(path, ['log', '-1', '--format=%s%n%cI']).catch(() => ''),
    ])

    const [insertions, deletions] = numstat
      .split('\n')
      .filter(Boolean)
      .reduce(
        ([add, del], line) => {
          const [a = '0', d = '0'] = line.split('\t')
          return [add + (Number(a) || 0), del + (Number(d) || 0)]
        },
        [0, 0],
      )

    const [subject = '', when = ''] = last.split('\n')
    return {
      name: path.split('/').at(-1) ?? path,
      path,
      branch,
      dirtyFiles: status.split('\n').filter(Boolean).length,
      insertions,
      deletions,
      lastCommit: subject,
      lastCommitAt: when || null,
    }
  } catch {
    return null
  }
}

/**
 * O que o git sabe sobre uma pasta escolhida à mão.
 *
 * `null` quando ela não é repositório — e isso é informação, não falha: a tela
 * do Claude aceita qualquer pasta como projeto, e mostrar "sem git" é melhor
 * que esconder a pasta ou inventar um branch.
 */
export async function projectInfo(path: string): Promise<Project | null> {
  return describe(path)
}

export async function projects(): Promise<Project[]> {
  const paths: string[] = []
  await findRepos(ROOT, 0, paths)

  const described = await Promise.all(paths.map(describe))
  return described
    .filter((p): p is Project => p !== null)
    .sort((a, b) => (b.lastCommitAt ?? '').localeCompare(a.lastCommitAt ?? ''))
}
