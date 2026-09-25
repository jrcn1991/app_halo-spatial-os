import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { t } from '@shared/i18n'
import type {
  CatalogPage,
  CatalogQuery,
  CatalogStatus,
  Category,
  MediaKind,
  Title,
  TitleDetail,
} from '@shared/media'

/**
 * Biblioteca de mídia a partir de uma lista M3U.
 *
 * A lista fica no disco do usuário e é apontada em Configurações — o app não
 * embute nem baixa lista nenhuma. Tudo aqui é leitura: não existe operação que
 * escreva, e a URL de um stream só sai daqui quando alguém manda tocar.
 *
 * Duas decisões vieram de medir uma lista grande:
 *
 * 1. **Agrupar em títulos.** a grande maioria das linhas eram episódios avulsos;
 *    listar linha a linha daria uma parede inútil. Agrupados, sobra uma fração
 *    em títulos — um catálogo navegável.
 * 2. **Construir sob demanda e reaproveitar.** São ~300 ms de leitura; fazer
 *    isso no arranque atrasaria a abertura do app por uma tela que talvez nem
 *    seja aberta.
 */

type Episodio = { season: number; number: number; title: string; url: string }

type Registro = {
  /**
   * Identificador estável do título.
   *
   * Não pode ser a posição no índice: favoritos e "continuar assistindo" ficam
   * salvos no disco, e a lista muda — o provedor acrescenta e remove títulos o
   * tempo todo. Uma posição salva hoje apontaria para outro filme amanhã. A
   * chave é o que identifica o título de verdade: tipo, categoria e nome.
   */
  key: string
  name: string
  /** Minúsculo e sem acento, com os espaços — para a busca por palavras. */
  needle: string
  /** Sem espaço nem pontuação — para a busca colada ("killbill"). */
  squish: string
  year: number | null
  tags: string[]
  poster: string
  group: string
  kind: MediaKind
  /** Filme: a URL. Série: nula, as URLs estão nos episódios. */
  url: string | null
  episodes: Episodio[]
}

type Indice = {
  path: string
  mtimeMs: number
  registros: Registro[]
  /** Chave estável -> posição, para achar um título salvo sem varrer tudo. */
  porId: Map<string, number>
  categorias: Category[]
  episodios: number
}

let indice: Indice | null = null
let carregando: Promise<Indice> | null = null
/* O índice de uma lista grande fica
   em memória enquanto alguém o usa; meia hora sem uso e ele é solto — refazer
   é um parse em stream, e o main não precisa carregar isso o dia inteiro
   (DESEMPENHO.md, P2-11). */
const INDICE_OCIOSO_MS = 30 * 60_000
let indiceUsadoEm = 0
const faxinaDoIndice = setInterval(() => {
  if (indice && Date.now() - indiceUsadoEm > INDICE_OCIOSO_MS) indice = null
}, 5 * 60_000)
faxinaDoIndice.unref?.()

/** `Série S01E07 Nome do episódio` — o `\s?` cobre listas que separam `S01 E07`. */
const EPISODIO = /^(.*?)\s+S(\d{1,2})\s?E(\d{1,4})\b\s*(.*)$/i
/** `(2024)` no fim do nome. */
const ANO = /\((\d{4})\)\s*$/
/** `[L]`, `[4K]`, `[HDR]`… */
const TAG = /\[([^\]]{1,8})\]/g
/**
 * Os marcadores que a lista de fato usa.
 *
 * A lista precisa ser fechada: `[REC]` é o nome de um filme, não um marcador,
 * e tirar qualquer coisa entre colchetes deixava esse título sem nome nenhum
 * na grade. Marcador desconhecido fica onde está, como parte do nome.
 */
const MARCADORES = new Set(['L', '4K', 'HDR', 'PT-PT', 'CINEMA', 'LEG', 'DUB'])
/** Marcas de acento, para a busca ignorar diferença de acentuação. */
const ACENTOS = /[\u0300-\u036f]/g

const semAcento = (texto: string) => texto.normalize('NFD').replace(ACENTOS, '').toLowerCase()

/**
 * Só letras e números: `Kill Bill: Vol. 1` vira `killbillvol1`.
 *
 * É o que faz "killbill" achar "Kill Bill". Quem digita não repete a
 * pontuação do título, e muita vez nem o espaço — comparar as duas pontas
 * nesta forma resolve espaço, hífen, dois-pontos e ponto de uma vez.
 */
