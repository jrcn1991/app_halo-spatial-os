import { t } from '@shared/i18n'
import { BrowserWindow, session, shell } from 'electron'
import { RedeError } from './rede'

/**
 * O navegador de segundo plano da Social Arte.
 *
 * A tela não é uma janela de navegador com a página da plataforma dentro: é
 * uma interface NOSSA. Mas o que a alimenta é uma navegação de verdade — uma
 * janela escondida, com a sessão do próprio usuário, carregando a mesma página
 * que ele abriria no Chrome. Daí o app lê o DOM e desenha o que achou do jeito
 * dele.
 *
 * Por que assim, e não pela API:
 *
 * - a API do DeviantArt perdeu `browse/newest` e `browse/popular` em
 *   01/07/2024, e o que sobrou exige registro de aplicativo;
 * - a home logada — o feed que o usuário montou seguindo quem ele segue — não
 *   existe em API nenhuma. É a página dele, com a sessão dele.
 *
 * ## As amarras
 *
 * Um navegador embutido é poder demais para deixar solto. O que segura:
 *
 * - **Somente leitura.** Este módulo navega e lê o DOM. Não há caminho para
 *   clicar, postar, curtir, seguir ou apagar nada na conta de ninguém: as
 *   únicas saídas são `abrir()` e `extrair()`, e `extrair` recebe um script de
 *   uma lista fechada escrita aqui no repositório, nunca da tela.
 * - **Uma navegação por gesto do usuário**, com piso de tempo entre elas
 *   (`INTERVALO_MS`). Não há laço de fundo varrendo a plataforma; sem alguém
 *   olhando a tela, este navegador não carrega nada.
 * - **Nada de acervo guardado.** O que sai daqui vira a tela do momento. Só
 *   entra em disco o que o usuário mandar salvar, e aí é metadado mais o
 *   endereço da publicação original — o mesmo que a biblioteca já guardava.
 * - **A sessão é dele, num compartimento só desta tela.** Nem o app nem
 *   nenhuma outra parte do Halo alcança esses cookies.
 *
 * ## O login
 *
 * `CLAUDE.md` diz: "Login de terceiro abre no navegador do sistema, nunca
 * dentro do app — uma janela nossa pedindo a senha é indistinguível de uma
 * tela de phishing". A regra continua valendo, e é por causa dela que o login
 * aqui tem a forma que tem:
 *
 * - quem pede a senha é a **página de verdade do DeviantArt**, carregada numa
 *   janela COM MOLDURA e com o endereço à vista na barra de título — o
 *   usuário consegue conferir em que site está digitando, que é exatamente o
 *   que a regra protege;
 * - o app não desenha campo nenhum, não injeta script na página de login e
 *   não lê o que é digitado. `extrair()` recusa rodar enquanto a janela
 *   visível estiver aberta;
 * - o que fica é o cookie de sessão, no compartimento, como em qualquer
 *   navegador.
 *
 * Se um dia a plataforma oferecer OAuth que dê acesso ao feed do usuário, o
 * padrão volta a ser o navegador do sistema.
 */

/**
 * Como se reconhece a sessão de uma fonte: um cookie, e às vezes o valor dele.
 *
 * Sem `valor`, basta o cookie existir. Com `valor`, ele precisa ser aquele —
 * ver a medição do Pinterest em `temSessao`.
 */
export type Marca = { nome: string; valor?: string }

/** O compartimento da sessão. Persistente: logar uma vez basta. */
const PARTICAO = 'persist:social-arte'

/**
 * O que o site vê. Um `Halo/0.1` levaria 403 em boa parte da web (medido com
 * o leitor de Open Graph), e um navegador embutido que se anuncia como outra
 * coisa recebe a página quebrada.
 */
const AGENTE =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * Piso entre duas navegações. Uma tela de gente, não um robô.
 *
 * Subiu de 1,2s para 2s em 04/09/2026, depois de o Pinterest responder
 * "upstream connect error or disconnect/reset before headers" numa sessão de
 * testes intensa. Não há prova de que o ritmo tenha sido a causa, mas o custo
 * de esperar mais meio segundo é nenhum, e o de ser barrado é a tela vazia.
 */
