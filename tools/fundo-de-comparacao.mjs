#!/usr/bin/env node
/**
 * Gera `src/renderer/assets/images/wallpaper.jpg`.
 *
 * Este é o fundo do modo de comparação (`?bg=wallpaper`), o único lugar do app
 * com fundo opaco — e o único onde `backdrop-filter` tem o que borrar, que é
 * por que a declaração continua no CSS (ver docs/DESENVOLVIMENTO.md).
 *
 * Ele era a `Wallpaper.jpg` do bundle de handoff: 912 KB de foto de
 * proveniência desconhecida, viajando DENTRO do asar de um app que sai sob
 * GPL. Trocada por arte gerada aqui, que é nossa e cabe em uma fração disso.
 * O que o modo precisa da imagem é o que qualquer imagem dá: superfície opaca,
 * com variação de luz suficiente para o desfoque e o tint aparecerem.
 *
 *   node tools/fundo-de-comparacao.mjs
 */
import { join } from 'node:path'
import { chromium } from 'playwright'
import { ROOT } from './lib/harness.mjs'

// O palco do handoff. A imagem é usada com `cover`, mas nascer no tamanho
// exato evita reamostragem no caminho.
const LARGURA = 1440
const ALTURA = 900
const DESTINO = join(ROOT, 'src/renderer/assets/images/wallpaper.jpg')

// A paleta da Floresta, que é o ambiente padrão e É o handoff.
const PAGINA = `
<body style="margin:0;width:${LARGURA}px;height:${ALTURA}px;overflow:hidden">
  <div style="
    position:absolute; inset:0;
    background:
      radial-gradient(1100px 780px at 22% 18%, #2f6a52 0%, transparent 62%),
      radial-gradient(900px 700px at 82% 30%, #1d4d6b 0%, transparent 60%),
      radial-gradient(1200px 900px at 60% 92%, #123027 0%, transparent 65%),
      linear-gradient(160deg, #0d1a16 0%, #0a1412 55%, #070d0c 100%);
  "></div>
  <!-- Um par de luzes altas: sem elas o desfoque não teria contraste para
       mostrar diferença, que é justamente o que o modo de comparação mede. -->
  <div style="
    position:absolute; inset:0; filter: blur(60px); opacity:0.55;
    background:
      radial-gradient(260px 200px at 30% 26%, rgba(190,255,222,0.55) 0%, transparent 70%),
      radial-gradient(200px 160px at 74% 66%, rgba(154,164,242,0.45) 0%, transparent 70%),
      radial-gradient(150px 120px at 52% 44%, rgba(255,232,180,0.30) 0%, transparent 70%);
  "></div>
  <!-- Grão fino, para o JPEG não virar faixas de banding num degradê liso. -->
  <svg style="position:absolute;inset:0;opacity:0.05" width="${LARGURA}" height="${ALTURA}">
    <filter id="g"><feTurbulence baseFrequency="0.9" numOctaves="2"/></filter>
    <rect width="100%" height="100%" filter="url(#g)"/>
  </svg>
</body>`

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: LARGURA, height: ALTURA } })
await pagina.setContent(PAGINA, { waitUntil: 'load' })
await pagina.screenshot({ path: DESTINO, type: 'jpeg', quality: 88 })
await navegador.close()
console.log(`✓ ${DESTINO} · ${LARGURA}×${ALTURA}`)
