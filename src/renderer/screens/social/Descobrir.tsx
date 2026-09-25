import { ArrowClockwise } from '@phosphor-icons/react/dist/icons/ArrowClockwise'
import { ArrowSquareOut } from '@phosphor-icons/react/dist/icons/ArrowSquareOut'
import { BookmarkSimple } from '@phosphor-icons/react/dist/icons/BookmarkSimple'
import { Heart } from '@phosphor-icons/react/dist/icons/Heart'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/icons/MagnifyingGlass'
import type {
  CreativeConnection,
  CreativeItem,
  CreativeKind,
  CreativeProviderId,
  CreativeSaved,
  CreativeSort,
} from '@shared/creative'
import { CREATIVE_KIND_LABEL } from '@shared/creative'
import { t } from '@shared/i18n'
import { useCreativeSearch, useCreativeTrending } from '@/hooks/useCreative'
import { cx } from '@/ui/cx'
import { Capa } from './Capa'
import styles from './social.module.css'

/**
 * O painel do meio: procurar e descobrir.
 *
 * Sem busca, ele mostra a HOME das fontes — no DeviantArt, a página inicial
 * carregada por um navegador de verdade em segundo plano: com a conta
 * conectada, o feed de quem o usuário segue; sem ela, o feed público. Embaixo
 * vem o que ele já guardou.
 *
 * Nada aqui é conteúdo de exemplo: ou veio da plataforma agora, ou veio da
 * biblioteca dele. Quando não há nem um nem outro, o vazio diz o que fazer.
 *
 * Cada cartão diz a PLATAFORMA de origem. É exigência dos termos do DeviantArt
 * (atribuição) e do Thingiverse (§4.ii: resultado agregado precisa deixar
 * atribuir a fonte) — e é a única coisa que separa uma referência da outra
 * numa grade que mistura origens.
 */
