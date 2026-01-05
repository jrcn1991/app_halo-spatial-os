#!/usr/bin/env node
/**
 * Guarda-fidelidade nº 1: duas verificações de estilo.
 *
 * 1. Nenhuma cor literal fora de `styles/tokens.css`. O handoff é uma tabela de
 *    tokens; cor solta num componente deixa de ser rastreável até ele. Único
 *    ponto fora deste alcance: `src/main/window.ts` (backgroundColor da
 *    janela), que roda antes do CSS existir.
 *
 * 2. A CSP dos cinco renderers é EXATAMENTE a que este arquivo declara. Ela é a
 *    parede que impede o renderer de alcançar rede e disco, e afrouxá-la não
 *    quebra nada visível: o app continua abrindo, e só passa a poder mais.
 *    Host novo entra aqui e no comentário do HTML, junto com o motivo.
 *
 * 3. Arquivo de tema só redefine token que já existe, e só sob o próprio
 *    `data-env`. O `:root` NU que cada tema tem (para a amostra de cores do
 *    painel de Ambientes) é a exceção — e é justamente por onde um tema
 *    repintaria a Floresta sem ninguém ver.
 *
 * 4. Toda animação referenciada aponta para um keyframe que existe no bundle.
 *    O CSS Modules renomeia `animation-name` para o escopo do módulo, então
 *    `animation: halo-side` dentro de um `.module.css` vira um nome hasheado
 *    que não existe — e a animação não roda, sem erro nenhum. Foi assim que a
 *    entrada inteira do app ficou morta sem ninguém perceber. Esta verificação
 *    lê o CSS já construído, onde o problema é visível.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath: o caminho do projeto tem espaço e acento.
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCAN = join(ROOT, 'src/renderer')
// A ilha dinâmica tem paleta própria porque é código isolado: misturar as
// duas faria uma mudança nela respingar nas sete telas. A regra em si não
// muda — cor literal continua só em arquivo de tokens.
// `styles/env-<id>.css` são arquivos de TEMA: cada um só redefine, sob
// `:root[data-env='<id>']`, tokens que já existem em `tokens.css`. Um tema é um
// arquivo de tokens — a regra não muda, continua valendo que cor literal não
// aparece em componente.
const ALLOW = [
  'styles/tokens.css',
  'styles/env-citypop.css',
  'styles/env-cyberpunk.css',
  'styles/env-bioshock.css',
  'island/tokens.css',
]
const EXT = /\.(css|ts|tsx)$/

/**
 * Cor literal = hex, ou função de cor com canal numérico. Sintaxe relativa
 * feita só de tokens — `rgb(from color-mix(…var(--x)…) r g b / var(--y))` —
 * não é literal: é composição, e é assim que os ajustes de Aparência chegam
 * ao vidro.
 */
const COLOR = /(#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lch|lab)\s*\([^)]*\d)/g
/** var(--nome) some antes da varredura: o que resta é o que foi escrito à mão. */
const VAR_REF = /var\(\s*--[\w-]+\s*\)/g
/** `${...}` também some: cor montada a partir de números não é literal. */
const INTERPOLATION = /\$\{[^}]*\}/g

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (EXT.test(entry)) yield full
  }
}

/**
 * Apaga comentários mantendo as quebras de linha, para os números de linha
 * continuarem certos. Olhar só o início da linha não bastava: um `#0cf` citado
 * no meio de um comentário de bloco era acusado como cor de verdade.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, before) => before + ' '.repeat(m.length - before.length))
}

const problems = []
for (const file of walk(SCAN)) {
  const rel = relative(SCAN, file)
  if (ALLOW.includes(rel)) continue
  stripComments(readFileSync(file, 'utf8'))
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.replace(VAR_REF, '').replace(INTERPOLATION, '').matchAll(COLOR)) {
        problems.push(`  ${rel}:${i + 1}  ${m[0].trim()}   ${line.trim().slice(0, 72)}`)
      }
    })
}

// ——— 2. animações apontam para keyframes existentes ———————————————————

const BUILT = join(ROOT, 'out/renderer/assets')
/** Palavras do shorthand `animation` que não são nome de keyframe. */
const KEYWORDS = new Set([
  'normal',
  'reverse',
  'alternate',
  'alternate-reverse',
  'none',
  'forwards',
  'backwards',
  'both',
  'running',
  'paused',
  'infinite',
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'step-start',
  'step-end',
  'inherit',
  'initial',
  'unset',
  'revert',
  'auto',
])

/* ——— 2. A CSP dos cinco renderers ———————————————————————————————
   Escrita aqui inteira, e comparada diretiva a diretiva. O objetivo não é
   "parecer certa": é que qualquer mudança precise passar por este arquivo, com
   o motivo, em vez de escorregar num HTML. */
