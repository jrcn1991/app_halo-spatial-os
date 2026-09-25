import type {
  CreativeConnection,
  CreativeItem,
  CreativePartial,
  CreativePreview,
  CreativeProviderId,
  CreativeQuery,
  CreativeSearchResult,
} from '@shared/creative'
import { t } from '@shared/i18n'
import { IPC } from '@shared/ipc-contract'
import { BrowserWindow } from 'electron'
import { artstation } from './artstation'
import { behance } from './behance'
import { deviantart } from './deviantart'
import { link } from './link'
import { provedorDaUrl } from './metadados'
import { limparSessao, temSessao } from './navegador'
import { pinterest } from './pinterest'
import type { Provedor } from './provedor'
import { RedeError } from './rede'
import { thingiverse } from './thingiverse'

/**
 * O registro das fontes criativas — e a busca unificada.
 *
 * Acrescentar uma plataforma é escrever um arquivo que cumpra `Provedor` e
 * pôr o nome nesta lista. Nada mais neste arquivo muda, e nada na tela muda:
 * é isso que "arquitetura extensível" significa aqui.
 *
 * A ordem importa só para o desempate na tela; a busca roda todas em paralelo.
 */
const REGISTRO: Provedor[] = [deviantart, artstation, behance, pinterest, thingiverse, link]

/** Quanto tempo um resultado de busca vale. Curto: catálogo criativo muda. */
const CACHE_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; valor: CreativeSearchResult }>()

const porId = (id: CreativeProviderId): Provedor | undefined => REGISTRO.find((p) => p.id === id)

/**
 * Quantas fontes carregam ao MESMO tempo.
 *
 * Cada uma tem a própria janela de segundo plano, e uma janela dessas está
 * renderizando uma página real de 1400×1000 com todo o JavaScript dela. Com
 * duas, paralelizar cortou o tempo de 22s para 7s. Com CINCO, a máquina
 * satura e o efeito se inverte: MEDIDO em 04/09/2026 — o DeviantArt passou a
 * estourar o teto de 30s e o ArtStation entregou 6 obras em vez de 48, não por
 * lentidão do site, mas porque não sobrava processador para desenhar a página.
 *
 * Três é o meio-termo: nunca mais que três janelas desenhando ao mesmo tempo, e
 * nenhuma fonte disputando com cinco vizinhas.
 */
const AO_MESMO_TEMPO = 3

/**
 * Roda as tarefas com no máximo `AO_MESMO_TEMPO` em andamento.
 *
 * Fila ROLANTE, e não levas fechadas: assim que uma fonte termina, a próxima
 * começa. Em levas, a segunda tanda só saía depois da mais lenta da primeira —
 * e com uma fonte lenta no meio isso deixava duas janelas paradas esperando
 * uma terceira. Nada muda para quem chama; muda quando cada resposta chega, e é
 * isso que a tela mostra.
 */
/**
 * Quanto cada fonte demorou da última vez, em ms.
 *
 * É o que decide QUEM VAI PRIMEIRO. Sem isso a ordem era a do registro, e a
 * primeira da lista é o DeviantArt — justamente a mais lenta, porque a home
 * dele carrega rolando. Pôr a mais lenta sozinha na frente levou os primeiros
 * cartões de 8s para 18s: o contrário do que se queria.
 *
 * Aprende sozinha e se corrige: um site que ficou lento hoje cai para trás
 * amanhã. Na primeira execução ninguém tem marca e vale a ordem do registro.
 */
const duracao = new Map<CreativeProviderId, number>()

/** Sem marca, fica no meio: não fura a fila nem é empurrada para o fim. */
const PADRAO_MS = 10000

/**
 * Ordena as tarefas pela fonte mais rápida conhecida.
 *
 * `ids` acompanha `tarefas` uma a uma — é a ordem que o chamador montou.
 */
function porVelocidade<T>(
  ids: CreativeProviderId[],
  tarefas: (() => Promise<T>)[],
): (() => Promise<T>)[] {
  return tarefas
    .map((t, i) => ({ t, ms: duracao.get(ids[i] as CreativeProviderId) ?? PADRAO_MS }))
    .sort((a, b) => a.ms - b.ms)
    .map((x) => x.t)
}

