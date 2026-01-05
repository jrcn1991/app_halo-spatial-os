/**
 * Conversões de cor para a escolha do vidro.
 *
 * Tudo em números, nunca em literal de cor: o guarda de estilo
 * (`npm run lint:style`) exige que cor escrita à mão viva só em tokens.css, e
 * aqui a cor é dado do usuário, não decisão de design.
 */

export type Rgb = [number, number, number]

/** Saturação e luminosidade fixas, na vibração dos acentos do handoff. */
const TINT_SATURATION = 0.45
const TINT_LIGHTNESS = 0.62

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)))

/** Matiz (0–360) para RGB, na saturação e luminosidade da paleta. */
export function hueToRgb(hue: number): Rgb {
  const c = (1 - Math.abs(2 * TINT_LIGHTNESS - 1)) * TINT_SATURATION
  const h = (((hue % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((h % 2) - 1))
  const m = TINT_LIGHTNESS - c / 2

  const [r, g, b]: Rgb =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x]

  return [clamp255((r + m) * 255), clamp255((g + m) * 255), clamp255((b + m) * 255)]
}

export function rgbToHue(rgb: Rgb): number {
  const [r, g, b] = rgb.map((n) => n / 255) as Rgb
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0

  const hue =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return Math.round((((hue * 60) % 360) + 360) % 360)
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((n) => clamp255(n).toString(16).padStart(2, '0')).join('')}`
}

/** Aceita `#abc` e `#aabbcc`, com ou sem `#`. Devolve null se não for cor. */
export function hexToRgb(input: string): Rgb | null {
  const hex = input.trim().replace(/^#/, '')
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ]
}

/** Formato aceito pelo CSS a partir dos canais. */
export function rgbToCss(rgb: Rgb): string {
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`
}
