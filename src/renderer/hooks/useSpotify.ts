import type {
  SpotifyAuth,
  SpotifyCommand,
  SpotifyDetail,
  SpotifyLibrary,
  SpotifyPlayback,
  SpotifyResult,
} from '@shared/spotify'
import { useCallback, useEffect, useRef, useState } from 'react'
import { repositories } from '@/data'
import { type Async, useAsync } from './useAsync'

/**
 * Spotify, do jeito que as telas consomem.
 *
 * Componente nenhum importa `data/` — trocar o mock pelo serviço real não pode
 * encostar em componente. Todo estado de erro chega embrulhado em
 * `SpotifyResult`, porque "sem Client ID", "não conectado" e "deu erro" são
 * três telas diferentes.
 */

/** A faixa anda; 2s mantém a barra viva sem martelar o D-Bus. */
const POLL_MS = 2000

export type Conta = {
  auth: SpotifyAuth | null
  /** Ligando: o consentimento está aberto no navegador do sistema. */
  conectando: boolean
  conectar: () => void
  desconectar: () => void
}

/**
 * Situação da conta.
 *
 * `clientId` entra nas dependências para que informar (ou apagar) o Client ID
 * em Configurações se reflita na hora, sem reabrir o app — o mesmo que a chave
 * do TMDB faz na tela de Mídia.
 */
export function useSpotifyAccount(clientId: string): Conta {
  const [auth, setAuth] = useState<SpotifyAuth | null>(null)
  const [conectando, setConectando] = useState(false)

  // `clientId` não é usado no corpo, e é dependência de propósito: informar (ou
  // apagar) o Client ID em Configurações precisa reconsultar a conta sem
  // reabrir o app. É o mesmo motivo de `tmdbKey` em `useTitleExtra`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ver acima
  useEffect(() => {
    let vivo = true
    repositories.spotify
      .auth()
      .then((a) => vivo && setAuth(a))
      .catch((erro: Error) => vivo && setAuth({ state: 'error', message: erro.message }))
    return () => {
      vivo = false
    }
  }, [clientId])

  const conectar = useCallback(() => {
    setConectando(true)
    repositories.spotify
      .connect()
      .then(setAuth)
      .catch((erro: Error) => setAuth({ state: 'error', message: erro.message }))
      .finally(() => setConectando(false))
  }, [])

  const desconectar = useCallback(() => {
    repositories.spotify
      .disconnect()
      .then(setAuth)
      .catch(() => setAuth({ state: 'signed-out' }))
  }, [])

  return { auth, conectando, conectar, desconectar }
}

/** Chave que muda quando a conta muda — é o que refaz as buscas ao conectar. */
function chaveDaConta(auth: SpotifyAuth | null): string {
  if (!auth) return 'carregando'
  return auth.state === 'signed-in' ? `in:${auth.user.displayName}` : auth.state
}

export function useSpotifyLibrary(auth: SpotifyAuth | null): Async<SpotifyResult<SpotifyLibrary>> {
  return useAsync(() => repositories.spotify.library(), [chaveDaConta(auth)])
}

/** As faixas do item escolhido. Sem escolha, não busca nada. */
export function useSpotifyDetail(
  uri: string | null,
  auth: SpotifyAuth | null,
): Async<SpotifyResult<SpotifyDetail> | null> {
  return useAsync(
    () => (uri ? repositories.spotify.detail(uri) : Promise.resolve(null)),
    [uri, chaveDaConta(auth)],
  )
}

/**
 * O que está tocando, atualizado sozinho.
 *
 * `nonce` existe para o comando refletir na hora: sem ele, apertar pausa
 * deixaria o botão errado até o próximo ciclo do relógio.
 */
export function useSpotifyPlayback(nonce: number): Async<SpotifyPlayback> {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), POLL_MS)
    return () => clearInterval(id)
  }, [])

  return useAsync(() => repositories.spotify.playback(), [tick, nonce])
}

export type Controle = {
  comando: (comando: SpotifyCommand) => void
  tocar: (uri: string) => void
  /** Traz a janela do aplicativo do Spotify para a frente. */
  abrirSpotify: () => void
  /** O que deu errado no último comando. Vazio quando deu certo. */
  aviso: string
  /** Sobe a cada comando: quem lê o transporte relê logo depois. */
  nonce: number
}

export function useSpotifyControl(): Controle {
  const [aviso, setAviso] = useState('')
  const [nonce, setNonce] = useState(0)
  // Um comando por vez: clicar rápido em "próxima" não pode empilhar pedidos.
  const ocupado = useRef(false)

  const executar = useCallback((acao: () => Promise<{ done: boolean; message: string }>) => {
    if (ocupado.current) return
    ocupado.current = true
    acao()
      .then((r) => setAviso(r.done ? '' : r.message))
      .catch((erro: Error) => setAviso(erro.message))
      .finally(() => {
        ocupado.current = false
        setNonce((n) => n + 1)
      })
  }, [])

  return {
    comando: useCallback(
      (comando: SpotifyCommand) => executar(() => repositories.spotify.control(comando)),
      [executar],
    ),
    tocar: useCallback((uri: string) => executar(() => repositories.spotify.play(uri)), [executar]),
    abrirSpotify: useCallback(() => executar(() => repositories.spotify.raise()), [executar]),
    aviso,
    nonce,
  }
}
