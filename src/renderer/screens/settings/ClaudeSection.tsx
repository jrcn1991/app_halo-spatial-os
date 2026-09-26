import { PERMISSION_MODES, type PermissionMode } from '@shared/agents'
import { marcar, t } from '@shared/i18n'
import { idlePool, MASCOT_LIVELINESS, type MascotLiveliness } from '@shared/mascot'
import { useEffect, useState } from 'react'
import { useAgentTools } from '@/hooks/useAgents'
import { useMascotInfo, useMascotLibrary } from '@/hooks/useMascot'
import { useHalo } from '@/store/useHalo'
import { Tabs } from '@/ui/Tabs'
import { Toggle } from '@/ui/Toggle'
import styles from '../SettingsScreen.module.css'

/**
 * Claude — o quanto os agentes podem fazer.
 *
 * Um agente roda dentro de um repositório do usuário, com acesso aos arquivos
 * dele. Quanto ele pode mexer é decisão dele, não padrão nosso: nasce em
 * `plan`, que só lê e propõe.
 *
 * O modo vale para agentes NOVOS. O CLI recebe o modo no arranque do processo,
 * então quem já está de pé continua com o que tinha — dizer o contrário seria
 * mentir sobre o que está rodando.
 */
/** Os três níveis de agitação, na ordem do mais contido ao mais mexido. */
const AGITACAO: Record<MascotLiveliness, string> = {
  calmo: marcar('Calmo'),
  normal: marcar('Normal'),
  animado: marcar('Animado'),
}

const MODOS: Record<PermissionMode, { label: string; explica: string }> = {
  plan: {
    label: marcar('Só ler'),
    explica: marcar(
      'O agente lê o projeto, estuda e propõe — não altera arquivo nem roda comando. É o padrão, e o mais seguro.',
    ),
  },
  acceptEdits: {
    label: marcar('Editar'),
    explica: marcar(
      'O agente altera arquivos do projeto sem perguntar. Use em repositório versionado, onde dá para conferir o diff e voltar atrás.',
    ),
  },
  bypassPermissions: {
    label: marcar('Tudo'),
    explica: marcar(
      'O agente altera arquivos e roda comandos sem perguntar nada. Só faz sentido em projeto descartável ou com backup — nada aqui vai perguntar antes.',
    ),
  },
}

export function ClaudeSection() {
  const mode = useHalo((s) => s.claudeMode)
  const { setMode: pedirModo } = useAgentTools()
  const setMode = useHalo((s) => s.setClaudeMode)
  const projetos = useHalo((s) => s.claudeProjects)
  const grupos = useHalo((s) => s.claudeGroups)

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{t('Claude · Agentes')}</span>
        <span className={styles.title}>{t('O que os agentes podem fazer')}</span>
        <span className={styles.subtitle}>
          {t(
            'Cada agente é um Claude rodando dentro de um projeto seu, com acesso aos arquivos dele.',
          )}
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Permissão')}</span>
        <Tabs
          label={t('Permissão dos agentes')}
          options={PERMISSION_MODES.map((valor) => ({
            value: valor,
            label: t(MODOS[valor].label),
          }))}
          value={mode}
          // Quem grava é o main, e subir o modo passa por uma confirmação do
          // sistema: a tela mostra o que ficou valendo, não o que pediu.
          onChange={(proximo) =>
            void pedirModo(proximo as PermissionMode).then((valeu) => setMode(valeu))
          }
        />
        <span className={styles.note}>{t(MODOS[mode].explica)}</span>
        <span className={styles.note}>
          {t(
            'Vale para agentes novos. Os que já estão abertos seguem com a permissão que receberam ao nascer — o modo é dado ao processo no arranque.',
          )}
        </span>
      </div>

      <ProgramaClaude />

      <MascoteConfig />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Projetos')}</span>
        <span className={styles.note}>
          {projetos.length === 0
            ? t('Nenhum projeto fixado. Adicione na tela do Claude.')
            : grupos.length > 0
              ? t(
                  projetos.length === 1
                    ? grupos.length === 1
                      ? '{n} projeto fixado e {g} grupo, geridos na própria tela do Claude.'
                      : '{n} projeto fixado e {g} grupos, geridos na própria tela do Claude.'
                    : grupos.length === 1
                      ? '{n} projetos fixados e {g} grupo, geridos na própria tela do Claude.'
                      : '{n} projetos fixados e {g} grupos, geridos na própria tela do Claude.',
                  { n: projetos.length, g: grupos.length },
                )
              : t(
                  projetos.length === 1
                    ? '{n} projeto fixado, gerido na própria tela do Claude.'
                    : '{n} projetos fixados, geridos na própria tela do Claude.',
                  { n: projetos.length },
                )}
        </span>
      </div>
    </>
  )
}

