/*
 * A camada da DEMO WEB, por cima do `window.halo` de mentira da vitrine
 * (`tools/vitrine-demo.mjs`, SCRIPT_HALO). Roda na ilha, no lançador e na
 * janela dos balões, dentro de `site/demo/`.
 *
 * A vitrine só precisava de uma ilha parada para fotografar; a demo precisa de
 * uma que RESPONDA. Aqui as ações ganham efeito (o café liga, o volume sobe, a
 * janela do Halo recolhe), e as três janelas conversam pela página do
 * "desktop" (`window.parent.__demo`, `desktop.js`) — a mesma costura que o
 * processo main faz no app de verdade.
 *
 * Nada sai daqui: não há rede, não há máquina. O que "abriria" um app ou um
 * endereço vira um aviso na pílula dizendo que, no app, ele abriria.
 */
;(() => {
  const v = window.__vitrine
  const halo = window.halo
  if (!v || !halo) return
  const demo = window.parent !== window ? window.parent.__demo : null
  const ingles = new URLSearchParams(location.search).get('lang') === 'en'
  const T = (pt, en) => (ingles ? en : pt)
  const snap = v.snapshot

  /* ——— O instantâneo: cópia nova a cada leitura (o React compara por referência) ——— */
  const copia = () => ({
    ...snap,
    at: Date.now(),
    modules: snap.modules.map((m) => ({ ...m, readings: m.readings.map((r) => ({ ...r })) })),
    notices: [...snap.notices],
  })
  const modulo = (id) => snap.modules.find((m) => m.id === id)
  const leitura = (id) => {
    for (const m of snap.modules) for (const r of m.readings) if (r.id === id) return r
    return null
  }
  const publicar = () => v.emitir('snapshot', copia())
  halo.island.snapshot = () => Promise.resolve(copia())

  /* ——— O relógio é o de quem visita (a hora dele, no idioma da página) ——— */
  const locale = ingles ? 'en-US' : 'pt-BR'
  const hora = (d, fuso) =>
    new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: fuso }).format(
      d,
    )
  function acertarRelogio() {
    const d = new Date()
    const h = leitura('relogio-hora')
    if (h) h.value = hora(d)
    const data = leitura('relogio-data')
    if (data)
      data.value = new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(d)
    const mundo = leitura('relogio-mundo')
    if (mundo) {
      const t = `Tokyo ${hora(d, 'Asia/Tokyo')}`
      mundo.value = t
      mundo.detail = `${t};New York ${hora(d, 'America/New_York')}`
    }
  }
  acertarRelogio()

  /* ——— A pílula anuncia ——— */
  const anunciar = (icon, text, detail = '', extra = {}) =>
    v.emitir('evento', { icon, text, detail, level: 'ok', kind: 'aviso', ttlMs: 2600, ...extra })

  /* ——— A música: três faixas inventadas, que avançam e voltam ——— */
  const FAIXAS = [
    ['Low Fog Over Pines', 'Hana Vale', 'Northbound'],
    ['Glass Harbor', 'Os Relojoeiros', 'Maré de Neon'],
    ['Copper Sun', 'Kepler Choir', 'Jardim de Cobre'],
  ]
  let faixa = 0
  function trocarFaixa(passo) {
    faixa = (faixa + passo + FAIXAS.length) % FAIXAS.length
    const [titulo, artista, album] = FAIXAS[faixa]
    const r = leitura('midia-tocando')
    if (r) {
      r.value = titulo
      r.detail = artista
      r.art = globalThis.__vitrineCapa(album)
    }
    anunciar('MusicNotes', titulo, artista)
  }

  function volume(novo) {
    const r = leitura('volume')
    const antes = r ? r.ratio : 0.62
    const ratio = Math.max(0, Math.min(1, novo(antes)))
    if (r) {
      r.ratio = ratio
      r.value = `${Math.round(ratio * 100)}%`
    }
    v.emitir('evento', {
      icon: ratio === 0 ? 'SpeakerSlash' : 'SpeakerHigh',
      text: 'Volume',
      detail: `${Math.round(ratio * 100)}%`,
      level: 'ok',
      kind: 'hud',
      ratio,
      key: 'volume',
      ttlMs: 1400,
    })
  }

  const alternar = (id, ligado, desligado) => {
    const r = leitura(id)
    if (!r) return false
    r.value = r.value === ligado ? desligado : ligado
    return r.value === ligado
  }

  /* ——— As ações. Vale para a ilha e, pela página, para o lançador ——— */
  function agir(id, arg) {
    switch (id) {
      case 'halo-recolher':
        demo?.janela(false)
        return
      case 'halo-trazer':
      case 'halo-tela':
        demo?.janela(true)
        return
      case 'silencio-alternar': {
        const on = alternar('silencio', 'ligado', 'desligado')
        demo?.silencio(on)
        anunciar(
          on ? 'BellSlash' : 'Bell',
          T('Não perturbe', 'Do not disturb'),
          on ? T('ligado', 'on') : T('desligado', 'off'),
        )
        return
      }
      case 'cafeina-alternar': {
        const on = alternar('cafeina', 'pela ilha', 'desligada')
        anunciar(
          'Coffee',
          T('Cafeína', 'Caffeine'),
          on ? T('a tela não apaga', 'screen stays on') : T('desligada', 'off'),
        )
        return
      }
      case 'bluetooth-alternar':
        alternar('bluetooth', 'ligado', 'desligado')
        return
      case 'wifi-alternar': {
        const rede = modulo('rede')
        const sinal = rede.readings.findIndex((r) => r.id === 'wifi-sinal')
        if (sinal >= 0) rede.readings.splice(sinal, 1)
        else
          rede.readings.splice(1, 0, {
            id: 'wifi-sinal',
            label: 'Sinal',
            value: '82%',
            detail: 'Wi-Fi',
            ratio: 0.82,
            level: 'ok',
          })
        anunciar(
          sinal >= 0 ? 'WifiSlash' : 'WifiHigh',
          'Wi-Fi',
          sinal >= 0 ? T('desligado', 'off') : T('ligado', 'on'),
        )
        return
      }
      case 'volume-subir':
        return volume((r) => r + 0.06)
      case 'volume-baixar':
        return volume((r) => r - 0.06)
      case 'volume-mudo':
        return volume((r) => (r > 0 ? 0 : 0.62))
      case 'midia-alternar': {
        const on = alternar('midia-estado', 'tocando', 'pausado')
        anunciar(
          on ? 'Play' : 'Pause',
          on ? T('Tocando', 'Playing') : T('Pausado', 'Paused'),
          FAIXAS[faixa][0],
        )
        return
      }
      case 'midia-proxima':
        return trocarFaixa(1)
      case 'midia-anterior':
        return trocarFaixa(-1)
      case 'midia-embaralhar':
      case 'midia-repetir':
        return anunciar(id === 'midia-embaralhar' ? 'Shuffle' : 'Repeat', T('Feito', 'Done'))
      case 'timer-iniciar': {
        const [min, ...rotulo] = String(arg ?? '25').split(' ')
        const minutos = Math.max(1, Number(min) || 25)
        const agora = Date.now()
        snap.timer = {
          start: agora,
          end: agora + minutos * 60_000,
          label: rotulo.join(' ') || T('Foco', 'Focus'),
          minutes: minutos,
        }
        return
      }
      case 'timer-cronometro':
        snap.timer = {
          start: Date.now(),
          end: null,
          label: T('Cronômetro', 'Stopwatch'),
          minutes: 0,
        }
        return
      case 'timer-parar':
        snap.timer = null
        return
      case 'clip-escrever':
      case 'clip-copiar':
      case 'gaveta-guardar-texto': {
        const texto =
          id === 'clip-copiar'
            ? (snap.clips.find((c) => String(c.id) === String(arg))?.preview ?? '')
            : String(arg ?? '')
        // A área de transferência é a de quem visita, e só com o gesto dele.
        navigator.clipboard?.writeText(texto).catch(() => {})
        anunciar('Copy', T('Copiado', 'Copied'), texto.slice(0, 40))
        return
      }
      case 'apps-abrir':
      case 'janela-focar':
        return anunciar(
          'AppWindow',
          T('No app, abriria aqui', 'In the app, it would open'),
          nomeDoApp(arg),
        )
      case 'abrir-caminho':
        return anunciar(
          'ArrowSquareOut',
          T('No app, abriria no navegador', 'In the app, it would open in the browser'),
          String(arg ?? '').slice(0, 44),
        )
      case 'claude-perguntar':
        return perguntar(String(arg ?? ''))
      default:
        return anunciar(
          'Sparkle',
          T('Na demo, só o aviso', 'Demo: just the notice'),
          T('no app, isto age no sistema', 'in the app, this acts on the system'),
        )
    }
  }

  const nomeDoApp = (arg) => {
    const s = String(arg ?? '')
    const base =
      s
        .split('/')
        .pop()
        ?.replace(/\.desktop$/, '') ?? s
    return base.replace(/^org\.kde\./, '').replace(/^./, (c) => c.toUpperCase())
  }

  /* ——— O Claude da ilha responde, dizendo que é demonstração ——— */
  let claude = null
  halo.island.claude().then((c) => {
    claude = c
  })
  function perguntar(texto) {
    if (!claude || !texto) return
    const agora = Date.now()
    claude = {
      ...claude,
      messages: [
        ...claude.messages,
        { id: `u${agora}`, role: 'user', text: texto, at: agora },
        {
          id: `a${agora}`,
          role: 'assistant',
          text: T(
            'Esta é a demonstração na página do projeto: aqui não há agente rodando. No app, a pergunta vai para o Claude Code aberto no seu projeto, e a resposta chega aqui na ilha.',
            'This is the demo on the project page: no agent runs here. In the app, the question goes to Claude Code running in your project, and the answer lands here on the island.',
          ),
          at: agora + 1,
        },
      ],
    }
    v.emitir('claude', claude)
    anunciar('Sparkle', 'Claude', T('resposta de exemplo', 'sample answer'))
  }
  halo.island.claude = () => Promise.resolve(claude)

  /* ——— Quem pede o quê à página ——— */
  const pagina = location.pathname.split('/').pop()
  if (pagina === 'island.html') {
    halo.island.run = (id, arg) => {
      agir(id, arg)
      publicar()
      return Promise.resolve()
    }
    halo.island.alvo = (lista) => demo?.regiao('ilha', lista)
    // A página chama por aqui o que vem das outras janelas (lançador, balões).
    window.__demoIlha = {
      rodar: (id, arg) => halo.island.run(id, arg),
      anunciar,
      halo: (mostrar) => {
        const r = leitura('halo-na-ilha')
        if (r) r.value = mostrar ? 'à vista' : 'na ilha'
        publicar()
      },
      aviso: (a) => {
        snap.notices = [
          {
            id: a.id,
            at: Date.now(),
            app: a.app,
            title: a.titulo,
            body: a.corpo,
            urgent: false,
            desktopEntry: '',
          },
          ...snap.notices,
        ].slice(0, 8)
        const r = leitura('avisos-recentes')
        if (r) r.value = String(snap.notices.length)
        publicar()
      },
    }
    setInterval(() => {
      acertarRelogio()
      publicar()
    }, 20_000)
  } else {
    // No lançador (e nos balões) a ação é da ilha: a página repassa.
    halo.island.run = (id, arg) => {
      demo?.rodar(id, arg)
      return Promise.resolve()
    }
  }

  if (pagina === 'launcher.html') {
    halo.launcher.hide = () => demo?.lancador(false)
    halo.launcher.toggle = () => demo?.lancador()
    halo.launcher.arrastar = (dx, dy) => demo?.moverLancador(dx, dy)
    const recentes = []
    halo.launcher.recentes().then((r) => recentes.push(...r))
    halo.launcher.recentes = () => Promise.resolve(recentes.map((r) => ({ ...r })))
    halo.launcher.uso = (u) => {
      const achado = recentes.find((r) => r.chave === u.chave)
      if (achado) Object.assign(achado, u, { n: achado.n + 1, at: Date.now() })
      else recentes.unshift({ ...u, n: 1, at: Date.now() })
    }
  }

  if (pagina === 'notificacoes.html') {
    halo.notificacoes.lista = () => Promise.resolve(demo ? demo.avisos() : [])
    halo.notificacoes.fechar = (id) => demo?.dispensar(id)
    halo.notificacoes.esquecer = (id) => demo?.dispensar(id)
    halo.notificacoes.agir = (id, chave) => demo?.agirAviso(id, chave)
    halo.notificacoes.regiao = (lista) => demo?.regiao('avisos', lista)
  }
})()
