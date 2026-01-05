import { type IslandFlight, VOO_CHEGADA_MS } from '@shared/island'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Glifo } from './Glifo'
import { quadrosDoVoo } from './voos'

/**
 * A camada do fantasma: a página `island.html?modo=voo`, numa janela
 * transparente que cobre as telas e só aparece durante um voo. Ela recebe o
 * mesmo `onVoo` da ilha, desenha o fantasma e o leva até a boca da pílula.
 * Ao terminar, desmonta — a janela é escondida com o buffer transparente, e
 * mostrar de novo não tem quadro velho para exibir.
 */
export function VooApp() {
  const [voo, setVoo] = useState<(IslandFlight & { id: number }) | null>(null)
  useEffect(() => {
    // O efeito do KWin acha a ilha pelo título "Halo · Ilha": a camada não pode ter o mesmo.
    document.title = 'Halo · Voo'
  }, [])
  useEffect(() => {
    let n = 0
    const cancelar = window.halo?.island.onVoo((dado) => {
      n += 1
      setVoo({ ...dado, id: n })
    })
    return () => cancelar?.()
  }, [])
  const terminou = useCallback(() => setVoo(null), [])
  return voo ? <Fantasma key={voo.id} voo={voo} aoTerminar={terminou} /> : null
}

/** A boca da pílula, em px: o tamanho a que o cartão encolhe ao entrar. */
const BOCA = { w: 44, h: 10 }

/**
 * O fantasma: um CARTÃO do tamanho da janela, com a marca e o título, que voa
 * até a boca da pílula. O CAMINHO vem da variação escolhida em Configurações
 * (`voos.ts`); o padrão é o `sugado`, que se levanta da mesa e estreita rumo
 * à pílula — a largura cede antes da altura.
 *
 * Ao montar, avisa o main (`vooPronto`) para a camada aparecer e a janela
 * real sumir só quando o fantasma já a cobre.
 */
function Fantasma({ voo, aoTerminar }: { voo: IslandFlight; aoTerminar: () => void }) {
  const carta = useRef<HTMLDivElement>(null)
  const conteudo = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const c = carta.current
    const t = conteudo.current
    if (!c || !t) {
      aoTerminar()
      return
    }
    window.halo?.island.vooPronto()
    const { from, mouth } = voo
    const geo = {
      dx: mouth.x - (from.x + from.width / 2),
      dy: mouth.y - (from.y + from.height / 2),
      sx: BOCA.w / from.width,
      sy: BOCA.h / from.height,
    }
    const {
      carta: quadros,
      conteudo: quadrosDoTexto,
      easing,
    } = quadrosDoVoo(voo.estilo, voo.sentido, geo)
    const viagem = c.animate(quadros, { duration: VOO_CHEGADA_MS, easing, fill: 'forwards' })
    t.animate(quadrosDoTexto, { duration: VOO_CHEGADA_MS, fill: 'forwards' })

    if (voo.sentido === 'volta') {
      viagem.onfinish = () => {
        // A janela real já foi revelada por baixo (o main pede ~100ms antes):
        // o cartão dissolve em cima dela sem esperar.
        const sumir = c.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 140,
          fill: 'forwards',
        })
        sumir.onfinish = aoTerminar
      }
    } else {
      viagem.onfinish = aoTerminar
    }
    return () => {
      for (const a of [...c.getAnimations(), ...t.getAnimations()]) a.cancel()
    }
  }, [voo, aoTerminar])

  const halo = voo.tipo === 'halo'
  return (
    <div
      ref={carta}
      className="fantasmaCarta"
      data-tipo={voo.tipo}
      style={{
        left: voo.from.x,
        top: voo.from.y,
        width: voo.from.width,
        height: voo.from.height,
      }}
    >
      <div ref={conteudo} className="fantasmaConteudo">
        <Glifo nome={halo ? 'Halo' : 'AppWindow'} tamanho={halo ? 52 : 20} />
        <span>{voo.title}</span>
      </div>
    </div>
  )
}
