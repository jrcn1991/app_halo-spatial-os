#!/usr/bin/env node
/**
 * A DEMO WEB da página do projeto: o Halo de verdade, construído, rodando no
 * navegador de quem visita — `site/demo/`.
 *
 * É o mesmo truque da vitrine (`tools/vitrine.mjs`): sem `window.halo`, a
 * fábrica de dados cai nos mocks; a ilha, o lançador e os balões recebem o
 * `window.halo` de mentira de `vitrine-demo.mjs`, com dados INVENTADOS. Nada
 * da máquina de quem gera entra aqui, e a demo não fala com rede nenhuma.
 * Por cima da vitrine vem `tools/demo-web/camada.js` (as ações passam a ter
 * efeito) e `tools/demo-web/desktop.{html,js}` (a página que faz o papel do
 * processo main: papel de parede, barra do sistema, quem aparece e onde o
 * ponteiro vale).
 *
 *   npm run demo-web        (constrói o app e gera `site/demo/`)
 *
 * O app construído não muda: os remendos são no JS COPIADO, e cada um casa um
 * trecho exato — se o build mudar e ele não casar, o script avisa e segue.
 * A CSP das páginas do app vai como está; a do desktop é ainda mais fechada.
 * Tudo com caminho relativo, para valer sob `/halo-spatial-os/` no Pages.
 *
 * Precisa do `ffmpeg` para comprimir os papéis de parede.
 */
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './lib/harness.mjs'
import { remendarBundle, SCRIPT_APP, SCRIPT_HALO } from './vitrine-demo.mjs'

const BUILD = join(ROOT, 'out/renderer')
const FONTE = join(ROOT, 'tools/demo-web')
const DEST = join(ROOT, 'site/demo')
const AMBIENTES = ['floresta', 'citypop', 'cyberpunk', 'bioshock']

if (!existsSync(join(BUILD, 'index.html'))) {
  console.error('✗ out/renderer não existe — rode `npm run build` antes (ou `npm run demo-web`).')
  process.exit(1)
}

/**
 * Os remendos que só a demo quer, por cima dos da vitrine: o clima já com uma
 * cidade (numa instalação nova ele pede uma, e a demo abriria com um campo
 * vazio no meio da Início) e o idioma da página (`?lang=en`).
 */
