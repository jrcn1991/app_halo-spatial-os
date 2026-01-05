import type { CreativeItem } from '@shared/creative'

/**
 * A leitura do DOM do DeviantArt.
 *
 * ## Por que este seletor, e não outro
 *
 * As classes da página são hashes do empacotador — `div.DUvEbv`, `div.RyH8GD`
 * —, e elas mudam a cada publicação do site. Endereçar por classe é escrever
 * código com prazo de validade de dias.
 *
 * O que NÃO muda é o formato do endereço de uma obra:
 * `deviantart.com/<autor>/art/<titulo>-<id>`. Ele é a identidade pública de
 * cada publicação, aparece em link compartilhado, em busca e em RSS, e o site
 * não pode trocá-lo sem quebrar a internet inteira. Por isso a leitura parte
 * dele: `a[href*="/art/"]`, e a imagem é procurada DENTRO da âncora.
 *
 * "Dentro da âncora" foi medido: com `a.parentElement.querySelector('img')`
 * como reserva, a busca trazia o AVATAR do autor como capa — `titulo:
 * "RobsonCarr's avatar"`, capa em `a.deviantart.net/avatars-big/`. O cartão
 * mostrava a foto de perfil de quem publicou no lugar da obra.
 *
 * ## O que sai daqui
 *
 * Só o que a página mostra a quem a abre: endereço, autor, título e a
 * miniatura que ela mesma serve. Nada de conteúdo protegido, nada de arquivo
 * original, nada de dado de outro usuário. O download da obra continua sendo
 * no site, pelo botão "Abrir original".
 */

/** Um registro cru, como a página o entrega. */
export type CruDeviantArt = {
  url: string
  autor: string
  externalId: string
  titulo: string
  capa: string
  largura: number
  altura: number
}

/**
 * O script que roda NA PÁGINA.
 *
 * Texto fixo, escrito aqui: `navegarELer` nunca recebe script vindo da tela.
 * Se um dia receber, isto deixa de ser "ler a página" e vira "executar o que
 * mandarem", que é outra coisa.
 */
export const LER_OBRAS = `(() => {
  // Avatares e emotes vêm de hosts próprios e nunca são a obra.
  const NAO_E_CAPA = /(^|\\.)(a\\.deviantart\\.net|e\\.deviantart\\.net)\\//
  const vistos = new Set()
  const itens = []

  for (const a of document.querySelectorAll('a[href*="/art/"]')) {
    const m = a.href.match(/deviantart\\.com\\/([^/]+)\\/art\\/([^/?#]+)/)
    if (!m || vistos.has(a.href)) continue

    // DENTRO da âncora, e só: a imagem irmã costuma ser o avatar do autor.
    const img = a.querySelector('img')
    if (!img) continue
    const src = img.currentSrc || img.src || ''
    if (!src || NAO_E_CAPA.test(src)) continue

    vistos.add(a.href)
    const slug = m[2]
    itens.push({
      url: a.href.split('?')[0],
      autor: m[1],
      externalId: (slug.match(/-(\\d+)$/) || ['', ''])[1],
      // O \`alt\` da imagem é o título que o autor deu. Sem ele, o slug do
      // endereço — que é o mesmo título, com hífens e o id no fim.
      titulo: (img.alt || slug.replace(/-\\d+$/, '').replace(/-/g, ' ')).trim(),
      capa: src,
      largura: img.naturalWidth || 0,
      altura: img.naturalHeight || 0,
    })
  }
  return itens
})()`

/**
 * O endereço da busca no site, como o campo de busca dele monta.
 *
 * `&page=N` é a paginação — medido, e os outros dois candidatos (`offset` e
 * `cursor`) são ignorados pelo site: devolvem a página 1 de novo. A página 1
 * vai sem parâmetro nenhum, como o próprio site a escreve.
 */
export const buscaDeviantArt = (termo: string, pagina = 1) =>
  `https://www.deviantart.com/search?q=${encodeURIComponent(termo)}${pagina > 1 ? `&page=${pagina}` : ''}`

/** A home — o feed de quem o usuário segue, quando há sessão. */
export const HOME_DEVIANTART = 'https://www.deviantart.com/'

/**
 * Do registro cru ao modelo comum.
 *
 * Campo que a página não dá fica VAZIO ou NULO — nunca preenchido por dedução.
 * Curtidas, visualizações e downloads não aparecem no feed, e zero ali seria
 * uma afirmação falsa: a leitura de um item (o oEmbed, em `deviantart.ts`) é
 * quem os traz, quando o usuário abre o detalhe.
 */
export function itemDoCru(cru: CruDeviantArt): CreativeItem {
  return {
    id: `deviantart:${cru.url}`,
    provider: 'deviantart',
    externalId: cru.externalId,
    title: cru.titulo,
    description: '',
    author: cru.autor,
    authorAvatar: '',
    cover: cru.capa,
    gallery: [],
    url: cru.url,
    // A taxonomia desta tela, não a do DeviantArt. O feed não diz o meio da
    // obra, e "arte digital" é o que o site é — quem afina é o filtro de tipo.
    kind: 'arte-digital',
    tags: [],
    license: '',
    likes: null,
    views: null,
    downloads: null,
    publishedAt: null,
    meta: cru.largura > 0 ? { largura: String(cru.largura), altura: String(cru.altura) } : {},
  }
}
