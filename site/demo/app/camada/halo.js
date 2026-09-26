
(() => {
  const PALETAS = [
    ['#0f2027', '#2c5364', '#f7b267', '#fef3e2'],
    ['#1a0b2e', '#7a1fa2', '#ff6f91', '#ffe3ec'],
    ['#0b3d2e', '#1f7a5a', '#e9d8a6', '#f6f1e1'],
    ['#2b1055', '#d53369', '#ffd26f', '#fff4d6'],
    ['#001d3d', '#0077b6', '#90e0ef', '#e8f9ff'],
    ['#240046', '#f72585', '#4cc9f0', '#f1e9ff'],
    ['#1b1b1f', '#3d3d48', '#e94560', '#f7e8ea'],
    ['#16222a', '#3a6073', '#f4d35e', '#fbf5dc'],
    ['#3d1308', '#9f2a00', '#ffb347', '#fff1dd'],
    ['#05161a', '#0c6170', '#a4e5e0', '#e9fbf9'],
  ]
  const hash = (s) => {
    let h = 2166136261
    for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619)
    return h >>> 0
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  // Parênteses e aspas também saem codificados: a Home usa a capa num
  // \`background-image: url(...)\` sem aspas, e um "(" cru fecharia o url().
  const url = (svg) =>
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(svg).replace(/[()']/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

  /** Um horizonte: sol, duas cordilheiras e o reflexo. Muda com o nome. */
  function paisagem(h, w, alt, p) {
    const sol = 0.24 + ((h >>> 3) % 24) / 100
    const sx = w * (0.3 + ((h >>> 7) % 40) / 100)
    const r = w * (0.16 + ((h >>> 11) % 10) / 100)
    const onda = (y, amp, fase) => {
      let d = 'M0 ' + y
      for (let x = 0; x <= w; x += w / 8) d += ' Q' + (x + w / 16) + ' ' + (y - amp * Math.sin(x / w * 6 + fase)) + ' ' + (x + w / 8) + ' ' + y
      return d + ' L' + w + ' ' + alt + ' L0 ' + alt + 'Z'
    }
    const listras = (h & 1)
      ? Array.from({ length: 5 }, (_, i) => '<rect x="0" y="' + (alt * sol + r * 0.2 + i * r * 0.16) + '" width="' + w + '" height="' + (r * 0.05 + i * 1.2) + '" fill="' + p[0] + '"/>').join('')
      : ''
    return (
      '<defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + p[0] + '"/><stop offset=".62" stop-color="' + p[1] + '"/><stop offset="1" stop-color="' + p[2] + '"/></linearGradient>' +
      '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + p[3] + '"/><stop offset="1" stop-color="' + p[2] + '"/></linearGradient>' +
      '<radialGradient id="g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="' + p[2] + '" stop-opacity=".55"/><stop offset="1" stop-color="' + p[2] + '" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="' + w + '" height="' + alt + '" fill="url(#c)"/>' +
      '<circle cx="' + sx + '" cy="' + alt * sol + '" r="' + r * 2.2 + '" fill="url(#g)"/>' +
      '<circle cx="' + sx + '" cy="' + alt * sol + '" r="' + r + '" fill="url(#s)"/>' + listras +
      '<path d="' + onda(alt * (sol + 0.16), alt * 0.05, h % 7) + '" fill="' + p[1] + '" opacity=".75"/>' +
      '<path d="' + onda(alt * (sol + 0.26), alt * 0.04, (h >>> 5) % 7) + '" fill="' + p[0] + '" opacity=".9"/>'
    )
  }

  /** Capa quadrada de disco. */
  function capa(nome) {
    const h = hash(nome)
    const p = PALETAS[h % PALETAS.length]
    return url('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">' + paisagem(h, 300, 300, p) + '</svg>')
  }

  /** Cartaz 2:3 de filme, com o título. */
  function cartaz(nome, ano) {
    const h = hash(nome + 'filme')
    const p = PALETAS[h % PALETAS.length]
    const palavras = String(nome).toUpperCase().split(' ')
    const linhas = []
    for (const pa of palavras) {
      const ult = linhas[linhas.length - 1]
      if (ult && (ult + ' ' + pa).length <= 12) linhas[linhas.length - 1] = ult + ' ' + pa
      else linhas.push(pa)
    }
    const texto = linhas
      .map((l, i) => '<text x="200" y="' + (470 + i * 50 - (linhas.length - 1) * 50) + '" text-anchor="middle" font-family="Georgia, serif" font-size="44" letter-spacing="3" fill="' + p[3] + '">' + esc(l) + '</text>')
      .join('')
    return url(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600">' + paisagem(h, 400, 600, p) +
      '<rect y="360" width="400" height="240" fill="' + p[0] + '" opacity=".55"/>' + texto +
      '<text x="200" y="548" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" letter-spacing="6" fill="' + p[3] + '" opacity=".75">' + (ano || '') + ' · DEMO</text></svg>',
    )
  }

  /** Uma arte de qualquer proporção, para as referências da Social. */
  function arte(nome, w, h) {
    const hh = hash(nome + 'arte')
    const p = PALETAS[hh % PALETAS.length]
    return url('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '">' + paisagem(hh, w, h, p) + '</svg>')
  }

  /** Referências de exemplo: arte gerada aqui, endereços que não existem. */
  const REFERENCIAS = [
    ['Estudo de luz no nevoeiro', 'ilustracao', 400, 500],
    ['Paleta: pôr do sol em Kepler', 'design', 400, 300],
    ['Cidade à beira-mar, 1988', 'arte-digital', 400, 520],
    ['Painel de vidro — conceito', 'conceito', 400, 300],
    ['Farol e maré baixa', 'ilustracao', 400, 480],
    ['Horizonte em três camadas', 'arte-digital', 400, 400],
    ['Neblina sobre pinhais', 'fotografia', 400, 560],
    ['Sol de cobre', 'design', 400, 320],
    ['Estação norte ao anoitecer', 'conceito', 400, 500],
    ['Ondas em magenta', 'arte-digital', 400, 400],
    ['Duas luas', 'ilustracao', 400, 540],
    ['Grade de cartazes', 'design', 400, 300],
  ].map(([title, kind, w, h], i) => ({
    id: 'link:demo-' + i, provider: 'link', externalId: 'demo-' + i, title,
    description: 'Arte gerada para a vitrine do Halo (exemplo).', author: 'Exemplo',
    authorAvatar: '', cover: arte(title, w, h), gallery: [], url: 'https://exemplo.invalid/referencia-' + i,
    kind, tags: ['exemplo'], license: '', likes: null, views: null, downloads: null, publishedAt: null, meta: {},
  }))

  globalThis.__vitrineCapa = capa
  globalThis.__vitrineCartaz = cartaz
  globalThis.__vitrineSocial = () => REFERENCIAS.map((r) => ({ ...r }))
  globalThis.__vitrineBiblioteca = () => ({
    collections: [
      { id: 'c1', name: 'Inspirações', description: '', color: '--accent-violet', icon: 'Sparkle', createdAt: '2026-09-01T10:00:00Z' },
      { id: 'c2', name: 'Paletas', description: '', color: '--accent-mint', icon: 'Palette', createdAt: '2026-09-02T10:00:00Z' },
    ],
    items: REFERENCIAS.slice(0, 6).map((item, i) => ({
      item, collections: [i % 2 ? 'c2' : 'c1'], tags: ['exemplo'], note: '',
      savedAt: '2026-09-2' + (i % 4) + 'T10:00:00Z', favorite: i < 2,
    })),
  })
})();

(() => {
  const AGORA = Date.now()
  const ler = (id, label, value, detail = '', ratio = null, level = 'ok', art) =>
    art ? { id, label, value, detail, ratio, level, art } : { id, label, value, detail, ratio, level }
  const modulo = (id, name, icon, readings, actions = []) => ({ id, name, icon, readings, actions, ok: true, error: null })

  const snapshot = {
    at: AGORA,
    modules: [
      modulo('tempo', 'Relógio e clima', 'Clock', [
        ler('relogio-hora', 'Hora', '09:41'),
        ler('relogio-data', 'Data', 'quinta-feira, 24 de setembro'),
        ler('relogio-mundo', 'Outros fusos', 'Tokyo 17:41', 'Tokyo 17:41;New York 04:41'),
        ler('clima-temp', 'Clima', '14°', 'Lisboa'),
        ler('clima-condicao', 'Céu', 'neblina'),
      ]),
      modulo('midia', 'Tocando agora', 'MusicNotes', [
        ler('midia-tocando', 'Tocando', 'Low Fog Over Pines', 'Hana Vale', 0.38, 'ok', globalThis.__vitrineCapa('Northbound')),
        ler('midia-estado', 'Estado', 'tocando'),
        ler('midia-progresso', 'Progresso', '1:24', 'de 3:41', 0.38),
        ler('midia-player', 'Player', 'Spotify'),
        ler('midia-modos', 'Embaralhar e repetir', 'em ordem', 'repete a lista'),
      ], [
        { id: 'midia-anterior', label: 'Anterior', icon: 'SkipBack' },
        { id: 'midia-alternar', label: 'Tocar ou pausar', icon: 'Play' },
        { id: 'midia-proxima', label: 'Próxima', icon: 'SkipForward' },
        { id: 'midia-embaralhar', label: 'Embaralhar', icon: 'Shuffle' },
        { id: 'midia-repetir', label: 'Repetir', icon: 'Repeat' },
      ]),
      modulo('sistema', 'Sistema', 'Cpu', [
        ler('cpu', 'Processador', '34%', '16 núcleos', 0.34),
        ler('memoria', 'Memória', '11.8 GB', 'de 32 GB', 0.37),
        ler('carga', 'Carga', '2.14', '16 núcleos', 0.13),
        ler('uptime', 'Ligado há', '3d 4h'),
        ler('processo-topo', 'Mais pesado', 'blender', '41% de CPU', 0.41),
        ler('temp-cpu', 'Temperatura', '52°C', 'processador', 0.52),
        ler('disco-raiz', 'Disco', '61%', '312 GB livres', 0.61),
      ]),
      modulo('gpu', 'Placa de vídeo', 'GraphicsCard', [
        ler('gpu-uso', 'Placa de vídeo', '46%', 'Exemplo GTX', 0.46),
        ler('gpu-temp', 'Temperatura', '58°C', 'GPU', 0.58),
        ler('gpu-memoria', 'Memória de vídeo', '3.2 GB', 'de 8 GB', 0.4),
      ]),
      modulo('audio', 'Áudio', 'SpeakerHigh', [
        ler('volume', 'Volume', '62%', 'Fones', 0.62),
        ler('saida-audio', 'Saída', 'Fones'),
        ler('mic-mudo', 'Microfone', 'ligado'),
      ], [
        { id: 'volume-baixar', label: 'Menos volume', icon: 'SpeakerLow' },
        { id: 'volume-mudo', label: 'Mudo', icon: 'SpeakerSlash' },
        { id: 'volume-subir', label: 'Mais volume', icon: 'SpeakerHigh' },
      ]),
      modulo('rede', 'Rede', 'WifiHigh', [
        ler('rede-conexao', 'Rede', 'Estúdio', 'wifi'),
        ler('wifi-sinal', 'Sinal', '82%', 'Wi-Fi', 0.82),
        ler('rede-baixando', 'Baixando', '2.4 MB/s'),
        ler('rede-enviando', 'Enviando', '180 KB/s'),
      ]),
      modulo('bluetooth', 'Bluetooth', 'Bluetooth', [
        ler('bluetooth', 'Bluetooth', 'ligado'),
        ler('bluetooth-conectados', 'Conectados', '1', 'Fones'),
        ler('bluetooth-bateria', 'Bateria', '80%', 'Fones', 0.8),
      ]),
      modulo('avisos', 'Avisos', 'BellRinging', [
        ler('silencio', 'Não perturbe', 'desligado'),
        ler('avisos-recentes', 'Recentes', '3'),
      ]),
      modulo('desktop', 'Área de trabalho', 'Desktop', [
        ler('cafeina', 'Cafeína', 'desligada'),
        ler('kde-desktop', 'Área de trabalho', '1'),
      ]),
      modulo('halo', 'Halo', 'Halo', [ler('halo-na-ilha', 'Janela', 'à vista')]),
      modulo('foco', 'Foco', 'Target', [
        ler('foco-hoje', 'Hoje', '75 min', '3 sessões'),
        ler('foco-semana', 'Semana', '6h 10m', '25;50;75;0;100;50;75'),
        ler('foco-sequencia', 'Sequência', '4 dias'),
      ]),
    ],
    // Sem temporizador correndo: a pílula fechada mostra a música (capa e onda).
    timer: null,
    notices: [
      { id: 3, at: AGORA - 120_000, app: 'Exemplo · Mensagens', title: 'Notificação de exemplo', body: 'Os avisos do sistema aparecem aqui e na Início.', urgent: false, desktopEntry: '' },
      { id: 2, at: AGORA - 900_000, app: 'Exemplo · Downloads', title: 'Download concluído', body: 'halo-spatial-os_0.2.1_amd64.deb', urgent: false, desktopEntry: '' },
      { id: 1, at: AGORA - 3_600_000, app: 'Exemplo · Sistema', title: 'Atualizações disponíveis', body: '4 pacotes', urgent: false, desktopEntry: '' },
    ],
    downloads: [],
    clips: [
      { id: 6, at: AGORA - 30_000, preview: 'sudo apt install ./halo-spatial-os_0.2.1_amd64.deb', length: 49, kind: 'texto', pinned: true },
      { id: 5, at: AGORA - 90_000, preview: 'https://github.com/jrcn1991/halo-spatial-os', length: 43, kind: 'url', pinned: false },
      { id: 4, at: AGORA - 200_000, preview: '#61d19a', length: 7, kind: 'cor', pinned: false },
      { id: 3, at: AGORA - 400_000, preview: 'contato@exemplo.com', length: 19, kind: 'email', pinned: false },
      { id: 2, at: AGORA - 800_000, preview: 'Vidro, blur e o custo de compor em tempo real', length: 45, kind: 'texto', pinned: false },
    ],
    note: 'Ideias para o fim de semana:\n— tema Estúdio\n— ícones do clima\n— testar a gaveta com arquivos grandes',
    lyrics: null,
    activities: [],
    halo: { recolhido: false },
  }

  const shelf = [
    { path: '/exemplo/briefing.pdf', name: 'briefing.pdf', exists: true, kind: 'arquivo' },
    { path: '/exemplo/paleta-floresta.png', name: 'paleta-floresta.png', exists: true, kind: 'arquivo' },
    { path: '/exemplo/trecho.txt', name: 'Trecho: a ilha abre ao passar o mouse', exists: true, kind: 'texto' },
    { path: 'https://jrcn1991.github.io/halo-spatial-os/', name: 'jrcn1991.github.io/halo-spatial-os', exists: true, kind: 'url' },
  ]
  const janelas = [
    { id: 'w1', title: 'Documentação — Kate', appClass: 'org.kde.kate', minimized: false, active: true },
    { id: 'w2', title: 'Downloads — Dolphin', appClass: 'org.kde.dolphin', minimized: false, active: false },
    { id: 'w3', title: 'Terminal — Konsole', appClass: 'org.kde.konsole', minimized: false, active: false },
    { id: 'w4', title: 'Firefox', appClass: 'firefox', minimized: false, active: false },
  ]
  const guardadas = [
    { id: 'w5', title: 'Referências — Gwenview', appClass: 'org.kde.gwenview', minimized: true, active: false },
  ]
  const claude = {
    agent: { id: 'a1', project: '/exemplo/halo', name: 'halo', state: 'ocioso', sessionId: null, activity: '', turns: 1, lastAt: AGORA - 20_000, error: null },
    messages: [
      { id: 'm1', role: 'user', text: 'O que a ilha mostra quando nada está tocando?', at: AGORA - 60_000 },
      { id: 'm2', role: 'assistant', text: 'O panorama: hora, clima e os medidores vivos — processador, memória, temperatura e rede. Cada um abre o painel de onde veio.', at: AGORA - 20_000 },
    ],
    project: '/exemplo/halo',
    projects: ['/exemplo/halo'],
    mode: 'plan',
  }
  const apps = [
    ['firefox', 'Firefox', 'Navegador', ['Network', 'WebBrowser']],
    ['org.kde.dolphin', 'Dolphin', 'Gerenciador de arquivos', ['System', 'FileManager']],
    ['org.kde.konsole', 'Konsole', 'Terminal', ['System', 'TerminalEmulator']],
    ['org.kde.kate', 'Kate', 'Editor de texto', ['Utility', 'TextEditor']],
    ['org.kde.spectacle', 'Spectacle', 'Captura de tela', ['Utility']],
    ['org.kde.gwenview', 'Gwenview', 'Visualizador de imagens', ['Graphics']],
    ['blender', 'Blender', 'Modelagem 3D', ['Graphics']],
    ['gimp', 'GIMP', 'Editor de imagens', ['Graphics']],
    ['spotify', 'Spotify', 'Música', ['AudioVideo']],
    ['org.kde.systemsettings', 'Configurações do Sistema', 'Configurações', ['Settings']],
    ['halo-spatial-os', 'Halo', 'Spatial OS', ['Utility']],
    ['krita', 'Krita', 'Pintura digital', ['Graphics']],
  ].map(([id, name, comment, categories]) => ({ id: '/usr/share/applications/' + id + '.desktop', name, comment, categories }))
  const recentes = [
    { chave: 'app:firefox', tipo: 'app', id: apps[0].id, titulo: 'Firefox', icone: 'AppWindow', n: 14, at: AGORA - 3_600_000 },
    { chave: 'comando:cafeina-alternar', tipo: 'comando', id: 'cafeina-alternar', titulo: 'Cafeína', icone: 'Coffee', n: 6, at: AGORA - 7_200_000 },
    { chave: 'app:blender', tipo: 'app', id: apps[6].id, titulo: 'Blender', icone: 'AppWindow', n: 5, at: AGORA - 86_400_000 },
    { chave: 'comando:kde-captura', tipo: 'comando', id: 'kde-captura', titulo: 'Capturar a tela', icone: 'Camera', n: 4, at: AGORA - 172_800_000 },
  ]

  /* Quem se inscreveu em quê — a vitrine empurra eventos por aqui. */
  const ouvintes = {}
  const ouvir = (nome) => (fn) => {
    ;(ouvintes[nome] ||= new Set()).add(fn)
    return () => ouvintes[nome].delete(fn)
  }
  const emitir = (nome, dado) => ouvintes[nome]?.forEach((fn) => fn(dado))
  const nada = () => {}
  const ok = (v) => () => Promise.resolve(v)

  /* A onda da pílula: um espectro de mentira, ~15 vezes por segundo. */
  let fase = 0
  setInterval(() => {
    fase += 0.45
    emitir('espectro', [0, 1, 2, 3, 4].map((i) => 0.35 + 0.5 * Math.abs(Math.sin(fase + i * 1.3) * Math.cos(fase * 0.37 + i))))
  }, 66)

  const halo = {
    island: {
      snapshot: ok(snapshot), run: ok(undefined), setOpen: nada, displays: ok([]), catalog: ok([]),
      onSnapshot: ouvir('snapshot'), shelf: ok(shelf), notices: ok({ listening: true, items: snapshot.notices }),
      onNoticesChanged: ouvir('x'), onShelf: ouvir('shelf'), dragStart: nada, janelas: ok(janelas),
      janelasGuardadas: ok(guardadas), onJanelasGuardadas: ouvir('guardadas'), onEvento: ouvir('evento'),
      setFocus: nada, assentou: nada, alvo: nada, vooPronto: nada, onVoo: ouvir('voo'),
      atividades: ok([]), onAtividades: ouvir('atividades'), onEspectro: ouvir('espectro'),
      claude: ok(claude), onClaude: ouvir('claude'), onAltura: ouvir('altura'),
    },
    seafile: { state: ok(null), onChanged: ouvir('seafile'), upload: nada, resolve: nada, clearDone: nada },
    apps: { list: ok(apps) },
    files: { pathOf: () => '' },
    launcher: { hide: nada, toggle: nada, onEnv: ouvir('env'), uso: nada, recentes: ok(recentes), arrastar: nada, arrastou: nada },
    notificacoes: {
      lista: ok([]), onAvisos: ouvir('avisos'), onEnv: ouvir('env'), agir: nada, fechar: nada, esquecer: nada,
      regiao: nada, desfoque: nada, estado: ok(null), exemplo: ok(undefined),
    },
  }
  // Qualquer canal que este arquivo não previu responde "nada", em vez de
  // derrubar a página por um \`undefined is not a function\`.
  const seguro = (alvo) => new Proxy(alvo, {
    get: (o, k) => (k in o ? o[k] : typeof k === 'string' && k.startsWith('on') ? () => nada : () => Promise.resolve(null)),
  })
  window.halo = new Proxy(halo, { get: (o, k) => seguro(o[k] ?? {}) })
  window.__vitrine = { emitir, snapshot }
})();

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