const INTERVALO_MS = 2000

/**
 * Teto de espera por uma página.
 *
 * 30s e não 20s: com quatro ou cinco fontes carregando ao mesmo tempo, cada uma
 * na sua janela, elas disputam CPU — e o DeviantArt começou a estourar os 20s
 * justamente quando a quinta entrou. O teto existe para a página que não vem,
 * não para a que está vindo devagar porque o computador está ocupado.
 */
const TIMEOUT_MS = 30000

/**
 * A página é montada por JavaScript: no `load` ela ainda está vazia.
 *
 * Esperar um tempo FIXO não serve, e isso foi medido: com 5s cravados, a mesma
 * busca devolveu 24 obras numa hora e 12 em outra — a leitura pegava a página
 * no meio da montagem, e a diferença aparecia como "às vezes vem menos", sem
 * erro nenhum para investigar.
 *
 * O que se faz em vez disso é esperar a página PARAR DE CRESCER: lê-se de
 * tempos em tempos e aceita-se o resultado quando ele se repete. Rápido quando
 * a página é rápida, paciente quando ela não é.
 */
const PRIMEIRA_LEITURA_MS = 1500
const ENTRE_LEITURAS_MS = 900
/**
 * Quantas leituras iguais seguidas para dizer que assentou.
 *
 * Começou em duas, e DUAS ERA POUCO: a busca do site rende a grade em duas
 * levas, e 800ms entre leituras cabia inteiro dentro da pausa — a leitura
 * fechava em 12 obras quando a página tinha 24. Três leituras a 900ms pedem
 * ~1,8s de estabilidade, e a mesma consulta que dava 12 passou a dar 24.
 * Página rápida continua rápida: são 3,3s no total quando ela já veio pronta.
 */
const REPETICOES = 3
/** Teto: passou disto, o que já veio vale. */
const ASSENTAR_MAX_MS = 12000

/**
 * A colheita por rolagem.
 *
 * MEDIDO em 04/09/2026 na home LOGADA do DeviantArt: rolar até o fim faz a
 * página crescer de verdade — 42 → 58 → 67 → 71 → 73 obras, altura de 2975 para
 * 18202px em oito passos. (A home deslogada NÃO cresce: é uma página fixa de
 * ~31 obras, e foi ela que eu media antes, o que me fez concluir errado que a
 * home não paginava.)
 *
 * A armadilha: a lista **virtualiza**. O contador oscila para baixo — 73 → 63 →
 * 68 — porque a página tira do DOM o que passou longe da tela. Ler uma vez no
 * fim perderia o começo. Por isso a colheita ACUMULA a cada passo, e a ordem de
 * primeira aparição é a ordem do feed.
 */
const PASSO_ROLAGEM_MS = 1500
/** Sem obra nova depois de tantos passos seguidos, o feed acabou. */
const PASSOS_SECOS = 3
/** Teto de passos por chamada: uma tela de gente, não uma varredura. */
const PASSOS_MAX = 12

/**
 * Uma janela por FONTE, e não uma para todas.
 *
 * Elas compartilham o compartimento (a sessão de cada site é independente de
 * qualquer forma), mas cada uma tem a própria fila. MEDIDO: com uma janela só,
 * abrir a Social Arte com DeviantArt e Pinterest ligados levava 22s — as duas
 * fontes carregavam e rolavam em sequência, esperando uma à outra, mesmo o
 * código pedindo as duas em paralelo. Separadas, o tempo é o da mais lenta.
 */
type Aba = {
  janela: BrowserWindow | null
  /** Uma navegação por vez NESTA aba: duas brigariam pela mesma página. */
  fila: Promise<unknown>
  /** Onde ela está agora — quem continua uma colheita confere isto. */
  pagina: string
  /** Quando ela navegou pela última vez, para o piso entre navegações. */
  ultima: number
}
const abas = new Map<string, Aba>()
const pegarAba = (chave: string): Aba => {
  const tem = abas.get(chave)
  if (tem) return tem
  const nova: Aba = { janela: null, fila: Promise.resolve(), pagina: '', ultima: 0 }
  abas.set(chave, nova)
  return nova
}

