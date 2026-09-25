import type { CreativeItem } from '@shared/creative'
import { marcar, t } from '@shared/i18n'
import {
  buscaDeviantArt,
  type CruDeviantArt,
  HOME_DEVIANTART,
  itemDoCru,
  LER_OBRAS,
} from './deviantart-dom'
import { abrirLogin, navegarEColher, navegarELer, temSessao } from './navegador'
import type { Provedor } from './provedor'
import { buscarJson } from './rede'

/**
 * DeviantArt.
 *
 * O oEmbed deles (`backend.deviantart.com/oembed`) é PÚBLICO e não pede
 * credencial nenhuma — medido, e é por isso que este provedor lê um item no
 * primeiro dia, sem o usuário registrar app nenhum. Ele devolve quase o modelo
 * inteiro: título, autor, imagem, data, tags, licença e até as estatísticas de
 * visualização, favoritos e downloads.
 *
 * O que o oEmbed NÃO faz é buscar, e a API que buscava perdeu `browse/newest`
 * e `browse/popular` em 01/07/2024. Quem busca — e quem traz a home — é o
 * NAVEGADOR de segundo plano (`navegador.ts`): a mesma página que o usuário
 * abriria no Chrome, com a sessão dele, lida pelo DOM. A home logada, aliás,
 * não existe em API nenhuma: é o feed que ele montou seguindo quem segue.
 *
 * A divisão de trabalho ficou assim, e cada metade faz o que faz melhor:
 *
 * - **navegador** para LISTAS (home e busca) — muitas obras, poucos campos;
 * - **oEmbed** para UM ITEM (o detalhe) — um endereço, todos os campos, sem
 *   carregar página nenhuma.
 */

const OEMBED = 'https://backend.deviantart.com/oembed'

/**
 * Os cookies que só existem com a conta conectada.
 *
 * MEDIDO em 04/09/2026 na partição do app: uma visita deslogada já grava
 * `_px`, `_pxhd`, `_pxvid`, `aws-waf-token` e `g_state`. Estes três aparecem
 * junto com o login — `auth` e `auth_secure` são `httpOnly`.
 */
const SESSAO = {
  dominio: '.deviantart.com',
  cookies: [{ nome: 'auth' }, { nome: 'auth_secure' }, { nome: 'userinfo' }],
} as const

/**
 * A leitura da home em curso.
 *
 * Mora aqui, e não numa variável local, porque "carregar mais" é outra chamada:
 * sem guardar o que já foi colhido, cada clique recomeçaria a rolagem do topo.
 * Some quando o cursor volta a zero — uma home nova é uma leitura nova.
 */
const colhidas = new Map<string, CruDeviantArt>()

type OEmbed = {
  title?: string
  url?: string
  thumbnail_url?: string
  author_name?: string
  author_url?: string
  pubdate?: string
  tags?: string
  width?: number
  height?: number
  community?: { statistics?: { _attributes?: Record<string, number> } }
  copyright?: { _attributes?: { entity?: string; year?: string } }
}

/**
 * O id de uma deviation está no fim da URL (`…/art/Titulo-1352520047`).
 *
 * Guardado como id externo porque é o que sobrevive a uma renomeação do
 * título — e a URL inteira não sobreviveria.
 */
