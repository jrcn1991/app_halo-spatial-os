import type { Icon } from '@phosphor-icons/react'
import { ArrowsClockwise } from '@phosphor-icons/react/dist/icons/ArrowsClockwise'
import { CaretLeft } from '@phosphor-icons/react/dist/icons/CaretLeft'
import { CaretRight } from '@phosphor-icons/react/dist/icons/CaretRight'
import { File as FileIcon } from '@phosphor-icons/react/dist/icons/File'
import { FileArchive } from '@phosphor-icons/react/dist/icons/FileArchive'
import { FileAudio } from '@phosphor-icons/react/dist/icons/FileAudio'
import { FileText } from '@phosphor-icons/react/dist/icons/FileText'
import { FileVideo } from '@phosphor-icons/react/dist/icons/FileVideo'
import { Folder } from '@phosphor-icons/react/dist/icons/Folder'
import { HardDrives } from '@phosphor-icons/react/dist/icons/HardDrives'
import { House } from '@phosphor-icons/react/dist/icons/House'
import { Image as ImageIcon } from '@phosphor-icons/react/dist/icons/Image'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/icons/MagnifyingGlass'
import { Star } from '@phosphor-icons/react/dist/icons/Star'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FileEntry, FileKind } from '@/domain/types'
import { useDirectory, useFavorites, useMounts, useStorage } from '@/hooks/useFiles'
import { useHalo } from '@/store/useHalo'
import { cx } from '@/ui/cx'
import { Panel } from '@/ui/Panel'
import { PanelRow } from '@/ui/PanelRow'
import styles from './files.module.css'

/**
 * Arquivos — navegação real pelos discos, **somente leitura**.
 *
 * Não existe operação de escrita em lugar nenhum do caminho (nem no serviço do
 * main, nem no contrato de IPC): navegar aqui não tem como corromper nada, e as
 * permissões do sistema cuidam do que não pode ser lido.
 *
 * A navegação flui pelos cliques e é a mesma dos dois lados — o widget da
 * esquerda (discos e o caminho onde você está) e a listagem central levam ao
 * mesmo lugar. O topo do painel central é o carrossel de pastas favoritadas:
 * quatro à mostra, o resto rolando.
 *
 * Geometria: protótipo linha 632 (linha), 635 / 752 (painéis). Única tela com
 * dois painéis.
 */
