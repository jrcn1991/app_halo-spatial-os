#!/usr/bin/env node
/**
 * O que falta nesta máquina.
 *
 * O Halo chama 26 programas de fora e nenhum deles vem no pacote. Quase todos
 * degradam bem, mas até aqui sumiam em SILÊNCIO: sem `sensors` a temperatura
 * simplesmente não aparecia, e não havia como distinguir isso de um módulo
 * desligado. Este é o diagnóstico — e é a mesma lista que a tela de
 * Configurações → Sistema mostra, `src/shared/dependencias.ts`.
 *
 * Ele NÃO instala nada. Escrever fora do app para conseguir um efeito de
 * sistema é justamente o que o projeto não faz (CLAUDE.md § Janela e camada):
 * ele diz o comando, e quem decide rodá-lo é o usuário.
 *
 *   npm run doctor
 *
 * Sai com código 1 se faltar alguma coisa de nível `essencial`.
 */
import { execFileSync } from 'node:child_process'
import { DEPENDENCIAS } from '../src/shared/dependencias.ts'

const TITULOS = {
  essencial: 'Essenciais — sem isto uma função central do app não funciona',
  kde: 'Do KDE Plasma — o ambiente-alvo do app',
  opcional: 'Opcionais — cada uma custa uma leitura ou uma ação',
}

/** Está no PATH? É o mesmo teste que o `spawn` vai fazer depois. */
function existe(binario) {
  try {
    execFileSync('which', [binario], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const achados = DEPENDENCIAS.map((d) => ({ ...d, tem: existe(d.id) }))
const faltando = achados.filter((d) => !d.tem)

console.log('')
for (const nivel of ['essencial', 'kde', 'opcional']) {
  const doNivel = achados.filter((d) => d.nivel === nivel)
  const ausentes = doNivel.filter((d) => !d.tem)
  console.log(`  ${TITULOS[nivel]}`)
  if (ausentes.length === 0) {
    console.log(`    ✓ os ${doNivel.length} estão aqui`)
  } else {
    for (const d of ausentes) {
      console.log(`    ✗ ${d.id.padEnd(30)} ${d.perde}`)
      console.log(`      ${''.padEnd(30)} sudo apt install ${d.pacote}`)
    }
    const presentes = doNivel.length - ausentes.length
    if (presentes) console.log(`    ✓ outros ${presentes} estão aqui`)
  }
  console.log('')
}

// O servidor gráfico não é um programa que se instale, mas é o requisito que
// mais muda o que o app consegue fazer: camada da janela, posição e "manter
// por cima" só existem no X11 (CLAUDE.md § Janela e camada).
const sessao = process.env.XDG_SESSION_TYPE ?? 'desconhecida'
const temX = Boolean(process.env.DISPLAY)
console.log('  Sessão gráfica')
if (sessao === 'x11') {
  console.log('    ✓ X11')
} else if (temX) {
  // Sessão Wayland com XWayland de pé: o app se relança como cliente X11 e as
  // três coisas que ele precisa continuam existindo. É assim que a máquina de
  // desenvolvimento roda, e `npm run test:live` cobre isso ("app e player
  // ficam em camadas OPOSTAS").
  console.log(`    ✓ ${sessao}, com XWayland (DISPLAY=${process.env.DISPLAY})`)
  console.log('      O app abre como cliente X11 sobre ele — é o que a flag')
  console.log('      --ozone-platform=x11 faz, e é o único jeito de escolher a camada')
  console.log('      da janela, lembrar a posição e manter o player por cima.')
} else {
  console.log(`    ✗ ${sessao}, sem XWayland — o app abre, mas o compositor vai ignorar`)
  console.log('      a camada da janela, a posição e o "manter por cima", em silêncio.')
}
console.log('')

const essenciaisFaltando = faltando.filter((d) => d.nivel === 'essencial')
if (essenciaisFaltando.length) {
  console.log(`  ✗ faltam ${essenciaisFaltando.length} programas essenciais`)
  console.log('')
  process.exit(1)
}
console.log(
  faltando.length
    ? `  ✓ o essencial está aqui · ${faltando.length} opcionais faltando, cada um custa o que está escrito acima`
    : '  ✓ tudo o que o app chama está nesta máquina',
)
console.log('')
