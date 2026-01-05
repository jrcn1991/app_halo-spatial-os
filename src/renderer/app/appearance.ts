import { rgbToCss } from '@shared/color'
import type { EnvironmentId } from '@shared/environments'
import type { Appearance } from '@shared/settings'
import type { CSSProperties } from 'react'

/**
 * Traduz as escolhas de Aparência para as variáveis do palco.
 *
 * Os padrões (transparência 50, claridade 50) devolvem exatamente os valores do
 * handoff — mexer nos controles é sempre um desvio consciente do protótipo,
 * nunca o ponto de partida.
 */

/** Alphas do handoff, reproduzidos com transparência em 50. */
const BASE_ALPHA = { side: 0.5, center: 0.62 } as const
/** Quanto de branco/preto a claridade chega a misturar nos extremos. */
const MAX_CLARITY_MIX = 20

/**
 * A cor do vidro é do handoff, e um ambiente com atmosfera própria não a
 * aceita: no Cyberpunt 2077 o vidro já tem a névoa vermelha do HUD, e somar
 * o matiz escolhido em Aparência dava um verde barrento por cima do neon
 * (visto na tela em 03/09/2026). A escolha do usuário não some — ela volta a
 * valer no ambiente que a comporta, que hoje é a Floresta.
 */
export function appearanceVars(
  appearance: Appearance,
  environment: EnvironmentId,
  // Já RESOLVIDOS por `valoresDoAmbiente`: os dois são ajuste por ambiente, e
  // quem os resolve é quem sabe qual ambiente está ativo.
  transparency: number,
  clarity: number,
): CSSProperties {
  const tinta = environment === 'floresta' && appearance.tint.on
  // 50 → fator 1 (handoff). 0 → opaco. 100 → invisível.
  const factor = (100 - transparency) / 50
  const claridade = (clarity - 50) / 50

  return {
    // Sem fundo pintado atrás, `backdrop-filter` só custaria GPU.
    '--glass-side-filter': 'none',
    '--glass-center-filter': 'none',
    '--glass-tint': tinta ? rgbToCss(appearance.tint.rgb) : 'transparent',
    '--glass-side-alpha': Math.min(1, BASE_ALPHA.side * factor).toFixed(3),
    '--glass-center-alpha': Math.min(1, BASE_ALPHA.center * factor).toFixed(3),
    '--glass-clarity': `${(Math.abs(claridade) * MAX_CLARITY_MIX).toFixed(1)}%`,
    '--glass-clarity-target': claridade >= 0 ? 'var(--text-primary)' : 'var(--glass-darken)',
  } as CSSProperties
}