const REMENDOS_DEMO = [
  [
    'clima: uma cidade de exemplo',
    /weather:\{place:"",unit:"c",icon:"phosphor"\}/,
    () => 'weather:{place:"Lisboa",unit:"c",icon:"phosphor"}',
  ],
  [
    // No app a miniatura de cada cartão de ambiente vem do main; o mock
    // devolve nada e os quadrados ficariam só com as listras. Os fundos já
    // estão na demo (`fundos/`), relativos a `app/index.html`.
    'ambientes: a miniatura de cada papel de parede',
    /previews:async\(\)=>\(\{\}\)/,
    () =>
      `previews:async()=>({${AMBIENTES.map((id) => `${id}:"../fundos/${id}.jpg"`).join(',')}})`,
  ],
  [
    'idioma: o da página',
    /language:([\w$]+),appearance:\{tint:/,
    (_m, padrao) => `language:(globalThis.__demoIdioma||${padrao}),appearance:{tint:`,
  ],
]

rmSync(DEST, { recursive: true, force: true })
mkdirSync(join(DEST, 'app/camada'), { recursive: true })
mkdirSync(join(DEST, 'fundos'), { recursive: true })

/* ——— O app construído, remendado na cópia ——————————————————————— */
cpSync(join(BUILD, 'assets'), join(DEST, 'app/assets'), { recursive: true })
for (const f of readdirSync(join(DEST, 'app/assets')).filter((f) => f.endsWith('.js'))) {
  const caminho = join(DEST, 'app/assets', f)
  const vitrine = remendarBundle(readFileSync(caminho, 'utf8'))
  let js = vitrine.js
  const casou = [...vitrine.casou]
  const faltou = [...vitrine.faltou]
  for (const [nome, padrao, troca] of REMENDOS_DEMO) {
    if (padrao.test(js)) {
      js = js.replace(padrao, troca)
      casou.push(nome)
    } else faltou.push(nome)
  }
  if (casou.length === 0) continue
  writeFileSync(caminho, js)
  console.log(`  remendos em ${f}: ${casou.join('; ')}`)
  if (f.startsWith('index-') && faltou.length > 0)
    console.warn(`  ⚠ não casaram em ${f}: ${faltou.join('; ')} — o mock segue como está`)
}

/** Onde a camada entra em cada página: um script servido, antes do bundle (a CSP não aceita em linha). */
const PAGINAS = {
  'index.html': 'camada/app.js',
  'island.html': 'camada/halo.js',
  'launcher.html': 'camada/halo.js',
  'notificacoes.html': 'camada/halo.js',
}
for (const [pagina, script] of Object.entries(PAGINAS)) {
  const html = readFileSync(join(BUILD, pagina), 'utf8')
  if (!html.includes('</head>')) throw new Error(`${pagina} sem </head>`)
  writeFileSync(
    join(DEST, 'app', pagina),
    html.replace('</head>', `<script src="${script}"></script></head>`),
  )
}
// A janela do app lê o idioma da consulta antes do bundle (ver o remendo acima).
writeFileSync(
  join(DEST, 'app/camada/app.js'),
  `${SCRIPT_APP}\nif (new URLSearchParams(location.search).get('lang') === 'en') globalThis.__demoIdioma = 'en';\n`,
)
writeFileSync(
  join(DEST, 'app/camada/halo.js'),
  `${SCRIPT_HALO}\n${readFileSync(join(FONTE, 'camada.js'), 'utf8')}`,
)

/* ——— O desktop ———————————————————————————————————————————————— */
const assets = readdirSync(join(DEST, 'app/assets'))
const fonte = (prefixo) => {
  const f = assets.find((a) => a.startsWith(prefixo) && a.endsWith('.woff2'))
  if (!f) throw new Error(`fonte ${prefixo} não achada no build`)
  return `app/assets/${f}`
}
const FONTES = [
  ['DM Sans', 500, fonte('dm-sans-latin-500-normal')],
  ['DM Sans', 600, fonte('dm-sans-latin-600-normal')],
  ['DM Mono', 500, fonte('dm-mono-latin-500-normal')],
]
  .map(
    ([familia, peso, url]) =>
      `@font-face { font-family: "${familia}"; font-weight: ${peso}; font-display: swap; src: url(${url}) format("woff2"); }`,
  )
  .join('\n  ')
writeFileSync(
  join(DEST, 'index.html'),
  readFileSync(join(FONTE, 'desktop.html'), 'utf8').replace('/*FONTES*/', FONTES),
)
cpSync(join(FONTE, 'desktop.js'), join(DEST, 'desktop.js'))

/* ——— Os papéis de parede, comprimidos para a web ———————————————————— */
// A tela virtual tem 1680 de largura e raramente aparece em escala 1: não
// vale mandar o JPEG de 1 MB que o app aplica na sessão.
for (const env of AMBIENTES) {
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    join(ROOT, 'src/renderer/assets/env', env, 'fundo.jpg'),
    '-vf',
    'scale=1680:-2:flags=lanczos',
    '-q:v',
    '4',
    join(DEST, 'fundos', `${env}.jpg`),
  ])
}

/* ——— O tamanho ———————————————————————————————————————————————— */
const tamanho = (dir) =>
  readdirSync(dir).reduce((soma, f) => {
    const p = join(dir, f)
    const s = statSync(p)
    return soma + (s.isDirectory() ? tamanho(p) : s.size)
  }, 0)
const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`
console.log(`  app ${mb(tamanho(join(DEST, 'app')))} · fundos ${mb(tamanho(join(DEST, 'fundos')))}`)
console.log(`✓ demo em ${DEST} (${mb(tamanho(DEST))})`)
