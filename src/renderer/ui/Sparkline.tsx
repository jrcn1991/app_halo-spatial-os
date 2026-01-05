import { cx } from './cx'
import styles from './Sparkline.module.css'

/**
 * Sparkline do handoff.
 *
 * As barras animam por `[data-halo-in='graph']` (o CSS Modules renomearia o
 * keyframe, ver styles/animations.css). Os valores são normalizados aqui: quem
 * chama passa números crus, não porcentagens.
 */
export function Sparkline({
  values,
  tone = 'ok',
  animated = true,
}: {
  values: number[]
  tone?: 'ok' | 'warn' | 'down'
  animated?: boolean
}) {
  const max = Math.max(...values, 1)

  return (
    <div className={styles.sparkline}>
      {values.map((value, i) => (
        <div
          // A posição é a identidade: são fatias de tempo, não itens.
          // biome-ignore lint/suspicious/noArrayIndexKey: ver acima
          key={i}
          className={cx(styles.bar, tone === 'warn' && styles.warn, tone === 'down' && styles.down)}
          style={{
            height: `${Math.max(12, (value / max) * 100)}%`,
            animationDelay: `${(i * 0.11).toFixed(2)}s`,
          }}
          {...(animated ? { 'data-halo-in': 'graph' } : {})}
        />
      ))}
    </div>
  )
}
