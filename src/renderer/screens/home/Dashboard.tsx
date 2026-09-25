import { CaretDown } from '@phosphor-icons/react/dist/icons/CaretDown'
import { Check } from '@phosphor-icons/react/dist/icons/Check'
import { GridFour } from '@phosphor-icons/react/dist/icons/GridFour'
import { Info } from '@phosphor-icons/react/dist/icons/Info'
import { Sparkle } from '@phosphor-icons/react/dist/icons/Sparkle'
import { Warning } from '@phosphor-icons/react/dist/icons/Warning'
import { ENVIRONMENTS, type Environment, type EnvironmentId } from '@shared/environments'
import { localeDoIdioma, t } from '@shared/i18n'
import { type CSSProperties, useEffect, useState } from 'react'
import { aplicarWallpaper } from '@/app/environment'
import type { NewsFeedStatus, NewsItem } from '@/domain/types'
import { useApps, useLaunchApp, useNotifications } from '@/hooks/useHome'
import { useContainers, useHost } from '@/hooks/useLab'
import { useNews } from '@/hooks/useNews'
import { useProjects } from '@/hooks/useProjects'
import { useWallpaperPreviews } from '@/hooks/useWallpaper'
import { useHalo } from '@/store/useHalo'
import { cx } from '@/ui/cx'
import styles from './home.module.css'

/**
 * Dashboard central da Home.
 *
 * O que é real: a saudação (usuário e hora do sistema), o resumo (containers
 * ativos e projetos com alterações), a gaveta de apps — que lista os
 * aplicativos instalados de verdade, pelos arquivos `.desktop`, e os abre —
 * e a coluna de leitura, que mostra as manchetes dos feeds RSS configurados.
 *
 * O que é do protótipo: as notificações. Não há fonte para elas nesta
 * máquina — ver MOCKS.md.
 */