export function Descobrir({
  texto,
  aoDigitar,
  fontes,
  fontesEscolhidas,
  aoEscolherFontes,
  tipos,
  ordem,
  salvos,
  destino,
  aoAbrir,
  aoFavoritar,
  aoSalvar,
}: {
  texto: string
  aoDigitar: (texto: string) => void
  fontes: CreativeConnection[] | null
  /** Vazio = todas. É o mesmo acordo de `CreativeQuery.providers`. */
  fontesEscolhidas: CreativeProviderId[]
  aoEscolherFontes: (fontes: CreativeProviderId[]) => void
  tipos: CreativeKind[]
  ordem: CreativeSort
  salvos: CreativeSaved[]
  /** O grupo aberto na Biblioteca: é para lá que "salvar" manda. */
  destino: string
  aoAbrir: (item: CreativeItem) => void
  aoFavoritar: (item: CreativeItem) => void
  aoSalvar: (item: CreativeItem) => void
}) {
  const {
    data,
    buscando,
    carregandoMais: buscandoMais,
    temMais: buscaTemMais,
    carregarMais: buscarMais,
  } = useCreativeSearch({
    text: texto,
    providers: fontesEscolhidas,
    kinds: tipos,
    license: '',
    orientation: 'qualquer',
    sort: ordem,
    cursor: '',
    limit: 40,
  })

  const {
    data: home,
    carregando: carregandoHome,
    carregandoMais: homeCarregandoMais,
    temMais: homeTemMais,
    recarregar,
    carregarMais: maisDaHome,
  } = useCreativeTrending(40)

  const procurando = texto.trim().length > 0 || tipos.length > 0
  const recentes = salvos.slice(0, 12).map((s) => s.item)
  const daHome = (home?.items ?? []).filter((i) => tipos.length === 0 || tipos.includes(i.kind))

  return (
    <div className={styles.colunaFeed}>
      <div className={styles.busca}>
        <MagnifyingGlass size={16} color="var(--text-tertiary)" />
        <input
          className={styles.buscaCampo}
          type="search"
          value={texto}
          placeholder={t('Procurar referências…')}
          aria-label={t('Procurar referências nas fontes conectadas')}
          onChange={(e) => aoDigitar(e.target.value)}
        />
      </div>

      <Ondes fontes={fontes} escolhidas={fontesEscolhidas} aoEscolher={aoEscolherFontes} />

      {/* Uma fonte fora do ar não derruba a página: os resultados das outras
          aparecem, e a que falhou é dita aqui, discretamente. */}
      {(data?.falhas ?? []).length > 0 ? (
        <div className={styles.falhas}>
          {data?.falhas.map((f) => (
            <span key={f.provider} className={styles.falha}>
              {f.provider}: {f.error}
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.feed}>
        {procurando ? (
          buscando ? (
            <Esqueleto />
          ) : (data?.items ?? []).length > 0 ? (
            <>
              <Grade
                itens={data?.items ?? []}
                salvos={salvos}
                destino={destino}
                aoAbrir={aoAbrir}
                aoFavoritar={aoFavoritar}
                aoSalvar={aoSalvar}
              />
              <Mais visivel={buscaTemMais} carregando={buscandoMais} aoPedir={buscarMais} />
            </>
          ) : (
            <Vazio
              titulo={t('Nada encontrado')}
              corpo={t(
                'Nenhuma fonte conectada respondeu a essa busca. Você ainda pode guardar qualquer referência pelo link, no botão da Biblioteca.',
              )}
            />
          )
        ) : (
          <>
            {carregandoHome ? (
              <>
                <Secao titulo={t('Explorar')} itens={[]} />
                <Esqueleto />
              </>
            ) : daHome.length > 0 ? (
              <>
                <Secao titulo={t('Explorar')} itens={daHome} aoRecarregar={recarregar} />
                <Grade
                  itens={daHome}
                  salvos={salvos}
                  destino={destino}
                  aoAbrir={aoAbrir}
                  aoFavoritar={aoFavoritar}
                  aoSalvar={aoSalvar}
                />
                <Mais visivel={homeTemMais} carregando={homeCarregandoMais} aoPedir={maisDaHome} />
              </>
            ) : null}

            {/* Sem nada guardado o cabeçalho seria um rótulo para uma lista
                que não existe: quem fala é o vazio, que tem texto próprio. */}
            {recentes.length > 0 ? (
              <>
                <Secao titulo={t('Salvos recentemente')} itens={recentes} />
                <Grade
                  itens={recentes}
                  salvos={salvos}
                  destino={destino}
                  aoAbrir={aoAbrir}
                  aoFavoritar={aoFavoritar}
                  aoSalvar={aoSalvar}
                />
              </>
            ) : daHome.length === 0 && !carregandoHome ? (
              <Vazio
                titulo={t('Nada para mostrar ainda')}
                corpo={t(
                  'Entre na sua conta do DeviantArt no painel ao lado para ver o seu feed aqui — ou guarde qualquer referência por link, no botão da Biblioteca.',
                )}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Onde procurar: todas as fontes, uma, ou algumas.
 *
 * Fica SEMPRE ABERTO, em vez de um menu que se abre. São poucas fontes, o
 * estado importa (procurar em duas e achar que procurou em todas é o tipo de
 * engano que só se descobre tarde), e um painel suspenso aqui dentro seria
 * recortado: o painel do meio é `overflow: hidden`, e ele vive dentro do
 * `PanelRow`, que tem `perspective` — ali a ordem de pintura sai da
 * profundidade, não do `z-index` (CLAUDE.md § Modal).
 *
 * Só aparecem as fontes que sabem buscar AGORA. Uma linha com uma opção só não
 * é escolha nenhuma, então com menos de duas a fileira some.
 */
function Ondes({
  fontes,
  escolhidas,
  aoEscolher,
}: {
  fontes: CreativeConnection[] | null
  escolhidas: CreativeProviderId[]
  aoEscolher: (fontes: CreativeProviderId[]) => void
}) {
  const buscaveis = (fontes ?? []).filter((f) => f.capabilities.includes('search'))
  if (buscaveis.length < 2) return null

  const todas = escolhidas.length === 0
  const alternar = (id: CreativeProviderId) => {
    const nova = escolhidas.includes(id) ? escolhidas.filter((x) => x !== id) : [...escolhidas, id]
    // Desmarcar a última volta para "todas": uma busca em fonte nenhuma não
    // devolveria nada, e o usuário ficaria olhando um vazio que ele não pediu.
    aoEscolher(nova.length === buscaveis.length ? [] : nova)
  }

  return (
    // `fieldset`/`legend` e não `div role="group"`: um grupo de escolhas é
    // exatamente o que esses elementos são, e o leitor de tela anuncia o rótulo
    // antes de cada opção sem precisar de `aria-label`.
    <fieldset className={styles.ondes}>
      <legend className={styles.ondesRotulo}>{t('Procurar em')}</legend>
      <button
        type="button"
        aria-pressed={todas}
        className={cx(styles.chip, todas && styles.chipOn)}
        onClick={() => aoEscolher([])}
      >
        {t('Todas')}
      </button>
      {buscaveis.map((f) => {
        const marcada = escolhidas.includes(f.provider)
        return (
          <button
            key={f.provider}
            type="button"
            aria-pressed={marcada}
            className={cx(styles.chip, marcada && styles.chipOn)}
            onClick={() => alternar(f.provider)}
          >
            {f.name}
          </button>
        )
      })}
    </fieldset>
  )
}

/** O nome curto de cada plataforma, como ela se escreve. */
const MARCA: Record<string, string> = {
  deviantart: 'DeviantArt',
  artstation: 'ArtStation',
  behance: 'Behance',
  pinterest: 'Pinterest',
  printables: 'Printables',
  thingiverse: 'Thingiverse',
  link: 'link',
}

function Secao({
  titulo,
  itens,
  aoRecarregar,
}: {
  titulo: string
  itens: CreativeItem[]
  aoRecarregar?: () => void
}) {
  return (
    <div className={styles.secao}>
      <span className={styles.secaoTitulo}>{titulo}</span>
      <span className={styles.secaoContagem}>{itens.length}</span>
      {/* A home é uma página sendo carregada, e ela guarda o resultado por 90s.
          Depois de entrar na conta o feed é OUTRO, e esperar o cache vencer
          pareceria que o login não pegou. */}
      {aoRecarregar ? (
        <button
          type="button"
          className={styles.secaoRecarregar}
          aria-label={t('Buscar de novo')}
          onClick={aoRecarregar}
        >
          <ArrowClockwise size={12} />
        </button>
      ) : null}
    </div>
  )
}

/** O esqueleto da grade enquanto a busca viaja. Seis, que é o que a área mostra. */
function Esqueleto() {
  return (
    <div className={styles.grade} aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cx(styles.cartao, styles.cartaoEsqueleto)} />
      ))}
    </div>
  )
}

/**
 * "Carregar mais".
 *
 * Some quando não há mais — e some de verdade, sem virar um botão desabilitado:
 * a fonte devolveu cursor vazio, e um botão que não leva a lugar nenhum é pior
 * que a ausência dele. A home do DeviantArt tem UMA página, então ali ele não
 * aparece; a busca do mesmo site pagina de 24 em 24, e ali aparece.
 */
function Mais({
  visivel,
  carregando,
  aoPedir,
}: {
  visivel: boolean
  carregando: boolean
  aoPedir: () => void
}) {
  if (!visivel) return null
  return (
    <div className={styles.mais}>
      <button type="button" className={styles.maisBotao} disabled={carregando} onClick={aoPedir}>
        {carregando ? t('Carregando…') : t('Carregar mais')}
      </button>
    </div>
  )
}

function Vazio({ titulo, corpo }: { titulo: string; corpo: string }) {
  return (
    <div className={styles.vazio}>
      <span className={styles.vazioTitulo}>{titulo}</span>
      <span className={styles.vazioCorpo}>{corpo}</span>
    </div>
  )
}

function Grade({
  itens,
  salvos,
  destino,
  aoAbrir,
  aoFavoritar,
  aoSalvar,
}: {
  itens: CreativeItem[]
  salvos: CreativeSaved[]
  /** O grupo aberto na Biblioteca: é para lá que "salvar" manda. */
  destino: string
  aoAbrir: (item: CreativeItem) => void
  aoFavoritar: (item: CreativeItem) => void
  aoSalvar: (item: CreativeItem) => void
}) {
  const estado = (id: string) => salvos.find((s) => s.item.id === id)

  return (
    <div className={styles.grade}>
      {itens.map((item) => {
        const guardado = estado(item.id)
        return (
          <div key={item.id} className={styles.cartao}>
            <button
              type="button"
              className={styles.cartaoAbrir}
              onClick={() => aoAbrir(item)}
              aria-label={t('Ver {titulo}', { titulo: item.title || t('referência') })}
            >
              <Capa url={item.cover} alt="" />
              {/* A marca da plataforma sobre a capa. Numa grade que mistura
                  origens, é o que diz de onde a imagem veio sem obrigar a ler
                  a linha de baixo — e a atribuição é exigência dos termos, não
                  enfeite. */}
              <span className={styles.cartaoMarca}>{MARCA[item.provider] ?? item.provider}</span>
            </button>

            <div className={styles.cartaoTexto}>
              <span className={styles.cartaoTitulo}>{item.title || t('Sem título')}</span>
              <span className={styles.cartaoOrigem}>
                {item.author ? `${item.author} · ` : ''}
                {item.provider}
              </span>
              <span className={styles.cartaoTipo}>
                {t(CREATIVE_KIND_LABEL[item.kind])}
                {item.license ? ` · ${item.license}` : ''}
              </span>
            </div>

            <div className={styles.cartaoAcoes}>
              <button
                type="button"
                className={styles.cartaoBotao}
                aria-label={guardado?.favorite ? t('Desfavoritar') : t('Favoritar')}
                aria-pressed={guardado?.favorite ?? false}
                onClick={() => aoFavoritar(item)}
              >
                <Heart size={14} weight={guardado?.favorite ? 'fill' : 'regular'} />
              </button>
              <button
                type="button"
                className={styles.cartaoBotao}
                aria-label={guardado ? t('Na biblioteca') : t('Salvar na biblioteca')}
                // Para ONDE vai. O destino é o grupo aberto na Biblioteca, e
                // sem dizer isso o botão parece guardar sempre no mesmo lugar.
                title={
                  guardado
                    ? t('Tirar da biblioteca')
                    : destino
                      ? t('Salvar em {destino}', { destino })
                      : t('Salvar na biblioteca')
                }
                aria-pressed={Boolean(guardado)}
                onClick={() => aoSalvar(item)}
              >
                <BookmarkSimple size={14} weight={guardado ? 'fill' : 'regular'} />
              </button>
              <a
                className={styles.cartaoBotao}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('Abrir original')}
              >
                <ArrowSquareOut size={14} />
              </a>
            </div>
          </div>
        )
      })}
    </div>
  )
}
