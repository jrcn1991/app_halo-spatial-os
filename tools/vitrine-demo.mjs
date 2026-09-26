/**
 * Os dados de DEMONSTRAÇÃO da vitrine — só dela, nunca do app.
 *
 * `tools/vitrine.mjs` roda o app construído num navegador, sem `window.halo`:
 * a fábrica cai nos mocks e nada da máquina de quem roda entra nas imagens. Os
 * mocks, porém, são o mínimo para os guarda-telas (capas vazias, uma ilha sem
 * instantâneo), e uma vitrine com tudo listrado não mostra o que o app faz.
 *
 * Este arquivo preenche o que falta, sem tocar no código do app:
 *
 * - **arte gerada** — capas de disco e cartazes de filme desenhados aqui, em
 *   SVG, a partir do nome. Títulos, artistas e filmes são INVENTADOS; nenhum
 *   vem de lista de mídia, conta de Spotify ou catálogo de ninguém;
 * - **um `window.halo` de mentira** para a ilha, o lançador e os balões —
 *   janelas que não usam a fábrica de dados e, sem ele, nascem vazias. O
 *   instantâneo é escrito à mão: nada de caminho pessoal, nome de máquina,
 *   rede ou IP;
 * - **remendos no bundle do app** (`remendarBundle`), para as capas chegarem
 *   ao catálogo, à tela de Música e ao "tocando agora". Cada remendo procura um
 *   trecho exato do mock; se o build mudar e ele não casar, a vitrine avisa e
 *   segue com o mock como está — nunca inventa em outro lugar.
 *
 * Tudo é servido como arquivo (`/__vitrine/*.js`): a CSP do app é
 * `script-src 'self'`, e script em linha não rodaria.
 */

/* ——— A arte ——————————————————————————————————————————————————— */

/**
 * O gerador de capas, como TEXTO: ele roda dentro das páginas do app (é onde
 * o bundle o chama), então vai no script servido, não aqui.
 */
const ARTE = String.raw`
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
`

/** O script da janela do app: só a arte, que o bundle remendado chama. */
export const SCRIPT_APP = ARTE

/* ——— O catálogo de filmes ————————————————————————————————————— */

/**
 * Filmes e séries INVENTADOS para a tela de Mídia. Os três primeiros são os
 * do mock do app (mesmos ids), o resto é da vitrine.
 */
const FILMES = [
  ['0', 'Cidade Submersa', 2024, 'Lançamento', 'movie', ['4K']],
  ['1', 'O Vale dos Relógios', 2023, 'Drama', 'movie', ['L']],
  ['2', 'Estação Norte', 2022, 'Drama', 'series', []],
  ['3', 'Maré de Neon', 2025, 'Lançamento', 'movie', ['4K']],
  ['4', 'O Farol de Vidro', 2021, 'Drama', 'movie', []],
  ['5', 'Rota Oitenta e Oito', 2024, 'Aventura', 'movie', ['4K']],
  ['6', 'Aurora em Kepler', 2025, 'Ficção', 'movie', ['4K']],
  ['7', 'Os Relojoeiros', 2020, 'Aventura', 'series', []],
  ['8', 'Jardim de Cobre', 2023, 'Ficção', 'movie', []],
  ['9', 'Neblina sobre Pinhais', 2022, 'Drama', 'movie', ['L']],
  ['10', 'Última Linha do Metrô', 2024, 'Lançamento', 'movie', []],
  ['11', 'Céu de Fósforo', 2021, 'Ficção', 'movie', []],
]

const catalogoJs = () =>
  `[${FILMES.map(
    ([id, nome, ano, grupo, tipo, tags]) =>
      `{id:${JSON.stringify(id)},name:${JSON.stringify(nome)},year:${ano},tags:${JSON.stringify(tags)},poster:globalThis.__vitrineCartaz(${JSON.stringify(nome)},${ano}),group:${JSON.stringify(grupo)},kind:${JSON.stringify(tipo)},seasons:${tipo === 'series' ? 2 : 0},episodes:${tipo === 'series' ? 16 : 0}}`,
  ).join(',')}]`

const categoriasJs = () => {
  const grupos = new Map()
  for (const [, , , grupo, tipo] of FILMES) {
    const g = grupos.get(grupo) ?? { movies: 0, series: 0 }
    g[tipo === 'series' ? 'series' : 'movies']++
    grupos.set(grupo, g)
  }
  return `[${[...grupos].map(([name, g]) => `{name:${JSON.stringify(name)},movies:${g.movies},series:${g.series}}`).join(',')}]`
}