const soAlfanum = (normalizado: string) => normalizado.replace(/[^a-z0-9]/g, '')
const compacto = (texto: string) => soAlfanum(semAcento(texto))

function atributo(linha: string, nome: string): string {
  const chave = `${nome}="`
  const inicio = linha.indexOf(chave)
  if (inicio === -1) return ''
  const desde = inicio + chave.length
  const fim = linha.indexOf('"', desde)
  return fim === -1 ? '' : linha.slice(desde, fim)
}

/** Separa ano e marcadores do nome, devolvendo os três. */
function desmontar(bruto: string): { name: string; year: number | null; tags: string[] } {
  const anoAchado = ANO.exec(bruto)
  const year = anoAchado?.[1] ? Number(anoAchado[1]) : null
  const semAno = anoAchado ? bruto.slice(0, anoAchado.index) : bruto

  const tags: string[] = []
  const name = semAno.replace(TAG, (todo, tag: string) => {
    const marcador = tag.toUpperCase()
    if (!MARCADORES.has(marcador)) return todo
    tags.push(marcador)
    return ' '
  })
  return { name: name.replace(/\s+/g, ' ').trim(), year, tags }
}

async function construir(path: string): Promise<Indice> {
  const { mtimeMs } = await stat(path)
  // A série é identificada pelo nome E pela categoria: a mesma serie pode
  // aparecer em duas categorias da lista, e juntá-las bagunçaria o filtro.
  const porChave = new Map<string, Registro>()
  let episodios = 0
  let extinf: string | null = null

  const linhas = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Number.POSITIVE_INFINITY,
  })

  for await (const linha of linhas) {
    if (linha.startsWith('#EXTINF')) {
      extinf = linha
      continue
    }
    if (!extinf || !linha || linha.startsWith('#')) continue

    const url = linha.trim()
    const bruto = atributo(extinf, 'tvg-name')
    const group = atributo(extinf, 'group-title') || 'Sem categoria'
    const poster = atributo(extinf, 'tvg-logo')
    extinf = null
    if (!bruto || !url) continue

    const parte = EPISODIO.exec(bruto)
    if (parte?.[1] && parte[2] && parte[3]) {
      const { name, year, tags } = desmontar(parte[1])
      const chave = `s ${group} ${semAcento(name)}`
      let registro = porChave.get(chave)
      if (!registro) {
        // Normaliza uma vez e deriva as duas formas. A economia é pequena
        // (~20ms medidos); o que pesa é guardar a segunda forma: o índice foi
        // de ~630ms para ~980ms ao ganhar `squish`. Vale, e é uma vez por
        // sessão — sem ele "killbill" não achava "Kill Bill".
        const base = semAcento(name)
        registro = {
          key: chave,
          name,
          needle: base,
          squish: soAlfanum(base),
          year,
          tags,
          poster,
          group,
          kind: 'series',
          url: null,
          episodes: [],
        }
        porChave.set(chave, registro)
      }
      registro.episodes.push({
        season: Number(parte[2]),
        number: Number(parte[3]),
        title: (parte[4] ?? '').trim(),
        url,
      })
      episodios += 1
      continue
    }

    const { name, year, tags } = desmontar(bruto)
    const chave = `f ${group} ${semAcento(name)} ${year ?? ''}`
    if (porChave.has(chave)) continue
    const base = semAcento(name)
    porChave.set(chave, {
      key: chave,
      name,
      needle: base,
      squish: soAlfanum(base),
      year,
      tags,
      poster,
      group,
      kind: 'movie',
      url,
      episodes: [],
    })
  }

  const registros = [...porChave.values()]
  // Episódios chegam fora de ordem na lista; a tela precisa deles em ordem.
  for (const registro of registros) {
    if (registro.kind === 'series') {
      registro.episodes.sort((a, b) => a.season - b.season || a.number - b.number)
    }
  }
  registros.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const contas = new Map<string, Category>()
  for (const registro of registros) {
    const conta = contas.get(registro.group) ?? { name: registro.group, movies: 0, series: 0 }
    if (registro.kind === 'movie') conta.movies += 1
    else conta.series += 1
    contas.set(registro.group, conta)
  }
  const categorias = [...contas.values()].sort(
    (a, b) => b.movies + b.series - (a.movies + a.series),
  )

  const porId = new Map(registros.map((registro, posicao) => [registro.key, posicao]))
  return { path, mtimeMs, registros, porId, categorias, episodios }
}

