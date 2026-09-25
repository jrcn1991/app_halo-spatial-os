import { CaretLeft } from '@phosphor-icons/react/dist/icons/CaretLeft'
import { CaretRight } from '@phosphor-icons/react/dist/icons/CaretRight'
import { Cpu } from '@phosphor-icons/react/dist/icons/Cpu'
import { Pulse } from '@phosphor-icons/react/dist/icons/Pulse'
import { TerminalWindow } from '@phosphor-icons/react/dist/icons/TerminalWindow'
import { t } from '@shared/i18n'
import type { Container, Monitor } from '@/domain/types'
import { useContainers, useHost, useMachines, useMonitors } from '@/hooks/useLab'
import { useLatencyHistory } from '@/hooks/useLatencyHistory'
import { useHalo } from '@/store/useHalo'
import { cx } from '@/ui/cx'
import { Panel } from '@/ui/Panel'
import { PanelRow } from '@/ui/PanelRow'
import { Sparkline } from '@/ui/Sparkline'
import styles from './lab.module.css'

/**
 * Home Lab — a tela mais real do app.
 *
 * Tudo aqui é desta máquina: containers pelo CLI do Docker, CPU/RAM/temperatura
 * do /proc e /sys, e os "monitores" abrindo TCP nas portas que os containers
 * publicam — que é o mesmo teste que o Uptime Kuma do handoff faz.
 *
 * Geometria: protótipo linha 1091 (linha), 1094 / 1182 / 1350 (painéis).
 */
export function LabScreen() {
  return (
    <PanelRow gap={22} perspective={2400} padding="44px 40px 130px">
      <Panel
        variant="side"
        w={300}
        h={650}
        radius={28}
        padding="22px 16px"
        gap={16}
        rest="rotateY(17deg) translateZ(-50px)"
        fromX={150}
      >
        <MonitorsPanel />
      </Panel>

      <Panel variant="center" w={640} h={670} radius={30} overflow="hidden">
        <MachinesPanel />
      </Panel>

      <Panel
        variant="side"
        w={280}
        h={650}
        radius={28}
        padding="22px 16px"
        gap={16}
        rest="rotateY(-17deg) translateZ(-50px)"
        fromX={-150}
      >
        <ServicesPanel />
      </Panel>
    </PanelRow>
  )
}

/** Esquerda: disponibilidade dos serviços que rodam aqui. */
function MonitorsPanel() {
  const { data: monitors } = useMonitors()
  const history = useLatencyHistory(monitors)
  const list = monitors ?? []
  const up = list.filter((m) => m.up).length
  const rate = list.length ? ((up / list.length) * 100).toFixed(2).replace('.', ',') : '—'

  return (
    <>
      <div>
        <div className={styles.panelTitle}>
          <Pulse size={21} weight="fill" color="var(--accent-green)" />
          <span className={styles.panelTitleText}>{t('Monitores')}</span>
        </div>
        <div className={styles.headline}>
          <span className={styles.headlineValue}>{rate}%</span>
          <span className={styles.mono}>
            {t(list.length === 1 ? 'AGORA · {n} SERVIÇO' : 'AGORA · {n} SERVIÇOS', {
              n: list.length,
            })}
          </span>
        </div>
      </div>

      <div className={styles.list}>
        {list.slice(0, 3).map((monitor, i) => (
          <MonitorCard
            key={monitor.name}
            monitor={monitor}
            featured={i === 0}
            history={history.get(monitor.name) ?? []}
          />
        ))}

        {list.slice(3).map((monitor) => (
          <div key={monitor.name} className={styles.compact}>
            <span className={dotClass(monitor)} data-halo-in="pulse" />
            <span className={styles.monitorName}>{monitor.name}</span>
            <span className={styles.monitorValue}>
              {monitor.latencyMs === null ? 'DOWN' : `${monitor.latencyMs} MS`}
            </span>
          </div>
        ))}

        {list.length === 0 && (
          <span className={styles.empty}>
            {t('Nenhum container com porta publicada. Suba um serviço e ele aparece aqui.')}
          </span>
        )}
      </div>
    </>
  )
}

function MonitorCard({
  monitor,
  featured,
  history,
}: {
  monitor: Monitor
  featured: boolean
  history: number[]
}) {
  const slow = monitor.up && (monitor.latencyMs ?? 0) > 200

  return (
    <div className={featured ? `${styles.monitor} ${styles.monitorFeatured}` : styles.monitor}>
      <div className={styles.monitorHead}>
        <span className={dotClass(monitor)} data-halo-in="pulse" />
        <span className={styles.monitorName}>{monitor.name}</span>
        <span className={styles.monitorValue}>
          {monitor.latencyMs === null ? 'DOWN' : `${monitor.latencyMs} MS`}
        </span>
      </div>
      {history.length > 1 ? (
        <div className={styles.monitorGraph}>
          <Sparkline values={history} tone={monitor.up ? (slow ? 'warn' : 'ok') : 'down'} />
        </div>
      ) : (
        <div className={styles.monitorNote}>{monitor.target.toUpperCase()}</div>
      )}
    </div>
  )
}

function dotClass(monitor: Monitor): string {
  if (!monitor.up) return cx(styles.dot, styles.dotDown)
  return cx(styles.dot, (monitor.latencyMs ?? 0) > 200 && styles.dotWarn)
}

