import { CaretDown } from '@phosphor-icons/react/dist/icons/CaretDown'
import { CaretRight } from '@phosphor-icons/react/dist/icons/CaretRight'
import { Check } from '@phosphor-icons/react/dist/icons/Check'
import { ClockCounterClockwise } from '@phosphor-icons/react/dist/icons/ClockCounterClockwise'
import { Copy } from '@phosphor-icons/react/dist/icons/Copy'
import { FolderOpen } from '@phosphor-icons/react/dist/icons/FolderOpen'
import { FolderPlus } from '@phosphor-icons/react/dist/icons/FolderPlus'
import { FolderSimple } from '@phosphor-icons/react/dist/icons/FolderSimple'
import { FolderSimplePlus } from '@phosphor-icons/react/dist/icons/FolderSimplePlus'
import { GitBranch } from '@phosphor-icons/react/dist/icons/GitBranch'
import { Paperclip } from '@phosphor-icons/react/dist/icons/Paperclip'
import { PaperPlaneRight } from '@phosphor-icons/react/dist/icons/PaperPlaneRight'
import { PencilSimple } from '@phosphor-icons/react/dist/icons/PencilSimple'
import { Plus } from '@phosphor-icons/react/dist/icons/Plus'
import { X } from '@phosphor-icons/react/dist/icons/X'
import type { Agent, AgentMessage, AgentState, Attachment } from '@shared/agents'
import { localeDoIdioma, t } from '@shared/i18n'
import { useEffect, useRef, useState } from 'react'
import { useAgentMessages, useAgents, useAgentTools, useSessions } from '@/hooks/useAgents'
import { usePathOf } from '@/hooks/useFiles'
import { useProjectInfos, useProjects } from '@/hooks/useProjects'
import { useHalo } from '@/store/useHalo'
import { cx } from '@/ui/cx'
import { Panel } from '@/ui/Panel'
import { PanelRow } from '@/ui/PanelRow'
import styles from './claude.module.css'
import { Markdown } from './Markdown'
import { Mascote } from './Mascote'

/**
 * Claude — agentes por projeto.
 *
 * Cada agente é um processo do CLI do Claude vivo dentro de um repositório do
 * usuário (ver `src/main/services/agents.ts`). Um clique num projeto abre um
 * agente; clicar num agente traz a conversa dele para o centro.
 *
 * O painel da direita mantém a forma do handoff: o orbe no topo, e a lista de
 * agentes abaixo dele.
 *
 * Geometria: protótipo linha 864 (linha), 867 / 956 / 1014 (painéis).
 */
export function ClaudeScreen() {
  const { agents, create, send, close, attach, attachPaths } = useAgents()
  const [foco, setFoco] = useState<string | null>(null)
  /** Projeto cujas conversas antigas estão abertas no modal. */
  const [retomando, setRetomando] = useState<string | null>(null)

  const atual = agents.find((a) => a.id === foco) ?? agents[0] ?? null

  const abrir = async (project: string, resume?: string) => {
    const agente = await create(project, resume)
    setFoco(agente.id)
  }

  return (
    <>
      <PanelRow gap={22} perspective={2400} padding="44px 40px 130px">
        <Panel
          variant="side"
          w={300}
          h={660}
          radius={28}
          padding="20px 16px"
          gap={14}
          order={-1}
          rest="rotateY(17deg) translateZ(-50px)"
          fromX={150}
        >
          <ProjetosPanel aoAbrir={abrir} agentes={agents} aoVerConversas={setRetomando} />
        </Panel>

        <Panel variant="center" w={690} h={660} radius={28} overflow="hidden">
          <ConversaPanel
            agente={atual}
            aoEnviar={send}
            aoAnexar={attach}
            aoAnexarCaminhos={attachPaths}
          />
        </Panel>

        <Panel
          variant="side"
          w={290}
          h={640}
          radius={28}
          padding="22px 18px"
          gap={14}
          order={1}
          rest="rotateY(-17deg) translateZ(-50px)"
          fromX={-150}
        >
          <AgentesPanel
            agentes={agents}
            foco={atual?.id ?? null}
            aoFocar={setFoco}
            aoFechar={(id) => {
              close(id)
              if (foco === id) setFoco(null)
            }}
          />
        </Panel>
      </PanelRow>

      {/*
        FORA do `PanelRow`, e não dentro dele.

        A linha tem `perspective`, o que põe os filhos num contexto de
        renderização 3D — e ali a ordem de pintura sai da profundidade, não do
        `z-index`. Dentro dela o modal ficava atrás dos painéis e os cliques
        iam parar no do meio, mesmo com `z-index: 20`.
      */}
      {retomando ? (
        <SessoesModal
          project={retomando}
          aoRetomar={(sessao) => {
            const projeto = retomando
            setRetomando(null)
            void abrir(projeto, sessao)
          }}
          aoFechar={() => setRetomando(null)}
        />
      ) : null}
    </>
  )
}

