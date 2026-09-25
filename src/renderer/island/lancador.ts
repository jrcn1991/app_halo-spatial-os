/**
 * O que o campo de busca da ilha entende além de aplicativo e comando.
 *
 * A ideia veio do Raycast, e o que ela tem de bom não é a lista de recursos: é
 * a promessa de que UM campo resolve. Você digita e a resposta aparece ali —
 * não numa aba, não numa janela nova.
 *
 * O que entrou, e por que cada um:
 *
 * - **conta e conversão** — é o recurso mais usado de qualquer lançador, e o
 *   único que não depende de nada: nem de rede, nem de serviço, nem de estado.
 *   `2+2`, `15% de 240`, `30c em f`, `2 gb em mb`;
 * - **atalho de busca** — `g gatos` abre o Google. O Raycast chama de
 *   quicklink. Aqui é uma linha de texto que vira uma URL, e a ilha já sabe
 *   abrir URL no navegador do sistema;
 * - **emoji** — `:coracao` copia. A ilha já tem área de transferência e já
 *   sabe copiar; faltava um jeito de achar o símbolo.
 *
 * Tudo aqui é **função pura**: entra texto, sai resultado. Nada de I/O, nada de
 * estado — é o que permite testar sem abrir o app, e é o que mantém o campo
 * respondendo enquanto se digita.
 *
 * ## A conta NÃO usa `eval`
 *
 * A CSP do renderer é `script-src 'self'` e bloquearia `eval` de qualquer
 * forma, mas o motivo é anterior a isso: o texto vem de um campo, e transformar
 * texto de campo em código executável é a mesma classe de erro que abrir
 * `innerHTML` para resposta de modelo (CLAUDE.md § Agentes). O avaliador abaixo
 * lê números e operadores, e não sabe fazer mais nada.
 */

import { localeDoIdioma, marcar, t } from '@shared/i18n'

/** Um resultado do campo, pronto para a lista. */
export type Achado = {
  /** O que a linha mostra. */
  titulo: string
  /** A segunda linha, quando ajuda. */
  detalhe?: string
  icone: string
  /** O que vai para a área de transferência, quando a linha copia. */
  copiar?: string
  /** O endereço que a linha abre, quando ela abre. */
  abrir?: string
}

/* ==========================================================================
   Conta
   ========================================================================== */

type Ficha = { tipo: 'num'; valor: number } | { tipo: 'op'; op: string }

const PRECEDENCIA: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 }

/**
 * Quebra o texto em números, operadores e parênteses.
 *
 * Devolve `null` ao primeiro caractere que não pertence a uma conta — é o que
 * faz "cafeina 30" não virar uma expressão só porque tem um número dentro.
 */
function fichas(texto: string): Ficha[] | null {
  const t = texto.replace(/\s+/g, '').replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/')
  if (!t) return null
  const saida: Ficha[] = []
  let i = 0
  while (i < t.length) {
    const c = t[i] as string
    if (/\d|\./.test(c)) {
      let j = i
      while (j < t.length && /[\d.]/.test(t[j] as string)) j += 1
      const n = Number(t.slice(i, j))
      if (Number.isNaN(n)) return null
      saida.push({ tipo: 'num', valor: n })
      i = j
      continue
    }
    if ('+-*/%^()'.includes(c)) {
      saida.push({ tipo: 'op', op: c })
      i += 1
      continue
    }
    return null
  }
  return saida
}

/**
 * Avalia a expressão pelo pátio de manobra (shunting-yard).
 *
 * O menos UNÁRIO é resolvido aqui: `-3+1` e `2*-3` são contas válidas, e sem
 * isto o `-` inicial encontraria a pilha vazia. Ele vira `0 - 3`.
 */
