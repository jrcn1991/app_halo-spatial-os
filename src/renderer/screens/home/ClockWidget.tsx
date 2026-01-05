import { useEffect, useState } from 'react'
import { useHalo } from '@/store/useHalo'
import styles from './widgets.module.css'

/**
 * Relógio da home.
 *
 * É a hora real do sistema — não faria sentido mockar o relógio de um app de
 * desktop. Formato (24h/12h e segundos) vem de Configurações › Widgets.
 */
export function ClockWidget() {
  const { hour12, seconds } = useHalo((s) => s.widgets.clock)
  const now = useNow(seconds)

  return (
    <div
      className={`${styles.card} ${styles.clock}`} // Duas fichas: "mini" é a FORMA (quadro pequeno, que o BioShock emoldura) e
      // "relogio" é o que a peça É. Atributo neutro, aditivo, e a Floresta
      // ignora as duas — ver CRIACAO-DE-TEMAS.md § 4.
      data-halo-cartao="mini relogio"
    >
      <div className={styles.time}>{formatTime(now, hour12, seconds)}</div>
      <div className={styles.date}>{formatDate(now)}</div>
    </div>
  )
}

/** Acorda a cada segundo só quando os segundos aparecem; senão, a cada minuto. */
function useNow(seconds: boolean): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const period = seconds ? 1000 : 60_000
    // Alinha no início do segundo/minuto para o número virar na hora certa.
    const delay = period - (Date.now() % period)
    let interval: number | undefined
    const timeout = window.setTimeout(() => {
      setNow(new Date())
      interval = window.setInterval(() => setNow(new Date()), period)
    }, delay)

    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [seconds])

  return now
}

function formatTime(now: Date, hour12: boolean, seconds: boolean): string {
  const time = now.toLocaleTimeString('pt-BR', {
    hour: 'numeric',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hour12,
  })
  // Em 12h o pt-BR devolve "7:24 AM"; o handoff não mostra o sufixo.
  return time.replace(/\s?(AM|PM)$/i, '')
}

/** "QUINTA · 28 AGO", como no protótipo. */
function formatDate(now: Date): string {
  const weekday = now
    .toLocaleDateString('pt-BR', { weekday: 'long' })
    .replace(/-feira$/, '')
    .toUpperCase()
  const day = now.getDate()
  const month = now.toLocaleDateString('pt-BR', { month: 'short' }).replace(/\.$/, '').toUpperCase()

  return `${weekday} · ${day} ${month}`
}