/**
 * Tipo do arrasto de um projeto. Próprio, e não `text/plain`: soltar texto ou
 * um arquivo do gerenciador na lista não pode virar "mover projeto".
 */
const ARRASTO = 'application/x-halo-projeto'
/** Arrasto de um grupo inteiro, pelo cabeçalho — reordena os grupos. */
const ARRASTO_GRUPO = 'application/x-halo-grupo'
/** Alvo de arrasto do cabeçalho "Sem grupo" (os outros alvos são ids e caminhos). */
const SEM_GRUPO = ':sem-grupo'

/**
 * Esquerda: os projetos.
 *
 * A lista é do usuário — ele fixa e tira. Na primeira vez ela é semeada com os
 * repositórios git que a máquina já tem, porque começar vazia seria uma tela
 * inútil esperando configuração.
 *
 * Com muitos projetos ela se organiza em grupos recolhíveis, pedido
 * do usuário. Dois caminhos para pôr um projeto num grupo: arrastar o cartão
 * até o grupo (soltar sobre outro cartão o põe naquele lugar, e é assim que se
 * reordena), ou o botão de pasta do cartão — o caminho que não exige mouse.
 */
function ProjetosPanel({
  aoAbrir,
  agentes,
  aoVerConversas,
}: {
  aoAbrir: (project: string, resume?: string) => void
  agentes: Agent[]
  aoVerConversas: (project: string) => void
}) {
  const projetos = useHalo((s) => s.claudeProjects)
  const { addProject, openProject } = useAgentTools()
  const grupos = useHalo((s) => s.claudeGroups)
  const adicionar = useHalo((s) => s.addClaudeProject)
  const remover = useHalo((s) => s.removeClaudeProject)
  const criarGrupo = useHalo((s) => s.createClaudeGroup)
  const renomearGrupo = useHalo((s) => s.renameClaudeGroup)
  const apagarGrupo = useHalo((s) => s.deleteClaudeGroup)
  const alternarGrupo = useHalo((s) => s.toggleClaudeGroup)
  const mover = useHalo((s) => s.moveClaudeProject)
  const reordenarGrupo = useHalo((s) => s.reorderClaudeGroup)
  const { data: encontrados } = useProjects()
  const infos = useProjectInfos(projetos)
  const [criando, setCriando] = useState(false)
  const [renomeando, setRenomeando] = useState<string | null>(null)
  // Apagar é o primeiro clique arma, o segundo apaga — o mesmo das listas da
  // Mídia. Nenhum projeto se perde (voltam para "Sem grupo"), mas a
  // arrumação foi feita à mão, cartão a cartão.
  const [confirmando, setConfirmando] = useState<string | null>(null)
  /** Projeto com a faixa "mover para" aberta. */
  const [movendo, setMovendo] = useState<string | null>(null)
  /** Alvo sob o arrasto: id de grupo, `SEM_GRUPO` ou caminho de projeto. */
  const [sobre, setSobre] = useState<string | null>(null)
  /**
   * Grupo sendo arrastado. O `dataTransfer` não pode ser lido durante o
   * `dragover`, e é por este estado que o alvo sabe desenhar "entra antes"
   * em vez de "entra dentro".
   */
  const [arrastandoGrupo, setArrastandoGrupo] = useState<string | null>(null)
  /** Projeto cujo caminho acabou de ir para a área de transferência. */
  const [copiado, setCopiado] = useState<string | null>(null)

  const copiar = async (caminho: string) => {
    try {
      await navigator.clipboard.writeText(caminho)
    } catch {
      return
    }
    // O ✓ só aparece se a cópia deu certo: dizer "copiado" sem ter copiado
    // seria pior do que não dizer nada.
    setCopiado(caminho)
    setTimeout(() => setCopiado((atual) => (atual === caminho ? null : atual)), 1400)
  }

  // Semeia uma vez, com o que o git desta máquina já mostra.
  useEffect(() => {
    if (projetos.length > 0 || !encontrados?.length) return
    for (const projeto of encontrados.slice(0, 8)) adicionar(projeto.path)
  }, [projetos.length, encontrados, adicionar])

  const escolher = async () => {
    const caminho = await addProject()
    if (caminho) adicionar(caminho)
  }

  const agrupados = new Set(grupos.flatMap((g) => g.projects))
  const soltos = projetos.filter((p) => !agrupados.has(p))
  const agentesEm = (lista: string[]) => agentes.filter((a) => lista.includes(a.project)).length

  /**
   * Alvo de soltura. `lugarDoGrupo` só vem nos cabeçalhos: é o grupo antes do
   * qual um GRUPO arrastado entra (`null` = no fim). Sem ele o alvo recusa
   * grupo — soltar um grupo sobre um cartão não teria sentido.
   */
  const receber = (
    alvo: string,
    grupo: string | null,
    antes?: string,
    lugarDoGrupo?: string | null,
  ) => ({
    onDragOver: (e: React.DragEvent) => {
      const tipos = e.dataTransfer.types
      if (tipos.includes(ARRASTO_GRUPO) ? lugarDoGrupo === undefined : !tipos.includes(ARRASTO))
        return
      e.preventDefault()
      // O cartão fica dentro da área do grupo: sem isto o grupo tomaria o
      // alvo do cartão e soltar nunca reordenaria.
      e.stopPropagation()
      setSobre(alvo)
    },
    onDragLeave: () => setSobre((atual) => (atual === alvo ? null : atual)),
    onDrop: (e: React.DragEvent) => {
      const idGrupo = e.dataTransfer.getData(ARRASTO_GRUPO)
      if (idGrupo) {
        if (lugarDoGrupo === undefined) return
        e.preventDefault()
        e.stopPropagation()
        setSobre(null)
        reordenarGrupo(idGrupo, lugarDoGrupo)
        return
      }
      const caminho = e.dataTransfer.getData(ARRASTO)
      if (!caminho) return
      e.preventDefault()
      e.stopPropagation()
      setSobre(null)
      mover(caminho, grupo, antes)
    },
  })

  const cartao = (caminho: string, grupo: string | null) => {
    const nome = caminho.split('/').filter(Boolean).at(-1) ?? caminho
    const info = infos.get(caminho)
    const quantos = agentes.filter((a) => a.project === caminho).length
    return (
      <div className={styles.projectBloco} key={caminho}>
        <div
          className={cx(styles.projectRow, sobre === caminho && styles.projectDrop)}
          {...receber(caminho, grupo, caminho)}
        >
          <button
            type="button"
            className={styles.project}
            title={t('Abrir um agente em {caminho}', { caminho })}
            onClick={() => aoAbrir(caminho)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(ARRASTO, caminho)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => setSobre(null)}
          >
            <div className={styles.projectHead}>
              <span className={styles.projectName}>{nome}</span>
              {quantos > 0 ? <span className={styles.projectAgents}>{quantos}</span> : null}
            </div>

            {/* Git só quando é repositório: "sem git" é informação, e a
                    tela do Claude aceita qualquer pasta como projeto. */}
            {info ? (
              <>
                <div className={styles.projectMeta}>
                  <GitBranch size={11} />
                  {info.branch}
                  <span
                    className={cx(
                      styles.tag,
                      info.dirtyFiles > 0 ? styles.tagDirty : styles.tagClean,
                    )}
                  >
                    {info.dirtyFiles > 0 ? t('{n} alterados', { n: info.dirtyFiles }) : t('limpo')}
                  </span>
                </div>
                {info.insertions > 0 || info.deletions > 0 ? (
                  <div className={styles.diff}>
                    <span className={styles.added}>+{info.insertions}</span>
                    <span className={styles.removed}>−{info.deletions}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <div className={styles.projectMeta}>{caminho.replace(/^\/home\/[^/]+/, '~')}</div>
            )}
          </button>

          <button
            type="button"
            className={styles.projectMove}
            aria-label={t('Mover {nome} para um grupo', { nome })}
            aria-expanded={movendo === caminho}
            title={t('Mover para um grupo')}
            onClick={() => setMovendo((atual) => (atual === caminho ? null : caminho))}
          >
            <FolderSimple size={12} color="var(--text-tertiary)" />
          </button>
          <button
            type="button"
            className={styles.projectResume}
            aria-label={t('Conversas antigas de {nome}', { nome })}
            title={t('Conversas antigas')}
            onClick={() => aoVerConversas(caminho)}
          >
            <ClockCounterClockwise size={12} color="var(--text-tertiary)" />
          </button>
          <button
            type="button"
            className={styles.projectRemove}
            aria-label={t('Tirar {nome} da lista', { nome })}
            onClick={() => remover(caminho)}
          >
            <X size={11} color="var(--text-tertiary)" />
          </button>

          {/* Embaixo, e não junto dos três de cima: esses organizam a LISTA;
              estes dois são sobre a PASTA — e cinco num canto cobririam o nome. */}
          <button
            type="button"
            className={styles.projectAbrir}
            aria-label={t('Abrir a pasta de {nome} no gerenciador de arquivos', { nome })}
            title={t('Abrir a pasta')}
            onClick={() => void openProject(caminho)}
          >
            <FolderOpen size={12} color="var(--text-tertiary)" />
          </button>
          <button
            type="button"
            className={styles.projectCopiar}
            aria-label={t('Copiar o caminho de {nome}', { nome })}
            title={copiado === caminho ? t('Copiado') : t('Copiar {caminho}', { caminho })}
            data-copiado={copiado === caminho || undefined}
            onClick={() => void copiar(caminho)}
          >
            {copiado === caminho ? (
              <Check size={12} color="var(--accent-green)" weight="bold" />
            ) : (
              <Copy size={12} color="var(--text-tertiary)" />
            )}
          </button>
        </div>

        {movendo === caminho ? (
          <MoverPara
            nome={nome}
            grupo={grupo}
            aoMover={(destino) => {
              mover(caminho, destino)
              setMovendo(null)
            }}
            aoCriar={(nomeDoGrupo) => {
              criarGrupo(nomeDoGrupo, caminho)
              setMovendo(null)
            }}
          />
        ) : null}
      </div>
    )
  }

  return (
    <>
      <div className={styles.projetosTopo}>
        <span className={styles.sideLabel}>
          {t(projetos.length === 1 ? 'PROJETOS · {n} REPOSITÓRIO' : 'PROJETOS · {n} REPOSITÓRIOS', {
            n: projetos.length,
          })}
        </span>
        <button
          type="button"
          className={styles.novoGrupo}
          aria-label={t('Novo grupo')}
          title={t('Novo grupo')}
          onClick={() => setCriando(true)}
        >
          <FolderSimplePlus size={15} />
        </button>
      </div>

      <div className={styles.projects}>
        {criando ? (
          <CampoDeGrupo
            rotulo={t('Nome do novo grupo')}
            aoTerminar={(nome) => {
              if (nome) criarGrupo(nome)
              setCriando(false)
            }}
          />
        ) : null}

        {grupos.map((grupo) => {
          const armado = confirmando === grupo.id
          const vivos = agentesEm(grupo.projects)
          return (
            <div className={styles.grupo} key={grupo.id}>
              <div
                className={cx(
                  styles.grupoTopo,
                  sobre === grupo.id && (arrastandoGrupo ? styles.grupoAntes : styles.grupoDrop),
                )}
                {...receber(grupo.id, grupo.id, undefined, grupo.id)}
              >
                {renomeando === grupo.id ? (
                  <CampoDeGrupo
                    rotulo={t('Renomear {nome}', { nome: grupo.name })}
                    inicial={grupo.name}
                    aoTerminar={(nome) => {
                      if (nome) renomearGrupo(grupo.id, nome)
                      setRenomeando(null)
                    }}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.grupoBotao}
                      aria-expanded={!grupo.collapsed}
                      data-grupo-id={grupo.id}
                      title={t(
                        grupo.collapsed
                          ? 'Expandir · arraste para reordenar (Alt+↑↓)'
                          : 'Recolher · arraste para reordenar (Alt+↑↓)',
                      )}
                      onClick={() => alternarGrupo(grupo.id)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(ARRASTO_GRUPO, grupo.id)
                        e.dataTransfer.effectAllowed = 'move'
                        setArrastandoGrupo(grupo.id)
                      }}
                      onDragEnd={() => {
                        setArrastandoGrupo(null)
                        setSobre(null)
                      }}
                      // O caminho sem mouse: Alt+↑/↓ troca de lugar com o vizinho.
                      onKeyDown={(e) => {
                        if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
                        e.preventDefault()
                        const i = grupos.findIndex((g) => g.id === grupo.id)
                        if (e.key === 'ArrowUp' && i <= 0) return
                        if (e.key === 'ArrowDown' && i >= grupos.length - 1) return
                        reordenarGrupo(
                          grupo.id,
                          e.key === 'ArrowUp'
                            ? (grupos[i - 1]?.id ?? null)
                            : (grupos[i + 2]?.id ?? null),
                        )
                        // Mover o nó no DOM pode tirar o foco dele; quem está
                        // reordenando pelo teclado precisa continuar no grupo.
                        requestAnimationFrame(() =>
                          document
                            .querySelector<HTMLElement>(`[data-grupo-id="${CSS.escape(grupo.id)}"]`)
                            ?.focus(),
                        )
                      }}
                    >
                      {grupo.collapsed ? <CaretRight size={11} /> : <CaretDown size={11} />}
                      <span className={styles.grupoNome}>{grupo.name}</span>
                      <span className={styles.grupoConta}>{grupo.projects.length}</span>
                      {/* Recolhido, o grupo não pode esconder que há agente
                          trabalhando lá dentro. */}
                      {vivos > 0 ? (
                        <span
                          className={styles.projectAgents}
                          title={t(vivos === 1 ? '{n} agente aberto' : '{n} agentes abertos', {
                            n: vivos,
                          })}
                        >
                          {vivos}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className={styles.grupoAcao}
                      aria-label={t('Renomear o grupo {nome}', { nome: grupo.name })}
                      title={t('Renomear')}
                      onClick={() => setRenomeando(grupo.id)}
                    >
                      <PencilSimple size={11} color="var(--text-tertiary)" />
                    </button>
                    <button
                      type="button"
                      className={cx(styles.grupoAcao, armado && styles.grupoAcaoArmada)}
                      aria-label={
                        armado
                          ? t('Confirmar: apagar o grupo {nome}', { nome: grupo.name })
                          : t('Apagar o grupo {nome}', { nome: grupo.name })
                      }
                      title={
                        armado
                          ? t('Clique de novo — os projetos voltam para "Sem grupo"')
                          : t('Apagar o grupo')
                      }
                      onMouseLeave={() => setConfirmando(null)}
                      onBlur={() => setConfirmando(null)}
                      onClick={() => {
                        if (!armado) {
                          setConfirmando(grupo.id)
                          return
                        }
                        setConfirmando(null)
                        apagarGrupo(grupo.id)
                      }}
                    >
                      {armado ? (
                        <span className={styles.grupoConfirmar}>{t('APAGAR?')}</span>
                      ) : (
                        <X size={11} color="var(--text-tertiary)" />
                      )}
                    </button>
                  </>
                )}
              </div>

              {grupo.collapsed ? null : grupo.projects.length > 0 ? (
                <div className={styles.grupoCorpo}>
                  {grupo.projects.map((caminho) => cartao(caminho, grupo.id))}
                </div>
              ) : (
                <div
                  className={cx(styles.grupoVazio, sobre === grupo.id && styles.grupoDrop)}
                  {...receber(grupo.id, grupo.id)}
                >
                  {t('Arraste um projeto para cá, ou use a pasta no cartão dele.')}
                </div>
              )}
            </div>
          )
        })}

        {/* O cabeçalho só existe quando há grupo: sem nenhum, a lista é a de
            sempre, sem um rótulo a mais que não separaria nada. */}
        {grupos.length > 0 ? (
          <div
            className={cx(
              styles.grupoTopo,
              sobre === SEM_GRUPO && (arrastandoGrupo ? styles.grupoAntes : styles.grupoDrop),
            )}
            // Um grupo solto aqui vai para o fim: "Sem grupo" vem depois de todos.
            {...receber(SEM_GRUPO, null, undefined, null)}
          >
            <span className={styles.grupoSolto}>
              <span className={styles.grupoNome}>{t('Sem grupo')}</span>
              <span className={styles.grupoConta}>{soltos.length}</span>
            </span>
          </div>
        ) : null}
        {soltos.map((caminho) => cartao(caminho, null))}
      </div>

      <button type="button" className={styles.action} onClick={() => void escolher()}>
        <FolderPlus size={16} />
        {t('Adicionar projeto')}
      </button>
      <span className={styles.hint}>
        {t('Um clique no projeto abre um agente nele. Arraste cartões e grupos para organizar.')}
      </span>
    </>
  )
}

/** Campo de nome de grupo: Enter ou sair do campo confirma, Esc desiste. */
function CampoDeGrupo({
  rotulo,
  inicial = '',
  aoTerminar,
}: {
  rotulo: string
  inicial?: string
  /** Recebe o nome já aparado; vazio quer dizer "desistiu". */
  aoTerminar: (nome: string) => void
}) {
  const [nome, setNome] = useState(inicial)
  // Esc e o blur que vem depois dele chamariam `aoTerminar` duas vezes.
  const feito = useRef(false)
  const terminar = (valor: string) => {
    if (feito.current) return
    feito.current = true
    aoTerminar(valor.trim())
  }
  return (
    <input
      className={styles.grupoCampo}
      value={nome}
      placeholder={t('Nome do grupo — Jogos, Trabalho…')}
      aria-label={rotulo}
      maxLength={32}
      // biome-ignore lint/a11y/noAutofocus: o campo só existe depois do clique que o pediu
      autoFocus
      onChange={(e) => setNome(e.target.value)}
      onBlur={() => terminar(nome)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') terminar(nome)
        if (e.key === 'Escape') terminar('')
      }}
    />
  )
}

/**
 * A faixa "mover para", aberta pelo botão de pasta do cartão.
 *
 * É o caminho sem arrasto — teclado, ou quem não descobriu que o cartão
 * arrasta. Fica logo abaixo do cartão, dentro da lista, e não num balão: o
 * painel tem `transform` e a lista rola, e um balão seria cortado pelos dois.
 */
function MoverPara({
  nome,
  grupo,
  aoMover,
  aoCriar,
}: {
  nome: string
  grupo: string | null
  aoMover: (grupo: string | null) => void
  aoCriar: (nome: string) => void
}) {
  const grupos = useHalo((s) => s.claudeGroups)
  const [criando, setCriando] = useState(false)

  return (
    <fieldset className={styles.moverPara} aria-label={t('Mover {nome} para', { nome })}>
      {grupos.map((g) => (
        <button
          key={g.id}
          type="button"
          className={cx(styles.etiqueta, g.id === grupo && styles.etiquetaOn)}
          aria-pressed={g.id === grupo}
          onClick={() => aoMover(g.id)}
        >
          {g.name}
        </button>
      ))}
      {grupo !== null ? (
        <button type="button" className={styles.etiqueta} onClick={() => aoMover(null)}>
          {t('Sem grupo')}
        </button>
      ) : null}
      {criando ? (
        <CampoDeGrupo
          rotulo={t('Nome do novo grupo')}
          aoTerminar={(novo) => {
            if (novo) aoCriar(novo)
            else setCriando(false)
          }}
        />
      ) : (
        <button type="button" className={styles.etiqueta} onClick={() => setCriando(true)}>
          <Plus size={10} />
          {t('Novo grupo')}
        </button>
      )}
    </fieldset>
  )
}

/** Centro: a conversa do agente em foco. */
function ConversaPanel({
  agente,
  aoEnviar,
  aoAnexar,
  aoAnexarCaminhos,
}: {
  agente: Agent | null
  aoEnviar: (id: string, text: string, attachments?: Attachment[]) => void
  aoAnexar: () => Promise<Attachment[]>
  aoAnexarCaminhos: (paths: string[]) => Promise<Attachment[]>
}) {
  // A marca muda a cada evento do agente; é ela que rebusca a transcrição.
  const marca = agente ? `${agente.state}|${agente.turns}|${agente.lastAt}` : null
  const pathOf = usePathOf()
  const mensagens = useAgentMessages(agente?.id ?? null, marca)
  const [texto, setTexto] = useState('')
  const [anexos, setAnexos] = useState<Attachment[]>([])
  const fim = useRef<HTMLDivElement>(null)

  // Mensagem nova rola até o fim: ler o começo de uma conversa que já andou
  // não é o que se quer. A dependência é o TAMANHO da lista, e o Biome a vê
  // como supérflua porque o corpo não a lê — mas é ela que dispara a rolagem.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ver acima
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [mensagens.length])

  if (!agente) {
    return (
      <div className={styles.vazio}>
        <p className={styles.vazioTitulo}>{t('Nenhum agente aberto')}</p>
        <p className={styles.vazioTexto}>
          {t(
            'Clique num projeto à esquerda para abrir um. Cada agente é um Claude rodando dentro daquele repositório, e você conversa com ele aqui.',
          )}
        </p>
      </div>
    )
  }

  const enviar = () => {
    if (!texto.trim() && anexos.length === 0) return
    aoEnviar(agente.id, texto, anexos)
    setTexto('')
    setAnexos([])
  }

  /**
   * Colar imagem ou arquivo.
   *
   * A área de transferência traz os dois de formas diferentes: imagem copiada
   * de um editor vem como blob sem caminho, e arquivo copiado do gerenciador
   * vem com caminho. O Electron expõe o caminho em `File.path`, e é por ele
   * que o main lê o arquivo — mandar o blob inteiro pelo IPC seria pior.
   */
  const colar = async (evento: React.ClipboardEvent) => {
    const arquivos = [...(evento.clipboardData?.files ?? [])]
    if (arquivos.length === 0) return
    evento.preventDefault()

    const caminhos = (await Promise.all(arquivos.map(pathOf))).filter(
      (caminho) => caminho.length > 0,
    )
    if (caminhos.length === 0) return

    const lidos = await aoAnexarCaminhos(caminhos)
    setAnexos((atuais) => [...atuais, ...lidos])
  }

  return (
    <div className={styles.conversa}>
      <div className={styles.conversaTopo}>
        <span className={styles.conversaNome}>{agente.name}</span>
        <Estado agente={agente} />
      </div>

      <div className={styles.mensagens}>
        {agente.error ? (
          // O erro vem antes de tudo: sem isto a tela dizia "Agente pronto" com
          // o processo morto, e a mensagem digitada não ia para lugar nenhum.
          <p className={styles.erroTexto}>{agente.error}</p>
        ) : mensagens.length === 0 ? (
          <p className={styles.vazioTexto}>
            {t('Agente pronto. Peça alguma coisa — ele enxerga os arquivos deste projeto.')}
          </p>
        ) : (
          mensagens.map((mensagem) => <Mensagem key={mensagem.id} mensagem={mensagem} />)
        )}
        <div ref={fim} />
      </div>

      {anexos.length > 0 ? (
        <div className={styles.anexos}>
          {anexos.map((anexo) => (
            <span className={styles.anexo} key={anexo.path}>
              {anexo.kind === 'image' ? '🖼' : '📄'} {anexo.name}
              <button
                type="button"
                className={styles.anexoTirar}
                aria-label={t('Tirar {nome}', { nome: anexo.name })}
                onClick={() => setAnexos((a) => a.filter((x) => x.path !== anexo.path))}
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.entrada}>
        <button
          type="button"
          className={styles.anexar}
          aria-label={t('Anexar arquivo')}
          title={t('Anexar arquivo — ou cole uma imagem no campo')}
          disabled={agente.state === 'encerrado'}
          onClick={() => {
            void aoAnexar().then((lidos) => setAnexos((a) => [...a, ...lidos]))
          }}
        >
          <Paperclip size={15} />
        </button>
        <input
          className={styles.campo}
          value={texto}
          placeholder={t('Peça alguma coisa ao agente')}
          aria-label={t('Mensagem para o agente')}
          disabled={agente.state === 'encerrado'}
          onChange={(e) => setTexto(e.target.value)}
          onPaste={(e) => void colar(e)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') enviar()
          }}
        />
        <button
          type="button"
          className={styles.enviar}
          aria-label={t('Enviar')}
          disabled={(!texto.trim() && anexos.length === 0) || agente.state === 'encerrado'}
          onClick={enviar}
        >
          <PaperPlaneRight size={15} weight="fill" />
        </button>
      </div>
    </div>
  )
}

function Mensagem({ mensagem }: { mensagem: AgentMessage }) {
  if (mensagem.role === 'tool') {
    return (
      <div className={styles.ferramenta}>
        <span className={styles.ferramentaNome}>{mensagem.text}</span>
      </div>
    )
  }
  return (
    <div className={cx(styles.mensagem, styles[mensagem.role])}>
      <span className={styles.mensagemQuem}>
        {mensagem.role === 'user'
          ? t('VOCÊ')
          : mensagem.role === 'assistant'
            ? 'CLAUDE'
            : t('SISTEMA')}
      </span>
      {/* Só a resposta do agente é formatada: o que o usuário digitou é
          mostrado como ele escreveu. */}
      {mensagem.role === 'assistant' ? (
        <div className={styles.mensagemCorpo}>
          <Markdown fonte={mensagem.text} />
        </div>
      ) : (
        <p className={styles.mensagemTexto}>{mensagem.text}</p>
      )}
    </div>
  )
}

/**
 * Direita: o orbe do handoff, e a lista de agentes abaixo dele.
 *
 * O orbe fica — é a forma do protótipo, e o lugar do mascote que ainda vai
 * ser definido.
 */
function AgentesPanel({
  agentes,
  foco,
  aoFocar,
  aoFechar,
}: {
  agentes: Agent[]
  foco: string | null
  aoFocar: (id: string) => void
  aoFechar: (id: string) => void
}) {
  const trabalhando = agentes.filter((a) => a.state === 'pensando' || a.state === 'ferramenta')

  return (
    <>
      <Mascote agentes={agentes} />
      <div>
        <div className={styles.assistantName}>Claude</div>
        <div className={styles.assistantRole}>
          {agentes.length === 0
            ? t('NENHUM AGENTE')
            : trabalhando.length > 0
              ? t('{n} TRABALHANDO', { n: trabalhando.length })
              : t(agentes.length === 1 ? '{n} AGENTE' : '{n} AGENTES', { n: agentes.length })}
        </div>
      </div>

      <div className={styles.agentes}>
        {agentes.length === 0 ? (
          <span className={styles.hint}>
            {t(
              'Abra um agente clicando num projeto. Cada um é um terminal seu, com um Claude dentro.',
            )}
          </span>
        ) : (
          agentes.map((agente) => (
            <div className={styles.agenteRow} key={agente.id}>
              <button
                type="button"
                className={cx(styles.agente, agente.id === foco && styles.agenteOn)}
                onClick={() => aoFocar(agente.id)}
              >
                <span className={cx(styles.pulso, styles[`pulso_${agente.state}`])} />
                <span className={styles.agenteTexto}>
                  <span className={styles.agenteNome}>{agente.name}</span>
                  <span className={styles.agenteEstado}>{rotulo(agente)}</span>
                </span>
              </button>
              <button
                type="button"
                className={styles.projectRemove}
                aria-label={t('Encerrar {nome}', { nome: agente.name })}
                onClick={() => aoFechar(agente.id)}
              >
                <X size={11} color="var(--text-tertiary)" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className={styles.spacer} />
      <NovoAgente />
    </>
  )
}

function NovoAgente() {
  const projetos = useHalo((s) => s.claudeProjects)
  return (
    <span className={styles.hint}>
      {projetos.length === 0
        ? t('Adicione um projeto à esquerda para começar.')
        : t('Clique num projeto para abrir outro agente nele.')}
    </span>
  )
}

function Estado({ agente }: { agente: Agent }) {
  return (
    <span className={styles.estado}>
      <span className={cx(styles.pulso, styles[`pulso_${agente.state}`])} />
      {rotulo(agente)}
    </span>
  )
}

/** O status em uma frase curta. Vem dos eventos do CLI, não de suposição. */
function rotulo(agente: Agent): string {
  const nomes: Record<AgentState, string> = {
    iniciando: t('iniciando'),
    ocioso: t('pronto'),
    pensando: t('pensando'),
    ferramenta: agente.activity
      ? t('usando {ferramenta}', { ferramenta: agente.activity })
      : t('usando ferramenta'),
    erro: t('erro'),
    encerrado: t('encerrado'),
  }
  return nomes[agente.state]
}

/**
 * As conversas antigas de um projeto, num modal.
 *
 * Era um balão ancorado no cartão, e ficava cortado: o painel tem 300px de
 * largura e a lista não cabia. O modal cobre o palco inteiro, então o título de
 * uma conversa longa aparece por completo — que é justamente o que faz escolher
 * entre elas ser possível.
 *
 * `position: fixed` aqui se ancora no palco, e não na tela: o palco tem
 * `transform`, e no CSS isso torna o elemento fixo relativo a ele. É o que
 * mantém o modal alinhado ao app quando a janela é redimensionada.
 */
function SessoesModal({
  project,
  aoRetomar,
  aoFechar,
}: {
  project: string
  aoRetomar: (sessao: string) => void
  aoFechar: () => void
}) {
  const sessoes = useSessions(project)
  const nome = project.split('/').filter(Boolean).at(-1) ?? project

  const fechar = useRef<HTMLButtonElement>(null)

  // Esc fecha, como em qualquer janela: sair só pelo × seria uma armadilha.
  //
  // E o FOCO: ao abrir, ele vai para o × do modal; ao fechar, volta para onde
  // estava. Sem isso o teclado continuava lá atrás, na tela por baixo — quem
  // abre o modal por teclado tabulava pelo app inteiro antes de chegar no que
  // acabou de abrir, e ao fechar caía no começo da página.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    fechar.current?.focus()

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      anterior?.focus?.()
    }
  }, [aoFechar])

  return (
    <div className={styles.modalFundo} data-halo-modal>
      {/* O véu é um botão para fechar clicando fora — comportamento que todo
          modal tem, e que ninguém procura no teclado. Por isso ele SAI do Tab:
          o comentário já dizia isso e o código não fazia. */}
      <button
        type="button"
        className={styles.modalVeu}
        aria-label={t('Fechar')}
        aria-hidden="true"
        tabIndex={-1}
        onClick={aoFechar}
      />

      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t('Conversas antigas de {nome}', { nome })}
      >
        <div className={styles.modalTopo}>
          <div className={styles.modalTitulos}>
            <span className={styles.modalEyebrow}>{t('CONVERSAS ANTIGAS')}</span>
            <span className={styles.modalNome}>{nome}</span>
          </div>
          <button
            type="button"
            ref={fechar}
            className={styles.modalFechar}
            aria-label={t('Fechar')}
            onClick={aoFechar}
          >
            <X size={13} />
          </button>
        </div>

        <div className={styles.modalCorpo}>
          {sessoes.length === 0 ? (
            <p className={styles.modalVazio}>
              {t(
                'Nenhuma conversa neste projeto ainda. Abra um agente e converse — ela aparece aqui depois.',
              )}
            </p>
          ) : (
            sessoes.map((sessao) => (
              <button
                type="button"
                className={styles.sessao}
                key={sessao.id}
                onClick={() => aoRetomar(sessao.id)}
              >
                <span className={styles.sessaoTitulo}>{sessao.title}</span>
                <span className={styles.sessaoMeta}>
                  {new Date(sessao.at).toLocaleDateString(localeDoIdioma(), {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' · '}
                  {t('{n} linhas', { n: sessao.messages })}
                </span>
              </button>
            ))
          )}
        </div>

        {sessoes.length > 0 ? (
          <span className={styles.modalRodape}>
            {t('Clicar numa conversa abre um agente retomando de onde ela parou.')}
          </span>
        ) : null}
      </div>
    </div>
  )
}
