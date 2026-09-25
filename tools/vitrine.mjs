#!/usr/bin/env node
/**
 * A vitrine: as imagens e o vídeo do README e da página do projeto.
 *
 * Tudo sai do app CONSTRUÍDO rodando com os dados do protótipo (sem
 * `window.halo` a fábrica cai nos mocks, como em `test:screens`), sobre o
 * papel de parede de cada ambiente — arte deste projeto. Nunca da máquina de
 * quem roda: uma captura da tela real levaria junto os projetos, as pastas, as
 * conversas e a lista de mídia do dono, e estas imagens vão para um
 * repositório público.
 *
 * O "desktop" é montado aqui mesmo: uma página com o papel de parede ao fundo,
 * a janela do app no tamanho e na posição de fábrica (1440×900 em 240,90 numa
 * tela 1920×1080) e a ilha no topo — as duas em iframes transparentes, como
 * as janelas de verdade são.
 *
 *   npm run build && node tools/vitrine.mjs
 *
 * Saída em `site/assets/` (ver o README dessa pasta): o que o README e a
 * página usam. Precisa do `ffmpeg` para o vídeo e o GIF.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { chromium } from 'playwright'
import { ROOT } from './lib/harness.mjs'

const OUT = join(ROOT, 'site/assets')
const TMP = join(ROOT, 'out/vitrine')
const TELA = { width: 1920, height: 1080 }
/** A janela de fábrica: `desktop.position` padrão e o tamanho do handoff. */
const JANELA = { x: 240, y: 90, width: 1440, height: 900 }
const ILHA = { width: 900, height: 440 }

const AMBIENTES = ['floresta', 'citypop', 'cyberpunk', 'bioshock']
/** Cada tela numa roupa diferente: a vitrine mostra os temas de passagem. */
const TELAS = [
  ['home', 0, 'floresta'],
  ['social', 1, 'citypop'],
  ['claude', 2, 'floresta'],
  ['files', 3, 'bioshock'],
  ['lab', 4, 'cyberpunk'],
  ['media', 5, 'citypop'],
  ['music', 6, 'cyberpunk'],
  ['settings', 7, 'floresta'],
]
const NOMES = {
  floresta: 'Floresta',
  citypop: 'City Pop',
  cyberpunk: 'Cyberpunk',
  bioshock: 'Shock',
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/** A página do "desktop". O fundo segue o `data-env` da janela do app. */
const DESKTOP = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${TELA.width}px;height:${TELA.height}px;overflow:hidden;background:#000}
#fundo{position:fixed;inset:0;background:center/cover no-repeat;transition:opacity .5s}
iframe{position:fixed;border:0;background:transparent}
#app{left:${JANELA.x}px;top:${JANELA.y}px;width:${JANELA.width}px;height:${JANELA.height}px}
#ilha{left:${(TELA.width - ILHA.width) / 2}px;top:0;width:${ILHA.width}px;height:${ILHA.height}px}
</style></head><body>
<div id="fundo"></div>
<iframe id="app" src="/index.html" allowtransparency="true"></iframe>
<iframe id="ilha" src="/island.html?motion=gota&idle=100&open=hover&h=36" allowtransparency="true"></iframe>
<script>
  const fundo = document.getElementById('fundo')
  let atual = ''
  setInterval(() => {
    const doc = document.getElementById('app').contentDocument
    const env = doc && doc.documentElement.dataset.env
    if (env && env !== atual) {
      atual = env
      fundo.style.backgroundImage = 'url(/__fundo/' + env + '.jpg)'
    }
  }, 50)
</script></body></html>`

function servir() {
  const dir = join(ROOT, 'out/renderer')
  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0])
    try {
      if (rel === '/' || rel === '/desktop.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        return res.end(DESKTOP)
      }
      const fundo = /^\/__fundo\/([a-z]+)\.jpg$/.exec(rel)
      const file = fundo
        ? join(ROOT, 'src/renderer/assets/env', fundo[1], 'fundo.jpg')
        : join(dir, rel)
      const body = readFileSync(file)
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () =>
      ok({ server, url: `http://127.0.0.1:${server.address().port}/` }),
    ),
  )
}

