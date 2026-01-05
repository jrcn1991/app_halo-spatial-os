import type { IslandLyricLine } from '@shared/island'

/**
 * Letras sincronizadas, pelo LRCLIB.
 *
 * O que o Notchy e o boring.notch fazem: `lrclib.net` é um banco aberto de
 * letras em LRC (linha a linha, com o instante), sem chave e sem cadastro —
 * pede só um `User-Agent` que identifique o app. A busca é pelo que o MPRIS
 * já entrega: título, artista e duração.
 *
 * Só o main fala com a rede (regra do projeto), e o resultado é cacheado por
 * faixa: a mesma música não é perguntada duas vezes, nem quando a resposta
 * foi "não tem" — perguntar de novo a cada pulso seria abuso do serviço.
 */

const BASE = 'https://lrclib.net/api'
const USER_AGENT = 'Halo Spatial OS/0.1 (ilha dinamica; letras sincronizadas)'
const TIMEOUT_MS = 6000
const CACHE_MAX = 60

type Resposta = { syncedLyrics?: string | null; plainLyrics?: string | null }

const cache = new Map<string, IslandLyricLine[] | null>()

const chave = (titulo: string, artista: string, duracao: number | null) =>
  `${titulo.toLowerCase()}|${artista.toLowerCase()}|${duracao ? Math.round(duracao) : ''}`

/** `[mm:ss.xx] texto` → `{ at, text }`. Linhas sem tempo são ignoradas. */
export function interpretarLrc(lrc: string): IslandLyricLine[] {
  const linhas: IslandLyricLine[] = []
  for (const bruta of lrc.split(/\r?\n/)) {
    const m = /^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/.exec(bruta)
    if (!m) continue
    const at = Number(m[1]) * 60 + Number(m[2])
    linhas.push({ at, text: (m[3] ?? '').trim() })
  }
  return linhas.sort((a, b) => a.at - b.at)
}

async function pedir(caminho: string): Promise<unknown> {
  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS)
  try {
    const resposta = await fetch(`${BASE}${caminho}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controle.signal,
    })
    if (resposta.status === 404) return null
    if (!resposta.ok) throw new Error(`LRCLIB respondeu ${resposta.status}`)
    return await resposta.json()
  } finally {
    clearTimeout(relogio)
  }
}

/**
 * As linhas da faixa, ou `null` quando o LRCLIB não a tem. Primeiro a busca
 * exata (título, artista e duração); sem ela, a busca livre, ficando com o
 * primeiro resultado que tenha letra sincronizada.
 */
export async function letras(
  titulo: string,
  artista: string,
  duracao: number | null,
): Promise<IslandLyricLine[] | null> {
  if (!titulo) return null
  const k = chave(titulo, artista, duracao)
  const guardada = cache.get(k)
  if (guardada !== undefined) return guardada

  let linhas: IslandLyricLine[] | null = null
  try {
    const exata = new URLSearchParams({ track_name: titulo, artist_name: artista })
    if (duracao) exata.set('duration', String(Math.round(duracao)))
    const direto = (await pedir(`/get?${exata}`)) as Resposta | null
    if (direto?.syncedLyrics) linhas = interpretarLrc(direto.syncedLyrics)
    else {
      const livre = new URLSearchParams({ track_name: titulo })
      if (artista) livre.set('artist_name', artista)
      const lista = ((await pedir(`/search?${livre}`)) as Resposta[] | null) ?? []
      const com = lista.find((r) => r.syncedLyrics)
      if (com?.syncedLyrics) linhas = interpretarLrc(com.syncedLyrics)
    }
  } catch {
    // Sem rede, ou o serviço fora: não se guarda a falha, tenta-se no próximo pulso.
    return null
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(k, linhas && linhas.length > 0 ? linhas : null)
  return cache.get(k) ?? null
}
