import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { redirectValido, SPOTIFY_REDIRECT_PADRAO, SPOTIFY_SCOPES } from '@shared/spotify'
import { shell } from 'electron'
import { currentSettings, saveSpotifyToken } from '../settings'

/**
 * OAuth do Spotify — Authorization Code + PKCE.
 *
 * ## Por que PKCE, e não os outros fluxos
 *
 * - *Client Credentials* não serve: ele autentica o **app**, não a pessoa, e
 *   não alcança playlists nem o aparelho de ninguém.
 * - *Authorization Code* clássico exige um **client secret**, que num app
 *   desktop de código aberto seria distribuído junto do binário — ou seja, não
 *   seria segredo. O próprio Spotify manda usar PKCE nesse caso.
 * - *Implicit Grant* está descontinuado e não dá refresh token: o usuário
 *   teria de reconectar a cada hora.
 *
 * ## Por que o Client ID é do usuário
 *
 * Mesmo sem secret, o Client ID identifica um app registrado no painel do
 * Spotify. Embutir o do projeto num repositório aberto entregaria a cota e a
 * identidade dele a quem clonasse — e apps em modo de desenvolvimento aceitam
 * no máximo 25 usuários cadastrados à mão. É a mesma regra da chave do TMDB:
 * a credencial é do usuário e mora em `~/.config/halo-spatial-os/settings.json`.
 *
 * ## Por que um servidor de loopback
 *
 * O consentimento acontece no navegador do sistema (nunca dentro do app: pedir
 * a senha do Spotify numa janela nossa é exatamente o que uma tela de phishing
 * faria). O Spotify então redireciona para um endereço; num app desktop o
 * endereço possível é o loopback, que este arquivo escuta pelo tempo do
 * consentimento e fecha em seguida.
 */

/** Só o tempo do consentimento: o servidor não fica escutando à toa. */
const TIMEOUT_MS = 3 * 60 * 1000
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
/** Margem para não usar um token que expira no meio da requisição. */
const EXPIRY_SLACK_MS = 60_000

/** Falta o Client ID: nem dá para começar o consentimento. */
export class SemClientId extends Error {
  constructor() {
    super('sem Client ID do Spotify')
  }
}

/** Tem Client ID, mas ninguém conectou (ou o refresh token foi recusado). */
export class SemConexao extends Error {
  constructor(message = 'não conectado ao Spotify') {
    super(message)
  }
}

/**
 * O token de acesso vive só na memória do processo main.
 *
 * Ele dura uma hora e é reemitido a partir do refresh token; guardá-lo em
 * disco só aumentaria a superfície de um segredo descartável.
 */
let acesso: { token: string; expiraEm: number } | undefined
/** Um consentimento por vez: dois servidores na mesma porta não sobem. */
let emAndamento: Promise<{ ok: boolean; message: string }> | undefined

export function clientId(): string {
  return currentSettings().music.spotifyClientId
}

/**
 * O endereço de retorno que vale agora.
 *
 * O do usuário, quando ele registrou outro no painel do Spotify; senão o
 * padrão. Já validado em `parseSettings` (HTTP em loopback), mas conferido de
 * novo aqui porque este é o ponto que abre porta na máquina.
 */
export function redirectUri(): string {
  const escolhido = currentSettings().music.spotifyRedirect
  return redirectValido(escolhido) ? escolhido : SPOTIFY_REDIRECT_PADRAO
}

export function conectado(): boolean {
  return Boolean(currentSettings().music.spotifyRefreshToken)
}

/** Esquece a conexão. O token de acesso na memória morre junto. */
export function desconectar(): void {
  acesso = undefined
  saveSpotifyToken('')
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Token de acesso válido, renovando quando preciso.
 *
 * Lança `SemClientId` ou `SemConexao` — quem chama traduz para o estado que a
 * tela mostra. Erro de rede sobe como está.
 */
export async function accessToken(): Promise<string> {
  const id = clientId()
  if (!id) throw new SemClientId()

  if (acesso && acesso.expiraEm - EXPIRY_SLACK_MS > Date.now()) return acesso.token

  const refresh = currentSettings().music.spotifyRefreshToken
  if (!refresh) throw new SemConexao()

  const corpo = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh,
    client_id: id,
  })

  const resposta = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo,
  })

  if (!resposta.ok) {
    // 400 `invalid_grant` é o caso real de quem revogou o acesso no site do
    // Spotify: o refresh token não volta a valer, e insistir com ele a cada
    // leitura só renderia 400 para sempre.
    if (resposta.status === 400 || resposta.status === 401) {
      saveSpotifyToken('')
      throw new SemConexao('o Spotify recusou a conexão salva — conecte de novo')
    }
    throw new Error(`Spotify recusou renovar o acesso (HTTP ${resposta.status})`)
  }

  const dados = (await resposta.json()) as {
    access_token?: string
    expires_in?: number
    refresh_token?: string
  }
  if (!dados.access_token) throw new Error('renovação sem token de acesso')

  // O Spotify pode devolver um refresh token novo; ignorar isso quebraria a
  // conexão silenciosamente quando o antigo fosse rotacionado.
  if (dados.refresh_token && dados.refresh_token !== refresh) {
    saveSpotifyToken(dados.refresh_token)
  }

  acesso = { token: dados.access_token, expiraEm: Date.now() + (dados.expires_in ?? 3600) * 1000 }
  return acesso.token
}

/** Força a próxima chamada a renovar — usado quando a API responde 401. */
export function invalidarAcesso(): void {
  acesso = undefined
}

