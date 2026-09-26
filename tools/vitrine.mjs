#!/usr/bin/env node
/**
 * A vitrine: as imagens, os GIFs e os vídeos do README e da página do projeto.
 *
 * Tudo sai do app CONSTRUÍDO rodando com dados de demonstração (sem
 * `window.halo` a fábrica cai nos mocks, como em `test:screens`), sobre o
 * papel de parede de cada ambiente — arte deste projeto. Nunca da máquina de
 * quem roda: uma captura da tela real levaria junto os projetos, as pastas, as
 * conversas e a lista de mídia do dono, e estas imagens vão para um
 * repositório público. O que os mocks não têm (capas, a ilha, o lançador, os
 * balões) vem de `vitrine-demo.mjs`, escrito à mão e inventado.
 *
 * O "desktop" é montado aqui mesmo: uma página com o papel de parede ao fundo
 * e as janelas do app em iframes transparentes, como as de verdade são — a
 * principal no tamanho e na posição de fábrica (1440×900 em 240,90 numa tela
 * 1920×1080), a ilha no topo, o lançador de Meta+V e a janela dos balões.
 *
 *   npm run build && node tools/vitrine.mjs            (tudo)
 *   node tools/vitrine.mjs fotos | video | converter   (só uma parte;
 *                                     `converter` recorta a última gravação)
 *
 * Saída em `site/assets/`. Precisa do `ffmpeg` para os vídeos e os GIFs.
 */
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { chromium } from 'playwright'
import { ROOT } from './lib/harness.mjs'
import { AVISOS, remendarBundle, SCRIPT_APP, SCRIPT_HALO } from './vitrine-demo.mjs'

const OUT = join(ROOT, 'site/assets')
const TMP = join(ROOT, 'out/vitrine')
const TELA = { width: 1920, height: 1080 }
/** A janela de fábrica: `desktop.position` padrão e o tamanho do handoff. */
const JANELA = { x: 240, y: 90, width: 1440, height: 900 }
const ILHA = { width: 900, height: 440 }
/** O lançador: o tamanho de `main/launcher/window.ts`, centrado a 22% da altura. */
const LANCADOR = { x: (1920 - 768) / 2, y: Math.round(1080 * 0.22), width: 768, height: 508 }
/** A janela dos balões: 440 de largura (`main/notificacoes/janela.ts`), no canto de cima. */
const AVISOS_JANELA = { x: 1920 - 440 - 24, y: 36, width: 440, height: 560 }

/** Os recortes de cada peça, na tela 1920×1080. */
const RECORTE = {
  ilha: { x: (TELA.width - ILHA.width) / 2, y: 0, width: ILHA.width, height: ILHA.height },
  lancador: { x: LANCADOR.x - 56, y: LANCADOR.y - 40, width: LANCADOR.width + 112, height: 588 },
  avisos: { x: 1920 - 560, y: 0, width: 560, height: 520 },
  janela: JANELA,
}

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

/** A página do "desktop". O fundo e as janelas menores seguem o `data-env` da principal. */
const DESKTOP = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${TELA.width}px;height:${TELA.height}px;overflow:hidden;background:#000}
#fundo{position:fixed;inset:0;background:center/cover no-repeat}
iframe{position:fixed;border:0;background:transparent}
#app{left:${JANELA.x}px;top:${JANELA.y}px;width:${JANELA.width}px;height:${JANELA.height}px}
#avisos{left:${AVISOS_JANELA.x}px;top:${AVISOS_JANELA.y}px;width:${AVISOS_JANELA.width}px;height:${AVISOS_JANELA.height}px}
#lancador{left:${LANCADOR.x}px;top:${LANCADOR.y}px;width:${LANCADOR.width}px;height:${LANCADOR.height}px;
  opacity:0;transform:translateY(-10px) scale(.97);pointer-events:none;transition:opacity .22s ease,transform .26s cubic-bezier(.2,.9,.3,1.2)}