async function emLevas<T>(tarefas: (() => Promise<T>)[]): Promise<void> {
  /*
   * Todas as três primeiras largam JUNTAS — e isso foi MEDIDO contra a
   * alternativa.
   *
   * "A primeira carrega e depois vêm as outras" parece melhor, e não é: com a
   * primeira sozinha os primeiros cartões apareceram aos 18-20s, contra 8s com
   * três em paralelo. Uma página de segundo plano passa a maior parte do tempo
   * ESPERANDO rede e temporizador, não usando processador — três esperas
   * simultâneas custam quase o mesmo que uma, e a primeira a terminar já pinta
   * a tela. Serializar troca paralelismo grátis por espera.
   *
   * O que a ordem por velocidade faz, aí sim, é garantir que as três que largam
   * juntas sejam as três mais rápidas conhecidas.
   */
  let proxima = 0
  const trabalhador = async (): Promise<void> => {
    while (proxima < tarefas.length) {
      const minha = tarefas[proxima]
      proxima += 1
      await minha?.()
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(AO_MESMO_TEMPO, tarefas.length) }, () => trabalhador()),
  )
}

/**
 * O cursor de uma busca unificada é um mapa de cursor POR FONTE.
 *
 * Uma busca em várias plataformas acaba em ritmos diferentes: a página 3 do
 * DeviantArt pode existir enquanto outra fonte já entregou tudo o que tinha.
 * Um cursor só, compartilhado, não teria como dizer isso — e "carregar mais"
 * ou repetiria o que a fonte esgotada já deu, ou pararia todas quando a
 * primeira acabasse.
 *
 * A tela nunca lê isto: para ela o cursor é texto que se guarda e se devolve.
 * Vazio significa "não há mais em fonte nenhuma", e é o que faz o botão sumir.
 */
type Cursores = Partial<Record<CreativeProviderId, string>>

function lerCursores(texto: string): Cursores {
  if (!texto) return {}
  try {
    const v = JSON.parse(texto) as unknown
    return v && typeof v === 'object' ? (v as Cursores) : {}
  } catch {
    // Cursor estragado é o mesmo que não ter: recomeça do princípio, em vez de
    // derrubar a busca por causa de um texto que veio torto.
    return {}
  }
}

/** Vazio quando nenhuma fonte tem continuação — é o sinal de "acabou". */
const escreverCursores = (c: Cursores): string =>
  Object.keys(c).length > 0 ? JSON.stringify(c) : ''

/**
 * Esta fonte ainda tem página? Na PRIMEIRA vez, todas têm.
 *
 * Depois, só as que estão no mapa: quem saiu de lá é porque devolveu cursor
 * vazio, e insistir com ela repetiria a última página dela para sempre.
 */
const aindaTem = (mapa: Cursores, id: CreativeProviderId, primeira: boolean): boolean =>
  primeira || typeof mapa[id] === 'string'

/**
 * A frase de um erro, sem vazar detalhe interno para a tela.
 *
 * As mensagens deste módulo são escritas para serem lidas — "a página demorou
 * demais", "termine o login antes" —, e engoli-las todas atrás de um "não
 * consegui falar com essa fonte" custou uma investigação: a janela do
 * DeviantArt tinha 42 obras no DOM e a tela só dizia que não deu, sem pista de
 * onde. Erro nosso passa; qualquer outro vira a frase genérica, porque aí o
 * texto seria um detalhe de implementação.
 */
function frase(erro: unknown): string {
  if (erro instanceof RedeError) return erro.message
  const msg = erro instanceof Error ? erro.message : ''
  // Frase curta e sem caminho de arquivo: é nossa, e serve para o usuário.
  return msg && msg.length <= 120 && !msg.includes('/')
    ? msg
    : t('não consegui falar com essa fonte')
}

/**
 * O estado de cada fonte, para a área "Fontes conectadas".
 *
 * Uma fonte que falha ao responder o próprio estado não derruba a lista: ela
 * aparece desconectada, com a frase do que aconteceu.
 */
