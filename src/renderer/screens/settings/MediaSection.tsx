import { localeDoIdioma, t } from '@shared/i18n'
import { TMDB_GUARDADA } from '@shared/settings'
import { useCatalogActions, useCatalogStatus } from '@/hooks/useCatalog'
import { useHalo } from '@/store/useHalo'
import styles from '../SettingsScreen.module.css'

/**
 * Mídia — de onde vem a biblioteca.
 *
 * O app não embute nem baixa lista nenhuma: o usuário aponta um arquivo M3U do
 * disco dele, e o processo main lê e indexa. A leitura é só leitura — nada é
 * escrito, movido ou apagado.
 */
export function MediaSection() {
  const playlist = useHalo((s) => s.playlist)
  const setPlaylist = useHalo((s) => s.setPlaylist)
  const status = useCatalogStatus(playlist)
  const { choose } = useCatalogActions()

  const escolher = async () => {
    const caminho = await choose()
    if (caminho) setPlaylist(caminho)
  }

  const numero = (valor: number) => valor.toLocaleString(localeDoIdioma())

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{t('Mídia · Biblioteca')}</span>
        <span className={styles.title}>{t('Lista de reprodução')}</span>
        <span className={styles.subtitle}>
          {t(
            'A biblioteca da tela de Mídia sai de um arquivo M3U do seu disco. Ele é lido de onde está — nada é copiado, baixado ou alterado.',
          )}
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Arquivo')}</span>
        <span className={styles.note}>{playlist || t('Nenhuma lista escolhida.')}</span>
        <div className={styles.stack}>
          <button
            type="button"
            className={`${styles.replay} ${styles.secondary}`}
            onClick={() => void escolher()}
          >
            {playlist ? t('Trocar lista') : t('Escolher lista')}
          </button>
          {playlist ? (
            <button
              type="button"
              className={`${styles.replay} ${styles.secondary}`}
              onClick={() => setPlaylist('')}
            >
              {t('Remover')}
            </button>
          ) : null}
        </div>
      </div>

      <ChaveTmdb />

      {playlist ? (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>{t('O que foi encontrado')}</span>
          <span className={styles.note}>
            {status.loading
              ? t('Lendo a lista…')
              : status.data?.error
                ? status.data.error
                : status.data
                  ? t('{filmes} filmes e {series} séries ({episodios} episódios agrupados).', {
                      filmes: numero(status.data.movies),
                      series: numero(status.data.series),
                      episodios: numero(status.data.episodes),
                    })
                  : '—'}
          </span>
          <span className={styles.note}>
            {t(
              'Episódios do mesmo título entram agrupados em temporadas — uma lista real traz dezenas de milhares deles, e listá-los soltos não seria navegável.',
            )}
          </span>
        </div>
      ) : null}
    </>
  )
}

/**
 * O que o campo da chave vira depois de uma edição.
 *
 * Com chave guardada, o campo mostra `TMDB_GUARDADA` — a chave de verdade
 * ficou no main e não viaja para cá (ver `paraRenderer`). O campo é de
 * senha, então a marca aparece como os pontinhos de sempre. Editar em cima
 * dela: apagar um caractere apaga a chave; colar por cima de tudo, ou
 * digitar depois, fica só com o que foi digitado — a marca nunca vai para o
 * disco como se fosse chave.
 */
function novaChave(atual: string, digitado: string): string {
  if (atual !== TMDB_GUARDADA) return digitado
  if (digitado.length < TMDB_GUARDADA.length) return ''
  return digitado.replace(TMDB_GUARDADA, '')
}

/**
 * A chave do TMDB.
 *
 * A lista M3U traz nome, ano, categoria e capa — nada mais. Sinopse, nota,
 * gêneros, duração e elenco vêm do TMDB, a mesma base que o Jellyfin usa.
 *
 * A chave é do usuário porque tem de ser: o TMDB recusa pedidos sem uma, e
 * embutir a do app num repositório aberto entregaria a chave a quem clonasse.
 * É gratuita e leva um minuto.
 */
function ChaveTmdb() {
  const tmdbKey = useHalo((s) => s.tmdbKey)
  const setTmdbKey = useHalo((s) => s.setTmdbKey)

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>{t('Metadados (TMDB)')}</span>
      <input
        className={styles.campo}
        type="password"
        value={tmdbKey}
        placeholder={t('Chave da API — cole aqui')}
        aria-label={t('Chave da API do TMDB')}
        spellCheck={false}
        onChange={(e) => setTmdbKey(novaChave(tmdbKey, e.target.value))}
      />
      <span className={styles.note}>
        {tmdbKey
          ? t(
              'Configurada. Sinopse, nota, gêneros, duração e elenco aparecem ao escolher um título.',
            )
          : t('Sem chave, a tela mostra só o que a lista traz: nome, ano, categoria e capa.')}
      </span>
      <span className={styles.note}>
        {t(
          'A chave é gratuita: crie uma conta em themoviedb.org, vá em Configurações → API e copie a "API Key (v3 auth)" ou o "API Read Access Token" — o app aceita as duas. Ela fica só neste computador, no seu arquivo de configurações, e nunca vai para o repositório.',
        )}
      </span>
      <span className={styles.note}>
        {t(
          'Este produto usa a API do TMDB, mas não é endossado nem certificado por eles. A atribuição é condição dos termos de uso, e aparece também junto dos dados na tela de Mídia.',
        )}
      </span>
    </div>
  )
}