const espera = (p, ms) => p.waitForTimeout(ms)

/**
 * Um horário de manhã, fixo: o relógio e a saudação da Home saem iguais a
 * cada rodada, e o diff das imagens só mostra o que mudou de verdade.
 */
const HORA = new Date('2026-09-24T09:41:00Z')

/** A janela do app e a ilha, prontas — com uma cidade no clima. */
async function montar(page, url) {
  await page.clock.setFixedTime(HORA)
  await page.goto(`${url}desktop.html`)
  const app = page.frameLocator('#app')
  await app.locator('nav[aria-label="Telas"]').waitFor()
  // Numa instalação nova o clima pede a cidade; a vitrine escolhe uma.
  await app.locator('nav[aria-label="Telas"] button').nth(7).click()
  await espera(page, 900)
  await app.locator('nav[aria-label="Seções"] >> text=Widgets').click()
  const campo = app.locator('[aria-label="Local do clima"]')
  await campo.fill('Lisboa')
  await campo.press('Enter')
  await app.locator('nav[aria-label="Telas"] button').nth(0).click()
  await espera(page, 2500)
  return { app, ilha: page.frameLocator('#ilha') }
}

async function ambiente(page, app, id) {
  const atual = await page
    .frame({ url: /index\.html/ })
    .evaluate(() => document.documentElement.dataset.env)
  if (atual === id) return
  // O cartão de ambientes mora na Home.
  await app.locator('nav[aria-label="Telas"] button').nth(0).click()
  await espera(page, 900)
  await app.locator(`[aria-label="Ambientes"] >> text=${NOMES[id]}`).click()
  await espera(page, 2600)
}

async function tela(page, app, indice) {
  await app.locator('nav[aria-label="Telas"] button').nth(indice).click()
  await espera(page, 2200)
}

const jpg = (png, destino, largura) =>
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    png,
    ...(largura ? ['-vf', `scale=${largura}:-1:flags=lanczos`] : []),
    '-q:v',
    '3',
    destino,
  ])

async function fotos(browser, url) {
  const page = await browser.newPage({ viewport: TELA })
  const { app } = await montar(page, url)

  for (const env of AMBIENTES) {
    await ambiente(page, app, env)
    const png = join(TMP, `home-${env}.png`)
    await page.screenshot({ path: png })
    jpg(png, join(OUT, `home-${env}.jpg`), 1600)
  }
  for (const [nome, indice, env] of TELAS) {
    await ambiente(page, app, env)
    await tela(page, app, indice)
    const png = join(TMP, `tela-${nome}.png`)
    // Só a janela: o papel de parede já aparece nas fotos da Home.
    await page.screenshot({ path: png, clip: JANELA })
    jpg(png, join(OUT, `tela-${nome}.jpg`), 1200)
  }
  await page.close()

  // A ilha, fechada e aberta, sobre o recorte do topo do papel de parede.
  const ilhaPage = await browser.newPage({ viewport: TELA })
  const { app: app2, ilha } = await montar(ilhaPage, url)
  await ambiente(ilhaPage, app2, 'cyberpunk')
  const topo = { x: (TELA.width - ILHA.width) / 2, y: 0, width: ILHA.width, height: 120 }
  await ilhaPage.screenshot({ path: join(TMP, 'ilha-fechada.png'), clip: topo })
  jpg(join(TMP, 'ilha-fechada.png'), join(OUT, 'ilha-fechada.jpg'))
  // A mesma, na altura da aberta: a página troca uma pela outra no mesmo quadro.
  await ilhaPage.screenshot({
    path: join(TMP, 'ilha-fechada-alta.png'),
    clip: { ...topo, height: ILHA.height },
  })
  jpg(join(TMP, 'ilha-fechada-alta.png'), join(OUT, 'ilha-fechada-alta.jpg'))
  await ilha.locator('body').hover({ position: { x: ILHA.width / 2, y: 12 } })
  await espera(ilhaPage, 1600)
  await ilhaPage.screenshot({
    path: join(TMP, 'ilha-aberta.png'),
    clip: { ...topo, height: ILHA.height },
  })
  jpg(join(TMP, 'ilha-aberta.png'), join(OUT, 'ilha-aberta.jpg'))
  await ilhaPage.close()
}