/**
 * Os remendos do bundle do app. Cada um: um nome, o padrão exato do mock e a
 * troca. Devolve o JS remendado e a lista do que casou e do que não casou.
 */
export function remendarBundle(js) {
  const filmes = FILMES.filter((f) => f[4] === 'movie').length
  const series = FILMES.length - filmes
  const remendos = [
    [
      'catálogo: títulos com cartaz',
      /\[\{id:"0",name:"Cidade Submersa"[\s\S]*?episodes:16\}\]/,
      () => catalogoJs(),
    ],
    [
      'catálogo: contagem',
      /movies:2,series:1,episodes:16,error:null/,
      () => `movies:${filmes},series:${series},episodes:${series * 16},error:null`,
    ],
    [
      'catálogo: categorias',
      /\[\{name:"Lançamento",movies:1,series:0\},\{name:"Drama",movies:1,series:1\}\]/,
      () => categoriasJs(),
    ],
    [
      'Spotify: capa de playlist, álbum e artista',
      /(\(([\w$]+),([\w$]+),([\w$]+),([\w$]+),([\w$]+)\)=>\(\{uri:`spotify:\$\{\2\}:\$\{\3\}`,id:\3,kind:\2,name:\4,meta:\5,)image:""/,
      (_m, antes, _k, _i, nome) => `${antes}image:globalThis.__vitrineCapa(${nome})`,
    ],
    [
      'Spotify: capa das faixas',
      /(album:([\w$]+),durationMs:\([\w$]+\*60\+[\w$]+\)\*1e3,)image:""/,
      (_m, antes, album) => `${antes}image:globalThis.__vitrineCapa(${album})`,
    ],
    [
      'Social: biblioteca de exemplo',
      /([\w$]+)=\{collections:\[\],items:\[\]\}(,[\w$]+=\(\)=>JSON\.parse)/,
      (_m, nome, depois) => `${nome}=globalThis.__vitrineBiblioteca()${depois}`,
    ],
    [
      'Social: o que as fontes mostram',
      /trending:async\(\)=>\(\{items:\[\],cursor:"",falhas:\[\]\}\)/,
      () => 'trending:async()=>({items:globalThis.__vitrineSocial(),cursor:"",falhas:[]})',
    ],
    [
      'tocando agora: capa',
      /(album:"Northbound",)artUrl:null/,
      (_m, antes) => `${antes}artUrl:globalThis.__vitrineCapa("Northbound")`,
    ],
  ]
  const casou = []
  const faltou = []
  let saida = js
  for (const [nome, padrao, troca] of remendos) {
    if (padrao.test(saida)) {
      saida = saida.replace(padrao, troca)
      casou.push(nome)
    } else faltou.push(nome)
  }
  return { js: saida, casou, faltou }
}

/* ——— O `window.halo` da ilha, do lançador e dos balões ——————————————— */

/**
 * O instantâneo da ilha, escrito à mão. `AGORA` é o relógio fixo da vitrine
 * (ver `HORA` em `vitrine.mjs`): o player e o temporizador contam a partir dele.
 */
const HALO = String.raw`
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
`

export const SCRIPT_HALO = ARTE + HALO

/**
 * Os balões de exemplo, um a um, para a entrada aparecer no vídeo. Os textos
 * são os de `notificacoes/exemplos.ts` — que DIZEM que são exemplo.
 */
export const AVISOS = [
  {
    id: 11,
    app: 'Exemplo · Mensagens',
    titulo: 'Notificação de exemplo',
    corpo: 'Os balões do sistema vestem o ambiente — este é o do tema atual.',
    icone: null,
    imagem: null,
    urgencia: 'normal',
    acoes: [
      { chave: 'responder', rotulo: 'Responder' },
      { chave: 'lida', rotulo: 'Marcar como lida' },
    ],
    temPadrao: true,
    expiraMs: null,
    at: 0,
  },
  {
    id: 12,
    app: 'Exemplo · Downloads',
    titulo: 'Download concluído',
    corpo: 'halo-spatial-os_0.2.1_amd64.deb',
    icone: null,
    imagem: null,
    urgencia: 'normal',
    acoes: [{ chave: 'abrir', rotulo: 'Abrir a pasta' }],
    temPadrao: false,
    expiraMs: null,
    at: 0,
  },
  {
    id: 13,
    app: 'Exemplo · Sistema',
    titulo: 'Aviso de urgência baixa',
    corpo: 'Exemplo de um aviso discreto.',
    icone: null,
    imagem: null,
    urgencia: 'baixa',
    acoes: [],
    temPadrao: false,
    expiraMs: null,
    at: 0,
  },
]
