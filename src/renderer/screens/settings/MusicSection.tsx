import {
  redirectValido,
  SPOTIFY_DASHBOARD,
  SPOTIFY_REDIRECT_PADRAO,
  SPOTIFY_SCOPES,
} from '@shared/spotify'
import { useSpotifyAccount } from '@/hooks/useSpotify'
import { useHalo } from '@/store/useHalo'
import styles from '../SettingsScreen.module.css'

/**
 * Música — a conta do Spotify.
 *
 * Mesmo padrão da chave do TMDB, e pelo mesmo motivo: a credencial é do
 * usuário. O Halo não embute Client ID nenhum — num repositório aberto ele
 * seria entregue a quem clonasse, e um app do Spotify em modo de
 * desenvolvimento aceita no máximo 25 usuários cadastrados à mão.
 *
 * Sem Client ID a tela de Música diz isso e aponta para cá. Nunca inventa
 * playlist.
 */
export function MusicSection() {
  const clientId = useHalo((s) => s.spotifyClientId)
  const setClientId = useHalo((s) => s.setSpotifyClientId)
  const redirect = useHalo((s) => s.spotifyRedirect)
  const setRedirect = useHalo((s) => s.setSpotifyRedirect)
  const { auth, conectando, conectar, desconectar } = useSpotifyAccount(clientId)

  const conectado = auth?.state === 'signed-in'
  const emUso = redirect || SPOTIFY_REDIRECT_PADRAO
  const recusado = redirect.length > 0 && !redirectValido(redirect)

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Música · Spotify</span>
        <span className={styles.title}>Sua conta</span>
        <span className={styles.subtitle}>
          A tela de Música mostra as suas playlists, álbuns salvos e artistas, e comanda a
          reprodução. O áudio toca no aplicativo do Spotify ou em outro aparelho seu — não dentro do
          Halo.
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Client ID</span>
        <input
          className={styles.campo}
          type="password"
          value={clientId}
          placeholder="Client ID do seu app — cole aqui"
          aria-label="Client ID do Spotify"
          spellCheck={false}
          onChange={(e) => setClientId(e.target.value)}
        />
        <span className={styles.note}>
          Crie um app gratuito em {SPOTIFY_DASHBOARD} (menu do seu perfil → Dashboard → Create app),
          marque "Web API" e copie o Client ID. Ele fica só neste computador, no seu arquivo de
          configurações, e nunca vai para o repositório.
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Endereço de retorno</span>
        <input
          className={styles.campo}
          type="text"
          value={redirect}
          placeholder={SPOTIFY_REDIRECT_PADRAO}
          aria-label="Endereço de retorno do Spotify"
          spellCheck={false}
          onChange={(e) => setRedirect(e.target.value.trim())}
        />
        <span className={styles.note}>
          {recusado
            ? 'Este endereço o app não consegue atender. Ele precisa ser HTTP num endereço de ' +
              'loopback — o padrão continua valendo até você corrigir.'
            : `Em uso: ${emUso}`}
        </span>
        <span className={styles.note}>
          Este endereço precisa estar registrado em <em>Redirect URIs</em>, no mesmo formulário do
          app, escrito exatamente igual — é ali que o Spotify devolve a autorização. Sem isso a
          página de consentimento recusa com "INVALID_CLIENT: Invalid redirect URI".
        </span>
        <span className={styles.note}>
          Tem de ser <strong>http</strong> em <strong>127.0.0.1</strong> (ou <code>[::1]</code>). É
          a regra do próprio Spotify: "Use HTTPS for your redirect URI, unless you are using a
          loopback address, when HTTP is permitted" — e "localhost is not allowed". HTTPS aqui
          exigiria um certificado para um servidor dentro do seu computador, o que só renderia aviso
          vermelho no navegador. Se você registrou um <code>https://127.0.0.1:…</code>, troque o{' '}
          <code>https</code> por <code>http</code> no painel: é a única mudança necessária.
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Conexão</span>
        <span className={styles.note}>{descrever(auth, conectando)}</span>
        <div className={styles.stack}>
          <button
            type="button"
            className={`${styles.replay} ${styles.secondary}`}
            disabled={!clientId || conectando}
            onClick={conectar}
          >
            {conectado ? 'Conectar de novo' : 'Conectar'}
          </button>
          {conectado ? (
            <button
              type="button"
              className={`${styles.replay} ${styles.secondary}`}
              onClick={desconectar}
            >
              Desconectar
            </button>
          ) : null}
        </div>
        <span className={styles.note}>
          Conectar abre a página de autorização no seu navegador — nunca dentro do Halo: pedir a
          senha do Spotify numa janela nossa seria exatamente o que uma tela falsa faria. O app não
          vê a sua senha; o Spotify devolve só uma autorização, guardada aqui neste computador.
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Permissões pedidas</span>
        <span className={styles.note}>
          O app pede exatamente estes escopos, e cada um existe por causa de uma parte da tela.
          Autorizar menos não quebra o resto: o que faltar aparece como aviso, e o que veio continua
          funcionando.
        </span>
        <span className={styles.note}>
          <code>{SPOTIFY_SCOPES.join(' ')}</code>
        </span>
        <span className={styles.note}>
          Só reprodução (<code>user-read-playback-state</code> e{' '}
          <code>user-modify-playback-state</code>) dá o transporte, mas <strong>não</strong> lista
          playlists, álbuns salvos, artistas nem recentes — cada uma dessas depende de um escopo
          próprio da lista acima.
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>O que dá e o que não dá</span>
        <span className={styles.note}>
          Comandar a reprodução (tocar, pausar, pular, escolher uma playlist) exige{' '}
          <strong>Premium</strong> quando o comando vai para outro aparelho pela internet. Com o
          aplicativo do Spotify aberto neste computador, o Halo fala direto com ele pelo D-Bus e nem
          passa pela internet.
        </span>
        <span className={styles.note}>
          O áudio não pode tocar dentro do Halo: o Spotify entrega mídia protegida por DRM
          (Widevine), e o Electron não distribui esse módulo — medido neste app, onde
          <code>com.widevine.alpha</code> responde "Unsupported keySystem". Não é escolha de
          projeto, é o binário.
        </span>
      </div>
    </>
  )
}

function descrever(
  auth: ReturnType<typeof useSpotifyAccount>['auth'],
  conectando: boolean,
): string {
  if (conectando) return 'Autorize no navegador que acabou de abrir e volte para cá.'
  if (!auth) return 'Verificando…'
  switch (auth.state) {
    case 'no-client-id':
      return 'Informe o Client ID acima para poder conectar.'
    case 'signed-out':
      return 'Client ID informado. Falta você autorizar o acesso à sua conta.'
    case 'signed-in':
      return (
        `Conectado como ${auth.user.displayName || 'você'}` +
        (auth.user.product ? ` (${auth.user.product}).` : '.')
      )
    case 'error':
      return `Não deu: ${auth.message}`
  }
}