function idDaUrl(url: string): string {
  return url.match(/\/art\/[^/?#]*?-(\d+)/)?.[1] ?? url
}

function paraItem(dados: OEmbed, url: string): CreativeItem {
  const stats = dados.community?.statistics?._attributes ?? {}
  const direitos = dados.copyright?._attributes
  const numero = (v: unknown): number | null => (typeof v === 'number' ? v : null)

  return {
    id: `deviantart:${idDaUrl(url)}`,
    provider: 'deviantart',
    externalId: idDaUrl(url),
    title: dados.title ?? '',
    // O oEmbed não traz descrição; deixar vazio é dizer a verdade.
    description: '',
    author: dados.author_name ?? '',
    authorAvatar: '',
    cover: dados.url ?? dados.thumbnail_url ?? '',
    gallery: [],
    url,
    // Toda deviation é arte; o tipo fino (ilustração, fotografia) exigiria ler
    // a categoria pela API, e chutar seria inventar.
    kind: 'arte-digital',
    tags: (dados.tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    license: direitos?.entity ? `© ${direitos.year ?? ''} ${direitos.entity}`.trim() : '',
    likes: numero(stats.favorites),
    views: numero(stats.views),
    downloads: numero(stats.downloads),
    publishedAt:
      dados.pubdate && !Number.isNaN(Date.parse(dados.pubdate))
        ? new Date(dados.pubdate).toISOString()
        : null,
    meta: {
      ...(dados.width && dados.height ? { dimensoes: `${dados.width}×${dados.height}` } : {}),
      ...(typeof stats.comments === 'number' ? { comentarios: String(stats.comments) } : {}),
    },
  }
}

export const deviantart: Provedor = {
  id: 'deviantart',
  nome: 'DeviantArt',
  descricao: marcar('Arte digital, ilustração e fotografia da comunidade.'),

  // As três funcionam sem o usuário configurar nada: o oEmbed é público, e a
  // home e a busca são as páginas públicas do site. A sessão muda o QUE a home
  // mostra (o feed dele, em vez do feed geral), não se ela funciona.
  capacidades: async () => ['item', 'search', 'trending'],

  estado: async () => {
    const sessao = await temSessao(SESSAO.dominio, SESSAO.cookies)
    return {
      conectado: true,
      erro: sessao
        ? ''
        : t('sem sessão: a home mostra o feed público. Entre na sua conta para ver o seu.'),
    }
  },

  entrar: () =>
    abrirLogin(HOME_DEVIANTART, t('Entrar no {plataforma}', { plataforma: 'DeviantArt' }), SESSAO),
  sessao: SESSAO,

  /**
   * A home. Com sessão, é o feed do usuário; sem ela, o feed público.
   *
   * Ela carrega mais conforme se rola — e o "Carregar mais" da tela é
   * exatamente isso: rolar a página de segundo plano e entregar a fatia
   * seguinte. Não há parâmetro de página aqui; `?page=2` na home devolve três
   * obras, duas repetidas (não é parâmetro, é lixo), e foi testado.
   *
   * **Só a home LOGADA rola.** Medido: com sessão, 42 → 58 → 67 → 71 → 73
   * obras em oito passos; sem sessão, uma página fixa de ~31 que não cresce.
   * Por isso o cursor pode vir vazio já na primeira leva: deslogado o feed
   * acaba ali, e o botão não aparece.
   *
   * O cursor é quantas obras já foram entregues. `colhidas` guarda a leitura
   * em curso porque a página VIRTUALIZA — ela tira do DOM o que passou longe
   * da tela, e reler do zero perderia o começo.
   */
  destaques: async (limite, cursor) => {
    const entregues = Number(cursor) > 0 ? Number(cursor) : 0
    if (entregues === 0) colhidas.clear()

    const { itens: crus, fim } = await navegarEColher<CruDeviantArt>(
      HOME_DEVIANTART,
      LER_OBRAS,
      entregues + limite,
      colhidas,
      'deviantart',
    )
    const fatia = crus.slice(entregues, entregues + limite)
    // Sem obra nova nesta leva, ou o feed disse que acabou: não há continuação.
    const acabou = fim || fatia.length === 0
    return {
      itens: fatia.map(itemDoCru),
      cursor: acabou ? '' : String(entregues + fatia.length),
    }
  },

  /**
   * A busca do site, com o termo que o usuário digitou aqui.
   *
   * A paginação é `&page=N`, e ela é limpa: MEDIDO, quatro páginas deram
   * 24+24+24+24 = 96 obras únicas, com ZERO sobreposição entre páginas
   * consecutivas. `offset` e `cursor` na URL são ignorados pelo site — os três
   * foram testados, e só `page` muda o resultado.
   *
   * O cursor desta fonte é o número da próxima página, como texto. Página que
   * volta vazia encerra: é assim que se sabe que o acervo acabou, já que o
   * site não diz quantas páginas existem.
   */
  buscar: async (query) => {
    const termo = query.text.trim()
    if (!termo) return { itens: [], cursor: '' }
    const pagina = Number(query.cursor) > 1 ? Number(query.cursor) : 1
    const crus = await navegarELer<CruDeviantArt[]>(
      buscaDeviantArt(termo, pagina),
      LER_OBRAS,
      'deviantart',
    )
    const itens = crus.slice(0, query.limit || 40).map(itemDoCru)
    return { itens, cursor: itens.length > 0 ? String(pagina + 1) : '' }
  },

  porUrl: async (url) => {
    const dados = await buscarJson<OEmbed>(`${OEMBED}?url=${encodeURIComponent(url)}`, {})
    return dados.title || dados.url ? paraItem(dados, url) : null
  },
}
