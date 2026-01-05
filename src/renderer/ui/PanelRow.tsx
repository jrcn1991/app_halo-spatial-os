import type { ReactNode } from 'react'
import { type DockPosition, useHalo } from '@/store/useHalo'
import { CENTER_FRAME } from './CenterFrame'
import { cx } from './cx'
import styles from './PanelRow.module.css'

/**
 * Cada tela tem sua própria perspectiva/gap/padding — os valores vêm do
 * protótipo, tela por tela, e não são intercambiáveis.
 *
 * O `padding` é escrito como no handoff, ou seja, com o dock na base. Quando o
 * dock muda de lado, a reserva dele acompanha: sai da base e vai para o lado
 * novo. É isso que impede os painéis de passarem por baixo do dock.
 */
export function PanelRow({
  gap,
  perspective,
  padding,
  dockReserve,
  children,
}: {
  gap: number
  perspective: number
  padding: string
  /**
   * Quanto do `padding-bottom` existe por causa do dock. O padrão é a
   * diferença para o `padding-top`; a tela de Música informa o seu, porque lá
   * a barra de transporte também ocupa a base.
   */
  dockReserve?: number
  children: ReactNode
}) {
  const dock = useHalo((s) => s.appearance.dock)
  const embedded = useHalo((s) => s.appearance.navigation === 'embedded')

  // Navegação embutida: o painel central é a moldura persistente, fixa no
  // palco (`CenterFrame`), igual em todas as telas. A linha vira uma grade de
  // três colunas com a do meio exatamente do tamanho da moldura, e a folga
  // vertical é a dela — assim o fantasma que `Panel` deixa na linha cai bem
  // em cima da moldura, e os laterais se arrumam em volta, cada tela com o
  // seu gap. A margem lateral usa o mesmo valor dos dois lados: a moldura está
  // no centro do palco e a linha precisa estar também.
  if (embedded) {
    const box = parsePadding(padding)
    return (
      <div
        className={cx(styles.row, styles.rowEmbedded)}
        style={{
          columnGap: gap,
          perspective,
          padding: `${CENTER_FRAME.top}px ${box.right}px ${CENTER_FRAME.bottom}px ${box.right}px`,
          gridTemplateColumns: `minmax(0, 1fr) ${CENTER_FRAME.w}px minmax(0, 1fr)`,
        }}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      className={styles.row}
      style={{ gap, perspective, padding: rotatePadding(padding, dock, dockReserve) }}
    >
      {children}
    </div>
  )
}

/**
 * Reserva horizontal para o dock em pé (esquerda/direita): 76px de margem da
 * borda + 82px de barra (item de 40 + 20 de padding dos dois lados + 1 de borda
 * cada) + 12 de folga. Não dá para derivar da base como nas outras posições: lá
 * a reserva é a altura do dock deitado, aqui é a largura dele em pé.
 */
const VERTICAL_DOCK_RESERVE = 76 + 82 + 12

export type Box = { top: number; right: number; bottom: number; left: number }

/** Lê o shorthand de padding do handoff (1 a 4 valores, sempre em px). */
export function parsePadding(padding: string): Box {
  const v = padding.split(/\s+/).map((n) => Number.parseFloat(n) || 0)
  const [a = 0, b = a, c = a, d = b] = v
  return { top: a, right: b, bottom: c, left: d }
}

function rotatePadding(padding: string, position: DockPosition, reserve?: number): string {
  const box = parsePadding(padding)
  if (position === 'bottom') return padding

  // O que sobra na base depois de tirar a reserva do dock (na Música, o que
  // sobra é a barra de transporte, que fica lá de qualquer jeito).
  const dock = reserve ?? box.bottom - box.top
  const rest = box.bottom - dock

  const moved: Box =
    position === 'top'
      ? { ...box, top: box.top + dock, bottom: rest }
      : position === 'left'
        ? { ...box, bottom: rest, left: Math.max(box.left, VERTICAL_DOCK_RESERVE) }
        : { ...box, bottom: rest, right: Math.max(box.right, VERTICAL_DOCK_RESERVE) }

  return `${moved.top}px ${moved.right}px ${moved.bottom}px ${moved.left}px`
}