export function FilesScreen() {
  const { data, loading, error, open, path } = useDirectory()
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const favorites = useHalo((s) => s.favorites)
  const toggleFavorite = useHalo((s) => s.toggleFavorite)
  const seedFavorites = useHalo((s) => s.seedFavorites)
  const { data: xdg } = useFavorites()

  // Primeira execução: as pastas do XDG entram como favoritas iniciais.
  useEffect(() => {
    if (xdg?.length) seedFavorites(xdg.map((f) => f.path))
  }, [xdg, seedFavorites])

  const entries = data?.entries ?? []
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? entries.filter((e) => e.name.toLowerCase().includes(term)) : entries
  }, [entries, query])

  // Pastas primeiro: é a ordem que serve a quem está navegando.
  const listed = [...filtered].sort((a, b) =>
    a.kind === b.kind ? 0 : a.kind === 'folder' ? -1 : 1,
  )

  const navigate = (next: string) => {
    if (path) setHistory((h) => [...h, path])
    open(next)
    setQuery('')
  }

  const back = () => {
    const previous = history.at(-1)
    setHistory((h) => h.slice(0, -1))
    if (previous) open(previous)
    else if (data?.parent) open(data.parent)
  }

  return (
    /* Três painéis, e não os dois do handoff: o widget de discos entrou à
       esquerda sem tirar o painel da direita. As medidas encolheram para os três
       caberem na linha (280 + 640 + 300 fecham os 1348px úteis), e os ângulos
       passam a ser os das telas de três painéis. */
    <PanelRow gap={22} perspective={2400} padding="44px 40px 130px">
      <Panel
        variant="side"
        w={280}
        h={650}
        radius={28}
        padding="22px 16px"
        gap={16}
        order={-1}
        rest="rotateY(17deg) translateZ(-50px)"
        fromX={150}
      >
        <DisksPanel onOpen={navigate} current={data?.path ?? null} />
      </Panel>

      <Panel variant="center" w={640} h={670} radius={30} overflow="hidden">
        <div className={styles.header}>
          <div className={styles.nav}>
            <button
              type="button"
              aria-label="Voltar"
              className={styles.navButton}
              onClick={back}
              disabled={!data?.parent && history.length === 0}
            >
              <CaretLeft size={16} />
            </button>
            <button type="button" aria-label="Avançar" className={styles.navButton} disabled>
              <CaretRight size={16} />
            </button>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className={styles.title}>{data ? baseName(data.path) : '…'}</div>
            <div className={styles.breadcrumb}>{data ? breadcrumb(data.path) : ''}</div>
          </div>
          <div className={styles.spacer} />
          <div className={styles.search}>
            <MagnifyingGlass size={16} color="var(--text-widget-label)" />
            <input
              className={styles.searchInput}
              value={query}
              placeholder="Buscar aqui"
              aria-label="Buscar arquivos"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <FavoritesCarousel favorites={favorites} onOpen={navigate} />

        <div className={styles.columns}>
          <div className={styles.colName}>NOME</div>
          <div className={styles.colModified}>MODIFICADO</div>
          <div className={styles.colSize}>TAMANHO</div>
          <div className={styles.colOwner}>DONO</div>
        </div>

        <div className={styles.rows}>
          {listed.map((entry) => (
            // A linha é um contêiner, não um botão: dentro dela há dois alvos
            // distintos (abrir e favoritar), e botão dentro de botão é inválido.
            <div key={entry.path} className={styles.row}>
              <button
                type="button"
                className={styles.rowMain}
                onClick={() => entry.kind === 'folder' && navigate(entry.path)}
                title={entry.kind === 'folder' ? `Abrir ${entry.name}` : entry.path}
              >
                <FileGlyph kind={entry.kind} />
                <span className={styles.rowNameText}>{entry.name}</span>
              </button>

              {entry.kind === 'folder' && (
                <button
                  type="button"
                  className={cx(styles.star, favorites.includes(entry.path) && styles.starOn)}
                  aria-pressed={favorites.includes(entry.path)}
                  aria-label={
                    favorites.includes(entry.path)
                      ? `Desfavoritar ${entry.name}`
                      : `Favoritar ${entry.name}`
                  }
                  onClick={() => toggleFavorite(entry.path)}
                >
                  <Star
                    size={14}
                    weight={favorites.includes(entry.path) ? 'fill' : 'regular'}
                    color={
                      favorites.includes(entry.path) ? 'var(--accent-gold)' : 'var(--text-tertiary)'
                    }
                  />
                </button>
              )}

              <span className={`${styles.cell} ${styles.colModified}`}>
                {formatDate(entry.modifiedAt)}
              </span>
              <span className={`${styles.cell} ${styles.colSize}`}>
                {entry.kind === 'folder'
                  ? entry.childCount === null
                    ? '—'
                    : `${entry.childCount} itens`
                  : formatSize(entry.sizeBytes)}
              </span>
              <span className={`${styles.cell} ${styles.colOwner}`}>{entry.owner}</span>
            </div>
          ))}

          {listed.length === 0 && !loading && (
            // Pasta que não abriu não é pasta vazia. O erro do `readdir`
            // (EACCES, ENOENT) chegava até aqui e virava "PASTA VAZIA" porque
            // a tela só olhava o tamanho da lista — a regra do projeto é que
            // erro engolido faz a tela mentir. O texto fica curto para caber
            // na coluna; a mensagem do sistema vai no tooltip.
            <span
              className={styles.folderMeta}
              style={{ padding: '10px' }}
              title={error ? error.message : undefined}
            >
              {error
                ? 'NÃO CONSEGUI ABRIR ESTA PASTA'
                : query
                  ? 'NADA COM ESSE NOME'
                  : 'PASTA VAZIA'}
            </span>
          )}
        </div>

        <div className={styles.footer}>
          <span>
            {entries.length} {entries.length === 1 ? 'ITEM' : 'ITENS'}
          </span>
          <div className={styles.spacer} />
          <span>SOMENTE LEITURA</span>
        </div>
      </Panel>

      <Panel
        variant="side"
        w={300}
        h={650}
        radius={28}
        padding="22px 16px"
        gap={16}
        rest="rotateY(-17deg) translateZ(-50px)"
        fromX={-150}
      >
        <ShortcutsPanel onOpen={navigate} entries={entries} current={data?.path ?? null} />
      </Panel>
    </PanelRow>
  )
}

