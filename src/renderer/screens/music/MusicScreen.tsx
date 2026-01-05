import { ArrowSquareOut } from '@phosphor-icons/react/dist/icons/ArrowSquareOut'
import { Pause } from '@phosphor-icons/react/dist/icons/Pause'
import { Play } from '@phosphor-icons/react/dist/icons/Play'
import { Shuffle } from '@phosphor-icons/react/dist/icons/Shuffle'
import { SkipBack } from '@phosphor-icons/react/dist/icons/SkipBack'
import { SkipForward } from '@phosphor-icons/react/dist/icons/SkipForward'
import type {
  SpotifyDetail,
  SpotifyItem,
  SpotifyLibrary,
  SpotifyPlayback,
  SpotifyResult,
} from '@shared/spotify'
import { useEffect, useState } from 'react'
import {
  type Controle,
  useSpotifyAccount,
  useSpotifyControl,
  useSpotifyDetail,
  useSpotifyLibrary,
  useSpotifyPlayback,
} from '@/hooks/useSpotify'
import { type LibTab, useHalo } from '@/store/useHalo'
import { cx } from '@/ui/cx'
import { Panel } from '@/ui/Panel'
import { PanelRow } from '@/ui/PanelRow'
import { Tabs } from '@/ui/Tabs'
import styles from './music.module.css'

/**
 * Música — o Spotify do usuário.
 *
 * A biblioteca (playlists, álbuns salvos, artistas, ouvidos recentemente) vem
 * da Web API do Spotify, e o transporte fala com o aplicativo do Spotify desta
 * máquina pelo MPRIS. As duas coisas acontecem no processo main — ver
 * `src/main/services/spotify.ts`, que explica por que o áudio **não** toca
 * dentro do Halo (o Electron não traz Widevine, medido).
 *
 * Sem Client ID configurado, a tela diz isso e leva às Configurações. Ela
 * nunca inventa playlist — o conteúdo de exemplo só existe fora do Electron
 * (`test:screens`) e aparece etiquetado.
 *
 * Geometria: a mesma do protótipo — linha 1725, painéis 1728 / 1801 / 1918.
 * O que mudou foi o conteúdo, não a forma.
 */
export function MusicScreen() {
  const dock = useHalo((s) => s.appearance.dock)
  const navigation = useHalo((s) => s.appearance.navigation)
  const clientId = useHalo((s) => s.spotifyClientId)
  // Com a navegação embutida não há dock na base: a barra de transporte desce
  // para o lugar dele, como já faz quando o dock está em outro lado.
  const dockNaBase = navigation === 'floating' && dock === 'bottom'

  const conta = useSpotifyAccount(clientId)
  const biblioteca = useSpotifyLibrary(conta.auth)
  const controle = useSpotifyControl()
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const detalhe = useSpotifyDetail(escolhido, conta.auth)
  const tocando = useSpotifyPlayback(controle.nonce)

  const resultado = biblioteca.data
  const acervo = comConteudo(resultado)

  // Abrir a tela já mostrando alguma coisa: a primeira playlist é a escolha
  // que exige menos do usuário. Só na primeira vez — depois a escolha é dele.
  useEffect(() => {
    if (escolhido || !acervo) return
    const primeiro = acervo.playlists[0] ?? acervo.albums[0] ?? acervo.artists[0]
    if (primeiro) setEscolhido(primeiro.uri)
  }, [acervo, escolhido])

  return (
    <>
      {/* dockReserve: dos 254px de base, 96 são do dock. O resto é a barra de
          transporte, que continua embaixo mesmo com o dock em outro lado. */}
      <PanelRow gap={18} perspective={2600} padding="30px 34px 254px" dockReserve={96}>
        <Panel
          variant="side"
          w={250}
          h={548}
          radius={26}
          padding="18px 14px"
          gap={14}
          rest="rotateY(20deg) translateZ(-70px)"
          fromX={150}
        >
          <PainelBiblioteca
            resultado={resultado}
            carregando={biblioteca.loading}
            conta={conta}
            escolhido={escolhido}
            escolher={setEscolhido}
          />
        </Panel>

        <Panel variant="center" w={700} h={560} radius={28} overflow="hidden">
          <PainelCentral
            resultado={resultado}
            detalhe={detalhe.data ?? null}
            escolher={setEscolhido}
            carregando={biblioteca.loading}
            acervo={acervo}
            conta={conta}
            controle={controle}
          />
        </Panel>

        <Panel
          variant="side"
          glass={false}
          w={236}
          h={548}
          gap={14}
          rest="rotateY(-20deg) translateZ(-70px)"
          fromX={-150}
        >
          <PainelDireito acervo={acervo} tocando={tocando.data} escolher={setEscolhido} />
        </Panel>
      </PanelRow>

      <Transport bottom={dockNaBase ? 172 : 76} tocando={tocando.data} controle={controle} />
    </>
  )
}

