import { type CSSProperties, type ReactNode, useLayoutEffect, useState } from 'react'
import { useValoresDoAmbiente } from '@/app/environment'
import wallpaper from '@/assets/images/wallpaper.jpg'
import { useHalo } from '@/store/useHalo'
import { entranceVars } from '@/styles/entrances'
import { appearanceVars } from './appearance'
import { currentBackdrop } from './backdrop'
import { useEnvironmentTheme } from './environment'
import styles from './Stage.module.css'
import { useWindowHandle } from './useWindowHandle'

const STAGE_W = 1440
const STAGE_H = 900

/**
 * O handoff é desenhado num palco fixo de 1440x900 com coordenadas absolutas.
 * Em vez de tornar tudo fluido (e perder a geometria), escalamos o palco
 * inteiro por `min(w/1440, h/900)`. A janela mantém a proporção via
 * `setAspectRatio`, então na prática não sobra letterbox.
 */
export function Stage({ children }: { children: ReactNode }) {
  const { entrada, transparencia, claridade } = useValoresDoAmbiente()
  const appearance = useHalo((s) => s.appearance)
  const screen = useHalo((s) => s.screen)
  const nonce = useHalo((s) => s.nonce)
  const dockExpanded = useHalo((s) => s.dockExpanded)
  const environment = useHalo((s) => s.environment.id)
  const [scale, setScale] = useState(1)
  // O tema do ambiente vive no `documentElement`, não aqui: modais ficam fora
  // do palco. Ver `environment.ts`.
  useEnvironmentTheme()
  // Embutida, a navegação mora no painel central: o traço muda de lugar a cada
  // tela (o painel central de cada uma tem outra posição) e ao expandir.
  const handle = useWindowHandle(
    `${appearance.dock}:${appearance.navigation}:${dockExpanded}:${screen}:${nonce}:${scale}`,
  )
  const backdrop = currentBackdrop()
  const showWallpaper = backdrop === 'wallpaper'

  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H))
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [])

  return (
    <div className={cx(styles.root, showWallpaper && styles.rootWallpaper)}>
      <div
        className={cx(styles.stage, showWallpaper && styles.stageWallpaper)}
        style={
          {
            '--stage-scale': scale,
            '--wallpaper': `url(${wallpaper})`,
            ...entranceVars(entrada),
            // O modo de comparação reproduz o handoff puro: nenhum ajuste entra.
            ...(showWallpaper
              ? {}
              : appearanceVars(appearance, environment, transparencia, claridade)),
          } as CSSProperties
        }
      >
        <div className={cx(styles.veil, showWallpaper ? styles.veilWallpaper : undefined)} />
        {children}
        {/* Camada de efeito do ambiente, POR CIMA de tudo e sem receber
            clique: vazia na Floresta (nada é pintado), é onde o Cyberpunk
            desenha as scanlines, o ruído e a varredura. Mora aqui, e não
            dentro de um painel, porque um efeito de tela é da tela. */}
        <div className={styles.fx} data-halo-fx="ambiente" aria-hidden="true" />
      </div>
      {/* Área de arraste da janela, montada sobre o traço desenhado no dock.
          Fica FORA do palco de propósito — ver `useWindowHandle`. */}
      {handle && (
        <div
          className={styles.windowHandle}
          style={{
            left: handle.x,
            top: handle.y,
            width: handle.width,
            height: handle.height,
          }}
        />
      )}
    </div>
  )
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}