/** As quatro cores de pasta do handoff, em ordem. */
const FOLDER_TONES = [
  'var(--accent-violet)',
  'var(--accent-mint)',
  'var(--accent-gold)',
  'var(--accent-red)',
]

const GLYPHS: Record<FileKind, Icon> = {
  folder: Folder,
  video: FileVideo,
  image: ImageIcon,
  audio: FileAudio,
  archive: FileArchive,
  document: FileText,
  file: FileIcon,
}

function FileGlyph({ kind }: { kind: FileKind }) {
  const Glyph = GLYPHS[kind]
  return <Glyph size={17} color="var(--text-secondary)" />
}

/**
 * Carrossel de pastas favoritadas.
 *
 * Quatro à mostra; as demais chegam pelas setas ou rolando. As setas se
 * desabilitam nas pontas — seta que não faz nada é pior que seta nenhuma —, e
 * cada passo avança uma página inteira, não um card.
 */
/** Quantas favoritas cabem à mostra — o passo do carrossel. */
const PAGE = 4

function FavoritesCarousel({
  favorites,
  onOpen,
}: {
  favorites: string[]
  onOpen: (path: string) => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })

  const measure = useCallback(() => {
    const el = track.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdges({ start: el.scrollLeft <= 1, end: el.scrollLeft >= max - 1 })
  }, [])

  /**
   * Mede depois do layout, e a cada mudança da lista.
   *
   * Medir na montagem pega `scrollWidth === clientWidth` — os cards ainda não
   * foram posicionados — e a seta nasceria desabilitada para sempre, já que sem
   * rolagem possível nenhum evento de scroll viria corrigir.
   */
  // `favorites.length` não é lido no corpo: está aqui para remedir quando a
  // lista muda, que é quando a rolagem passa a existir (ou deixa de).
  // biome-ignore lint/correctness/useExhaustiveDependencies: ver acima
  useEffect(() => {
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [measure, favorites.length])

  /**
   * Avança quatro cards, e não "uma largura de janela".
   *
   * Rolar pela largura do scrollport não cai em múltiplo de card: sobra sempre
   * um pedaço cortado na borda. Aqui o alvo é a posição do card quatro adiante
   * do primeiro visível, descontando o recuo do painel — assim a página sempre
   * começa num card inteiro.
   */
  const page = (direction: 1 | -1) => {
    const el = track.current
    if (!el) return

    const cards = [...el.children].filter((c): c is HTMLElement => c instanceof HTMLElement)
    const inset = Number.parseFloat(getComputedStyle(el).paddingLeft) || 0
    // Posição pelo retângulo, e não por `offsetLeft`: este último é relativo ao
    // ancestral posicionado, que aqui não é o trilho — a conta saía deslocada.
    const trackLeft = el.getBoundingClientRect().left
    const offsetOf = (card: HTMLElement) =>
      card.getBoundingClientRect().left - trackLeft + el.scrollLeft

    const first = Math.max(
      0,
      cards.findIndex((c) => offsetOf(c) - el.scrollLeft >= inset - 1),
    )
    // A última página também começa num card inteiro.
    const last = Math.max(0, cards.length - PAGE)
    const target = cards[Math.min(last, Math.max(0, first + direction * PAGE))]

    el.scrollTo({ left: target ? offsetOf(target) : 0, behavior: 'smooth' })
  }

  return (
    <>
      <div className={styles.carouselHead}>
        <span className={styles.sideLabel}>FAVORITAS · {favorites.length}</span>
        {favorites.length > PAGE && (
          <div className={styles.arrows}>
            <button
              type="button"
              aria-label="Favoritas anteriores"
              className={styles.arrow}
              onClick={() => page(-1)}
              disabled={edges.start}
            >
              <CaretLeft size={14} />
            </button>
            <button
              type="button"
              aria-label="Próximas favoritas"
              className={styles.arrow}
              onClick={() => page(1)}
              disabled={edges.end}
            >
              <CaretRight size={14} />
            </button>
          </div>
        )}
      </div>

      <div className={styles.carousel}>
        <div className={styles.folders} ref={track} onScroll={measure}>
          {favorites.map((favorite, i) => (
            <button
              key={favorite}
              type="button"
              className={styles.folder}
              onClick={() => onOpen(favorite)}
              title={favorite}
            >
              <Folder
                size={30}
                weight="fill"
                color={FOLDER_TONES[i % FOLDER_TONES.length] ?? 'var(--accent-mint)'}
                style={{ display: 'block', marginBottom: 8 }}
              />
              <div className={styles.folderName}>{baseName(favorite)}</div>
              <div className={styles.folderMeta}>{shortPath(favorite)}</div>
            </button>
          ))}
          {favorites.length === 0 && (
            <span className={styles.folderMeta}>
              NENHUMA FAVORITA — USE A ESTRELA NAS PASTAS ABAIXO
            </span>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * Painel direito: o que há nesta pasta, os recentes e o disco atual.
 *
 * Não repete as favoritas — elas moram no carrossel do topo, e ter a mesma
 * lista em dois lugares só gasta espaço. Aqui fica o que só faz sentido sobre
 * a pasta em que você está agora.
 */
function ShortcutsPanel({
  onOpen,
  entries,
  current,
}: {
  onOpen: (path: string) => void
  entries: FileEntry[]
  current: string | null
}) {
  const { data: storage } = useStorage(current ?? undefined)

  const folders = entries.filter((e) => e.kind === 'folder')
  const files = entries.filter((e) => e.kind !== 'folder')
  const recent = [...files].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 4)
  const weight = files.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0)
  const percent = storage ? (storage.usedBytes / storage.totalBytes) * 100 : 0

  return (
    <>
      <span className={styles.sideLabel}>AQUI</span>
      <div className={styles.sideList}>
        <div className={styles.sideItem}>
          <Folder size={17} weight="fill" color="var(--accent-violet)" />
          <span className={styles.rowNameText}>
            {folders.length} {folders.length === 1 ? 'pasta' : 'pastas'}
          </span>
        </div>
        <div className={styles.sideItem}>
          <FileGlyph kind="file" />
          <span className={styles.rowNameText}>
            {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}
          </span>
          <span className={styles.sideMeta}>{weight > 0 ? formatSize(weight) : '—'}</span>
        </div>
      </div>

      <span className={styles.sideLabel}>RECENTES AQUI</span>
      <div className={styles.sideList}>
        {recent.map((entry) => (
          <div key={entry.path} className={styles.sideItem} title={entry.path}>
            <FileGlyph kind={entry.kind} />
            <span className={styles.rowNameText}>{entry.name}</span>
            <span className={styles.sideMeta}>{formatSize(entry.sizeBytes)}</span>
          </div>
        ))}
        {recent.length === 0 && <span className={styles.folderMeta}>NENHUM ARQUIVO AQUI</span>}
      </div>

      {current && (
        <button type="button" className={styles.sideItem} onClick={() => onOpen(current)}>
          <ArrowsClockwise size={16} color="var(--text-secondary)" />
          Recarregar
        </button>
      )}

      <div className={styles.storage}>
        <div className={styles.storageValue}>
          {storage
            ? `${formatSize(storage.usedBytes)} de ${formatSize(storage.totalBytes)}`
            : 'Medindo…'}
        </div>
        <div className={styles.sideLabel} style={{ marginTop: 4 }}>
          DISCO ATUAL
        </div>
        <div className={styles.bar}>
          <div className={styles.barFill} style={{ width: `${percent}%` }} />
        </div>
      </div>
    </>
  )
}

/**
 * Widget de discos e caminho.
 *
 * Mostra os discos montados com o uso de cada um e, abaixo, onde você está
 * dentro do disco atual — cada nível é clicável, então dá para subir sem
 * depender do botão voltar. Clicar num disco entra na raiz dele.
 */
function DisksPanel({
  onOpen,
  current,
}: {
  onOpen: (path: string) => void
  current: string | null
}) {
  const { data: mounts } = useMounts()
  const disks = mounts ?? []
  // O disco atual é o ponto de montagem mais longo que contém o caminho.
  const here = disks
    .filter((m) => current === m.path || current?.startsWith(m.path === '/' ? '/' : `${m.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]

  return (
    <>
      <div
        className={styles.status ?? ''}
        style={{ display: 'flex', alignItems: 'center', gap: 9 }}
      >
        <HardDrives size={19} weight="fill" color="var(--accent-mint)" />
        <span className={styles.sideLabel}>
          DISCOS · {disks.length} {disks.length === 1 ? 'MONTADO' : 'MONTADOS'}
        </span>
      </div>

      <div className={styles.sideList}>
        {disks.map((disk) => {
          const percent =
            disk.usedBytes !== null && disk.totalBytes
              ? (disk.usedBytes / disk.totalBytes) * 100
              : null
          return (
            <button
              key={disk.path}
              type="button"
              className={cx(styles.disk, disk.path === here?.path && styles.diskActive)}
              onClick={() => onOpen(disk.path)}
              title={`${disk.device} · ${disk.fsType}`}
            >
              <span className={styles.diskHead}>
                {disk.isSystem ? (
                  <House size={15} weight="fill" color="var(--accent-mint)" />
                ) : (
                  <HardDrives size={15} color="var(--text-secondary)" />
                )}
                <span className={styles.diskName}>{disk.name}</span>
                <span className={styles.diskSize}>
                  {percent === null ? disk.fsType.toUpperCase() : `${Math.round(percent)}%`}
                </span>
              </span>
              {percent !== null && (
                <span className={styles.diskBar} data-halo-medidor="disco">
                  <span className={styles.diskBarFill} style={{ width: `${percent}%` }} />
                </span>
              )}
              <span className={styles.diskSize}>
                {disk.usedBytes !== null && disk.totalBytes
                  ? `${formatSize(disk.usedBytes)} de ${formatSize(disk.totalBytes)}`
                  : disk.path}
              </span>
            </button>
          )
        })}
        {disks.length === 0 && <span className={styles.folderMeta}>NENHUM DISCO LISTADO</span>}
      </div>

      <span className={styles.sideLabel}>ONDE VOCÊ ESTÁ</span>
      <div className={styles.trail}>
        {trail(current, here?.path ?? '/').map((step) => (
          <button
            key={step.path}
            type="button"
            className={cx(styles.crumb, step.path === current && styles.crumbHere)}
            onClick={() => onOpen(step.path)}
          >
            <Folder
              size={14}
              weight={step.path === current ? 'fill' : 'regular'}
              color={step.path === current ? 'var(--accent-mint)' : 'var(--text-tertiary)'}
            />
            <span className={styles.crumbName}>{step.name}</span>
          </button>
        ))}
      </div>
    </>
  )
}

/** Cada nível entre a raiz do disco e a pasta atual, do topo para baixo. */
function trail(current: string | null, mountPath: string): { name: string; path: string }[] {
  if (!current) return []
  const base = mountPath === '/' ? '' : mountPath
  const rest = current.slice(base.length).split('/').filter(Boolean)

  const steps = [{ name: mountPath === '/' ? '/' : baseName(mountPath), path: mountPath || '/' }]
  let walked = base
  for (const part of rest) {
    walked = `${walked}/${part}`
    steps.push({ name: part, path: walked })
  }
  return steps
}

/** Onde a favorita mora: os dois últimos níveis do caminho do pai. */
function shortPath(path: string): string {
  const parents = path.split('/').filter(Boolean).slice(0, -1)
  return (parents.length > 2 ? parents.slice(-2) : parents).join(' / ').toUpperCase() || '/'
}

function baseName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? '/'
}

function breadcrumb(path: string): string {
  return path.split('/').filter(Boolean).join(' / ').toUpperCase()
}

function formatDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
    .replace('.', '')
    .toUpperCase()
}

/**
 * Tamanho em base 1024 — "KB" aqui significa 1024 bytes.
 *
 * É a conta que o gerenciador de arquivos do KDE mostra, e a tela de Arquivos
 * fica ao lado dele o dia inteiro: divergir aqui seria o app contradizer o
 * sistema para o mesmo arquivo.
 *
 * A ilha usa base 1000 (`legivel` em `main/island/discos.ts`), e isso é
 * DELIBERADO e não descuido: lá o número é a capacidade de um disco, que o
 * fabricante estampa em base 1000. Os dois números batem com a fonte de cada
 * um; unificá-los faria um dos dois mentir. Um "931 GB" aqui e um "1,0 TB" lá,
 * para o mesmo pendrive, são as duas contas certas.
 */
function formatSize(bytes: number | null): string {
  if (bytes === null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
