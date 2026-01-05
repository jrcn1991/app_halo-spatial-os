import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/icons/ArrowCounterClockwise'
import { ArrowsClockwise } from '@phosphor-icons/react/dist/icons/ArrowsClockwise'
import { rgbToHex } from '@shared/color'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { useAjuste, useValoresDoAmbiente } from '@/app/environment'
import { type SettingsSection, useHalo } from '@/store/useHalo'
import { ENTRANCE_HINTS, entranceTiming } from '@/styles/entrances'
import { Panel } from '@/ui/Panel'
import { PanelRow } from '@/ui/PanelRow'
import styles from './SettingsScreen.module.css'
import { AboutSection } from './settings/AboutSection'
import { AnimationSection } from './settings/AnimationSection'
import { AppearanceSection, CONTENT_ENTRANCE, DOCK, NAVIGATION } from './settings/AppearanceSection'
import { ClaudeSection } from './settings/ClaudeSection'
import { EnvironmentSection } from './settings/EnvironmentSection'
import { IslandSection } from './settings/IslandSection'
import { LauncherSection } from './settings/LauncherSection'
import { MediaSection } from './settings/MediaSection'
import { MusicSection } from './settings/MusicSection'
import { NewsSection } from './settings/NewsSection'
import { NotificacoesSection } from './settings/NotificacoesSection'
import { SeafileSection } from './settings/SeafileSection'
import { SystemSection } from './settings/SystemSection'
import { WidgetsSection } from './settings/WidgetsSection'
import { WindowSection } from './settings/WindowSection'

/**
 * Tela de Configurações — não existe no handoff.
 *
 * Geometria emprestada das telas de três painéis (Claude, Lab, Media): mesma
 * perspectiva, mesmos ângulos de repouso, mesmas medidas. É o que a mantém
 * dentro da linguagem em vez de parecer um enxerto.
 */

const SECTIONS: readonly { id: SettingsSection; label: string }[] = [
  { id: 'animation', label: 'Animação' },
  { id: 'appearance', label: 'Aparência' },
  { id: 'environment', label: 'Ambiente' },
  { id: 'window', label: 'Janela' },
  { id: 'widgets', label: 'Widgets' },
  { id: 'media', label: 'Mídia' },
  { id: 'claude', label: 'Claude' },
  { id: 'island', label: 'Ilha' },
  { id: 'launcher', label: 'Lançador' },
  { id: 'notificacoes', label: 'Notificações' },
  { id: 'seafile', label: 'Seafile' },
  { id: 'music', label: 'Música' },
  { id: 'news', label: 'Notícias' },
  { id: 'system', label: 'Sistema' },
  { id: 'about', label: 'Sobre' },
]

export function SettingsScreen() {
  const section = useHalo((s) => s.settingsSection)
  const setSection = useHalo((s) => s.setSettingsSection)

  return (
    <PanelRow gap={22} perspective={2400} padding="44px 40px 130px">
      <Panel
        variant="side"
        w={300}
        h={650}
        radius={28}
        padding="22px 16px"
        gap={18}
        rest="rotateY(17deg) translateZ(-50px)"
        fromX={150}
      >
        <div className={styles.header}>
          <span className={styles.eyebrow}>Halo</span>
          <span className={styles.title}>Configurações</span>
        </div>
        <div className={styles.divider} />
        <nav className={styles.nav} aria-label="Seções">
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? 'page' : undefined}
              className={
                section === id ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
              }
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </Panel>

      {/* Sem `padding` no painel: em content-box ele somaria à altura de 660 e
          o painel desceria por baixo do dock. Os centrais das outras telas
          também não têm — quem cuida do respiro é o miolo. */}
      <Panel variant="center" w={690} h={660} radius={28} overflow="hidden">
        <div className={styles.body}>
          {section === 'animation' ? (
            <AnimationSection />
          ) : section === 'appearance' ? (
            <AppearanceSection />
          ) : section === 'environment' ? (
            <EnvironmentSection />
          ) : section === 'window' ? (
            <WindowSection />
          ) : section === 'widgets' ? (
            <WidgetsSection />
          ) : section === 'media' ? (
            <MediaSection />
          ) : section === 'claude' ? (
            <ClaudeSection />
          ) : section === 'island' ? (
            <IslandSection />
          ) : section === 'launcher' ? (
            <LauncherSection />
          ) : section === 'notificacoes' ? (
            <NotificacoesSection />
          ) : section === 'seafile' ? (
            <SeafileSection />
          ) : section === 'music' ? (
            <MusicSection />
          ) : section === 'system' ? (
            <SystemSection />
          ) : section === 'about' ? (
            <AboutSection />
          ) : (
            <NewsSection />
          )}
        </div>
      </Panel>

      <Panel
        variant="side"
        w={290}
        h={640}
        radius={28}
        padding="22px 18px"
        gap={16}
        rest="rotateY(-17deg) translateZ(-50px)"
        fromX={-150}
      >
        {section === 'animation' ? <EntrancePreview /> : <AppearanceStatus />}
      </Panel>
    </PanelRow>
  )
}