function avaliar(lista: Ficha[]): number | null {
  const nums: number[] = []
  const ops: string[] = []

  const aplicar = (): boolean => {
    const op = ops.pop()
    const b = nums.pop()
    const a = nums.pop()
    if (op === undefined || a === undefined || b === undefined) return false
    if (op === '/' && b === 0) return false
    if (op === '%' && b === 0) return false
    nums.push(
      op === '+'
        ? a + b
        : op === '-'
          ? a - b
          : op === '*'
            ? a * b
            : op === '/'
              ? a / b
              : op === '%'
                ? a % b
                : a ** b,
    )
    return true
  }

  for (let i = 0; i < lista.length; i += 1) {
    const f = lista[i] as Ficha
    if (f.tipo === 'num') {
      nums.push(f.valor)
      continue
    }
    if (f.op === '(') {
      ops.push(f.op)
      continue
    }
    if (f.op === ')') {
      while (ops.length > 0 && ops.at(-1) !== '(') if (!aplicar()) return null
      if (ops.pop() !== '(') return null
      continue
    }
    // Menos unário: sem número à esquerda, `-` é sinal e não subtração.
    const anterior = lista[i - 1]
    const unario = f.op === '-' && (i === 0 || (anterior?.tipo === 'op' && anterior.op !== ')'))
    if (unario) {
      nums.push(0)
    }
    while (
      ops.length > 0 &&
      ops.at(-1) !== '(' &&
      (PRECEDENCIA[ops.at(-1) as string] ?? 0) >= (PRECEDENCIA[f.op] ?? 0)
    ) {
      if (!aplicar()) return null
    }
    ops.push(f.op)
  }
  while (ops.length > 0) if (!aplicar()) return null
  const r = nums.pop()
  return nums.length === 0 && r !== undefined && Number.isFinite(r) ? r : null
}

/** Número legível: até seis casas, sem zeros à toa, com separador brasileiro. */
export function numero(n: number): string {
  const arredondado = Math.round(n * 1e6) / 1e6
  return arredondado.toLocaleString(localeDoIdioma(), { maximumFractionDigits: 6 })
}

/* ==========================================================================
   Conversão

   Cada família tem uma unidade BASE e o fator de cada apelido para ela. Assim
   qualquer par da mesma família converte sem uma tabela de N×N.
   ========================================================================== */

type Familia = { base: string; unidades: Record<string, number> }

const FAMILIAS: Familia[] = [
  {
    base: 'm',
    unidades: {
      mm: 0.001,
      cm: 0.01,
      m: 1,
      km: 1000,
      pol: 0.0254,
      in: 0.0254,
      polegada: 0.0254,
      polegadas: 0.0254,
      pe: 0.3048,
      pes: 0.3048,
      ft: 0.3048,
      mi: 1609.344,
      milha: 1609.344,
      milhas: 1609.344,
    },
  },
  {
    base: 'g',
    unidades: {
      mg: 0.001,
      g: 1,
      kg: 1000,
      t: 1e6,
      lb: 453.59237,
      libra: 453.59237,
      libras: 453.59237,
      oz: 28.349523125,
    },
  },
  {
    // Base em BYTES, e os múltiplos são binários (1 KB = 1024 B) porque é o que
    // um gerenciador de arquivos mostra — converter em 1000 daria um número que
    // não bate com nada na tela do usuário.
    base: 'b',
    unidades: {
      b: 1,
      byte: 1,
      bytes: 1,
      kb: 1024,
      mb: 1024 ** 2,
      gb: 1024 ** 3,
      tb: 1024 ** 4,
    },
  },
  {
    base: 's',
    unidades: {
      ms: 0.001,
      s: 1,
      seg: 1,
      segundo: 1,
      segundos: 1,
      min: 60,
      minuto: 60,
      minutos: 60,
      h: 3600,
      hora: 3600,
      horas: 3600,
      d: 86400,
      dia: 86400,
      dias: 86400,
    },
  },
]

/** Temperatura não é proporcional: ela tem deslocamento, e vai à parte. */
const TEMPERATURAS: Record<string, (n: number) => number> = {
  // Tudo passa por Celsius.
  c: (n) => n,
  celsius: (n) => n,
  f: (n) => ((n - 32) * 5) / 9,
  fahrenheit: (n) => ((n - 32) * 5) / 9,
  k: (n) => n - 273.15,
  kelvin: (n) => n - 273.15,
}
const DE_CELSIUS: Record<string, (c: number) => number> = {
  c: (c) => c,
  celsius: (c) => c,
  f: (c) => (c * 9) / 5 + 32,
  fahrenheit: (c) => (c * 9) / 5 + 32,
  k: (c) => c + 273.15,
  kelvin: (c) => c + 273.15,
}

/** O símbolo com que a unidade é MOSTRADA, quando difere do que se digita. */
const SIMBOLO: Record<string, string> = { c: '°C', f: '°F', k: 'K' }

