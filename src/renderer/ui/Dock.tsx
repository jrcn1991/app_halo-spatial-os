// Import por ícone (não pelo barrel): o barrel arrasta os ~9k ícones do pacote.
import type { Icon } from '@phosphor-icons/react'
import { CaretDoubleLeft } from '@phosphor-icons/react/dist/icons/CaretDoubleLeft'
import { CaretDoubleRight } from '@phosphor-icons/react/dist/icons/CaretDoubleRight'
import { Folders } from '@phosphor-icons/react/dist/icons/Folders'
import { Gear } from '@phosphor-icons/react/dist/icons/Gear'
import { House } from '@phosphor-icons/react/dist/icons/House'
import { MonitorPlay } from '@phosphor-icons/react/dist/icons/MonitorPlay'
import { MusicNotes } from '@phosphor-icons/react/dist/icons/MusicNotes'
import { Palette } from '@phosphor-icons/react/dist/icons/Palette'
import { Pulse } from '@phosphor-icons/react/dist/icons/Pulse'
import { Sparkle } from '@phosphor-icons/react/dist/icons/Sparkle'
import { marcar, t } from '@shared/i18n'
import { type Screen, useHalo } from '@/store/useHalo'
import { cx } from './cx'
import styles from './Dock.module.css'

/** `label` é a chave em português: quem desenha passa por `t(label)`. */
export type DockItem = { screen: Screen; icon: Icon; label: string; size?: number }

/** A ordem do dock. Exportada porque Configurações lista as mesmas telas. */
export const DOCK_ITEMS: DockItem[] = [
  { screen: 'home', icon: House, label: 'Home' },
  // O id continua `social` — ele está no `hiddenScreens` de quem já escondeu
  // ou mostrou esta tela, na baseline do layout e em quatro ferramentas. O que
  // virou "Social Arte" é o rótulo, e o ícone acompanha: a área agrega
  // referências criativas, não pessoas.
  { screen: 'social', icon: Palette, label: marcar('Social Arte') },
  { screen: 'claude', icon: Sparkle, label: 'Claude' },
  { screen: 'files', icon: Folders, label: marcar('Arquivos') },
  { screen: 'lab', icon: Pulse, label: 'Home Lab' },
  { screen: 'media', icon: MonitorPlay, label: 'Media' },
  // O protótipo usa 25px só neste ícone.
  { screen: 'music', icon: MusicNotes, label: marcar('Música'), size: 25 },
  // Divergência do protótipo: no lugar do avatar, a entrada de Configurações.
  { screen: 'settings', icon: Gear, label: marcar('Configurações') },
]

/**
 * Fonte única dos dois modos de navegação: os itens visíveis, na ordem do
 * dock. Flutuante ou embutida, a lista e as ações são estas.
 */
export function useDockItems(): DockItem[] {
  const hidden = useHalo((s) => s.hiddenScreens)
  return DOCK_ITEMS.filter((item) => !hidden.includes(item.screen))
}

/**
 * Larguras da coluna embutida, em px do palco: recolhida (só ícones) e
 * expandida (ícone + nome). `Panel` desconta a mesma medida do painel central,
 * então o conteúdo começa sempre à direita da coluna.
 */
export const RAIL_WIDTH = { collapsed: 64, expanded: 188 } as const

/** O dock flutuante do handoff. Embutida a navegação, ele não existe. */
export function Dock() {
  const screen = useHalo((s) => s.screen)
  const setScreen = useHalo((s) => s.setScreen)
  const position = useHalo((s) => s.appearance.dock)
  const navigation = useHalo((s) => s.appearance.navigation)
  const items = useDockItems()
  const vertical = position === 'left' || position === 'right'

  if (navigation === 'embedded') return null

  return (
    <nav
      className={`${styles.dock} ${styles[position]}`}
      aria-label={t('Telas')}
      // Âncora neutra para `useWindowHandle`: o aria-label muda com o idioma.
      data-halo-nav
      data-halo-in={vertical ? 'dock-vertical' : 'dock'}
    >
      {items.map(({ screen: target, icon: Glyph, label, size }) => {
        const active = screen === target
        return (
          <button
            key={target}
            type="button"
            aria-label={t(label)}
            // O leitor de tela já tinha o nome pelo `aria-label`; quem enxerga
            // não tinha nada — oito ícones sem legenda, e três deles (o leque,
            // o pulso, a faísca) não dizem sozinhos que tela são.
            title={t(label)}
            aria-current={active ? 'page' : undefined}
            // Atributo NEUTRO, para um tema saber QUAL tela é este botão sem
            // depender do rótulo em português nem do nome que o CSS Modules
            // gera. O BioShock o usa para trocar o glifo do Phosphor pelo
            // desenho déco dele; a Floresta não o lê, e nada muda para ela.
            data-halo-tela={target}
            className={active ? `${styles.item} ${styles.active}` : styles.item}
            onClick={() => setScreen(target)}
          >
            <Glyph size={size ?? 26} weight={active ? 'fill' : 'regular'} color="currentColor" />
          </button>
        )
      })}
      <span className={styles.handle} data-window-handle title={t('Arraste para mover a janela')} />
    </nav>
  )
}

/**
 * A navegação embutida: uma coluna de vidro na borda esquerda interna do
 * painel central, com os mesmos itens e as mesmas ações do dock flutuante.
 *
 * Nasce recolhida (só ícones); a seta do rodapé expande e mostra os nomes.
 * Quem a monta é o `Panel` central de cada tela — é por isso que ela tem o
 * mesmo raio de canto do painel e é remontada junto dele. O traço de mover a
 * janela vem junto, pelo mesmo motivo do dock: sem ele não haveria como
 * arrastar a janela.
 */
export function DockRail() {
  const screen = useHalo((s) => s.screen)
  const setScreen = useHalo((s) => s.setScreen)
  const expanded = useHalo((s) => s.dockExpanded)
  const toggle = useHalo((s) => s.toggleDockExpanded)
  const items = useDockItems()
  const Caret = expanded ? CaretDoubleLeft : CaretDoubleRight

  return (
    <nav
      className={cx(styles.rail, expanded && styles.railExpanded)}
      aria-label={t('Telas')}
      // Âncora neutra para `useWindowHandle`: o aria-label muda com o idioma.
      data-halo-nav
    >
      {items.map(({ screen: target, icon: Glyph, label, size }) => {
        const active = screen === target
        return (
          <button
            key={target}
            type="button"
            aria-label={t(label)}
            // Recolhida, o nome só existe no tooltip.
            title={expanded ? undefined : t(label)}
            aria-current={active ? 'page' : undefined}
            data-halo-tela={target}
            className={cx(styles.railItem, active && styles.railActive)}
            onClick={() => setScreen(target)}
          >
            <span className={styles.railGlyph}>
              <Glyph size={size ?? 26} weight={active ? 'fill' : 'regular'} color="currentColor" />
            </span>
            <span className={styles.railLabel} aria-hidden="true">
              {t(label)}
            </span>
          </button>
        )
      })}
      <span
        className={styles.railHandle}
        data-window-handle
        title={t('Arraste para mover a janela')}
      />
      {/* Depois dos itens de propósito: as ferramentas de verificação (e os
          atalhos numéricos) contam os botões do dock pela ordem. */}
      <button
        type="button"
        className={styles.railToggle}
        aria-expanded={expanded}
        aria-label={expanded ? t('Recolher a navegação') : t('Expandir a navegação')}
        title={expanded ? t('Recolher') : t('Expandir')}
        onClick={toggle}
      >
        <Caret size={18} color="currentColor" />
      </button>
    </nav>
  )
}
