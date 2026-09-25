#!/usr/bin/env node
/**
 * Confere que todo texto marcado para tradução tem a versão em inglês.
 *
 * O português é a chave (`t('Configurações')`, `marcar('Animação')`), e o
 * inglês mora em `src/shared/i18n/en/<área>.ts`. Sem este guarda, um texto novo
 * escrito só em português passaria em tudo e apareceria em português para quem
 * escolheu inglês — em silêncio. Também acusa:
 *   - `t()` com template literal que tenha `${…}` (a frase tem de ser uma chave
 *     fixa; o que varia entra por `{nome}` e `vars`);
 *   - a mesma chave com traduções DIFERENTES em duas áreas.
 *
 *   node tools/i18n-check.mjs            # falha se faltar tradução
 *   node tools/i18n-check.mjs --sobras   # lista também chaves que ninguém usa
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from './lib/harness.mjs'

const DIR_EN = join(ROOT, 'src/shared/i18n/en')
const dicionario = new Map()
const conflitos = []
for (const arquivo of readdirSync(DIR_EN).filter((f) => f.endsWith('.ts') && f !== 'index.ts')) {
  const modulo = await import(join(DIR_EN, arquivo))
  for (const tabela of Object.values(modulo)) {
    for (const [pt, en] of Object.entries(tabela)) {
      const ja = dicionario.get(pt)
      if (ja && ja.en !== en)
        conflitos.push(`"${pt}": ${ja.area} diz "${ja.en}", ${arquivo} diz "${en}"`)
      if (typeof en !== 'string' || !en.trim())
        conflitos.push(`"${pt}" (${arquivo}) sem texto em inglês`)
      dicionario.set(pt, { en, area: arquivo })
    }
  }
}

function arquivos(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return nome === 'i18n' ? [] : arquivos(caminho)
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : []
  })
}

// `t(` ou `marcar(` seguido de UM literal: aspas simples, duplas ou crase.
const CHAMADA = /\b(?:t|marcar)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
const faltando = new Map()
const dinamicos = []
const usadas = new Set()
for (const arquivo of arquivos(join(ROOT, 'src'))) {
  const texto = readFileSync(arquivo, 'utf8')
  for (const m of texto.matchAll(CHAMADA)) {
    const [, aspa, bruto] = m
    const antes = texto.slice(0, m.index)
    const linha = antes.split('\n').length
    // Exemplo em comentário não é texto de tela.
    const inicioDaLinha = antes.slice(antes.lastIndexOf('\n') + 1).trim()
    if (inicioDaLinha.startsWith('*') || inicioDaLinha.startsWith('//')) continue
    const onde = `${relative(ROOT, arquivo)}:${linha}`
    if (aspa === '`' && bruto.includes('${')) {
      dinamicos.push(`${onde}  t(\`${bruto.slice(0, 60)}…\`) — use {nome} e vars`)
      continue
    }
    // O literal como o JavaScript o lê: `\'` vira `'`, `\n` vira quebra.
    const chave =
      aspa === '`'
        ? bruto
        : JSON.parse(
            `"${bruto.replace(/\\'/g, "'").replace(/"/g, '\\"').replace(/\\\\"/g, '\\"')}"`,
          )
    usadas.add(chave)
    if (!dicionario.has(chave)) faltando.set(chave, onde)
  }
}

let falhou = false
if (conflitos.length) {
  falhou = true
  console.log(`✗ ${conflitos.length} chave(s) com traduções diferentes:`)
  for (const c of conflitos) console.log(`  ${c}`)
}
if (dinamicos.length) {
  falhou = true
  console.log(`✗ ${dinamicos.length} t() com trecho variável dentro da chave:`)
  for (const d of dinamicos) console.log(`  ${d}`)
}
if (faltando.size) {
  falhou = true
  console.log(`✗ ${faltando.size} texto(s) sem inglês:`)
  for (const [chave, onde] of faltando) console.log(`  ${onde}  "${chave.slice(0, 90)}"`)
}
if (process.argv.includes('--sobras')) {
  const sobras = [...dicionario.keys()].filter((k) => !usadas.has(k))
  console.log(`· ${sobras.length} chave(s) no dicionário que nenhum t()/marcar() usa`)
  for (const s of sobras.slice(0, 50)) console.log(`  "${s.slice(0, 90)}"`)
}
if (falhou) process.exit(1)
console.log(`✓ ${usadas.size} textos marcados, todos com inglês · ${dicionario.size} no dicionário`)
