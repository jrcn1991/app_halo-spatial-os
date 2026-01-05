/**
 * Entidades do app.
 *
 * Nada aqui sabe de onde o dado vem: hoje de `data/mock`, amanhã de um serviço
 * real pelo processo main. É essa ignorância que faz a troca custar barato.
 */

export type WeatherCondition = 'clear' | 'clouds' | 'fog' | 'rain' | 'snow' | 'storm'

export type Weather = {
  /** Sempre em Celsius; a unidade de exibição é escolha de Configurações. */
  temperatureC: number
  condition: WeatherCondition
  place: string
  /** ISO. Serve para o widget dizer o quão velho é o dado. */
  observedAt: string
}
