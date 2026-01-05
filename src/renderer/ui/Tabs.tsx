import styles from './Tabs.module.css'

/** Segmentado do handoff: pílulas de peso igual, ativa com fundo mais claro. */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
  wrap = false,
}: {
  options: readonly { value: T; label: string; disabled?: boolean }[]
  value: T
  onChange: (next: T) => void
  label: string
  /** Com mais de quatro opções: quebra em linhas de quatro pílulas iguais. */
  wrap?: boolean
}) {
  return (
    // `fieldset` traz moldura e margens próprias, e este é um segmentado com
    // medidas do handoff. O papel e o rótulo estão declarados, e cada opção
    // informa `aria-pressed`.
    // biome-ignore lint/a11y/useSemanticElements: ver acima
    <div
      className={wrap ? `${styles.tabs} ${styles.tabsWrap}` : styles.tabs}
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={option.disabled ?? false}
          className={option.value === value ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