export function Dashboard() {
  const drawer = useHalo((s) => s.drawer)
  const toggleDrawer = useHalo((s) => s.toggleDrawer)
  const { data: host } = useHost()
  const { data: containers } = useContainers()
  const { data: projects } = useProjects()
  const { data: avisos } = useNotifications()
  const setScreen = useHalo((s) => s.setScreen)
  const setSettingsSection = useHalo((s) => s.setSettingsSection)
  const abrirIlha = () => {
    setSettingsSection('island')
    setScreen('settings')
  }

  const running = (containers ?? []).filter((c) => c.state === 'running').length
  const dirty = (projects ?? []).filter((p) => p.dirtyFiles > 0).length

  return (
    <>
      <div className={styles.head}>
        <div>
          <div className={styles.greeting}>{greeting(host ? userName(host.hostname) : null)}</div>
          <div className={styles.summary}>
            {t(running === 1 ? '{n} container ativo' : '{n} containers ativos', { n: running })} ·{' '}
            {dirty === 0
              ? t('nenhum projeto com alterações')
              : dirty === 1
                ? t('1 projeto com alterações')
                : t('{n} projetos com alterações', { n: dirty })}
          </div>
        </div>
        <div className={styles.spacer} />
        <button type="button" className={styles.appsButton} onClick={toggleDrawer}>
          <GridFour size={16} weight="fill" />
          {t('Apps')}
          <CaretDown size={13} />
        </button>
      </div>

      {drawer && <AppsDrawer />}

      <span className={styles.label}>{t('CONTINUAR')}</span>
      <div className={styles.continueRow}>
        {(projects ?? []).slice(0, 3).map((project) => (
          <button
            type="button"
            key={project.path}
            className={styles.continueCard}
            // `projeto` é o que este cartão é; um tema que queira marcá-lo
            // (o City Pop põe uma fita de listras no canto) lê daqui.
            data-halo-cartao="mini projeto"
            // Era um `<button>` sem `onClick`: tinha `cursor: pointer`, tinha
            // hover, e não fazia nada. A tela do Claude é onde projeto vira
            // ação — é a única coisa que um cartão de "Continuar" pode
            // razoavelmente abrir, e a escolha do projeto acontece lá dentro.
            onClick={() => setScreen('claude')}
            title={t('{nome}: abrir na tela do Claude', { nome: project.name })}
          >
            <div className={styles.continueHead}>
              <Sparkle size={15} weight="fill" color="var(--accent-gold)" />
              <span className={styles.continueTitle}>{project.name}</span>
            </div>
            <div className={styles.continueBody}>
              {project.lastCommit || t('sem commits ainda')}
            </div>
            <div className={styles.continueMeta}>
              <span className={styles.added}>+{project.insertions}</span>
              <span className={styles.removed}>−{project.deletions}</span>
            </div>
          </button>
        ))}
        {(projects ?? []).length === 0 && (
          <span className={styles.continueBody}>{t('Nenhum projeto git por aqui.')}</span>
        )}
      </div>

      <div className={styles.bottom}>
        <NewsColumn />

        <div className={styles.column}>
          {/* Sem "· EXEMPLO": dentro do app estas são as notificações do
              SISTEMA, pelo vigia do D-Bus da ilha. Fora dele (o navegador dos
              guarda-fidelidade) o mock avisa por outro caminho. */}
          <span className={styles.label}>{t('NOTIFICAÇÕES')}</span>

          {/* Coluna vazia tem DUAS causas, e mostrá-las iguais seria mentir.
              Sem vigia, a tela diz onde ligar — que é a regra do projeto para
              integração que falta configurar. */}
          {avisos && !avisos.listening ? (
            <span className={styles.feedEmpty}>
              {t('As notificações do sistema chegam pela ilha dinâmica. Ligue-a em')}{' '}
              <button type="button" onClick={abrirIlha}>
                {t('Configurações → Ilha')}
              </button>
              .
            </span>
          ) : null}

          {avisos?.listening && avisos.items.length === 0 ? (
            <span className={styles.feedEmpty}>{t('Nada por aqui ainda.')}</span>
          ) : null}

          {(avisos?.items ?? []).map((item, i) => (
            <div
              key={item.title}
              className={styles.notification}
              // Dois sinais neutros, que a Floresta não lê. O Cyberpunk usa o
              // primeiro para montar a linha em varredura (como o popup de
              // notificação da referência) e o segundo para dar cor de
              // urgência à barra de acento — ver `styles/animations.css` e
              // `styles/env-cyberpunk.css`.
              data-halo-in="notificacao"
              data-urgencia={item.kind}
              // A pilha não entra de uma vez: cada linha atrasa 90ms sobre a
              // anterior. A propriedade é lida também pelos pseudo-elementos
              // da linha (a aresta da varredura), que não herdariam um
              // `animation-delay`.
              style={{ '--cp-atraso': `${i * 90}ms` } as CSSProperties}
            >
              <NotificationIcon kind={item.kind} />
              <span>
                <span className={styles.notificationTitle}>{item.title}</span>
                <span className={styles.notificationBody}>{item.body}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/** Quantas manchetes cabem na coluna de uma vez. Medido na tela: cabem 5. */
const VISIVEIS = 5
/** Entre quantas das mais novas a coluna alterna. */
const RODIZIO = 12
const ROTACAO_MS = 8000

/**
 * A coluna de leitura: manchetes reais dos feeds RSS configurados.
 *
 * Mostra três por vez e, a cada oito segundos, avança uma — as três de baixo
 * do rodízio entram com a animação de sempre. A busca é do hook (a cada 15
 * minutos); aqui só se escolhe quais mostrar. Sem feed, ou sem resposta, a
 * coluna diz isso e aponta para Configurações → Notícias — nunca inventa.
 *
 * Cada manchete é um `<a target="_blank">`: o main intercepta a abertura de
 * janela e manda para o navegador do sistema (ver `window.ts`).
 */
function NewsColumn() {
  const feeds = useHalo((s) => s.newsFeeds)
  const setScreen = useHalo((s) => s.setScreen)
  const setSettingsSection = useHalo((s) => s.setSettingsSection)
  const { data, loading, error } = useNews()
  const [passo, setPasso] = useState(0)
  // O rodízio some com a manchete que a pessoa está lendo, a cada 8s, e não
  // havia como segurá-lo. Parar sob o ponteiro é o gesto que toda lista que
  // gira sozinha tem; `onFocus`/`onBlur` fazem o mesmo para quem chega pelo
  // teclado, que é quem mais precisa de tempo.
  const [pausado, setPausado] = useState(false)

  const pool = (data?.items ?? []).slice(0, RODIZIO)
  const gira = pool.length > VISIVEIS

  useEffect(() => {
    if (!gira || pausado) return
    const id = setInterval(() => setPasso((p) => p + 1), ROTACAO_MS)
    return () => clearInterval(id)
  }, [gira, pausado])

  // O módulo mantém o passo válido mesmo quando a lista muda de tamanho: não
  // precisa zerar nada quando os feeds voltam com outra quantidade.
  const inicio = pool.length ? passo % pool.length : 0
  const visiveis = gira
    ? Array.from({ length: VISIVEIS }, (_, i) => pool[(inicio + i) % pool.length])
    : pool
  const falhas = (data?.feeds ?? []).filter((f) => f.error)

  const abrirConfiguracoes = () => {
    setSettingsSection('news')
    setScreen('settings')
  }

  return (
    // `<section>` com nome, e não um `<div>`: a coluna passou a reagir ao
    // ponteiro e ao foco (para segurar o rodízio), e um `<div>` com esses
    // ouvintes é, para o linter e para o leitor de tela, um elemento que
    // promete interação sem dizer qual. Ela É uma região da página — a de
    // leitura —, e o elemento certo para isso já existe no HTML.
    <section
      className={styles.column}
      aria-label={t('Leitura')}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
    >
      <span className={styles.label}>
        {t('LEITURA · RSS')}
        {data?.demo ? ` · ${t('EXEMPLO')}` : ''}
      </span>

      {feeds.length === 0 ? (
        <span className={styles.feedEmpty}>
          {t('Nenhum feed configurado. Adicione um em')}{' '}
          <button type="button" onClick={abrirConfiguracoes}>
            {t('Configurações → Notícias')}
          </button>
          .
        </span>
      ) : error ? (
        <span className={styles.feedEmpty}>
          {t('Não consegui buscar as manchetes: {erro}', { erro: error.message })}
        </span>
      ) : !data && loading ? (
        <span className={styles.feedEmpty}>{t('Buscando manchetes…')}</span>
      ) : pool.length === 0 ? (
        <span className={styles.feedEmpty}>
          {falhas.length > 0
            ? t('{feed} não respondeu: {erro}.', {
                feed: nomeDoFeed(falhas[0]),
                erro: falhas[0]?.error ?? '',
              })
            : t('Os feeds não trouxeram nenhuma manchete.')}{' '}
          {t('Confira em')}{' '}
          <button type="button" onClick={abrirConfiguracoes}>
            {t('Configurações → Notícias')}
          </button>
          .
        </span>
      ) : (
        visiveis.map((item, i) =>
          item ? (
            <Manchete
              // O passo entra na chave de propósito: a cada avanço as três
              // remontam e entram juntas, escalonadas — é uma virada de
              // página, não três coisas pulando de lugar.
              key={`${inicio}:${item.id}`}
              item={item}
              delayMs={i * 60}
            />
          ) : null,
        )
      )}

      {pool.length > 0 && falhas.length > 0 ? (
        <span className={styles.feedWarn}>
          {t('{feed} NÃO RESPONDEU: {erro}', {
            feed: nomeDoFeed(falhas[0]).toUpperCase(),
            erro: falhas[0]?.error ?? '',
          })}
        </span>
      ) : null}
    </section>
  )
}

function Manchete({ item, delayMs }: { item: NewsItem; delayMs: number }) {
  const quando = idade(item.publishedAt)
  return (
    <a
      className={styles.feedItem}
      href={item.link}
      target="_blank"
      rel="noreferrer"
      title={item.summary || item.title}
      data-halo-in="feed"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {/* A miniatura chega como `data:` do main — a CSP do renderer não abre
          host nenhum, e um feed traz imagem de onde quiser. Sem imagem, o
          quadro listrado do handoff continua no lugar: ele é o vazio
          desenhado, não uma imagem que falhou. */}
      {item.image ? (
        <img className={styles.thumb} src={item.image} alt="" />
      ) : (
        <span className={styles.thumb} />
      )}
      <span className={styles.feedText}>
        <span className={styles.feedSource}>
          {item.source.toUpperCase()}
          {quando ? ` · ${quando}` : ''}
        </span>
        <span className={styles.feedTitle}>{item.title}</span>
      </span>
    </a>
  )
}

/** O nome que o feed deu de si, ou o host — o que der para reconhecer. */
function nomeDoFeed(status: NewsFeedStatus | undefined): string {
  if (!status) return t('o feed')
  if (status.name) return status.name
  try {
    return new URL(status.url).hostname.replace(/^www\./, '')
  } catch {
    return status.url
  }
}

/** "2 H", "ONTEM", "3 D": o vocabulário do handoff para a idade da manchete. */
function idade(iso: string | null): string {
  if (!iso) return ''
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(min) || min < 1) return t('AGORA')
  if (min < 60) return t('{n} MIN', { n: min })
  const horas = Math.round(min / 60)
  if (horas < 24) return t('{n} H', { n: horas })
  const dias = Math.round(horas / 24)
  if (dias === 1) return t('ONTEM')
  if (dias < 7) return t('{n} D', { n: dias })
  return new Date(iso)
    .toLocaleDateString(localeDoIdioma(), { day: 'numeric', month: 'short' })
    .replace('.', '')
    .toUpperCase()
}

function NotificationIcon({ kind }: { kind: 'ok' | 'info' | 'error' }) {
  if (kind === 'error') return <Warning size={15} weight="fill" color="var(--accent-red)" />
  if (kind === 'ok') return <Check size={15} weight="bold" color="var(--accent-green)" />
  return <Info size={15} weight="fill" color="var(--accent-violet)" />
}

/** Gaveta de apps: os aplicativos instalados de verdade. */
function AppsDrawer() {
  const { data: apps } = useApps()
  const launch = useLaunchApp()

  return (
    <div className={styles.drawer}>
      <span className={styles.label}>
        {t(
          (apps ?? []).length === 1
            ? 'APLICATIVOS · {n} INSTALADO'
            : 'APLICATIVOS · {n} INSTALADOS',
          { n: (apps ?? []).length },
        )}
      </span>
      <div className={styles.drawerGrid} style={{ marginTop: 12 }}>
        {/* Sem corte: o rótulo acima anuncia o total real (passa de cem numa máquina comum) e a
            grade mostrava 30, sem dizer e sem caminho para os outros. A grade
            já rola (`max-height: 300px; overflow-y: auto` em home.module.css),
            então o corte não era para caber. */}
        {(apps ?? []).map((app) => (
          <button
            type="button"
            key={app.id}
            className={styles.app}
            title={app.comment ?? app.name}
            onClick={() => void launch(app.id)}
          >
            <GridFour size={20} color="var(--text-secondary)" />
            <span className={styles.appName}>{app.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * A saudação inteira é a chave: em inglês "você" não cabe depois da vírgula
 * ("Good morning, you"), então sem nome a frase é outra, e não um buraco vazio.
 */
function greeting(nome: string | null): string {
  const hour = new Date().getHours()
  if (nome === null) {
    if (hour < 12) return t('Bom dia, você')
    return hour < 19 ? t('Boa tarde, você') : t('Boa noite, você')
  }
  if (hour < 12) return t('Bom dia, {nome}', { nome })
  return hour < 19 ? t('Boa tarde, {nome}', { nome }) : t('Boa noite, {nome}', { nome })
}

/**
 * O nome do ambiente com a segunda linha dele, traduzida. `environmentLabel`
 * (em `shared/`) monta a mesma frase em português; aqui a descrição passa por
 * `t()` na hora de desenhar. O NOME não se traduz — é nome próprio.
 */
function rotuloDoAmbiente(ambiente: Environment): string {
  return ambiente.description ? `${ambiente.name} — ${t(ambiente.description)}` : ambiente.name
}

/** O hostname costuma trazer o nome de quem usa a máquina. */
function userName(hostname: string): string {
  const first = hostname.split('-')[0] ?? hostname
  return first.charAt(0).toUpperCase() + first.slice(1)
}

/**
 * A amostra da paleta de cada tema, por token.
 *
 * Nomes de token, e não cores: as cores moram em `styles/tokens.css` (Floresta)
 * e no arquivo de cada tema (`styles/env-cyberpunk.css`,
 * `styles/env-bioshock.css`). Ambiente sem tema não tem amostra — ele mostra
 * "EM BREVE" no lugar.
 */
const AMOSTRAS: Record<EnvironmentId, readonly string[]> = {
  floresta: ['--env-floresta-1', '--env-floresta-2', '--env-floresta-3'],
  citypop: ['--env-citypop-1', '--env-citypop-2', '--env-citypop-3'],
  cyberpunk: ['--env-cyberpunk-1', '--env-cyberpunk-2', '--env-cyberpunk-3'],
  bioshock: ['--env-bioshock-1', '--env-bioshock-2', '--env-bioshock-3'],
  estudio: [],
  espaco: [],
  costa: [],
}

/**
 * Ambientes: o tema do app e o papel de parede da máquina, juntos.
 *
 * Escolher um ambiente troca os tokens de cor da interface (ver
 * `app/environment.ts`) e manda o main aplicar o papel de parede daquele
 * ambiente — a única coisa que ele muda fora do app, e só se o interruptor de
 * Configurações → Ambiente estiver ligado.
 *
 * Os três sem tema continuam listados, inertes: eles existem no handoff, e
 * sumir com eles seria perder algo que já estava aqui.
 */
export function Environments() {
  const atual = useHalo((s) => s.environment.id)
  const trocarPapel = useHalo((s) => s.environment.wallpaper)
  const imagens = useHalo((s) => s.environment.wallpapers)
  const setEnvironment = useHalo((s) => s.setEnvironment)
  const [erro, setErro] = useState('')
  const previas = useWallpaperPreviews(imagens)

  const escolher = (ambiente: Environment) => {
    if (!ambiente.ready || ambiente.id === atual) return
    setErro('')
    setEnvironment(ambiente.id)
    // Fora do Electron não há área de trabalho para mexer: o tema muda e o
    // papel de parede é ignorado, sem erro na tela.
    if (trocarPapel) void aplicarWallpaper(ambiente.id).then(setErro)
  }

  return (
    <>
      <span className={styles.label}>{t('AMBIENTES')}</span>
      {/* `fieldset` traria moldura e margens próprias, e esta é uma coluna com
          medidas do handoff. O papel e o rótulo estão declarados, e cada
          ambiente informa `aria-pressed`. */}
      {/* biome-ignore lint/a11y/useSemanticElements: ver acima */}
      <div className={styles.envGrid} role="group" aria-label={t('Ambientes')}>
        {ENVIRONMENTS.map((ambiente) => {
          const ativo = ambiente.id === atual
          return (
            <button
              type="button"
              key={ambiente.id}
              className={cx(
                styles.env,
                ativo && styles.envActive,
                !ambiente.ready && styles.envSoon,
              )}
              // `aria-pressed` diz qual tema está posto; `aria-disabled` (e não
              // `disabled`) mantém os "em breve" alcançáveis pelo teclado, para
              // quem navega assim saber que eles existem.
              aria-pressed={ambiente.ready ? ativo : undefined}
              aria-disabled={ambiente.ready ? undefined : true}
              // O nome inteiro nem sempre cabe no cartão (246px, uma linha):
              // quando o ambiente traz uma segunda linha, ela vem no tooltip,
              // junto com a imagem — é a única largura que há aqui.
              title={
                ambiente.ready
                  ? `${rotuloDoAmbiente(ambiente)}\n${t('Papel de parede: {arquivo}', {
                      arquivo: nomeDaImagem(imagens[ambiente.id] || ambiente.wallpaper),
                    })}`
                  : t('{ambiente}: tema em breve', { ambiente: rotuloDoAmbiente(ambiente) })
              }
              onClick={() => escolher(ambiente)}
            >
              {previas[ambiente.id] && (
                <span
                  className={styles.envFoto}
                  aria-hidden="true"
                  style={{ backgroundImage: `url(${previas[ambiente.id]})` }}
                />
              )}
              <span className={styles.envName}>{ambiente.name}</span>
              {ambiente.ready ? (
                <span className={styles.envSwatches} aria-hidden="true">
                  {AMOSTRAS[ambiente.id].map((token) => (
                    <span
                      key={token}
                      className={styles.envSwatch}
                      style={{ background: `var(${token})` }}
                    />
                  ))}
                </span>
              ) : (
                <span className={styles.envSoonTag}>{t('EM BREVE')}</span>
              )}
              {ativo && (
                <Check
                  size={14}
                  weight="bold"
                  className={styles.envCheck}
                  color="var(--accent-mint-strong)"
                />
              )}
            </button>
          )
        })}
      </div>
      {erro && (
        <span className={styles.envErro}>
          {t('Não troquei o papel de parede: {erro}', { erro })}
        </span>
      )}
    </>
  )
}

/** O nome do arquivo, que é o que cabe no tooltip. */
function nomeDaImagem(caminho: string): string {
  return caminho.split('/').filter(Boolean).pop() ?? caminho
}