#lancador.visivel{opacity:1;transform:none;pointer-events:auto}
#ilha{left:${(TELA.width - ILHA.width) / 2}px;top:0;width:${ILHA.width}px;height:${ILHA.height}px}
</style></head><body>
<div id="fundo"></div>
<iframe id="app" src="/index.html" allowtransparency="true"></iframe>
<iframe id="avisos" src="/notificacoes.html?env=floresta" allowtransparency="true"></iframe>
<iframe id="lancador" src="/launcher.html?env=floresta" allowtransparency="true"></iframe>
<iframe id="ilha" src="/island.html?motion=gota&idle=100&open=hover&h=36" allowtransparency="true"></iframe>
<script>
  // Os quatro papéis de parede já carregados: sem isto, cada troca de ambiente
  // piscava preto no vídeo enquanto a imagem nova chegava.
  for (const env of ${JSON.stringify(['floresta', 'citypop', 'cyberpunk', 'bioshock'])}) new Image().src = '/__fundo/' + env + '.jpg'
  const fundo = document.getElementById('fundo')
  let atual = ''
  setInterval(() => {
    const doc = document.getElementById('app').contentDocument
    const env = doc && doc.documentElement.dataset.env
    if (env && env !== atual) {
      atual = env
      fundo.style.backgroundImage = 'url(/__fundo/' + env + '.jpg)'
      for (const id of ['avisos', 'lancador']) {
        const d = document.getElementById(id).contentDocument
        if (d) d.documentElement.dataset.env = env
      }
    }
  }, 50)
