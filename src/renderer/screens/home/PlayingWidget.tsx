import { Pause } from '@phosphor-icons/react/dist/icons/Pause'
import { Play } from '@phosphor-icons/react/dist/icons/Play'
import { t } from '@shared/i18n'
import { useNowPlaying } from '@/hooks/usePlayer'
import { useHalo } from '@/store/useHalo'
import { cx } from '@/ui/cx'
import styles from './widgets.module.css'

/**
 * "Tocando agora" — MPRIS de verdade.
 *
 * Vale para qualquer player que fale MPRIS (Spotify, VLC, navegador, tocadores
 * do KDE). Sem nada aberto, o card diz isso: não inventamos faixa.
 *
 * Clicar leva à tela de Música — salvo quando quem toca é o player do próprio
 * Halo: aí o lugar do que está tocando é a tela de Mídia.
 */
export function PlayingWidget() {
  const { data } = useNowPlaying()
  const setScreen = useHalo((s) => s.setScreen)

  const progress =
    data?.positionSec != null && data.durationSec
      ? Math.min(100, (data.positionSec / data.durationSec) * 100)
      : 0

  return (
    <button
      type="button"
      className={cx(styles.card, styles.playing)}
      data-halo-cartao="mini"
      onClick={() => setScreen(data?.isHalo ? 'media' : 'music')}
      // Dois sinais neutros, que a Floresta não lê. O Cyberpunk transforma este
      // card no banner de mídia da referência — grade interna, marcas de canto,
      // e a abertura a partir de uma linha —, e o equalizador só se mexe quando
      // há de fato som saindo. Ver `styles/env-cyberpunk.css`.
      data-halo-in="hud"
      data-tocando={data?.status === 'playing' ? 'sim' : undefined}
    >
      <div className={styles.playingLabel}>{t('TOCANDO AGORA')}</div>
      <div className={styles.playingRow}>
        <span
          className={styles.cover}
          style={data?.artUrl ? { backgroundImage: `url(${data.artUrl})` } : undefined}
        />
        <span className={styles.playingText}>
          <span className={styles.playingTitle}>{data ? data.title : t('Nada tocando')}</span>
          <span className={styles.playingArtist}>
            {data ? data.artist || data.player : t('Abra um player')}
          </span>
        </span>
        {data?.status === 'playing' ? (
          <Pause size={20} weight="fill" color="var(--text-dock-idle)" />
        ) : (
          <Play size={20} weight="fill" color="var(--text-dock-idle)" />
        )}
      </div>
      {/* `data-halo-medidor`: o Cyberpunk desenha toda barra assim marcada como
          a barra do HUD — trilho segmentado, pilha de brilho e a cabeça clara
          na ponta do preenchimento. Neutro na Floresta. */}
      <div className={styles.playingProgress} data-halo-medidor="faixa">
        <div className={styles.playingFill} style={{ width: `${progress}%` }} />
      </div>
    </button>
  )
}
