import type { WeatherCondition } from '@/domain/types'
import styles from './WeatherGlyph.module.css'

/**
 * Ícone de clima animado, em CSS puro.
 *
 * Portado do CodePen "Animated Weather Icons" (baseado no Dribbble de kylor) —
 * material de terceiros, a conferir licença antes de distribuir, como as
 * imagens do handoff.
 *
 * O desenho é feito por RECORTE: a nuvem é preenchida com a cor do fundo e
 * contornada por sombras claras. No original o fundo da página é opaco e igual
 * ao preenchimento; aqui o card é translúcido sobre o desktop, então o miolo
 * usa uma aproximação do vidro e fica um tom mais escuro em vez de sumir.
 *
 * O `size` controla o `font-size`, que é a unidade de tudo no original — o
 * ícone mede 12x10em, então o desenho é bem menor que a caixa: em 52px de
 * largura a nuvem fica com ~16px e o contorno com 1,6px, e o desenho some. Ele
 * só respira a partir de ~108px de largura, o que exigiria refazer o card do
 * clima (medido: 232x128 em vez de 232x80, com a linha de texto quebrando).
 */
export function WeatherGlyph({ condition, size }: { condition: WeatherCondition; size: number }) {
  // O original é desenhado para ~12em de largura; encaixamos na caixa pedida.
  const style = { fontSize: size / 12, width: size, height: (size / 12) * 10 }

  return (
    <span className={styles.icon} style={style} aria-hidden>
      {PARTS[condition]}
    </span>
  )
}

const cloud = <span className={styles.cloud} key="cloud" />
const passing = <span className={styles.cloud} data-weather="cloud-passing" key="passing" />
const sun = (
  <span className={styles.sun} data-weather="sun" key="sun">
    <span className={styles.rays} />
  </span>
)
const rain = <span className={styles.rain} data-weather="rain" key="rain" />

const PARTS: Record<WeatherCondition, React.ReactNode> = {
  clear: sun,
  clouds: [cloud, passing],
  // O handoff mostra neblina: nuvem cheia com a segunda passando atrás.
  fog: [cloud, passing],
  rain: [cloud, rain],
  snow: [
    cloud,
    <span className={styles.snow} key="snow">
      <span className={styles.flake} data-weather="flake" />
      <span className={styles.flake} data-weather="flake-2" />
    </span>,
  ],
  storm: [
    cloud,
    <span className={styles.lightning} key="lightning">
      <span className={styles.bolt} data-weather="bolt" />
      <span className={styles.bolt} data-weather="bolt-small" />
    </span>,
  ],
}