</script></body></html>`

/** Onde a vitrine entra em cada página: um script servido, antes do bundle. */
const INJETAR = {
  '/index.html': '/__vitrine/app.js',
  '/island.html': '/__vitrine/halo.js',
  '/launcher.html': '/__vitrine/halo.js',
  '/notificacoes.html': '/__vitrine/halo.js',
}

function servir() {
  const dir = join(ROOT, 'out/renderer')
  const remendados = new Map()
  for (const f of readdirSync(join(dir, 'assets')).filter((f) => f.endsWith('.js'))) {
    const r = remendarBundle(readFileSync(join(dir, 'assets', f), 'utf8'))
    if (r.casou.length > 0) {
      remendados.set(`/assets/${f}`, r.js)
      console.log(`  remendos em ${f}: ${r.casou.join('; ')}`)
    }
    if (f.startsWith('index-') && r.faltou.length > 0)
      console.warn(`  ⚠ não casaram em ${f}: ${r.faltou.join('; ')} — o mock segue como está`)
  }

  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0])
    const enviar = (tipo, corpo) => {
      res.writeHead(200, { 'Content-Type': tipo })
      res.end(corpo)
    }
    try {
      if (rel === '/' || rel === '/desktop.html') return enviar('text/html', DESKTOP)
      if (rel === '/__vitrine/app.js') return enviar('text/javascript', SCRIPT_APP)
      if (rel === '/__vitrine/halo.js') return enviar('text/javascript', SCRIPT_HALO)
      if (remendados.has(rel)) return enviar('text/javascript', remendados.get(rel))
      if (INJETAR[rel]) {
        const html = readFileSync(join(dir, rel), 'utf8').replace(
          '</head>',
          `<script src="${INJETAR[rel]}"></script></head>`,
        )
        return enviar('text/html', html)
      }
      const fundo = /^\/__fundo\/([a-z]+)\.jpg$/.exec(rel)
      const file = fundo
        ? join(ROOT, 'src/renderer/assets/env', fundo[1], 'fundo.jpg')
        : join(dir, rel)
      enviar(MIME[extname(file)] ?? 'application/octet-stream', readFileSync(file))
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
/** Fuso e idioma fixos: nem o relógio nem as datas dizem onde a vitrine rodou. */
const LUGAR = { timezoneId: 'UTC', locale: 'pt-BR' }

/** O desktop inteiro, pronto — com uma cidade no clima. */
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
  // Configurações abre, na foto, pela seção de Aparência (a do vidro).
  await app.locator('nav[aria-label="Seções"] >> text=Aparência').click()
  await app.locator('nav[aria-label="Telas"] button').nth(0).click()
  await page.frameLocator('#lancador').locator('input').waitFor()
  await espera(page, 2500)
  return {
    app,
    ilha: page.frameLocator('#ilha'),
    lancador: page.frameLocator('#lancador'),
  }
}

const frame = (page, nome) => page.frame({ url: new RegExp(`${nome}\\.html`) })

async function ambiente(page, app, id) {
  const atual = await frame(page, 'index').evaluate(() => document.documentElement.dataset.env)
  if (atual === id) return
  // O cartão de ambientes mora na Home.
  await app.locator('nav[aria-label="Telas"] button').nth(0).click()
  await espera(page, 900)
  await app.locator(`[aria-label="Ambientes"] >> text=${NOMES[id]}`).click()
  await espera(page, 2600)
}

async function tela(page, app, indice, ms = 2200) {
  await app.locator('nav[aria-label="Telas"] button').nth(indice).click()
  await espera(page, ms)
}

/**
 * A tela do Claude com uma conversa: um agente aberto no projeto de exemplo e
 * uma pergunta. Fora do Electron o agente é o do mock, e a resposta DIZ que é
 * de exemplo.
 */
async function prepararClaude(page, app) {
  await tela(page, app, 2, 1400)
  await app.locator('text=halo-one').first().click()
  await espera(page, 900)
  const campo = app.locator('[placeholder="Peça alguma coisa ao agente"]')
  await campo.fill('Como a soma do painel de medidores é feita?')
  await campo.press('Enter')
  await espera(page, 900)
}

/* ——— A ilha, o lançador e os balões ——————————————————————————————— */

const naIlha = (page, fn, arg) => frame(page, 'island').evaluate(fn, arg)

async function abrirIlha(page, ilha) {
  await ilha.locator('body').hover({ position: { x: ILHA.width / 2, y: 14 } })
  await espera(page, 1500)
}

async function fecharIlha(page) {
  await page.mouse.move(TELA.width / 2, 760)
  await espera(page, 1100)
}

/** Um anúncio na pílula fechada (o chip que alarga e recolhe). */
const anunciar = (page, evento) => naIlha(page, (e) => window.__vitrine.emitir('evento', e), evento)

async function passearNaIlha(page, ilha, porAba = 1500) {
  const abas = ilha.locator('[role="tab"]')
  const total = await abas.count()
  for (let i = 1; i < total; i++) {
    await abas.nth(i).click()
    await espera(page, porAba)
  }
  await abas.nth(0).click()
  await espera(page, 900)
}

async function mostrarLancador(page, sim) {
  await page.evaluate(
    (v) => document.getElementById('lancador').classList.toggle('visivel', v),
    sim,
  )
  await espera(page, 400)
}

async function digitar(page, lancador, texto, ms = 1500) {
  const campo = lancador.locator('input')
  await campo.fill('')
  await campo.pressSequentially(texto, { delay: 110 })
  await espera(page, ms)
}

/** Os balões: some tudo, e os três entram um a um. */
async function baloes(page, intervalo = 700) {
  const avisos = frame(page, 'notificacoes')
  await avisos.evaluate(() => window.__vitrine.emitir('avisos', []))
  await espera(page, 600)
  for (let n = 1; n <= AVISOS.length; n++) {
    await avisos.evaluate(
      (lista) => window.__vitrine.emitir('avisos', lista),
      AVISOS.slice(0, n).reverse(),
    )
    await espera(page, intervalo)
  }
}

const limparBaloes = (page) =>
  frame(page, 'notificacoes').evaluate(() => window.__vitrine.emitir('avisos', []))

/* ——— ffmpeg ————————————————————————————————————————————————— */

const ff = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args])

const jpg = (png, destino, largura) =>
  ff(
    '-i',
    png,
    ...(largura ? ['-vf', `scale=${largura}:-1:flags=lanczos`] : []),
    '-q:v',
    '3',
    destino,
  )

const crop = (r) => `crop=${r.width}:${r.height}:${r.x}:${r.y}`

/** Um trecho do vídeo, recortado: MP4 para a página, GIF para o README. */
function trecho(
  webm,
  nome,
  { ini, fim },
  recorte,
  { mp4Largura, gifLargura, gifFps = 12, gif = true, crf = 26 },
) {
  const filtroBase = recorte ? `${crop(recorte)},` : ''
  const dur = (fim - ini).toFixed(2)
  const ss = ini.toFixed(2)
  ff(
    '-ss',
    ss,
    '-t',
    dur,
    '-i',
    webm,
    '-vf',
    `${filtroBase}scale=${mp4Largura}:-2:flags=lanczos,fps=30`,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    String(crf),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    join(OUT, `${nome}.mp4`),
  )
  if (!gif) return
  const paleta = join(TMP, `paleta-${nome}.png`)
  const filtro = `${filtroBase}fps=${gifFps},scale=${gifLargura}:-1:flags=lanczos`
  ff(
    '-ss',
    ss,
    '-t',
    dur,
    '-i',
    webm,
    '-vf',
    `${filtro},palettegen=stats_mode=diff:max_colors=192`,
    paleta,
  )
  ff(
    '-ss',
    ss,
    '-t',
    dur,
    '-i',
    webm,
    '-i',
    paleta,
    '-lavfi',
    `${filtro} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    join(OUT, `${nome}.gif`),
  )
}

