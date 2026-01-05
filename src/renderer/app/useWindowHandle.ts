import { useLayoutEffect, useState } from 'react'

export type HandleRect = { x: number; y: number; width: number; height: number }

/** Folga em volta do traço, para a área de arraste ser confortável de pegar. */
const PADDING = 5

const same = (a: HandleRect | null, b: HandleRect | null) =>
  a === b ||
  (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)

/**
 * Mede onde o traço de mover a janela está desenhado, em coordenadas da janela.
 *
 * O traço mora no dock, que fica dentro do palco. Só que região de arraste
 * (`-webkit-app-region: drag`) não funciona lá: o palco tem `transform` e
 * `mask-image`, e cada um deles, sozinho, faz o Chromium parar de registrar a
 * região — o DOM continua idêntico e a janela simplesmente não anda. Então o
 * desenho fica no dock e a área de arraste é montada por cima, fora do palco,
 * onde comprovadamente funciona.
 */
export function useWindowHandle(
  /**
   * Tudo que muda o lugar do traço: posição do dock e escala do palco. O evento
   * `resize` sozinho não basta — ele chega antes de o React aplicar a escala
   * nova, e a medição sairia da janela antiga.
   */
  key: string,
): HandleRect | null {
  const [rect, setRect] = useState<HandleRect | null>(null)

  // `key` não é lido no corpo de propósito: existe para remedir quando o traço
  // muda de lugar (posição do dock, escala do palco).
  // biome-ignore lint/correctness/useExhaustiveDependencies: ver acima
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector('[data-window-handle]')
      const next = el
        ? (({ x, y, width, height }) => ({
            x: x - PADDING,
            y: y - PADDING,
            width: width + PADDING * 2,
            height: height + PADDING * 2,
          }))(el.getBoundingClientRect())
        : null
      // Sem a comparação, cada medição criaria um objeto novo e o efeito
      // realimentaria a si mesmo.
      setRect((current) => (same(current, next) ? current : next))
    }

    measure()
    addEventListener('resize', measure)

    // O dock entra animado: medir antes de ele assentar daria a posição errada.
    // Embutido no painel central, quem anima é o painel — espera-o também.
    const dock = document.querySelector('nav[aria-label="Telas"]')
    const host = dock?.closest('[data-halo-in]') ?? null
    if (dock) {
      const animations = [
        ...dock.getAnimations({ subtree: true }),
        ...(host?.getAnimations() ?? []),
      ]
      void Promise.allSettled(animations.map((a) => a.finished)).then(measure)
    }
    // Expandir a coluna embutida é uma transição (dela e do painel), que pode
    // começar só depois desta medição: o fim dela remede.
    dock?.addEventListener('transitionend', measure)
    host?.addEventListener('transitionend', measure)

    return () => {
      removeEventListener('resize', measure)
      dock?.removeEventListener('transitionend', measure)
      host?.removeEventListener('transitionend', measure)
    }
  }, [key])

  return rect
}