export async function creativeConnections(): Promise<CreativeConnection[]> {
  return Promise.all(
    REGISTRO.map(async (p) => {
      try {
        const [estado, capacidades] = await Promise.all([p.estado(), p.capacidades()])
        return {
          provider: p.id,
          name: t(p.nome),
          description: t(p.descricao),
          connected: estado.conectado,
          capabilities: capacidades,
          lastSyncAt: ultimaBusca.get(p.id) ?? null,
          error: estado.erro,
          searchUrl: p.buscaExterna ?? '',
          signIn: Boolean(p.entrar),
          signedIn: p.sessao ? await temSessao(p.sessao.dominio, p.sessao.cookies) : false,
        }
      } catch (erro) {
        return {
          provider: p.id,
          name: t(p.nome),
          description: t(p.descricao),
          connected: false,
          capabilities: [],
          lastSyncAt: ultimaBusca.get(p.id) ?? null,
          error: frase(erro),
          searchUrl: p.buscaExterna ?? '',
          signIn: Boolean(p.entrar),
          signedIn: false,
        }
      }
    }),
  )
}

/**
 * Manda para a tela o que UMA fonte acabou de responder.
 *
 * A promessa da busca continua devolvendo o conjunto completo — ela é a
 * autoridade. Isto é o que permite a grade ir enchendo: com cinco páginas
 * reais, a mais lenta chega 30s depois da primeira, e esperar por ela para
 * mostrar qualquer coisa faz a tela parecer travada.
 *
 * Sem `pedido` não há a quem entregar: quem chamou não pediu acompanhamento.
 */
function avisarParcial(parcial: CreativePartial | null): void {
  if (!parcial) return
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.creativePartial, parcial)
  }
}

/** Quando cada fonte respondeu bem pela última vez. Morre com o app. */
const ultimaBusca = new Map<CreativeProviderId, string>()

/**
 * Busca em todas as fontes pedidas, em paralelo.
 *
 * A regra que o desenho carrega: **uma fonte fora do ar não derruba a
 * página**. Cada uma é isolada, os resultados das que responderam aparecem, e
 * as que falharam saem em `falhas` para a tela dizer discretamente qual foi.
 * É a mesma forma que os feeds RSS já usam.
 */
export async function creativeSearch(
  query: CreativeQuery,
  pedido?: number,
): Promise<CreativeSearchResult> {
  const chave = JSON.stringify(query)
  const guardado = cache.get(chave)
  if (guardado && Date.now() - guardado.at < CACHE_MS) return guardado.valor

  const pedidos = query.providers.length > 0 ? query.providers : REGISTRO.map((p) => p.id)
  const falhas: CreativeSearchResult['falhas'] = []
  const itens: CreativeItem[] = []
  const entrando = lerCursores(query.cursor)
  const primeira = query.cursor === ''
  const saindo: Cursores = {}
  let restam = pedidos.length

  await emLevas(
    porVelocidade(
      pedidos,
      pedidos.map((id) => async () => {
        const p = porId(id)
        /*
         * Toda saída desconta UMA do contador de pendentes.
         *
         * Sem isto, quem não busca — o leitor de endereço, que existe só para
         * links colados — saía sem se descontar, `faltam` nunca chegava a zero e
         * a tela ficaria esperando para sempre por uma fonte que nunca ia
         * responder. Pego pelo guarda do carregamento progressivo.
         */
        if (!p?.buscar) {
          restam -= 1
          return
        }
        // Só as que declaram saber buscar AGORA: o resto seria pedir a uma fonte
        // desconfigurada e transformar "falta configurar" em "erro".
        if (!(await p.capacidades()).includes('search')) {
          restam -= 1
          return
        }
        // E só as que ainda têm página. Uma fonte esgotada continua na lista da
        // busca seguinte — o que ela não faz é receber outro "carregar mais".
        if (!aindaTem(entrando, id, primeira)) {
          restam -= 1
          return
        }
        const comecou = Date.now()
        try {
          const { itens: achados, cursor } = await p.buscar({
            ...query,
            // Cada fonte recebe o cursor DELA, nunca o de outra.
            cursor: entrando[id] ?? '',
          })
          itens.push(...achados)
          if (cursor) saindo[id] = cursor
          ultimaBusca.set(id, new Date().toISOString())
          duracao.set(id, Date.now() - comecou)
          restam -= 1
          if (pedido !== undefined) {
            avisarParcial({
              pedido,
              provider: id,
              items: achados,
              cursor,
              error: '',
              faltam: restam,
            })
          }
        } catch (erro) {
          falhas.push({ provider: id, error: frase(erro) })
          // Falha também é medida: a fonte que estourou o teto é a mais lenta que
          // existe, e não deve liderar a próxima consulta.
          duracao.set(id, Date.now() - comecou)
          restam -= 1
          if (pedido !== undefined) {
            avisarParcial({
              pedido,
              provider: id,
              items: [],
              cursor: '',
              error: frase(erro),
              faltam: restam,
            })
          }
        }
      }),
    ),
  )

  /*
   * A ordenação vale para ESTA página, e não para o acumulado.
   *
   * `relevancia` — o padrão, e o que as plataformas devolvem — é justamente a
   * ordem em que elas responderam, então acrescentar a página seguinte no fim
   * é exatamente certo. Reordenar o acumulado a cada "carregar mais" faria a
   * grade se remontar sob o dedo de quem estava rolando, que é o contrário do
   * que se quer.
   */
  const valor: CreativeSearchResult = {
    items: ordenar(itens, query),
    cursor: escreverCursores(saindo),
    falhas,
  }
  cache.set(chave, { at: Date.now(), valor })
  return valor
}