const CSP_PADRAO = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self' 'unsafe-inline'",
  // A única fresta, host a host: capas que já são URLs públicas. Imagem, e
  // nada além — ver o comentário de `src/renderer/index.html`.
  'img-src': "'self' data: https://image.tmdb.org https://*.scdn.co https://*.spotifycdn.com",
  'font-src': "'self' data:",
  'connect-src': "'self'",
}
const CSP_ESPERADA = {
  // Só a janela do app abre o CDN do DeviantArt (Social Arte). A ilha NÃO
  // recebe o host: ela não mostra capa de plataforma nenhuma, e alargar a CSP
  // dela "porque é o padrão" seria dar alcance que ela não usa.
  'index.html': {
    ...CSP_PADRAO,
    'img-src': [
      CSP_PADRAO['img-src'],
      'https://*.wixmp.com',
      'https://i.pinimg.com',
      'https://cdn.thingiverse.com',
      'https://resize.thingiverse.com',
      'https://*.artstation.com',
      'https://mir-s3-cdn-cf.behance.net',
    ].join(' '),
  },
  'island.html': CSP_PADRAO,
  // O lançador de Meta+V não mostra imagem de fora nenhuma, e por isso não
  // recebe host. Ficava de fora desta conferência sem motivo nenhum.
  'launcher.html': { ...CSP_PADRAO, 'img-src': "'self' data:" },
  // A janela dos avisos não mostra imagem de fora: ícone e avatar de cada
  // notificação chegam do main já em `data:`. Nenhum host.
  'notificacoes.html': { ...CSP_PADRAO, 'img-src': "'self' data:" },
  // O player toca vídeo de uma lista M3U do usuário, que é HTTP.
  'player.html': {
    ...CSP_PADRAO,
    'img-src': "'self' data: https://image.tmdb.org",
    'media-src': 'http: https:',
  },
}

for (const [arquivo, esperada] of Object.entries(CSP_ESPERADA)) {
  const html = readFileSync(join(SCAN, arquivo), 'utf8')
  const meta = html.match(/http-equiv="Content-Security-Policy"\s*\n?\s*content="([^"]+)"/)
  if (!meta) {
    problems.push(`  ${arquivo}  sem meta Content-Security-Policy`)
    continue
  }
  const achada = Object.fromEntries(
    meta[1]
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => [d.split(/\s+/)[0], d.split(/\s+/).slice(1).join(' ')]),
  )
  for (const [dir, valor] of Object.entries(esperada)) {
    if (!(dir in achada)) problems.push(`  ${arquivo}  CSP perdeu a diretiva "${dir}"`)
    else if (achada[dir] !== valor) {
      problems.push(`  ${arquivo}  CSP "${dir}": "${achada[dir]}"\n      esperado: "${valor}"`)
    }
  }
  for (const dir of Object.keys(achada)) {
    if (!(dir in esperada)) problems.push(`  ${arquivo}  CSP ganhou a diretiva "${dir}"`)
  }
}

/* ——— 3. Arquivo de tema não repinta a Floresta ————————————————
   Duas cobranças. (a) O `:root` NU de um tema — o que existe para a amostra de
   cores do painel de Ambientes — não pode declarar nome que `tokens.css` já
   declara: dali ele valeria em TODOS os ambientes, inclusive na Floresta, que é
   intocável. (b) Todo outro seletor em coluna zero começa por
   `:root[data-env="<id>"]`, com o id batendo com o nome do arquivo. Ver
   CRIACAO-DE-TEMAS.md § 3. */
const tokensCss = readFileSync(join(SCAN, 'styles/tokens.css'), 'utf8')
const doHandoff = new Set([...tokensCss.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]))

for (const arquivo of readdirSync(join(SCAN, 'styles')).filter((f) => /^env-.+\.css$/.test(f))) {
  const id = arquivo.slice(4, -4)
  const css = readFileSync(join(SCAN, 'styles', arquivo), 'utf8')

  const nu = css.match(/^:root \{\n([\s\S]*?)^\}/m)
  if (nu) {
    for (const m of nu[1].matchAll(/^\s*(--[\w-]+)\s*:/gm)) {
      if (doHandoff.has(m[1])) {
        problems.push(
          `  styles/${arquivo}  o \`:root\` nu declara ${m[1]}, que existe em tokens.css` +
            `\n      dali ele valeria também na Floresta — mova para :root[data-env="${id}"]`,
        )
      }
    }
  }

  for (const m of css.matchAll(/^(:root[^\s{,]*|[.#[][^\s{,]*)/gm)) {
    const sel = m[1]
    if (sel === ':root' || sel.startsWith(`:root[data-env="${id}"]`)) continue
    problems.push(
      `  styles/${arquivo}  seletor "${sel}" fora de :root[data-env="${id}"]` +
        '\n      um tema só alcança as telas por baixo do próprio data-env',
    )
  }
}

let built = []
let semBundle = false
try {
  built = readdirSync(BUILT).filter((f) => f.endsWith('.css'))
} catch {
  semBundle = true
  console.log('  (pulei a verificação de animações: rode `npm run build` antes)')
}

for (const file of built) {
  const css = readFileSync(join(BUILT, file), 'utf8')
  const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]))

  for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
    // Remove funções (var(), cubic-bezier(), steps()) e durações.
    const rest = m[1].replace(/[\w-]+\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' ')
    for (const token of rest.split(/[\s,]+/)) {
      if (!token || KEYWORDS.has(token)) continue
      if (/^[\d.]/.test(token)) continue
      if (!defined.has(token)) {
        problems.push(
          `  ${file}  animação "${token}" não tem @keyframes no bundle` +
            (token.includes('_') ? '  ← nome hasheado pelo CSS Modules' : ''),
        )
      }
    }
  }
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} problema(s) de estilo:\n`)
  console.error(problems.join('\n'))
  console.error(
    '\n  Cores: mova o valor para styles/tokens.css e use var(--token).' +
      '\n  Animações: declare em styles/animations.css via [data-halo-in], não num .module.css.\n',
  )
  process.exit(1)
}
// Sem o bundle, a verificação 4 não rodou — e anunciá-la mesmo assim era a
// própria mentira que este arquivo existe para impedir.
console.log(
  semBundle
    ? '✓ cores só em tokens.css · CSP e temas conferidos · animações NÃO verificadas (rode `npm run build`)'
    : '✓ cores só em tokens.css · CSP e temas conferidos · toda animação aponta para um keyframe existente',
)
