#!/usr/bin/env node
/**
 * Prepara `build/icon.png`, o ícone do app empacotado.
 *
 * Ele não existia: `buildResources: build` apontava para um diretório que não
 * estava no repositório, e tanto o AppImage quanto o `.deb` saíam com o ícone
 * genérico do Electron. Um widget de área de trabalho com o ícone do Electron
 * no menu não se apresenta como um app.
 *
 * A primeira versão era um desenho FEITO AQUI, em SVG — os três painéis do
 * palco dentro de um halo —, porque não havia arte. Hoje há: `icone-fonte.png`
 * é arte gerada por IA para o app (05/09/2026), e o desenho de
 * substituição saiu. Este arquivo virou o que sempre deveria ser: o preparo da
 * arte, e não um sucedâneo dela.
 *
 * O preparo é reamostrar: `icon.png` a 1024 e o CONJUNTO em `build/icons/`,
 * de 16 a 1024. O conjunto não é luxo — com só o `icon.png`, o `.deb` saía
 * com uma única imagem em `hicolor/1024x1024/` (MEDIDO), e todo lugar que
 * mostra o app pequeno (o menu, a barra de tarefas, os favoritos) reescalava
 * 1024 → 32 na hora, que é onde uma marca de traço fino vira borrão.
 *
 * Nada de fundo: o ícone tem de recortar contra qualquer tema de painel, claro
 * ou escuro.
 *
 *   node tools/icone.mjs
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { ROOT } from './lib/harness.mjs'

const FONTE = join(ROOT, 'build/icone-fonte.png')
const DESTINO = join(ROOT, 'build/icon.png')
const PASTA = join(ROOT, 'build/icons')

/** Os tamanhos do hicolor. O nome do arquivo é o contrato do electron-builder. */
const TAMANHOS = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

// Embutida em `data:`: a página é servida de `about:blank` e não alcança o
// disco — o mesmo motivo pelo qual o main converte as capas do MPRIS.
const dados = `data:image/png;base64,${readFileSync(FONTE).toString('base64')}`

const navegador = await chromium.launch()
mkdirSync(PASTA, { recursive: true })

/** Uma página por tamanho: o viewport É o recorte, e o alfa passa inteiro. */
async function escrever(lado, destino) {
  const pagina = await navegador.newPage({ viewport: { width: lado, height: lado } })
  await pagina.setContent(
    `<body style="margin:0;background:transparent">
       <img src="${dados}" style="display:block;width:${lado}px;height:${lado}px">
     </body>`,
    { waitUntil: 'load' },
  )
  await pagina.screenshot({ path: destino, omitBackground: true })
  await pagina.close()
}

for (const lado of TAMANHOS) await escrever(lado, join(PASTA, `${lado}x${lado}.png`))
// O `icon.png` continua existindo: é o que o AppImage usa como ícone da
// imagem, e o que o electron-builder procura quando não recebe um conjunto.
await escrever(1024, DESTINO)
await navegador.close()
console.log(`✓ ${DESTINO} · e ${TAMANHOS.length} tamanhos em build/icons/`)