let login: BrowserWindow | null = null

/**
 * Janela de fundo ociosa fecha sozinha.
 *
 * Cada fonte é um Chromium inteiro renderizando a página de terceiro — com
 * vídeo em autoplay no Pinterest — e, sem isto, as cinco ficavam vivas para
 * sempre depois da primeira busca (MEDIDO: ~150 MB e CPU contínua cada). A
 * sessão (cookies, login) mora no compartimento `persist:social-arte`, não na
 * janela: fechar e reabrir sob demanda custa só o carregamento da página, e
 * o usuário continua logado. `ultima` é a marca de uso que `navegarELer` já
 * atualiza.
 */
const OCIOSA_MS = 3 * 60_000
const FAXINA_MS = 30_000
let faxina: ReturnType<typeof setInterval> | undefined

function fecharOciosas(): void {
  const agora = Date.now()
  for (const aba of abas.values()) {
    if (!aba.janela || aba.janela.isDestroyed()) continue
    if (agora - aba.ultima < OCIOSA_MS) continue
    aba.janela.destroy()
    aba.janela = null
    aba.pagina = ''
  }
  if ([...abas.values()].every((a) => !a.janela)) {
    clearInterval(faxina)
    faxina = undefined
  }
}

function armarFaxina(): void {
  faxina ??= setInterval(fecharOciosas, FAXINA_MS)
  faxina.unref?.()
}

/**
 * Os `webContents` das abas OCULTAS. O filtro de rede abaixo só vale para
 * elas — a janela de login (`abrirLogin`) usa o mesmo compartimento e precisa
 * de tudo: recaptcha, iframe de autenticação, o que o site quiser.
 */
const ocultas = new Set<number>()

/**
 * O que uma aba oculta não carrega. A leitura é do DOM de primeira parte:
 * anúncio, rastreio e vídeo não entram no que ela lê, e custavam caro —
 * MEDIDO em 05/09/2026: 14 processos de iframe de terceiros (~1,5 GB) e o
 * Pinterest decodificando vídeo, tudo em janelas que ninguém vê
 * (DESEMPENHO.md, P0-3). Imagem de qualquer host CONTINUA passando: as capas
 * vêm de CDNs de terceiros (wixmp, pinimg, behance, artstation).
 */
const RASTREIO =
  /doubleclick|googlesyndication|googletagmanager|google-analytics|adsystem|adthrive|criteo|rubiconproject|tapad|safeframe|imasdk|scorecardresearch|quantserve|taboola|outbrain|hotjar|facebook\.net|connect\.facebook/i

let filtroInstalado = false
function compartimento() {
  const ses = session.fromPartition(PARTICAO)
  ses.setUserAgent(AGENTE)
  if (!filtroInstalado) {
    filtroInstalado = true
    ses.webRequest.onBeforeRequest((detalhes, responder) => {
      const oculta = detalhes.webContentsId !== undefined && ocultas.has(detalhes.webContentsId)
      if (!oculta) return responder({})
      if (detalhes.resourceType === 'subFrame' || detalhes.resourceType === 'media') {
        return responder({ cancel: true })
      }
      if (
        (detalhes.resourceType === 'script' || detalhes.resourceType === 'xhr') &&
        RASTREIO.test(detalhes.url)
      ) {
        return responder({ cancel: true })
      }
      responder({})
    })
  }
  return ses
}

/**
 * Fecha as abas ocultas AGORA — o usuário saiu da tela Social Arte. A sessão
 * fica no compartimento; a próxima busca recria a janela e o login continua.
 */
export function liberarNavegadores(): void {
  for (const aba of abas.values()) {
    if (aba.janela && !aba.janela.isDestroyed()) aba.janela.destroy()
    aba.janela = null
    aba.pagina = ''
  }
}