/**
 * A ordenação da busca unificada.
 *
 * Ela acontece AQUI porque cada plataforma ordena do seu jeito, e misturar
 * duas listas já ordenadas não dá uma lista ordenada. `relevancia` mantém a
 * ordem em que as fontes responderam — é o que cada uma considera relevante, e
 * inventar um placar entre plataformas seria fingir uma comparação que não
 * existe.
 */
function ordenar(itens: CreativeItem[], query: CreativeQuery): CreativeItem[] {
  const filtrados = itens.filter((i) => query.kinds.length === 0 || query.kinds.includes(i.kind))
  if (query.sort === 'relevancia') return intercalar(filtrados)
  if (query.sort === 'recentes') {
    return [...filtrados].sort(
      (a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''),
    )
  }
  if (query.sort === 'populares') {
    // Sem métrica, o item vai para o fim — e não para o começo com zero.
    return [...filtrados].sort((a, b) => (b.likes ?? -1) - (a.likes ?? -1))
  }
  return filtrados
}

/**
 * Um de cada fonte, na volta.
 *
 * Sem isto a grade vinha em BLOCOS — 24 do DeviantArt e só então o primeiro
 * Pinterest —, porque cada fonte empilha os seus de uma vez. Quem abre a tela
 * via uma plataforma só e precisava rolar 24 cartões para descobrir que a
 * outra estava lá.
 *
 * A ordem DENTRO de cada fonte é preservada: é o que ela considera relevante, e
 * não cabe a nós reordenar. O que muda é o revezamento entre elas.
 */
function intercalar(itens: CreativeItem[]): CreativeItem[] {
  const filas = new Map<CreativeProviderId, CreativeItem[]>()
  for (const i of itens) {
    const fila = filas.get(i.provider) ?? []
    fila.push(i)
    filas.set(i.provider, fila)
  }
  if (filas.size < 2) return itens

  const saida: CreativeItem[] = []
  const restantes = [...filas.values()]
  while (saida.length < itens.length) {
    for (const fila of restantes) {
      const proximo = fila.shift()
      if (proximo) saida.push(proximo)
    }
  }
  return saida
}

/**
 * O que a fonte mostra sem ninguém procurar nada — a home dela.
 *
 * É o "abrir o app e ver": no DeviantArt, o feed de quem o usuário segue
 * quando há sessão, e o feed público quando não há. Só as fontes que declaram
 * `trending` respondem; as outras ficam de fora em silêncio, porque não ter
 * uma home não é erro.
 *
 * Cache mais curto que o da busca: uma home que não muda ao reabrir a tela
 * parece congelada, e é a primeira coisa que o usuário vê.
 */
