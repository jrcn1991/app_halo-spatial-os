import { ArrowsIn } from '@phosphor-icons/react/dist/icons/ArrowsIn'
import { ArrowsOut } from '@phosphor-icons/react/dist/icons/ArrowsOut'
import { CornersIn } from '@phosphor-icons/react/dist/icons/CornersIn'
import { Pause } from '@phosphor-icons/react/dist/icons/Pause'
import { Play } from '@phosphor-icons/react/dist/icons/Play'
import { PushPin } from '@phosphor-icons/react/dist/icons/PushPin'
import { SpeakerHigh } from '@phosphor-icons/react/dist/icons/SpeakerHigh'
import { SpeakerSlash } from '@phosphor-icons/react/dist/icons/SpeakerSlash'
import { X } from '@phosphor-icons/react/dist/icons/X'
import { t } from '@shared/i18n'
import type { PlayRequest } from '@shared/ipc-contract'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * O player.
 *
 * Mora numa janela própria (ver `src/main/services/player-window.ts`), e por
 * isso pode ser opaco, ficar por cima de tudo e ir a tela cheia de verdade —
 * nada disso a janela do app, transparente e presa na camada do desktop,
 * conseguiria fazer.
 *
 * Controles somem sozinhos enquanto se assiste e voltam ao primeiro movimento
 * do mouse ou toque de tecla.
 */

/** Quanto tempo parado até os controles saírem da frente. */
const OCIOSO_MS = 2600
/** O pulo das setas, em segundos. */
const PULO = 10

