import type {
  CreativeCapability,
  CreativeItem,
  CreativeProviderId,
  CreativeQuery,
} from '@shared/creative'
import type { Marca } from './navegador'

/**
 * O contrato que toda fonte criativa cumpre.
 *
 * É ele que permite acrescentar uma plataforma sem tocar na lógica central: a
 * busca unificada, o feed e a biblioteca falam com esta interface e nunca com
 * uma plataforma. Provedor novo é um arquivo novo em `creative/` e uma linha no
 * registro — nada mais.
 *
 * Três decisões que a forma carrega:
 *
 * - **`capacidades()` é uma pergunta, não uma constante.** O DeviantArt lê um
 *   item sem credencial nenhuma (o oEmbed é público) mas só busca com Client
 *   ID; o Pinterest só faz qualquer coisa depois do consentimento. A tela usa a
 *   resposta para não oferecer um botão que não faria nada.
 * - **`estado()` devolve a FRASE do que falta.** Não um booleano: "desligado"
 *   não diz ao usuário o que fazer, e "falta o Client ID, informe em
 *   Configurações → Social Arte" diz.
 * - **Todo método pode lançar.** Quem chama é a busca unificada, e é lá que a
 *   falha de UMA fonte é isolada para não derrubar as outras.
 */
export type Provedor = {
  id: CreativeProviderId
  /** Nome de tela da plataforma. */
  nome: string
  /** Uma linha dizendo o que ela traz. */
  descricao: string

  /**
   * A busca no SITE da plataforma, com `%s` no lugar do termo.
   *
   * A saída honesta para uma fonte que não pode ser consultada de dentro do
   * app: em vez de raspar o que os termos proíbem, a tela leva a pessoa até
   * lá. Ausente quando a fonte busca de verdade.
   */
  buscaExterna?: string

  /** O que dá para fazer AGORA, com o que está configurado. */
  capacidades(): Promise<CreativeCapability[]>

  /**
   * Está pronta? E, se não, o que falta — em português e acionável.
   * `erro` vazio significa que está tudo bem.
   */
  estado(): Promise<{ conectado: boolean; erro: string }>

  /**
   * Busca por texto. Só é chamada quando `capacidades()` inclui `search`.
   *
   * O `cursor` de entrada vem de `query.cursor` e é o que ESTA fonte devolveu
   * da última vez — nunca o de outra. Devolver cursor vazio significa "acabou",
   * e a fonte para de ser chamada até uma busca nova.
   */
  buscar?(query: CreativeQuery): Promise<{ itens: CreativeItem[]; cursor: string }>

  /**
   * A home da fonte. Só quando `capacidades()` inclui `trending`.
   *
   * Mesma forma da busca, e pelo mesmo motivo: uma home pode ter páginas. A do
   * DeviantArt não tem — devolve cursor vazio, e o "Carregar mais" some.
   */
  destaques?(limite: number, cursor: string): Promise<{ itens: CreativeItem[]; cursor: string }>

  /** Um item pela URL da publicação. Só quando `capacidades()` inclui `item`. */
  porUrl?(url: string): Promise<CreativeItem | null>

  /** As coleções do usuário na plataforma. Só quando inclui `collections`. */
  colecoes?(): Promise<{ id: string; nome: string; itens: number }[]>

  /**
   * Abre a página de acesso DA PLATAFORMA para o usuário entrar na conta dele.
   *
   * Quem pede a senha é o site, numa janela com moldura e com o endereço à
   * vista — ver a seção "O login" em `navegador.ts`. O app não desenha campo
   * nenhum. Ausente na fonte que não tem conta (o leitor de Open Graph) ou que
   * não é consultada daqui.
   */
  entrar?(): void

  /**
   * Como se reconhece a sessão desta fonte.
   *
   * Os nomes são conferidos um a um porque "tem cookie deste domínio" é falso
   * positivo garantido: um site grava cookie de anti-robô e de analytics antes
   * de qualquer login. Ver a medição em `navegador.ts`.
   */
  sessao?: { dominio: string; cookies: readonly Marca[] }
}