const CACHE_HOME_MS = 90 * 1000
const cacheHome = new Map<string, { at: number; valor: CreativeSearchResult }>()

export async function creativeTrending(
  limite = 40,
  cursor = '',
  pedido?: number,
): Promise<CreativeSearchResult> {
  const chave = cursor || 'home'
  const guardado = cacheHome.get(chave)
  if (guardado && Date.now() - guardado.at < CACHE_HOME_MS) return guardado.valor

  const falhas: CreativeSearchResult['falhas'] = []
  const itens: CreativeItem[] = []
  const entrando = lerCursores(cursor)
  const primeira = cursor === ''
  const saindo: Cursores = {}
  let restam = REGISTRO.length

  await emLevas(
    porVelocidade(
      REGISTRO.map((p) => p.id),
      REGISTRO.map((p) => async () => {
        // Mesma regra da busca: toda saída desconta uma do contador.
        if (!p.destaques) {
          restam -= 1
          return
        }
        if (!(await p.capacidades()).includes('trending')) {
          restam -= 1
          return
        }
        if (!aindaTem(entrando, p.id, primeira)) {
          restam -= 1
          return
        }
        const comecou = Date.now()
        try {
          const r = await p.destaques(limite, entrando[p.id] ?? '')
          itens.push(...r.itens)
          if (r.cursor) saindo[p.id] = r.cursor
          ultimaBusca.set(p.id, new Date().toISOString())
          duracao.set(p.id, Date.now() - comecou)
          restam -= 1
          if (pedido !== undefined) {
            avisarParcial({
              pedido,
              provider: p.id,
              items: r.itens,
              cursor: r.cursor,
              error: '',
              faltam: restam,
            })
          }
        } catch (erro) {
          falhas.push({ provider: p.id, error: frase(erro) })
          duracao.set(p.id, Date.now() - comecou)
          restam -= 1
          if (pedido !== undefined) {
            avisarParcial({
              pedido,
              provider: p.id,
              items: [],
              cursor: '',
              error: frase(erro),
              faltam: restam,
            })
          }
        }
      }),
    ),
  )
  // Intercalada como a busca: sem isto a home vinha em blocos, e a segunda
  // fonte só aparecia depois de 24 cartões da primeira.
  const valor: CreativeSearchResult = {
    items: intercalar(itens),
    cursor: escreverCursores(saindo),
    falhas,
  }
  cacheHome.set(chave, { at: Date.now(), valor })
  return valor
}

/** Abre a página de acesso da plataforma. Quem pede a senha é o site. */
export function creativeSignIn(id: CreativeProviderId): void {
  porId(id)?.entrar?.()
}

/** Esquece a sessão desta fonte: some com os cookies do compartimento. */
export async function creativeSignOut(id: CreativeProviderId): Promise<void> {
  const sessao = porId(id)?.sessao
  if (sessao) await limparSessao(sessao.dominio)
  cacheHome.clear()
  cache.clear()
}

/**
 * A prévia de uma URL colada, antes de salvar.
 *
 * Tenta a plataforma que reconhece o endereço; se ela não estiver configurada
 * ou falhar, cai no leitor de Open Graph. Essa reserva é o que faz "salvar por
 * link" funcionar para os quatro provedores mesmo sem credencial — com menos
 * campos, mas com o link certo, que é o que a regra de direitos autorais pede.
 */
export async function creativePreview(url: string): Promise<CreativePreview> {
  const dono = porId(provedorDaUrl(url))

  if (dono?.porUrl) {
    try {
      const item = await dono.porUrl(url)
      if (item) return { ok: true, error: '', item }
    } catch {
      // Cai na reserva: o motivo aparece só se ela também falhar.
    }
  }

  try {
    const item = await link.porUrl?.(url)
    if (item) return { ok: true, error: '', item }
    return {
      ok: false,
      error: t('essa página não publica título nem imagem — dá para salvar preenchendo à mão'),
      item: null,
    }
  } catch (erro) {
    return { ok: false, error: frase(erro), item: null }
  }
}