/** O passeio: ambientes, a ilha e as telas, uma vez, sem pressa. */
async function video(browser, url) {
  const dir = join(TMP, 'video')
  rmSync(dir, { recursive: true, force: true })
  const context = await browser.newContext({
    viewport: TELA,
    recordVideo: { dir, size: TELA },
  })
  const t0 = Date.now()
  const page = await context.newPage()
  const { app, ilha } = await montar(page, url)
  // O vídeo começa AQUI: tudo antes é a montagem, e ela é cortada.
  const inicio = Date.now()
  await espera(page, 1200)
  for (const env of ['cyberpunk', 'citypop', 'bioshock', 'floresta']) {
    await ambiente(page, app, env)
    await espera(page, 600)
  }
  await ilha.locator('body').hover({ position: { x: ILHA.width / 2, y: 12 } })
  await espera(page, 2400)
  await page.mouse.move(TELA.width / 2, 700)
  await espera(page, 1200)
  for (const [, indice] of TELAS.slice(1, 7)) await tela(page, app, indice)
  await tela(page, app, 0)
  await espera(page, 1200)
  await context.close()

  const webm = readdirSync(dir).find((f) => f.endsWith('.webm'))
  if (!webm) throw new Error('o Playwright não gravou vídeo')
  renameSync(join(dir, webm), join(TMP, 'passeio.webm'))
  return (inicio - t0) / 1000
}

function converter(corte) {
  const ss = corte.toFixed(2)
  const webm = join(TMP, 'passeio.webm')
  // O que veio antes de `inicio` é a montagem (carregar, escolher a cidade):
  // cortado.
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    ss,
    '-i',
    webm,
    '-vf',
    'scale=1600:-2:flags=lanczos,fps=30',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '27',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    join(OUT, 'passeio.mp4'),
  ])
  // O GIF do README: só a troca de ambientes, que é o que diz "isto é o
  // Halo" em poucos segundos, menor e com paleta própria.
  const paleta = join(TMP, 'paleta.png')
  const filtro = 'fps=10,scale=640:-1:flags=lanczos'
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    ss,
    '-t',
    '11',
    '-i',
    webm,
    '-vf',
    `${filtro},palettegen=stats_mode=diff`,
    paleta,
  ])
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    ss,
    '-t',
    '11',
    '-i',
    webm,
    '-i',
    paleta,
    '-lavfi',
    `${filtro} [x]; [x][1:v] paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
    join(OUT, 'ambientes.gif'),
  ])
  // O pôster do vídeo: o primeiro quadro, para a página não mostrar preto.
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    (corte + 0.5).toFixed(2),
    '-i',
    webm,
    '-frames:v',
    '1',
    '-vf',
    'scale=1600:-2',
    '-q:v',
    '3',
    join(OUT, 'passeio.jpg'),
  ])
}

mkdirSync(OUT, { recursive: true })
mkdirSync(TMP, { recursive: true })
const { server, url } = await servir()
const browser = await chromium.launch()
try {
  const so = process.argv[2]
  if (!so || so === 'fotos') await fotos(browser, url)
  if (!so || so === 'video') converter(await video(browser, url))
} finally {
  await browser.close()
  server.close()
}
console.log(`✓ vitrine em ${OUT}`)
