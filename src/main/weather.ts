import type { Weather, WeatherCondition } from '@shared/weather'

/**
 * Clima real, via Open-Meteo.
 *
 * Escolhida por não exigir chave nem cadastro: nada de credencial para guardar
 * ou vazar, o que também mantém o app instalável por qualquer um sem
 * configuração. A busca acontece no processo MAIN, não no renderer — a CSP da
 * página permite `connect-src 'self'` e nada mais, de propósito.
 *
 * Duas chamadas: o nome do lugar vira coordenada (geocodificação) e a
 * coordenada vira o tempo atual.
 */

const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'
/** O tempo não muda em segundos; poupa a API e o disco de rede. */
const CACHE_MS = 10 * 60 * 1000
const TIMEOUT_MS = 8000

type Cached = { at: number; weather: Weather }
const cache = new Map<string, Cached>()

/** Códigos WMO → as condições que o app desenha. */
function toCondition(code: number): WeatherCondition {
  if (code === 0) return 'clear'
  if (code <= 3) return 'clouds'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 95) return 'storm'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 51) return 'rain'
  return 'clouds'
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

type GeoResult = { latitude: number; longitude: number; name: string }

async function geocode(place: string): Promise<GeoResult> {
  const url = `${GEOCODE}?name=${encodeURIComponent(place)}&count=1&language=pt&format=json`
  const data = (await getJson(url)) as { results?: GeoResult[] }
  const first = data.results?.[0]
  if (!first) throw new Error(`lugar não encontrado: ${place}`)
  return first
}

export async function currentWeather(place: string): Promise<Weather> {
  const key = place.trim().toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.weather

  const spot = await geocode(place)
  const url =
    `${FORECAST}?latitude=${spot.latitude}&longitude=${spot.longitude}` +
    '&current=temperature_2m,weather_code&timezone=auto'
  const data = (await getJson(url)) as {
    current?: { temperature_2m: number; weather_code: number; time: string }
  }
  if (!data.current) throw new Error('resposta sem o tempo atual')

  const weather: Weather = {
    temperatureC: data.current.temperature_2m,
    condition: toCondition(data.current.weather_code),
    // O nome que a API conhece, não o que foi digitado.
    place: spot.name,
    observedAt: new Date(data.current.time).toISOString(),
  }

  cache.set(key, { at: Date.now(), weather })
  return weather
}
