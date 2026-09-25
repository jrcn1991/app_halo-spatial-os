import { lookup as resolverNome } from 'node:dns'
import { type IncomingHttpHeaders, request as requestHttp } from 'node:http'
import { request as requestHttps } from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
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
 * 2. **O IP conferido é o IP conectado.** Não basta olhar o nome: um domínio
 *    público pode apontar para `127.0.0.1`. E não basta resolver antes e
 *    deixar o `fetch` resolver de novo: o dono do domínio responde um IP
 *    público na conferência e `127.0.0.1` na conexão (o rebind clássico, com
 *    TTL zero). Por isso a conferência mora DENTRO da resolução que a conexão
 *    usa (`resolverConferindo`), e o socket só abre para um endereço que
 *    passou por ela.
 * 3. **Cada redirecionamento é conferido de novo.** Um endereço público pode
 *    responder 302 para `http://192.168.1.1`, e seguir cego desfaria a regra 2.
 *    Cada salto é um pedido novo, e passa pela mesma resolução.
 * 4. **Teto de tamanho, lido do CORPO.** `content-length` é o que o servidor
 *    DIZ; o corpo é o que ele manda.
 * 5. **Teto de tempo.** Um servidor que responde um byte por minuto seguraria
 *    o main para sempre.
 *
 * O pedido sai por `node:http`, e não pelo `fetch`: o `fetch` do Node não
 * aceita uma resolução própria sem trazer o `undici` como dependência, e é a
 * resolução que carrega a regra 2. Quem mais busca URL que não escolheu (a
 * capa das referências, a capa do MPRIS) passa por `pedir`, daqui.
 */

/** Um HTML de página cabe folgado; acima disto não é página, é despejo. */
const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 8000
/** Encurtadores costumam usar dois saltos; cinco cobre com folga. */
const MAX_REDIRECTS = 5

export class RedeError extends Error {}

/** A recusa da TRAVA — separada para a tela dizer o motivo certo. */
class EnderecoBloqueado extends RedeError {}

/**
 * Faixas IPv4 que NÃO podem ser alcançadas a partir de uma URL do usuário.
 *
 * A lista é por faixa e não por nome porque é o endereço que importa depois da
 * resolução. `169.254.169.254` está coberto pelo link-local, e é ele que
 * responde credenciais em máquina de nuvem.
 */
const FAIXAS_V4: [string, number][] = [
  ['0.0.0.0', 8], // "esta rede"
  ['10.0.0.0', 8], // privada
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (e o metadata de nuvem)
  ['172.16.0.0', 12], // privada
  ['192.0.0.0', 24], // IETF
  ['192.168.0.0', 16], // privada
  ['198.18.0.0', 15], // teste de desempenho
  ['224.0.0.0', 3], // multicast e reservado (até 255.255.255.255)
]

/**
 * A lista, montada uma vez.
 *
 * Um IPv6 pode CARREGAR um IPv4 dentro, e a `URL` normaliza o literal para a
 * forma hexadecimal — `[::ffff:127.0.0.1]` vira `::ffff:7f00:1`, e um teste
 * de texto por `::ffff:1.2.3.4` deixava passar. Então cada faixa v4 entra
 * também nas três embalagens em que ela chega a um socket v6: mapeada
 * (`::ffff:0:0/96`), NAT64 (`64:ff9b::/96`, onde o tradutor da rede entrega
 * ao IPv4 de dentro) e 6to4 (`2002::/16`, o v4 nos bits 16–47). A comparação
 * é por bits, na `BlockList` do Node — nada de expressão regular sobre texto.
 */
const BLOQUEADOS = (() => {
  const lista = new BlockList()
  for (const [rede, bits] of FAIXAS_V4) {
    lista.addSubnet(rede, bits, 'ipv4')
    lista.addSubnet(`::ffff:${rede}`, 96 + bits, 'ipv6')
    lista.addSubnet(`64:ff9b::${rede}`, 96 + bits, 'ipv6')
    const [a = 0, b = 0, c = 0, d = 0] = rede.split('.').map(Number)
    const hex = (x: number, y: number) => ((x << 8) | y).toString(16)
    lista.addSubnet(`2002:${hex(a, b)}:${hex(c, d)}::`, 16 + bits, 'ipv6')
  }
  lista.addSubnet('::', 96, 'ipv6') // não especificado, loopback e o "compatível com v4", obsoleto
  lista.addSubnet('64:ff9b:1::', 48, 'ipv6') // NAT64 de uso local
  lista.addSubnet('2001::', 32, 'ipv6') // Teredo: o destino real vai embutido e ofuscado
  lista.addSubnet('fc00::', 7, 'ipv6') // único local
  lista.addSubnet('fe80::', 10, 'ipv6') // link-local
  lista.addSubnet('fec0::', 10, 'ipv6') // site-local, obsoleto
  lista.addSubnet('ff00::', 8, 'ipv6') // multicast
  return lista
})()

/** Se este IP (literal, já resolvido) está fora do alcance de uma URL do usuário. */
export function enderecoBloqueado(ip: string): boolean {
  const familia = isIP(ip)
  if (familia === 0) return true
  return BLOQUEADOS.check(ip, familia === 6 ? 'ipv6' : 'ipv4')
}

/**
 * A resolução que a CONEXÃO usa, com a trava dentro (regra 2).
 *
 * `all: true` porque um nome pode ter vários endereços e a conexão pode
 * tentar qualquer um deles: basta UM bloqueado para o pedido não sair daqui.
 * Responde nos dois formatos que o `net` pede — lista, com `all`, ou um
 * endereço só.
 */
