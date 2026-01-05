import type { CreativeItem } from '@shared/creative'

/**
 * A leitura do DOM do Thingiverse.
 *
 * Mesma disciplina das outras: o endereço de um modelo —
 * `thingiverse.com/thing:<id>` — é a identidade pública dele e aparece em todo
 * link compartilhado. As classes da página, não; elas são hashes que mudam a
 * cada publicação do site.
 *
 * A imagem é procurada DENTRO da âncora. MEDIDO: a home tem 104 links para
 * `thing:` e só 20 com imagem — os outros 84 são o título e o autor apontando
 * para o mesmo modelo. Pegar a imagem "por perto" traria a do vizinho.
 *
 * O `alt` vem como "Thumbnail representing <título>", que é texto de
 * acessibilidade do site e não um título. O prefixo sai na leitura.
 *
 * O que a grade NÃO dá: autor, data e número de downloads. Ficam vazios ou
 * nulos — a mesma decisão do Pinterest, e pelo mesmo motivo: completá-los
 * exigiria abrir a página de cada modelo, uma navegação por item.
 */

/** Um registro cru, como a página o entrega. */
export type CruThingiverse = {
  url: string
  externalId: string
  titulo: string
  capa: string
}

/** O script que roda NA PÁGINA. Texto fixo, escrito aqui. */
export const LER_COISAS = `(() => {
  const PREFIXO = /^thumbnail representing\\s*/i
  const vistos = new Set()
  const itens = []

  for (const a of document.querySelectorAll('a[href*="/thing:"]')) {
    const m = a.href.match(/\\/thing:(\\d+)/)
    if (!m || vistos.has(m[1])) continue
    const img = a.querySelector('img')
    if (!img) continue
    const capa = img.currentSrc || img.src || ''
    if (!capa) continue
    vistos.add(m[1])
    itens.push({
      url: 'https://www.thingiverse.com/thing:' + m[1],
      externalId: m[1],
      titulo: (img.alt || '').replace(PREFIXO, '').trim(),
      capa,
    })
  }
  return itens
})()`

/**
 * A home e a busca, as duas paginadas por `?page=N`.
 *
 * MEDIDO: 20 por página nas duas, com ZERO sobreposição entre páginas
 * consecutivas (home 1-2 e 2-3, busca 1-2). É a paginação mais limpa das três
 * fontes — aqui não é preciso rolar nada.
 */
export const homeThingiverse = (pagina = 1) =>
  `https://www.thingiverse.com/${pagina > 1 ? `?page=${pagina}` : ''}`

export const buscaThingiverse = (termo: string, pagina = 1) =>
  `https://www.thingiverse.com/search?q=${encodeURIComponent(termo)}&page=${pagina}&type=things&sort=relevant`

/** Do registro cru ao modelo comum. */
export function itemDaCoisa(cru: CruThingiverse): CreativeItem {
  return {
    id: `thingiverse:${cru.externalId}`,
    provider: 'thingiverse',
    externalId: cru.externalId,
    title: cru.titulo,
    description: '',
    // A grade não diz quem publicou, e deduzir seria inventar.
    author: '',
    authorAvatar: '',
    cover: cru.capa,
    gallery: [],
    url: cru.url,
    // Aqui o tipo não é chute: o Thingiverse É modelo para impressão 3D, e é a
    // única das três fontes em que a plataforma inteira responde por um tipo.
    kind: 'impressao-3d',
    tags: [],
    license: '',
    likes: null,
    views: null,
    downloads: null,
    publishedAt: null,
    meta: {},
  }
}
