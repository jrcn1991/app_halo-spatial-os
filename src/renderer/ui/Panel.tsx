import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useValoresDoAmbiente } from '@/app/environment'
import { useHalo } from '@/store/useHalo'
import { useCenterFrame } from './CenterFrame'
import styles from './Panel.module.css'
import { parsePadding } from './PanelRow'

type Common = {
  /** Largura/altura exatas do handoff. */
  w: number
  h: number
  radius?: number
  padding?: string
  gap?: number
  overflow?: 'hidden' | 'visible'
  order?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

type SidePanel = Common & {
  variant: 'side'
  /** Repouso 3D do painel, ex.: 'rotateY(18deg) translateZ(-60px)'. */
  rest: string
  /** Deslocamento de entrada; só o painel declara `--from-x` (handoff). */
  fromX: number
  /** `false` para o container sem vidro próprio (tela de Música). */
  glass?: boolean
}

type CenterPanel = Common & { variant: 'center' }

export type PanelProps = SidePanel | CenterPanel

export function Panel(props: PanelProps) {
  const { w, h, radius, padding, gap, overflow, order, className, style, children } = props
  const embedded = useHalo((s) => s.appearance.navigation === 'embedded')
  // O tema pode trazer a transição dele — sem apagar a escolha de quem fez uma
  // NESTE ambiente. Ver `valoresDoAmbiente`.
  const { transicao: contentEntrance } = useValoresDoAmbiente()
  const frame = useCenterFrame()

  const base: CSSProperties = {
    width: w,
    height: h,
    // O raio do handoff vira o PADRÃO de um token, não um valor cravado: um
    // tema que troca cantos arredondados por chanfros (o Cyberpunk) precisa
    // alcançá-lo, e estilo em linha não se sobrescreve por CSS.
    borderRadius: radius === undefined ? undefined : `var(--panel-radius, ${radius}px)`,
    padding,
    gap,
    overflow,
    order,
    ...style,
  }

  if (props.variant === 'center') {
    // Navegação embutida: o painel central é a moldura persistente
    // (`CenterFrame`), que não remonta com a tela. Aqui fica só um fantasma
    // na coluna do meio da linha, e o conteúdo vai para a moldura por portal,
    // com o padding e o gap que a tela declarou.
    if (embedded) {
      const inner: CSSProperties = { padding, gap, overflow, ...style }
      return (
        <>
          <div className={styles.ghost} />
          {frame
            ? createPortal(
                <div
                  className={cx(styles.frameContent, className)}
                  style={inner}
                  data-halo-in="content"
                  // A variação escolhida em Configurações; os keyframes estão
                  // em `styles/animations.css`, presos a este atributo.
                  data-content-entrance={contentEntrance}
                >
                  {children}
                </div>,
                frame,
              )
            : null}
        </>
      )
    }
    return (
      <div
        className={cx(styles.panel, styles.center, className)}
        style={base}
        data-halo-in="center"
        data-halo-recorte={overflow ?? 'visible'}
      >
        {children}
      </div>
    )
  }

  // Na grade do modo embutido cada lateral tem coluna própria — pelo lado, e
  // não pela ordem no DOM (Claude e Arquivos usam `order`). O lado vem do
  // sinal de `fromX`: no handoff o painel da esquerda entra de +150 e o da
  // direita de -150. E o lateral encolhe para caber na coluna quando a
  // moldura, fixa, não deixa a largura dele (Social).
  const box = parsePadding(padding ?? '0')
  const left = props.fromX > 0
  const gridStyle: CSSProperties = embedded
    ? {
        gridColumn: left ? 1 : 3,
        justifySelf: left ? 'end' : 'start',
        maxWidth: `calc(100% - ${box.left + box.right + 2}px)`,
      }
    : {}

  const sideStyle = {
    ...base,
    ...gridStyle,
    '--rest': props.rest,
    '--from-x': `${props.fromX}px`,
  } as CSSProperties

  return (
    <div
      className={cx(styles.panel, styles.side, props.glass === false && styles.bare, className)}
      style={sideStyle}
      data-halo-in="side"
      // Se esta caixa RECORTA o que passa dela. Atributo neutro, como
      // `data-halo-side`: um tema que monte ornamento SOBRE a aresta precisa
      // saber onde pode transbordar — fundo não pinta fora da caixa, e uma
      // peça posta meio para fora de um painel com `overflow: hidden` sai
      // decepada numa linha reta. Medido: a crista do BioShock era cortada
      // exatamente assim nos sete painéis centrais que pedem `hidden`.
      data-halo-recorte={overflow ?? 'visible'}
      // De que lado da linha este painel está. Um tema pode dar silhuetas
      // diferentes aos dois lados (o Cyberpunk dá: cada lateral tem o próprio
      // chanfro e o entalhe na aresta que olha para o meio), e sem isto o CSS
      // não tem como distinguir as duas — o lado só existe no sinal de
      // `fromX`, que é estilo em linha. Na Floresta ninguém lê o atributo.
      data-halo-side={left ? 'esquerda' : 'direita'}
    >
      {children}
    </div>
  )
}

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ')
}