/**
 * Onde está o programa `claude`.
 *
 * O app é aberto pelo menu, e daí ele não herda o PATH que o shell montaria:
 * `~/.local/bin` costuma ficar de fora. O app procura sozinho nos lugares
 * conhecidos (incluindo bun, volta, nvm, fnm e asdf) e só precisa desta tela
 * quando o CLI está num lugar que ninguém adivinha. Vazio = procurar sozinho.
 */
function ProgramaClaude() {
  const cli = useHalo((s) => s.claudeCli)
  const setCli = useHalo((s) => s.setClaudeCli)
  const { chooseCli } = useAgentTools()

  const escolher = async () => {
    const caminho = await chooseCli()
    if (caminho) setCli(caminho)
  }

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>{t('Programa')}</span>
      <div className={styles.linha}>
        <span className={styles.linhaTexto}>
          <span className={styles.linhaTitulo}>{t('Claude Code (comando claude)')}</span>
          <span className={styles.linhaDetalhe}>
            {cli || t('procurando sozinho nos lugares conhecidos')}
          </span>
        </span>
        <button
          type="button"
          className={styles.acao}
          onClick={() => void escolher()}
          aria-label={t('Escolher o programa claude')}
        >
          {t('Escolher')}
        </button>
        {cli ? (
          <button
            type="button"
            className={styles.acao}
            onClick={() => setCli('')}
            aria-label={t('Voltar a procurar o programa claude sozinho')}
          >
            {t('Automático')}
          </button>
        ) : null}
      </div>
      <span className={styles.note}>
        {t(
          'Só aponte um caminho se a tela do Claude disser que não encontrou o programa. Ele vale para agentes novos — os que já estão abertos seguem com o que receberam ao nascer.',
        )}
      </span>
    </div>
  )
}

/**
 * O mascote.
 *
 * Personagens do Microsoft Agent (`.acs`) — os Genie e Clippy do Windows
 * antigo — no lugar do orbe, reagindo ao que os agentes fazem. Sem personagem
 * escolhido o orbe continua: a tela nunca fica com um buraco.
 */
/** Acervo público dos personagens clássicos do Microsoft Agent (`.acs`). */
const AGENTES_CLASSICOS = 'https://tmafe.com/classic-ms-agents/'