/** Prévia da entrada selecionada: tempos lidos do próprio handoff. */
function EntrancePreview() {
  // O AJUSTE e a ENTRADA ATIVA são coisas diferentes aqui, e a tela mostra as
  // duas: ajuste ausente é o que o botão de restaurar devolve, e a entrada
  // ativa é o que se vê na tela.
  const ajuste = useAjuste()
  const { entrada: entrance } = useValoresDoAmbiente()
  const replay = useHalo((s) => s.replay)
  const reset = useHalo((s) => s.resetEntrance)
  const timing = entranceTiming(entrance)
  const doAmbiente = ajuste.entrance === undefined

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{doAmbiente ? 'Preset do ambiente' : 'Selecionada'}</span>
        <span className={styles.previewName}>{entrance}</span>
      </div>
      <span className={styles.previewHint}>{ENTRANCE_HINTS[entrance]}</span>
      <div className={styles.card} data-halo-cartao="mini">
        <div className={styles.metric}>
          Centro<span className={styles.metricValue}>{timing.centro}</span>
        </div>
        <div className={styles.metric}>
          Laterais<span className={styles.metricValue}>{timing.laterais}</span>
        </div>
        <div className={styles.metric}>
          Atraso<span className={styles.metricValue}>{timing.atraso}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.replay} onClick={replay}>
          <ArrowsClockwise size={17} />
          Ver de novo
        </button>
        <button
          type="button"
          className={`${styles.replay} ${styles.secondary}`}
          onClick={reset}
          disabled={doAmbiente}
          // Desligado já significa "está no preset"; o título diz o porquê
          // para quem passa o mouse, que é onde a explicação cabe.
          title={
            doAmbiente
              ? 'Já está no preset deste ambiente'
              : 'Volta ao preset do ambiente ativo, seja ele qual for'
          }
        >
          <ArrowCounterClockwise size={17} />
          Restaurar padrão
        </button>
      </div>
    </>
  )
}

/** Resumo do que está escolhido, e a volta ao padrão do handoff. */
function AppearanceStatus() {
  const { tint, dock, navigation } = useHalo((s) => s.appearance)
  const reset = useHalo((s) => s.resetAppearance)
  const ajuste = useAjuste()
  // O resumo mostra o que VALE na tela: o ajuste ausente é "automático", e
  // imprimir a ausência deixaria a linha em branco.
  const { transicao, transparencia, claridade } = useValoresDoAmbiente()
  const isDefault =
    ajuste.transparency === undefined &&
    ajuste.clarity === undefined &&
    ajuste.contentEntrance === undefined &&
    tint.on === DEFAULT_SETTINGS.appearance.tint.on &&
    rgbToHex(tint.rgb) === rgbToHex(DEFAULT_SETTINGS.appearance.tint.rgb) &&
    dock === DEFAULT_SETTINGS.appearance.dock &&
    navigation === DEFAULT_SETTINGS.appearance.navigation

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Ajustes</span>
        <span className={styles.previewName}>{isDefault ? 'No padrão' : 'Ajustado'}</span>
      </div>
      <span className={styles.previewHint}>
        O padrão reproduz o protótipo do handoff exatamente. Sair dele é sempre um desvio consciente
        — e o botão abaixo volta.
      </span>
      <div className={styles.card} data-halo-cartao="mini">
        <div className={styles.metric}>
          Transparência<span className={styles.metricValue}>{Math.round(transparencia)}%</span>
        </div>
        <div className={styles.metric}>
          Claridade<span className={styles.metricValue}>{Math.round(claridade)}%</span>
        </div>
        <div className={styles.metric}>
          Cor do vidro
          <span className={styles.metricValue}>
            {tint.on ? rgbToHex(tint.rgb).toUpperCase() : 'Desligada'}
          </span>
        </div>
        <div className={styles.metric}>
          Navegação
          <span className={styles.metricValue}>
            {NAVIGATION.find((o) => o.value === navigation)?.short}
          </span>
        </div>
        {navigation === 'embedded' ? (
          <div className={styles.metric}>
            Conteúdo
            <span className={styles.metricValue}>
              {CONTENT_ENTRANCE.find((o) => o.value === transicao)?.label}
            </span>
          </div>
        ) : null}
        <div className={styles.metric}>
          Dock
          <span className={styles.metricValue}>{DOCK.find((o) => o.value === dock)?.label}</span>
        </div>
      </div>
      <button
        type="button"
        className={`${styles.replay} ${styles.secondary}`}
        onClick={reset}
        disabled={isDefault}
      >
        <ArrowCounterClockwise size={17} />
        Restaurar padrão
      </button>
    </>
  )
}
