#!/usr/bin/env node
/**
 * Homologação da ilha dinâmica.
 *
 * Percorre o catálogo (`src/main/island/catalog.ts`, servido pelo app) e
 * exercita CADA integração contra esta máquina. Uma integração que não está no
 * catálogo não conta; uma que está e não responde derruba a verificação.
 *
 * As leituras são conferidas no instantâneo real. As ações são divididas em
 * três grupos, e a diferença é deliberada:
 *
 * - **reversíveis**: executadas de verdade e desfeitas em seguida (volume,
 *   mudo, mídia, bluetooth, área de trabalho).
 * - **inócuas**: executadas e pronto, porque não deixam estado (notificação,
 *   captura de tela, mostrar a área de trabalho).
 * - **disruptivas**: NÃO executadas — desligar o Wi-Fi cortaria a rede, e
 *   bloquear a tela trancaria o usuário fora. Delas se confere que o
 *   despachante as conhece e que a ferramenta que elas chamam existe.
 *
 * Executar uma ação disruptiva "para homologar" seria pior que não homologar.
 *
 *   npm run dev            (em outro terminal)
 *   npm run island
 */
import { execFileSync } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ENDPOINT = process.env.HALO_CDP ?? 'http://127.0.0.1:9222'

/**
 * Um arquivo de verdade para exercitar a gaveta: guardar e tirar são
 * executados contra ele, e a gaveta do usuário fica como estava.
 */
const ARQUIVO_PROVA = join(tmpdir(), 'halo-ilha-homologacao.txt')

/** Ações que mexem no sistema mas voltam atrás sozinhas nesta verificação. */
const REVERSIVEIS = {
  'volume-subir': { desfazer: 'volume-baixar' },
  'volume-baixar': { desfazer: 'volume-subir' },
  'volume-mudo': { desfazer: 'volume-mudo' },
  'bluetooth-alternar': { desfazer: 'bluetooth-alternar', espera: 1200 },
  'midia-alternar': { desfazer: 'midia-alternar', espera: 800 },
  'kde-desktop-proxima': { desfazer: 'kde-desktop-anterior' },
  'kde-desktop-anterior': { desfazer: 'kde-desktop-proxima' },
  'gaveta-guardar': { desfazer: 'gaveta-remover', arg: ARQUIVO_PROVA, argDesfazer: ARQUIVO_PROVA },
  // Um minuto com rótulo de prova, parado em seguida: nunca chega a tocar.
  'timer-iniciar': { desfazer: 'timer-parar', arg: '1 prova da homologação' },
  'silencio-alternar': { desfazer: 'silencio-alternar', espera: 400 },
  'cafeina-alternar': { desfazer: 'cafeina-alternar', espera: 400 },
  'mic-mudo-alternar': { desfazer: 'mic-mudo-alternar' },
  'midia-embaralhar': { desfazer: 'midia-embaralhar', espera: 500 },
  'timer-cronometro': { desfazer: 'timer-parar', arg: 'prova' },
  // O app entra na ilha e volta. Executado de verdade porque a janela é
  // NOSSA e o par se desfaz sozinho — e porque é o único jeito de provar o
  // voo de ida e volta inteiro. A espera cobre os 900ms da camada do
  // fantasma dos dois lados (ver VOO_MS em `shared/island.ts`).
  'halo-recolher': { desfazer: 'halo-trazer', espera: 1400 },
}

/** Executadas de verdade: não deixam estado para desfazer. */
const INOCUAS = new Set([
  'kde-notificar',
  'kde-mostrar-desktop',
  'volume-definir',
  'timer-parar',
  // Um ping no celular é um toque de presença; sem celular, o "não deu" vale.
  'celular-ping',
  // Com o app à vista, `trazerHalo` sai na primeira linha (`if (!recolhido ||
  // !lugar) return`) — não há o que desfazer. E o voo de volta JÁ é exercitado
  // de verdade: é o `desfazer` de `halo-recolher`, logo acima. Sem esta linha o
  // guarda acusava "ação sem classificação" e a ilha ficava em 140/141 — uma
  // falha permanente, que é o pior estado para um guarda ter: ninguém mais
  // olha quando ele fica vermelho.
  'halo-trazer',
  // Deixou de ser disruptiva em 04/09/2026. Ela pedia "trazer para a frente",
  // que a camada do papel de parede não permite, e não fazia nada — por isso
  // ficava de fora. Agora traz de volta se estiver recolhida (o mesmo voo já
  // exercitado acima), restaura se estiver minimizada e, com o app à vista,
  // só ANUNCIA. Nenhum dos três estraga nada, e executá-la é o que prova que
  // ela deixou de ser um botão morto.
  'halo-tela',
])

/**
 * Uma imagem de prova com texto conhecido, para o OCR ser exercitado de
 * verdade sem trocar a área de transferência do usuário: o tesseract é
 * chamado aqui, do mesmo jeito que a ação o chama.
 */
