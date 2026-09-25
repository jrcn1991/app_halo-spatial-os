import { marcar, t } from '@shared/i18n'
import {
  buscaBehance,
  type CruBehance,
  HOME_BEHANCE,
  itemDoProjeto,
  LER_PROJETOS,
} from './behance-dom'
import { abrirLogin, navegarEColher } from './navegador'
import type { Provedor } from './provedor'

/**
 * Behance, pelo navegador de segundo plano.
 *
 * MEDIDO em 04/09/2026: responde 200 sem desafio, deslogado — 24 projetos na
 * home e 24 na busca, com capas grandes. A conta muda o QUE a home mostra (o
 * feed curado pelo perfil), não se ela funciona.
 *
 * O acesso deles é por Adobe ID. O botão existe porque o caminho é uma página
 * normal, diferente do ArtStation — onde o CAPTCHA do fluxo do Google não
 * renderiza na janela embutida e o botão foi retirado. Se este também brigar,
 * ele sai pelo mesmo motivo: um botão que não leva a lugar nenhum é pior que a
 * ausência dele.
 *
 * O marcador de sessão NÃO está escrito aqui, e é deliberado: ele só entra
 * depois de medir os cookies com a conta conectada. Chutar nomes foi o que fez
 * a janela do Pinterest se fechar sozinha antes de dar tempo de digitar.
 */

const colhidasHome = new Map<string, CruBehance>()
const colhidasBusca = new Map<string, CruBehance>()
let termoColhido = ''

export const behance: Provedor = {
  id: 'behance',
  nome: 'Behance',
  descricao: marcar('Portfólios de design, ilustração e direção de arte.'),

  capacidades: async () => ['search', 'trending', 'item'],
  estado: async () => ({ conectado: true, erro: '' }),

  entrar: () => abrirLogin(HOME_BEHANCE, t('Entrar no {plataforma}', { plataforma: 'Behance' })),

  destaques: async (limite, cursor) => {
    const entregues = Number(cursor) > 0 ? Number(cursor) : 0
    if (entregues === 0) colhidasHome.clear()
    const { itens: crus, fim } = await navegarEColher<CruBehance>(
      HOME_BEHANCE,
      LER_PROJETOS,
      entregues + limite,
      colhidasHome,
      'behance',
    )
    const fatia = crus.slice(entregues, entregues + limite)
    return {
      itens: fatia.map(itemDoProjeto),
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
    const { itens: crus, fim } = await navegarEColher<CruBehance>(
      buscaBehance(termo),
      LER_PROJETOS,
      entregues + limite,
      colhidasBusca,
      'behance',
    )
    const fatia = crus.slice(entregues, entregues + limite)
    return {
      itens: fatia.map(itemDoProjeto),
      cursor: fim || fatia.length === 0 ? '' : String(entregues + fatia.length),
    }
  },
}
