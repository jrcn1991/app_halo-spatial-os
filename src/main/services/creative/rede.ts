import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { t } from '@shared/i18n'

/**
 * A busca externa da Social Arte — e a trava contra SSRF.
 *
 * Este arquivo existe porque a Social Arte é a primeira parte do app que
 * busca uma URL VINDA DO USUÁRIO. Todo o resto que alcança a rede fala com
 * endereços que o próprio código escolheu (a API do Spotify, o TMDB, o feed
 * que o usuário configurou uma vez). Aqui a pessoa cola um link qualquer, e o
 * processo main é quem o abre — com acesso à rede local inteira, ao
 * `127.0.0.1` onde moram o Seafile e a API da ilha, e aos serviços de
 * metadados de nuvem em `169.254.169.254`.
 *
 * Sem trava, "salvar por link" viraria um jeito de fazer o app varrer a rede
 * de casa e devolver o que achou. As cinco regras abaixo são o que impede isso,
 * e nenhuma delas é opcional:
 *
 * 1. **Só http e https.** `file://` leria o disco, `ftp://` e `gopher://`
 *    falam com serviços que interpretam texto solto como comando.
 * 2. **O IP é resolvido AQUI e conferido.** Não basta olhar o nome: um domínio
 *    público pode apontar para `127.0.0.1`. É o ataque clássico de rebind.
 * 3. **Cada redirecionamento é conferido de novo.** Um endereço público pode
 *    responder 302 para `http://192.168.1.1`, e seguir cego desfaria a regra 2.
 * 4. **Teto de tamanho, lido do CORPO.** `content-length` é o que o servidor
 *    DIZ; o corpo é o que ele manda.
 * 5. **Teto de tempo.** Um servidor que responde um byte por minuto seguraria
 *    o main para sempre.
 */

/** Um HTML de página cabe folgado; acima disto não é página, é despejo. */
const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 8000
/** Encurtadores costumam usar dois saltos; cinco cobre com folga. */
const MAX_REDIRECTS = 5

export class RedeError extends Error {}

/**
 * Faixas que NÃO podem ser alcançadas a partir de uma URL do usuário.
 *
 * A lista é por faixa e não por nome porque é o endereço que importa depois da
 * resolução. `169.254.169.254` está coberto pelo link-local, e é ele que
 * responde credenciais em máquina de nuvem.
 */
function privado(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase()
    // Mapeado para IPv4 (`::ffff:127.0.0.1`) — a mesma conferência do v4.
    const mapeado = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapeado?.[1]) return privado(mapeado[1])
    return (
      v6 === '::1' || // loopback
      v6 === '::' || // não especificado
      /^f[cd]/.test(v6) || // fc00::/7, único local
      /^fe[89ab]/.test(v6) // fe80::/10, link-local
    )
  }

  const [a = 0, b = 0] = ip.split('.').map(Number)
  return (
    a === 0 || // "esta rede"
    a === 10 || // privada
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local (e o metadata de nuvem)
    (a === 172 && b >= 16 && b <= 31) || // privada
    (a === 192 && b === 168) || // privada
    (a === 192 && b === 0) || // IETF
    (a === 198 && (b === 18 || b === 19)) || // teste de desempenho
    a >= 224 // multicast e reservado
  )
}

/** Rejeita o que não pode ser buscado, com a frase pronta para a tela. */
async function conferir(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new RedeError(t('só endereços http:// ou https://'))
  }
  // `lookup` com `all` porque um nome pode ter vários endereços: basta UM
  // privado para o pedido não sair daqui.
  // `hostname` de um IPv6 vem entre colchetes (`[::1]`), e `isIP` não os
  // aceita — sem tirar, um literal v6 cairia no `lookup` e passaria a depender
  // de o DNS falhar. Barrar pelo motivo certo importa: o motivo errado
  // conserta-se sozinho um dia.
  const host = url.hostname.replace(/^\[|\]$/g, '')
  let enderecos: { address: string }[]
  try {
    enderecos = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  } catch {
    throw new RedeError(t('não consegui resolver esse endereço'))
  }
  if (enderecos.length === 0) throw new RedeError(t('endereço sem IP'))
  if (enderecos.some((e) => privado(e.address))) {
    throw new RedeError(t('esse endereço aponta para a rede local, e o app não a alcança por link'))
  }
}

