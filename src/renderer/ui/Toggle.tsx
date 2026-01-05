import type { ReactNode } from 'react'
import styles from './Toggle.module.css'

/** Interruptor do handoff: trilho 34x19, botão 15px, menta quando ligado. */
export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: ReactNode
  checked: boolean
  onChange: (next: boolean) => void
  /**
   * Ligado, mas sem efeito AQUI — o mesmo caso da posição do dock com a
   * navegação embutida. Desabilitar e explicar é melhor do que esconder: o
   * usuário vê que a escolha continua guardada, e que ela volta a valer.
   */
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      className={styles.row}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.label}>{label}</span>
      <span className={checked ? `${styles.track} ${styles.trackOn}` : styles.track}>
        <span className={styles.knob} />
      </span>
    </button>
  )
}