/** Um quadro do vídeo, como imagem (o pôster de cada MP4). */
function poster(webm, nome, instante, recorte, largura) {
  ff(
    '-ss',
    instante.toFixed(2),
    '-i',
    webm,
    '-frames:v',
    '1',
    '-vf',
    `${recorte ? `${crop(recorte)},` : ''}scale=${largura}:-2:flags=lanczos`,
    '-q:v',
    '3',
    join(OUT, `${nome}.jpg`),
  )
}

/* ——— As fotos ——————————————————————————————————————————————— */

async function fotos(browser, url) {
  const page = await browser.newPage({ viewport: TELA, ...LUGAR })
  const { app, ilha } = await montar(page, url)

  for (const env of AMBIENTES) {
    await ambiente(page, app, env)
    const png = join(TMP, `home-${env}.png`)
    await page.screenshot({ path: png })
    jpg(png, join(OUT, `home-${env}.jpg`), 1600)
  }
  await prepararClaude(page, app)
  for (const [nome, indice, env] of TELAS) {
    await ambiente(page, app, env)
    await tela(page, app, indice)
    const png = join(TMP, `tela-${nome}.png`)
    // Só a janela: o papel de parede já aparece nas fotos da Home.
    await page.screenshot({ path: png, clip: JANELA })
    jpg(png, join(OUT, `tela-${nome}.jpg`), 1200)
  }
  await tela(page, app, 0)

  // Os balões, em cada tema, sobre o canto de cima do papel de parede.
  for (const env of AMBIENTES) {
    await ambiente(page, app, env)
    await baloes(page, 300)
    await espera(page, 900)
    const png = join(TMP, `avisos-${env}.png`)
    await page.screenshot({ path: png, clip: RECORTE.avisos })
    jpg(png, join(OUT, `avisos-${env}.jpg`), 480)
  }
  await limparBaloes(page)
  // Os quatro lado a lado, para o README.
  ff(
    ...AMBIENTES.flatMap((env) => ['-i', join(TMP, `avisos-${env}.png`)]),
    '-filter_complex',
    '[0][1][2][3]xstack=inputs=4:layout=0_0|w0_0|w0+w1_0|w0+w1+w2_0,scale=1600:-1:flags=lanczos',
    '-q:v',
    '3',
    join(OUT, 'avisos.jpg'),
  )

  // A ilha, fechada e aberta, sobre o recorte do topo do papel de parede.
  await ambiente(page, app, 'cyberpunk')
  const topo = { ...RECORTE.ilha, height: 120 }
  await page.screenshot({ path: join(TMP, 'ilha-fechada.png'), clip: topo })
  jpg(join(TMP, 'ilha-fechada.png'), join(OUT, 'ilha-fechada.jpg'))
  // A mesma, na altura da aberta: a página troca uma pela outra no mesmo quadro.
  await page.screenshot({ path: join(TMP, 'ilha-fechada-alta.png'), clip: RECORTE.ilha })
  jpg(join(TMP, 'ilha-fechada-alta.png'), join(OUT, 'ilha-fechada-alta.jpg'))
  await abrirIlha(page, ilha)
  await page.screenshot({ path: join(TMP, 'ilha-aberta.png'), clip: RECORTE.ilha })
  jpg(join(TMP, 'ilha-aberta.png'), join(OUT, 'ilha-aberta.jpg'))
  await page.close()
}

