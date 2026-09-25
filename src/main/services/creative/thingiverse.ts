import { marcar } from '@shared/i18n'
import { navegarELer } from './navegador'
import type { Provedor } from './provedor'
import {
  buscaThingiverse,
  type CruThingiverse,
  homeThingiverse,
  itemDaCoisa,
  LER_COISAS,
} from './thingiverse-dom'

/**
 * Thingiverse, pelo navegador de segundo plano.
 *
 * ## O que os termos pedem, e como a tela cumpre
 *
 * As cláusulas que barravam a integração são sobre a **API**: registrar um
 * aplicativo e esperar revisão antes de qualquer leitura, e não armazenar o
 * conteúdo. Não usamos a API — o que existe aqui é a página pública, aberta
 * como qualquer navegador a abriria.
 *
 * Duas outras cláusulas continuam valendo e a tela as cumpre desde antes:
 *
 * - **atribuição em resultado agregado**: cada cartão traz a marca da
 *   plataforma no canto da capa, e o "Abrir original" leva à publicação deles;
 * - **não armazenar o conteúdo**: a biblioteca guarda metadado e o endereço,
 *   nunca o arquivo — e o STL continua sendo baixado no site, por quem quiser.
 *
 * ## Sem conta, e sem rolagem
 *
 * MEDIDO em 04/09/2026: o Thingiverse mostra tudo deslogado — não há muro de
 * login como no Pinterest —, e **a home e a busca paginam por `?page=N`**, 20
 * por página, com ZERO sobreposição entre páginas consecutivas. É a fonte mais
 * simples das três: não precisa de sessão, não precisa rolar, e a paginação é
 * um número.
 *
 * A rolagem, aliás, não levaria a lugar nenhum: a home fica em 20 modelos por
 * mais que se role (medido, cinco passos, altura travada em 4508px).
 */

export const thingiverse: Provedor = {
  id: 'thingiverse',
  nome: 'Thingiverse',
  descricao: marcar('Modelos 3D da comunidade, para imprimir.'),

  // Sem conta e sem configuração: a página é pública.
  capacidades: async () => ['search', 'trending', 'item'],
  estado: async () => ({ conectado: true, erro: '' }),

  /** A home, paginada. Cada leva é uma página do site. */
  destaques: async (limite, cursor) => {
    const pagina = Number(cursor) > 1 ? Number(cursor) : 1
    const crus = await navegarELer<CruThingiverse[]>(
      homeThingiverse(pagina),
      LER_COISAS,
      'thingiverse',
    )
    const itens = crus.slice(0, limite).map(itemDaCoisa)
    return { itens, cursor: itens.length > 0 ? String(pagina + 1) : '' }
  },

  /**
   * A busca do site.
   *
   * Página que volta vazia encerra: é assim que se sabe que o acervo acabou, já
   * que o site não diz quantas páginas existem.
   */
  buscar: async (query) => {
    const termo = query.text.trim()
    if (!termo) return { itens: [], cursor: '' }
    const pagina = Number(query.cursor) > 1 ? Number(query.cursor) : 1
    const crus = await navegarELer<CruThingiverse[]>(
      buscaThingiverse(termo, pagina),
      LER_COISAS,
      'thingiverse',
    )
    const itens = crus.slice(0, query.limit || 40).map(itemDaCoisa)
    return { itens, cursor: itens.length > 0 ? String(pagina + 1) : '' }
  },
}