/** O acervo, quando há um. `null` cobre carregando, falta de conta e erro. */
function comConteudo(resultado: SpotifyResult<SpotifyLibrary> | null): SpotifyLibrary | null {
  if (!resultado) return null
  return resultado.state === 'ok' || resultado.state === 'demo' ? resultado.value : null
}

/**
 * O que a tela mostra quando não há acervo.
 *
 * Cada motivo tem um caminho diferente, e nenhum deles é "lista vazia": a tela
 * sem conta configurada precisa dizer onde configurar, como a de Mídia faz
 * sem a chave do TMDB.
 */
type Situacao = { titulo: string; texto: string; acao: 'configurar' | 'conectar' | null }

function situacao(
  resultado: SpotifyResult<SpotifyLibrary> | null,
  carregando: boolean,
): Situacao | null {
  if (comConteudo(resultado)) return null
  if (!resultado) {
    return carregando
      ? { titulo: 'Carregando…', texto: 'Falando com o Spotify.', acao: null }
      : { titulo: 'Sem resposta', texto: 'O Spotify não respondeu.', acao: null }
  }

  switch (resultado.state) {
    case 'no-client-id':
      return {
        titulo: 'Conecte o seu Spotify',
        texto:
          'O Halo não embute credencial nenhuma: o Client ID é seu, criado de graça no painel ' +
          'de desenvolvedor do Spotify. Configurações → Música explica o passo a passo.',
        acao: 'configurar',
      }
    case 'signed-out':
      return {
        titulo: 'Falta autorizar',
        texto:
          'O Client ID já está aqui. Falta você autorizar o acesso à sua conta — a página abre ' +
          'no seu navegador, nunca dentro do Halo.',
        acao: 'conectar',
      }
    case 'error':
      return { titulo: 'Não deu', texto: resultado.message, acao: 'configurar' }
    default:
      return null
  }
}

function Aviso({
  situacao: s,
  conta,
  compacto,
}: {
  situacao: Situacao
  conta: Conta
  /** No painel estreito só o título e o botão cabem — o texto está no centro. */
  compacto?: boolean
}) {
  const setScreen = useHalo((st) => st.setScreen)
  const setSection = useHalo((st) => st.setSettingsSection)

  return (
    <div className={styles.aviso}>
      <span className={styles.avisoTitulo}>{s.titulo}</span>
      {compacto ? null : <span className={styles.avisoTexto}>{s.texto}</span>}
      {s.acao === 'configurar' ? (
        <button
          type="button"
          className={styles.avisoBotao}
          onClick={() => {
            setSection('music')
            setScreen('settings')
          }}
        >
          Abrir Configurações → Música
        </button>
      ) : s.acao === 'conectar' ? (
        <button
          type="button"
          className={styles.avisoBotao}
          disabled={conta.conectando}
          onClick={conta.conectar}
        >
          {conta.conectando ? 'Autorize no navegador…' : 'Conectar ao Spotify'}
        </button>
      ) : null}
    </div>
  )
}

type Conta = ReturnType<typeof useSpotifyAccount>

const ABAS: readonly { value: LibTab; label: string }[] = [
  { value: 'Playlists', label: 'Playlists' },
  { value: 'Álbuns', label: 'Álbuns' },
  { value: 'Artistas', label: 'Artistas' },
]

