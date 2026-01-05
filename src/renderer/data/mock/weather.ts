import type { WeatherRepository } from '@/domain/repositories'

/** Latência falsa: expõe os estados de carregamento desde já. */
const LATENCY_MS = 260

/**
 * Clima mockado, com os valores do protótipo (14°, neblina, Sintra).
 *
 * O lugar vem das Configurações e é respeitado aqui; o resto é fixo até
 * existir um serviço de verdade (F5).
 */
export const mockWeather: WeatherRepository = {
  current: (place) =>
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            temperatureC: 14,
            condition: 'fog',
            place,
            observedAt: new Date().toISOString(),
          }),
        LATENCY_MS,
      ),
    ),
}
