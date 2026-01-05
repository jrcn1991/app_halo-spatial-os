import type { CreativeItem } from '@shared/creative'
import { itemDaPagina } from './metadados'
import type { Provedor } from './provedor'
import { buscarPagina } from './rede'

/**
 * "Qualquer endereço" — a fonte que existe sem nenhuma integração.
 *
 * Ela lê o que a própria página publica sobre si (Open Graph e Twitter Card),
 * que é o mesmo que o WhatsApp e o Slack leem para montar a prévia de um link.
 * São etiquetas declaradas para serem lidas: não há credencial, não há API, e
 * não há raspagem do conteúdo.
 *
 * É o que torna a biblioteca útil no primeiro dia, e é também a rede de
 * segurança das quatro plataformas — quando a API de uma delas não está
 * configurada, o link ainda entra com título, capa e endereço original.
 */
export const link: Provedor = {
  id: 'link',
  nome: 'Qualquer endereço',
  descricao: 'Salva de qualquer site pelo que a própria página publica sobre si.',

  // Nunca busca: não há o que buscar num provedor que é "a web inteira".
  capacidades: async () => ['item'],
  estado: async () => ({ conectado: true, erro: '' }),

  porUrl: async (url): Promise<CreativeItem | null> => {
    const { texto, url: final } = await buscarPagina(url)
    const item = itemDaPagina(texto, final)
    // Sem título a referência é inútil na biblioteca — e é sinal de que a
    // página não publicou metadado nenhum (casca de JS, muro de login).
    return item.title ? item : null
  },
}