/** Centro: a máquina e seus containers. */
function MachinesPanel() {
  const { data: host } = useHost()
  const { data: machines } = useMachines()
  const { data: containers } = useContainers()
  const index = useHalo((s) => s.lab)
  const setLab = useHalo((s) => s.setLab)
  const nodes = machines ?? []
  const list = containers ?? []
  const running = list.filter((c) => c.state === 'running').length

  return (
    <>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Home Lab</div>
          <div className={styles.subtitle}>
            {host
              ? `${host.hostname.toUpperCase()} · DOCKER ${host.dockerVersion ?? '—'} · UPTIME ${host.uptimeDays} D`
              : t('LENDO A MÁQUINA…')}
          </div>
        </div>
        <div className={styles.spacer} />
        {/* Inerte, e dizendo que é: o botão não tinha handler e mesmo assim
            oferecia `cursor: pointer` e um hover que clareia — prometia uma
            ação que não existe. Ele FICA, porque é o desenho do handoff;
            ligá-lo pediria escolher terminal, host e credencial, que é
            funcionalidade nova e escolha do usuário. */}
        <button type="button" className={styles.action} disabled title={t('Em breve')}>
          <TerminalWindow size={15} />
          SSH
          <span className={styles.emBreve}>{t('EM BREVE')}</span>
        </button>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionLabel}>
            {t(nodes.length === 1 ? 'MÁQUINAS · {n} NÓ' : 'MÁQUINAS · {n} NÓS', {
              n: nodes.length,
            })}
          </span>
          <div className={styles.spacer} />
          <div className={styles.arrows}>
            <button
              type="button"
              aria-label={t('Anterior')}
              className={styles.arrow}
              onClick={() => setLab(Math.max(0, index - 1) as 0 | 1 | 2)}
            >
              <CaretLeft size={14} />
            </button>
            <button
              type="button"
              aria-label={t('Próxima')}
              className={cx(styles.arrow, styles.arrowActive)}
              onClick={() => setLab(Math.min(nodes.length - 1, index + 1) as 0 | 1 | 2)}
            >
              <CaretRight size={14} />
            </button>
          </div>
        </div>

        <div className={styles.carousel}>
          <div className={styles.track} style={{ transform: `translateX(${-230 * index}px)` }}>
            {nodes.map((machine) => (
              <div key={machine.name} className={styles.machine}>
                <div className={styles.machineHead}>
                  <Cpu size={18} weight="fill" color="var(--accent-green)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.machineName}>{machine.name}</div>
                    <div className={styles.machineRole}>{t(machine.role).toUpperCase()}</div>
                  </div>
                </div>
                <div className={styles.machineStats}>
                  <div>
                    CPU<span className={styles.machineStatValue}>{machine.cpuPercent}%</span>
                  </div>
                  <div>
                    RAM<span className={styles.machineStatValue}>{machine.memoryPercent}%</span>
                  </div>
                  <div>
                    TEMP
                    <span className={styles.machineStatValue}>
                      {machine.temperatureC === null ? '—' : `${machine.temperatureC}°`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.table}>
        {list.map((container) => (
          <div key={container.id} className={styles.row}>
            <span className={styles.rowName}>{container.name}</span>
            <span className={styles.rowImage}>{container.image}</span>
            <span className={cx(styles.badge, badgeClass(container))}>
              {container.status.toUpperCase()}
            </span>
          </div>
        ))}
        {list.length === 0 && (
          // Lista vazia tem três causas e a tela dizia sempre a pior. O serviço
          // devolve `[]` tanto no catch quanto quando o `docker ps -a` responde
          // certo sem nenhum container — e o rodapé logo abaixo já imprimia
          // "0 CONTAINERS · 0 ATIVOS", contradizendo a frase na mesma tela.
          // Quem distingue é a versão do Docker, que o `useHost` já traz.
          <span className={styles.empty}>
            {!host
              ? t('Lendo a máquina…')
              : host.dockerVersion === null
                ? t('Docker não respondeu — daemon parado ou ausente.')
                : t('Nenhum container por aqui.')}
          </span>
        )}
      </div>

      <div className={styles.footer}>
        <span>
          ↓ {host ? host.network.downMbs.toFixed(1) : '—'} MB/S · ↑{' '}
          {host ? host.network.upMbs.toFixed(1) : '—'} MB/S
        </span>
        <div className={styles.spacer} />
        <span>{t('{n} CONTAINERS · {ativos} ATIVOS', { n: list.length, ativos: running })}</span>
      </div>
    </>
  )
}

function badgeClass(container: Container): string {
  if (container.state === 'running') return cx(styles.badgeUp)
  if (container.state === 'restarting' || container.state === 'paused') return cx(styles.badgeWarn)
  return cx(styles.badgeDown)
}

/** Direita: os serviços com porta publicada viram atalhos de verdade. */
function ServicesPanel() {
  const { data: monitors } = useMonitors()
  const { data: host } = useHost()
  const list = monitors ?? []

  return (
    <>
      <div className={styles.card} data-halo-cartao="mini">
        <div className={styles.cardTitle}>{host?.hostname ?? t('Esta máquina')}</div>
        <div className={styles.mono} style={{ marginTop: 6 }}>
          {t('{no} DE {total} NO AR', { no: list.filter((m) => m.up).length, total: list.length })}
        </div>
      </div>

      <div className={styles.list}>
        <span className={styles.sectionLabel}>{t('SERVIÇOS')}</span>
        {list.map((monitor) => (
          <a
            key={monitor.name}
            className={styles.link}
            href={`http://${monitor.target}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className={dotClass(monitor)} />
            {monitor.name}
            <span className={styles.linkPort}>{monitor.target.split(':').at(-1)}</span>
          </a>
        ))}
      </div>
    </>
  )
}
