#!/usr/bin/env node
/**
 * Guarda de layout.
 *
 * Compara a geometria dos painéis com uma baseline própria do projeto — não
 * mais com o protótipo. O handoff virou referência de design; o que precisa
 * continuar estável é o app não mudar de forma sem alguém decidir.
 *
 * Duas verificações:
 *   1. cada painel de vidro na posição e tamanho da baseline (tolerância 0,5px)
 *   2. nenhum painel invade o dock, em nenhuma tela
 *
 *   npm run build && npm run layout
 *   npm run layout -- --update    aceita a forma atual como nova baseline
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { APP_SCREENS, gotoScreen, newContext, ROOT, SETTLE, serveApp } from './lib/harness.mjs'

const BASELINE = join(ROOT, 'tools/baseline/layout.json')
const TOLERANCE = 0.5
const update = process.argv.includes('--update')

/**
 * Painéis e barras do app. Todos têm `data-halo-in`, que é como o CSS global
 * anima a entrada — serve também para encontrá-los sem depender de classe.
 */
const PROBE = `(() => {
  const nav = document.querySelector('nav[aria-label="Telas"]')
  const dock = nav.getBoundingClientRect()
  const panels = [...document.querySelectorAll('[data-halo-in="side"],[data-halo-in="center"]')]
    .map((el) => el.getBoundingClientRect())
    .map((r) => ({ x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }))
    .sort((a, b) => a.x - b.x)

  // Navegação embutida: a coluna mora DENTRO do painel central, de propósito —
  // não é invasão. Só o dock flutuante entra na conta.
  const embedded = !!nav.closest('[data-halo-in="center"]')
  const bars = [...(embedded ? [] : [dock]), ...[...document.querySelectorAll('[data-halo-in="transport"]')].map((e) => e.getBoundingClientRect())]
  const invasores = []
  for (const el of document.querySelectorAll('[data-halo-in="side"],[data-halo-in="center"]')) {
    const r = el.getBoundingClientRect()
    for (const bar of bars) {
      const dx = Math.min(r.right, bar.right) - Math.max(r.left, bar.left)
      const dy = Math.min(r.bottom, bar.bottom) - Math.max(r.top, bar.top)
      if (dx > 2 && dy > 2) invasores.push(Math.round(Math.min(dx, dy)))
    }
  }

  return { panels, invasores, dock: { x: +dock.x.toFixed(1), y: +dock.y.toFixed(1), w: +dock.width.toFixed(1), h: +dock.height.toFixed(1) } }
})()`

const { server, url } = await serveApp()
const browser = await chromium.launch()
const context = await newContext(browser)
const page = await context.newPage()

await page.goto(url)
await page.waitForTimeout(SETTLE)

const found = {}
for (const [i, name] of APP_SCREENS.entries()) {
  await gotoScreen(page, i)
  found[name] = await page.evaluate(PROBE)
}

// Segunda passada com a navegação embutida no painel central: os painéis têm
// de ficar exatamente onde estavam (a coluna é descontada do conteúdo, não
// somada ao painel), e o "dock" medido passa a ser a coluna.
await page.click('nav[aria-label="Seções"] >> text=Aparência')
await page.waitForTimeout(300)
await page.click('[role="group"][aria-label="Posição da navegação"] >> text=Embutida na janela')
await page.waitForTimeout(SETTLE)
for (const [i, name] of APP_SCREENS.entries()) {
  await gotoScreen(page, i)
  found[`${name}@embutida`] = await page.evaluate(PROBE)
}

/** Cada tela nos dois modos de navegação. */
const CASES = Object.keys(found)

await browser.close()
server.close()

if (update) {
  writeFileSync(BASELINE, `${JSON.stringify(found, null, 2)}\n`)
  console.log(`\n✓ baseline atualizada: ${CASES.length} telas\n`)
  process.exit(0)
}

let baseline
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
} catch {
  console.error('\n✗ sem baseline. Rode `npm run layout -- --update` para criar.\n')
  process.exit(1)
}

let failures = 0
for (const name of CASES) {
  const rows = []
  const want = baseline[name]
  const got = found[name]

  if (!want) {
    rows.push('    ✗ tela sem baseline — rode com --update se ela é nova')
  } else {
    if (want.panels.length !== got.panels.length) {
      rows.push(`    ✗ ${got.panels.length} painéis, esperados ${want.panels.length}`)
    }
    want.panels.forEach((expected, i) => {
      const actual = got.panels[i]
      if (!actual) return
      const off = ['x', 'y', 'w', 'h']
        .map((k) => [k, +(actual[k] - expected[k]).toFixed(1)])
        .filter(([, d]) => Math.abs(d) > TOLERANCE)
      if (off.length) {
        rows.push(
          `    ✗ painel ${i + 1} (${expected.w}x${expected.h} @ ${expected.x},${expected.y}) → ` +
            off.map(([k, d]) => `${k} ${d > 0 ? '+' : ''}${d}`).join(', '),
        )
      }
    })
    // Os QUATRO, como no laço dos painéis logo acima. A baseline sempre gravou
    // `x` e `w` do dock e o guarda comparava só `y` e `h`: metade do retângulo
    // podia andar sem ninguém ver, e o dock é justamente a peça que o layout
    // existe para proteger ("nenhum painel invade o dock").
    for (const k of ['x', 'y', 'w', 'h']) {
      if (Math.abs(got.dock[k] - want.dock[k]) > TOLERANCE) {
        rows.push(`    ✗ dock ${k} ${got.dock[k]}, esperado ${want.dock[k]}`)
      }
    }
  }

  if (got.invasores.length) {
    rows.push(
      `    ✗ ${got.invasores.length} painel(is) invadem o dock: ${got.invasores.join(', ')}px`,
    )
  }

  failures += rows.length
  console.log(
    rows.length ? `  ✗ ${name}\n${rows.join('\n')}` : `  ✓ ${name} (${got.panels.length} painéis)`,
  )
}

console.log(
  failures
    ? `\n✗ ${failures} divergência(s). Se foi de propósito: npm run layout -- --update\n`
    : `\n✓ layout estável nas ${CASES.length} telas · nenhum painel invade o dock\n`,
)
process.exit(failures ? 1 : 0)
