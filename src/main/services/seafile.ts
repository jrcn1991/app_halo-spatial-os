import { randomBytes } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { createReadStream } from 'node:fs'
import { request as pedirHttp } from 'node:http'
import { request as pedirHttps } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { basename } from 'node:path'
import { t } from '@shared/i18n'
import type {
  SeafileAuth,
  SeafileLibrary,
  SeafileResolution,
  SeafileState,
  SeafileUpload,
} from '@shared/seafile'
import { servidorValido } from '@shared/seafile'
import { currentSettings, saveSeafileToken } from '../settings'
import { arquivoSolto } from './arquivo-solto'

/**
 * Cliente do Seafile.
 *
 * PEDIR A SENHA DENTRO DO APP é exceção autorizada, e ela mora aqui porque é
 * aqui que a senha passa. A regra do projeto (CLAUDE.md § Segredos) manda abrir
 * o login de terceiro no navegador do sistema — uma janela nossa pedindo senha
 * é indistinguível de phishing. O Seafile é o caso que o usuário abriu: o
 * servidor é da rede local dele, sem exposição externa, sem conta de terceiro,
 * e o Seafile não oferece OAuth para substituir o fluxo. As amarras: a senha
 * vira token na hora e NUNCA é guardada, o token não atravessa para o renderer,
 * e a exceção cai se o servidor ganhar endereço público.
 *
 * A API é a Web API v2 do próprio Seafile: `/api2/auth-token/` troca usuário e
 * senha por um token, `/api2/repos/` lista as bibliotecas,
 * `/api2/repos/{id}/upload-link/` devolve um endereço de envio e o arquivo vai
 * num `multipart/form-data` para ele.
 *
 * A senha **não é guardada**: ela é trocada pelo token uma vez e o token é o
 * que fica — em `~/.config`, escrito pelo main, nunca no repositório. Guardar
 * senha de servidor para reautenticar sozinho seria pior, e o Seafile não
 * exige isso.
 *
 * Nada aqui lança para a tela: os estados de "sem configurar", "sem
 * credencial" e "deu erro" são diferentes e a ilha mostra coisas diferentes
 * em cada um.
 */

const TIMEOUT_MS = 15000
/** Teto por arquivo — acima disso é trabalho para o cliente oficial do Seafile. */
const ARQUIVO_MAX = 2_000_000_000
/** O envio dá sinal de vida pelo menos neste ritmo; mais rápido só cansa o IPC. */
const PASSO_MS = 80
/** Sem um byte sequer indo ou vindo por este tanto, o envio é dado por morto. */
const SILENCIO_MS = 60000

let cacheBibliotecas: { at: number; lista: SeafileLibrary[] } | null = null
const CACHE_MS = 60_000

const enviosEmCurso = new Map<string, SeafileUpload>()
let avisar: (() => void) | null = null

/** Quem receber isto é chamado a cada mudança de envio. */
export function onSeafileChanged(callback: () => void): void {
  avisar = callback
}

function config() {
  const { seafile } = currentSettings()
  return {
    server: seafile.server.trim().replace(/\/+$/, ''),
    token: seafile.token,
    library: seafile.library,
  }
}

/**
 * A exceção do Seafile (CLAUDE.md § Segredos) vale porque o servidor está na
 * rede LOCAL do usuário — e isto confere, em vez de só dizer: o nome do
 * servidor tem de resolver só para endereços privados ou de loopback. Um
 * endereço público (digitado errado, ou trocado) não recebe senha nem token.
 * A resposta fica guardada por alguns minutos para não resolver a cada pedido.
 */
const REDE_LOCAL = (() => {
  const lista = new BlockList()
  lista.addSubnet('10.0.0.0', 8, 'ipv4')
  lista.addSubnet('172.16.0.0', 12, 'ipv4')
  lista.addSubnet('192.168.0.0', 16, 'ipv4')
  lista.addSubnet('127.0.0.0', 8, 'ipv4')
  lista.addSubnet('169.254.0.0', 16, 'ipv4')
  lista.addSubnet('100.64.0.0', 10, 'ipv4') // CGNAT: VPNs como Tailscale
  lista.addAddress('::1', 'ipv6')
  lista.addSubnet('fc00::', 7, 'ipv6')
  lista.addSubnet('fe80::', 10, 'ipv6')
  return lista
})()
const ehLocal = (ip: string) => {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  const familia = isIP(v4)
  return familia !== 0 && REDE_LOCAL.check(v4, familia === 6 ? 'ipv6' : 'ipv4')
}
const localConferido = new Map<string, { ok: boolean; quando: number }>()

