import { marcar, t } from '@shared/i18n'
import type { DesktopModeResult, WindowSize } from '@shared/ipc-contract'
import { HIDEABLE_SCREENS } from '@shared/settings'
import { useEffect, useState } from 'react'
import { useHalo } from '@/store/useHalo'
import { DOCK_ITEMS } from '@/ui/Dock'
import { Tabs } from '@/ui/Tabs'
import { Toggle } from '@/ui/Toggle'
import styles from '../SettingsScreen.module.css'

/** "O maior que couber": o main limita ao que a tela comporta. */
export const MAX_SCALE = 99

const STEPS: readonly { value: string; label: string }[] = [
  { value: '1', label: marcar('Normal') },
  { value: '1.25', label: '+25%' },
  { value: '1.5', label: '+50%' },
  { value: '1.75', label: '+75%' },
  { value: String(MAX_SCALE), label: marcar('Máximo') },
]

/**
 * Janela — tamanho.
 *
 * O palco continua 1440x900 e todas as medidas do handoff continuam valendo;
 * quem cresce é a janela, e o `Stage` escala o palco inteiro para caber. Por
 * isso ampliar não desalinha nada.
 *
 * Os degraus que não cabem na tela ficam desabilitados em vez de mentir: numa
 * tela de 1920x1080, +25% já não cabe (o palco é 16:10, e a altura estoura
 * primeiro), e os três degraus dariam exatamente o mesmo tamanho.
 */
export function WindowSection() {
  const scale = useHalo((s) => s.appearance.scale)
  const setAppearance = useHalo((s) => s.setAppearance)
  const [applied, setApplied] = useState<WindowSize | null>(null)

  // A janela segue a escolha assim que ela muda. O "Restaurar padrão" da
  // Aparência NÃO mexe mais aqui: ele vive no painel direito de quase toda
  // seção, e zerava a ampliação de quem estava configurando outra coisa — sem
  // redimensionar nada, porque este efeito só existe com esta seção montada.
  useEffect(() => {
    void window.halo?.window.setScale(scale).then(setApplied)
  }, [scale])

  const max = applied?.max ?? MAX_SCALE
  const options = STEPS.map((step) => ({
    ...step,
    label: t(step.label),
    disabled: Number(step.value) !== MAX_SCALE && Number(step.value) > max + 0.001,
  }))

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{t('Janela · Tamanho')}</span>
        <span className={styles.title}>{t('Tamanho da janela')}</span>
        <span className={styles.subtitle}>
          {t('O palco continua 1440×900 e escala inteiro — ampliar não desalinha nada do handoff.')}
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Ampliação')}</span>
        <Tabs
          label={t('Tamanho da janela')}
          options={options}
          value={String(scale)}
          onChange={(next) => setAppearance({ scale: Number(next) })}
        />
        <span className={styles.note}>
          {applied
            ? t('Janela em {w}×{h}. Esta tela comporta até +{n}%.', {
                w: applied.width,
                h: applied.height,
                n: Math.round((applied.max - 1) * 100),
              })
            : t('Medindo a janela…')}
        </span>
      </div>

      <DesktopSection />
      <ArranqueSection />
      <ScreensSection />
    </>
  )
}

/**
 * Camada — o app sobre o desktop.
 *
 * Ligado, a janela fica sobre o papel de parede e nunca cobre outra janela do
 * computador: ela continua clicável, só não sobe. E o app reabre na mesma tela
 * e no mesmo lugar onde estava.
 *
 * Isto é o que o app é, e por isso vem ligado. A janela do player é outra
 * história e não entra nesta camada: ela pode ser fixada ACIMA de tudo, que é
 * o oposto — ver `src/main/services/player-window.ts`.
 *
 * O app já abre em X11, onde as duas coisas existem (ver `ensureX11` no main);
 * o aviso abaixo só aparece se, por alguma razão, ele não conseguiu.
 */
