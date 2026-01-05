import { type KeyboardEvent, type PointerEvent, useCallback } from 'react'
import styles from './Slider.module.css'

/**
 * Slider do handoff. Como no protótipo, a posição do ponteiro define o valor
 * (`(clientX - rect.left) / rect.width`) — mas aqui vale também arrastando,
 * não só clicando. O ponteiro é capturado no `pointerdown`, então o arrasto
 * continua mesmo saindo do trilho.
 *
 * E responde ao TECLADO. O trilho sempre anunciou `role="slider"` com
 * `tabIndex={0}`: o foco chegava nele e o leitor de tela dizia "controle
 * deslizante" — mas nenhuma tecla o movia, o que é pior que não ser focável,
 * porque promete uma interação que não existe. As teclas são as que a prática
 * do ARIA define para o papel: setas andam um passo, PageUp/PageDown andam
 * dez, Home e End vão aos extremos.
 */
export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step,
  format = (v) => `${Math.round(v)}%`,
  trackClassName,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  /**
   * Começo da escala. 0 para percentuais; a altura da pílula começa em 24,
   * porque uma pílula de 4px não mostraria nada — e um trilho cujo início é um
   * valor impossível teria um trecho morto.
   */
  min?: number
  /** Fim da escala. 100 para percentuais, 360 para matiz. */
  max?: number
  /**
   * O degrau da escala. Sem ele o valor é contínuo (o percentual e a matiz
   * sempre foram). Com ele o arrasto e as setas caem em valores inteiros — uma
   * medida em px não pode virar 36,24.
   */
  step?: number | undefined
  format?: (value: number) => string
  /** Trilho alternativo (a barra de matiz pinta o arco-íris). */
  trackClassName?: string | undefined
}) {
  const ajustar = useCallback(
    (bruto: number) => {
      const degrau = step && step > 0 ? min + Math.round((bruto - min) / step) * step : bruto
      onChange(Math.max(min, Math.min(max, degrau)))
    },
    [onChange, min, max, step],
  )

  const pick = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      ajustar(min + ratio * (max - min))
    },
    [ajustar, min, max],
  )

  // Um passo é o degrau, quando há um, senão 1% da escala: 1 em percentual,
  // 3,6 em matiz. `preventDefault` SÓ quando a tecla foi tratada — senão Tab e
  // Shift+Tab parariam de sair daqui, que é a armadilha clássica de foco.
  const teclado = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const passo = step && step > 0 ? step : (max - min) / 100
      const destino: Record<string, number> = {
        ArrowRight: value + passo,
        ArrowUp: value + passo,
        ArrowLeft: value - passo,
        ArrowDown: value - passo,
        PageUp: value + passo * 10,
        PageDown: value - passo * 10,
        Home: min,
        End: max,
      }
      const next = destino[e.key]
      if (next === undefined) return
      e.preventDefault()
      ajustar(next)
    },
    [ajustar, min, max, step, value],
  )

  // A fração do trilho, contada do começo da escala — com `min` em 0 é a
  // mesma conta de sempre.
  const preenchido = ((value - min) / (max - min)) * 100

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        {label}
        <span className={styles.value}>{format(value)}</span>
      </div>
      <div
        className={trackClassName ? `${styles.track} ${trackClassName}` : styles.track}
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={min}
        aria-valuemax={max}
        // O leitor diz "50%" e não "50": `aria-valuenow` é número puro, e a
        // unidade só existe no `format` de quem usa o componente.
        aria-valuetext={format(value)}
        tabIndex={0}
        onKeyDown={teclado}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => {
          // Só arrasta se este trilho capturou o ponteiro.
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e)
        }}
      >
        <div className={styles.fill} style={{ width: `${preenchido}%` }} />
        <div className={styles.knob} style={{ left: `${preenchido}%` }} />
      </div>
    </div>
  )
}