function PainelBiblioteca({
  resultado,
  carregando,
  conta,
  escolhido,
  escolher,
}: {
  resultado: SpotifyResult<SpotifyLibrary> | null
  carregando: boolean
  conta: Conta
  escolhido: string | null
  escolher: (uri: string) => void
}) {
  const aba = useHalo((s) => s.tabs.lib)
  const setTab = useHalo((s) => s.setTab)
  const acervo = comConteudo(resultado)
  const pendencia = situacao(resultado, carregando)

  const itens = !acervo
    ? []
    : aba === 'Álbuns'
      ? acervo.albums
      : aba === 'Artistas'
        ? acervo.artists
        : acervo.playlists

  return (
    <>
      <div className={styles.contaLinha}>
        <span className={styles.sideLabel}>SPOTIFY</span>
        {/* Conteúdo de exemplo NUNCA passa sem etiqueta: é a regra do projeto,
            e este estado só existe fora do Electron (ver MOCKS.md). */}
        {resultado?.state === 'demo' ? (
          <span className={styles.demoTag}>CONTEÚDO DE EXEMPLO</span>
        ) : null}
      </div>
      <span className={styles.contaNome}>{nomeDaConta(conta)}</span>
      {/* Escopo que o usuário não autorizou vira aviso, não lista vazia: uma
          coluna vazia diria "você não tem playlists", que seria falso. */}
      {acervo?.notice ? <span className={styles.notice}>{acervo.notice}</span> : null}

      {pendencia ? (
        <Aviso situacao={pendencia} conta={conta} compacto />
      ) : (
        <>
          <Tabs options={ABAS} value={aba} onChange={(v) => setTab('lib', v)} label="Biblioteca" />
          <div className={styles.playlists}>
            {itens.length === 0 ? (
              <span className={styles.vazio}>Nada por aqui na sua conta.</span>
            ) : (
              itens.map((item) => (
                <button
                  type="button"
                  key={item.uri}
                  className={cx(styles.playlist, escolhido === item.uri && styles.playlistOn)}
                  onClick={() => escolher(item.uri)}
                >
                  <Capa
                    url={item.image}
                    alt=""
                    className={cx(styles.cover, item.kind === 'artist' && styles.coverRound)}
                  />
                  <span className={styles.playlistTexto}>
                    <span className={styles.playlistName}>{item.name}</span>
                    <span className={styles.playlistMeta}>{item.meta}</span>
                  </span>
                  {item.tracks ? <span className={styles.playlistCount}>{item.tracks}</span> : null}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </>
  )
}

function nomeDaConta(conta: Conta): string {
  const auth = conta.auth
  if (conta.conectando) return 'autorizando no navegador…'
  if (!auth) return 'verificando…'
  if (auth.state === 'signed-in') {
    return auth.user.displayName || 'conectado'
  }
  return auth.state === 'no-client-id'
    ? 'não configurado'
    : auth.state === 'signed-out'
      ? 'não conectado'
      : 'com problema'
}

function PainelCentral({
  resultado,
  detalhe,
  carregando,
  acervo,
  conta,
  controle,
  escolher,
}: {
  resultado: SpotifyResult<SpotifyLibrary> | null
  detalhe: SpotifyResult<SpotifyDetail> | null
  carregando: boolean
  acervo: SpotifyLibrary | null
  conta: Conta
  controle: Controle
  /** Clicar num álbum da discografia abre ele — é navegação, não reprodução. */
  escolher: (uri: string) => void
}) {
  const pendencia = situacao(resultado, carregando)
  if (pendencia) {
    return (
      <div className={styles.centroVazio}>
        <Aviso situacao={pendencia} conta={conta} />
      </div>
    )
  }

  const item =
    detalhe && (detalhe.state === 'ok' || detalhe.state === 'demo') ? detalhe.value.item : null
  const faixas =
    detalhe && (detalhe.state === 'ok' || detalhe.state === 'demo') ? detalhe.value.tracks : []
  const discos =
    detalhe && (detalhe.state === 'ok' || detalhe.state === 'demo') ? detalhe.value.albums : []
  // Erro de rede e recusa do Spotify aparecem no mesmo lugar: os dois deixam o
  // painel sem lista, e o usuário precisa saber por quê nos dois casos.
  const aviso =
    detalhe?.state === 'error'
      ? detalhe.message
      : detalhe && (detalhe.state === 'ok' || detalhe.state === 'demo')
        ? detalhe.value.notice
        : ''

  return (
    <>
      <div className={styles.hero}>
        <Capa url={item?.image ?? ''} alt="" className={styles.heroArte} />
        <div className={styles.heroVeil}>
          <span className={styles.verified}>{item ? ROTULO[item.kind] : 'BIBLIOTECA'}</span>
          <span className={styles.artistName}>{item?.name ?? 'Escolha algo à esquerda'}</span>
          <span className={styles.listeners}>
            {item
              ? [item.meta, item.tracks ? `${item.tracks} FAIXAS` : '']
                  .filter(Boolean)
                  .join(' · ')
                  .toUpperCase()
              : ''}
          </span>
        </div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.playBig}
          aria-label="Tocar"
          disabled={!item}
          onClick={() => item && controle.tocar(item.uri)}
        >
          <Play size={22} weight="fill" />
        </button>
        <button type="button" className={styles.follow} onClick={controle.abrirSpotify}>
          Abrir no Spotify
        </button>
        {/* O comando pode não ter para onde ir (Spotify fechado, sem aparelho
            ativo). Engolir isso deixaria o botão parecendo quebrado. */}
        {controle.aviso ? <span className={styles.controlAviso}>{controle.aviso}</span> : null}
      </div>

      <div className={styles.columns}>
        <div className={styles.column}>
          <span className={styles.sideLabel}>
            {faixas.length === 0 && discos.length > 0 ? 'ÁLBUNS' : 'FAIXAS'}
          </span>

          {/* O aviso vem ANTES da lista: um painel que abre vazio sem
              explicação parece o app quebrado, e aqui o motivo é a permissão
              que o app do usuário tem no Spotify. */}
          {aviso ? <span className={styles.notice}>{aviso}</span> : null}

          {/* Sem faixas mas com discografia: é o caso do artista, cujas mais
              tocadas o Spotify recusa para apps em desenvolvimento. */}
          {faixas.length === 0 && discos.length > 0
            ? discos.map((disco) => (
                <button
                  type="button"
                  key={disco.uri}
                  className={styles.track}
                  onClick={() => escolher(disco.uri)}
                >
                  {disco.image ? (
                    <img className={styles.trackArte} src={disco.image} alt="" />
                  ) : (
                    <span className={styles.trackIndex}>♪</span>
                  )}
                  <span className={styles.trackTexto}>
                    <span className={styles.trackTitle}>{disco.name}</span>
                    <span className={styles.trackArtist}>{disco.meta}</span>
                  </span>
                </button>
              ))
            : null}

          {faixas.length === 0 && discos.length === 0 ? (
            <span className={styles.vazio}>—</span>
          ) : faixas.length === 0 ? null : (
            faixas.map((faixa, i) => (
              <button
                type="button"
                // A mesma faixa pode aparecer duas vezes numa playlist — e
                // "ouvidos recentemente" repete de propósito. A posição é o
                // que distingue as duas.
                // biome-ignore lint/suspicious/noArrayIndexKey: ver acima
                key={`${faixa.uri}-${i}`}
                className={styles.track}
                onClick={() => controle.tocar(faixa.uri)}
              >
                <span className={styles.trackIndex}>{i + 1}</span>
                <span className={styles.trackTexto}>
                  <span className={styles.trackTitle}>{faixa.name}</span>
                  <span className={styles.trackArtist}>{faixa.artists}</span>
                </span>
                <span className={styles.trackMeta}>{duracao(faixa.durationMs)}</span>
              </button>
            ))
          )}
        </div>

        <div className={styles.column}>
          <span className={styles.sideLabel}>OUVIDOS RECENTEMENTE</span>
          {(acervo?.recent ?? []).length === 0 ? (
            <span className={styles.vazio}>Nada ainda.</span>
          ) : (
            (acervo?.recent ?? []).slice(0, 12).map((faixa, i) => (
              <button
                type="button"
                // biome-ignore lint/suspicious/noArrayIndexKey: ver acima
                key={`${faixa.uri}-${i}`}
                className={styles.recentRow}
                onClick={() => controle.tocar(faixa.uri)}
              >
                <Capa url={faixa.image} alt="" className={styles.coverPequena} />
                <span className={styles.trackTexto}>
                  <span className={styles.trackTitle}>{faixa.name}</span>
                  <span className={styles.trackArtist}>{faixa.artists}</span>
                </span>
                <span className={styles.trackMeta}>{quando(faixa.playedAt)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}

const ROTULO: Record<SpotifyItem['kind'], string> = {
  playlist: 'PLAYLIST',
  album: 'ÁLBUM',
  artist: 'ARTISTA',
}

function PainelDireito({
  acervo,
  tocando,
  escolher,
}: {
  acervo: SpotifyLibrary | null
  tocando: SpotifyPlayback | null
  escolher: (uri: string) => void
}) {
  const faixa = tocando?.track ?? null
  const pct =
    faixa && faixa.durationMs > 0
      ? Math.min(100, ((tocando?.positionMs ?? 0) / faixa.durationMs) * 100)
      : 0

  return (
    <>
      {/* Os mesmos sinais neutros do card da home: no Cyberpunk este card vira
          o banner de mídia da referência. Ver `styles/env-cyberpunk.css`. */}
      <div
        className={styles.agoraCard}
        data-halo-in="hud"
        data-tocando={tocando?.playing ? 'sim' : undefined}
      >
        <Capa url={faixa?.image ?? ''} alt="" className={styles.agoraArte} />
        <div className={styles.agoraVeil}>
          <span className={styles.sideLabel}>
            {faixa ? (tocando?.playing ? 'TOCANDO AGORA' : 'PAUSADO') : 'NADA TOCANDO'}
          </span>
          <span className={styles.agoraTitulo}>{faixa?.name ?? '—'}</span>
          <span className={styles.agoraArtista}>
            {faixa?.artists ?? 'Abra o Spotify e toque algo'}
          </span>
          <div className={styles.progresso} data-halo-medidor="faixa">
            <div className={styles.progressoFill} style={{ width: `${pct}%` }} />
          </div>
          {tocando?.device ? <span className={styles.agoraFonte}>{tocando.device}</span> : null}
        </div>
      </div>

      <div className={styles.likesCard}>
        <span className={styles.sideLabel}>SEUS ARTISTAS</span>
        <div className={styles.likesList}>
          {(acervo?.artists ?? []).length === 0 ? (
            <span className={styles.vazio}>—</span>
          ) : (
            (acervo?.artists ?? []).slice(0, 8).map((artista) => (
              <button
                type="button"
                key={artista.uri}
                className={styles.like}
                onClick={() => escolher(artista.uri)}
              >
                <Capa
                  url={artista.image}
                  alt=""
                  className={cx(styles.coverPequena, styles.coverRound)}
                />
                <span className={styles.likeTitle}>{artista.name}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}

/**
 * Barra de transporte: comanda de verdade.
 *
 * Com o aplicativo do Spotify aberto, os comandos saem pelo MPRIS (D-Bus) e
 * não tocam a internet. Sem ele, vão pelo Spotify Connect, que precisa de
 * Premium e de um aparelho ativo — e quando não há, o aviso aparece no painel
 * central em vez de o botão parecer morto.
 */
function Transport({
  bottom,
  tocando,
  controle,
}: {
  bottom: number
  tocando: SpotifyPlayback | null
  controle: Controle
}) {
  const playing = tocando?.playing === true
  const faixa = tocando?.track

  return (
    <div className={styles.transport} data-halo-in="transport" style={{ bottom }}>
      <button
        type="button"
        className={cx(styles.transportButton, tocando?.shuffle && styles.transportOn)}
        aria-label="Aleatório"
        onClick={() => controle.comando('shuffle')}
      >
        <Shuffle size={21} />
      </button>
      <button
        type="button"
        className={styles.transportButton}
        aria-label="Anterior"
        onClick={() => controle.comando('previous')}
      >
        <SkipBack size={22} weight="fill" />
      </button>
      <button
        type="button"
        className={cx(styles.transportButton, styles.transportPlay)}
        aria-label={playing ? 'Pausar' : 'Tocar'}
        onClick={() => controle.comando(playing ? 'pause' : 'play')}
      >
        {playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
      </button>
      <button
        type="button"
        className={styles.transportButton}
        aria-label="Próxima"
        onClick={() => controle.comando('next')}
      >
        <SkipForward size={22} weight="fill" />
      </button>
      {/* O quinto botão do handoff era "letra", que não temos de onde tirar.
          Abrir o Spotify usa o mesmo lugar para algo que funciona de verdade
          (MPRIS `Raise`) e preserva os 290x72 exatos da barra. */}
      <button
        type="button"
        className={styles.transportButton}
        aria-label="Abrir o Spotify"
        title={faixa ? `${faixa.name} — ${faixa.artists}` : 'Abrir o aplicativo do Spotify'}
        onClick={controle.abrirSpotify}
      >
        <ArrowSquareOut size={21} />
      </button>
    </div>
  )
}

/**
 * Capa com queda para o listrado do handoff.
 *
 * `<img>` e não `background-image` de propósito: a URL vem da API do Spotify,
 * e montar `url(...)` com texto de fora seria injeção de CSS. Capa que não
 * carrega vira o placeholder, nunca um retângulo quebrado.
 */
function Capa({
  url,
  alt,
  className,
}: {
  url: string
  alt: string
  // `styles.x` é `string | undefined` por causa de `noUncheckedIndexedAccess`.
  className: string | undefined
}) {
  const [falhou, setFalhou] = useState(false)
  // Trocar de item troca a URL: o erro anterior não pode grudar na capa nova.
  // `url` não aparece no corpo do efeito, e é dependência exatamente por isso.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ver acima
  useEffect(() => setFalhou(false), [url])

  if (!url || falhou) return <span className={className} aria-hidden="true" />
  return (
    <img className={className} src={url} alt={alt} loading="lazy" onError={() => setFalhou(true)} />
  )
}

function duracao(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** "há 2h", "ontem" — o horário exato não cabe nem interessa na coluna. */
function quando(iso: string | null): string {
  if (!iso) return ''
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutos < 60) return `${minutos}min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `${horas}h`
  return `${Math.round(horas / 24)}d`
}
