import { useState } from 'react'
import { SCREENS } from '@/screens'
import { useHalo } from '@/store/useHalo'
import { CenterFrame, CenterFrameContext } from '@/ui/CenterFrame'
import { Dock } from '@/ui/Dock'
import { Stage } from './Stage'
import { useDevShortcuts } from './useDevShortcuts'

export function App() {
  const screen = useHalo((s) => s.screen)
  const nonce = useHalo((s) => s.nonce)
  const embedded = useHalo((s) => s.appearance.navigation === 'embedded')
  // O nó do miolo da moldura persistente; as telas montam o painel central
  // nele. Estado (e não ref) para as telas renderizarem de novo quando o nó
  // existir — a moldura nasce depois da primeira tela.
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  useDevShortcuts()

  const Screen = SCREENS[screen]
  const screenKey = `${screen}:${nonce}`

  return (
    <Stage>
      <CenterFrameContext.Provider value={embedded ? frame : null}>
        {/* A `key` remonta a camada a cada troca de tela: é assim que a
            animação de entrada roda de novo, como no protótipo (que troca por
            sc-if). */}
        <div key={screenKey}>
          <Screen />
        </div>
      </CenterFrameContext.Provider>
      {/* Fora da `key` de propósito, como o dock: com a navegação embutida a
          moldura do painel central é o ponto fixo — só o miolo troca de tela.
          A `key` pelo nonce é para "Ver de novo" e a troca de variação de
          entrada valerem para ela também. */}
      {embedded ? <CenterFrame key={nonce} onMount={setFrame} /> : null}
      {/* Fora da `key` de propósito: o dock é o ponto fixo de onde as telas
          saem. Remontá-lo faria ele reanimar a cada clique nele mesmo — o
          protótipo repete o dock em cada tela, aqui ele permanece. */}
      <Dock />
    </Stage>
  )
}
