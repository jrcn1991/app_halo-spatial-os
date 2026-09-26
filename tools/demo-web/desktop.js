/*
 * O "desktop" da demo web: o papel de parede do ambiente, a barra do sistema
 * e as quatro janelas do Halo (app, ilha, lançador, balões) em iframes
 * transparentes, como as de verdade são. Esta página faz o papel do processo
 * main: mostra e esconde janelas, decide onde o ponteiro vale e leva o
 * ambiente de uma janela às outras.
 *
 * Gerado por `tools/demo-web.mjs`; o original está em `tools/demo-web/`.
 */
;(() => {
  const W = 1680
  const H = 1050
  const AMBIENTES = ['floresta', 'citypop', 'cyberpunk', 'bioshock']
  const NOMES = {
    floresta: 'Floresta',
    citypop: 'City Pop',
    cyberpunk: 'Cyberpunk',
    bioshock: 'Shock',
  }

  const consulta = new URLSearchParams(location.search)
  const lang = consulta.get('lang') === 'en' ? 'en' : 'pt'
  const T = (pt, en) => (lang === 'en' ? en : pt)
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR'
  const semHover = matchMedia('(hover: none)').matches

  const $ = (id) => document.getElementById(id)
  /** A página do projeto em volta (quando há uma) acompanha o ambiente. */
  const avisar = (msg) => {
    if (parent !== window) parent.postMessage(msg, '*')
  }
  const tela = $('tela')
  const quadros = { app: $('app'), ilha: $('ilha'), lancador: $('lancador'), avisos: $('avisos') }
  /** Onde cada janela está na tela virtual (o lançador pode ser arrastado). */
  const pos = {
    app: { x: 120, y: 93 },
    ilha: { x: 390, y: 0 },
    lancador: { x: 456, y: 231 },
    avisos: { x: 1228, y: 44 },
  }

  for (const b of document.querySelectorAll('[data-t]')) {
    const [pt, en] = b.dataset.t.split('|')
    const texto = T(pt, en)
    const rotulo = b.querySelector('.rotulo')
    if (rotulo) rotulo.textContent = texto
    else b.title = texto
    b.setAttribute('aria-label', texto)
  }

  /* ——— A escala: a tela virtual cabe na janela, centrada ——— */
  let escala = 1
  let ox = 0
  let oy = 0
  function ajustar() {
    escala = Math.min(innerWidth / W, innerHeight / H)
    ox = (innerWidth - W * escala) / 2
    oy = (innerHeight - H * escala) / 2
    tela.style.transform = `translate(${ox}px, ${oy}px) scale(${escala})`
  }
  ajustar()
  addEventListener('resize', ajustar)
  // O monitor não rola: um foco dentro de uma janela não pode arrastar a tela.
  addEventListener('scroll', () => scrollTo(0, 0))

  /* ——— As janelas ——— */
  const q = (extra) => `lang=${lang}${extra ? `&${extra}` : ''}`
  quadros.app.src = `app/index.html?${q()}`
  quadros.ilha.src = `app/island.html?${q(`motion=gota&idle=100&h=36&open=${semHover ? 'click' : 'hover'}`)}`
  quadros.lancador.src = `app/launcher.html?${q('env=floresta')}`
  quadros.avisos.src = `app/notificacoes.html?${q('env=floresta&desfoque=nao')}`

  const doc = (nome) => {
    try {
      return quadros[nome].contentDocument
    } catch {
      return null
    }
  }
  const win = (nome) => quadros[nome].contentWindow

  /* ——— O papel de parede segue o ambiente do app ——— */
  const fundos = [$('fundo-a'), $('fundo-b')]
  let fundoAtivo = 0
  let env = ''
  for (const e of AMBIENTES) new Image().src = `fundos/${e}.jpg`
  function aplicarEnv(novo) {
    if (!AMBIENTES.includes(novo) || novo === env) return
    env = novo
    const proximo = fundos[1 - fundoAtivo]
    proximo.style.backgroundImage = `url(fundos/${novo}.jpg)`
    proximo.classList.add('ativo')
    fundos[fundoAtivo].classList.remove('ativo')
    fundoAtivo = 1 - fundoAtivo
    $('nome-env').textContent = NOMES[novo]
    for (const nome of ['lancador', 'avisos']) {
      const d = doc(nome)
      if (d) d.documentElement.dataset.env = novo
    }
    avisar({ halo: 'env', env: novo })
  }
  aplicarEnv('floresta')

  /* ——— Onde o ponteiro vale: só sobre a gota e os balões, como no app ——— */
  const alvos = { ilha: [], avisos: [] }
  const sobre = (nome, vx, vy) => {
    const x = vx - pos[nome].x
    const y = vy - pos[nome].y
    return alvos[nome].some(
      (r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height,
    )
  }
  function rotear(vx, vy) {
    for (const nome of ['ilha', 'avisos'])
      quadros[nome].style.pointerEvents = sobre(nome, vx, vy) ? 'auto' : 'none'
  }
  const virtual = (e) => [(e.clientX - ox) / escala, (e.clientY - oy) / escala]
  document.addEventListener('pointermove', (e) => rotear(...virtual(e)))
  document.addEventListener('pointerdown', (e) => {
    const [vx, vy] = virtual(e)
    tocar(vx, vy)
    if (!quadros.lancador.contains(e.target)) fecharLancadorFora(vx, vy)
  })

  /**
   * Toque (sem hover): o dedo não passa por cima antes, então o ponteiro não
   * foi roteado a tempo. Se caiu na gota, o clique é entregue a ela.
   */
  function tocar(vx, vy) {
    if (!sobre('ilha', vx, vy)) return
    quadros.ilha.style.pointerEvents = 'auto'
    doc('ilha')
      ?.elementFromPoint(vx - pos.ilha.x, vy - pos.ilha.y)
      ?.click()
  }

  /** Cada janela repassa o ponteiro e as teclas dela para cá. */
  function costurar(nome) {
    const w = win(nome)
    if (!w) return
    w.addEventListener('pointermove', (e) =>
      rotear(e.clientX + pos[nome].x, e.clientY + pos[nome].y),
    )
    w.addEventListener(
      'pointerdown',
      (e) => {
        const vx = e.clientX + pos[nome].x
        const vy = e.clientY + pos[nome].y
        if (nome === 'app') tocar(vx, vy)
        if (nome !== 'lancador') fecharLancadorFora(vx, vy)
      },
      true,
    )
    w.addEventListener('keydown', teclas, true)
    // Nem as janelas: um foco com o monitor meio fora da página rolaria o
    // documento delas (mesmo com `overflow: hidden`) e o app sairia do lugar.
    w.addEventListener('scroll', () => w.scrollX + w.scrollY !== 0 && w.scrollTo(0, 0))
  }
  for (const nome of Object.keys(quadros))
    quadros[nome].addEventListener('load', () => costurar(nome))

  /* ——— O app: o ambiente dele manda em tudo ——— */
  quadros.app.addEventListener('load', () => {
    const raiz = doc('app')?.documentElement
    if (!raiz) return
    const ler = () => raiz.dataset.env && aplicarEnv(raiz.dataset.env)
    new MutationObserver(ler).observe(raiz, { attributes: true, attributeFilter: ['data-env'] })
    ler()
    // Pronto quando o dock aparece.
    const esperar = setInterval(() => {
      if (!doc('app')?.querySelector('nav')) return
      clearInterval(esperar)
      $('carregando').classList.add('pronto')
      avisar({ halo: 'pronto' })
      setTimeout(boasVindas, 2200)
    }, 100)
  })

  let visivel = true
  function janela(mostrar = !visivel) {
    visivel = mostrar
    quadros.app.classList.toggle('recolhida', !mostrar)
    $('b-halo').setAttribute('aria-pressed', String(mostrar))
    win('ilha')?.__demoIlha?.halo(mostrar)
  }

  /** Levar o usuário a um ambiente: a Início, e o cartão dele. */
  function irAoAmbiente(alvo) {
    const d = doc('app')
    if (!d || !AMBIENTES.includes(alvo)) return
    if (!visivel) janela(true)
    d.querySelector('nav[aria-label] button')?.click()
    let tentativas = 0
    const clicar = setInterval(() => {
      const cartao = [
        ...d.querySelectorAll('[aria-label] button, [aria-label] [role="button"]'),
      ].find(
        (b) =>
          b.closest('[aria-label="Ambientes"], [aria-label="Environments"]') &&
          b.textContent.includes(NOMES[alvo]),
      )
      if (cartao || ++tentativas > 20) {
        clearInterval(clicar)
        cartao?.click()
      }
    }, 120)
  }

  /* ——— O lançador ——— */
  let lancadorAberto = false
  function lancador(abrir = !lancadorAberto) {
    lancadorAberto = abrir
    quadros.lancador.classList.toggle('visivel', abrir)
    $('b-lancador').setAttribute('aria-pressed', String(abrir))
    if (abrir) {
      // `env` é o "apareci" do main: o lançador recomeça limpo e se veste.
      win('lancador')?.__vitrine?.emitir('env', env)
      setTimeout(() => {
        win('lancador')?.focus()
        doc('lancador')?.querySelector('input')?.focus()
      }, 30)
    } else if (document.activeElement === quadros.lancador) {
      quadros.app.contentWindow?.focus()
    }
  }
  function fecharLancadorFora(vx, vy) {
    if (!lancadorAberto) return
    const p = pos.lancador
    if (vx < p.x || vx > p.x + 768 || vy < p.y || vy > p.y + 508) lancador(false)
  }
  function moverLancador(dx, dy) {
    pos.lancador.x = Math.max(-300, Math.min(W - 300, pos.lancador.x + dx / escala))
    pos.lancador.y = Math.max(0, Math.min(H - 120, pos.lancador.y + dy / escala))
    quadros.lancador.style.left = `${pos.lancador.x}px`
    quadros.lancador.style.top = `${pos.lancador.y}px`
  }

  /** Meta+V quando o navegador deixa chegar; Ctrl+K (ou ⌘K) sempre. */
  function teclas(e) {
    const k = e.key.toLowerCase()
    if (((e.ctrlKey || e.metaKey) && k === 'k') || (e.metaKey && k === 'v')) {
      e.preventDefault()
      e.stopPropagation()
      lancador()
    } else if (e.metaKey && k === ' ') {
      e.preventDefault()
      janela()
    }
  }
  document.addEventListener('keydown', teclas, true)

  /* ——— Os balões ——— */
  let avisos = []
  let proximoId = 100
  let silencio = false
  const publicarAvisos = () =>
    win('avisos')?.__vitrine?.emitir(
      'avisos',
      avisos.map((a) => ({ ...a })),
    )
  const EXEMPLOS = [
    {
      app: T('Exemplo · Mensagens', 'Sample · Messages'),
      titulo: T('Notificação de exemplo', 'Sample notification'),
      corpo: T(
        'Os balões do sistema vestem o ambiente — este é o do tema atual.',
        'System bubbles wear the environment — this one is the current theme.',
      ),
      acoes: [
        { chave: 'responder', rotulo: T('Responder', 'Reply') },
        { chave: 'lida', rotulo: T('Marcar como lida', 'Mark as read') },
      ],
    },
    {
      app: T('Exemplo · Downloads', 'Sample · Downloads'),
      titulo: T('Download concluído', 'Download finished'),
      corpo: 'halo-spatial-os_0.2.1_amd64.deb',
      acoes: [{ chave: 'abrir', rotulo: T('Abrir a pasta', 'Open folder') }],
    },
    {
      app: T('Exemplo · Agenda', 'Sample · Calendar'),
      titulo: T('Revisão do tema em 10 minutos', 'Theme review in 10 minutes'),
      corpo: T('Sala de vidro, 3º andar.', 'Glass room, 3rd floor.'),
      acoes: [{ chave: 'adiar', rotulo: T('Adiar', 'Snooze') }],
    },
    {
      app: T('Exemplo · Sistema', 'Sample · System'),
      titulo: T('Aviso de urgência baixa', 'Low-urgency notice'),
      corpo: T('Exemplo de um aviso discreto.', 'A quiet notice, for example.'),
      acoes: [],
      urgencia: 'baixa',
    },
  ]
  let exemplo = 0
  function notificar(base = EXEMPLOS[exemplo++ % EXEMPLOS.length]) {
    const aviso = {
      id: ++proximoId,
      icone: null,
      imagem: null,
      urgencia: 'normal',
      temPadrao: false,
      expiraMs: 9000,
      at: Date.now(),
      ...base,
    }
    win('ilha')?.__demoIlha?.aviso(aviso)
    // "Não perturbe" ligado na ilha: vai para a lista dela, sem balão — como no app.
    if (silencio) {
      win('ilha')?.__demoIlha?.anunciar('BellSlash', T('Silenciada', 'Silenced'), aviso.titulo)
      return
    }
    avisos = [aviso, ...avisos].slice(0, 4)
    publicarAvisos()
  }
  function dispensar(id) {
    avisos = avisos.filter((a) => a.id !== id)
    publicarAvisos()
  }
  function agirAviso(id, chave) {
    dispensar(id)
    if (chave === 'lancador') lancador(true)
    else if (chave !== 'default')
      win('ilha')?.__demoIlha?.anunciar(
        'Check',
        T('Ação do aviso', 'Notification action'),
        T('no app, volta ao aplicativo que avisou', 'in the app, it goes back to the sender'),
      )
  }
  function boasVindas() {
    notificar({
      app: 'Halo · demo',
      titulo: T('Bem-vindo ao Halo', 'Welcome to Halo'),
      corpo: T(
        'Passe o mouse na pílula lá em cima, troque o ambiente nos cartões da Início e aperte Ctrl+K para o lançador.',
        'Hover the pill up top, switch environments from the Home cards and press Ctrl+K for the launcher.',
      ),
      acoes: [{ chave: 'lancador', rotulo: T('Abrir o lançador', 'Open the launcher') }],
      expiraMs: 14000,
    })
  }

  /* ——— A barra do sistema ——— */
  $('b-lancador').addEventListener('click', () => lancador())
  $('b-aviso').addEventListener('click', () => notificar())
  $('b-halo').addEventListener('click', () => janela())
  const relogio = () => {
    $('relogio').textContent = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'pt-BR', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date())
  }
  relogio()
  setInterval(relogio, 15_000)

  /* ——— O que as janelas pedem (a ponte que o main faz no app) ——— */
  window.__demo = {
    regiao: (nome, lista) => {
      alvos[nome] = Array.isArray(lista) ? lista : []
    },
    rodar: (id, arg) => win('ilha')?.__demoIlha?.rodar(id, arg),
    janela,
    lancador,
    moverLancador,
    avisos: () => avisos.map((a) => ({ ...a })),
    dispensar,
    agirAviso,
    silencio: (on) => {
      silencio = on
    },
  }

  /* ——— E o que a página do projeto pede ——— */
  addEventListener('message', (e) => {
    if (e.source !== parent || !e.data || typeof e.data !== 'object') return
    const { halo, env: alvo } = e.data
    if (halo === 'lancador') lancador(true)
    else if (halo === 'aviso') notificar()
    else if (halo === 'janela') janela()
    else if (halo === 'ambiente') irAoAmbiente(alvo)
  })
})()
