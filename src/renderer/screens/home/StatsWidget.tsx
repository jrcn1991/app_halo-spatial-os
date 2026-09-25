import { Cpu } from '@phosphor-icons/react/dist/icons/Cpu'
import { GraphicsCard } from '@phosphor-icons/react/dist/icons/GraphicsCard'
import { Memory } from '@phosphor-icons/react/dist/icons/Memory'
import { Thermometer } from '@phosphor-icons/react/dist/icons/Thermometer'
import { t } from '@shared/i18n'
import type { StatGraphs } from '@shared/settings'
import { useValoresDoAmbiente } from '@/app/environment'
import { useHost } from '@/hooks/useLab'
import { cx } from '@/ui/cx'
import styles from './widgets.module.css'

/**
 * Os mini-stats da home.
 *
 * O handoff mostra DOIS, e eles são bateria e passthrough — coisas de headset.
 * Num desktop o par vira CPU e memória. Com a placa de vídeo e a
 * temperatura, a grade passou a ter quatro: a coluna
 * tinha folga de sobra abaixo dos dois primeiros. Divergência em MOCKS.md.
 *
 * Nenhum dos quatro inventa número. Sem leitura, o valor é um travessão e o
 * rótulo diz o porquê — é a mesma regra do resto do app.
 *
 * ## A cor de cada medidor é UMA variável
 *
 * Cada cartão diz o que mede em `data-halo-metrica` (cpu, memoria, gpu,
 * temperatura), e é o CSS que traduz isso em `--stat-tone` — lida pelo ícone
 * e pelo gráfico. Um tema que queira outra cor por medidor (o City Pop pinta
 * CPU de rosa e memória de ciano) redefine a variável pelo mesmo atributo, e
 * ícone e gráfico seguem juntos.
 *
 * MEDIDO: a primeira versão punha `--stat-tone` como estilo em linha, e
 * estilo em linha ganha de qualquer regra de tema — o City Pop ficou com as
 * cores da Floresta. Atributo lido pelo CSS é o caminho que o tema alcança.
 *
 * ## O gráfico é ajuste por ambiente
 *
 * `graficos` vem de `valoresDoAmbiente`: nenhum na Floresta (o handoff não tem
 * gráfico), onda no City Pop (a referência tem), e o que o usuário escolher em
 * Configurações → Widgets → Desempenho vale por cima, naquele ambiente.
 */
export function StatsWidget() {
  const { data: host } = useHost()
  const { graficos } = useValoresDoAmbiente()
  const ramPercent = host ? Math.round((host.memory.usedMb / host.memory.totalMb) * 100) : 0
  const gpu = host?.gpu ?? null
  const historico = host?.history

  return (
    <div className={styles.stats}>
      <div className={cx(styles.card, styles.stat)} data-halo-cartao="mini" data-halo-metrica="cpu">
        <Cpu size={18} color="var(--stat-tone)" />
        <div className={styles.statValue}>{host ? `${host.cpuPercent}%` : '—'}</div>
        <div className={styles.statLabel}>CPU</div>
        <Grafico modo={graficos} valores={historico?.cpu ?? []} />
      </div>
      <div
        className={cx(styles.card, styles.stat)}
        data-halo-cartao="mini"
        data-halo-metrica="memoria"
      >
        <Memory size={18} color="var(--stat-tone)" />
        <div className={styles.statValue}>{host ? `${ramPercent}%` : '—'}</div>
        <div className={styles.statLabel}>
          {host
            ? t('{gb} GB EM USO', { gb: (host.memory.usedMb / 1024).toFixed(1) })
            : t('MEMÓRIA')}
        </div>
        <Grafico modo={graficos} valores={historico?.memory ?? []} />
      </div>
      <div className={cx(styles.card, styles.stat)} data-halo-cartao="mini" data-halo-metrica="gpu">
        <GraphicsCard size={18} color="var(--stat-tone)" />
        <div className={styles.statValue}>{gpu ? `${gpu.usagePercent}%` : '—'}</div>
        {/* O nome da placa é longo demais para o cartão (95px): o rótulo mostra
            a temperatura dela, que é o que muda, e o nome inteiro fica no
            `title`. Sem placa legível o rótulo DIZ isso — ver `gpu.ts`. */}
        <div className={styles.statLabel} title={gpu?.name}>
          {!gpu
            ? t('SEM LEITURA')
            : gpu.temperatureC == null
              ? 'GPU'
              : `GPU · ${gpu.temperatureC}°`}
        </div>
        <Grafico modo={graficos} valores={historico?.gpu ?? []} />
      </div>
      <div
        className={cx(styles.card, styles.stat)}
        data-halo-cartao="mini"
        data-halo-metrica="temperatura"
      >
        <Thermometer size={18} color="var(--stat-tone)" />
        <div className={styles.statValue}>
          {host?.temperatureC == null ? '—' : `${host.temperatureC}°`}
        </div>
        <div className={styles.statLabel}>
          {host?.temperatureC == null ? t('SEM SENSOR') : t('TEMPERATURA')}
        </div>
        <Grafico modo={graficos} valores={historico?.temperature ?? []} />
      </div>
    </div>
  )
}

/** Quantas barras cabem no canto do cartão sem virar ruído. */
const BARRAS = 12

/**
 * Quanto a escala abre no mínimo, em pontos. Um histórico que variou 2 pontos
 * é ruído, não relevo — com este piso ele sai quase reto, como deve.
 */
const FAIXA_MINIMA = 12

/**
 * O histórico de um medidor, no canto do cartão.
 *
 * A escala é a da SÉRIE — do menor ao maior valor —, e não de zero a cem: é um
 * gráfico de tendência, e uma CPU que oscila entre 12% e 28% numa escala de 0
 * a 100 vira uma linha reta colada no chão (MEDIDO na primeira versão: os
 * quatro medidores saíam como fios). O piso `FAIXA_MINIMA` impede o outro
 * exagero — uma máquina parada, variando 2 pontos, não vira montanha.
 *
 * Com menos de duas leituras não há linha para traçar, e não se desenha nada.
 */
function Grafico({ modo, valores }: { modo: StatGraphs; valores: number[] }) {
  if (modo === 'none' || valores.length < 2) return null
  const menor = Math.min(...valores)
  const faixa = Math.max(FAIXA_MINIMA, Math.max(...valores) - menor)
  const altura = (valor: number) => (valor - menor) / faixa

  if (modo === 'bars') {
    return (
      <div className={cx(styles.grafico, styles.barras)} aria-hidden="true">
        {valores.slice(-BARRAS).map((valor, i) => (
          <div
            // A posição é a identidade: são fatias de tempo, não itens.
            // biome-ignore lint/suspicious/noArrayIndexKey: ver acima
            key={i}
            className={styles.barra}
            style={{ height: `${10 + altura(valor) * 90}%` }}
          />
        ))}
      </div>
    )
  }

  // 100×32 é só o sistema de coordenadas: `preserveAspectRatio="none"` estica
  // para o tamanho do cartão, e o traço não engrossa porque é
  // `non-scaling-stroke`.
  const ultimo = valores.length - 1
  const pontos = valores
    .map((valor, i) => `${((i / ultimo) * 100).toFixed(1)},${(30 - altura(valor) * 28).toFixed(1)}`)
    .join(' ')
  return (
    <svg
      className={cx(styles.grafico, styles.onda)}
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline points={pontos} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