function MascoteConfig() {
  const file = useHalo((s) => s.mascotFile)
  const on = useHalo((s) => s.mascotOn)
  const setMascot = useHalo((s) => s.setMascot)
  const { info, reload: recarregarInfo } = useMascotInfo()
  const { lista, reload: recarregarLista, preview, choose } = useMascotLibrary()
  const [amostras, setAmostras] = useState<Record<string, string>>({})
  const liveliness = useHalo((s) => s.mascotLiveliness)
  const ociosas = info?.ready ? idlePool(info.animations, Object.values(info.moods)).length : 0

  const recarregar = () => {
    recarregarInfo()
    recarregarLista()
  }

  // As amostras são caras (decodificar o arquivo inteiro para tirar um quadro),
  // então vêm uma a uma, e só as que ainda não vieram.
  useEffect(() => {
    for (const escolha of lista) {
      if (amostras[escolha.file]) continue
      void preview(escolha.file)
        .then((png) => setAmostras((atuais) => ({ ...atuais, [escolha.file]: png })))
        .catch(() => undefined)
    }
  }, [lista, amostras, preview])

  const escolher = (caminho: string) => {
    setMascot({ file: caminho, on: true })
    // O personagem mudou: as animações também, então a informação é refeita.
    setTimeout(recarregar, 700)
  }

  const adicionar = async () => {
    const caminho = await choose()
    if (caminho) escolher(caminho)
  }

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>{t('Mascote')}</span>
      <div className={styles.stack}>
        <Toggle
          label={t('Usar um personagem no lugar do orbe')}
          checked={on}
          onChange={() => setMascot({ on: !on })}
        />
      </div>

      {/* A escolha é visual: nome de arquivo não diz quem é o personagem. */}
      <div className={styles.personagens}>
        {lista.map((escolha) => (
          <button
            key={escolha.file}
            type="button"
            className={`${styles.personagem} ${escolha.file === file ? styles.personagemOn : ''}`}
            aria-pressed={escolha.file === file}
            onClick={() => escolher(escolha.file)}
          >
            {amostras[escolha.file] ? (
              <img className={styles.personagemArte} src={amostras[escolha.file]} alt="" />
            ) : (
              <span className={styles.personagemArte} />
            )}
            <span className={styles.personagemNome}>{escolha.name}</span>
          </button>
        ))}
      </div>

      <span className={styles.note}>
        {info?.ready
          ? t('{nome}: {n} animações, {w}×{h}.', {
              nome: info.name,
              n: info.animations.length,
              w: info.width,
              h: info.height,
            })
          : info?.error
            ? t('Não consegui ler o personagem: {erro}', { erro: info.error })
            : file
              ? t('Lendo o personagem…')
              : t('Nenhum escolhido — o orbe do handoff continua.')}
      </span>

      {info?.ready ? (
        <>
          <span className={styles.note}>
            {t('Pensando')}: {info.moods.pensando ?? '—'} · {t('Ferramenta')}:{' '}
            {info.moods.ferramenta ?? '—'} · {t('Erro')}: {info.moods.erro ?? '—'} ·{' '}
            {t('Turno pronto')}: {info.moods.comemorando ?? '—'}
          </span>

          <span className={styles.sectionLabel}>{t('Agitação quando está parado')}</span>
          <Tabs
            label={t('Agitação do mascote')}
            options={MASCOT_LIVELINESS.map((v) => ({ value: v, label: t(AGITACAO[v]) }))}
            value={liveliness}
            onChange={(proxima) => setMascot({ liveliness: proxima as MascotLiveliness })}
          />
          <span className={styles.note}>
            {t(
              'Sem trabalho, ele faz alguma coisa sozinho de tempos em tempos — sorteada entre as {n} animações que este personagem tem e que não estão reservadas a um estado.',
              { n: ociosas },
            )}
          </span>
        </>
      ) : null}

      <div className={styles.stack}>
        <button
          type="button"
          className={`${styles.replay} ${styles.secondary}`}
          onClick={() => void adicionar()}
        >
          {t('Adicionar outro personagem')}
        </button>
      </div>
      <span className={styles.note}>
        {t(
          'Arquivos `.acs` do Microsoft Agent. O escolhido é copiado para a sua biblioteca, e o app decodifica o formato binário direto — imagens, paleta e a compressão própria da Microsoft.',
        )}
      </span>

      {/* `<a target="_blank">`, como em Sobre: o main manda o endereço para o
          navegador do sistema (só http(s)). O app não baixa nada de lá — o
          usuário baixa e traz pelo botão acima. */}
      <div className={styles.linha}>
        <span className={styles.linhaTexto}>
          <span className={styles.linhaTitulo}>{t('Agentes mascotes disponíveis')}</span>
          <span className={styles.linhaDetalhe}>tmafe.com/classic-ms-agents</span>
        </span>
        <a
          className={styles.acao}
          href={AGENTES_CLASSICOS}
          target="_blank"
          rel="noreferrer"
          aria-label={t('Abrir a lista de agentes mascotes no navegador')}
        >
          {t('Abrir')}
        </a>
      </div>
    </div>
  )
}