/* ——— O vídeo: uma gravação só, cortada em trechos ——————————————————— */

async function video(browser, url) {
  const dir = join(TMP, 'video')
  rmSync(dir, { recursive: true, force: true })
  const context = await browser.newContext({
    viewport: TELA,
    ...LUGAR,
    recordVideo: { dir, size: TELA },
  })
  const t0 = Date.now()
  const page = await context.newPage()
  const { app, ilha, lancador } = await montar(page, url)
  await prepararClaude(page, app)
  await tela(page, app, 0, 1200)
  const agora = () => (Date.now() - t0) / 1000
  const marcas = {}
  const marcar = async (nome, fn) => {
    const ini = agora()
    await fn()
    marcas[nome] = { ini, fim: agora() }
  }

  await espera(page, 800)

  // 1. Os ambientes: o tema e o papel de parede de uma vez.
  await marcar('ambientes', async () => {
    await espera(page, 600)
    for (const env of ['cyberpunk', 'citypop', 'bioshock', 'floresta']) {
      await ambiente(page, app, env)
      await espera(page, 500)
    }
  })

  // 2. A ilha: um anúncio e o HUD na pílula fechada, depois ela abre e passa
  //    pelas oito abas.
  await ambiente(page, app, 'cyberpunk')
  await marcar('ilha', async () => {
    await espera(page, 900)
    await anunciar(page, {
      icon: 'DownloadSimple',
      text: 'Download concluído',
      detail: 'halo-spatial-os_0.2.1_amd64.deb',
      level: 'ok',
      kind: 'aviso',
      ttlMs: 2600,
    })
    await espera(page, 3200)
    for (const [i, r] of [0.52, 0.6, 0.68, 0.74].entries()) {
      await anunciar(page, {
        icon: 'SpeakerHigh',
        text: 'Volume',
        detail: `${Math.round(r * 100)}%`,
        level: 'ok',
        kind: 'hud',
        ratio: r,
        key: 'volume',
        ttlMs: 1400,
      })
      await espera(page, i === 3 ? 1900 : 260)
    }
    await abrirIlha(page, ilha)
    await espera(page, 1200)
    await passearNaIlha(page, ilha)
    await fecharIlha(page)
    await espera(page, 600)
  })

  // 3. O lançador de Meta+V, vestido pelo ambiente.
  await ambiente(page, app, 'citypop')
  await marcar('lancador', async () => {
    await espera(page, 500)
    await mostrarLancador(page, true)
    await espera(page, 1300)
    await digitar(page, lancador, 'fire', 1300)
    await digitar(page, lancador, '15% de 240', 1500)
    await digitar(page, lancador, '30c em f', 1500)
    await digitar(page, lancador, ':coracao', 1500)
    await digitar(page, lancador, 'cafe', 1400)
    await mostrarLancador(page, false)
    await espera(page, 600)
  })

  // 4. Os balões de notificação, um tema de cada vez.
  await marcar('avisos', async () => {
    for (const env of ['floresta', 'cyberpunk', 'citypop', 'bioshock']) {
      await limparBaloes(page)
      await ambiente(page, app, env)
      await baloes(page)
      await espera(page, 1600)
    }
    await limparBaloes(page)
    await espera(page, 700)
  })

  // 5. As telas, cada uma com a entrada dela.
  await ambiente(page, app, 'floresta')
  await marcar('telas', async () => {
    await espera(page, 600)
    for (const [, indice] of TELAS.slice(1)) await tela(page, app, indice)
    await tela(page, app, 0, 1400)
  })

  await context.close()
  const webm = readdirSync(dir).find((f) => f.endsWith('.webm'))
  if (!webm) throw new Error('o Playwright não gravou vídeo')
  renameSync(join(dir, webm), join(TMP, 'passeio.webm'))
  return marcas
}

