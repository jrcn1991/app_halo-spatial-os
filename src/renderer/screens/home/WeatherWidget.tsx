import type { Icon } from '@phosphor-icons/react'
import { Cloud } from '@phosphor-icons/react/dist/icons/Cloud'
import { CloudFog } from '@phosphor-icons/react/dist/icons/CloudFog'
import { CloudLightning } from '@phosphor-icons/react/dist/icons/CloudLightning'
import { CloudRain } from '@phosphor-icons/react/dist/icons/CloudRain'
import { CloudSnow } from '@phosphor-icons/react/dist/icons/CloudSnow'
import { Sun } from '@phosphor-icons/react/dist/icons/Sun'
import type { WeatherCondition } from '@/domain/types'
import { SemCidade, useWeather } from '@/hooks/useWeather'
import { useHalo } from '@/store/useHalo'
import { WeatherGlyph } from './WeatherGlyph'
import { isWeatherImageSet, WEATHER_IMAGES } from './weather-icons'
import styles from './widgets.module.css'

/** Ícone e rótulo por condição. O handoff mostra neblina, em `ph-fill`. */
const CONDITIONS: Record<WeatherCondition, { icon: Icon; label: string }> = {
  clear: { icon: Sun, label: 'LIMPO' },
  clouds: { icon: Cloud, label: 'NUBLADO' },
  fog: { icon: CloudFog, label: 'NEBLINA' },
  rain: { icon: CloudRain, label: 'CHUVA' },
  snow: { icon: CloudSnow, label: 'NEVE' },
  storm: { icon: CloudLightning, label: 'TEMPESTADE' },
}

/**
 * Clima da home.
 *
 * Os dados vêm de `hooks/useWeather` — hoje um mock com os valores do
 * protótipo, amanhã um serviço real. O widget não sabe a diferença: é para
 * isso que existe a camada de repositórios.
 */
export function WeatherWidget() {
  const unit = useHalo((s) => s.widgets.weather.unit)
  const place = useHalo((s) => s.widgets.weather.place)
  const icon = useHalo((s) => s.widgets.weather.icon)
  const { data, loading, error } = useWeather()

  const condition = CONDITIONS[data?.condition ?? 'fog']
  const Glyph = condition.icon

  return (
    <div className={`${styles.card} ${styles.weather}`} data-halo-cartao="mini clima">
      {icon === 'animated' ? (
        <WeatherGlyph condition={data?.condition ?? 'fog'} size={52} />
      ) : isWeatherImageSet(icon) ? (
        // Imagem, não ícone de fonte: a cor é a do arquivo, e o `alt` é vazio
        // porque a condição já está escrita na linha ao lado.
        <img
          className={styles.weatherImage}
          src={WEATHER_IMAGES[icon][data?.condition ?? 'fog']}
          width={44}
          height={44}
          alt=""
          draggable={false}
        />
      ) : (
        <Glyph size={42} weight="fill" className={styles.weatherIcon} />
      )}
      <div>
        <div className={loading ? `${styles.temperature} ${styles.loading}` : styles.temperature}>
          {data ? `${toUnit(data.temperatureC, unit)}°` : '—'}
        </div>
        <div className={styles.weatherLine}>
          {data
            ? `${condition.label} · ${data.place.toUpperCase()}`
            : error instanceof SemCidade
              ? 'ESCOLHA A CIDADE EM CONFIGURAÇÕES → WIDGETS'
              : `${error ? 'SEM DADOS' : '···'} · ${place.toUpperCase()}`}
        </div>
      </div>
    </div>
  )
}

function toUnit(celsius: number, unit: 'c' | 'f'): number {
  return Math.round(unit === 'f' ? celsius * 1.8 + 32 : celsius)
}
