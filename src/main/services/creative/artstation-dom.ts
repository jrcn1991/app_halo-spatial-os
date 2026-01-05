import type { CreativeItem } from '@shared/creative'

/**
 * A leitura do DOM do ArtStation.
 *
 * O endereço de uma obra — `artstation.com/artwork/<id>` — é a identidade
 * pública dela. As classes da página são de um app Angular
 * (`gallery-grid-link`, `ng-tns-c57026603-0`): a segunda tem número de
 * compilação no nome, então endereçar por classe aqui teria prazo de validade
 * ainda menor que nos outros.
 *
 * ## A armadilha do avatar, de novo — e pior
 *
 * MEDIDO: cada cartão traz DUAS imagens da mesma obra. Uma é a capa, a outra é
 * o AVATAR do autor. Não basta procurar a imagem dentro da âncora, como
 * resolveu no DeviantArt: aqui as duas estão em âncoras válidas para a mesma
 * obra, e pegar a primeira daria o rosto do artista no lugar do trabalho dele.
 *
 * A regra é a FONTE da imagem: avatar vem de `/users/avatars/`, capa vem de
 * `/assets/covers/` ou `/assets/images/`.
 *
 * ## E as duas páginas montam o cartão diferente
 *
 * MEDIDO: na BUSCA a capa está DENTRO de `a[href*="/artwork/"]`; na HOME não
 * está — ali a âncora de obra envolve o avatar, e a capa é irmã dela. Uma regra
 * que partisse da âncora servia só para a busca: a home rendia 4 obras de 263
 * imagens na página.
 *
 * Por isso a leitura parte da IMAGEM e sobe até achar a obra. Serve para as
 * duas, e sobrevive a uma terceira montagem.
 */

/** Um registro cru, como a página o entrega. */
export type CruArtStation = {
  url: string
  externalId: string
  titulo: string
  capa: string
}

/** O script que roda NA PÁGINA. Texto fixo, escrito aqui. */
export const LER_ARTES = String.raw`(() => {
  const CAPA = /\/assets\/(covers|images)\//
  const porObra = new Map()

  for (const img of document.querySelectorAll('img')) {
    const src = img.currentSrc || img.src || ''
    if (!src || !CAPA.test(src)) continue

    let a = img.closest('a[href*="/artwork/"]')
    if (!a) {
      // Sobe alguns níveis e procura a âncora da obra por perto. O limite
      // existe para não capturar a obra do cartão vizinho.
      let e = img.parentElement
      for (let k = 0; k < 5 && e && !a; k++, e = e.parentElement) {
        a = e.querySelector('a[href*="/artwork/"]')
      }
    }
    if (!a) continue

    const m = a.href.match(/artstation\.com\/artwork\/([A-Za-z0-9_-]+)/)
    if (!m || porObra.has(m[1])) continue
    porObra.set(m[1], {
      url: 'https://www.artstation.com/artwork/' + m[1],
      externalId: m[1],
      titulo: (img.alt || '').trim(),
      capa: src,
    })
  }
  return [...porObra.values()]
})()`

/** A home — o feed de quem o usuário segue, quando há sessão. */
export const HOME_ARTSTATION = 'https://www.artstation.com/'

/** A busca do site, como o campo de busca dele monta. */
export const buscaArtStation = (termo: string) =>
  `https://www.artstation.com/search?sort_by=relevance&query=${encodeURIComponent(termo)}`

/**
 * Do registro cru ao modelo comum.
 *
 * O autor fica VAZIO: na grade ele aparece só como texto colado ao título
 * ("Streets of Agriont Marvin HillmannPRO"), e separar os dois por heurística
 * seria inventar. A mesma decisão do Pinterest e do Thingiverse.
 */
export function itemDaArte(cru: CruArtStation): CreativeItem {
  return {
    id: `artstation:${cru.externalId}`,
    provider: 'artstation',
    externalId: cru.externalId,
    title: cru.titulo,
    description: '',
    author: '',
    authorAvatar: '',
    cover: cru.capa,
    gallery: [],
    url: cru.url,
    kind: 'arte-digital',
    tags: [],
    license: '',
    likes: null,
    views: null,
    downloads: null,
    publishedAt: null,
    meta: {},
  }
}
