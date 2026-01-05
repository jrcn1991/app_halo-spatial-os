/** Peças comuns das ferramentas de verificação. */

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../..', import.meta.url))
export const W = 1440
export const H = 900

/**
 * Instante fixo para os testes.
 *
 * O relógio da home é a hora real do sistema; sem congelar isto, cada execução
 * mediria um app diferente. O `+01:00` ancora o instante — sem ele a hora seria
 * lida no fuso de quem roda e sairia deslocada.
 */
export const TEST_TIME = new Date('2025-08-28T07:24:00+01:00')
export const LOCALE = 'pt-BR'
export const TIMEZONE = 'Europe/Lisbon'

/** As 7 telas do handoff, na ordem do dock. */
export const SCREENS = ['home', 'social', 'claude', 'files', 'lab', 'media', 'music']
/** Todas as telas do app. */
export const APP_SCREENS = [...SCREENS, 'settings']

/** A entrada mais longa leva 1,15s + atraso; 2s cobre todas com folga. */
export const SETTLE = 2000

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/**
 * Serve o app construído por HTTP.
 *
 * Não é `file://` porque a CSP `default-src 'self'` bloqueia os próprios assets
 * quando a origem é `null`. No Electron isso não acontece — o esquema file://
 * dele é privilegiado — mas depender disso deixaria os testes em branco sem
 * avisar.
 *
 * Servido assim, `window.halo` não existe e a fábrica de dados cai nos mocks:
 * é o que torna os testes determinísticos.
 */
export async function serveApp() {
  const dir = join(ROOT, 'out/renderer')
  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0])
    const file = join(dir, rel === '/' ? 'index.html' : rel)
    try {
      const body = readFileSync(file)
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  return { server, url: `http://127.0.0.1:${server.address().port}/` }
}

/** Contexto do navegador com relógio, idioma e fuso fixos. */
export async function newContext(browser) {
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    locale: LOCALE,
    timezoneId: TIMEZONE,
  })
  await context.clock.setFixedTime(TEST_TIME)
  return context
}

/** Navega até uma tela clicando no dock, pelo próprio DOM. */
export async function gotoScreen(page, index) {
  await page.locator('nav[aria-label="Telas"] button').nth(index).click()
  await page.waitForTimeout(SETTLE)
}
