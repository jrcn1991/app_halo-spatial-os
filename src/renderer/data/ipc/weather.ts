import type { WeatherRepository } from '@/domain/repositories'

/**
 * Clima de verdade, buscado pelo processo main (Open-Meteo).
 *
 * A tela não muda nada por causa disso — é exatamente o que a camada de
 * repositórios existe para garantir. O contrato já era assíncrono desde a fase
 * de mock, então nada aqui é novidade para quem consome.
 */
export const ipcWeather: WeatherRepository = {
  current: (place) => window.halo.weather.current(place),
}