/**
 * A janela escondida.
 *
 * `show: false` e não uma janela fora da tela: fora da tela ela ainda apareceria
 * na barra de tarefas e no alternador de janelas do usuário.
 *
 * `backgroundThrottling: false` porque o Chromium congela temporizadores de
 * janela não visível — e a página que estamos lendo se monta com eles.
 */
function pegarJanela(aba: Aba): BrowserWindow {
  if (aba.janela && !aba.janela.isDestroyed()) return aba.janela
  const janela = new BrowserWindow({
    width: 1400,
    height: 1000,
    show: false,
    webPreferences: {
      session: compartimento(),
      backgroundThrottling: false,
      // Vídeo não toca sozinho: a leitura é do DOM, e o autoplay do Pinterest
      // decodificava vídeo numa janela que ninguém vê (MEDIDO: CPU contínua).
      autoplayPolicy: 'user-gesture-required',
      // A página é de terceiro: nada nosso entra nela, e ela não alcança nada
      // nosso. Sem preload, sem integração com Node, isolada e em sandbox.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  janela.webContents.setUserAgent(AGENTE)
  // Nada de janelas novas: um pop-up da página abriria no navegador do sistema,
  // onde o usuário vê o endereço.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Oculta: entra no filtro de rede, e sem áudio — um som saindo de uma
  // janela que não existe na tela seria um fantasma.
  const id = janela.webContents.id
  ocultas.add(id)
  janela.webContents.setAudioMuted(true)
  janela.on('closed', () => {
    ocultas.delete(id)
    aba.janela = null
    aba.pagina = ''
  })
  aba.janela = janela
  aba.ultima = Date.now()
  armarFaxina()
  return janela
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Carrega uma página, e RECLAMA quando o site não colaborou.
 *
 * O status HTTP não chega pelo `loadURL` — ele resolve igual para 200 e para
 * 503 —, e sem ele um servidor recusando virava simplesmente "grade vazia". Foi
 * o que aconteceu: o Pinterest devolveu "upstream connect error or
 * disconnect/reset before headers", a tela mostrou nada, e nada disse por quê.
 * O `did-navigate` traz o código, e é ele que transforma isso numa frase.
 */
async function carregar(win: BrowserWindow, url: string): Promise<void> {
  let status = 0
  const anotar = (_e: unknown, _url: string, codigo: number) => {
    status = codigo
  }
  win.webContents.on('did-navigate', anotar)
  try {
    await Promise.race([
      win.loadURL(url),
      dormir(TIMEOUT_MS).then(() => {
        throw new RedeError(t('a página demorou demais'))
      }),
    ]).catch((erro: Error) => {
      // `loadURL` rejeita quando a navegação é interrompida por um
      // redirecionamento do próprio site — e nesses casos a página CARREGA.
      // Só o tempo esgotado é fatal.
      if (erro instanceof RedeError) throw erro
    })
  } finally {
    win.webContents.off('did-navigate', anotar)
  }
  if (status >= 400) {
    throw new RedeError(
      status === 429 || status === 503
        ? t('o site pediu para esperar (HTTP {status})', { status })
        : t('o site respondeu HTTP {status}', { status }),
    )
  }
}

/**
 * Navega e devolve o resultado do script de leitura.
 *
 * O script vem de `deviantart-dom.ts` — texto escrito no repositório, nunca da
 * tela. É a diferença entre "ler a página" e "executar o que mandarem".
 */
export function navegarELer<T>(url: string, script: string, chave = 'geral'): Promise<T> {
  const aba = pegarAba(chave)
  const meu = aba.fila.then(async () => {
    if (login && !login.isDestroyed()) {
      throw new Error(t('termine o login antes — a janela de acesso está aberta'))
    }
    const desde = Date.now() - aba.ultima
    if (desde < INTERVALO_MS) await dormir(INTERVALO_MS - desde)

    const win = pegarJanela(aba)
    aba.ultima = Date.now()
    await carregar(win, url)
    aba.pagina = url
    return (await assentar<T>(win, script)) as T
  })
  // A fila não pode morrer com um erro: a próxima navegação precisa acontecer.
  aba.fila = meu.catch(() => undefined)
  return meu
}

/**
 * Colhe de uma página que carrega mais conforme se rola.
 *
 * `ja` é o que já foi colhido nesta leitura — passar de volta é o que permite
 * "carregar mais" continuar de onde parou em vez de recomeçar. Se a janela
 * saiu da página (uma busca no meio), ela volta para lá e recolhe até o ponto
 * pedido: mais lento, mas nunca devolve resultado de outra página.
 */
export function navegarEColher<T extends { url: string }>(
  url: string,
  script: string,
  alvo: number,
  ja: Map<string, T>,
  chave = 'geral',
): Promise<{ itens: T[]; fim: boolean }> {
  const aba = pegarAba(chave)
  const meu = aba.fila.then(async () => {
    if (login && !login.isDestroyed()) {
      throw new Error(t('termine o login antes — a janela de acesso está aberta'))
    }
    const desde = Date.now() - aba.ultima
    if (desde < INTERVALO_MS) await dormir(INTERVALO_MS - desde)

    const win = pegarJanela(aba)
    aba.ultima = Date.now()
    // Continuar só vale na mesma página; do contrário recomeça a colheita.
    if (aba.pagina !== url || ja.size === 0) {
      ja.clear()
      await carregar(win, url)
      aba.pagina = url
    }
    return colherRolando(win, script, alvo, ja as Map<string, Colhido>) as Promise<{
      itens: T[]
      fim: boolean
    }>
  })
  aba.fila = meu.catch(() => undefined)
  return meu
}

/** Um registro colhido precisa de identidade para não ser contado duas vezes. */
type Colhido = { url: string }

/**
 * Rola a página e ACUMULA o que aparece, na ordem em que apareceu.
 *
 * Para quando junta `alvo` registros, quando passa `PASSOS_SECOS` rolagens sem
 * nada novo (o feed acabou) ou quando bate o teto de passos. Devolve tudo o que
 * viu — inclusive o que a página já tirou do DOM.
 */
async function colherRolando(
  win: BrowserWindow,
  script: string,
  alvo: number,
  jaVistos: Map<string, Colhido>,
): Promise<{ itens: Colhido[]; fim: boolean }> {
  const guardar = (lidos: unknown) => {
    if (!Array.isArray(lidos)) return 0
    let novos = 0
    for (const r of lidos as Colhido[]) {
      if (!r?.url || jaVistos.has(r.url)) continue
      jaVistos.set(r.url, r)
      novos += 1
    }
    return novos
  }

  // O alvo entra aqui: a primeira leitura já espera pelo que foi pedido, em vez
  // de desistir cedo e deixar a rolagem compensar o que não era problema dela.
  guardar(await assentar<unknown>(win, script, alvo))

  let secos = 0
  let passos = 0
  while (jaVistos.size < alvo && secos < PASSOS_SECOS && passos < PASSOS_MAX) {
    passos += 1
    await win.webContents.executeJavaScript(
      'window.scrollTo(0, document.documentElement.scrollHeight); 1',
      true,
    )
    await dormir(PASSO_ROLAGEM_MS)
    secos = guardar(await win.webContents.executeJavaScript(script, true)) > 0 ? 0 : secos + 1
  }
  return { itens: [...jaVistos.values()], fim: secos >= PASSOS_SECOS }
}

/**
 * Lê até o resultado parar de mudar.
 *
 * "Parar de mudar" é medido pelo TAMANHO do que voltou, quando o script devolve
 * uma lista — que é o caso de todos os leitores de página deste módulo. Para
 * qualquer outra forma de resultado, a primeira leitura já vale: não há o que
 * comparar, e inventar uma comparação genérica seria pior.
 */
async function assentar<T>(win: BrowserWindow, script: string, minimo = 1): Promise<T> {
  await dormir(PRIMEIRA_LEITURA_MS)
  let anterior: unknown = await win.webContents.executeJavaScript(script, true)
  if (!Array.isArray(anterior)) return anterior as T

  let iguais = 1
  const limite = Date.now() + ASSENTAR_MAX_MS
  /*
   * "Assentou" também depende de ter CHEGADO ao que se pediu.
   *
   * Só estabilidade não basta: a grade do ArtStation monta em levas com pausas
   * longas entre elas, e três leituras iguais a 900ms caíam dentro de uma
   * dessas pausas — a colheita fechava em 5 obras quando a página tinha 48. E
   * lista vazia nunca conta: duas leituras vazias "estabilizariam" em zero, e o
   * resultado seria indistinguível de um seletor quebrado.
   *
   * O teto de tempo continua mandando: página que não chega ao mínimo entrega
   * o que tiver.
   */
  while ((iguais < REPETICOES || (anterior as unknown[]).length < minimo) && Date.now() < limite) {
    await dormir(ENTRE_LEITURAS_MS)
    const agora: unknown = await win.webContents.executeJavaScript(script, true)
    if (!Array.isArray(agora)) return agora as T
    // Cresceu: o contador volta a zero — a página ainda está montando.
    iguais = agora.length === (anterior as unknown[]).length ? iguais + 1 : 1
    anterior = agora
  }
  return anterior as T
}

/**
 * Há sessão gravada neste compartimento?
 *
 * Conferido por NOME de cookie, e não por "existe algum cookie deste
 * domínio". MEDIDO em 04/09/2026: uma visita à home do DeviantArt sem login
 * já grava oito cookies — `_px`, `_pxhd`, `_pxvid` (anti-robô), `aws-waf-token`
 * e `g_state`. Contar cookies dizia "conectado" para quem só tinha aberto a
 * página, e o botão "Entrar" sumia antes de alguém entrar.
 *
 * Os que só existem logado são `auth`, `auth_secure` (os dois `httpOnly`) e
 * `userinfo`. Cada fonte declara os seus em `Provedor.sessao`.
 *
 * E presença nem sempre basta. MEDIDO no Pinterest: `_auth`, `_b` e
 * `_pinterest_sess` são gravados numa visita ANÔNIMA — conferir só o nome
 * dizia "conectado" a quem tinha acabado de abrir a página, e a janela de
 * acesso se fechava sozinha antes de a pessoa digitar qualquer coisa. Por isso
 * uma marca pode exigir o VALOR: lá, o que separa logado de deslogado é
 * `_auth` valer `1` em vez de `0`.
 */
export async function temSessao(dominio: string, marcas: readonly Marca[]): Promise<boolean> {
  const cookies = await compartimento().cookies.get({ domain: dominio })
  return cookies.some((c) =>
    marcas.some((m) => m.nome === c.name && (m.valor === undefined || m.valor === c.value)),
  )
}

/**
 * Abre a janela de acesso — a página de verdade da plataforma.
 *
 * Com moldura e barra de título de propósito: é o que permite ao usuário ver em
 * que site está digitando. O app não desenha nada por cima, não injeta script e
 * não lê o conteúdo enquanto ela existe.
 */
export function abrirLogin(
  url: string,
  titulo: string,
  sessao?: { dominio: string; cookies: readonly Marca[] },
): void {
  if (login && !login.isDestroyed()) {
    login.focus()
    return
  }
  login = new BrowserWindow({
    width: 1100,
    height: 820,
    title: titulo,
    autoHideMenuBar: true,
    webPreferences: {
      session: compartimento(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  login.webContents.setUserAgent(AGENTE)
  // O título mostra SEMPRE o endereço em que a página está — inclusive depois
  // de um redirecionamento para o provedor de identidade. É a única defesa que
  // o usuário tem contra digitar a senha no lugar errado, e por isso ela não
  // pode depender do que a página diz de si.
  const carimbar = () => {
    if (!login || login.isDestroyed()) return
    login.setTitle(`${titulo} — ${login.webContents.getURL()}`)
  }
  /*
   * Pop-up de login precisa ABRIR, e na MESMA sessão.
   *
   * "Entrar com Google", "com Epic Games", "com Facebook" — todos abrem uma
   * janela nova, e é nela que a autenticação acontece. Sem tratar isso, o
   * clique não fazia nada visível e o usuário ficava preso na tela de login
   * (aconteceu no ArtStation, cujo acesso é por Epic/Google/Facebook).
   *
   * Ela herda a sessão da janela de acesso — é o que faz o cookie voltar para o
   * nosso compartimento — e carrega a barra de título com o endereço, pela
   * mesma razão da janela mãe: o usuário precisa ver em que site está digitando,
   * ainda mais quando quem pede a senha é um provedor de identidade de terceiro.
   */
  login.webContents.setWindowOpenHandler(({ url }) => {
    if (!/^https?:\/\//i.test(url)) return { action: 'deny' }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 560,
        height: 760,
        title: `Entrar — ${url}`,
        autoHideMenuBar: true,
        webPreferences: {
          session: compartimento(),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      },
    }
  })

  // O pop-up também carimba a URL no título, e pelo mesmo motivo da janela mãe.
  login.webContents.on('did-create-window', (filha) => {
    const carimbarFilha = () => {
      if (!filha.isDestroyed()) filha.setTitle(`Entrar — ${filha.webContents.getURL()}`)
    }
    filha.webContents.on('did-navigate', carimbarFilha)
    filha.webContents.on('did-navigate-in-page', carimbarFilha)
    filha.on('page-title-updated', (e) => {
      e.preventDefault()
      carimbarFilha()
    })
    carimbarFilha()
  })

  login.webContents.on('did-navigate', carimbar)
  login.webContents.on('did-navigate-in-page', carimbar)
  login.on('page-title-updated', (e) => {
    e.preventDefault()
    carimbar()
  })
  /*
   * A janela se fecha sozinha quando a sessão aparece.
   *
   * Sem isto o usuário terminava de entrar e ficava com uma janela do
   * DeviantArt aberta sem saber que precisava fechá-la — e o navegador de
   * segundo plano fica bloqueado enquanto ela existe, então a tela não
   * atualizava. Quem diz que acabou é o cookie de sessão, não a URL: o login
   * pode passar por verificação em duas etapas ou por um provedor de
   * identidade, e adivinhar isso pela página daria falso positivo.
   *
   * O respiro de 1,2s depois de detectar existe porque o site ainda
   * redireciona depois de autenticar — fechar no instante do cookie
   * interromperia a última navegação.
   */
  if (sessao) {
    const relogio = setInterval(async () => {
      if (!login || login.isDestroyed()) {
        clearInterval(relogio)
        return
      }
      if (!(await temSessao(sessao.dominio, sessao.cookies))) return
      clearInterval(relogio)
      setTimeout(() => {
        if (login && !login.isDestroyed()) login.close()
      }, 1200)
    }, 1500)
    login.on('closed', () => clearInterval(relogio))
  }

  login.on('closed', () => {
    login = null
  })
  void login.loadURL(url)
}

/**
 * Esquece a sessão desta fonte.
 *
 * Some com os cookies do domínio no compartimento — é o "sair" que o usuário
 * espera, e ele acontece AQUI e não no site: pedir logout ao servidor exigiria
 * navegar para uma página de saída, e o que ele quer é que a máquina dele
 * esqueça a conta.
 */
export async function limparSessao(dominio: string): Promise<void> {
  const ses = compartimento()
  const cookies = await ses.cookies.get({ domain: dominio })
  await Promise.all(
    cookies.map((c) => {
      const url = `http${c.secure ? 's' : ''}://${c.domain?.replace(/^\./, '') ?? ''}${c.path ?? '/'}`
      return ses.cookies.remove(url, c.name).catch(() => undefined)
    }),
  )
}

/** Fecha tudo. Chamado no encerramento do app. */
export function fecharNavegador(): void {
  for (const aba of abas.values()) {
    if (aba.janela && !aba.janela.isDestroyed()) aba.janela.destroy()
    aba.janela = null
  }
  abas.clear()
  if (login && !login.isDestroyed()) login.destroy()
  login = null
}
