import { marcar, t } from '@shared/i18n'
import { abrirLogin, navegarEColher, temSessao } from './navegador'
import {
  buscaPinterest,
  type CruPinterest,
  HOME_PINTEREST,
  itemDoPin,
  LER_PINS,
} from './pinterest-dom'
import type { Provedor } from './provedor'

/**
 * Pinterest, pelo navegador de segundo plano.
 *
 * ## Por que não pela API
 *
 * Não é preferência: os termos da API do Pinterest dizem que "you may not
 * store any information accessed through any Pinterest Materials including the
 * API" — guardar é justamente o que uma biblioteca faz. E a busca pública da
 * API está em beta fechado. Pela API, esta tela seria impossível.
 *
 * O que existe aqui é outra coisa: **a página do próprio usuário, no
 * computador dele, com a sessão dele**, renderizada por uma interface
 * diferente. Nada é coletado em massa, nada é republicado, e só entra em disco
 * o que ele mandar salvar — metadado mais o endereço do pin original, que é o
 * mesmo que um favorito de navegador guarda. O botão principal leva sempre à
 * publicação no site.
 *
 * ## Login obrigatório, e isso é do site
 *
 * MEDIDO em 04/09/2026: deslogado, `pinterest.com` e a busca dele devolvem
 * **zero pins** — é muro de login em tudo, home e busca. Por isso este
 * provedor declara `search` e `trending` só depois que há sessão: oferecer
 * busca sem conta seria oferecer um botão que devolve vazio.
 *
 * ## Home e busca rolam
 *
 * As duas são grade infinita, sem parâmetro de página — a colheita é a mesma
 * do feed do DeviantArt: rolar a página de segundo plano e acumular a cada
 * passo, porque a grade VIRTUALIZA e o que passou longe da tela sai do DOM.
 */

/**
 * A marca da conta conectada — pelo VALOR, não pela presença.
 *
 * MEDIDO em 04/09/2026: uma visita anônima ao Pinterest já grava `_auth`, `_b`
 * e `_pinterest_sess`, além de `csrftoken`, `_routing_id` e companhia. Conferir
 * só o nome dizia "conectado" para quem tinha acabado de abrir a página — e o
 * efeito foi visível: a janela de acesso se fechou sozinha 1,2s depois de
 * abrir, antes de dar tempo de digitar.
 *
 * O que separa logado de deslogado é `_auth` valer `1` em vez de `0`.
 */
const SESSAO = { dominio: '.pinterest.com', cookies: [{ nome: '_auth', valor: '1' }] } as const

/** A colheita da home em curso — ver `deviantart.ts` para o porquê. */
const colhidasHome = new Map<string, CruPinterest>()
/** A colheita da busca em curso, e de qual termo ela é. */
const colhidasBusca = new Map<string, CruPinterest>()
let termoColhido = ''

export const pinterest: Provedor = {
  id: 'pinterest',
  nome: 'Pinterest',
  descricao: marcar('Pins e pastas do seu feed.'),

  capacidades: async () =>
    (await temSessao(SESSAO.dominio, SESSAO.cookies)) ? ['search', 'trending', 'item'] : ['item'],

  estado: async () => {
    const sessao = await temSessao(SESSAO.dominio, SESSAO.cookies)
    return {
      conectado: sessao,
      erro: sessao
        ? ''
        : t(
            'o Pinterest não mostra nada sem conta — nem a home, nem a busca. Entre para usar esta fonte.',
          ),
    }
  },

  entrar: () =>
    abrirLogin(HOME_PINTEREST, t('Entrar no {plataforma}', { plataforma: 'Pinterest' }), SESSAO),
  sessao: SESSAO,

  /** O feed do usuário. Rola para carregar mais, como o do DeviantArt. */
  destaques: async (limite, cursor) => {
    const entregues = Number(cursor) > 0 ? Number(cursor) : 0
    if (entregues === 0) colhidasHome.clear()

    const { itens: crus, fim } = await navegarEColher<CruPinterest>(
      HOME_PINTEREST,
      LER_PINS,
      entregues + limite,
      colhidasHome,
      'pinterest',
    )
    const fatia = crus.slice(entregues, entregues + limite)
    const acabou = fim || fatia.length === 0
    return {
      itens: fatia.map(itemDoPin),
      cursor: acabou ? '' : String(entregues + fatia.length),
    }
  },

  /**
   * A busca do site.
   *
   * Sem parâmetro de página: a grade de resultados também é infinita. O cursor
   * é quantos pins já foram entregues, e `termoColhido` existe porque a
   * colheita acumulada é DAQUELE termo — trocar a busca precisa recomeçar, ou
   * a segunda consulta herdaria os resultados da primeira.
   */
  buscar: async (query) => {
    const termo = query.text.trim()
    if (!termo) return { itens: [], cursor: '' }

    const entregues = Number(query.cursor) > 0 ? Number(query.cursor) : 0
    if (entregues === 0 || termo !== termoColhido) {
      colhidasBusca.clear()
      termoColhido = termo
    }

    const limite = query.limit || 40
    const { itens: crus, fim } = await navegarEColher<CruPinterest>(
      buscaPinterest(termo),
      LER_PINS,
      entregues + limite,
      colhidasBusca,
      'pinterest',
    )
    const fatia = crus.slice(entregues, entregues + limite)
    const acabou = fim || fatia.length === 0
    return {
      itens: fatia.map(itemDoPin),
      cursor: acabou ? '' : String(entregues + fatia.length),
    }
  },
}