function converter(marcas) {
  const webm = join(TMP, 'passeio.webm')
  const { ambientes, ilha, lancador, avisos, telas } = marcas

  // O passeio inteiro, para a página: do primeiro ambiente à última tela.
  trecho(webm, 'passeio', { ini: ambientes.ini, fim: telas.fim }, null, {
    mp4Largura: 1440,
    gif: false,
    crf: 30,
  })
  poster(webm, 'passeio', ambientes.ini + 0.5, null, 1600)

  // Os trechos. O GIF dos ambientes é o herói do README: o quadro inteiro,
  // leve o bastante para o GitHub.
  trecho(webm, 'ambientes', ambientes, null, { mp4Largura: 1280, gifLargura: 720, gifFps: 10 })
  trecho(webm, 'ilha', ilha, RECORTE.ilha, { mp4Largura: 900, gifLargura: 640, gifFps: 14 })
  poster(webm, 'ilha', ilha.ini + 12, RECORTE.ilha, 900)
  trecho(webm, 'lancador', lancador, RECORTE.lancador, {
    mp4Largura: 880,
    gifLargura: 600,
    gifFps: 12,
  })
  poster(webm, 'lancador', lancador.ini + 3.4, RECORTE.lancador, 880)
  trecho(webm, 'avisos', avisos, RECORTE.avisos, { mp4Largura: 560, gifLargura: 420, gifFps: 12 })
  trecho(webm, 'telas', telas, RECORTE.janela, { mp4Largura: 1280, gifLargura: 520, gifFps: 6 })
  poster(webm, 'telas', telas.ini + 1.8, RECORTE.janela, 1280)
}

mkdirSync(OUT, { recursive: true })
mkdirSync(TMP, { recursive: true })
const { server, url } = await servir()
const browser = await chromium.launch()
try {
  const so = process.argv[2]
  if (!so || so === 'fotos') await fotos(browser, url)
  // As marcas ficam guardadas: `converter` refaz os cortes sem gravar de novo.
  const marcasJson = join(TMP, 'marcas.json')
  if (!so || so === 'video') {
    const marcas = await video(browser, url)
    writeFileSync(marcasJson, JSON.stringify(marcas, null, 2))
    converter(marcas)
  }
  if (so === 'converter') converter(JSON.parse(readFileSync(marcasJson, 'utf8')))
} finally {
  await browser.close()
  server.close()
}
for (const f of readdirSync(OUT).sort()) {
  const kb = statSync(join(OUT, f)).size / 1024
  console.log(
    `  ${f.padEnd(26)} ${kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`}`,
  )
}
console.log(`✓ vitrine em ${OUT}`)
