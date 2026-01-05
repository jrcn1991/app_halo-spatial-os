import {
  buscaArtStation,
  type CruArtStation,
  HOME_ARTSTATION,
  itemDaArte,
  LER_ARTES,
} from './artstation-dom'
import { navegarEColher } from './navegador'
import type { Provedor } from './provedor'

/**
 * ArtStation, pelo navegador de segundo plano.
 *
 * MEDIDO em 04/09/2026: responde 200 sem desafio nenhum, deslogado — 48 obras
 * na home e 50 na busca. A conta muda o QUE a home mostra (o feed de quem o
 * usuário segue, em vez do geral), não se ela funciona.
 *
 * Home e busca são grade infinita, sem parâmetro de página: a colheita é a
 * mesma do Pinterest — rolar e acumular a cada passo, porque a grade
 * virtualiza.
 *
 * ## Sem login, por decisão
 *
 * A tela de acesso deles é por Epic Games, Google ou Facebook, e o fluxo do
 * Google devolve um CAPTCHA que **não renderiza direito na janela embutida** —
 * o usuário resolve e ele não completa. Fazer esse caminho funcionar exigiria
 * mexer em como a janela se apresenta ao teste anti-robô, que é exatamente a
 * linha que este app não cruza.
 *
 * Não é perda: a home deslogada entrega bastante — 48 obras na primeira
 * medição, e mais conforme se rola. O que a conta mudaria é QUAL home se vê, e
 * o botão que não funciona seria pior que a ausência dele.
 */

const colhidasHome = new Map<string, CruArtStation>()
const colhidasBusca = new Map<string, CruArtStation>()
let termoColhido = ''

export const artstation: Provedor = {
  id: 'artstation',
  nome: 'ArtStation',
  descricao: 'Arte de concept, 3D e ilustração profissional.',

  capacidades: async () => ['search', 'trending', 'item'],
  estado: async () => ({ conectado: true, erro: '' }),

  destaques: async (limite, cursor) => {
    const entregues = Number(cursor) > 0 ? Number(cursor) : 0
    if (entregues === 0) colhidasHome.clear()
    const { itens: crus, fim } = await navegarEColher<CruArtStation>(
      HOME_ARTSTATION,
      LER_ARTES,
      entregues + limite,
      colhidasHome,
      'artstation',
    )
    const fatia = crus.slice(entregues, entregues + limite)
    return {
      itens: fatia.map(itemDaArte),
      cursor: fim || fatia.length === 0 ? '' : String(entregues + fatia.length),
    }
  },

  buscar: async (query) => {
    const termo = query.text.trim()
    if (!termo) return { itens: [], cursor: '' }
    const entregues = Number(query.cursor) > 0 ? Number(query.cursor) : 0
    if (entregues === 0 || termo !== termoColhido) {
      colhidasBusca.clear()
      termoColhido = termo
    }
    const limite = query.limit || 40
    const { itens: crus, fim } = await navegarEColher<CruArtStation>(
      buscaArtStation(termo),
      LER_ARTES,
      entregues + limite,
      colhidasBusca,
      'artstation',
    )
    const fatia = crus.slice(entregues, entregues + limite)
    return {
      itens: fatia.map(itemDaArte),
      cursor: fim || fatia.length === 0 ? '' : String(entregues + fatia.length),
    }
  },
}
