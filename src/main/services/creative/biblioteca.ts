import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  CreativeCollection,
  CreativeItem,
  CreativeLibrary,
  CreativeSaved,
} from '@shared/creative'
import { app } from 'electron'

/**
 * A biblioteca pessoal da Social Arte, em disco.
 *
 * FORA do `settings.json`, e isso é decisão, não descuido. Tudo o que mora lá
 * é PREFERÊNCIA — coisas pequenas que descrevem como o app se comporta. Isto
 * aqui é DADO que cresce: cada item guarda título, descrição, tags, capa e
 * metadados, e uma biblioteca de uso real chega a centenas deles. Misturar os
 * dois teria dois preços: o `settings.json` deixaria de ser inspecionável à
 * mão, e um erro de escrita levaria junto o arquivo que precisa SEMPRE abrir —
 * é ele que diz o tamanho da janela e o ambiente ativo.
 *
 * O mecanismo é o mesmo de `main/settings.ts`, e de propósito: escrita
 * atômica (arquivo temporário mais `rename`) e agrupada por 400ms. Arquivo
 * ilegível recomeça vazio com um aviso, em vez de derrubar a tela.
 *
 * O que se guarda: metadados e a URL original. NUNCA o arquivo da obra — nem
 * a imagem, nem o STL. É a regra de direitos autorais que o usuário pediu, e
 * é o que faz um item salvo continuar sendo uma REFERÊNCIA ao original.
 */

const ARQUIVO = () => join(app.getPath('userData'), 'social-arte.json')
const DEBOUNCE_MS = 400

/** Teto de itens. Alto o bastante para não incomodar, baixo o bastante para
 *  o arquivo continuar abrindo rápido — e para um laço de salvamento não
 *  encher o disco em silêncio. */
const MAX_ITENS = 5000

const VAZIA: CreativeLibrary = { collections: [], items: [] }

let atual: CreativeLibrary | null = null
let pendente: NodeJS.Timeout | undefined
let sujo = false

export function lerBiblioteca(): CreativeLibrary {
  if (atual) return atual
  try {
    atual = validar(JSON.parse(readFileSync(ARQUIVO(), 'utf8')))
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(
        `[halo] social-arte.json ilegível, recomeçando vazio: ${(erro as Error).message}`,
      )
    }
    atual = VAZIA
  }
  return atual
}

/**
 * Valida campo a campo — o arquivo é editável à mão e precisa sobreviver a
 * lixo, exatamente como `parseSettings` faz com as configurações.
 */
function validar(bruto: unknown): CreativeLibrary {
  if (!bruto || typeof bruto !== 'object') return VAZIA
  const d = bruto as Record<string, unknown>
  const texto = (v: unknown, max = 400): string => (typeof v === 'string' ? v.slice(0, max) : '')
  const lista = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : []

  const collections = (Array.isArray(d.collections) ? d.collections : [])
    .map((c): CreativeCollection | null => {
      const o = c as Record<string, unknown>
      const id = texto(o.id, 64)
      const name = texto(o.name, 80)
      return id && name
        ? {
            id,
            name,
            description: texto(o.description, 300),
            color: texto(o.color, 64),
            icon: texto(o.icon, 64),
            createdAt: texto(o.createdAt, 40),
          }
        : null
    })
    .filter((c): c is CreativeCollection => c !== null)
    .slice(0, 200)

  const items = (Array.isArray(d.items) ? d.items : [])
    .map((s): CreativeSaved | null => {
      const o = s as Record<string, unknown>
      const item = o.item as Record<string, unknown> | undefined
      if (!item || typeof item.id !== 'string' || typeof item.url !== 'string') return null
      return {
        item: item as unknown as CreativeItem,
        collections: lista(o.collections),
        tags: lista(o.tags),
        note: texto(o.note, 2000),
        savedAt: texto(o.savedAt, 40),
        favorite: o.favorite === true,
      }
    })
    .filter((s): s is CreativeSaved => s !== null)
    .slice(0, MAX_ITENS)

  return { collections, items }
}

function agendar(): void {
  sujo = true
  clearTimeout(pendente)
  pendente = setTimeout(gravar, DEBOUNCE_MS)
}

function gravar(): void {
  if (!sujo || !atual) return
  const arquivo = ARQUIVO()
  try {
    mkdirSync(dirname(arquivo), { recursive: true })
    const temp = `${arquivo}.tmp`
    writeFileSync(temp, `${JSON.stringify(atual, null, 2)}\n`, 'utf8')
    renameSync(temp, arquivo)
  } catch (erro) {
    console.warn(`[halo] não consegui salvar a biblioteca: ${(erro as Error).message}`)
  }
  sujo = false
}