function converter(valor: number, de: string, para: string): string | null {
  if (TEMPERATURAS[de] && DE_CELSIUS[para]) {
    const celsius = (TEMPERATURAS[de] as (n: number) => number)(valor)
    const r = (DE_CELSIUS[para] as (c: number) => number)(celsius)
    return `${numero(r)} ${SIMBOLO[para] ?? para}`
  }
  for (const f of FAMILIAS) {
    const a = f.unidades[de]
    const b = f.unidades[para]
    if (a !== undefined && b !== undefined) return `${numero((valor * a) / b)} ${para}`
  }
  return null
}

/* ==========================================================================
   A leitura do campo
   ========================================================================== */

const PORCENTO_DE = /^(-?[\d.,]+)\s*%\s*(?:de|of)\s+(-?[\d.,]+)$/i
const PORCENTO_SOBRE = /^(-?[\d.,]+)\s*([+-])\s*([\d.,]+)\s*%$/
const CONVERSAO = /^(-?[\d.,]+)\s*([a-zç°]+)\s*(?:em|para|to|in|>)\s*([a-zç°]+)$/i

const limpo = (n: string) => Number(n.replace(/\./g, '').replace(',', '.'))
const unidade = (u: string) => u.toLowerCase().replace(/[°]/g, '').replace(/ç/g, 'c')

/**
 * O que a conta e as conversões acham no que foi digitado.
 *
 * Devolve no máximo UM achado: uma conta não é uma lista de sugestões, é a
 * resposta. Vazio quando o texto não é conta nenhuma — e é isso que impede
 * "cafeina 30" de virar "30".
 */
export function contaDoTexto(termo: string): Achado | null {
  const texto = termo.trim()
  if (!texto) return null

  // 15% de 240
  const pd = PORCENTO_DE.exec(texto)
  if (pd) {
    const r = (limpo(pd[1] as string) / 100) * limpo(pd[2] as string)
    return {
      titulo: numero(r),
      detalhe: t('{a}% de {b}', { a: pd[1] as string, b: pd[2] as string }),
      icone: 'Percent',
      copiar: numero(r),
    }
  }

  // 240 + 15%  /  240 - 15%
  const ps = PORCENTO_SOBRE.exec(texto)
  if (ps) {
    const base = limpo(ps[1] as string)
    const pct = limpo(ps[3] as string)
    const r = ps[2] === '+' ? base * (1 + pct / 100) : base * (1 - pct / 100)
    return {
      titulo: numero(r),
      detalhe: `${ps[1]} ${ps[2]} ${ps[3]}%`,
      icone: 'Percent',
      copiar: numero(r),
    }
  }

  // 30 c em f  ·  2 gb em mb  ·  10 km em mi
  const cv = CONVERSAO.exec(texto)
  if (cv) {
    const r = converter(limpo(cv[1] as string), unidade(cv[2] as string), unidade(cv[3] as string))
    if (r) {
      return {
        titulo: r,
        detalhe: `${cv[1]} ${cv[2]}`,
        icone: 'ArrowsLeftRight',
        copiar: r.replace(/\s[^\s]+$/, ''),
      }
    }
    return null
  }

  // A conta pura. Exige um OPERADOR: sem isso "42" sozinho viraria um
  // resultado, e o usuário que digitou 42 estava procurando outra coisa.
  if (!/[+\-*/%^]/.test(texto)) return null
  const lista = fichas(texto)
  if (!lista) return null
  const r = avaliar(lista)
  if (r === null) return null
  return { titulo: numero(r), detalhe: texto, icone: 'Equals', copiar: numero(r) }
}

/* ==========================================================================
   Atalhos de busca (os "quicklinks" do Raycast)
   ========================================================================== */

/**
 * A palavra na frente decide o site; o resto é o termo.
 *
 * Só sites de BUSCA, e de propósito: um atalho que abre uma página fixa já é
 * um favorito do navegador. O que falta num lançador é ir direto ao resultado.
 */
