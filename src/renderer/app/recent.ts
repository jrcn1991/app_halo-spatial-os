import { useHalo } from '@/store/useHalo'

/**
 * Mantém "Continuar assistindo" em dia.
 *
 * Quem escreve o histórico é o processo main, conforme o player avança — o
 * renderer nunca o escreve, só recebe. Sem esta escuta, a lista só mudaria
 * quando o app reabrisse.
 */
export function startWatchingRecent(): () => void {
  const api = globalThis.window?.halo
  if (!api) return () => {}
  return api.media.onRecent((recent) => useHalo.getState().setRecent(recent))
}
