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
 *   - a mesma chave com traduções DIFERENTES em duas áreas;
 *   - chave do dicionário que não aparece em lugar nenhum do código (sobra).
 *
 * A sobra é conferida por LITERAL, não por `t()`: boa parte das chaves chega
 * ao `t()` por variável — os nomes das entradas (`t(nome)`), os erros do
 * script do KWin (`t(r.erro)`), os dois braços de um plural
 * (`t(n === 1 ? 'a' : 'b')`). Uma chave só é sobra quando o texto dela não
 * existe entre aspas em nenhum arquivo de `src/` — aí não há caminho pelo qual
 * ela chegue à tela, e ela só engorda o dicionário e engana quem traduz.
 *
 *   node tools/i18n-check.mjs   # falha se faltar tradução ou sobrar chave
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
// Os dois braços de um plural: `t(n === 1 ? 'a' : 'b', …)`. Sem isto, o
// singular e o plural escapavam da conferência de tradução.
const TERNARIO =
  /\b(?:t|marcar)\(\s*[^'"`()?;]{1,120}\?\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*:\s*(['"])((?:\\.|(?!\3)[^\\])*)\3/g

/** O literal como o JavaScript o lê: `\'` vira `'`, `\n` vira quebra. */
const ler = (aspa, bruto) =>
  aspa === '`'
    ? bruto
    : JSON.parse(`"${bruto.replace(/\\'/g, "'").replace(/"/g, '\\"').replace(/\\\\"/g, '\\"')}"`)

const faltando = new Map()
const dinamicos = []
const usadas = new Set()
const fontes = []
for (const arquivo of arquivos(join(ROOT, 'src'))) {
  const texto = readFileSync(arquivo, 'utf8')
  fontes.push(texto)
  const ondeEsta = (indice) => {
    const antes = texto.slice(0, indice)
    // Exemplo em comentário não é texto de tela.
    const inicioDaLinha = antes.slice(antes.lastIndexOf('\n') + 1).trim()
    if (inicioDaLinha.startsWith('*') || inicioDaLinha.startsWith('//')) return null
    return `${relative(ROOT, arquivo)}:${antes.split('\n').length}`
  }
  for (const m of texto.matchAll(CHAMADA)) {
    const [, aspa, bruto] = m
    const onde = ondeEsta(m.index)
    if (!onde) continue
    if (aspa === '`' && bruto.includes('${')) {
      dinamicos.push(`${onde}  t(\`${bruto.slice(0, 60)}…\`) — use {nome} e vars`)
      continue
    }
    const chave = ler(aspa, bruto)
    usadas.add(chave)
    if (!dicionario.has(chave)) faltando.set(chave, onde)
  }
  for (const m of texto.matchAll(TERNARIO)) {
    const onde = ondeEsta(m.index)
    if (!onde) continue
    for (const chave of [ler(m[1], m[2]), ler(m[3], m[4])]) {
      usadas.add(chave)
      if (!dicionario.has(chave)) faltando.set(chave, onde)
    }
  }
}

// Sobra: chave cujo texto não aparece entre aspas em arquivo nenhum de `src/`
// (fora do próprio dicionário). Ver o cabeçalho — `t()` por variável conta.
const todoOCodigo = fontes.join('\n')
const aparece = (chave) => {
  const formas = new Set([chave, chave.replace(/'/g, "\\'"), JSON.stringify(chave).slice(1, -1)])
  for (const forma of formas)
    for (const aspa of ["'", '"', '`'])
      if (todoOCodigo.includes(`${aspa}${forma}${aspa}`)) return true
  // Chave de objeto sem aspas (`Cascata: '…'`, em `styles/entrances.ts`).
  return (
    /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(chave) &&
    new RegExp(`[\\s{,]${chave}\\s*:`, 'u').test(todoOCodigo)
  )
}
const sobras = [...dicionario.keys()].filter((k) => !usadas.has(k) && !aparece(k))

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
if (sobras.length) {
  falhou = true
  console.log(`✗ ${sobras.length} chave(s) no dicionário que o código não usa em lugar nenhum:`)
  for (const s of sobras) console.log(`  ${dicionario.get(s).area}  "${s.slice(0, 90)}"`)
}
if (falhou) process.exit(1)
console.log(
  `✓ ${usadas.size} textos marcados, todos com inglês · ${dicionario.size} no dicionário, sem sobras`,
)