const ATALHOS: { chave: string; nome: string; url: string; icone: string }[] = [
  {
    chave: 'g',
    nome: 'Google',
    url: 'https://www.google.com/search?q=%s',
    icone: 'MagnifyingGlass',
  },
  {
    chave: 'yt',
    nome: 'YouTube',
    url: 'https://www.youtube.com/results?search_query=%s',
    icone: 'Play',
  },
  {
    chave: 'w',
    nome: 'Wikipédia',
    url: 'https://pt.wikipedia.org/w/index.php?search=%s',
    icone: 'File',
  },
  { chave: 'gh', nome: 'GitHub', url: 'https://github.com/search?q=%s', icone: 'Code' },
  {
    chave: 'mdn',
    nome: 'MDN',
    url: 'https://developer.mozilla.org/pt-BR/search?q=%s',
    icone: 'Code',
  },
  { chave: 'npm', nome: 'npm', url: 'https://www.npmjs.com/search?q=%s', icone: 'Package' },
  {
    chave: 'maps',
    nome: 'Google Maps',
    url: 'https://www.google.com/maps/search/%s',
    icone: 'MapPin',
  },
  {
    chave: 'tr',
    nome: marcar('Tradutor'),
    url: 'https://translate.google.com/?sl=auto&tl=pt&text=%s&op=translate',
    icone: 'Translate',
  },
]

export function atalhoDoTexto(termo: string): Achado | null {
  const m = /^([a-z]{1,4})\s+(.+)$/i.exec(termo.trim())
  if (!m) return null
  const atalho = ATALHOS.find((a) => a.chave === (m[1] as string).toLowerCase())
  if (!atalho) return null
  const busca = (m[2] as string).trim()
  return {
    titulo: `${t(atalho.nome)}: ${busca}`,
    detalhe: t('abre no navegador do sistema'),
    icone: atalho.icone,
    abrir: atalho.url.replace('%s', encodeURIComponent(busca)),
  }
}

/* ==========================================================================
   Emoji
   ========================================================================== */

/**
 * Uma lista curta e ESCOLHIDA, não a tabela Unicode inteira.
 *
 * Emoji completo são milhares de entradas e um arquivo de centenas de KB para
 * um recurso de conveniência. O que resolve o dia a dia são algumas dezenas —
 * e cada uma com os nomes em português que alguém realmente digitaria.
 */
const EMOJIS: { e: string; nomes: string }[] = [
  { e: '❤️', nomes: 'coracao amor vermelho' },
  { e: '🔥', nomes: 'fogo fire bom' },
  { e: '✅', nomes: 'ok certo check feito' },
  { e: '❌', nomes: 'errado x nao' },
  { e: '⚠️', nomes: 'aviso atencao alerta' },
  { e: '🎉', nomes: 'festa parabens comemorar' },
  { e: '🚀', nomes: 'foguete lancar rapido' },
  { e: '👍', nomes: 'joia positivo like' },
  { e: '👎', nomes: 'negativo dislike' },
  { e: '🙏', nomes: 'obrigado por favor gratidao' },
  { e: '😀', nomes: 'sorriso feliz' },
  { e: '😂', nomes: 'risada chorando rindo' },
  { e: '🤔', nomes: 'pensando duvida' },
  { e: '😅', nomes: 'alivio suor nervoso' },
  { e: '😍', nomes: 'apaixonado amei' },
  { e: '🤝', nomes: 'acordo aperto maos combinado' },
  { e: '💡', nomes: 'ideia lampada' },
  { e: '📌', nomes: 'fixar alfinete importante' },
  { e: '⏰', nomes: 'relogio alarme hora' },
  { e: '📎', nomes: 'anexo clipe' },
  { e: '🐛', nomes: 'bug inseto erro' },
  { e: '⭐', nomes: 'estrela favorito' },
  { e: '☕', nomes: 'cafe pausa' },
  { e: '🌊', nomes: 'onda mar agua' },
  { e: '🌴', nomes: 'palmeira praia verao' },
  { e: '🎵', nomes: 'musica nota som' },
  { e: '💻', nomes: 'computador notebook codigo' },
  { e: '📷', nomes: 'foto camera captura' },
  { e: '🔒', nomes: 'cadeado bloqueado seguro' },
  { e: '🔗', nomes: 'link corrente url' },
]

/** `:algo` procura emoji. Os dois-pontos evitam colidir com nome de programa. */
export function emojisDoTexto(termo: string): Achado[] {
  const m = /^:\s*(.*)$/.exec(termo.trim())
  if (!m) return []
  const chave = (m[1] as string).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const lista = chave ? EMOJIS.filter((x) => x.nomes.includes(chave)) : EMOJIS
  return lista.slice(0, 6).map((x) => ({
    titulo: `${x.e}  ${(x.nomes.split(' ')[0] as string).replace(/^\w/, (c) => c.toUpperCase())}`,
    detalhe: t('copiar'),
    icone: 'Copy',
    copiar: x.e,
  }))
}
