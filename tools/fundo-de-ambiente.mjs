#!/usr/bin/env node
/**
 * Prepara o papel de parede de um ambiente para entrar no repositório.
 *
 * Os quatro ambientes prontos têm imagem própria, e todas nascem do mesmo
 * lugar: arte gerada por IA (`image_gen` do GPT-5),
 * com o prompt registrado em `docs/MOCKS.md`. O BioShock tem preparo próprio
 * (`tools/ourivesaria-bioshock.py`, que também retinge as peças de bronze na
 * rampa dos tokens); Floresta e Cyberpunk só precisam DESTE preparo, que é o
 * mínimo para a imagem virar papel de parede:
 *
 * - **3840×2160**, cobrindo. O papel de parede é aplicado pelo KDE na tela
 *   inteira, e subir de 1664×936 na hora da exibição é reamostrar toda vez;
 * - **JPEG q86, sem subamostragem de croma.** As mesmas medidas do fundo do
 *   BioShock: o neon do Cyberpunk é vermelho e amarelo saturados sobre preto,
 *   e `4:2:0` come justamente a borda dessas cores.
 *
 * A regra de procedência vale aqui como vale lá (`docs/MOCKS.md`): nenhum
 * prompt nomeia obra, jogo ou franquia — eles descrevem o VOCABULÁRIO visual
 * que cada tema sempre teve. O que volta é interpretação nossa, não arte de
 * terceiro.
 *
 *   node tools/fundo-de-ambiente.mjs floresta caminho/da/arte.png
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'
import { ROOT } from './lib/harness.mjs'

const LARGURA = 3840
const ALTURA = 2160
const QUALIDADE = 86

const [ambiente, origem] = process.argv.slice(2)
if (!ambiente || !origem) {
  console.error('uso: node tools/fundo-de-ambiente.mjs <ambiente> <arquivo de origem>')
  process.exit(1)
}
if (!existsSync(origem)) {
  console.error(`✗ não achei ${origem}`)
  process.exit(1)
}

const destino = join(ROOT, `src/renderer/assets/env/${ambiente}/fundo.jpg`)
// Em `data:` porque a página é servida de `about:blank` e não alcança o disco.
const dados = `data:image/png;base64,${readFileSync(origem).toString('base64')}`

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: LARGURA, height: ALTURA } })
await pagina.setContent(
  `<body style="margin:0;background:#000">
     <img src="${dados}" style="display:block;width:${LARGURA}px;height:${ALTURA}px;object-fit:cover">
   </body>`,
  { waitUntil: 'load' },
)
mkdirSync(dirname(destino), { recursive: true })
await pagina.screenshot({ path: destino, type: 'jpeg', quality: QUALIDADE })
await navegador.close()
console.log(`✓ ${destino} · ${LARGURA}×${ALTURA} · JPEG q${QUALIDADE}`)