/** Grava agora — o app está fechando e o debounce não vai chegar. */
export function gravarBibliotecaAgora(): void {
  clearTimeout(pendente)
  gravar()
}

/* ——— As operações ————————————————————————————————————————————— */

/**
 * Salva, ou atualiza o que já estava salvo.
 *
 * A chave é `item.id`, que é `<provedor>:<id externo>`: salvar o mesmo
 * endereço duas vezes é o mesmo item, e as coleções e tags dos dois se somam
 * em vez de virarem uma duplicata. É a prevenção de duplicidade pedida.
 */
export function salvarItem(
  item: CreativeItem,
  onde: { collections?: string[]; tags?: string[]; note?: string; favorite?: boolean },
): CreativeLibrary {
  const lib = lerBiblioteca()
  const existente = lib.items.find((s) => s.item.id === item.id)

  if (existente) {
    existente.item = item
    existente.collections = [...new Set([...existente.collections, ...(onde.collections ?? [])])]
    existente.tags = [...new Set([...existente.tags, ...(onde.tags ?? [])])]
    if (onde.note !== undefined) existente.note = onde.note
    if (onde.favorite !== undefined) existente.favorite = onde.favorite
  } else {
    if (lib.items.length >= MAX_ITENS) lib.items.pop()
    lib.items.unshift({
      item,
      collections: onde.collections ?? [],
      tags: onde.tags ?? [],
      note: onde.note ?? '',
      savedAt: new Date().toISOString(),
      favorite: onde.favorite ?? false,
    })
  }
  agendar()
  return lib
}

export function removerItem(id: string): CreativeLibrary {
  const lib = lerBiblioteca()
  const n = lib.items.findIndex((s) => s.item.id === id)
  if (n >= 0) {
    lib.items.splice(n, 1)
    agendar()
  }
  return lib
}

/** Favoritar é marcação rápida: não exige coleção nem tira o item de nenhuma. */
export function favoritarItem(id: string, favorite: boolean): CreativeLibrary {
  const lib = lerBiblioteca()
  const s = lib.items.find((x) => x.item.id === id)
  if (s) {
    s.favorite = favorite
    agendar()
  }
  return lib
}

/** Um item pode estar em várias coleções — daí ser um conjunto, e não um campo. */
export function moverItem(id: string, collections: string[]): CreativeLibrary {
  const lib = lerBiblioteca()
  const s = lib.items.find((x) => x.item.id === id)
  if (s) {
    const existentes = new Set(lib.collections.map((c) => c.id))
    s.collections = [...new Set(collections)].filter((c) => existentes.has(c))
    agendar()
  }
  return lib
}

export function anotarItem(id: string, note: string, tags: string[]): CreativeLibrary {
  const lib = lerBiblioteca()
  const s = lib.items.find((x) => x.item.id === id)
  if (s) {
    s.note = note.slice(0, 2000)
    s.tags = [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 50)
    agendar()
  }
  return lib
}

export function criarColecao(dados: Omit<CreativeCollection, 'id' | 'createdAt'>): CreativeLibrary {
  const lib = lerBiblioteca()
  // Id derivado do nome mais um contador: legível no arquivo, e estável.
  const base =
    dados.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'colecao'
  let id = base
  for (let n = 2; lib.collections.some((c) => c.id === id); n++) id = `${base}-${n}`
  lib.collections.push({ ...dados, id, createdAt: new Date().toISOString() })
  agendar()
  return lib
}

export function editarColecao(id: string, dados: Partial<CreativeCollection>): CreativeLibrary {
  const lib = lerBiblioteca()
  const c = lib.collections.find((x) => x.id === id)
  if (c) {
    if (dados.name !== undefined) c.name = dados.name.slice(0, 80)
    if (dados.description !== undefined) c.description = dados.description.slice(0, 300)
    if (dados.color !== undefined) c.color = dados.color
    if (dados.icon !== undefined) c.icon = dados.icon
    agendar()
  }
  return lib
}

/**
 * Apaga a coleção — e a tira de todos os itens.
 *
 * Os itens FICAM. Apagar uma pasta não apaga o que estava dentro: aqui um item
 * pode estar em várias coleções, e em nenhuma, e "em nenhuma" é um estado
 * válido (ele continua na biblioteca e nos favoritos).
 */
export function apagarColecao(id: string): CreativeLibrary {
  const lib = lerBiblioteca()
  const n = lib.collections.findIndex((c) => c.id === id)
  if (n >= 0) {
    lib.collections.splice(n, 1)
    for (const s of lib.items) s.collections = s.collections.filter((c) => c !== id)
    agendar()
  }
  return lib
}