async function servidorNaRedeLocal(server: string): Promise<boolean> {
  let host: string
  try {
    host = new URL(server).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return false
  }
  const guardado = localConferido.get(host)
  if (guardado && Date.now() - guardado.quando < 5 * 60_000) return guardado.ok
  const ok = isIP(host)
    ? ehLocal(host)
    : await lookup(host, { all: true })
        .then((enderecos) => enderecos.length > 0 && enderecos.every((e) => ehLocal(e.address)))
        .catch(() => false)
  localConferido.set(host, { ok, quando: Date.now() })
  return ok
}

async function pedir(caminho: string, init: RequestInit = {}): Promise<Response> {
  const { server, token } = config()
  if (!(await servidorNaRedeLocal(server))) {
    throw new Error(t('o servidor do Seafile precisa estar na rede local'))
  }
  const controller = new AbortController()
  const relogio = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(`${server}${caminho}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(token ? { Authorization: `Token ${token}` } : {}),
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
    })
  } finally {
    clearTimeout(relogio)
  }
}

/* ——— Ligação ——————————————————————————————————————————— */

export async function seafileAuth(): Promise<SeafileAuth> {
  const { server, token } = config()
  if (!servidorValido(server)) return { state: 'sem-config' }
  if (!token) return { state: 'sem-credencial', server }

  try {
    const resposta = await pedir('/api2/account/info/')
    if (resposta.status === 401 || resposta.status === 403) {
      return { state: 'sem-credencial', server }
    }
    if (!resposta.ok) return { state: 'erro', server, message: `HTTP ${resposta.status}` }
    const conta = (await resposta.json()) as { email?: string; name?: string }
    return { state: 'ok', server, user: conta.name || conta.email || t('conectado') }
  } catch (erro) {
    return { state: 'erro', server, message: (erro as Error).message.slice(0, 100) }
  }
}

/**
 * Troca usuário e senha por um token.
 *
 * A senha passa por aqui e não fica: o que é guardado é o token que volta.
 */
export async function seafileLogin(user: string, password: string): Promise<SeafileAuth> {
  const { server } = config()
  if (!servidorValido(server)) return { state: 'sem-config' }

  try {
    const resposta = await pedir('/api2/auth-token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password }),
    })
    if (resposta.status === 400 || resposta.status === 403) {
      return { state: 'erro', server, message: t('usuário ou senha recusados') }
    }
    if (!resposta.ok) return { state: 'erro', server, message: `HTTP ${resposta.status}` }

    const { token } = (await resposta.json()) as { token?: string }
    if (!token) return { state: 'erro', server, message: t('o servidor não devolveu token') }

    saveSeafileToken(token)
    cacheBibliotecas = null
    return seafileAuth()
  } catch (erro) {
    return { state: 'erro', server, message: (erro as Error).message.slice(0, 100) }
  }
}

export function seafileLogout(): void {
  saveSeafileToken('')
  cacheBibliotecas = null
}

/* ——— Bibliotecas ——————————————————————————————————————— */

export async function seafileLibraries(): Promise<SeafileLibrary[]> {
  if (cacheBibliotecas && Date.now() - cacheBibliotecas.at < CACHE_MS) {
    return cacheBibliotecas.lista
  }
  const resposta = await pedir('/api2/repos/')
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)

  const cru = (await resposta.json()) as {
    id: string
    name: string
    size?: number
    mtime?: number
    permission?: string
  }[]
  const lista = cru.map((repo) => ({
    id: repo.id,
    name: repo.name,
    size: repo.size ?? 0,
    modified: repo.mtime ? new Date(repo.mtime * 1000).toISOString() : '',
    readOnly: repo.permission === 'r',
  }))
  cacheBibliotecas = { at: Date.now(), lista }
  return lista
}

/* ——— Envio ————————————————————————————————————————————— */

function anotar(upload: SeafileUpload): void {
  enviosEmCurso.set(upload.id, upload)
  avisar?.()
}

/**
 * Envios parados em `existe`, à espera da decisão do usuário. O caminho fica
 * só aqui: o renderer não precisa dele e a decisão volta pelo id.
 */
const pendentes = new Map<string, { caminho: string; bytes: number }>()

/** O nome que o servidor vai ver é o do arquivo, não o caminho. */
function comNome(caminho: string, upload: SeafileUpload): SeafileUpload {
  return { ...upload, name: basename(caminho) }
}

/**
 * Já existe um arquivo com este nome na raiz da biblioteca? O Seafile aceitaria
 * o envio calado — com `replace=1` sobrescreve, com `replace=0` cria um
 * "nome (1)" — e nenhum dos dois é o que se quer sem perguntar.
 *
 * Erro na conferência não segura o envio: o pior caso volta a ser o de antes.
 */
async function existente(
  library: string,
  nome: string,
): Promise<{ size: number; modified: string } | null> {
  try {
    const resposta = await pedir(
      `/api2/repos/${library}/file/detail/?p=${encodeURIComponent(`/${nome}`)}`,
    )
    if (!resposta.ok) return null
    const info = (await resposta.json()) as { size?: number; mtime?: number }
    return {
      size: info.size ?? 0,
      modified: info.mtime ? new Date(info.mtime * 1000).toISOString() : '',
    }
  } catch {
    return null
  }
}

/**
 * Manda o arquivo em fluxo, contando o que já foi.
 *
 * `fetch` com um `Blob` do arquivo inteiro não serve: ele carrega tudo na
 * memória e não conta nada até acabar — a barra ficava em 0 e pulava para
 * 100. Aqui o `multipart/form-data` é montado à mão em cima de `http.request`,
 * com o arquivo entrando por `pipe`; o `Content-Length` é conhecido de
 * antemão, então o servidor não precisa de chunked. O progresso é medido no
 * que sai do disco, que o `pipe` segura no ritmo em que a rede engole.
 */
function transmitir(
  link: string,
  token: string,
  caminho: string,
  nome: string,
  bytes: number,
  substituir: boolean,
  aoAvancar: (enviados: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fronteira = `----halo${randomBytes(12).toString('hex')}`
    const campo = (chave: string, valor: string) =>
      `--${fronteira}\r\nContent-Disposition: form-data; name="${chave}"\r\n\r\n${valor}\r\n`
    // Aspas e quebras de linha no nome quebrariam o cabeçalho do multipart.
    const nomeSeguro = nome.replace(/["\r\n]/g, '_')
    const cabeca = Buffer.from(
      campo('parent_dir', '/') +
        campo('replace', substituir ? '1' : '0') +
        `--${fronteira}\r\nContent-Disposition: form-data; name="file"; filename="${nomeSeguro}"\r\n` +
        'Content-Type: application/octet-stream\r\n\r\n',
    )
    const cauda = Buffer.from(`\r\n--${fronteira}--\r\n`)

    const url = new URL(link)
    // O link de envio vem do servidor, e leva o token e o arquivo: só vale se
    // apontar para o MESMO servidor configurado.
    if (url.host !== new URL(config().server).host) {
      throw new Error(t('o Seafile devolveu um link de envio para outro servidor'))
    }
    const pedirCom = url.protocol === 'https:' ? pedirHttps : pedirHttp
    const req = pedirCom(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': `multipart/form-data; boundary=${fronteira}`,
          'Content-Length': cabeca.length + bytes + cauda.length,
        },
      },
      (res) => {
        res.resume()
        res.on('end', () => {
          const status = res.statusCode ?? 0
          if (status >= 200 && status < 300) resolve()
          else reject(new Error(`o servidor recusou (HTTP ${status})`))
        })
        res.on('error', reject)
      },
    )
    req.setTimeout(SILENCIO_MS, () => req.destroy(new Error('o servidor parou de responder')))
    req.on('error', reject)

    const fluxo = createReadStream(caminho)
    let enviados = 0
    fluxo.on('data', (pedaco) => {
      enviados += pedaco.length
      aoAvancar(enviados)
    })
    fluxo.on('error', (erro) => req.destroy(erro))
    fluxo.on('end', () => req.end(cauda))
    req.write(cabeca)
    fluxo.pipe(req, { end: false })
  })
}

/**
 * Envia um arquivo para a biblioteca escolhida.
 *
 * São dois passos, e é assim que o Seafile faz: pedir um endereço de envio, e
 * então mandar o arquivo para ele. O endereço vale por pouco tempo e é de uso
 * único, então não adianta guardá-lo. Antes dos dois, uma conferência: se o
 * nome já existe na biblioteca, o envio para em `existe` e espera a decisão.
 */
export async function seafileUpload(caminho: string): Promise<SeafileUpload> {
  const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const upload: SeafileUpload = comNome(caminho, {
    id,
    name: '',
    bytes: 0,
    sent: 0,
    progress: 0,
    state: 'esperando',
    error: null,
    remote: null,
  })
  anotar(upload)

  try {
    // O caminho vem do renderer (arrasto, gaveta): só arquivo comum, fora de
    // `/proc` e afins, e enviado pelo destino do link — ver `arquivo-solto.ts`.
    const conferido = await arquivoSolto(caminho, ARQUIVO_MAX)
    const real = conferido.caminho
    const info = { size: conferido.bytes }
    const { library } = config()
    if (!library) throw new Error(t('nenhuma biblioteca escolhida'))

    const remoto = await existente(library, upload.name)
    if (remoto) {
      pendentes.set(id, { caminho: real, bytes: info.size })
      const parado: SeafileUpload = { ...upload, bytes: info.size, state: 'existe', remote: remoto }
      anotar(parado)
      return parado
    }
    return await enviar({ ...upload, bytes: info.size }, real, false)
  } catch (erro) {
    const falhou: SeafileUpload = {
      ...upload,
      state: 'erro',
      error: (erro as Error).message.slice(0, 120),
    }
    anotar(falhou)
    return falhou
  }
}

/** A decisão sobre um envio parado em `existe`. */
export function seafileResolve(id: string, escolha: SeafileResolution): void {
  const parado = pendentes.get(id)
  const upload = enviosEmCurso.get(id)
  if (!parado || !upload || upload.state !== 'existe') return
  pendentes.delete(id)
  if (escolha === 'cancelar') {
    enviosEmCurso.delete(id)
    avisar?.()
    return
  }
  void enviar(
    { ...upload, bytes: parado.bytes, remote: null },
    parado.caminho,
    escolha === 'substituir',
  )
}

async function enviar(
  upload: SeafileUpload,
  caminho: string,
  substituir: boolean,
): Promise<SeafileUpload> {
  try {
    anotar({ ...upload, state: 'enviando', sent: 0, progress: 0 })
    const { library, token } = config()
    const linkResposta = await pedir(`/api2/repos/${library}/upload-link/`)
    if (!linkResposta.ok)
      throw new Error(
        t('não consegui o endereço de envio (HTTP {status})', { status: linkResposta.status }),
      )
    const link = (await linkResposta.json()) as string

    let ultimo = 0
    await transmitir(String(link), token, caminho, upload.name, upload.bytes, substituir, (n) => {
      const agora = Date.now()
      if (agora - ultimo < PASSO_MS && n < upload.bytes) return
      ultimo = agora
      anotar({
        ...upload,
        state: 'enviando',
        sent: n,
        progress: upload.bytes > 0 ? n / upload.bytes : 1,
      })
    })

    const pronto: SeafileUpload = {
      ...upload,
      sent: upload.bytes,
      progress: 1,
      state: 'pronto',
      error: null,
    }
    anotar(pronto)
    return pronto
  } catch (erro) {
    const falhou: SeafileUpload = {
      ...upload,
      state: 'erro',
      error: (erro as Error).message.slice(0, 120),
    }
    anotar(falhou)
    return falhou
  }
}

/** O estado inteiro, para a ilha e a tela de Configurações. */
export async function seafileState(): Promise<SeafileState> {
  const auth = await seafileAuth()
  const { library } = config()
  const libraries = auth.state === 'ok' ? await seafileLibraries().catch(() => []) : []
  return { auth, library, libraries, uploads: [...enviosEmCurso.values()].slice(-8) }
}

/** Limpa os envios já terminados da lista. */
export function seafileClearDone(): void {
  for (const [id, upload] of enviosEmCurso) {
    if (upload.state === 'pronto' || upload.state === 'erro') enviosEmCurso.delete(id)
  }
  avisar?.()
}
