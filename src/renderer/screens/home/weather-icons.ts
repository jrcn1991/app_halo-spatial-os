import astroClear from '@/assets/weather/astro/clear.png'
import astroClouds from '@/assets/weather/astro/clouds.png'
import astroFog from '@/assets/weather/astro/fog.png'
import astroRain from '@/assets/weather/astro/rain.png'
import astroSnow from '@/assets/weather/astro/snow.png'
import astroStorm from '@/assets/weather/astro/storm.png'
import wcClear from '@/assets/weather/weathercast/clear.png'
import wcClouds from '@/assets/weather/weathercast/clouds.png'
import wcFog from '@/assets/weather/weathercast/fog.png'
import wcRain from '@/assets/weather/weathercast/rain.png'
import wcSnow from '@/assets/weather/weathercast/snow.png'
import wcStorm from '@/assets/weather/weathercast/storm.png'
import type { WeatherCondition } from '@/domain/types'

/**
 * Os conjuntos de ícones do clima que são IMAGEM (os outros dois — Phosphor e
 * o animado em CSS — são componentes, em `WeatherWidget`).
 *
 * Cada conjunto veio de uma skin do Rainmeter (pasta `@Resources`), com os
 * ícones nomeados pelos códigos de condição do weather.com. Só os seis que as
 * nossas condições usam foram copiados, nas variantes de DIA — o serviço de
 * clima não diz se é noite, e escolher a lua sem saber seria inventar. A
 * tabela código → condição, e os créditos, estão em `THIRD-PARTY.md`.
 *
 * Importações explícitas, e não `import.meta.glob`: dezoito linhas que o
 * TypeScript confere valem mais que um glob que falha em silêncio quando um
 * arquivo é renomeado.
 */
export type WeatherImageSet = 'astro' | 'weathercast'

export const WEATHER_IMAGES: Record<WeatherImageSet, Record<WeatherCondition, string>> = {
  astro: {
    clear: astroClear,
    clouds: astroClouds,
    fog: astroFog,
    rain: astroRain,
    snow: astroSnow,
    storm: astroStorm,
  },
  weathercast: {
    clear: wcClear,
    clouds: wcClouds,
    fog: wcFog,
    rain: wcRain,
    snow: wcSnow,
    storm: wcStorm,
  },
}

export function isWeatherImageSet(icon: string): icon is WeatherImageSet {
  return icon in WEATHER_IMAGES
}