const resolverConferindo: LookupFunction = (nome, opcoes, pronto) => {
  resolverNome(nome, { ...opcoes, all: true }, (erro, enderecos) => {
    if (erro) return pronto(erro, '', 0)
    if (enderecos.length === 0) return pronto(new RedeError(t('endereço sem IP')), '', 0)
    if (enderecos.some((e) => enderecoBloqueado(e.address))) {
      return pronto(
        new EnderecoBloqueado(
          t('esse endereço aponta para a rede local, e o app não a alcança por link'),
        ),
        '',
        0,
      )
    }
    if (opcoes.all) return pronto(null, enderecos)
    const [primeiro] = enderecos
    return pronto(null, primeiro?.address ?? '', primeiro?.family ?? 4)
  })
}

/** Rejeita o que não pode ser buscado ANTES de abrir socket, com a frase pronta. */
function conferir(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new RedeError(t('só endereços http:// ou https://'))
  }
  // Um literal não passa pela resolução — o `net` conecta direto nele —, então
  // é conferido aqui. `hostname` de um IPv6 vem entre colchetes (`[::1]`), e
  // `isIP` não os aceita: sem tirar, o literal escaparia desta conferência.
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && enderecoBloqueado(host)) {
    throw new EnderecoBloqueado(
      t('esse endereço aponta para a rede local, e o app não a alcança por link'),
    )
  }
}

/** Uma resposta aberta: o status e os cabeçalhos já chegaram, o corpo não. */
export type Resposta = {
  status: number
  headers: IncomingHttpHeaders
  /** Lê o corpo inteiro, contando bytes: passar de `teto` é erro. */
  ler(teto: number): Promise<Buffer>
  /** Fecha sem ler — para redirecionamento e resposta recusada. */
  descartar(): void
}

/**
 * Um pedido GET para uma URL que o app NÃO escolheu, sem seguir
 * redirecionamento (quem chama decide, e confere o salto de novo).
 *
 * `signal` é obrigatório: pedido sem prazo é a regra 5 esquecida.
 */
export function pedir(
  url: URL,
  cabecalhos: Record<string, string>,
  signal: AbortSignal,
): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    // Dentro do executor: a recusa sai como rejeição, nunca como exceção
    // síncrona que escaparia de quem só trata a promessa.
    conferir(url)
    const request = url.protocol === 'https:' ? requestHttps : requestHttp
    const pedido = request(
      url,
      { method: 'GET', headers: cabecalhos, signal, lookup: resolverConferindo },
      (corpo) => {
        resolve({
          status: corpo.statusCode ?? 0,
          headers: corpo.headers,
          descartar: () => corpo.destroy(),
          ler: async (teto) => {
            // O `content-length` é promessa, não fato: o teto vale no que chega.
            const pedacos: Buffer[] = []
            let total = 0
            for await (const pedaco of corpo as AsyncIterable<Buffer>) {
              total += pedaco.byteLength
              if (total > teto) {
                corpo.destroy()
                throw new RedeError(t('a página é grande demais'))
              }
              pedacos.push(pedaco)
            }
            return Buffer.concat(pedacos)
          },
        })
      },
    )
    pedido.on('error', reject)
    pedido.end()
  })
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
      const resposta = await pedir(
        url,
        {
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
        controller.signal,
      )

      if (resposta.status >= 300 && resposta.status < 400) {
        resposta.descartar()
        const destino = resposta.headers.location
        if (!destino) throw new RedeError(t('o servidor redirecionou sem dizer para onde'))
        url = new URL(destino, url)
        continue
      }
      if (resposta.status < 200 || resposta.status >= 300) {
        resposta.descartar()
        throw new RedeError(t('o servidor respondeu HTTP {status}', { status: resposta.status }))
      }

      return { texto: (await resposta.ler(MAX_BYTES)).toString('utf8'), url: url.toString() }
    }
    throw new RedeError(t('redirecionamentos demais'))
  } catch (erro) {
    if (erro instanceof RedeError) throw erro
    if (controller.signal.aborted) throw new RedeError(t('o servidor demorou demais'))
    if ((erro as NodeJS.ErrnoException).code === 'ENOTFOUND')
      throw new RedeError(t('não consegui resolver esse endereço'))
    throw new RedeError(t('não consegui abrir esse endereço'))
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Busca JSON de uma API de provedor.
 *
 * Passa pela mesma trava: um endereço de API também vem de configuração, e
 * configuração é do usuário. Sem seguir redirecionamento aqui — API que
 * redireciona não é caso real, e recusar fecha a porta sem custo.
 */
export async function buscarJson<T>(bruta: string, cabecalhos: Record<string, string>): Promise<T> {
  const url = new URL(bruta)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resposta = await pedir(
      url,
      { Accept: 'application/json', ...cabecalhos },
      controller.signal,
    )
    if (resposta.status < 200 || resposta.status >= 300) resposta.descartar()
    if (resposta.status === 429)
      throw new RedeError(t('a plataforma pediu para esperar (limite de uso)'))
    if (resposta.status < 200 || resposta.status >= 300)
      throw new RedeError(t('a plataforma respondeu HTTP {status}', { status: resposta.status }))
    return JSON.parse((await resposta.ler(MAX_BYTES)).toString('utf8')) as T
  } catch (erro) {
    if (erro instanceof RedeError) throw erro
    if (controller.signal.aborted) throw new RedeError(t('a plataforma demorou demais'))
    throw new RedeError(t('não consegui falar com a plataforma'))
  } finally {
    clearTimeout(timer)
  }
}