/**
 * O índice, construído na primeira necessidade e reaproveitado.
 *
 * Refaz sozinho se o arquivo mudou de data — trocar a lista não exige reabrir
 * o app.
 */
async function obter(path: string): Promise<Indice> {
  if (!path) throw new Error(t('nenhuma lista escolhida'))
  indiceUsadoEm = Date.now()
  if (indice?.path === path) {
    const { mtimeMs } = await stat(path)
    if (mtimeMs === indice.mtimeMs) return indice
  }
  // Sem esta trava, os pedidos que a tela faz de uma vez (status, categorias,
  // primeira página) construiriam o índice três vezes.
  carregando ??= construir(path).then(
    (novo) => {
      indice = novo
      carregando = null
      return novo
    },
    (erro: unknown) => {
      carregando = null
      throw erro
    },
  )
  return carregando
}

function paraTitulo(registro: Registro): Title {
  const temporadas = new Set(registro.episodes.map((e) => e.season))
  return {
    id: registro.key,
    name: registro.name,
    year: registro.year,
    tags: registro.tags,
    poster: registro.poster,
    group: registro.group,
    kind: registro.kind,
    seasons: temporadas.size,
    episodes: registro.episodes.length,
  }
}

export async function catalogStatus(path: string): Promise<CatalogStatus> {
  if (!path) {
    return { ready: false, path: '', movies: 0, series: 0, episodes: 0, error: null }
  }
  try {
    const atual = await obter(path)
    let movies = 0
    for (const registro of atual.registros) if (registro.kind === 'movie') movies += 1
    return {
      ready: true,
      path,
      movies,
      series: atual.registros.length - movies,
      episodes: atual.episodios,
      error: null,
    }
  } catch (error) {
    return {
      ready: false,
      path,
      movies: 0,
      series: 0,
      episodes: 0,
      error: (error as Error).message,
    }
  }
}

export async function categories(path: string): Promise<Category[]> {
  return (await obter(path)).categorias
}

/**
 * Uma página do catálogo.
 *
 * A busca corre sobre o nome sem acento: quem digita "cacador" acha "Caçador".
 * A paginação existe porque o resultado inteiro pode ter milhares de títulos, e
 * mandar todos pelo IPC travaria a tela.
 */
/** O título de uma chave salva. `null` quando ele não existe mais na lista. */
function achar(atual: Indice, id: string): Registro | null {
  const posicao = atual.porId.get(id)
  return posicao === undefined ? null : (atual.registros[posicao] ?? null)
}

/**
 * Quão bem um título responde à busca. Menor é melhor; `null` não serve.
 *
 * Três formas de casar, da mais forte para a mais fraca:
 *
 * 0. o título COMEÇA com o que foi digitado, ignorando espaço e pontuação —
 *    "killbill" e "kill bill" chegam os dois em "Kill Bill";
 * 1. o título CONTÉM aquilo, na mesma forma colada — pega "vol1" em
 *    "Kill Bill: Vol. 1";
 * 2. todas as palavras digitadas aparecem no título, em qualquer ordem —
 *    "bill kill" e "matrix reloaded" continuam achando.
 *
 * A nota também ordena o resultado: sem ela, buscar "matrix" trazia
 * "Animatrix" antes de "Matrix", porque a lista sai em ordem alfabética.
 */
function pontuar(registro: Registro, colado: string, termos: string[]): number | null {
  if (!colado) return 0
  if (registro.squish.startsWith(colado)) return 0
  if (registro.squish.includes(colado)) return 1
  if (termos.length > 1 && termos.every((termo) => registro.needle.includes(termo))) return 2
  return null
}

/**
 * Uma página do catálogo.
 *
 * A busca ignora acento, espaço e pontuação: quem digita "cacador" acha
 * "Caçador", e quem digita "killbill" acha "Kill Bill". A paginação existe
 * porque o resultado inteiro pode ter milhares de títulos, e mandar todos pelo
 * IPC travaria a tela.
 */