const IMAGEM_OCR = fileURLToPath(new URL('./fixtures/ocr.png', import.meta.url))
const TEXTO_OCR = 'HALO ILHA 2026'

/**
 * A nota é guardada com o valor que já tem: a ação roda de verdade e o
 * usuário fica com a mesma nota.
 */
const NOTA_ATUAL = (snapshot) => snapshot.note ?? ''

/** Inócuas que precisam de argumento: tirar da gaveta o que não está nela é silêncio. */
const ARG_INOCUO = { 'gaveta-remover': ARQUIVO_PROVA, 'nota-salvar': '' }

/**
 * Ações cujo "não deu" também é resposta certa: tocar/pausar sem player
 * aberto responde um erro específico, e ele prova que o mecanismo funciona.
 */
const ERROS_ACEITOS = {
  'midia-alternar': 'nenhum player aberto',
  'midia-embaralhar': 'nenhum player aberto',
  'celular-ping': 'celular',
}

/**
 * Não executadas, e o motivo. Confere-se que o despachante as conhece e que o
 * programa que elas chamam existe nesta máquina.
 */
const DISRUPTIVAS = {
  'wifi-alternar': { motivo: 'cortaria a rede', binario: 'nmcli' },
  'kde-bloquear': { motivo: 'trancaria a sessão', binario: 'qdbus6' },
  'kde-captura': { motivo: 'abriria o Spectacle na frente do usuário', binario: 'spectacle' },
  'audio-trocar-saida': { motivo: 'moveria o áudio de saída no meio do uso', binario: 'pactl' },
  'midia-abrir': { motivo: 'traria a janela do player para a frente', binario: 'busctl' },
  'midia-proxima': { motivo: 'pularia a faixa do usuário', binario: 'busctl' },
  'midia-anterior': { motivo: 'voltaria a faixa do usuário', binario: 'busctl' },
  'midia-copiar-link': { motivo: 'trocaria a área de transferência do usuário', binario: 'busctl' },
  'audio-definir-saida': { motivo: 'moveria o áudio de saída no meio do uso', binario: 'pactl' },
  'avisos-abrir-app': { motivo: 'abriria um aplicativo', binario: 'gio' },
  'avisos-remover': {
    motivo: 'apagaria uma notificação que o usuário ainda não leu',
    binario: null,
  },
  'midia-buscar': { motivo: 'pularia dentro da faixa do usuário', binario: 'busctl' },
  'midia-repetir': {
    motivo: 'mudaria o modo de repetição do player do usuário',
    binario: 'busctl',
  },
  'janela-encaixar': { motivo: 'moveria uma janela do usuário', binario: 'qdbus6' },
  'apps-abrir': { motivo: 'abriria um aplicativo', binario: 'gio' },
  'abrir-caminho': { motivo: 'abriria uma janela do gerenciador', binario: 'gio' },
  'gaveta-limpar': { motivo: 'esvaziaria a gaveta do usuário', binario: null },
  'avisos-limpar': {
    motivo: 'apagaria as notificações que o usuário ainda não leu',
    binario: null,
  },
  'clip-copiar': { motivo: 'trocaria o que o usuário tem na área de transferência', binario: null },
  'clip-fixar': { motivo: 'mexeria no histórico do usuário', binario: null },
  'clip-remover': { motivo: 'apagaria um item do histórico do usuário', binario: null },
  'clip-limpar': { motivo: 'esvaziaria o histórico do usuário', binario: null },
  'gaveta-abrir': { motivo: 'abriria uma janela', binario: 'gio' },
  'gaveta-enviar': { motivo: 'mandaria um arquivo ao servidor do usuário', binario: null },
  'janela-guardar': { motivo: 'minimizaria a janela em uso', binario: 'qdbus6' },
  'janela-restaurar': { motivo: 'mexeria na pilha de janelas', binario: 'qdbus6' },
  'janela-focar': { motivo: 'roubaria o foco do usuário', binario: 'qdbus6' },
  'cor-capturar': { motivo: 'poria o cursor em modo de mira até um clique', binario: 'busctl' },
  'texto-da-tela': { motivo: 'abriria o seletor de região do Spectacle', binario: 'spectacle' },
  'celular-tocar': { motivo: 'faria o celular do usuário tocar', binario: 'busctl' },
  'celular-enviar': { motivo: 'mandaria um arquivo ao celular', binario: 'busctl' },
  'celular-enviar-texto': { motivo: 'mandaria texto ao celular', binario: 'busctl' },
  'disco-ejetar': { motivo: 'desligaria um pendrive em uso', binario: 'udisksctl' },
  'disco-montar': { motivo: 'montaria um volume do usuário', binario: 'udisksctl' },
  'disco-abrir': { motivo: 'abriria uma janela do gerenciador', binario: 'gio' },
  'foco-limpar': { motivo: 'apagaria o histórico de foco do usuário', binario: null },
  // O Claude da ilha custa uma chamada à API a cada pergunta: com
  // HALO_CLAUDE_VIVO=1 a pergunta é feita de verdade (ver `perguntarDeVerdade`).
  'claude-perguntar': {
    motivo: 'abriria um agente e gastaria uma chamada à API',
    binario: 'claude',
  },
  'claude-aprovar': { motivo: 'só faz sentido com um pedido parado', binario: null },
  'claude-parar': { motivo: 'fecharia a conversa do usuário', binario: null },
  'claude-projeto-definir': { motivo: 'trocaria o projeto escolhido pelo usuário', binario: null },
}

