import type { Agent } from '@shared/agents'
import { t } from '@shared/i18n'
import type { MascotAnimation, MascotInfo, MascotMood } from '@shared/mascot'
import { IDLE_INTERVAL, idlePool } from '@shared/mascot'
import { useEffect, useRef, useState } from 'react'
import { useHalo } from '@/store/useHalo'
import styles from './claude.module.css'

/** Altura de `.mascote` no CSS — o espaço que o orbe do handoff ocupava. */
const MASCOTE_ALTURA = 128

/**
 * O mascote, no lugar do orbe.
 *
 * Um personagem `.acs` do Microsoft Agent — os mesmos Genie e Clippy do Windows
 * antigo — reagindo ao que os agentes estão fazendo. Sem personagem escolhido,
 * o orbe do handoff continua: a tela nunca fica com um buraco.
 *
 * As animações vêm do processo main já em PNG, uma de cada vez (ver
 * `src/main/mascot/mascot.ts`).
 */

/** O estado dos agentes vira um humor do mascote. */
function humorDe(agentes: Agent[]): MascotMood {
  if (agentes.some((a) => a.state === 'erro')) return 'erro'
  if (agentes.some((a) => a.state === 'ferramenta')) return 'ferramenta'
  if (agentes.some((a) => a.state === 'pensando')) return 'pensando'
  return 'ocioso'
}

export function Mascote({ agentes }: { agentes: Agent[] }) {
  const agitacao = useHalo((s) => s.mascotLiveliness)
  const [info, setInfo] = useState<MascotInfo | null>(null)
  const [quadro, setQuadro] = useState<string | null>(null)
  const [tocando, setTocando] = useState<string | null>(null)
  const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cache = useRef(new Map<string, MascotAnimation>())

  const humor = humorDe(agentes)
  // Turno recém-terminado: o total de turnos subindo é o gatilho da comemoração.
  const turnos = agentes.reduce((soma, a) => soma + a.turns, 0)
  const turnosAntes = useRef(turnos)

  useEffect(() => {
    void window.halo?.mascot.info().then(setInfo)
  }, [])

  /**
   * Toca uma animação até o fim, quadro a quadro.
   *
   * Cada quadro tem a própria duração no formato, então o relógio é
   * reprogramado a cada um em vez de haver uma taxa fixa — é o que faz o
   * personagem ter o ritmo que o autor dele desenhou.
   */
  useEffect(() => {
    if (!info?.ready) return
    let vivo = true

    const tocar = async (nome: string) => {
      let animacao = cache.current.get(nome)
      if (!animacao) {
        animacao = await window.halo?.mascot.animation(nome).catch(() => undefined)
        if (!animacao || !vivo) return
        cache.current.set(nome, animacao)
      }
      setTocando(nome)

      let i = 0
      const proximo = () => {
        if (!vivo || !animacao) return
        const atual = animacao.frames[i]
        if (!atual) {
          setTocando(null)
          return
        }
        setQuadro(atual.image)
        i += 1
        relogio.current = setTimeout(proximo, atual.durationMs)
      }
      proximo()
    }

    // Comemorar tem prioridade: um turno que acabou de terminar é o momento.
    const comemorou = turnos > turnosAntes.current
    turnosAntes.current = turnos
    const alvo = comemorou ? info.moods.comemorando : info.moods[humor]
    if (alvo) void tocar(alvo)

    return () => {
      vivo = false
      clearTimeout(relogio.current)
    }
  }, [info, humor, turnos])

  /**
   * Bobagens de ocioso.
   *
   * De tempos em tempos ele faz alguma coisa sozinho, sorteada entre TUDO que
   * o personagem sabe fazer e não está reservado a um estado — 37 a 70
   * animações, conforme o personagem. Uma lista fixa deixaria de fora tudo que
   * um personagem novo trouxesse.
   *
   * A espera é sorteada dentro de uma faixa, e não fixa: intervalo regular
   * denuncia o relógio e faz o mascote parecer um enfeite piscando.
   */
  useEffect(() => {
    if (!info?.ready || humor !== 'ocioso' || tocando) return

    const pool = idlePool(info.animations, Object.values(info.moods))
    if (pool.length === 0) return

    const [minimo, maximo] = IDLE_INTERVAL[agitacao]
    const espera = setTimeout(
      () => {
        const escolhida = pool[Math.floor(Math.random() * pool.length)]
        if (!escolhida) return
        void window.halo?.mascot
          .animation(escolhida)
          .then((animacao) => {
            cache.current.set(escolhida, animacao)
            setTocando(escolhida)
            let i = 0
            const proximo = () => {
              const atual = animacao.frames[i]
              if (!atual) {
                setTocando(null)
                return
              }
              setQuadro(atual.image)
              i += 1
              relogio.current = setTimeout(proximo, atual.durationMs)
            }
            proximo()
          })
          .catch(() => setTocando(null))
      },
      minimo + Math.random() * (maximo - minimo),
    )
    return () => clearTimeout(espera)
  }, [info, humor, tocando, agitacao])

  // Sem personagem escolhido (ou com erro ao ler), o orbe do handoff fica.
  if (!info?.ready || !quadro) return <div className={styles.orb} />

  return (
    <div className={styles.mascote} title={`${info.name} — ${tocando ?? t('parado')}`}>
      <img
        className={styles.mascoteQuadro}
        src={quadro}
        alt=""
        width={info.width}
        height={info.height}
        /* `pixelated` existe para AMPLIAR os personagens de 1997 sem borrar.
           Reduzir com ele serrilha: o Cop tem quadros de 400px e o espaço aqui
           tem 128, e vizinho-mais-próximo joga fora dois de cada três pixels.
           Quem for maior que o espaço desce suavizado. */
        style={{ imageRendering: info.height > MASCOTE_ALTURA ? 'auto' : 'pixelated' }}
      />
    </div>
  )
}