/**
 * Busca uma página, seguindo redirecionamentos À MÃO para conferir cada salto.
 *
 * Devolve o texto e a URL FINAL — quem chama precisa da final para resolver
 * caminhos relativos e para guardar o link certo.
 */
export async function buscarPagina(bruta: string): Promise<{ texto: string; url: string }> {
  let url: URL
  try {
    url = new URL(bruta.trim())
  } catch {
    throw new RedeError(t('isso não parece um endereço'))
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    for (let salto = 0; salto <= MAX_REDIRECTS; salto++) {
      await conferir(url)

      const resposta = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          // Um agente desconhecido leva 403 em boa parte dos sites (medido no
          // tecnoblog). Aqui a busca é de METADADOS de uma página que o
          // usuário já está vendo no navegador dele, então o agente diz o que
          // o app é E se apresenta como navegador — sem isso, "salvar por
          // link" falharia na maioria dos endereços.
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Halo/1.0',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
      })

      if (resposta.status >= 300 && resposta.status < 400) {
        const destino = resposta.headers.get('location')
        if (!destino) throw new RedeError(t('o servidor redirecionou sem dizer para onde'))
        url = new URL(destino, url)
        continue
      }
      if (!resposta.ok)
        throw new RedeError(t('o servidor respondeu HTTP {status}', { status: resposta.status }))

      return { texto: await lerAteOTeto(resposta), url: url.toString() }
    }
    throw new RedeError(t('redirecionamentos demais'))
  } catch (erro) {
    if (erro instanceof RedeError) throw erro
    if (controller.signal.aborted) throw new RedeError(t('o servidor demorou demais'))
    throw new RedeError(t('não consegui abrir esse endereço'))
  } finally {
    clearTimeout(timer)
  }
}

/** Lê o corpo contando bytes: o `content-length` é promessa, não fato. */
async function lerAteOTeto(resposta: Response): Promise<string> {
  const corpo = resposta.body
  if (!corpo) return ''
  const pedacos: Uint8Array[] = []
  let total = 0
  for await (const pedaco of corpo as unknown as AsyncIterable<Uint8Array>) {
    total += pedaco.byteLength
    if (total > MAX_BYTES) throw new RedeError(t('a página é grande demais'))
    pedacos.push(pedaco)
  }
  return Buffer.concat(pedacos).toString('utf8')
}

/**
 * Busca JSON de uma API de provedor.
 *
 * Passa pela mesma trava: um endereço de API também vem de configuração, e
 * configuração é do usuário. Sem redirecionamento manual aqui — API que
 * redireciona para a rede local não é caso real, e `redirect: 'error'` fecha a
 * porta sem custo.
 */
export async function buscarJson<T>(bruta: string, cabecalhos: Record<string, string>): Promise<T> {
  const url = new URL(bruta)
  await conferir(url)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resposta = await fetch(url, {
      signal: controller.signal,
      redirect: 'error',
      headers: { Accept: 'application/json', ...cabecalhos },
    })
    if (resposta.status === 429)
      throw new RedeError(t('a plataforma pediu para esperar (limite de uso)'))
    if (!resposta.ok)
      throw new RedeError(t('a plataforma respondeu HTTP {status}', { status: resposta.status }))
    return JSON.parse(await lerAteOTeto(resposta)) as T
  } catch (erro) {
    if (erro instanceof RedeError) throw erro
    if (controller.signal.aborted) throw new RedeError(t('a plataforma demorou demais'))
    throw new RedeError(t('não consegui falar com a plataforma'))
  } finally {
    clearTimeout(timer)
  }
}
