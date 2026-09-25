import { t } from '@shared/i18n'
import { PRESETS_DO_AMBIENTE, useValoresDoAmbiente } from '@/app/environment'
import { useHalo } from '@/store/useHalo'
import { ENTRANCE_NAMES, type EntranceName } from '@/styles/entrances'
import styles from '../SettingsScreen.module.css'

/**
 * As 13 variações de entrada do handoff. Escolher já aplica e repete.
 *
 * O que está ACESO é a entrada que vale, que nem sempre é a escolhida: com a
 * escolha vazia quem manda é o preset do ambiente. A etiqueta "preset" marca
 * qual é a do ambiente ativo, para a diferença ser visível em vez de mágica —
 * e o botão "Restaurar padrão", no painel da direita, devolve o vazio.
 */
export function AnimationSection() {
  const ambiente = useHalo((s) => s.environment.id)
  const setEntrance = useHalo((s) => s.setEntrance)
  const { entrada: entrance } = useValoresDoAmbiente()
  const preset = PRESETS_DO_AMBIENTE[ambiente]?.entrada

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{t('Animação · Entrada')}</span>
        <span className={styles.title}>{t('Como as telas entram')}</span>
        <span className={styles.subtitle}>
          {preset
            ? t(
                '13 variações do handoff. Escolher uma aplica na hora e repete a entrada nesta tela — e vale NESTE ambiente, por cima do preset dele, que é {preset}.',
                { preset: t(preset) },
              )
            : t(
                '13 variações do handoff. Escolher uma aplica na hora e repete a entrada nesta tela. Este ambiente não traz preset: vale a do handoff.',
              )}
        </span>
      </div>
      <div className={styles.divider} />
      <div className={styles.grid}>
        {ENTRANCE_NAMES.map((name: EntranceName, i) => {
          const active = name === entrance
          return (
            <button
              key={name}
              type="button"
              aria-pressed={active}
              className={active ? `${styles.option} ${styles.optionActive}` : styles.option}
              onClick={() => setEntrance(name)}
            >
              <span className={styles.index}>{String(i + 1).padStart(2, '0')}</span>
              {t(name)}
              {name === preset && <span className={styles.presetTag}>PRESET</span>}
              {active && <span className={styles.dot} />}
            </button>
          )
        })}
      </div>
    </>
  )
}
