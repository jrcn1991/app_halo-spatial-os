import { X } from '@phosphor-icons/react/dist/icons/X'
import { t } from '@shared/i18n'
import { feedUrlValida, MAX_FEEDS } from '@shared/news'
import { useState } from 'react'
import { useNews } from '@/hooks/useNews'
import { useHalo } from '@/store/useHalo'
import styles from '../SettingsScreen.module.css'

/**
 * Notícias — os feeds RSS/Atom da coluna de leitura da home.
 *
 * A lista é do usuário, na ordem em que ele a montou: acrescentar põe no fim,
 * e nada aqui reordena. Cada feed mostra ao lado o que aconteceu na última
 * busca — nome, quantas manchetes, ou a frase do erro — para um endereço
 * errado não virar coluna vazia sem explicação.
 */
export function NewsSection() {
  const feeds = useHalo((s) => s.newsFeeds)
  const add = useHalo((s) => s.addNewsFeed)
  const remove = useHalo((s) => s.removeNewsFeed)
  const { data } = useNews()
  const [rascunho, setRascunho] = useState('')

  const limpo = rascunho.trim()
  const repetido = feeds.includes(limpo)
  const valido = limpo.length > 0 && feedUrlValida(limpo)
  const cheio = feeds.length >= MAX_FEEDS

  const adicionar = () => {
    if (!valido || repetido || cheio) return
    add(limpo)
    setRascunho('')
  }

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{t('Notícias · RSS')}</span>
        <span className={styles.title}>{t('Seus feeds')}</span>
        <span className={styles.subtitle}>
          {t(
            'As manchetes aparecem na coluna de leitura da Home, misturadas e da mais nova para a mais antiga, alternando com o tempo. Clicar numa abre a matéria no seu navegador.',
          )}
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Adicionar feed')}</span>
        <div className={styles.hexRow}>
          <input
            className={styles.campo}
            type="url"
            value={rascunho}
            placeholder={t('https://exemplo.com/feed')}
            aria-label={t('Endereço do feed')}
            spellCheck={false}
            onChange={(e) => setRascunho(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && adicionar()}
          />
          <button
            type="button"
            className={`${styles.replay} ${styles.secondary}`}
            style={{ marginTop: 0, padding: '10px 14px' }}
            disabled={!valido || repetido || cheio}
            onClick={adicionar}
          >
            {t('Adicionar')}
          </button>
        </div>
        <span className={styles.note}>
          {limpo && !valido
            ? t('O endereço precisa começar com http:// ou https://.')
            : repetido
              ? t('Esse feed já está na lista.')
              : cheio
                ? t('Já são {n} feeds — tire um para pôr outro.', { n: MAX_FEEDS })
                : t(
                    'RSS 2.0 e Atom. Cole o endereço do feed, não o da página: costuma terminar em /feed ou .xml.',
                  )}
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>
          {feeds.length === 0
            ? t('Nenhum feed')
            : t(feeds.length === 1 ? '{n} feed, na sua ordem' : '{n} feeds, na sua ordem', {
                n: feeds.length,
              })}
        </span>
        {feeds.length === 0 ? (
          <span className={styles.note}>
            {t(
              'Sem feed a coluna de leitura da Home fica vazia — e diz isso, em vez de inventar manchete.',
            )}
          </span>
        ) : (
          <div className={styles.lista}>
            {feeds.map((url) => {
              const estado = data?.feeds.find((f) => f.url === url)
              return (
                <div key={url} className={styles.linha}>
                  <span className={styles.linhaTexto}>
                    <span className={styles.linhaTitulo}>{estado?.name ?? url}</span>
                    <span className={styles.linhaDetalhe}>
                      {estado?.name ? `${url} · ` : ''}
                      {descrever(estado)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.linhaRemover}
                    aria-label={t('Remover {nome}', { nome: estado?.name ?? url })}
                    title={t('Remover')}
                    onClick={() => remove(url)}
                  >
                    <X size={13} weight="bold" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <span className={styles.note}>
          {t(
            'A busca acontece no processo principal, fica em cache por 15 minutos e desiste depois de 10 segundos sem resposta. Um feed fora do ar não derruba os outros: ele fica marcado aqui e na Home.',
          )}
        </span>
      </div>
    </>
  )
}

function descrever(estado: { count: number; error: string | null } | undefined): string {
  if (!estado) return t('buscando…')
  if (estado.error) {
    return estado.count > 0
      ? t('{erro} — mostrando a leitura anterior', { erro: estado.error })
      : t('não respondeu: {erro}', { erro: estado.error })
  }
  return t(estado.count === 1 ? '{n} manchete' : '{n} manchetes', { n: estado.count })
}
