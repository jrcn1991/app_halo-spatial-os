import { useCatalogStatus } from '@/hooks/useCatalog'
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

  const escolher = async () => {
    const caminho = await window.halo?.media.choose()
    if (caminho) setPlaylist(caminho)
  }

  const numero = (valor: number) => valor.toLocaleString('pt-BR')

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Mídia · Biblioteca</span>
        <span className={styles.title}>Lista de reprodução</span>
        <span className={styles.subtitle}>
          A biblioteca da tela de Mídia sai de um arquivo M3U do seu disco. Ele é lido de onde está
          — nada é copiado, baixado ou alterado.
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Arquivo</span>
        <span className={styles.note}>{playlist || 'Nenhuma lista escolhida.'}</span>
        <div className={styles.stack}>
          <button
            type="button"
            className={`${styles.replay} ${styles.secondary}`}
            onClick={() => void escolher()}
          >
            {playlist ? 'Trocar lista' : 'Escolher lista'}
          </button>
          {playlist ? (
            <button
              type="button"
              className={`${styles.replay} ${styles.secondary}`}
              onClick={() => setPlaylist('')}
            >
              Remover
            </button>
          ) : null}
        </div>
      </div>

      <ChaveTmdb />

      {playlist ? (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>O que foi encontrado</span>
          <span className={styles.note}>
            {status.loading
              ? 'Lendo a lista…'
              : status.data?.error
                ? status.data.error
                : status.data
                  ? `${numero(status.data.movies)} filmes e ${numero(status.data.series)} séries ` +
                    `(${numero(status.data.episodes)} episódios agrupados).`
                  : '—'}
          </span>
          <span className={styles.note}>
            Episódios do mesmo título entram agrupados em temporadas — uma lista real traz dezenas
            de milhares deles, e listá-los soltos não seria navegável.
          </span>
        </div>
      ) : null}
    </>
  )
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
      <span className={styles.sectionLabel}>Metadados (TMDB)</span>
      <input
        className={styles.campo}
        type="password"
        value={tmdbKey}
        placeholder="Chave da API — cole aqui"
        aria-label="Chave da API do TMDB"
        spellCheck={false}
        onChange={(e) => setTmdbKey(e.target.value)}
      />
      <span className={styles.note}>
        {tmdbKey
          ? 'Configurada. Sinopse, nota, gêneros, duração e elenco aparecem ao escolher um título.'
          : 'Sem chave, a tela mostra só o que a lista traz: nome, ano, categoria e capa.'}
      </span>
      <span className={styles.note}>
        A chave é gratuita: crie uma conta em themoviedb.org, vá em Configurações → API e copie a
        "API Key (v3 auth)" ou o "API Read Access Token" — o app aceita as duas. Ela fica só neste
        computador, no seu arquivo de configurações, e nunca vai para o repositório.
      </span>
      <span className={styles.note}>
        Este produto usa a API do TMDB, mas não é endossado nem certificado por eles. A atribuição é
        condição dos termos de uso, e aparece também junto dos dados na tela de Mídia.
      </span>
    </div>
  )
}
