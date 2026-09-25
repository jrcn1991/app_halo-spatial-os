import { CaretDown } from '@phosphor-icons/react/dist/icons/CaretDown'
import { CaretLeft } from '@phosphor-icons/react/dist/icons/CaretLeft'
import { Check } from '@phosphor-icons/react/dist/icons/Check'
import { FilmSlate } from '@phosphor-icons/react/dist/icons/FilmSlate'
import { ListBullets } from '@phosphor-icons/react/dist/icons/ListBullets'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/icons/MagnifyingGlass'
import { MonitorPlay } from '@phosphor-icons/react/dist/icons/MonitorPlay'
import { Play } from '@phosphor-icons/react/dist/icons/Play'
import { Plus } from '@phosphor-icons/react/dist/icons/Plus'
import { Star } from '@phosphor-icons/react/dist/icons/Star'
import { Television } from '@phosphor-icons/react/dist/icons/Television'
import { X } from '@phosphor-icons/react/dist/icons/X'
import { localeDoIdioma, marcar, t } from '@shared/i18n'
import type { ExtraResult, Title } from '@shared/media'
import { useDeferredValue, useState } from 'react'
import {
  useCatalogActions,
  useCatalogPage,
  useCatalogStatus,
  useCategories,
  useTitle,
  useTitleExtra,
} from '@/hooks/useCatalog'
import { useHalo } from '@/store/useHalo'
import { cx } from '@/ui/cx'
import { Panel } from '@/ui/Panel'
import { PanelRow } from '@/ui/PanelRow'
import styles from './media.module.css'

/**
 * As três visões da biblioteca.
 *
 * Não há mais "Tudo": num catálogo grande ele não ajudava a achar
 * nada, e o lugar dele serve melhor aos favoritos.
 */
type Aba = 'movie' | 'series' | 'favorites'

const ABAS: readonly (readonly [Aba, string])[] = [
  ['movie', marcar('Filmes')],
  ['series', marcar('Séries')],
  ['favorites', marcar('Favoritos')],
]

/**
 * Biblioteca de mídia.
 *
 * O catálogo é real: sai da lista M3U apontada em Configurações e indexada pelo
 * processo main (ver `src/main/services/media.ts`). Sem lista escolhida, a tela
 * diz isso em vez de fingir uma biblioteca vazia.
 *
 * Geometria: protótipo linha 1471 (linha), 1474 / 1539 / 1622 (painéis).
 */
export function MediaScreen() {
  const playlist = useHalo((s) => s.playlist)
  const [group, setGroup] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('movie')
  /** Lista de favoritos aberta. `null` = todos os favoritos. */
  const [lista, setLista] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState<string | null>(null)

  const status = useCatalogStatus(playlist)
  const pronto = status.data?.ready ?? false
  const categorias = useCategories(playlist, pronto)

  // A busca corre no main sobre o catálogo inteiro; adiar mantém a digitação fluida.
  const termo = useDeferredValue(busca)
  const favoritos = useHalo((s) => s.mediaFavorites)
  const grupos = useHalo((s) => s.mediaGroups)

  // Em Favoritos, o que manda é a ordem do usuário: `only` preserva a ordem
  // que chega, e é assim que arrastar as capas vira ordem de verdade.
  const escolhidos = lista ? (grupos.find((g) => g.id === lista)?.titles ?? []) : favoritos
  const pagina = useCatalogPage({
    query: termo,
    ...(group ? { group } : {}),
    // Em Favoritos o filtro é a lista do usuário, não o tipo — e a categoria
    // sai do caminho: favoritar é justamente escapar da categorização.
    ...(aba === 'favorites' ? { only: escolhidos } : { kind: aba }),
  })

  return (
    <PanelRow gap={22} perspective={2400} padding="44px 40px 130px">
      <Panel
        variant="side"
        w={270}
        h={650}
        radius={28}
        padding="22px 16px"
        gap={16}
        rest="rotateY(17deg) translateZ(-50px)"
        fromX={150}
      >
        <CategoriasPanel
          status={status.data}
          carregando={status.loading}
          categorias={categorias.data ?? []}
          group={group}
          aba={aba}
          favoritos={favoritos.length}
          lista={lista}
          aoEscolherLista={setLista}
          aoEscolherGrupo={setGroup}
          aoEscolherAba={(proxima) => {
            setAba(proxima)
            if (proxima === 'favorites') setGroup(null)
          }}
        />
      </Panel>

      <Panel variant="center" w={660} h={670} radius={30} overflow="hidden">
        <CatalogoPanel
          pronto={pronto}
          erro={status.data?.error ?? null}
          busca={busca}
          aoBuscar={setBusca}
          pagina={pagina}
          escolhido={escolhido}
          aoEscolher={setEscolhido}
          reordenavel={aba === 'favorites' && !termo}
          lista={lista}
        />
      </Panel>

      <Panel
        variant="side"
        w={280}
        h={650}
        radius={28}
        padding="22px 16px"
        gap={16}
        rest="rotateY(-17deg) translateZ(-50px)"
        fromX={-150}
      >
        <DetalhePanel id={escolhido} aoVoltar={() => setEscolhido(null)} />
      </Panel>
    </PanelRow>
  )
}