function DesktopSection() {
  const on = useHalo((s) => s.desktopMode)
  const setDesktopMode = useHalo((s) => s.setDesktopMode)
  const [resultado, setResultado] = useState<DesktopModeResult | null>(null)

  const alternar = (next: boolean) => {
    setDesktopMode(next)
    setResultado(null)
    void window.halo?.window.setDesktopMode(next).then(setResultado)
  }

  // Ligar fora do X11 (ou desligar tendo entrado nele) só vale na próxima
  // abertura — o servidor gráfico é escolhido antes do app existir.
  const precisaReabrir = resultado !== null && !resultado.applied

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>{t('Camada')}</span>
      <div className={styles.stack}>
        <Toggle label={t('Rodar sobre o desktop')} checked={on} onChange={() => alternar(!on)} />
      </div>
      <span className={styles.note}>
        {t(
          'O app fica sobre o papel de parede e nunca cobre outra janela — continua clicável, só não sobe para a frente. A janela também reabre na tela e na posição onde estava. A janela do player não entra nisto: ela pode ser fixada acima de tudo, pelo alfinete.',
        )}
      </span>
      {precisaReabrir ? (
        <>
          <span className={styles.note}>
            {t(
              'Não consegui aplicar agora: escolher a camada da janela só existe no X11, e o app está em Wayland. Reabrir resolve — o Halo abre em X11 sozinho quando há um servidor X.',
            )}
          </span>
          <button
            type="button"
            className={`${styles.replay} ${styles.secondary}`}
            onClick={() => window.halo?.window.relaunch()}
          >
            {t('Reabrir agora')}
          </button>
        </>
      ) : null}
    </div>
  )
}

/**
 * Arranque — o app nasce recolhido na ilha.
 *
 * Ligado, subir a máquina sobe a ilha e mais nada: a janela é criada e
 * carregada por trás (voltar é instantâneo), mas só aparece quando chamada —
 * Meta+Espaço, o botão do Halo na pílula ou o ícone da bandeja.
 *
 * A nota muda com a ilha desligada porque a promessa muda: sem ilha sobra a
 * bandeja, e sem as duas o main ignora a opção e abre o app à vista. Uma opção
 * não pode trancar o usuário para fora (ver `nasceRecolhido`, no main).
 */
function ArranqueSection() {
  const on = useHalo((s) => s.desktopStartHidden)
  const setStartHidden = useHalo((s) => s.setDesktopStartHidden)
  const ilha = useHalo((s) => s.island.on)

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>{t('Arranque')}</span>
      <div className={styles.stack}>
        <Toggle
          label={t('Começar recolhido na ilha')}
          checked={on}
          onChange={() => setStartHidden(!on)}
        />
      </div>
      <span className={styles.note}>
        {ilha
          ? t(
              'Ao abrir, sobe só a ilha. A janela espera ser chamada: Meta+Espaço, o botão do Halo na pílula ou o ícone da bandeja. Ela é carregada por trás, então voltar é instantâneo.',
            )
          : t(
              'Com a ilha desligada, quem traz o Halo de volta é o ícone da bandeja. Sem a ilha e sem bandeja o app abre à vista mesmo — uma opção não pode deixar você sem caminho de volta.',
            )}
      </span>
    </div>
  )
}

/**
 * Quais telas aparecem no dock.
 *
 * Desligar tira a tela do dock e, com isso, do alcance — inclusive dos atalhos.
 * Home e Configurações não entram na lista: sem a engrenagem não haveria como
 * voltar, e a home é o ponto de partida. Se a tela desligada for a que está
 * aberta, o app volta para a home em vez de deixar o usuário preso.
 */
function ScreensSection() {
  const hidden = useHalo((s) => s.hiddenScreens)
  const toggleScreen = useHalo((s) => s.toggleScreen)
  const hideable = DOCK_ITEMS.filter((item) =>
    (HIDEABLE_SCREENS as readonly string[]).includes(item.screen),
  )

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>{t('Janelas no dock')}</span>
      <div className={styles.stack}>
        {hideable.map((item) => (
          <Toggle
            key={item.screen}
            label={t(item.label)}
            checked={!hidden.includes(item.screen)}
            onChange={() => toggleScreen(item.screen)}
          />
        ))}
      </div>
      <span className={styles.note}>
        {t(
          'Home e Configurações não podem ser desligadas — sem a engrenagem não haveria como voltar.',
        )}
      </span>
    </div>
  )
}