export async function catalog(path: string, query: CatalogQuery): Promise<CatalogPage> {
  const atual = await obter(path)
  const colado = compacto(query.query ?? '')
  const termos = semAcento((query.query ?? '').trim())
    .split(/\s+/)
    .filter(Boolean)
  const kind = query.kind && query.kind !== 'all' ? query.kind : null
  const offset = Math.max(0, query.offset ?? 0)
  const limit = Math.min(200, Math.max(1, query.limit ?? 60))

  // Favoritos e listas vêm por `only`, na ordem em que o usuário os pôs — daí
  // percorrer a lista pedida em vez do catálogo inteiro.
  const fonte = query.only
    ? query.only.map((id) => achar(atual, id)).filter((r): r is Registro => r !== null)
    : atual.registros

  const passa = (registro: Registro) =>
    (!kind || registro.kind === kind) && (!query.group || registro.group === query.group)

  // Sem busca a ordem já é a certa (alfabética, ou a do usuário em `only`) e
  // dá para fatiar percorrendo, sem montar a lista inteira.
  if (!colado) {
    const items: Title[] = []
    let total = 0
    for (const registro of fonte) {
      if (!passa(registro)) continue
      if (total >= offset && items.length < limit) items.push(paraTitulo(registro))
      total += 1
    }
    return { total, items }
  }

  // Com busca, a nota manda: junta os que casam, ordena e só então fatia. O
  // `sort` do V8 é estável, então dentro da mesma nota a ordem de origem —
  // alfabética, ou a do usuário — se mantém.
  const achados: { registro: Registro; nota: number }[] = []
  for (const registro of fonte) {
    if (!passa(registro)) continue
    const nota = pontuar(registro, colado, termos)
    if (nota !== null) achados.push({ registro, nota })
  }
  achados.sort((a, b) => a.nota - b.nota)

  return {
    total: achados.length,
    items: achados.slice(offset, offset + limit).map((a) => paraTitulo(a.registro)),
  }
}

export async function titleDetail(path: string, id: string): Promise<TitleDetail | null> {
  const atual = await obter(path)
  const registro = achar(atual, id)
  if (!registro) return null
  return {
    ...paraTitulo(registro),
    // O id é a TEMPORADA e o NÚMERO, não a posição na lista. A regra do
    // projeto é "o que o usuário salva precisa de identidade estável", e este
    // id é salvo: `media.recent` guarda o episódio de onde parar. A lista é
    // reordenada a cada indexação e o provedor acrescenta e remove episódios o
    // tempo todo — uma posição salva hoje apontaria para outro episódio amanhã.
    list: registro.episodes.map((episodio) => ({
      id: `${episodio.season}x${episodio.number}`,
      season: episodio.season,
      number: episodio.number,
      title: episodio.title,
    })),
  }
}

/**
 * A URL de reprodução.
 *
 * Só sai daqui na hora de tocar, e só para o título pedido: o catálogo que a
 * tela recebe não carrega URL nenhuma.
 */
export async function stream(path: string, id: string, episode: string | null): Promise<string> {
  const atual = await obter(path)
  const registro = achar(atual, id)
  if (!registro) throw new Error(t('título não encontrado'))

  // Guardar a URL inteira em cada item parece desperdício — o começo dela se
  // repete em todas as linhas. Foi medido: partir em
  // prefixo + sufixo custa 6 MB A MAIS, porque o objeto por item pesa mais que
  // o texto repetido. Ficou o simples.
  const url = registro.kind === 'movie' ? registro.url : episodioDe(registro, episode)
  if (!url) throw new Error(t('episódio não encontrado'))
  return url
}

/**
 * O episódio de um id, aceitando os DOIS formatos.
 *
 * O formato de hoje é "temporada x número". O numérico é o de ontem — a
 * posição na lista —, e quem tem um `media.recent` gravado antes desta
 * mudança tem um número lá. Aceitar os dois é o que impede o "continuar
 * assistindo" de quebrar de uma vez; e o numérico continua sendo o que sempre
 * foi, com o defeito que sempre teve, até a próxima vez que o usuário abrir
 * aquele episódio e o id novo tomar o lugar.
 */
function episodioDe(registro: Registro, episode: string | null | undefined): string | undefined {
  if (episode == null || /^\d+$/.test(episode)) return registro.episodes[Number(episode ?? 0)]?.url
  return registro.episodes.find((e) => `${e.season}x${e.number}` === episode)?.url
}