/**
 * Abre o consentimento no navegador e espera o retorno no loopback.
 *
 * Devolve sempre — nunca lança —, porque "a porta está ocupada" e "o usuário
 * fechou a aba" são desfechos normais que a tela precisa poder mostrar.
 */
export function conectar(): Promise<{ ok: boolean; message: string }> {
  if (emAndamento) return emAndamento
  emAndamento = executarConsentimento().finally(() => {
    emAndamento = undefined
  })
  return emAndamento
}

async function executarConsentimento(): Promise<{ ok: boolean; message: string }> {
  const id = clientId()
  if (!id) return { ok: false, message: 'informe o Client ID antes de conectar' }

  const verifier = base64url(randomBytes(64))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))

  const alvo = new URL(redirectUri())
  let servidor: Server
  try {
    servidor = await escutar(alvo)
  } catch (erro) {
    return {
      ok: false,
      message:
        `não consegui escutar em ${alvo.href} (${(erro as Error).message}). ` +
        'Feche o que estiver usando essa porta, ou mude o endereço de retorno em Configurações.',
    }
  }

  // O endereço que vai no pedido é o que o servidor REALMENTE assumiu. Só
  // muda quando o usuário registrou o loopback sem porta — caso que a própria
  // documentação do Spotify prevê ("You can add the dynamically assigned port
  // number to the authorization request").
  const porta = (servidor.address() as { port: number }).port
  const redirect = alvo.port
    ? alvo.href
    : `${alvo.protocol}//${alvo.hostname}:${porta}${alvo.pathname}${alvo.search}`

  const url = new URL(AUTHORIZE_URL)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: id,
    redirect_uri: redirect,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SPOTIFY_SCOPES.join(' '),
  }).toString()

  const retorno = esperarRetorno(servidor, state, alvo.pathname)
  await shell.openExternal(url.toString())

  const resultado = await retorno
  servidor.close()

  if ('erro' in resultado) return { ok: false, message: resultado.erro }

  try {
    await trocarCodigo(resultado.code, verifier, id, redirect)
    return { ok: true, message: 'conectado' }
  } catch (erro) {
    return { ok: false, message: (erro as Error).message }
  }
}

function escutar(alvo: URL): Promise<Server> {
  const servidor = createServer()
  return new Promise((resolve, reject) => {
    servidor.once('error', reject)
    // Sem porta no endereço registrado, o 0 pede uma livre ao sistema.
    servidor.listen(Number(alvo.port) || 0, alvo.hostname.replace(/[[\]]/g, ''), () => {
      servidor.removeListener('error', reject)
      resolve(servidor)
    })
  })
}

/** A resposta que o navegador mostra quando o consentimento termina. */
function pagina(titulo: string, texto: string): string {
  return (
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    `<title>${titulo}</title></head><body style="font-family:system-ui;background:#0e1512;` +
    `color:#f2f0f5;display:grid;place-items:center;height:100vh;margin:0;text-align:center">` +
    `<div><h1 style="font-weight:600">${titulo}</h1><p>${texto}</p></div></body></html>`
  )
}

type Retorno = { code: string } | { erro: string }

function esperarRetorno(servidor: Server, state: string, caminho: string): Promise<Retorno> {
  return new Promise((resolve) => {
    const prazo = setTimeout(() => {
      resolve({ erro: 'o consentimento demorou demais — tente de novo' })
    }, TIMEOUT_MS)

    const terminar = (resultado: Retorno, titulo: string, texto: string) => {
      clearTimeout(prazo)
      resolve(resultado)
      return { titulo, texto }
    }

    servidor.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== caminho) {
        res.writeHead(404).end()
        return
      }

      const code = url.searchParams.get('code')
      const devolvido = url.searchParams.get('state')
      const negado = url.searchParams.get('error')

      // `state` é a defesa contra alguém chamar este endereço por fora: sem
      // conferir, qualquer página aberta no navegador poderia empurrar um
      // código de autorização de outra conta para dentro do app.
      const resposta = negado
        ? terminar({ erro: `o Spotify recusou: ${negado}` }, 'Não deu', 'Pode fechar esta aba.')
        : devolvido !== state
          ? terminar(
              { erro: 'a resposta do Spotify não bateu com o pedido' },
              'Não deu',
              'A resposta não bateu com o pedido. Pode fechar esta aba.',
            )
          : code
            ? terminar({ code }, 'Pronto', 'Pode fechar esta aba e voltar ao Halo.')
            : terminar(
                { erro: 'o Spotify não devolveu código' },
                'Não deu',
                'Pode fechar esta aba.',
              )

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(pagina(resposta.titulo, resposta.texto))
    })
  })
}

async function trocarCodigo(
  code: string,
  verifier: string,
  id: string,
  redirect: string,
): Promise<void> {
  const resposta = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect,
      client_id: id,
      code_verifier: verifier,
    }),
  })

  const dados = (await resposta.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error_description?: string
    error?: string
  }

  if (!resposta.ok || !dados.refresh_token || !dados.access_token) {
    // A mensagem do Spotify é útil aqui: "Invalid redirect URI" é o engano
    // mais comum, e traduzi-lo para "deu erro" esconderia a única pista.
    const detalhe = dados.error_description ?? dados.error ?? `HTTP ${resposta.status}`
    throw new Error(`o Spotify recusou a troca do código: ${detalhe}`)
  }

  saveSpotifyToken(dados.refresh_token)
  acesso = { token: dados.access_token, expiraEm: Date.now() + (dados.expires_in ?? 3600) * 1000 }
}
