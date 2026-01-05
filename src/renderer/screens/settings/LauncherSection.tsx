import { useHalo } from '@/store/useHalo'
import { Toggle } from '@/ui/Toggle'
import styles from '../SettingsScreen.module.css'

/**
 * Lançador — a janela de Meta+V.
 *
 * O mesmo motor do lançador da ilha, numa janela própria que veste o tema do
 * app. Ligar mexe numa coisa fora do app, e a tela diz qual: o Meta+V deixa de
 * abrir o menu de cópias do Klipper e passa a abrir o lançador. Desligar
 * devolve a tecla ao Klipper.
 */
export function LauncherSection() {
  const launcher = useHalo((s) => s.launcher)
  const setLauncher = useHalo((s) => s.setLauncher)

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Lançador · Meta+V</span>
        <span className={styles.title}>Lançador</span>
        <span className={styles.subtitle}>
          Uma janela no meio da tela para abrir aplicativos, rodar comandos da ilha, buscar cópias e
          janelas, fazer contas e conversões, e perguntar ao Claude. É o mesmo campo da ilha, com a
          roupa do tema.
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Atalho</span>
        <Toggle
          label="Abrir o lançador com Meta+V"
          checked={launcher.on}
          onChange={(on) => setLauncher({ on })}
        />
        <span className={styles.note}>
          Meta+V é o atalho do Klipper (o menu de cópias do Plasma). Ligado, o app tira a tecla do
          Klipper pelo kglobalaccel e a registra para o lançador — as cópias continuam acessíveis,
          na ilha e aqui. Desligado, a tecla volta ao Klipper na hora. É a única coisa que o
          lançador muda fora do app.
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Teclado</span>
        <span className={styles.note}>
          ↑↓ andam pela lista, Enter faz o que o rodapé diz, Esc limpa o campo e depois fecha.
          Perder o foco também fecha. Escrever <code>?</code> antes do texto pergunta ao Claude da
          ilha; <code>g</code>, <code>yt</code> e os outros atalhos de busca abrem no navegador.
        </span>
      </div>
    </>
  )
}