/** Esquerda: o estado da biblioteca, o tipo e as categorias da lista. */
function CategoriasPanel({
  status,
  carregando,
  categorias,
  group,
  aba,
  favoritos,
  lista,
  aoEscolherLista,
  aoEscolherGrupo,
  aoEscolherAba,
}: {
  status: { ready: boolean; movies: number; series: number; episodes: number } | null
  carregando: boolean
  categorias: { name: string; movies: number; series: number }[]
  group: string | null
  aba: Aba
  favoritos: number
  lista: string | null
  aoEscolherLista: (lista: string | null) => void
  aoEscolherGrupo: (grupo: string | null) => void
  aoEscolherAba: (aba: Aba) => void
}) {
  const numero = (valor: number) => valor.toLocaleString(localeDoIdioma())

  return (
    <>
      <div className={styles.status}>
        <MonitorPlay size={21} weight="fill" color="var(--accent-mint)" />
        <span className={styles.statusText}>
          {carregando
            ? t('LENDO A LISTA…')
            : status?.ready
              ? `${t(status.movies === 1 ? '{n} FILME' : '{n} FILMES', { n: numero(status.movies) })} · ${t(status.series === 1 ? '{n} SÉRIE' : '{n} SÉRIES', { n: numero(status.series) })}`
              : t('SEM LISTA')}
        </span>
      </div>

      <div className={styles.tipos}>
        {ABAS.map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            className={cx(styles.tipo, aba === valor && styles.tipoOn)}
            aria-pressed={aba === valor}
            onClick={() => aoEscolherAba(valor)}
          >
            {t(rotulo)}
            {valor === 'favorites' && favoritos > 0 ? (
              <span className={styles.tipoCount}>{favoritos}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Em Favoritos a categoria não filtra nada: a lista já é a escolha do
          usuário, e mostrar as cinquenta categorias ali seria ruído. */}
      {aba === 'favorites' ? (
        <ListasPanel total={favoritos} lista={lista} aoEscolher={aoEscolherLista} />
      ) : (
        <>
          <span className={styles.label}>{t('CATEGORIAS')}</span>
          <div className={styles.libraries}>
            <button
              type="button"
              className={cx(styles.library, !group && styles.libraryOn)}
              onClick={() => aoEscolherGrupo(null)}
            >
              <FilmSlate size={17} color="var(--text-secondary)" />
              {t('Todas')}
              <span className={styles.libraryCount}>{categorias.length}</span>
            </button>
            {categorias.map((categoria) => (
              <button
                type="button"
                key={categoria.name}
                className={cx(styles.library, group === categoria.name && styles.libraryOn)}
                onClick={() => aoEscolherGrupo(categoria.name)}
              >
                {categoria.series > categoria.movies ? (
                  <Television size={17} color="var(--text-secondary)" />
                ) : (
                  <FilmSlate size={17} color="var(--text-secondary)" />
                )}
                {categoria.name}
                <span className={styles.libraryCount}>
                  {numero(categoria.movies + categoria.series)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

/** Centro: busca e a grade de capas. */
function CatalogoPanel({
  pronto,
  erro,
  busca,
  aoBuscar,
  pagina,
  escolhido,
  aoEscolher,
  reordenavel,
  lista,
}: {
  pronto: boolean
  erro: string | null
  busca: string
  aoBuscar: (valor: string) => void
  pagina: ReturnType<typeof useCatalogPage>
  escolhido: string | null
  aoEscolher: (id: string) => void
  /** Só em Favoritos e sem busca: fora daí a ordem não é do usuário. */
  reordenavel: boolean
  lista: string | null
}) {
  const { choose } = useCatalogActions()
  const escolherLista = async () => {
    const caminho = await choose()
    if (caminho) useHalo.getState().setPlaylist(caminho)
  }

  if (!pronto) {
    return (
      <div className={styles.vazio}>
        <MonitorPlay size={34} color="var(--text-tertiary)" />
        <p className={styles.vazioTitulo}>
          {erro ? t('Não consegui ler a lista') : t('Nenhuma lista escolhida')}
        </p>
        <p className={styles.vazioTexto}>
          {erro ??
            t(
              'Aponte um arquivo M3U do seu disco para montar a biblioteca. Nada é baixado — a lista é lida de onde ela já está.',
            )}
        </p>
        <button type="button" className={styles.vazioBotao} onClick={() => void escolherLista()}>
          {t('Escolher lista')}
        </button>
      </div>
    )
  }

  return (
    <div className={styles.catalogo}>
      <div className={styles.buscaLinha}>
        <MagnifyingGlass size={16} color="var(--text-tertiary)" />
        <input
          className={styles.busca}
          value={busca}
          placeholder={t('Buscar por título')}
          aria-label={t('Buscar na biblioteca')}
          onChange={(e) => aoBuscar(e.target.value)}
        />
        <span className={styles.total}>
          {t(pagina.total === 1 ? '{n} título' : '{n} títulos', {
            n: pagina.total.toLocaleString(localeDoIdioma()),
          })}
        </span>
      </div>

      <div className={styles.grade}>
        {pagina.items.map((item) => (
          <Capa
            key={item.id}
            titulo={item}
            selecionada={item.id === escolhido}
            aoClicar={() => aoEscolher(item.id)}
            reordenavel={reordenavel}
            lista={lista}
          />
        ))}

        {pagina.items.length === 0 && !pagina.loading ? (
          // "Nada encontrado" está certo para uma busca e errado para os
          // Favoritos vazios: ali não há nada a encontrar, há um gesto a
          // aprender. `reordenavel` já distingue os dois — é ele que liga o
          // arrasto, e só os Favoritos e as listas o têm.
          <p className={styles.semResultado}>
            {reordenavel
              ? t('Nenhum favorito ainda. A estrela no canto de cada capa marca um título.')
              : t('Nada encontrado.')}
          </p>
        ) : null}

        {pagina.more ? (
          <button type="button" className={styles.maisBotao} onClick={pagina.loadMore}>
            <CaretDown size={15} />
            {t('Carregar mais')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Capa({
  titulo,
  selecionada,
  aoClicar,
  reordenavel,
  lista,
}: {
  titulo: Title
  selecionada: boolean
  aoClicar: () => void
  reordenavel: boolean
  lista: string | null
}) {
  const favoritos = useHalo((s) => s.mediaFavorites)
  const alternar = useHalo((s) => s.toggleMediaFavorite)
  const reordenar = useHalo((s) => s.reorderTitles)
  const favorito = favoritos.includes(titulo.id)
  const [alvo, setAlvo] = useState(false)

  /**
   * Arrastar para reordenar.
   *
   * `dataTransfer` carrega o id do que está sendo arrastado; ao soltar, ele vai
   * para a posição de quem recebeu. Só vale em Favoritos e sem busca: nas
   * outras vistas a ordem é do catálogo, não do usuário, e arrastar não teria
   * onde ser guardado.
   */
  const arrastar = {
    // Sempre arrastável, em qualquer aba: é assim que se joga uma capa numa
    // lista do painel da esquerda. Receber o arrasto (reordenar) é que só
    // vale em Favoritos e sem busca — nas outras vistas a ordem é do
    // catálogo, e não teria onde ser guardada.
    draggable: true,
    onDragStart: (e: React.DragEvent) => e.dataTransfer.setData('text/plain', titulo.id),
    ...(reordenavel
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault()
            setAlvo(true)
          },
          onDragLeave: () => setAlvo(false),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault()
            setAlvo(false)
            const de = e.dataTransfer.getData('text/plain')
            if (de) reordenar(lista, de, titulo.id)
          },
        }
      : {}),
  }

  // A estrela é irmã do botão da capa, não filha: botão dentro de botão é HTML
  // inválido, e o clique de um comeria o do outro.
  return (
    <div
      className={cx(styles.capa, selecionada && styles.capaOn, alvo && styles.capaAlvoDrop)}
      {...arrastar}
    >
      <button type="button" className={styles.capaAlvo} onClick={aoClicar}>
        {titulo.poster ? (
          // A capa vem do TMDB, cuja URL já está na lista. `loading="lazy"` importa:
          // a grade tem dezenas de imagens e nem todas ficam à vista.
          <img className={styles.capaArte} src={titulo.poster} alt="" loading="lazy" />
        ) : (
          <span className={styles.capaSemArte}>
            <FilmSlate size={22} color="var(--text-tertiary)" />
          </span>
        )}
        <span className={styles.capaNome}>{titulo.name}</span>
        <span className={styles.capaMeta}>
          {titulo.kind === 'series'
            ? t('{temporadas} temp · {episodios} ep', {
                temporadas: titulo.seasons,
                episodios: titulo.episodes,
              })
            : (titulo.year ?? titulo.group)}
        </span>
      </button>

      <button
        type="button"
        className={cx(styles.estrela, favorito && styles.estrelaOn)}
        aria-pressed={favorito}
        aria-label={
          favorito
            ? t('Desfavoritar {nome}', { nome: titulo.name })
            : t('Favoritar {nome}', { nome: titulo.name })
        }
        onClick={() => alternar(titulo.id)}
      >
        <Star
          size={13}
          weight={favorito ? 'fill' : 'regular'}
          color={favorito ? 'var(--accent-amber)' : 'var(--text-primary)'}
        />
      </button>
    </div>
  )
}

/**
 * Direita: continuar assistindo, ou o título escolhido.
 *
 * Sem nada escolhido o painel serve à pergunta mais comum ao abrir a tela —
 * "onde eu parei?" — e não a um espaço vazio.
 */
function DetalhePanel({ id, aoVoltar }: { id: string | null; aoVoltar: () => void }) {
  const { data: titulo, loading } = useTitle(id)
  const { play } = useCatalogActions()
  const tmdbKey = useHalo((s) => s.tmdbKey)
  const { data: extra, loading: buscandoExtra } = useTitleExtra(id, tmdbKey)
  const [temporada, setTemporada] = useState<number | null>(null)

  if (!id || (!titulo && !loading)) return <RecentesPanel />
  if (!titulo) {
    return (
      <>
        <span className={styles.label}>{t('DETALHES')}</span>
        <p className={styles.vazioTexto}>{t('Carregando…')}</p>
      </>
    )
  }

  const temporadas = [...new Set(titulo.list.map((e) => e.season))].sort((a, b) => a - b)
  const atual = temporada ?? temporadas[0] ?? 1
  const episodios = titulo.list.filter((e) => e.season === atual)

  return (
    <>
      {titulo.poster ? <img className={styles.detalheArte} src={titulo.poster} alt="" /> : null}

      <button type="button" className={styles.voltar} onClick={aoVoltar}>
        <CaretLeft size={12} />
        {t('Continuar assistindo')}
      </button>

      <div className={styles.detalheTopo}>
        <span className={styles.detalheNome}>{titulo.name}</span>
        <span className={styles.detalheMeta}>
          {[titulo.year, titulo.group, ...titulo.tags].filter(Boolean).join(' · ')}
        </span>
      </div>

      <Metadados resultado={extra} carregando={buscandoExtra} />

      <button
        type="button"
        className={styles.tocar}
        onClick={() => void play(titulo.id, episodios[0]?.id)}
      >
        <Play size={16} weight="fill" />
        {titulo.kind === 'series'
          ? t('Tocar T{temporada}E{episodio}', {
              temporada: atual,
              episodio: episodios[0]?.number ?? 1,
            })
          : t('Tocar')}
      </button>

      <ListasDoTitulo id={titulo.id} />

      {titulo.kind === 'series' ? (
        <>
          <div className={styles.temporadas}>
            {temporadas.map((numero) => (
              <button
                key={numero}
                type="button"
                className={cx(styles.temporada, numero === atual && styles.temporadaOn)}
                onClick={() => setTemporada(numero)}
              >
                {t('T{n}', { n: numero })}
              </button>
            ))}
          </div>

          <div className={styles.episodios}>
            {episodios.map((episodio) => (
              <button
                key={episodio.id}
                type="button"
                className={styles.episodio}
                onClick={() => void play(titulo.id, episodio.id)}
              >
                <span className={styles.episodioNumero}>E{episodio.number}</span>
                <span className={styles.episodioNome}>{episodio.title || t('Episódio')}</span>
                <Play size={13} weight="fill" color="var(--text-tertiary)" />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}

/** "Onde eu parei" — escrito pelo main enquanto o player avança. */
function RecentesPanel() {
  const recentes = useHalo((s) => s.recent)
  const { play, forget } = useCatalogActions()

  if (recentes.length === 0) {
    return (
      <>
        <span className={styles.label}>{t('CONTINUAR ASSISTINDO')}</span>
        <p className={styles.vazioTexto}>
          {t('Nada começado ainda. O que você assistir aparece aqui, no minuto em que parou.')}
        </p>
      </>
    )
  }

  return (
    <>
      <span className={styles.label}>{t('CONTINUAR ASSISTINDO')}</span>
      <div className={styles.recentes}>
        {recentes.map((item) => (
          <div className={styles.recente} key={`${item.id}|${item.episode ?? ''}`}>
            <button
              type="button"
              className={styles.recenteAlvo}
              onClick={() => void play(item.id, item.episode, item.seconds)}
            >
              {item.poster ? (
                <img className={styles.recenteArte} src={item.poster} alt="" loading="lazy" />
              ) : (
                <span className={styles.recenteArte} />
              )}
              <span className={styles.recenteTexto}>
                <span className={styles.recenteNome}>{item.name}</span>
                <span className={styles.recenteMeta}>
                  {t('{atual} de {total}', {
                    atual: formatarTempo(item.seconds),
                    total: formatarTempo(item.duration),
                  })}
                </span>
                <span className={styles.recenteBarra}>
                  <span
                    className={styles.recenteBarraFill}
                    style={{
                      width: `${item.duration > 0 ? Math.min(100, (item.seconds / item.duration) * 100) : 0}%`,
                    }}
                  />
                </span>
              </span>
            </button>

            <button
              type="button"
              className={styles.recenteTirar}
              aria-label={t('Tirar {nome} de continuar assistindo', { nome: item.name })}
              onClick={() => forget(item.id, item.episode)}
            >
              <X size={11} color="var(--text-tertiary)" />
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

/** `1:04` ou `1:04:12` — o mesmo formato do player. */
function formatarTempo(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const dois = (valor: number) => String(valor).padStart(2, '0')
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${m}:${dois(s)}`
}

/**
 * O que o TMDB acrescenta — quando há chave, e quando ele acha o título.
 *
 * Os quatro estados aparecem diferentes de propósito. "Sem chave" é o mais
 * importante: dizer onde configurar é melhor que um espaço vazio, e melhor
 * ainda que inventar sinopse.
 */
function Metadados({
  resultado,
  carregando,
}: {
  resultado: ExtraResult | null
  carregando: boolean
}) {
  const setSection = useHalo((s) => s.setSettingsSection)
  const setScreen = useHalo((s) => s.setScreen)

  if (carregando) return <span className={styles.detalheMeta}>{t('Buscando no TMDB…')}</span>
  if (!resultado) return null

  if (resultado.state === 'no-key') {
    return (
      <button
        type="button"
        className={styles.pedirChave}
        onClick={() => {
          setScreen('settings')
          setSection('media')
        }}
      >
        {t('Sinopse, nota e elenco: configure a chave do TMDB')}
      </button>
    )
  }
  if (resultado.state === 'not-found') {
    return <span className={styles.detalheMeta}>{t('O TMDB não achou este título.')}</span>
  }
  if (resultado.state === 'error') {
    return (
      <span className={styles.detalheMeta}>
        {t('TMDB indisponível: {erro}', { erro: resultado.message })}
      </span>
    )
  }

  const { overview, rating, votes, runtimeMin, genres, cast } = resultado.extra
  const ficha = [
    rating !== null ? `★ ${rating.toFixed(1)}${votes ? ` (${votes})` : ''}` : null,
    runtimeMin ? `${runtimeMin} min` : null,
    ...genres.slice(0, 2),
  ].filter(Boolean)

  return (
    <>
      {ficha.length > 0 ? <span className={styles.ficha}>{ficha.join(' · ')}</span> : null}
      {overview ? <p className={styles.sinopse}>{overview}</p> : null}
      {cast.length > 0 ? <span className={styles.detalheMeta}>{cast.join(', ')}</span> : null}
      {/* Atribuição exigida pelos termos da API do TMDB, junto dos dados que
          vieram dela. Não é enfeite: é condição de uso. */}
      <span className={styles.credito}>
        {t(
          'Dados e imagens: TMDB. Este produto usa a API do TMDB, mas não é endossado nem certificado por eles.',
        )}
      </span>
    </>
  )
}

/**
 * As listas dentro dos favoritos.
 *
 * "Todos" sempre existe e não pode ser apagado — é o conjunto inteiro. As
 * outras o usuário cria com o nome que quiser ("Assistidos", "Talvez
 * assistir"), e uma lista é sempre um subconjunto dos favoritos.
 */
function ListasPanel({
  total,
  lista,
  aoEscolher,
}: {
  total: number
  lista: string | null
  aoEscolher: (lista: string | null) => void
}) {
  const grupos = useHalo((s) => s.mediaGroups)
  const createGroup = useHalo((s) => s.createGroup)
  const renameGroup = useHalo((s) => s.renameGroup)
  const deleteGroup = useHalo((s) => s.deleteGroup)
  const alternarNaLista = useHalo((s) => s.toggleInGroup)
  const favoritar = useHalo((s) => s.toggleMediaFavorite)
  const favoritos = useHalo((s) => s.mediaFavorites)
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  // Apagar uma lista era UM clique, sem confirmação e sem volta — e uma lista
  // guarda escolha que o usuário fez com a mão, título a título. O primeiro
  // clique arma, o segundo apaga; tirar o mouse de cima desarma. Nada de
  // modal: ele teria de nascer fora do `PanelRow` por causa do `perspective`
  // (CLAUDE.md § Modal), e é peso demais para um X de 11px.
  const [confirmando, setConfirmando] = useState<string | null>(null)

  /**
   * Soltar uma capa aqui põe o título na lista.
   *
   * É o caminho que se descobre sozinho: arrastar o pôster para cima de
   * "Assistidos" e largar. O outro caminho — as etiquetas no painel de
   * detalhes — continua valendo para quem já está com o título aberto.
   */
  const receber = (destino: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setSobre(destino ?? 'todos')
    },
    onDragLeave: () => setSobre(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setSobre(null)
      const id = e.dataTransfer.getData('text/plain')
      if (!id) return
      if (destino === null) {
        // "Todos" é o conjunto dos favoritos: soltar aqui favorita.
        if (!favoritos.includes(id)) favoritar(id)
      } else {
        alternarNaLista(destino, id)
      }
    },
  })

  const criar = () => {
    if (nome.trim()) createGroup(nome)
    setNome('')
    setCriando(false)
  }

  return (
    <>
      <span className={styles.label}>{t('LISTAS')}</span>
      <div className={styles.libraries}>
        <button
          type="button"
          className={cx(
            styles.library,
            !lista && styles.libraryOn,
            sobre === 'todos' && styles.libraryDrop,
          )}
          onClick={() => aoEscolher(null)}
          {...receber(null)}
        >
          <Star size={16} color="var(--text-secondary)" />
          {t('Todos')}
          <span className={styles.libraryCount}>{total}</span>
        </button>

        {grupos.map((grupo) => (
          <div className={styles.listaLinha} key={grupo.id}>
            {renomeando === grupo.id ? (
              <input
                className={styles.listaCampo}
                defaultValue={grupo.name}
                aria-label={t('Renomear {nome}', { nome: grupo.name })}
                // biome-ignore lint/a11y/noAutofocus: o campo só existe depois do clique em renomear
                autoFocus
                onBlur={(e) => {
                  renameGroup(grupo.id, e.target.value)
                  setRenomeando(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setRenomeando(null)
                }}
              />
            ) : (
              <>
                <button
                  type="button"
                  className={cx(
                    styles.library,
                    lista === grupo.id && styles.libraryOn,
                    sobre === grupo.id && styles.libraryDrop,
                  )}
                  onClick={() => aoEscolher(grupo.id)}
                  onDoubleClick={() => setRenomeando(grupo.id)}
                  {...receber(grupo.id)}
                >
                  <ListBullets size={16} color="var(--text-secondary)" />
                  {grupo.name}
                  <span className={styles.libraryCount}>{grupo.titles.length}</span>
                </button>
                <button
                  type="button"
                  className={
                    confirmando === grupo.id
                      ? `${styles.listaTirar} ${styles.listaTirarArmado}`
                      : styles.listaTirar
                  }
                  aria-label={
                    confirmando === grupo.id
                      ? t('Confirmar: apagar a lista {nome}', { nome: grupo.name })
                      : t('Apagar a lista {nome}', { nome: grupo.name })
                  }
                  title={confirmando === grupo.id ? t('Clique de novo para apagar') : undefined}
                  onMouseLeave={() => setConfirmando(null)}
                  onClick={() => {
                    if (confirmando !== grupo.id) {
                      setConfirmando(grupo.id)
                      return
                    }
                    setConfirmando(null)
                    if (lista === grupo.id) aoEscolher(null)
                    deleteGroup(grupo.id)
                  }}
                >
                  {confirmando === grupo.id ? (
                    <span className={styles.listaConfirmar}>{t('APAGAR?')}</span>
                  ) : (
                    <X size={11} color="var(--text-tertiary)" />
                  )}
                </button>
              </>
            )}
          </div>
        ))}

        {criando ? (
          <input
            className={styles.listaCampo}
            value={nome}
            placeholder={t('Nome da lista')}
            aria-label={t('Nome da nova lista')}
            // biome-ignore lint/a11y/noAutofocus: o campo só existe depois do clique em nova lista
            autoFocus
            onChange={(e) => setNome(e.target.value)}
            onBlur={criar}
            onKeyDown={(e) => {
              if (e.key === 'Enter') criar()
              if (e.key === 'Escape') {
                setNome('')
                setCriando(false)
              }
            }}
          />
        ) : (
          <button type="button" className={styles.novaLista} onClick={() => setCriando(true)}>
            <Plus size={13} />
            {t('Nova lista')}
          </button>
        )}
      </div>

      <span className={styles.note}>
        {t(
          'Arraste uma capa até uma lista para pôr o título nela. Dentro da lista, arrastar reordena. Clique duas vezes no nome para renomear.',
        )}
      </span>
    </>
  )
}

/**
 * Em que listas este título está.
 *
 * É por aqui que um filme entra em "Assistidos" ou "Talvez assistir". Marcar
 * também favorita: uma lista é um subconjunto dos favoritos, e um título numa
 * lista que não aparecesse em Favoritos seria armadilha.
 */
function ListasDoTitulo({ id }: { id: string }) {
  const grupos = useHalo((s) => s.mediaGroups)
  const alternarNaLista = useHalo((s) => s.toggleInGroup)
  const createGroup = useHalo((s) => s.createGroup)
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')

  return (
    <>
      {/* Sem este rótulo as etiquetas viravam botõezinhos sem sentido abaixo
          do "Tocar" — ninguém adivinha que ali se organiza o filme. */}
      <span className={styles.label}>{t('ADICIONAR A UMA LISTA')}</span>
      <div className={styles.listas}>
        {grupos.map((grupo) => {
          const dentro = grupo.titles.includes(id)
          return (
            <button
              key={grupo.id}
              type="button"
              className={cx(styles.etiqueta, dentro && styles.etiquetaOn)}
              aria-pressed={dentro}
              onClick={() => alternarNaLista(grupo.id, id)}
            >
              {dentro ? <Check size={11} weight="bold" /> : <Plus size={11} />}
              {grupo.name}
            </button>
          )
        })}

        {criando ? (
          <input
            className={styles.listaCampo}
            value={nome}
            placeholder={t('Nome da lista')}
            aria-label={t('Nome da nova lista')}
            // biome-ignore lint/a11y/noAutofocus: o campo só existe depois do clique
            autoFocus
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => {
              // Cria e já põe o título dentro: foi o que o clique pediu.
              if (nome.trim()) {
                createGroup(nome)
                const criado = useHalo.getState().mediaGroups.at(-1)
                if (criado) alternarNaLista(criado.id, id)
              }
              setNome('')
              setCriando(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setNome('')
                setCriando(false)
              }
            }}
          />
        ) : (
          <button type="button" className={styles.etiqueta} onClick={() => setCriando(true)}>
            <Plus size={11} />
            {t('Nova lista')}
          </button>
        )}
      </div>
    </>
  )
}