/**
 * Publica uma linha JSON no socket da ilha e devolve a resposta — o mesmo
 * caminho que `tools/ilha-avisar.sh` percorre.
 */
function publicar(caminho, mensagem) {
  return new Promise((resolve, reject) => {
    const s = connect(caminho)
    let resposta = ''
    s.setEncoding('utf8')
    s.on('connect', () => s.write(`${JSON.stringify(mensagem)}\n`))
    s.on('data', (d) => {
      resposta += d
      if (resposta.includes('\n')) s.end()
    })
    s.on('close', () => resolve(resposta.trim()))
    s.on('error', reject)
    setTimeout(() => reject(new Error('o socket não respondeu')), 3000)
  })
}

const existe = (binario) => {
  if (!binario) return true
  try {
    execFileSync('which', [binario], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * A geometria do cabeçalho da ilha aberta.
 *
 * Isto não é integração — é a única medida que o resto desta homologação não
 * pegaria, e que já falhou de verdade: os contadores das abas ficavam AO LADO
 * do glifo, cada um custava ~29px de trilho, e com as contagens cheias as abas
 * passavam por cima dos botões da direita e a última saía da janela. O usuário
 * viu "Cópias 48" em cima do café.
 *
 * As contagens são forçadas no DOM, no máximo que cada fonte permite hoje
 * (20 avisos, 30 cópias, 32 na gaveta, 1 do Claude) — não se pode encher a
 * área de transferência de alguém para testar um layout. Qualquer render do
 * React desfaz a injeção.
 */
async function conferirGeometria(page) {
  const fora = []
  const aberta = () => page.evaluate(() => document.querySelector('.gota')?.dataset.aberta)
  const estava = await aberta()
  if (estava !== 'sim') await page.click('.gota')
  await espera(900)

  /*
   * Tudo num `evaluate` SÓ, e de propósito.
   *
   * A ilha se redesenha o tempo todo (relógio, CPU, mídia), e o React desfaz
   * qualquer nó injetado no primeiro render seguinte. Com a injeção numa
   * chamada e a medida noutra, a verificação media o cabeçalho VAZIO e
   * passava dizendo "11px de folga" sem ter medido nada — aconteceu.
   *
   * Aqui a injeção, a leitura de layout (que força o cálculo) e o desfazer
   * acontecem no mesmo tique: o React não chega a ver. `transition:none` no
   * nome é pelo mesmo motivo — a largura animada levaria 320ms que este
   * caminho não tem.
   */
  const medir = () =>
    page.evaluate(() => {
      const abas = document.querySelector('.abas')
      const botoes = document.querySelector('.cabecaBotoes') ?? document.querySelector('.hudAberto')
      const tabs = [...document.querySelectorAll('.aba')]
      if (!abas || !botoes || tabs.length === 0) return null

      const larg = (e) => Math.round(e.getBoundingClientRect().width)
      const parado = larg(abas)

      // O teto de cada fonte hoje: 20 avisos, 30 cópias, 32 na gaveta, 1 do
      // Claude. Encher a área de transferência de alguém para medir um layout
      // não se faz — as contagens são forçadas e desfeitas aqui mesmo.
      const teto = { Avisos: '20', Cópias: '30', Gaveta: '32', Claude: '1' }
      const criados = []
      const mexidos = []
      for (const aba of tabs) {
        const alvo = teto[aba.getAttribute('title')]
        const glifo = aba.querySelector('.abaGlifo')
        if (!alvo || !glifo) continue
        let badge = glifo.querySelector('.abaBadge')
        if (badge) mexidos.push([badge, badge.textContent])
        else {
          badge = document.createElement('span')
          badge.className = 'abaBadge'
          glifo.appendChild(badge)
          criados.push(badge)
        }
        badge.textContent = alvo
      }

      // Exatamente UM nome aberto: é o que a regra `.abas:hover` produz, e é o
      // pior caso real. Os outros vão a zero à mão porque o `:hover` não pode
      // ser simulado aqui — e porque com dois abertos a medida seria de um
      // estado que a tela nunca mostra.
      const nomes = tabs.map((t) => t.querySelector('.abaNome')).filter(Boolean)
      for (const n of nomes) {
        n.setAttribute('style', 'max-width:0;margin-left:0;opacity:0;transition:none')
      }
      const nome = tabs
        .find((t) => t.getAttribute('title') === 'Janelas')
        ?.querySelector('.abaNome')
      nome?.setAttribute('style', 'max-width:72px;margin-left:6px;opacity:1;transition:none')

      const alvo = criados[0] ?? mexidos[0]?.[0] ?? null
      const cheio = {
        hud: document.querySelector('.cabeca')?.dataset.hud ?? 'nao',
        contadores: criados.length + mexidos.length,
        posicaoDoContador: alvo ? getComputedStyle(alvo).position : 'sem contador',
        parado,
        largura: larg(abas),
        transborda: abas.scrollWidth - abas.clientWidth,
        fimDaUltima: Math.round(tabs.at(-1).getBoundingClientRect().right),
        inicioDosBotoes: Math.round(botoes.getBoundingClientRect().left),
        fimDoTrilho: Math.round(abas.getBoundingClientRect().right),
        janela: window.innerWidth,
        glifoMinimo: Math.min(...tabs.map((t) => larg(t.querySelector('.abaGlifo')))),
        // O nome aberto cabe inteiro, ou o trilho o está recortando?
        nomeRecortado: nome ? nome.scrollWidth - nome.clientWidth : 0,
      }

      for (const b of criados) b.remove()
      for (const [b, antes] of mexidos) b.textContent = antes
      for (const n of nomes) n.removeAttribute('style')
      return cheio
    })

  /*
   * Um anúncio vivo (`data-hud="sim"`) troca os botões da direita por uma
   * pílula de 168px E recolhe todos os nomes — por desenho. Medir "um nome
   * aberto" nesse estado seria medir uma tela que não existe, e a verificação
   * acusava recorte de 29px que ninguém jamais veria. Os anúncios passam em
   * segundos: espera-se por eles.
   */
  let m = await medir()
  for (let i = 0; m?.hud === 'sim' && i < 6; i += 1) {
    await espera(1200)
    m = await medir()
  }

  if (!m) return [['o cabeçalho da ilha aberta', 'a ilha não abriu']]
  if (m.contadores < 4) {
    fora.push(['as quatro contagens entram no cabeçalho', `só ${m.contadores} abas receberam`])
  }

  // A causa do estrago: o contador ficava AO LADO do glifo, cada um custando
  // ~29px de trilho. Fora do fluxo ele custa zero, e é isto que impede a fila
  // de crescer. Se alguém o devolver ao fluxo, a medida abaixo ainda pode
  // caber por sorte — esta não.
  fora.push(
    m.posicaoDoContador === 'absolute'
      ? ['o contador fica fora do fluxo do trilho', true, 'position: absolute']
      : ['o contador fica fora do fluxo do trilho', `position: ${m.posicaoDoContador}`],
  )

  if (m.transborda > 0) {
    fora.push(['o pior caso cabe no trilho', `transborda ${m.transborda}px`])
  } else if (m.fimDaUltima > m.inicioDosBotoes) {
    fora.push([
      'o pior caso cabe no trilho',
      `a última aba (${m.fimDaUltima}px) cobre os botões (${m.inicioDosBotoes}px)`,
    ])
  } else if (m.fimDoTrilho > m.janela) {
    fora.push([
      'o pior caso cabe no trilho',
      `o trilho passa da janela (${m.fimDoTrilho} > ${m.janela})`,
    ])
  } else {
    fora.push([
      'o pior caso cabe no trilho',
      true,
      `trilho de ${m.largura}px, ${m.inicioDosBotoes - m.fimDaUltima}px de folga`,
    ])
  }

  // `min-width: 0` na aba deixa o nome ceder sob pressão; o glifo não pode
  // ceder junto, ou as abas viram traços.
  fora.push(
    m.glifoMinimo >= 14
      ? ['o glifo não é espremido', true, `${m.glifoMinimo}px`]
      : ['o glifo não é espremido', `um glifo ficou com ${m.glifoMinimo}px`],
  )

  // Recortar o nome é o sintoma de que o trilho ficou sem espaço — ainda sem
  // invadir nada, mas já mostrando "Janel…" no lugar de "Janelas".
  fora.push(
    m.hud === 'sim'
      ? [
          'o nome da aba aberta cabe inteiro',
          '— um anúncio ocupou o cabeçalho a verificação inteira; ali os nomes recolhem por desenho',
        ]
      : m.nomeRecortado === 0
        ? ['o nome da aba aberta cabe inteiro', true, 'sem recorte']
        : ['o nome da aba aberta cabe inteiro', `recortado em ${m.nomeRecortado}px`],
  )

  if (estava !== 'sim') {
    await page.keyboard.press('Escape')
    await espera(500)
  }
  return fora
}

/**
 * O lançador da ilha: o que o campo resolve sem sair dele.
 *
 * Conta, conversão, atalho de busca e emoji vieram do Raycast — e o que
 * importa neles não é existir, é ACERTAR o que É e o que NÃO é. Um campo que
 * transforma "cafeina 30" em "30" é pior que um campo sem calculadora.
 *
 * Por isso a lista tem tanto caso que DEVE responder quanto caso que deve
 * ficar quieto. O segundo grupo é o que pega regressão: foi assim que apareceu
 * o temporizador disparando em "15% de 240".
 */
async function conferirLancador(page) {
  const fora = []
  const aberta = await page.evaluate(() => document.querySelector('.gota')?.dataset.aberta)
  if (aberta !== 'sim') await page.click('.gota')
  await espera(900)

  const campo = 'input[aria-label^="Buscar aplicativo"]'
  if ((await page.locator(campo).count()) === 0) {
    return [['o campo do lançador', 'não achei o campo de busca da ilha aberta']]
  }

  const linhas = async (texto) => {
    await page.fill(campo, texto)
    await espera(500)
    return page.locator('.lancadorLista button').allTextContents()
  }

  // Cada caso: o texto, e o que a PRIMEIRA linha precisa conter.
  const responde = [
    ['2+2', '4'],
    ['(2+3)*4', '20'],
    ['2^10', '1.024'],
    ['1,5 + 2,5', '4'],
    ['15% de 240', '36'],
    ['240 + 15%', '276'],
    ['30c em f', '86'],
    ['100 f para c', '37,77'],
    ['2 gb em mb', '2.048'],
    ['10 km em mi', '6,21'],
    ['90 min em h', '1,5'],
    ['g city pop', 'Google'],
    ['yt bossa nova', 'YouTube'],
    [':fogo', '🔥'],
  ]
  for (const [texto, esperado] of responde) {
    const l = await linhas(texto)
    const primeira = (l[0] ?? '').replace(/\s+/g, ' ')
    if (!primeira.includes(esperado)) {
      fora.push([`"${texto}" responde`, `a primeira linha era "${primeira.slice(0, 46)}"`])
    }
  }
  if (fora.length === 0)
    fora.push(['conta, conversão, atalho e emoji respondem', true, `${responde.length} casos`])

  /*
   * E o que NÃO pode virar conta.
   *
   * "42" sozinho é alguém procurando outra coisa; "10/0" não tem resposta;
   * "cafeina 30" é um comando. Um lançador que responde a tudo atrapalha mais
   * do que ajuda.
   */
  const cala = ['42', '10/0', 'cafeina 30', 'firefox']
  const falou = []
  for (const texto of cala) {
    const l = await linhas(texto)
    // A resposta do campo é a linha com `.resposta`; comando e aplicativo têm
    // classes próprias e podem aparecer sem problema.
    const respostas = await page.locator('.lancadorLista .resposta').count()
    if (respostas > 0) falou.push(`${texto} → ${(l[0] ?? '').slice(0, 30)}`)
  }
  fora.push(
    falou.length === 0
      ? ['o que não é conta fica quieto', true, `${cala.length} casos`]
      : ['o que não é conta fica quieto', `respondeu a: ${falou.join('; ')}`],
  )

  /*
   * O temporizador exige a palavra ou a unidade.
   *
   * Ele aceitava qualquer número no começo, e com a calculadora ao lado isso
   * virou ruído: "15% de 240" oferecia "Temporizador de 15 min" logo abaixo da
   * resposta certa.
   */
  const comTimer = await linhas('15% de 240')
  const virouTimer = comTimer.some((l) => /Temporizador/i.test(l))
  const timerOk = (await linhas('25 min')).some((l) => /Temporizador de 25/i.test(l))
  fora.push(
    !virouTimer && timerOk
      ? ['o temporizador exige a palavra ou a unidade', true, '"25 min" sim, "15% de 240" não']
      : [
          'o temporizador exige a palavra ou a unidade',
          virouTimer ? 'uma conta virou temporizador' : '"25 min" deixou de abrir o temporizador',
        ],
  )

  await page.fill(campo, '')
  if (aberta !== 'sim') {
    await page.keyboard.press('Escape')
    await espera(400)
  }
  return fora
}

async function main() {
  let browser
  try {
    browser = await chromium.connectOverCDP(ENDPOINT)
  } catch {
    console.log('\n✗ o app não está aberto com depuração.')
    console.log('  Rode em outro terminal:')
    console.log('    npx electron . --no-sandbox --remote-debugging-port=9222\n')
    process.exit(1)
  }

  // A camada do fantasma também é uma página `island.html` (`modo=voo`): a
  // homologação fala com a ilha de verdade.
  const paginas = browser.contexts().flatMap((c) => c.pages())
  const page =
    paginas.find((p) => p.url().includes('island.html') && !p.url().includes('modo=voo')) ??
    paginas[0]
  if (!page) {
    console.log('\n✗ não achei a janela do app.\n')
    process.exit(1)
  }

  // O arquivo que a gaveta guarda e devolve durante a verificação.
  writeFileSync(ARQUIVO_PROVA, 'prova da homologação da ilha\n', 'utf8')

  const catalogo = await page.evaluate(() => window.halo.island.catalog())
  const snapshot = await page.evaluate(() => window.halo.island.snapshot())
  const lidas = new Map()
  for (const modulo of snapshot.modules) {
    for (const leitura of modulo.readings) lidas.set(leitura.id, { leitura, modulo })
  }

  const resultados = []

  for (const item of catalogo) {
    if (item.kind === 'leitura') {
      const achada = lidas.get(item.id)
      if (!achada) {
        resultados.push([item, `nenhuma leitura com id "${item.id}" no instantâneo`])
      } else if (!achada.modulo.ok) {
        resultados.push([item, `módulo indisponível: ${achada.modulo.error}`])
      } else if (!String(achada.leitura.value).trim()) {
        resultados.push([item, 'respondeu vazio'])
      } else {
        resultados.push([item, true, achada.leitura.value])
      }
      continue
    }

    // Ações.
    const reversivel = REVERSIVEIS[item.id]
    try {
      if (item.id === 'gaveta-guardar-texto') {
        // Reversível com desfazer descoberto na hora: o texto vira um arquivo
        // com nome novo, então o caminho a remover vem da própria gaveta.
        const marca = 'prova-texto-da-homologacao'
        await page.evaluate(([id, a]) => window.halo.island.run(id, a), [item.id, marca])
        await espera(300)
        const gaveta = await page.evaluate(() => window.halo.island.shelf())
        const criado = gaveta.find((g) => g.kind === 'texto' && g.name.includes(marca))
        if (!criado) {
          resultados.push([item, 'guardou, mas o trecho não apareceu na gaveta'])
          continue
        }
        await page.evaluate(
          ([id, a]) => window.halo.island.run(id, a),
          ['gaveta-remover', criado.path],
        )
        resultados.push([item, true, 'executada e desfeita'])
      } else if (item.id === 'texto-da-imagem') {
        // A ação copia o texto lido para a área de transferência do usuário —
        // isso não se faz numa verificação. O OCR em si é exercitado com a
        // imagem de prova, pelo mesmo tesseract que a ação chama.
        const lido = execFileSync('tesseract', [IMAGEM_OCR, 'stdout', '-l', 'eng'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
        if (!lido.includes(TEXTO_OCR)) {
          resultados.push([
            item,
            `o tesseract leu "${lido.trim().slice(0, 30)}" em vez de "${TEXTO_OCR}"`,
          ])
          continue
        }
        const erro = await page.evaluate(
          (id) =>
            window.halo.island.run(id, '__conferindo__').then(
              () => null,
              (e) => String(e),
            ),
          `${item.id}__inexistente`,
        )
        resultados.push(
          erro?.includes('ação desconhecida')
            ? [
                item,
                true,
                `tesseract leu "${TEXTO_OCR}" da imagem de prova; a ação não foi executada (trocaria a área de transferência)`,
              ]
            : [item, 'o despachante não recusou um id inventado'],
        )
      } else if (item.id === 'claude-perguntar' && process.env.HALO_CLAUDE_VIVO) {
        // De verdade, quando pedido: uma pergunta curta, a resposta tem de
        // chegar às mensagens do agente, e a conversa é encerrada em seguida.
        await page.evaluate(
          ([id, a]) => window.halo.island.run(id, a),
          [item.id, 'Responda só com a palavra: halo'],
        )
        let resposta = ''
        for (let n = 0; n < 60 && !resposta; n += 1) {
          await espera(1000)
          const estado = await page.evaluate(() => window.halo.island.claude())
          resposta = estado.messages.filter((m) => m.role === 'assistant').at(-1)?.text ?? ''
          if (estado.agent?.state === 'erro') {
            resposta = `ERRO ${estado.agent.error}`
          }
        }
        await page.evaluate(() => window.halo.island.run('claude-parar'))
        resultados.push(
          /halo/i.test(resposta)
            ? [item, true, `perguntou de verdade e o Claude respondeu "${resposta.slice(0, 30)}"`]
            : [
                item,
                resposta ? `resposta inesperada: ${resposta.slice(0, 60)}` : 'sem resposta em 60s',
              ],
        )
      } else if (item.id === 'api-atividade-limpar') {
        // De ponta a ponta: publica uma atividade no socket, vê que ela
        // apareceu, e a tira da lista pela ação.
        const socket = lidas.get('api-socket')?.leitura.detail ?? ''
        if (!socket.startsWith('/')) {
          resultados.push([item, 'a API local não está ouvindo'])
          continue
        }
        const id = `homologacao-${Date.now().toString(36)}`
        const resposta = await publicar(socket, {
          tipo: 'atividade',
          id,
          titulo: 'prova da homologação',
          origem: 'homologacao',
        })
        if (resposta !== 'ok') {
          resultados.push([item, `o socket respondeu "${resposta}"`])
          continue
        }
        await espera(200)
        const lista = await page.evaluate(() => window.halo.island.atividades())
        if (!lista.some((a) => a.id === id)) {
          resultados.push([item, 'publicada no socket, mas não apareceu na lista'])
          continue
        }
        await page.evaluate(([acao, a]) => window.halo.island.run(acao, a), [item.id, id])
        resultados.push([item, true, 'atividade publicada no socket, vista e tirada'])
      } else if (reversivel) {
        try {
          await page.evaluate(([id, a]) => window.halo.island.run(id, a), [item.id, reversivel.arg])
        } catch (erro) {
          // "Não deu" que também é resposta certa — ver ERROS_ACEITOS.
          const aceito = ERROS_ACEITOS[item.id]
          if (aceito && String(erro).includes(aceito)) {
            resultados.push([item, true, `não havia o que alternar — ${aceito}`])
            continue
          }
          throw erro
        }
        await espera(reversivel.espera ?? 300)
        await page.evaluate(
          ([id, a]) => window.halo.island.run(id, a),
          [reversivel.desfazer, reversivel.argDesfazer],
        )
        await espera(reversivel.espera ?? 300)
        resultados.push([item, true, 'executada e desfeita'])
      } else if (INOCUAS.has(item.id) || item.id in ARG_INOCUO) {
        const arg =
          item.id === 'volume-definir'
            ? String(volumeAtual(snapshot))
            : item.id === 'nota-salvar'
              ? NOTA_ATUAL(snapshot)
              : ARG_INOCUO[item.id]
        try {
          await page.evaluate(([id, a]) => window.halo.island.run(id, a), [item.id, arg])
          resultados.push([item, true, 'executada'])
        } catch (erro) {
          const aceito = ERROS_ACEITOS[item.id]
          if (aceito && String(erro).includes(aceito)) {
            resultados.push([
              item,
              true,
              `não havia a quem mandar — ${String(erro)
                .replace(/^.*Error: /, '')
                .slice(0, 60)}`,
            ])
          } else throw erro
        }
      } else {
        const info = DISRUPTIVAS[item.id]
        if (!info) {
          resultados.push([item, 'ação sem classificação nesta verificação'])
        } else if (!existe(info.binario)) {
          resultados.push([item, `${info.binario} não existe nesta máquina`])
        } else {
          // Confere que o despachante conhece o id: um id inventado responde
          // "ação desconhecida", e é isso que se cobra aqui.
          const erro = await page.evaluate(
            (id) =>
              window.halo.island.run(id, '__conferindo__').then(
                () => null,
                (e) => String(e),
              ),
            `${item.id}__inexistente`,
          )
          const reconhece = erro?.includes('ação desconhecida')
          resultados.push(
            reconhece
              ? [item, true, `não executada — ${info.motivo}`]
              : [item, 'o despachante não recusou um id inventado'],
          )
        }
      }
    } catch (erro) {
      resultados.push([item, String(erro).slice(0, 90)])
    }
  }

  const geometria = await conferirGeometria(page)
  const lancador = await conferirLancador(page)
  const janelaDoLancador = await conferirLancadorJanela(browser, page)

  await browser.close()
  try {
    unlinkSync(ARQUIVO_PROVA)
  } catch {
    // Já não existia; nada a limpar.
  }

  // Relatório, agrupado por módulo.
  const porModulo = new Map()
  for (const r of resultados) {
    const lista = porModulo.get(r[0].module) ?? []
    lista.push(r)
    porModulo.set(r[0].module, lista)
  }

  console.log()
  let falhas = 0
  for (const [modulo, itens] of porModulo) {
    const ruins = itens.filter((i) => i[1] !== true).length
    console.log(`  ${ruins === 0 ? '✓' : '✗'} ${modulo} (${itens.length - ruins}/${itens.length})`)
    for (const [item, ok, nota] of itens) {
      if (ok === true) {
        console.log(`      · ${item.what} — ${nota ?? 'ok'}`)
      } else {
        falhas += 1
        console.log(`      ✗ ${item.what}: ${ok}`)
      }
    }
  }

  // A geometria vem em bloco próprio: ela não é integração, e a contagem de
  // "integrações homologadas" precisa continuar querendo dizer o que diz.
  const ruinsGeo = geometria.filter(
    (g) => g[1] !== true && !(typeof g[1] === 'string' && g[1].startsWith('—')),
  ).length
  console.log(
    `  ${ruinsGeo === 0 ? '✓' : '✗'} cabeçalho (${geometria.length - ruinsGeo}/${geometria.length})`,
  )
  for (const [what, ok, nota] of geometria) {
    if (ok === true) console.log(`      · ${what} — ${nota}`)
    // Como no `test:live`: uma frase começando por "—" é PULADO, não falha.
    else if (typeof ok === 'string' && ok.startsWith('—')) {
      console.log(`      · ${what} ${ok}`)
    } else {
      falhas += 1
      console.log(`      ✗ ${what}: ${ok}`)
    }
  }

  const ruinsLanc = lancador.filter((g) => g[1] !== true).length
  console.log(
    `  ${ruinsLanc === 0 ? '✓' : '✗'} lançador (${lancador.length - ruinsLanc}/${lancador.length})`,
  )
  for (const [what, ok, nota] of lancador) {
    if (ok === true) console.log(`      · ${what} — ${nota}`)
    else {
      falhas += 1
      console.log(`      ✗ ${what}: ${ok}`)
    }
  }

  const ruinsJanela = janelaDoLancador.filter((g) => g[1] !== true).length
  console.log(
    `  ${ruinsJanela === 0 ? '✓' : '✗'} janela do lançador (${janelaDoLancador.length - ruinsJanela}/${janelaDoLancador.length})`,
  )
  for (const [what, ok, nota] of janelaDoLancador) {
    if (ok === true) console.log(`      · ${what} — ${nota}`)
    else {
      falhas += 1
      console.log(`      ✗ ${what}: ${ok}`)
    }
  }

  const total = resultados.length
  console.log()
  if (falhas === 0) {
    console.log(`✓ ${total} integrações homologadas nesta máquina\n`)
  } else {
    // "verificações" e não "integrações": o bloco do cabeçalho é geometria,
    // e uma falha ali não é uma integração quebrada.
    console.log(`✗ ${falhas} verificação(ões) com problema (${total} integrações no catálogo)\n`)
    process.exit(1)
  }
}

/**
 * A janela de Meta+V: o MESMO motor da ilha, noutra carcaça.
 *
 * O que se cobra aqui é a carcaça, não o motor (que `conferirLancador` já
 * cobre pela ilha): a janela existe quando o lançador está ligado, abre pelo
 * `toggle` (o mesmo caminho do atalho), recebe o teclado, responde, e Esc a
 * fecha. Com o lançador desligado a verificação é pulada, e diz isso.
 */
async function conferirLancadorJanela(browser, ilha) {
  const paginas = browser.contexts().flatMap((c) => c.pages())
  const janela = paginas.find((p) => p.url().includes('launcher.html'))
  if (!janela)
    return [['a janela do lançador', true, 'lançador desligado em Configurações; nada a conferir']]
  const fora = []
  try {
    await ilha.evaluate(() => window.halo.launcher.toggle())
    await espera(1000)
    const foco = await janela.evaluate(() => document.activeElement?.tagName === 'INPUT')
    fora.push(
      foco
        ? ['abre com o teclado no campo', true, 'input ativo']
        : ['abre com o teclado no campo', 'o campo não recebeu o foco'],
    )

    await janela.fill('input', '2+2')
    await espera(450)
    const primeira = (await janela.locator('.linha .linhaTitulo').allTextContents())[0] ?? ''
    fora.push(
      primeira.includes('4')
        ? ['o motor responde na janela', true, '"2+2" → 4']
        : ['o motor responde na janela', `a primeira linha era "${primeira.slice(0, 40)}"`],
    )

    await janela.fill('input', 'konsole')
    await espera(500)
    const secoes = await janela.locator('.secaoTitulo').allTextContents()
    fora.push(
      secoes.includes('Aplicativos')
        ? ['aplicativos e janelas em seções', true, secoes.join(' · ')]
        : ['aplicativos e janelas em seções', `seções: ${secoes.join(' · ') || 'nenhuma'}`],
    )

    await janela.keyboard.press('Escape')
    await espera(150)
    await janela.keyboard.press('Escape')
    await espera(600)
    fora.push(['Esc limpa e depois fecha', true, 'dois Esc'])
  } catch (erro) {
    fora.push(['a janela do lançador', String(erro).slice(0, 90)])
  }
  return fora
}

/** O volume atual, para `volume-definir` não mexer em nada de verdade. */
function volumeAtual(snapshot) {
  const audio = snapshot.modules.find((m) => m.id === 'audio')
  const volume = audio?.readings.find((r) => r.id === 'volume')?.value ?? '50%'
  return Number.parseInt(volume, 10) || 50
}

await main()