export function PlayerApp() {
  const video = useRef<HTMLVideoElement>(null)
  const [midia, setMidia] = useState<PlayRequest | null>(null)
  const [tocando, setTocando] = useState(false)
  const [tempo, setTempo] = useState(0)
  const [duracao, setDuracao] = useState(0)
  const [carregado, setCarregado] = useState(0)
  const [volume, setVolume] = useState(1)
  const [mudo, setMudo] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [cheia, setCheia] = useState(false)
  const [fixado, setFixado] = useState(false)
  // Fixar não existe no Wayland (ver `togglePinned` no main). O app abre em X11
  // justamente por isso, mas o botão nasce sabendo — se algum dia ele cair em
  // Wayland, é melhor dizer que não dá do que fingir que fixou.
  const [podeFixar, setPodeFixar] = useState(false)
  const [ativo, setAtivo] = useState(true)

  const acordar = useCallback(() => setAtivo(true), [])

  useEffect(() => {
    void window.halo?.player.pinSupported().then((suportado) => {
      setPodeFixar(suportado)
      setFixado(suportado)
    })
  }, [])

  // O main manda o que tocar — inclusive com a janela já aberta, que é como
  // trocar de episódio não abre um player novo.
  useEffect(() => {
    return window.halo?.player.onLoad((request) => {
      setMidia(request)
      setErro(null)
      setCarregando(true)
      setTempo(0)
      setDuracao(0)
    })
  }, [])

  /**
   * Conta ao main onde a reprodução está.
   *
   * De cinco em cinco segundos enquanto toca, e ao pausar ou sair — é isso que
   * alimenta o "Continuar assistindo". Mandar a cada quadro seria escrever no
   * disco dezenas de vezes por segundo.
   */
  useEffect(() => {
    const contar = () => {
      const elemento = video.current
      if (elemento && elemento.duration > 0) {
        window.halo?.player.progress(elemento.currentTime, elemento.duration)
      }
    }
    const relogio = setInterval(() => {
      if (video.current && !video.current.paused) contar()
    }, 5000)
    window.addEventListener('beforeunload', contar)
    return () => {
      clearInterval(relogio)
      window.removeEventListener('beforeunload', contar)
      contar()
    }
  }, [])

  // Fonte nova: recarrega e toca. `load()` é preciso porque trocar o `src` de
  // um <video> que já tocou não reinicia sozinho.
  useEffect(() => {
    const elemento = video.current
    if (!elemento || !midia) return
    elemento.load()

    // Continuidade: retoma no segundo salvo, assim que a duração é conhecida.
    // Antes disso `currentTime` seria descartado pelo Chromium.
    const retomar = () => {
      if (midia.startAt > 0 && midia.startAt < elemento.duration) {
        elemento.currentTime = midia.startAt
      }
    }
    elemento.addEventListener('loadedmetadata', retomar, { once: true })
    void elemento.play().catch(() => setTocando(false))
    return () => elemento.removeEventListener('loadedmetadata', retomar)
  }, [midia])

  const alternar = useCallback(() => {
    const elemento = video.current
    if (!elemento) return
    if (elemento.paused) void elemento.play().catch(() => undefined)
    else elemento.pause()
  }, [])

  const pular = useCallback((segundos: number) => {
    const elemento = video.current
    if (!elemento) return
    elemento.currentTime = Math.max(
      0,
      Math.min(elemento.duration || 0, elemento.currentTime + segundos),
    )
  }, [])

  const ajustarVolume = useCallback((valor: number) => {
    const elemento = video.current
    if (!elemento) return
    const alvo = Math.max(0, Math.min(1, valor))
    elemento.volume = alvo
    elemento.muted = alvo === 0
    setVolume(alvo)
    setMudo(alvo === 0)
  }, [])

  const telaCheia = useCallback(async () => {
    setCheia((await window.halo?.player.fullscreen()) ?? false)
  }, [])

  const fechar = useCallback(() => window.halo?.player.close(), [])

  /**
   * Declara ao sistema o que está tocando.
   *
   * Sem isto o Chromium publica no MPRIS o TÍTULO DA PÁGINA — e o "tocando
   * agora" da home mostrava "Halo · Player" em vez do filme. A Media Session é
   * o canal certo: ela alimenta o MPRIS, e com ele a home, o applet de mídia do
   * KDE e as teclas de mídia do teclado. Duração e posição o Chromium já tira
   * do próprio <video>; o que faltava era nome, legenda e capa.
   */
  useEffect(() => {
    const sessao = navigator.mediaSession
    if (!sessao || !midia) return

    sessao.metadata = new MediaMetadata({
      title: midia.title,
      artist: midia.subtitle,
      album: 'Halo',
      ...(midia.poster ? { artwork: [{ src: midia.poster, type: 'image/jpeg' }] } : {}),
    })

    // Teclas de mídia e o applet do sistema passam a comandar o player.
    sessao.setActionHandler('play', () => void video.current?.play())
    sessao.setActionHandler('pause', () => video.current?.pause())
    sessao.setActionHandler('seekbackward', () => pular(-PULO))
    sessao.setActionHandler('seekforward', () => pular(PULO))
    sessao.setActionHandler('seekto', (detalhe) => {
      if (video.current && typeof detalhe.seekTime === 'number') {
        video.current.currentTime = detalhe.seekTime
      }
    })

    return () => {
      sessao.metadata = null
      for (const acao of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto'] as const) {
        sessao.setActionHandler(acao, null)
      }
    }
  }, [midia, pular])

  // Atalhos de teclado. `preventDefault` no espaço evita a rolagem da página.
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      acordar()
      const tecla = evento.key.toLowerCase()
      if (tecla === ' ' || tecla === 'k') {
        evento.preventDefault()
        alternar()
      } else if (tecla === 'arrowright') pular(PULO)
      else if (tecla === 'arrowleft') pular(-PULO)
      else if (tecla === 'arrowup') ajustarVolume(volume + 0.1)
      else if (tecla === 'arrowdown') ajustarVolume(volume - 0.1)
      else if (tecla === 'f') void telaCheia()
      else if (tecla === 'm') ajustarVolume(mudo ? 1 : 0)
      else if (tecla === 'escape') {
        if (cheia) void telaCheia()
        else fechar()
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [acordar, alternar, ajustarVolume, cheia, fechar, mudo, pular, telaCheia, volume])

  // O mouse é ouvido na janela, não numa div: qualquer movimento acorda os
  // controles, inclusive por cima do próprio vídeo.
  useEffect(() => {
    window.addEventListener('mousemove', acordar)
    return () => window.removeEventListener('mousemove', acordar)
  }, [acordar])

  // Some com os controles depois de um tempo parado — mas nunca com o vídeo
  // pausado, quando o usuário provavelmente quer justamente mexer neles.
  useEffect(() => {
    if (!ativo || !tocando) return
    const relogio = setTimeout(() => setAtivo(false), OCIOSO_MS)
    return () => clearTimeout(relogio)
  }, [ativo, tocando])

  const progresso = duracao > 0 ? tempo / duracao : 0

  return (
    <div className="root" data-ativo={ativo || !tocando ? 'sim' : 'nao'}>
      <video
        ref={video}
        className="video"
        src={midia?.url}
        onClick={alternar}
        onDoubleClick={() => void telaCheia()}
        onPlay={() => {
          setTocando(true)
          if (navigator.mediaSession) navigator.mediaSession.playbackState = 'playing'
        }}
        onPause={() => {
          setTocando(false)
          if (navigator.mediaSession) navigator.mediaSession.playbackState = 'paused'
        }}
        onWaiting={() => setCarregando(true)}
        onPlaying={() => setCarregando(false)}
        onCanPlay={() => setCarregando(false)}
        onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuracao(e.currentTarget.duration || 0)}
        onProgress={(e) => {
          const buffer = e.currentTarget.buffered
          setCarregado(buffer.length ? buffer.end(buffer.length - 1) : 0)
        }}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume)
          setMudo(e.currentTarget.muted)
        }}
        onError={() =>
          setErro(t('Não consegui abrir este stream. O servidor pode estar fora do ar.'))
        }
      >
        {/* Faixa vazia: sem ela o Biome cobra legendas, e a lista não traz nenhuma. */}
        <track kind="captions" />
      </video>

      {carregando && !erro ? <div className="girando" /> : null}
      {erro ? <p className="erro">{erro}</p> : null}
      {!midia && !erro ? <p className="vazio">{t('Nada tocando.')}</p> : null}

      <header className="topo">
        <div className="titulo">
          <strong>{midia?.title ?? 'Halo · Player'}</strong>
          {midia?.subtitle ? <span>{midia.subtitle}</span> : null}
        </div>
        <div className="acoes">
          <Botao
            rotulo={
              podeFixar
                ? fixado
                  ? t('Desafixar')
                  : t('Manter por cima')
                : t('Manter por cima só existe no X11, e o app está em Wayland')
            }
            ativo={fixado}
            desabilitado={!podeFixar}
            aoClicar={async () => {
              const resultado = await window.halo?.player.pin()
              setFixado(resultado?.on ?? false)
              setPodeFixar(resultado?.supported ?? false)
            }}
          >
            <PushPin size={16} weight={fixado ? 'fill' : 'regular'} />
          </Botao>
          <Botao
            rotulo={t('Mini janela')}
            aoClicar={async () => {
              await window.halo?.player.mini()
            }}
          >
            <CornersIn size={16} />
          </Botao>
          <Botao rotulo={t('Fechar')} aoClicar={fechar}>
            <X size={16} />
          </Botao>
        </div>
      </header>

      <footer className="controles">
        <button
          type="button"
          className="barra"
          aria-label={t('Posição')}
          onClick={(e) => {
            const caixa = e.currentTarget.getBoundingClientRect()
            const elemento = video.current
            if (elemento && duracao > 0) {
              elemento.currentTime = ((e.clientX - caixa.left) / caixa.width) * duracao
            }
          }}
        >
          <span
            className="carregado"
            style={{ width: `${duracao ? (carregado / duracao) * 100 : 0}%` }}
          />
          <span className="tocado" style={{ width: `${progresso * 100}%` }} />
          <span className="bolinha" style={{ left: `${progresso * 100}%` }} />
        </button>

        <div className="linha">
          <Botao rotulo={tocando ? t('Pausar') : t('Tocar')} aoClicar={alternar}>
            {tocando ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
          </Botao>
          <span className="tempo">
            {formatar(tempo)} <i>/</i> {formatar(duracao)}
          </span>

          <div className="volume">
            <Botao
              rotulo={mudo ? t('Ativar som') : t('Silenciar')}
              aoClicar={() => ajustarVolume(mudo ? 1 : 0)}
            >
              {mudo || volume === 0 ? <SpeakerSlash size={18} /> : <SpeakerHigh size={18} />}
            </Botao>
            <input
              className="deslizante"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={mudo ? 0 : volume}
              aria-label={t('Volume')}
              onChange={(e) => ajustarVolume(Number(e.target.value))}
            />
          </div>

          <Botao
            rotulo={cheia ? t('Sair da tela cheia') : t('Tela cheia')}
            aoClicar={() => void telaCheia()}
          >
            {cheia ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}
          </Botao>
        </div>
      </footer>
    </div>
  )
}

function Botao({
  children,
  rotulo,
  ativo,
  desabilitado,
  aoClicar,
}: {
  children: React.ReactNode
  rotulo: string
  ativo?: boolean
  desabilitado?: boolean
  aoClicar: () => void | Promise<void>
}) {
  return (
    <button
      type="button"
      className="botao"
      data-ativo={ativo ? 'sim' : undefined}
      disabled={desabilitado}
      title={rotulo}
      aria-label={rotulo}
      onClick={() => void aoClicar()}
    >
      {children}
    </button>
  )
}

/** `1:04:12` quando passa da hora, `04:12` quando não passa. */
function formatar(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return '--:--'
  const total = Math.floor(segundos)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const doisDigitos = (valor: number) => String(valor).padStart(2, '0')
  return h > 0 ? `${h}:${doisDigitos(m)}:${doisDigitos(s)}` : `${doisDigitos(m)}:${doisDigitos(s)}`
}
