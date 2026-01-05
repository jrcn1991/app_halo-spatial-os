import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/icons/ArrowCounterClockwise'
import type { StatGraphs, TemperatureUnit, WeatherIcon } from '@shared/settings'
import { useEffect, useState } from 'react'
import { PRESETS_DO_AMBIENTE, useAjuste, useValoresDoAmbiente } from '@/app/environment'
import { useHalo } from '@/store/useHalo'
import { Tabs } from '@/ui/Tabs'
import { Toggle } from '@/ui/Toggle'
import styles from '../SettingsScreen.module.css'

const HOUR: readonly { value: string; label: string }[] = [
  { value: '24', label: '24 horas' },
  { value: '12', label: '12 horas' },
]

const UNITS: readonly { value: TemperatureUnit; label: string }[] = [
  { value: 'c', label: 'Celsius' },
  { value: 'f', label: 'Fahrenheit' },
]

/**
 * Os conjuntos de ícone do clima. Os três últimos são imagens de skins do
 * Rainmeter que o usuário trouxe; os créditos ficam na nota abaixo do controle
 * e em `THIRD-PARTY.md` — as licenças (CC BY-NC-SA) pedem isso.
 */
const ICONS: readonly { value: WeatherIcon; label: string }[] = [
  { value: 'phosphor', label: 'Do handoff' },
  { value: 'animated', label: 'Animado' },
  { value: 'astro', label: 'ASTRO' },
  { value: 'weathercast', label: 'Weather Cast' },
]

/** Os gráficos dos medidores. `none` é o handoff. */
export const GRAPHS: readonly { value: StatGraphs; label: string }[] = [
  { value: 'none', label: 'Nenhum' },
  { value: 'wave', label: 'Onda' },
  { value: 'bars', label: 'Barras' },
]

/**
 * Widgets — o que os cartões da home mostram.
 *
 * Relógio e clima são reais: a hora vem do sistema, o tempo vem do Open-Meteo
 * pelo processo principal.
 */
export function WidgetsSection() {
  const widgets = useHalo((s) => s.widgets)
  const setWidgets = useHalo((s) => s.setWidgets)
  const [place, setPlace] = useState(widgets.weather.place)
  // Os gráficos são ajuste POR AMBIENTE, como o vidro: o resolvedor devolve o
  // que vale aqui, e o preset diz o que o ambiente sugere.
  const setAjuste = useHalo((s) => s.setAjuste)
  const resetGraphs = useHalo((s) => s.resetGraphs)
  const ambiente = useHalo((s) => s.environment.id)
  const { graficos } = useValoresDoAmbiente()
  const ajuste = useAjuste()
  const presetGraficos = PRESETS_DO_AMBIENTE[ambiente]?.graficos
  const noPreset = ajuste.graphs === undefined

  useEffect(() => setPlace(widgets.weather.place), [widgets.weather.place])

  const commitPlace = (text: string) => {
    const trimmed = text.trim()
    if (trimmed) setWidgets({ weather: { ...widgets.weather, place: trimmed } })
    else setPlace(widgets.weather.place)
  }

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Widgets · Home</span>
        <span className={styles.title}>Relógio, clima e desempenho</span>
        <span className={styles.subtitle}>
          Os cartões do painel esquerdo da Home. Mudanças aparecem lá na hora.
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Relógio</span>
        <Tabs
          label="Formato da hora"
          options={HOUR}
          value={widgets.clock.hour12 ? '12' : '24'}
          onChange={(v) => setWidgets({ clock: { ...widgets.clock, hour12: v === '12' } })}
        />
        <Toggle
          label="Mostrar segundos"
          checked={widgets.clock.seconds}
          onChange={(seconds) => setWidgets({ clock: { ...widgets.clock, seconds } })}
        />
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Clima</span>
        <div className={styles.hexRow}>
          <input
            className={styles.hexInput}
            value={place}
            spellCheck={false}
            aria-label="Local do clima"
            placeholder="Sua cidade"
            onChange={(e) => setPlace(e.target.value)}
            onBlur={(e) => commitPlace(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commitPlace(e.currentTarget.value)}
          />
        </div>
        <Tabs
          label="Unidade de temperatura"
          options={UNITS}
          value={widgets.weather.unit}
          onChange={(unit) => setWidgets({ weather: { ...widgets.weather, unit } })}
        />
        <Tabs
          label="Ícone do clima"
          options={ICONS}
          value={widgets.weather.icon}
          onChange={(icon) => setWidgets({ weather: { ...widgets.weather, icon } })}
        />
        <span className={styles.note}>
          ASTRO é de xxenium e Weather Cast é de Saber Akiyama — skins do Rainmeter sob Creative
          Commons BY-NC-SA. A troca vale na hora no cartão da Home.
        </span>
        <span className={styles.note}>
          Dados reais do Open-Meteo, sem chave nem cadastro. A busca acontece no processo principal
          e fica em cache por 10 minutos.
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Desempenho</span>
        <Tabs
          label="Gráficos"
          options={GRAPHS}
          value={graficos}
          onChange={(graphs) => setAjuste({ graphs })}
        />
        <span className={styles.note}>
          O app guarda as últimas leituras de CPU, memória, placa de vídeo e temperatura (dois
          minutos, a cada 3s) e desenha o histórico em cada medidor da Home.{' '}
          {presetGraficos === undefined
            ? 'Este ambiente segue o handoff, sem gráfico; escolher aqui vale só nele.'
            : `Este ambiente pede "${GRAPHS.find((g) => g.value === presetGraficos)?.label}". Escolher aqui vale por cima do preset, e "Restaurar padrão" devolve ele.`}
        </span>
        <button
          type="button"
          className={`${styles.replay} ${styles.secondary}`}
          onClick={resetGraphs}
          disabled={noPreset}
          title={
            noPreset ? 'Já está no padrão deste ambiente' : 'Volta ao padrão do ambiente ativo'
          }
        >
          <ArrowCounterClockwise size={17} />
          Restaurar padrão
        </button>
      </div>
    </>
  )
}
