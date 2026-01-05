import type { CreativeItem } from '@shared/creative'

/**
 * A leitura do DOM do Pinterest.
 *
 * ## Por que este seletor
 *
 * Mesma disciplina do DeviantArt: as classes da página são hashes do
 * empacotador e mudam a cada publicação. O que não muda é o endereço de um
 * pin — `pinterest.com/pin/<id>/` —, que é a identidade pública dele e aparece
 * em todo link compartilhado. Daí `a[href*="/pin/"]`, com a imagem procurada
 * DENTRO da âncora.
 *
 * ## O que o Pinterest NÃO dá na grade, e por isso fica vazio
 *
 * A grade é só imagem. Não há autor, não há data e não há métrica ali — e
 * campo que a página não dá fica vazio ou nulo, nunca preenchido por dedução.
 * O texto que existe é o `alt` da imagem, que é a descrição que quem publicou
 * escreveu: ele vira o título, porque um cartão sem nome nenhum é inútil na
 * biblioteca.
 *
 * **E fica assim, por decisão.** Dá para completar autor e data abrindo a
 * página de cada pin — é o que o oEmbed faz no DeviantArt. A diferença é o
 * custo: lá é uma consulta a um endereço; aqui seria uma NAVEGAÇÃO INTEIRA
 * por item no navegador de segundo plano (~5 a 7s cada, mais o piso de 1,2s
 * entre navegações). Encher 24 cartões seriam minutos de espera e dezenas de
 * carregamentos nos servidores deles, para um campo que a grade não tem.
 *
 * O usuário decidiu em 04/09/2026: a tela mostra o que a página mostra. Se um
 * dia isso mudar, o lugar é o DETALHE — um pin de cada vez, quando ele abre —,
 * e nunca a grade.
 *
 * ## O título vem sujo
 *
 * O `alt` de cada pin começa com o texto de acessibilidade do site — em
 * português, "Contém uma imagem de:". Não é título de nada, e às vezes é tudo
 * o que existe (pin sem descrição). O prefixo sai na leitura; o que sobra
 * vazio fica vazio, e a tela mostra "Sem título" em vez de repetir a frase.
 *
 * ## `srcset`, e não `src`
 *
 * O Pinterest serve a mesma imagem em vários tamanhos e deixa o navegador
 * escolher. Numa janela de segundo plano o escolhido costuma ser o menor
 * (`/60x60/`), que na nossa grade apareceria borrado. A leitura pega a MAIOR
 * candidata do `srcset` quando ele existe.
 */

/** Um registro cru, como a página o entrega. */
export type CruPinterest = {
  url: string
  externalId: string
  titulo: string
  capa: string
}

/** O script que roda NA PÁGINA. Texto fixo, escrito aqui. */
export const LER_PINS = `(() => {
  // MEDIDO em pt-BR: o \`alt\` de cada pin começa com "Contém uma imagem de:".
  // É texto de acessibilidade do próprio Pinterest, não título — e ele muda com
  // o idioma da conta, daí as outras formas. Só a portuguesa foi medida; as
  // demais estão aqui para uma conta em outro idioma não virar uma grade de
  // "Contains an image of:".
  // A frase varia — "Contém uma imagem de:" e "Contém:" foram as duas vistas —,
  // então a regra é o COMEÇO dela até o primeiro dois-pontos, e só quando ela
  // começa por um verbo desses. Um título de verdade que tivesse dois-pontos
  // logo no início ("GUI: Art Deco Style") não casa, e continua inteiro.
  const PREFIXO = /^(cont[ée]m|contains|puede ser|may be)[^:]{0,40}:\\s*/i
  const vistos = new Set()
  const itens = []

  // A maior candidata do srcset; sem srcset, o src mesmo.
  const melhor = (img) => {
    const set = img.getAttribute('srcset') || ''
    if (!set) return img.currentSrc || img.src || ''
    let url = '', largura = -1
    for (const parte of set.split(',')) {
      const [u, w] = parte.trim().split(/\\s+/)
      const n = Number((w || '').replace('w', '')) || 0
      if (u && n >= largura) { largura = n; url = u }
    }
    return url || img.currentSrc || img.src || ''
  }

  for (const a of document.querySelectorAll('a[href*="/pin/"]')) {
    const m = a.href.match(/\\/pin\\/([A-Za-z0-9_-]+)/)
    if (!m || vistos.has(m[1])) continue
    const img = a.querySelector('img')
    if (!img) continue
    const capa = melhor(img)
    if (!capa) continue
    vistos.add(m[1])
    itens.push({
      url: 'https://www.pinterest.com/pin/' + m[1] + '/',
      externalId: m[1],
      // O \`alt\` é a descrição de quem publicou — é o único texto da grade.
      // Vem com o prefixo de acessibilidade do site ("Contém uma imagem de:"),
      // que não é o título de nada; sem nada depois dele, o pin não tem título
      // mesmo, e a tela mostra "Sem título" em vez de repetir o prefixo.
      titulo: (img.alt || '').replace(PREFIXO, '').trim(),
      capa,
    })
  }
  return itens
})()`

/** A home: o feed montado a partir do que o usuário salva e segue. */
export const HOME_PINTEREST = 'https://br.pinterest.com/'

/** A busca do site, como o campo de busca dele monta. */
export const buscaPinterest = (termo: string) =>
  `https://br.pinterest.com/search/pins/?q=${encodeURIComponent(termo)}`

/**
 * Do registro cru ao modelo comum.
 *
 * Sem título, o cartão mostra "Sem título" — e isso é a verdade: há pin sem
 * descrição nenhuma, e inventar um nome a partir do endereço seria pior.
 */
export function itemDoPin(cru: CruPinterest): CreativeItem {
  return {
    id: `pinterest:${cru.externalId}`,
    provider: 'pinterest',
    externalId: cru.externalId,
    title: cru.titulo,
    description: '',
    // A grade não diz quem publicou, e deduzir seria inventar.
    author: '',
    authorAvatar: '',
    cover: cru.capa,
    gallery: [],
    url: cru.url,
    // Um pin é qualquer coisa; "outra referência" é o que se sabe dele aqui.
    // Quem afina é o filtro de tipo, escolhido pelo usuário.
    kind: 'outro',
    tags: [],
    license: '',
    likes: null,
    views: null,
    downloads: null,
    publishedAt: null,
    meta: {},
  }
}
