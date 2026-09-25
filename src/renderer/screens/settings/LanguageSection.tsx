import { type Idioma, t } from '@shared/i18n'
import { useHalo } from '@/store/useHalo'
import { Tabs } from '@/ui/Tabs'
import styles from '../SettingsScreen.module.css'

/**
 * O nome de cada idioma NA PRÓPRIA LÍNGUA, e não traduzido: quem abriu o app
 * numa língua que não lê precisa reconhecer a dele na lista.
 */
const IDIOMAS: readonly { value: Idioma; label: string }[] = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en', label: 'English' },
]

/**
 * Idioma — a língua da interface.
 *
 * Português é o padrão. A troca vale na hora em todas as janelas do Halo — o
 * app, a ilha, o lançador e os balões —, sem reiniciar.
 */
export function LanguageSection() {
  const idioma = useHalo((s) => s.language)
  const setLanguage = useHalo((s) => s.setLanguage)

  return (
    <>
      <div className={styles.header}>
        {/* Os dois nomes, sempre: é a seção que alguém perdido numa língua
            que não lê precisa achar. */}
        <span className={styles.eyebrow}>Idioma · Language</span>
        <span className={styles.title}>{t('Idioma da interface')}</span>
        <span className={styles.subtitle}>
          {t(
            'A língua de todas as telas, da ilha, do lançador e dos balões. A troca vale na hora, sem reiniciar.',
          )}
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Idioma')}</span>
        <Tabs label="Idioma · Language" options={IDIOMAS} value={idioma} onChange={setLanguage} />
        <span className={styles.note}>
          {t(
            'Os seus dados continuam como estão: nomes de arquivos, músicas, projetos e conversas não são traduzidos.',
          )}
        </span>
      </div>
    </>
  )
}
