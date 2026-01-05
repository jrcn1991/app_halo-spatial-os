import type { CreativeItem } from '@shared/creative'

/**
 * A leitura do DOM do Behance.
 *
 * O endereço de um projeto — `behance.net/gallery/<id>/<slug>` — é a identidade
 * pública dele. O id numérico é o que sobrevive a uma renomeação do título.
 *
 * ## Parte da IMAGEM, como no ArtStation
 *
 * MEDIDO: na BUSCA há 48 links de projeto e NENHUM com imagem dentro — a capa
 * é irmã da âncora, não filha. Uma regra que partisse do link não achava nada
 * ali. Subir da imagem até o link serve para a busca e para a home.
 *
 * ## E a capa é só a do caminho `/projects/`
 *
 * A armadilha do avatar, pela terceira vez e com outra roupa: a home também
 * serve imagens de `a5.behance.net/…/img/creator_…` — retratos de quem publica,
 * 360px —, e elas aparecem ANTES das capas no DOM. Casá-las com o link do
 * projeto dava o rosto no lugar do trabalho.
 *
 * A capa de verdade é `mir-s3-cdn-cf.behance.net/projects/…`, e ela vem grande
 * (849 a 1400px na medição). O caminho é o que separa as duas.
 */

/** Um registro cru, como a página o entrega. */
export type CruBehance = {
  url: string
  externalId: string
  titulo: string
  capa: string
}

/** O script que roda NA PÁGINA. Texto fixo, escrito aqui. */
export const LER_PROJETOS = String.raw`(() => {
  const CAPA = /mir-s3-cdn-cf\.behance\.net\/projects\//
  // "Capa para X" é o texto de acessibilidade do site, não o título.
  const PREFIXO = /^capa para\s*|^cover for\s*/i
  const porProjeto = new Map()

  for (const img of document.querySelectorAll('img')) {
    const src = img.currentSrc || img.src || ''
    if (!src || !CAPA.test(src)) continue

    let a = img.closest('a[href*="/gallery/"]')
    if (!a) {
      let e = img.parentElement
      for (let k = 0; k < 5 && e && !a; k++, e = e.parentElement) {
        a = e.querySelector('a[href*="/gallery/"]')
      }
    }
    if (!a) continue

    const m = a.href.match(/\/gallery\/(\d+)\/([^/?#]*)/)
    if (!m || porProjeto.has(m[1])) continue
    porProjeto.set(m[1], {
      url: 'https://www.behance.net/gallery/' + m[1] + '/' + m[2],
      externalId: m[1],
      titulo: (img.alt || '').replace(PREFIXO, '').trim(),
      capa: src,
    })
  }
  return [...porProjeto.values()]
})()`

/** A home — o feed curado pelo perfil, quando há sessão. */
export const HOME_BEHANCE = 'https://www.behance.net/'

/** A busca do site, como o campo de busca dele monta. */
export const buscaBehance = (termo: string) =>
  `https://www.behance.net/search/projects?search=${encodeURIComponent(termo)}`

/** Do registro cru ao modelo comum. */
export function itemDoProjeto(cru: CruBehance): CreativeItem {
  return {
    id: `behance:${cru.externalId}`,
    provider: 'behance',
    externalId: cru.externalId,
    title: cru.titulo,
    description: '',
    // A grade não diz quem publicou — o nome aparece colado ao título no texto
    // do cartão, e separar por heurística seria inventar.
    author: '',
    authorAvatar: '',
    cover: cru.capa,
    gallery: [],
    url: cru.url,
    // O Behance é a rede de portfólio de design da Adobe. Não é tão inequívoco
    // quanto o Thingiverse (há ilustração, fotografia e UI ali dentro), mas é o
    // centro de gravidade da plataforma — e o filtro de tipo é do usuário.
    kind: 'design',
    tags: [],
    license: '',
    likes: null,
    views: null,
    downloads: null,
    publishedAt: null,
    meta: {},
  }
}
