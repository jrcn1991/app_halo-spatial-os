
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

if (new URLSearchParams(location.search).get('lang') === 'en') globalThis.__demoIdioma = 'en';
