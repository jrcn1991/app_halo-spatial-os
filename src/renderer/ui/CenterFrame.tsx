import { createContext, useContext } from 'react'
import { useHalo } from '@/store/useHalo'
import styles from './CenterFrame.module.css'
import { cx } from './cx'
import { DockRail, RAIL_WIDTH } from './Dock'
import panelStyles from './Panel.module.css'

/**
 * A moldura do painel central no modo de navegação embutida.
 *
 * Com a coluna dentro do painel central, remontar o painel a cada troca de
 * tela fazia a moldura inteira (coluna junto) surgir de novo, e cada tela
 * trazia o painel no SEU tamanho. Aqui a moldura é uma só, persistente, fora
 * da subárvore que o `App` remonta por tela: ela entra uma vez, fica parada, e
 * as telas só trocam o miolo — `Panel` (variant `center`) manda o conteúdo
 * para cá por portal e deixa na linha um fantasma do mesmo tamanho, para os
 * painéis laterais se arrumarem em volta.
 */

/**
 * Medidas EXTERNAS da moldura (o fio de 1px de borda já dentro), em px do
 * palco. 672 é a altura do maior painel central do handoff (Arquivos, Lab e
 * Mídia, 670 + borda) e, como largura, a que cabe em sete das oito telas sem
 * encolher os laterais — só Social, cujo centro é o mais estreito, tem o
 * lateral direito apertado em ~45px. `top` 71 é onde esses painéis mais altos
 * já ficavam; a base sobra a 743, acima da barra de transporte da Música.
 */
export const CENTER_FRAME = { w: 672, h: 672, top: 71, bottom: 900 - 71 - 672, radius: 30 } as const

/** Respiro entre a coluna e o conteúdo, além do padding que cada tela declara. */
export const RAIL_GAP = 10

/** O nó onde o conteúdo do painel central é montado. Nulo fora do modo embutido. */
export const CenterFrameContext = createContext<HTMLDivElement | null>(null)
export const useCenterFrame = () => useContext(CenterFrameContext)

export function CenterFrame({ onMount }: { onMount: (el: HTMLDivElement | null) => void }) {
  const expanded = useHalo((s) => s.dockExpanded)
  const rail = (expanded ? RAIL_WIDTH.expanded : RAIL_WIDTH.collapsed) + RAIL_GAP

  return (
    <div
      className={cx(panelStyles.panel, panelStyles.center, styles.frame)}
      style={{
        position: 'absolute',
        width: CENTER_FRAME.w - 2,
        height: CENTER_FRAME.h - 2,
        top: CENTER_FRAME.top,
        left: `calc(50% - ${CENTER_FRAME.w / 2}px)`,
        // Ver `Panel.tsx`: o raio do handoff é o padrão de um token.
        borderRadius: `var(--panel-radius, ${CENTER_FRAME.radius}px)`,
      }}
      data-halo-in="center"
      // A moldura persistente não recorta (`overflow: visible`, em
      // `CenterFrame.module.css`): quem recorta é o nó do miolo, com o
      // `overflow` que a tela declarou. Ver `data-halo-recorte` em `Panel`.
      data-halo-recorte="visible"
    >
      <DockRail />
      {/* O miolo começa depois da coluna e a acompanha quando ela expande. */}
      <div ref={onMount} className={styles.content} style={{ left: rail }} />
    </div>
  )
}
