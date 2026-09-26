#!/usr/bin/env node
/**
 * Testes de tela.
 *
 * Cada tela é aberta pelo dock e precisa mostrar o que promete. Roda contra o
 * app construído servido por HTTP — sem `window.halo`, a fábrica de dados cai
 * nos mocks, então o resultado é determinístico: nada depende de rede, do
 * Docker ou do que estiver tocando.
 *
 * Para conferir os serviços REAIS desta máquina, use `npm run test:live`.
 *
 *   npm run build && npm run test:screens
 */
import { chromium } from 'playwright'
import { DEPENDENCIAS } from '../src/shared/dependencias.ts'
import { APP_SCREENS, gotoScreen, newContext, SETTLE, serveApp } from './lib/harness.mjs'

/** Cada expectativa é uma pergunta que a tela responde no DOM. */
const SPECS = {
  home: [
    ['relógio no formato do handoff', (p) => text(p, '[class*="_time_"]', /^\d{1,2}:\d{2}$/)],
    [
      'data em caixa alta com mês curto',
      (p) => text(p, '[class*="_date_"]', /^[A-ZÁÇÃÊÓ]+ · \d{1,2} [A-Z]{3}$/),
    ],
    [
      // Numa instalação nova não há cidade (24/09/2026): o protótipo trazia
      // Sintra, e isso seria dado inventado sem aviso. O cartão diz onde
      // escolher; com cidade, Configurações cobra a linha "condição · lugar".
      'clima sem cidade diz onde escolher',
      (p) => text(p, '[class*="_weatherLine_"]', /CONFIGURAÇÕES → WIDGETS/),
    ],
    [
      'saudação pela hora do sistema',
      (p) => text(p, '[class*="_greeting_"]', /^(Bom dia|Boa tarde|Boa noite),/),
    ],
    // Quatro, e não os dois do handoff: a placa de vídeo e a temperatura
    // entraram, e a coluna tinha folga. Contados porque a grade de duas
    // colunas quebraria em silêncio se um deles sumisse.
    ['mini-stats da máquina', (p) => count(p, '[class*="_stat_"]', 4)],
    ['cartões de Continuar', (p) => atLeast(p, '[class*="_continueCard_"]', 1)],
    ['coluna de leitura', (p) => atLeast(p, '[class*="_feedItem_"]', 3)],
    ['notificações', (p) => atLeast(p, '[class*="_notification_"]', 4)],
    [
      // Mesma metade da regra: as quatro notificações são do protótipo, e o
      // rótulo da coluna é o único lugar onde isso pode ser dito. As
      // NOTIFICAÇÕES saíram dessa lista: dentro do app elas são as do sistema,
      // pelo vigia do D-Bus da ilha. Aqui, no navegador, valem os exemplos, e
      // o que se cobra é a coluna existir e estar preenchida.
      // `:has-text` e não `text()`: há vários `_label_` na home, e o primeiro
      // deles é "CONTINUAR".
      'a coluna de notificações mostra o que recebeu',
      (p) => atLeast(p, '[class*="_label_"]:has-text("NOTIFICAÇÕES")', 1),
    ],
    [
      // Os cinco do handoff continuam listados, mais o BioShock e o City Pop:
      // quatro com tema (Floresta, City Pop, Cyberpunk 2077 e BioShock) e três
      // marcados como "em breve".
      'sete ambientes',
      (p) =>
        count(
          p,
          '[class*="_env_"]:not([class*="_envName_"]):not([class*="_envCheck_"]):not([class*="_envGrid_"])',
          7,
        ),
    ],
    [
      // O sétimo ambiente não cabia nos 600px do painel e saía pela moldura.
      // A lista rola por dentro: o último cartão termina dentro do painel, ou
      // é alcançável rolando — nunca por fora.
      'a lista de ambientes fica dentro do painel',
      (p) =>
        p.evaluate(() => {
          const grid = document.querySelector('[aria-label="Ambientes"]')
          const painel = grid.closest('[class*="_side_"]').getBoundingClientRect()
          const ultimo = [...grid.querySelectorAll('button')].pop().getBoundingClientRect()
          if (ultimo.bottom <= painel.bottom + 1) return true
          const rola =
            getComputedStyle(grid).overflowY === 'auto' && grid.scrollHeight > grid.clientHeight
          return rola
            ? true
            : `o último ambiente termina em ${Math.round(ultimo.bottom)}, o painel em ${Math.round(painel.bottom)}, e a lista não rola`
        }),
    ],
    [
      // Os gráficos dos medidores são ajuste POR AMBIENTE: a Floresta é o
      // handoff (nenhum), o City Pop traz as ondas da referência. As duas
      // metades importam — sem a segunda, um `||` no resolvedor passaria.
      'os medidores desenham o histórico só onde o ambiente pede',
      async (p) => {
        const ondas = () => p.locator('[class*="_onda_"]').count()
        const ambiente = (nome) => p.click(`[aria-label="Ambientes"] >> text=${nome}`)
        const naFloresta = await ondas()
        if (naFloresta !== 0)
          return `a Floresta é o handoff e não tem gráfico — vieram ${naFloresta}`
        await ambiente('City Pop')
        await p.waitForTimeout(500)
        const noCityPop = await ondas()
        await ambiente('Floresta')
        await p.waitForTimeout(500)
        if (noCityPop !== 4) return `o City Pop devia ter quatro ondas — vieram ${noCityPop}`
        const deVolta = await ondas()
        return deVolta === 0 ? true : `voltando à Floresta sobraram ${deVolta} ondas`
      },
    ],
    [
      'trocar de ambiente troca o tema, e os "em breve" continuam inertes',
      async (p) => {
        // `--stage-bg` é literal nos dois temas: se ele mudou, os tokens do
        // ambiente trocaram de verdade — e não só o atributo.
        const tema = () =>
          p.evaluate(() => ({
            env: document.documentElement.dataset.env,
            cor: getComputedStyle(document.documentElement).getPropertyValue('--stage-bg').trim(),
            // Fontes próprias: só o BioShock declara as duas — a serifa do
            // relógio e a geométrica dos rótulos. É como se prova que o arquivo
            // do tema entrou, e não só o atributo.
            display: getComputedStyle(document.documentElement)
              .getPropertyValue('--font-display')
              .trim(),
            label: getComputedStyle(document.documentElement)
              .getPropertyValue('--font-label')
              .trim(),
            // E que a fonte chegou de verdade ao relógio, e não só ao token.
            relogio: getComputedStyle(document.querySelector('[class*="_time_"]')).fontFamily,
            ativo:
              document
                .querySelector('[aria-label="Ambientes"] [aria-pressed="true"]')
                ?.textContent?.trim() ?? '',
          }))
        const ambiente = (nome) => p.click(`[aria-label="Ambientes"] >> text=${nome}`)

        const floresta = await tema()
        if (floresta.env !== 'floresta') return `o app nasceu em "${floresta.env}"`
        if (!floresta.ativo.startsWith('Floresta')) return `o marcado era "${floresta.ativo}"`

        await ambiente('Cyberpunk')
        await p.waitForTimeout(400)
        const cyber = await tema()
        if (cyber.env !== 'cyberpunk') return `data-env ficou em "${cyber.env}"`
        if (cyber.cor === floresta.cor) return 'os tokens do tema não mudaram'
        if (!cyber.ativo.startsWith('Cyberpunk')) return `o marcado era "${cyber.ativo}"`
        if (cyber.display || cyber.label) {
          return `o Cyberpunk herdou fonte do BioShock ("${cyber.display}"/"${cyber.label}")`
        }

        // BioShock: o terceiro tema. Além do atributo e da cor, ele é o único
        // que declara fonte própria — se o arquivo dele não tivesse entrado no
        // bundle, os tokens viriam vazios e a cor viria do tema anterior. E o
        // relógio é conferido no elemento, não só no token: uma lista de
        // seletores errada deixaria o token certo e a tela em DM Sans.
        await ambiente('Shock')
        await p.waitForTimeout(400)
        const bio = await tema()
        if (bio.env !== 'bioshock') return `data-env ficou em "${bio.env}"`
        if (bio.cor === cyber.cor || bio.cor === floresta.cor) {
          return 'os tokens do BioShock não mudaram'
        }
        if (!bio.display.includes('Playfair')) return `--font-display era "${bio.display}"`
        if (!bio.label.includes('Josefin')) return `--font-label era "${bio.label}"`
        if (!bio.relogio.includes('Playfair')) return `o relógio ficou em "${bio.relogio}"`
        if (!bio.ativo.startsWith('Shock')) return `o marcado era "${bio.ativo}"`

        // City Pop: o quarto. Marinho profundo com neon — se os tokens dele não
        // chegarem, a cor fica na do BioShock e o `data-env` mente.
        await ambiente('City Pop')
        await p.waitForTimeout(400)
        const city = await tema()
        if (city.env !== 'citypop') return `data-env ficou em "${city.env}"`
        if (city.cor === bio.cor || city.cor === cyber.cor || city.cor === floresta.cor) {
          return 'os tokens do City Pop não mudaram'
        }
        if (!city.ativo.startsWith('City Pop')) return `o marcado era "${city.ativo}"`
        // Ele NÃO declara fonte própria: se vier Playfair aqui, o arquivo do
        // BioShock vazou para fora do seletor dele.
        if (city.display || city.label) {
          return `o City Pop herdou fonte do BioShock ("${city.display}"/"${city.label}")`
        }

        // E de volta ao Cyberpunk: um tema novo não pode ter mexido no anterior.
        await ambiente('Cyberpunk')
        await p.waitForTimeout(400)
        const volta2077 = await tema()
        if (volta2077.cor !== cyber.cor || volta2077.display) {
          return `o Cyberpunk mudou depois do BioShock (${volta2077.cor}, "${volta2077.display}")`
        }

        // Ambiente sem tema é inerte. O clique vai pelo elemento de propósito:
        // ele é `aria-disabled`, e o clique do Playwright esperaria para
        // sempre — o que já prova que ele não se oferece como botão. Disparar
        // no elemento exercita o caminho que restaria a um clique real.
        await p
          .locator('[aria-label="Ambientes"] button', { hasText: 'Espaço' })
          .evaluate((el) => el.click())
        await p.waitForTimeout(300)
        const inerte = await tema()
        if (inerte.env !== 'cyberpunk' || inerte.ativo !== cyber.ativo) {
          return `"Espaço" mexeu no tema (${inerte.env}, marcado "${inerte.ativo}")`
        }

        // Devolve ao padrão: as outras verificações — e a baseline do layout —
        // valem para a Floresta.
        await ambiente('Floresta')
        await p.waitForTimeout(700)
        const volta = await tema()
        if (volta.env !== 'floresta') return `voltar deixou o app em "${volta.env}"`
        return volta.cor === floresta.cor ? true : 'voltar não devolveu as cores'
      },
    ],
  ],
  social: [
    [
      // As quatro fontes da tela: DeviantArt, Pinterest e Thingiverse, lidas
      // pelo navegador de segundo plano, mais "qualquer endereço" por Open
      // Graph. Eram cinco — o Printables saiu inteiro em 04/09/2026, porque as
      // páginas dele respondem 403 a acesso automático e a única saída seria
      // derrotar a proteção. Ver SOCIAL-ARTE.md.
      'as seis fontes aparecem',
      (p) => count(p, '[class*="_fonteTopo_"]', 6),
    ],
    [
      // A metade da regra que se perde primeiro: "nada de dado inventado sem
      // aviso na tela". Esta tela resolveu isso não tendo conteúdo de exemplo
      // NENHUM — fora do Electron não há navegador de segundo plano nem
      // sessão, a home das fontes vem vazia e a biblioteca começa vazia. O que
      // sobra é o texto do vazio. Um mock que reaparecesse aqui quebraria isto.
      'a tela começa vazia, sem conteúdo de exemplo',
      async (p) => {
        const cartoes = await p.locator('[class*="_cartaoAbrir_"]').count()
        if (cartoes !== 0) return fail(`${cartoes} cartões sem fonte nem biblioteca`)
        return text(p, '[class*="_vazioTitulo_"]', /Nada para mostrar/)
      },
    ],
    [
      // O caminho que funciona sem NENHUMA integração — e o que ele faz quando
      // a página não publica nada sobre si: não acaba. O título à mão salva.
      // (No navegador não há main nem rede, então a prévia sempre falha: é
      // exatamente o caso que precisa ser exercitado.)
      'salvar por link guarda a referência mesmo sem prévia',
      async (p) => {
        await p.click('[class*="_porLink_"]')
        await p.waitForTimeout(SETTLE)
        const modal = await p.locator('[role="dialog"][aria-label="Salvar por link"]').count()
        if (modal !== 1) return fail('o modal de salvar por link não abriu')

        await p.fill('[aria-label="Endereço da referência"]', 'https://exemplo.test/uma-arte')
        await p.fill('[aria-label="Título da referência"]', 'Referência de teste')
        await p.click('text=Salvar na biblioteca')
        await p.waitForTimeout(SETTLE)

        if ((await p.locator('[role="dialog"]').count()) !== 0) {
          return fail('o modal continuou aberto depois de salvar')
        }
        const salvo = await p.locator('[class*="_salvoTitulo_"]').first().textContent()
        if (salvo?.trim() !== 'Referência de teste') {
          return fail(`a biblioteca mostrou "${salvo?.trim()}"`)
        }
        // E aparece também no meio, em "Salvos recentemente".
        return atLeast(p, '[class*="_cartaoTitulo_"]', 1)
      },
    ],
    [
      // Favoritar e salvar são coisas diferentes, e a diferença tem de chegar
      // ao DOM: `aria-pressed` é o que um leitor de tela anuncia.
      'favoritar marca o item, e desmarca',
      async (p) => {
        const coracao = p.locator('[class*="_salvo_"] [aria-label="Favoritar"]').first()
        if ((await coracao.count()) === 0) return fail('nenhum item salvo para favoritar')
        await coracao.click()
        await p.waitForTimeout(SETTLE)
        const marcado = await p
          .locator('[class*="_salvo_"] [aria-label="Desfavoritar"]')
          .first()
          .count()
        if (marcado !== 1) return fail('favoritar não marcou o item')
        await p.locator('[class*="_salvo_"] [aria-label="Desfavoritar"]').first().click()
        await p.waitForTimeout(SETTLE)
        return count(p, '[class*="_salvo_"] [aria-label="Desfavoritar"]', 0)
      },
    ],
    [
      // As coleções sugeridas são SUGESTÃO: existem na tela e não no disco até
      // alguém clicar. E apagar a pasta não apaga o que estava dentro.
      'coleção sugerida só nasce no clique, e apagá-la preserva os itens',
      async (p) => {
        const antes = await p.locator('[class*="_colecaoLinha_"]').count()
        if (antes !== 0) return fail(`${antes} coleções antes de alguém criar uma`)

        await p.click('[class*="_chipFraco_"]:has-text("Inspirações")')
        await p.waitForTimeout(SETTLE)
        if ((await p.locator('[class*="_colecaoLinha_"]').count()) !== 1) {
          return fail('a sugestão não virou coleção')
        }

        // Dois cliques para apagar, como a lista de mídia.
        const tirar = p.locator('[class*="_colecaoTirar_"]').first()
        await tirar.click()
        await tirar.click()
        await p.waitForTimeout(SETTLE)
        if ((await p.locator('[class*="_colecaoLinha_"]').count()) !== 0) {
          return fail('a coleção não foi apagada')
        }
        return atLeast(p, '[class*="_salvoTitulo_"]', 1)
      },
    ],
    [
      // Tirar da biblioteca some com o item — e devolve a tela ao vazio, que é
      // como este teste encontra a próxima execução.
      'tirar da biblioteca devolve a tela ao vazio',
      async (p) => {
        await p.locator('[class*="_salvo_"] [aria-label="Tirar da biblioteca"]').first().click()
        await p.waitForTimeout(SETTLE)
        return text(p, '[class*="_vazioTitulo_"]', /Nada para mostrar/)
      },
    ],
    [
      /*
       * O grupo aberto na Biblioteca é o DESTINO de quem for salvo.
       *
       * Antes tudo caía solto: itens com `coleções=[]` e `favorito=false`,
       * visíveis só em "Tudo" e em mais lugar nenhum. Grupo que nunca recebe
       * nada é grupo que não existe.
       *
       * O caminho aqui usa um cartão que JÁ está na biblioteca (a seção
       * "Salvos recentemente" os desenha): tirar e pôr de volta com o grupo
       * aberto é o mesmo `salvar` do feed, com o mesmo destino.
       */
      'salvar com um grupo aberto guarda naquele grupo',
      async (p) => {
        // A regra: o grupo aberto na Biblioteca é o DESTINO de quem for salvo.
        // Antes tudo caía solto — itens com `coleções=[]` e `favorito=false`,
        // visíveis só em "Tudo" e em mais lugar nenhum. Grupo que nunca recebe
        // nada é grupo que não existe.
        await p.click('[class*="_chipFraco_"]:has-text("Inspirações")')
        await p.waitForTimeout(SETTLE)
        await p.click('[class*="_colecaoLinha_"] [class*="_chip_"]:has-text("Inspirações")')
        await p.waitForTimeout(SETTLE)

        await p.click('[class*="_porLink_"]')
        await p.waitForTimeout(SETTLE)
        // A coleção aberta já vem marcada: pedir de novo o que está na tela
        // seria pedir duas vezes a mesma coisa.
        const marcada = await p
          .locator('[role="dialog"] [aria-pressed="true"]:has-text("Inspirações")')
          .count()
        if (marcada !== 1) return fail('a coleção aberta não veio marcada no salvar por link')

        await p.fill('[aria-label="Endereço da referência"]', 'https://exemplo.test/obra-do-grupo')
        await p.fill('[aria-label="Título da referência"]', 'Obra do grupo')
        await p.click('text=Salvar na biblioteca')
        await p.waitForTimeout(SETTLE)

        // O grupo aberto passa a mostrá-lo — era exatamente o que faltava.
        const noGrupo = await p.locator('[class*="_salvo_"]').count()
        if (noGrupo !== 1) return fail(`o grupo Inspirações mostrou ${noGrupo} itens`)

        await p.click('[class*="_filtros_"] [class*="_chip_"]:has-text("Favoritos")')
        await p.waitForTimeout(SETTLE)
        const emFavoritos = await p.locator('[class*="_salvo_"]').count()
        if (emFavoritos !== 0) return fail('o item apareceu em Favoritos sem ser favoritado')

        await p.click('[class*="_filtros_"] [class*="_chip_"]:has-text("Tudo")')
        await p.waitForTimeout(SETTLE)
        const emTudo = await p.locator('[class*="_salvo_"]').count()

        // Limpeza: a próxima verificação encontra a tela como a deixou.
        await p.locator('[class*="_salvo_"] [aria-label="Tirar da biblioteca"]').first().click()
        await p.waitForTimeout(SETTLE)
        const tirar = p.locator('[class*="_colecaoTirar_"]').first()
        await tirar.click()
        await tirar.click()
        await p.waitForTimeout(SETTLE)

        return emTudo === 1 ? true : fail(`"Tudo" mostrou ${emTudo} itens, esperado 1`)
      },
    ],
    [
      // Modal sem foco é modal que só existe para quem usa mouse.
      'o modal de salvar por link leva o foco ao abrir e o devolve ao fechar',
      async (p) => {
        const abrir = p.locator('[class*="_porLink_"]').first()
        await abrir.focus()
        await abrir.press('Enter')
        await p.waitForTimeout(SETTLE)
        const dentro = await p.evaluate(
          () => document.activeElement?.getAttribute('aria-label') ?? '',
        )
        const modal = await p.locator('[role="dialog"][aria-modal="true"]').count()
        await p.keyboard.press('Escape')
        await p.waitForTimeout(SETTLE)
        const aberto = await p.locator('[role="dialog"]').count()
        if (modal === 0) return fail('o diálogo não se anuncia como aria-modal')
        if (dentro !== 'Fechar') return fail(`ao abrir, o foco foi para "${dentro}"`)
        return aberto === 0 ? true : fail('Escape não fechou o modal')
      },
    ],
  ],
  claude: [
    [
      // Modal sem foco é modal que só existe para quem usa mouse: quem abre
      // por teclado continuava lá atrás, na tela por baixo, e tabulava pelo
      // app inteiro antes de chegar no que acabou de abrir.
      'o modal de conversas leva o foco ao abrir e o devolve ao fechar',
      async (p) => {
        const abrir = p.locator('[aria-label^="Conversas antigas de"]').first()
        if ((await abrir.count()) === 0) return 'nenhum projeto para abrir conversas'
        await abrir.focus()
        await abrir.press('Enter')
        await p.waitForTimeout(600)
        const dentro = await p.evaluate(
          () => document.activeElement?.getAttribute('aria-label') ?? '',
        )
        const modal = await p.locator('[role="dialog"][aria-modal="true"]').count()
        await p.keyboard.press('Escape')
        await p.waitForTimeout(500)
        const voltou = await p.evaluate(
          () => document.activeElement?.getAttribute('aria-label') ?? '',
        )
        if (modal === 0) return 'o diálogo não se anuncia como aria-modal'
        if (dentro !== 'Fechar') return `ao abrir, o foco foi para "${dentro}"`
        return voltou.startsWith('Conversas antigas')
          ? true
          : `ao fechar, o foco foi para "${voltou}"`
      },
    ],
    ['orbe do assistente continua no topo da direita', (p) => exists(p, '[class*="_orb_"]')],
    ['projetos fixados aparecem à esquerda', (p) => atLeast(p, '[class*="_projectRow_"]', 1)],
    [
      'sem agente, o centro explica o que fazer',
      (p) => text(p, '[class*="_vazioTitulo_"]', /agente/i),
    ],
    [
      'clicar num projeto abre um agente, com status na direita',
      async (p) => {
        await p.locator(PROJETO).first().click()
        await p.waitForTimeout(600)

        const naDireita = await p.locator('[class*="_agenteRow_"]').count()
        if (naDireita === 0) return 'o agente não apareceu na lista da direita'
        const status = await p.locator('[class*="_agenteEstado_"]').first().textContent()
        if (!status?.trim()) return 'o agente apareceu sem status'
        // O indicador é o que diz se ele está trabalhando; sem ele a lista não informa.
        const pulso = await p.locator('[class*="_pulso_"]').count()
        return pulso > 0 ? true : 'sem indicador de status'
      },
    ],
    [
      'conversar com o agente escreve no centro',
      async (p) => {
        await p.fill('[class*="_campo_"]', 'oi')
        await p.click('[class*="_enviar_"]')
        await p.waitForTimeout(600)
        const mensagens = await p
          .locator(
            '[class*="_mensagem_"]:not([class*="_mensagens_"]):not([class*="_mensagemQuem_"]):not([class*="_mensagemTexto_"])',
          )
          .count()
        return mensagens >= 2 ? true : `${mensagens} mensagens depois de enviar`
      },
    ],
    [
      'projeto mostra o git: branch e o que está alterado',
      async (p) => {
        const branch = await p.locator('[class*="_projectMeta_"]').first().textContent()
        if (!branch?.includes('main')) return `meta do projeto: "${branch}"`
        const tag = await p.locator('[class*="_tag_"]').first().textContent()
        return tag?.trim() ? true : 'sem indicação do que está alterado'
      },
    ],
    [
      'resposta do agente vem formatada, com bloco copiável',
      async (p) => {
        const bloco =
          '[class*="_bloco_"]:not([class*="_blocoTopo_"]):not([class*="_blocoLingua_"]):not([class*="_blocoCopiar_"]):not([class*="_blocoCodigo_"])'
        if ((await p.locator(bloco).count()) === 0) return 'o bloco de código não foi renderizado'
        if ((await p.locator('[class*="_blocoCopiar_"]').count()) === 0)
          return 'sem botão de copiar'
        const lingua = await p.locator('[class*="_blocoLingua_"]').first().textContent()
        // Código tem de virar bloco, não texto corrido com crases à mostra.
        const corpo = await p.locator('[class*="_mensagemCorpo_"]').first().textContent()
        if (corpo?.includes('```')) return 'as crases vazaram para o texto'
        return lingua?.trim() ? true : 'bloco sem a linguagem'
      },
    ],
    ['dá para anexar arquivo', (p) => exists(p, '[class*="_anexar_"]')],
    [
      'conversas antigas abrem num modal, e não num balão cortado',
      async (p) => {
        // O botão só aparece com o mouse em cima (`opacity: 0` até o hover), e
        // o clique do Playwright espera visibilidade. Disparar no elemento
        // exercita o mesmo caminho sem depender do ponteiro.
        const abrirModal = () =>
          p
            .locator('[class*="_projectResume_"]')
            .first()
            .evaluate((el) => el.click())

        await abrirModal()
        await p.waitForTimeout(600)

        const modal = p.locator('[role="dialog"]')
        if ((await modal.count()) === 0) return 'o modal não abriu'
        // O balão antigo ficava dentro do painel de 300px e cortava o título.
        // O modal precisa de espaço de verdade para a lista ser escolhível.
        const caixa = await modal.boundingBox()
        if (!caixa || caixa.width < 420) return `modal com ${Math.round(caixa?.width ?? 0)}px`

        const sessoes = await p
          .locator(
            '[class*="_sessao_"]:not([class*="_sessoes_"]):not([class*="_sessaoTitulo_"]):not([class*="_sessaoMeta_"])',
          )
          .count()
        if (sessoes === 0) return 'nenhuma conversa listada'

        // Esc fecha: sair só pelo × seria armadilha.
        await p.keyboard.press('Escape')
        await p.waitForTimeout(400)
        if ((await p.locator('[role="dialog"]').count()) > 0) return 'Esc não fechou'

        // E retomar continua abrindo um agente.
        await abrirModal()
        await p.waitForTimeout(600)
        await p
          .locator(
            '[class*="_sessao_"]:not([class*="_sessoes_"]):not([class*="_sessaoTitulo_"]):not([class*="_sessaoMeta_"])',
          )
          .first()
          .click()
        await p.waitForTimeout(700)
        return (await p.locator('[class*="_agenteRow_"]').count()) >= 2
          ? true
          : 'clicar na conversa não abriu um agente'
      },
    ],
    [
      'encerrar o agente tira ele da lista',
      async (p) => {
        const antes = await p.locator('[class*="_agenteRow_"]').count()
        await p.locator('[class*="_agenteRow_"] [class*="_projectRemove_"]').first().click()
        await p.waitForTimeout(500)
        const depois = await p.locator('[class*="_agenteRow_"]').count()
        return depois === antes - 1 ? true : `de ${antes} para ${depois} agentes`
      },
    ],
    [
      // Agrupar projetos por categoria e recolher, para listas longas. O que se cobra é que nenhum caminho PERDE projeto — mover,
      // recolher e apagar o grupo só mudam onde ele aparece.
      'grupos: criar, pôr projeto dentro, recolher, expandir e apagar sem perder nada',
      async (p) => {
        const cartoes = () => p.locator(PROJETO).count()
        const total = await cartoes()
        if (total < 2) return `só ${total} projeto(s) para agrupar`

        await p.click('[aria-label="Novo grupo"]')
        await p.fill('[aria-label="Nome do novo grupo"]', 'Jogos')
        await p.keyboard.press('Enter')
        await p.waitForTimeout(SETTLE)
        const cabeca = p.locator('button[aria-expanded]', { hasText: 'Jogos' })
        if ((await cabeca.count()) === 0) return 'o grupo não apareceu'

        // Pelo botão de pasta: o caminho sem arrasto. Ele só aparece no hover,
        // e disparar no elemento exercita o mesmo caminho sem o ponteiro.
        await p
          .locator('[aria-label$=" para um grupo"]')
          .first()
          .evaluate((el) => el.click())
        await p.waitForTimeout(SETTLE)
        await p.locator('fieldset[aria-label^="Mover "] button', { hasText: 'Jogos' }).click()
        await p.waitForTimeout(SETTLE)
        if (!(await cabeca.textContent())?.includes('1')) return 'o projeto não entrou no grupo'

        // E arrastando: o segundo cartão até o cabeçalho do grupo.
        await p.locator(PROJETO).last().dragTo(cabeca)
        await p.waitForTimeout(SETTLE)
        if (!(await cabeca.textContent())?.includes('2')) return 'arrastar não pôs no grupo'
        if ((await cartoes()) !== total) return 'mover perdeu projeto'

        await cabeca.click()
        await p.waitForTimeout(SETTLE)
        if ((await cabeca.getAttribute('aria-expanded')) !== 'false') return 'não recolheu'
        if ((await cartoes()) !== total - 2) return 'recolher não escondeu os dois'
        await cabeca.click()
        await p.waitForTimeout(SETTLE)
        if ((await cartoes()) !== total) return 'expandir não trouxe de volta'

        // Apagar pede dois cliques, e os projetos voltam para "Sem grupo".
        const apagar = p.locator('[aria-label$="o grupo Jogos"]').last()
        await apagar.evaluate((el) => el.click())
        await apagar.evaluate((el) => el.click())
        await p.waitForTimeout(SETTLE)
        if ((await cabeca.count()) > 0) return 'o grupo não foi apagado'
        return (await cartoes()) === total ? true : 'apagar o grupo perdeu projeto'
      },
    ],
    [
      // Segundo pedido, depois de usar: a ordem dos grupos também é dele.
      // Arrastando o cabeçalho, e por Alt+↑/↓ sem perder o foco.
      'grupos se reordenam: arrastando o cabeçalho e por Alt+setas',
      async (p) => {
        for (const nome of ['Alfa', 'Beta']) {
          await p.click('[aria-label="Novo grupo"]')
          await p.fill('[aria-label="Nome do novo grupo"]', nome)
          await p.keyboard.press('Enter')
          await p.waitForTimeout(400)
        }
        const ordem = async () =>
          (await p.locator('[data-grupo-id]').allTextContents()).map((t) =>
            t.replace(/\d+$/, '').trim(),
          )
        if ((await ordem()).join() !== 'Alfa,Beta') return `ordem inicial: ${await ordem()}`

        const beta = p.locator('[data-grupo-id]', { hasText: 'Beta' })
        await beta.dragTo(p.locator('[data-grupo-id]', { hasText: 'Alfa' }))
        await p.waitForTimeout(SETTLE)
        if ((await ordem()).join() !== 'Beta,Alfa') return `depois de arrastar: ${await ordem()}`

        await beta.focus()
        await p.keyboard.press('Alt+ArrowDown')
        await p.waitForTimeout(SETTLE)
        if ((await ordem()).join() !== 'Alfa,Beta') return `depois de Alt+↓: ${await ordem()}`
        const foco = await p.evaluate(() => document.activeElement?.textContent ?? '')
        return foco.includes('Beta') ? true : `o foco saiu do grupo movido ("${foco}")`
      },
    ],
    [
      // Abrir a pasta do repositório no gerenciador de arquivos, ou copiar o
      // caminho, sem sair da tela. Cada cartão tem os dois.
      'cada projeto abre a pasta e copia o caminho',
      async (p) => {
        const cartoes = await p.locator(PROJETO).count()
        const abrir = await p.locator('[aria-label^="Abrir a pasta de "]').count()
        const copiar = await p.locator('[aria-label^="Copiar o caminho de "]').count()
        return abrir === cartoes && copiar === cartoes
          ? true
          : `${cartoes} cartões, ${abrir} botões de abrir, ${copiar} de copiar`
      },
    ],
  ],
  files: [
    [
      'cabeçalho da tabela',
      (p) => text(p, '[class*="_columns_"]', /NOME.*MODIFICADO.*TAMANHO.*DONO/s),
    ],
    ['navegação com voltar e avançar', (p) => count(p, '[class*="_navButton_"]', 2)],
    [
      'busca filtra a lista',
      async (p) => {
        const before = await p.locator('[class*="_rowMain_"]').count()
        await p.fill('[class*="_searchInput_"]', 'zzzznadaaqui')
        await p.waitForTimeout(200)
        const after = await p.locator('[class*="_rowMain_"]').count()
        await p.fill('[class*="_searchInput_"]', '')
        return after < before || before === 0 ? true : 'a busca não filtrou'
      },
    ],
    ['discos montados com uso', (p) => atLeast(p, '[class*="_diskBarFill_"]', 1)],
    ['caminho de onde estamos', (p) => atLeast(p, '[class*="_crumb_"]', 1)],
    [
      'carrossel de favoritas',
      (p) =>
        atLeast(
          p,
          '[class*="_folder_"]:not([class*="_folders_"]):not([class*="_folderName_"]):not([class*="_folderMeta_"])',
          1,
        ),
    ],
    [
      'carrossel avança sem deixar card cortado',
      async (p) => {
        const seta = p.locator('[aria-label="Próximas favoritas"]')
        if ((await seta.count()) === 0) return 'sem setas — o mock precisa de mais de 4 favoritas'
        await seta.click()
        await p.waitForTimeout(700)
        return p.evaluate(() => {
          const track = document.querySelector('[class*="_folders_"]')
          const t = track.getBoundingClientRect()
          const cortado = [...track.children].find((c) => {
            const r = c.getBoundingClientRect()
            return r.left < t.left - 1 && r.right > t.left + 1
          })
          if (track.scrollLeft === 0) return 'a seta não rolou nada'
          return cortado ? `card cortado na borda: ${cortado.textContent.slice(0, 20)}` : true
        })
      },
    ],
    [
      'clicar numa pasta entra nela',
      async (p) => {
        const antes = await p.textContent('[class*="_breadcrumb_"]')
        const pasta = p.locator('[class*="_rowMain_"]').first()
        if ((await pasta.count()) === 0) return true
        await pasta.click()
        await p.waitForTimeout(400)
        const depois = await p.textContent('[class*="_breadcrumb_"]')
        return depois !== antes ? true : `caminho não mudou (${antes})`
      },
    ],
  ],
  lab: [
    [
      // Os temas endereçam as telas por ATRIBUTO NEUTRO, e não pelo nome que o
      // CSS Modules gera (CRIACAO-DE-TEMAS.md § 4). Renomear ou perder um
      // desses atributos quebra o tema SEM ERRO NENHUM: a Floresta continua
      // perfeita, e só quem abre o Cyberpunk ou o BioShock vê o estrago. Foi
      // essa a classe do bug que riscava os números do perfil no Social.
      'os atributos que os temas usam como endereço continuam na tela',
      async (p) => {
        const semTela = await p.evaluate(
          () =>
            [...document.querySelectorAll('nav[aria-label="Telas"] button')].filter(
              // A seta de expandir a coluna não é uma tela, e não leva o atributo.
              (b) => !b.getAttribute('aria-expanded') && !b.dataset.haloTela,
            ).length,
        )
        const recortes = await p.locator('[data-halo-recorte]').count()
        if (semTela > 0) return `${semTela} botões do dock sem data-halo-tela`
        return recortes > 0 ? true : 'nenhum painel declara data-halo-recorte'
      },
    ],
    [
      // A camada BASE não tinha `prefers-reduced-motion` — os dois blocos que
      // existiam eram de tema. Quem pede movimento reduzido no sistema ficava
      // com os laços perpétuos rodando na Floresta, que é o app de todo dia. E
      // isso não aparece em captura nenhuma: só medindo o estilo computado.
      'movimento reduzido cala os laços perpétuos',
      async (p) => {
        const laços = () =>
          p.evaluate(
            () =>
              [...document.querySelectorAll('*')].filter((e) => {
                const s = getComputedStyle(e)
                return s.animationName !== 'none' && s.animationIterationCount === 'infinite'
              }).length,
          )
        await p.emulateMedia({ reducedMotion: 'reduce' })
        await p.waitForTimeout(400)
        const parado = await laços()
        // Devolve o contexto: as verificações seguintes medem o app normal.
        await p.emulateMedia({ reducedMotion: 'no-preference' })
        await p.waitForTimeout(400)
        const andando = await laços()
        if (parado > 0) return `${parado} laços continuaram com movimento reduzido`
        return andando > 0 ? true : 'não havia laço nenhum para calar — o teste não mede nada'
      },
    ],

    ['taxa de disponibilidade', (p) => text(p, '[class*="_headlineValue_"]', /%$/)],
    ['containers listados', (p) => atLeast(p, '[class*="_row_"]', 1)],
    [
      'cartão da máquina com CPU/RAM/TEMP',
      (p) => text(p, '[class*="_machineStats_"]', /CPU.*RAM.*TEMP/s),
    ],
    ['rodapé com vazão de rede', (p) => text(p, '[class*="_footer_"]', /MB\/S/)],
    ['atalhos para os serviços', (p) => atLeast(p, '[class*="_link_"]', 1)],
  ],
  media: [
    [
      'categorias da lista',
      (p) =>
        atLeast(
          p,
          '[class*="_library_"]:not([class*="_libraries_"]):not([class*="_libraryCount_"])',
          2,
        ),
    ],
    [
      'abas: Filmes, Séries e Favoritos',
      async (p) => {
        const rotulos = await p
          .locator('[class*="_tipo_"]:not([class*="_tipos_"]):not([class*="_tipoCount_"])')
          .allTextContents()
        const limpos = rotulos.map((t) => t.trim().replace(/\d+$/, '').trim())
        return limpos.join('|') === 'Filmes|Séries|Favoritos' ? true : `abas: ${limpos.join(', ')}`
      },
    ],
    ['grade mostra títulos com capa', (p) => atLeast(p, CAPA, 2)],
    ['contagem de títulos aparece', (p) => text(p, '[class*="_total_"]', /\d+\s+t.tulos?/)],
    [
      'buscar filtra a grade',
      async (p) => {
        const antes = await p.locator(CAPA).count()
        await p.fill(BUSCA, 'cidade')
        await p.waitForTimeout(400)
        const depois = await p.locator(CAPA).count()
        await p.fill(BUSCA, '')
        await p.waitForTimeout(400)
        return depois < antes ? true : `de ${antes} para ${depois} títulos`
      },
    ],
    [
      'escolher um título abre os detalhes com botão de tocar',
      async (p) => {
        await p.locator(CAPA).first().click()
        await p.waitForTimeout(400)
        const tocar = await p.locator('[class*="_tocar_"]').count()
        // Volta para os recentes, para não contaminar as próximas.
        await p.locator('[class*="_voltar_"]').click()
        await p.waitForTimeout(300)
        return tocar > 0 ? true : 'o painel de detalhes não trouxe o botão de tocar'
      },
    ],
    [
      'série mostra temporadas e episódios',
      async (p) => {
        await p.click('[class*="_tipo_"]:not([class*="_tipos_"]) >> text=Séries')
        await p.waitForTimeout(500)
        await p.locator(CAPA).first().click()
        await p.waitForTimeout(500)
        const temporadas = await p
          .locator('[class*="_temporada_"]:not([class*="_temporadas_"])')
          .count()
        const episodios = await p
          .locator(
            '[class*="_episodio_"]:not([class*="_episodios_"]):not([class*="_episodioNumero_"]):not([class*="_episodioNome_"])',
          )
          .count()
        await p.locator('[class*="_voltar_"]').click()
        await p.click('[class*="_tipo_"]:not([class*="_tipos_"]) >> text=Filmes')
        await p.waitForTimeout(400)
        return temporadas >= 2 && episodios >= 4
          ? true
          : `${temporadas} temporada(s) e ${episodios} episódio(s)`
      },
    ],
    [
      'a estrela favorita e a aba Favoritos mostra só o favoritado',
      async (p) => {
        const nome = await p.locator(`${CAPA} [class*="_capaNome_"]`).first().textContent()
        await p.locator(`${CAPA} [class*="_estrela_"]`).first().click()
        await p.waitForTimeout(300)

        await p.click('[class*="_tipo_"]:not([class*="_tipos_"]) >> text=Favoritos')
        await p.waitForTimeout(500)
        const listados = await p.locator(`${CAPA} [class*="_capaNome_"]`).allTextContents()

        // Desfavorita e volta, para as verificações não se contaminarem.
        await p.locator(`${CAPA} [class*="_estrela_"]`).first().click()
        await p.waitForTimeout(300)
        await p.click('[class*="_tipo_"]:not([class*="_tipos_"]) >> text=Filmes')
        await p.waitForTimeout(400)

        if (listados.length !== 1) return `Favoritos listou ${listados.length} títulos`
        return listados[0] === nome ? true : `favoritei "${nome}" e apareceu "${listados[0]}"`
      },
    ],
    [
      // Rótulo em vez de classe: `.label` também é o das categorias, à esquerda.
      'sem nada escolhido, o painel direito é o Continuar assistindo',
      (p) => exists(p, 'text=CONTINUAR ASSISTINDO'),
    ],
    [
      // O caminho que confundiu na prática: estando em Filmes, as listas não
      // aparecem no painel esquerdo, e o único jeito é pelo painel de detalhes.
      // Se o rótulo sumir, ninguém acha de novo.
      'de qualquer aba dá para pôr um título numa lista, e o rótulo diz isso',
      async (p) => {
        await p.click('[class*="_tipo_"]:not([class*="_tipos_"]) >> text=Favoritos')
        await p.waitForTimeout(400)
        await p.click('[class*="_novaLista_"]')
        await p.waitForTimeout(250)
        await p.fill('[class*="_listaCampo_"]', 'Assistidos')
        await p.keyboard.press('Enter')
        await p.waitForTimeout(500)

        // Volta para Filmes: aqui o painel esquerdo mostra categorias, não listas.
        await p.click('[class*="_tipo_"]:not([class*="_tipos_"]) >> text=Filmes')
        await p.waitForTimeout(500)
        await p.locator(CAPA).first().click()
        await p.waitForTimeout(500)

        const rotulo = await p.locator('text=ADICIONAR A UMA LISTA').count()
        const etiqueta = p.locator('[class*="_etiqueta_"]', { hasText: 'Assistidos' })
        if (rotulo === 0) return 'sem o rótulo, as etiquetas viram botões sem sentido'
        if ((await etiqueta.count()) === 0) return 'a lista não apareceu no painel de detalhes'

        await etiqueta.click()
        await p.waitForTimeout(500)
        const dentro = await p.locator('[class*="_etiquetaOn_"]').count()

        // Desfaz tudo o que este teste criou — inclusive o favorito que a
        // etiqueta cria sozinha. Estado que sobra derruba a verificação
        // seguinte, não esta.
        await etiqueta.click()
        await p.waitForTimeout(300)
        await p.locator('[class*="_voltar_"]').click()
        await p.waitForTimeout(300)
        await p.locator(`${CAPA} [class*="_estrela_"]`).first().click()
        await p.waitForTimeout(300)
        await p.click('[class*="_tipo_"]:not([class*="_tipos_"]) >> text=Favoritos')
        await p.waitForTimeout(400)
        // Dois cliques: o primeiro arma a confirmação. Um só deixaria a lista
        // de pé, e é a verificação SEGUINTE que morreria — que é o que este
        // bloco de limpeza existe para evitar.
        await p.locator('[class*="_listaTirar_"]').first().click()
        await p.waitForTimeout(250)
        await p.locator('[class*="_listaTirar_"]').first().click()
        await p.waitForTimeout(300)
        await p.click('[class*="_tipo_"]:not([class*="_tipos_"]) >> text=Filmes')
        await p.waitForTimeout(500)

        return dentro > 0 ? true : 'clicar na etiqueta não marcou o título'
      },
    ],
    [
      'listas: criar, pôr um título dentro e ver só ela',
      async (p) => {
        await p.click('[class*="_tipo_"]:not([class*="_tipos_"]) >> text=Favoritos')
        await p.waitForTimeout(400)

        // Precisa de um favorito para haver o que organizar.
        await p.click('[class*="_tipo_"]:not([class*="_tipos_"]) >> text=Filmes')
        await p.waitForTimeout(400)
        await p.locator(`${CAPA} [class*="_estrela_"]`).first().click()
        await p.waitForTimeout(300)
        await p.click('[class*="_tipo_"]:not([class*="_tipos_"]) >> text=Favoritos')
        await p.waitForTimeout(500)

        await p.click('[class*="_novaLista_"]')
        await p.waitForTimeout(250)
        await p.fill('[class*="_listaCampo_"]', 'Talvez assistir')
        await p.keyboard.press('Enter')
        await p.waitForTimeout(500)

        const criada = await p.locator('[class*="_listaLinha_"]').count()
        if (criada !== 1) return `${criada} listas depois de criar uma`

        // Põe o título na lista pelo painel de detalhes.
        await p.locator(CAPA).first().click()
        await p.waitForTimeout(400)
        await p.locator('[class*="_etiqueta_"]:not([class*="_etiquetaOn_"])').first().click()
        await p.waitForTimeout(400)
        await p.locator('[class*="_voltar_"]').click()
        await p.waitForTimeout(300)

        // Vendo só a lista, tem de aparecer exatamente aquele título.
        await p.click('[class*="_listaLinha_"] [class*="_library_"]')
        await p.waitForTimeout(600)
        const naLista = await p.locator(CAPA).count()

        // Desfaz: apaga a lista e desfavorita. DOIS cliques, e é isso que o
        // teste passa a defender: apagar uma lista destrói escolha que o
        // usuário fez título a título, e o primeiro clique só arma.
        const apagar = p.locator('[class*="_listaTirar_"]').first()
        await apagar.click()
        await p.waitForTimeout(250)
        const armou = await p.locator('[class*="_listaConfirmar_"]').count()
        const aindaLa = await p.locator('[class*="_listaLinha_"]').count()
        await apagar.click()
        await p.waitForTimeout(400)
        if (armou !== 1) return 'o primeiro clique não armou a confirmação'
        if (aindaLa === 0) return 'o primeiro clique já apagou a lista'
        await p.locator(`${CAPA} [class*="_estrela_"]`).first().click()
        await p.waitForTimeout(300)
        await p.click('[class*="_tipo_"]:not([class*="_tipos_"]) >> text=Filmes')
        await p.waitForTimeout(400)

        return naLista === 1 ? true : `a lista mostrou ${naLista} títulos, esperado 1`
      },
    ],
    [
      // Sem chave do TMDB (o caso do harness), o painel pede a chave em vez de
      // deixar um vazio — e nunca inventa sinopse.
      'sem chave do TMDB, o detalhe diz onde configurar',
      async (p) => {
        await p.locator(CAPA).first().click()
        await p.waitForTimeout(500)
        const pedido = await p.locator('[class*="_pedirChave_"]').count()
        const sinopse = await p.locator('[class*="_sinopse_"]').count()
        await p.locator('[class*="_voltar_"]').click()
        await p.waitForTimeout(300)
        if (pedido === 0) return 'não pediu a chave'
        return sinopse === 0 ? true : 'mostrou sinopse sem chave configurada'
      },
    ],
  ],
  music: [
    // Fora do Electron a fábrica cai no mock do Spotify, e ele devolve
    // `state: 'demo'`. A etiqueta é a condição para o app mostrar conteúdo que
    // não é do usuário — sem ela, seria dado inventado (ver MOCKS.md).
    ['conteúdo de exemplo aparece etiquetado', (p) => text(p, '[class*="_demoTag_"]', /EXEMPLO/)],
    ['abas Playlists / Álbuns / Artistas', (p) => count(p, '[aria-label="Biblioteca"] button', 3)],
    ['playlists da conta na biblioteca', (p) => atLeast(p, PLAYLIST, 6)],
    [
      'algo já vem escolhido, sem o usuário clicar',
      (p) => text(p, '[class*="_artistName_"]', /\w/),
    ],
    ['faixas do item escolhido', (p) => atLeast(p, FAIXA, 5)],
    ['coluna de ouvidos recentemente', (p) => atLeast(p, '[class*="_recentRow_"]', 3)],
    ['artistas no painel direito', (p) => atLeast(p, '[class*="_like_"]', 3)],
    [
      // Sem player e sem aparelho, o painel diz isso em vez de inventar faixa.
      'sem nada tocando, o painel direito diz isso',
      (p) => exists(p, 'text=NADA TOCANDO'),
    ],
    [
      'trocar de aba troca a lista',
      async (p) => {
        const antes = await p.locator(`${PLAYLIST} [class*="_playlistName_"]`).allTextContents()
        await p.click('[aria-label="Biblioteca"] >> text=Álbuns')
        await p.waitForTimeout(300)
        const depois = await p.locator(`${PLAYLIST} [class*="_playlistName_"]`).allTextContents()
        await p.click('[aria-label="Biblioteca"] >> text=Playlists')
        await p.waitForTimeout(300)
        if (depois.length === 0) return 'a aba Álbuns ficou vazia'
        return depois.join('|') !== antes.join('|') ? true : 'a lista não mudou'
      },
    ],
    [
      'escolher na biblioteca troca o painel central',
      async (p) => {
        const antes = await p.textContent('[class*="_artistName_"]')
        await p.locator(PLAYLIST).nth(2).click()
        await p.waitForTimeout(400)
        const depois = await p.textContent('[class*="_artistName_"]')
        await p.locator(PLAYLIST).first().click()
        await p.waitForTimeout(400)
        return depois !== antes ? true : `o herói continuou em "${antes}"`
      },
    ],
    ['transporte com cinco controles', (p) => count(p, '[class*="_transport_"] button', 5)],
  ],
  settings: [
    [
      // O idioma (24/09/2026): português é o padrão, e a troca para inglês
      // vale na hora, sem reiniciar. Cobra-se a seção, a troca e a volta — e
      // que a volta devolve o português, senão o resto destes testes, que
      // procuram texto em português, falharia sem dizer por quê.
      'o idioma troca para inglês na hora e volta ao português',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Idioma')
        await p.waitForTimeout(400)
        const titulo = async () =>
          (await p.locator('text=Interface language').count()) > 0
            ? 'Interface language'
            : (await p.locator('text=Idioma da interface').count()) > 0
              ? 'Idioma da interface'
              : 'nenhum'
        const antes = await titulo()
        await p.locator('button', { hasText: 'English' }).first().click()
        await p.waitForTimeout(700)
        const depois = await titulo()
        const secoes = await p.locator('nav button').allTextContents()
        await p.locator('button', { hasText: 'Português (Brasil)' }).first().click()
        await p.waitForTimeout(700)
        const volta = await titulo()
        await p.click('nav[aria-label="Seções"] >> text=Animação')
        await p.waitForTimeout(300)
        if (antes?.trim() !== 'Idioma da interface') return `em português o título era "${antes}"`
        if (depois?.trim() !== 'Interface language') return `em inglês o título ficou "${depois}"`
        if (!secoes.some((s) => s.trim() === 'Appearance'))
          return `a navegação não virou inglês: ${secoes.slice(0, 4).join(', ')}`
        return volta?.trim() === 'Idioma da interface' ? true : `a volta deixou "${volta}"`
      },
    ],
    [
      'o clima mostra condição e lugar depois de escolher a cidade',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Widgets')
        await p.waitForTimeout(300)
        const campo = p.locator('[aria-label="Local do clima"]')
        await campo.fill('Lisboa')
        await campo.press('Enter')
        await p
          .locator('[aria-label="Home"]')
          .first()
          .evaluate((e) => e.click())
        await p.waitForTimeout(900)
        const linha = (await p.locator('[class*="_weatherLine_"]').first().textContent()) ?? ''
        await p
          .locator('[aria-label="Configurações"]')
          .first()
          .evaluate((e) => e.click())
        await p.waitForTimeout(700)
        return / · LISBOA$/.test(linha.trim()) ? true : `a linha ficou "${linha.trim()}"`
      },
    ],
    [
      // Cada ambiente pode ter um vídeo de fundo. Aqui, sem
      // `window.halo`, não há plugin para consultar; o que se cobra é que todo
      // ambiente com imagem tem também o seu vídeo, e que a tela diz quem toca.
      'Ambiente oferece um vídeo para cada ambiente pronto',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Ambiente')
        await p.waitForTimeout(300)
        const imagens = await p.locator('[aria-label^="Escolher a imagem de "]').count()
        const videos = await p.locator('[aria-label^="Escolher o vídeo de "]').count()
        const plugin = await p.locator('code', { hasText: 'org.local.videowallpaper' }).count()
        await p.click('nav[aria-label="Seções"] >> text=Animação')
        await p.waitForTimeout(300)
        if (videos === 0 || videos !== imagens)
          return `${imagens} ambientes com imagem, ${videos} com vídeo`
        return plugin > 0 ? true : 'não diz qual plugin toca o vídeo'
      },
    ],
    [
      // "Três lugares, uma fonte": o `doctor`, o `.deb` e esta tela leem a
      // mesma `shared/dependencias.ts`. Se um programa novo entrar na lista e
      // a tela não o mostrar, quem não abre terminal fica sem saber o que
      // falta na máquina dele — que é o silêncio que a tela existe para
      // acabar. Contado contra a lista, e não contra um número escrito aqui.
      'Sistema mostra os programas que o app chama de fora',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Sistema')
        await p.waitForTimeout(300)
        // Dentro das LISTAS: a linha da sessão gráfica também é um `depNome`,
        // e ela só aparece quando há diagnóstico — contar as duas coisas
        // juntas faria o número depender de onde o teste roda.
        const linhas = await p.locator('[class*="_lista_"] [class*="_depNome_"]').count()
        const grupos = await Promise.all(
          ['Essenciais', 'Do KDE Plasma', 'Opcionais'].map((n) =>
            p.locator(`[class*="_sectionLabel_"]:has-text("${n}")`).count(),
          ),
        )
        // Sem `window.halo` (aqui, no navegador) não há diagnóstico: o que se
        // cobra é a LISTA, que é a parte que vem da fonte única.
        const terminal = await p.locator('text=npm run doctor').count()
        await p.click('nav[aria-label="Seções"] >> text=Animação')
        await p.waitForTimeout(300)
        if (linhas !== DEPENDENCIAS.length)
          return `a tela mostra ${linhas} programas, e a lista tem ${DEPENDENCIAS.length}`
        if (grupos.some((n) => n === 0)) return `faltou um dos três níveis: ${grupos.join('/')}`
        return terminal > 0 ? true : 'não diz que a mesma lista roda no terminal'
      },
    ],
    [
      // A página de quem faz o app e a licença. A cláusula NonCommercial dos
      // ícones do clima muda o que o Halo pode virar, e esta é a única tela
      // onde ela aparece para quem só usa o app — sumir daqui é sumir.
      'Sobre traz versão, autor e licença',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Sobre')
        await p.waitForTimeout(300)
        const versoes = await p.locator('[class*="_metricValue_"]').allTextContents()
        const autor = await p.locator('a[href="https://github.com/jrcn1991"]').count()
        const gpl = await p.locator('text=GPL-3.0-or-later').count()
        const nc = await p.locator('text=NonCommercial').count()
        await p.click('nav[aria-label="Seções"] >> text=Animação')
        await p.waitForTimeout(300)
        // Fora do Electron não há `appInfo`: o traço é o estado de espera, e o
        // que se cobra aqui é que as TRÊS linhas existam.
        if (versoes.length < 3) return `só ${versoes.length} linhas de versão`
        if (autor === 0) return 'sem o endereço de quem faz o app'
        if (gpl === 0) return 'não diz a licença do código'
        return nc > 0 ? true : 'não avisa da cláusula NonCommercial'
      },
    ],
    ['quatro seções navegáveis', (p) => atLeast(p, 'nav[aria-label="Seções"] button', 4)],
    [
      // A opção dos gráficos mora em Widgets → Desempenho, com o "Restaurar
      // padrão" que devolve o preset do ambiente. Sem o botão o preset seria
      // visto uma vez e nunca mais.
      'Widgets → Desempenho escolhe o gráfico dos medidores e restaura o padrão',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Widgets')
        await p.waitForTimeout(300)
        const bloco = await p.locator('text=Desempenho').count()
        const opcoes = await Promise.all(
          ['Nenhum', 'Onda', 'Barras'].map((n) => p.locator(`button:has-text("${n}")`).count()),
        )
        // Os conjuntos de ícone do clima em imagem: se um sumir do controle,
        // ninguém consegue escolhê-lo — e a linha de crédito vai junto.
        const conjuntos = await Promise.all(
          ['ASTRO', 'Weather Cast'].map((n) => p.locator(`button:has-text("${n}")`).count()),
        )
        const credito = await p.locator('text=Saber Akiyama').count()
        const restaurar = await p.locator('button:has-text("Restaurar padrão")').count()
        await p.click('nav[aria-label="Seções"] >> text=Animação')
        await p.waitForTimeout(300)
        if (bloco === 0) return 'sem o bloco Desempenho'
        if (opcoes.some((n) => n === 0)) return `faltou opção de gráfico: ${opcoes.join('/')}`
        if (conjuntos.some((n) => n === 0))
          return `faltou conjunto de ícone: ${conjuntos.join('/')}`
        if (credito === 0) return 'sem a linha de crédito dos ícones'
        return restaurar > 0 ? true : 'sem "Restaurar padrão"'
      },
    ],
    [
      // Sem Client ID a tela de Música manda para cá; se o endereço de retorno
      // sumir daqui, ninguém consegue registrar o app no Spotify — e o erro
      // que aparece lá ("Invalid redirect URI") não diz o que fazer.
      'a seção Música diz onde criar o app e qual é o endereço de retorno',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Música')
        await p.waitForTimeout(300)
        const campo = await p.locator('[aria-label="Client ID do Spotify"]').count()
        // Contado AQUI, e não depois: `locator` é preguiçoso, e a contagem
        // rodaria já com a seção trocada — o campo teria "sumido".
        const retorno = await p.locator('[aria-label="Endereço de retorno do Spotify"]').count()
        const emUso = await p.locator('text=/Em uso: http:\\/\\/127\\.0\\.0\\.1:/').count()
        const dashboard = await p.locator('text=developer.spotify.com/dashboard').count()
        // Os escopos que a tela usa precisam estar escritos: quem autorizou
        // menos não tem como descobrir o que falta em lugar nenhum.
        const escopos = await p.locator('text=playlist-read-private').count()
        await p.click('nav[aria-label="Seções"] >> text=Animação')
        await p.waitForTimeout(300)
        if (campo === 0) return 'sem o campo do Client ID'
        if (dashboard === 0) return 'não diz onde criar o app'
        if (retorno === 0) return 'sem o campo do endereço de retorno'
        if (emUso === 0) return 'não diz qual endereço de retorno está valendo'
        return escopos > 0 ? true : 'não lista os escopos que pede'
      },
    ],
    ['as 13 variações de entrada', (p) => count(p, '[class*="_option_"]', 13)],
    ['tempos da variação selecionada', (p) => text(p, '[class*="_card_"]', /0\.\d+s/)],
    [
      'trocar de variação aplica na hora',
      async (p) => {
        await p.click('text=Órbita')
        await p.waitForTimeout(400)
        const t = await p.textContent('[class*="_previewName_"]')
        return t?.includes('Órbita') ? true : `painel direito ficou em "${t}"`
      },
    ],
    [
      // Três coisas que uma falha silenciosa deixaria passar: que o preset do
      // ambiente CHEGA à tela, que a escolha de quem clicou GANHA dele, e que
      // "Restaurar padrão" DEVOLVE o preset em vez de devolver o do handoff.
      // Sem a terceira, o preset viraria uma coisa que só se vê uma vez.
      'o movimento tem preset por ambiente, e "Restaurar padrão" volta a ele',
      async (p) => {
        const nome = () => p.textContent('[class*="_previewName_"]')
        const restaurar = () => p.click('button:has-text("Restaurar padrão")')
        const tela = (i) => p.click(`nav[aria-label="Telas"] button >> nth=${i}`)
        const ambiente = async (n) => {
          await tela(0)
          await p.waitForTimeout(400)
          await p.click(`[aria-label="Ambientes"] >> text=${n}`)
          await p.waitForTimeout(400)
          await tela(7)
          await p.waitForTimeout(600)
        }

        // Parte de "automático": a variação anterior deixou uma escolha posta.
        await restaurar()
        await p.waitForTimeout(400)
        const naFloresta = await nome()
        if (naFloresta !== 'Surgir da barra') {
          return `a Floresta não tem preset, e devia valer a do handoff — veio "${naFloresta}"`
        }

        await ambiente('Cyberpunk')
        const noCyber = await nome()
        if (noCyber !== 'Deslize lateral') return `o preset do Cyberpunk não chegou: "${noCyber}"`

        // Escolha explícita ganha do preset, e continua ganhando.
        await p.click('text=Órbita')
        await p.waitForTimeout(400)
        const escolhido = await nome()
        if (escolhido !== 'Órbita') return `a escolha não ganhou do preset: "${escolhido}"`

        await restaurar()
        await p.waitForTimeout(400)
        const devolvido = await nome()
        if (devolvido !== 'Deslize lateral') {
          return `restaurar devolveu "${devolvido}" em vez do preset do ambiente`
        }

        // O preset não é só de animação: o vidro entra nele. E aqui o "não
        // escolhi" é NULO, não vazio — 0 é transparência válida, e um `||`
        // no resolvedor a trocaria pelo preset sem ninguém notar. Os dois
        // ambientes são conferidos porque eles exercitam campos diferentes: o
        // Cyberpunk só põe transparência, o BioShock põe as duas.
        const vidro = async () => {
          await p.click('nav[aria-label="Seções"] >> text=Aparência')
          await p.waitForTimeout(400)
          const metricas = p.locator('[class*="_metric_"]')
          const lido = `${await metricas.nth(0).textContent()} / ${await metricas.nth(1).textContent()}`
          await p.click('nav[aria-label="Seções"] >> text=Animação')
          await p.waitForTimeout(300)
          return lido
        }

        const noCyberVidro = await vidro()
        if (!noCyberVidro.includes('11%')) {
          return `o preset de vidro do Cyberpunk não chegou: "${noCyberVidro}"`
        }

        await ambiente('Shock')
        const noBioVidro = await vidro()
        if (!noBioVidro.includes('30%') || !noBioVidro.includes('11%')) {
          return `o preset de vidro do BioShock não chegou: "${noBioVidro}"`
        }

        await ambiente('Floresta')
        const naFlorestaVidro = await vidro()
        if (!naFlorestaVidro.includes('50%')) {
          return `a Floresta não tem preset e devia voltar ao handoff: "${naFlorestaVidro}"`
        }

        // E o defeito que já aconteceu: ajuste feito num ambiente NÃO pode
        // aparecer no outro, e tem de estar lá quando ele voltar. Aqui a
        // Floresta escolhe "Enxame"; o BioShock precisa continuar no preset
        // dele, e a Floresta precisa reencontrar a escolha ao voltar.
        await p.click('text=Enxame')
        await p.waitForTimeout(400)
        if ((await nome()) !== 'Enxame') return 'a escolha não pegou na Floresta'

        await ambiente('Shock')
        const vazou = await nome()
        if (vazou !== 'Persiana') return `o ajuste da Floresta vazou para o BioShock: "${vazou}"`

        await ambiente('Floresta')
        const lembrou = await nome()
        if (lembrou !== 'Enxame') return `a Floresta esqueceu o que foi ajustado nela: "${lembrou}"`

        // Devolve o estado para as verificações seguintes.
        await restaurar()
        await p.waitForTimeout(400)
        return true
      },
    ],
    [
      // O trilho sempre anunciou `role="slider"` com `tabIndex={0}` e nenhuma
      // tecla o movia — promessa de interação que não existia, e que nenhum
      // guarda pegava porque a tela renderiza igual dos dois jeitos.
      'o slider anda pelo teclado, e o leitor de tela ouve o valor com unidade',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Aparência')
        await p.waitForTimeout(400)
        const trilho = p.locator('[role="slider"][aria-label="Transparência"]')
        const antes = Number(await trilho.getAttribute('aria-valuenow'))
        await trilho.focus()
        await p.keyboard.press('ArrowRight')
        await p.waitForTimeout(250)
        const depois = Number(await trilho.getAttribute('aria-valuenow'))
        await p.keyboard.press('Home')
        await p.waitForTimeout(250)
        const inicio = Number(await trilho.getAttribute('aria-valuenow'))
        const texto = await trilho.getAttribute('aria-valuetext')
        await p.click('nav[aria-label="Seções"] >> text=Animação')
        await p.waitForTimeout(300)
        if (depois <= antes) return `seta direita foi de ${antes} para ${depois}`
        if (inicio !== 0) return `Home devia zerar, ficou em ${inicio}`
        return texto?.includes('%') ? true : `aria-valuetext era "${texto}"`
      },
    ],
    [
      'desligar uma janela tira ela do dock',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Janela')
        await p.waitForTimeout(300)

        const antes = await p.locator('nav[aria-label="Telas"] button').count()
        await p.click('[role="switch"]:has-text("Social")')
        await p.waitForTimeout(300)
        const depois = await p.locator('nav[aria-label="Telas"] button').count()
        const social = await p
          .locator('nav[aria-label="Telas"] button[aria-label="Social"]')
          .count()

        // Devolve ao estado anterior para não contaminar as outras verificações.
        await p.click('[role="switch"]:has-text("Social")')
        await p.waitForTimeout(300)

        if (depois !== antes - 1) return `dock foi de ${antes} para ${depois} itens`
        return social === 0 ? true : 'Social continuou no dock'
      },
    ],
    [
      // A coluna embutida tem de ser a MESMA navegação: mesmos botões, na
      // mesma ordem, dentro do painel central — e voltar para Flutuante tem
      // de devolver o dock exatamente como estava.
      'a navegação pode ser embutida no painel central, e volta a flutuar',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Aparência')
        await p.waitForTimeout(300)
        const itens = await p.locator('nav[aria-label="Telas"] button').count()
        const grupo = '[role="group"][aria-label="Posição da navegação"]'
        await p.click(`${grupo} >> text=Embutida na janela`)
        await p.waitForTimeout(600)

        const dentro = await p.locator('[data-halo-in="center"] nav[aria-label="Telas"]').count()
        const soltos = await p.locator('nav[aria-label="Telas"]').count()
        const botoes = await p
          .locator('nav[aria-label="Telas"] button:not([aria-expanded])')
          .count()
        const ativo = await p
          .locator(
            'nav[aria-label="Telas"] button[aria-current="page"][aria-label="Configurações"]',
          )
          .count()
        const seta = p.locator('nav[aria-label="Telas"] button[aria-expanded]')
        const antes = await seta.getAttribute('aria-expanded')
        await seta.click()
        await p.waitForTimeout(500)
        const depois = await seta.getAttribute('aria-expanded')
        // `text="Home"` exato: sem as aspas casaria também com "Home Lab".
        const nome = await p.locator('nav[aria-label="Telas"] >> text="Home"').isVisible()
        await seta.click()
        await p.waitForTimeout(500)

        // Devolve ao estado anterior para não contaminar as outras verificações.
        await p.click(`${grupo} >> text=Flutuante`)
        await p.waitForTimeout(600)
        const fora = await p.locator('[data-halo-in="center"] nav[aria-label="Telas"]').count()
        const restaurado = await p.locator('nav[aria-label="Telas"] button').count()
        await p.click('nav[aria-label="Seções"] >> text=Animação')
        await p.waitForTimeout(300)

        if (dentro !== 1 || soltos !== 1)
          return `${dentro} coluna(s) no painel central, ${soltos} navegação(ões) na tela`
        if (botoes !== itens) return `coluna com ${botoes} itens, o dock tinha ${itens}`
        if (ativo !== 1) return 'a tela aberta não está destacada na coluna'
        if (antes !== 'false' || depois !== 'true') return `seta foi de ${antes} para ${depois}`
        if (!nome) return 'expandida, a coluna não mostra os nomes'
        if (fora !== 0) return 'voltar para Flutuante não tirou a coluna do painel'
        return restaurado === itens ? true : `dock voltou com ${restaurado} itens, tinha ${itens}`
      },
    ],
    [
      // A transição do conteúdo só faz sentido com a moldura parada: a seção
      // existe apenas embutida, e escolher uma variação tem de chegar ao
      // miolo (é o atributo que prende os keyframes).
      'a transição do conteúdo só existe embutida, e a escolha chega ao miolo',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Aparência')
        await p.waitForTimeout(300)
        const nav = '[role="group"][aria-label="Posição da navegação"]'
        const grupo = '[role="group"][aria-label="Transição do conteúdo"]'
        const flutuante = await p.locator(grupo).count()

        await p.click(`${nav} >> text=Embutida na janela`)
        await p.waitForTimeout(600)
        const embutida = await p.locator(grupo).count()
        const miolo = p.locator('[data-halo-in="content"]')
        const antes = await miolo.getAttribute('data-content-entrance')

        // Cada variação: o atributo certo no miolo, e uma animação de verdade
        // (nome resolvido no CSS construído) — menos "Nenhuma", que desliga.
        const VARIACOES = {
          Elástico: 'elastico',
          Recarregar: 'recarregar',
          Materializar: 'materializar',
          'Deslize lateral': 'deslize',
          Dobra: 'dobra',
          Implodir: 'implodir',
          Datamosh: 'datamosh',
          Nenhuma: 'nenhuma',
          Surgir: 'surgir',
        }
        const erros = []
        for (const [rotulo, valor] of Object.entries(VARIACOES)) {
          await p.click(`${grupo} >> text="${rotulo}"`)
          await p.waitForTimeout(200)
          const atributo = await miolo.getAttribute('data-content-entrance')
          const animacao = await miolo.evaluate((el) => getComputedStyle(el).animationName)
          if (atributo !== valor) erros.push(`${rotulo} deixou o miolo em "${atributo}"`)
          else if (valor === 'nenhuma' ? animacao !== 'none' : animacao === 'none')
            erros.push(`${rotulo}: animação "${animacao}"`)
        }

        // Devolve ao estado anterior para não contaminar as outras verificações
        // (o laço termina em Surgir, o padrão).
        await p.click(`${nav} >> text=Flutuante`)
        await p.waitForTimeout(600)
        await p.click('nav[aria-label="Seções"] >> text=Animação')
        await p.waitForTimeout(300)

        if (flutuante !== 0) return 'a seção apareceu no modo flutuante'
        if (embutida !== 1) return 'a seção não apareceu no modo embutido'
        if (antes !== 'surgir') return `o miolo nasceu com "${antes}", esperado "surgir"`
        return erros.length ? erros.join('; ') : true
      },
    ],
    [
      'modo desktop liga e desliga',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Janela')
        await p.waitForTimeout(300)

        const chave = p.locator('[role="switch"]:has-text("Rodar sobre o desktop")')
        if ((await chave.count()) === 0) return 'não achei o interruptor da camada'
        const antes = await chave.getAttribute('aria-checked')
        await chave.click()
        await p.waitForTimeout(300)
        const depois = await chave.getAttribute('aria-checked')

        // Devolve ao estado anterior: as verificações não podem se contaminar.
        await chave.click()
        await p.waitForTimeout(300)
        return antes !== depois ? true : `continuou em aria-checked=${antes}`
      },
    ],
    [
      'a ilha dinâmica tem seção própria, e nasce ligada',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Ilha')
        await p.waitForTimeout(400)

        const chave = p.locator('[role="switch"]:has-text("Mostrar a ilha dinâmica")')
        if ((await chave.count()) === 0) return 'sem o interruptor da ilha'
        // Ligada numa instalação nova, a pedido do usuário (26/09/2026): com a
        // janela nascendo recolhida, é a ilha que mostra que o app está de pé.
        if ((await chave.getAttribute('aria-checked')) !== 'true') return 'nasceu desligada'

        // As cinco variações de movimento têm de estar oferecidas.
        const movimentos = await p
          .locator('[role="group"][aria-label="Animação da ilha"] button')
          .count()
          .catch(() => 0)
        await p.click('nav[aria-label="Seções"] >> text=Janela')
        await p.waitForTimeout(300)
        return movimentos === 5 ? true : `${movimentos} variações de movimento, esperadas 5`
      },
    ],
    [
      // A altura da pílula fechada é ajustável. O
      // teste guarda os limites do contrato: o piso de 24 existe porque o
      // texto de 13px não muda de corpo, e o botão de restaurar tem de estar
      // desabilitado quando já se está nos 36 do handoff — sem ele o padrão
      // seria visto uma vez e nunca mais.
      // A altura passou a ser POR AMBIENTE (na Floresta, um pouco mais baixa, para não passar muito da barra do
      // tema). Sem escolha no ambiente vale a altura global, os 36 do
      // handoff — e é a ela que o "Restaurar padrão" volta.
      'a altura da pílula é ajustável, entre 24 e 48, e volta à do ambiente',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Ilha')
        await p.waitForTimeout(400)
        const trilho = p.locator('[role="slider"][aria-label="Altura fechada"]')
        if ((await trilho.count()) === 0) return 'sem o controle de altura da pílula'
        const limites = [
          await trilho.getAttribute('aria-valuenow'),
          await trilho.getAttribute('aria-valuemin'),
          await trilho.getAttribute('aria-valuemax'),
        ]
        const restaurar = 'button:has-text("Restaurar padrão")'
        const noPadrao = await disabled(p, restaurar)

        // O teclado leva ao piso, e o botão devolve o padrão: é o caminho de
        // volta, e sem ele um ajuste ruim ficaria para sempre.
        await trilho.focus()
        await p.keyboard.press('Home')
        await p.waitForTimeout(200)
        const noPiso = await trilho.getAttribute('aria-valuenow')
        await p.click(restaurar)
        await p.waitForTimeout(200)
        const devolvido = await trilho.getAttribute('aria-valuenow')

        await p.click('nav[aria-label="Seções"] >> text=Janela')
        await p.waitForTimeout(300)
        if (limites.join('/') !== '36/24/48')
          return `limites ${limites.join('/')}, esperados 36/24/48`
        if (noPadrao !== true) return 'o botão de restaurar não nasceu desabilitado no padrão'
        if (noPiso !== '24') return `Home levou a ${noPiso}, esperado 24`
        return devolvido === '36' ? true : `restaurar deu ${devolvido}, esperado 36`
      },
    ],
    [
      // Nasce DESLIGADA desde que o app passou a ser preparado para outras
      // máquinas: ligar esconde os balões
      // do Plasma, e isso não se faz sem a pessoa pedir. Os quatro cantos têm
      // de estar lá.
      'as notificações do sistema têm seção própria, e nascem desligadas',
      async (p) => {
        await p.click('nav[aria-label="Seções"] >> text=Notificações')
        await p.waitForTimeout(400)
        const chave = p.locator('[role="switch"]:has-text("Notificações no estilo do ambiente")')
        if ((await chave.count()) === 0) return 'sem o interruptor dos balões'
        const ligada = await chave.getAttribute('aria-checked')
        const cantos = await p
          .locator('[role="group"][aria-label="Canto dos balões"] button')
          .count()
        await p.click('nav[aria-label="Seções"] >> text=Janela')
        await p.waitForTimeout(300)
        if (ligada !== 'false') return 'nasceu ligada'
        return cantos === 4 ? true : `${cantos} cantos oferecidos, esperados 4`
      },
    ],
    [
      'Home e Configurações não podem ser desligadas',
      async (p) => {
        // Rótulo exato: "Home Lab" é uma tela que PODE ser desligada.
        const fixas = ['Home', 'Configurações']
        const rotulos = await p.locator('[role="switch"]').allTextContents()
        const proibidas = rotulos.map((t) => t.trim()).filter((t) => fixas.includes(t))
        return proibidas.length === 0
          ? true
          : `apareceram interruptores para ${proibidas.join(', ')}`
      },
    ],
  ],
}

/** A capa é um embrulho com o botão dentro; sem isto o seletor conta os dois. */
const CAPA =
  '[class*="_capa_"]:not([class*="_capaAlvo_"]):not([class*="_capaArte_"]):not([class*="_capaNome_"]):not([class*="_capaMeta_"]):not([class*="_capaSemArte_"]):not([class*="_capaOn_"])'
const BUSCA = '[class*="_busca_"]:not([class*="_buscaLinha_"])'
/** O cartão do projeto, sem casar com os pedaços de dentro dele. */
const PROJETO =
  '[class*="_project_"]:not([class*="_projectRow_"]):not([class*="_projectHead_"]):not([class*="_projectName_"]):not([class*="_projectMeta_"]):not([class*="_projectRemove_"]):not([class*="_projectAgents_"])'
/** Item da biblioteca de Música (playlist, álbum ou artista) e faixa da coluna. */
const PLAYLIST = '[class*="_playlist_"]'
const FAIXA = '[class*="_track_"]'

function fail(message) {
  return message
}

async function exists(page, selector) {
  return (await page.locator(selector).count()) > 0 ? true : fail(`não achei ${selector}`)
}

async function count(page, selector, expected) {
  const found = await page.locator(selector).count()
  return found === expected ? true : fail(`${found} encontrados, esperados ${expected}`)
}

async function atLeast(page, selector, minimum) {
  const found = await page.locator(selector).count()
  return found >= minimum ? true : fail(`${found} encontrados, esperados ao menos ${minimum}`)
}

async function text(page, selector, pattern) {
  const found = await page.locator(selector).first().textContent()
  if (found === null) return fail(`não achei ${selector}`)
  return pattern.test(found.trim())
    ? true
    : fail(`"${found.trim().slice(0, 48)}" não bate com ${pattern}`)
}

async function disabled(page, selector) {
  return (await page.locator(selector).first().isDisabled())
    ? true
    : fail('deveria estar desabilitado')
}

const { server, url } = await serveApp()
const browser = await chromium.launch()
const context = await newContext(browser)
const page = await context.newPage()

const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 100)))
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text().slice(0, 100)))

await page.goto(url)
await page.waitForTimeout(SETTLE)

let failed = 0
let passed = 0

for (const [index, name] of APP_SCREENS.entries()) {
  await gotoScreen(page, index)
  const specs = SPECS[name] ?? []
  const rows = []

  for (const [what, check] of specs) {
    try {
      const result = await check(page)
      if (result === true) {
        passed++
      } else {
        failed++
        rows.push(`    ✗ ${what} — ${result}`)
      }
    } catch (error) {
      failed++
      rows.push(`    ✗ ${what} — ${String(error).split('\n')[0].slice(0, 80)}`)
    }
  }

  console.log(rows.length ? `  ✗ ${name}\n${rows.join('\n')}` : `  ✓ ${name} (${specs.length})`)
}

/*
 * A janela dos avisos — a terceira carcaça que veste o tema. Fora do Electron
 * ela mostra os exemplos (que dizem que são exemplo), e é neles que se cobra o
 * que uma falha silenciosa deixaria passar: que o balão de CADA ambiente
 * recebeu a fonte do tema no elemento (e não só no token), a animação daquele
 * tema (um nome errado deixaria o balão parado, sem erro), a silhueta do
 * Cyberpunk, e um piso quase sólido — o balão aparece por cima de qualquer
 * janela, e vidro aberto ali é texto ilegível.
 */
const AVISOS_POR_AMBIENTE = {
  floresta: { fonte: /DM Sans/, animacao: 'halo-aviso-entra' },
  citypop: { fonte: /DM Sans/, animacao: 'halo-cy-aviso-entra', carimbo: 'お知らせ' },
  cyberpunk: { fonte: /Rajdhani/, animacao: 'halo-cp-notif', recorte: true },
  bioshock: { fonte: /Playfair Display/, animacao: 'halo-bs-aviso-emerge' },
}
const avisos = await context.newPage()
avisos.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 100)))
avisos.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text().slice(0, 100)))
const linhasDosAvisos = []
let conferidosDosAvisos = 0
const conferirAviso = (oQue, resultado) => {
  conferidosDosAvisos++
  if (resultado === true) passed++
  else {
    failed++
    linhasDosAvisos.push(`    ✗ ${oQue} — ${resultado}`)
  }
}
for (const [env, esperado] of Object.entries(AVISOS_POR_AMBIENTE)) {
  await avisos.goto(`${url}notificacoes.html?env=${env}&canto=topo-direita`)
  await avisos.waitForTimeout(900)
  const lido = await avisos.evaluate(() => {
    const blocos = [...document.querySelectorAll('[data-halo-in="aviso"]')]
    const titulo = document.querySelector('[data-aviso="titulo"]')
    if (!blocos[0] || !titulo) return null
    const estilo = getComputedStyle(blocos[0])
    return {
      n: blocos.length,
      fonte: getComputedStyle(titulo).fontFamily,
      animacao: estilo.animationName,
      recorte: estilo.clipPath,
      fundo: estilo.backgroundColor,
      carimbo: getComputedStyle(blocos[0], '::before').content,
    }
  })
  if (!lido) {
    conferirAviso(`${env}: os balões de exemplo`, 'nenhum balão desenhado')
    continue
  }
  conferirAviso(`${env}: três balões de exemplo`, lido.n === 3 ? true : `${lido.n} balões`)
  conferirAviso(
    `${env}: a fonte do tema chega ao título`,
    esperado.fonte.test(lido.fonte) ? true : `título em ${lido.fonte}`,
  )
  conferirAviso(
    `${env}: a entrada do tema`,
    lido.animacao.split(',')[0].trim() === esperado.animacao
      ? true
      : `animação "${lido.animacao}", esperada "${esperado.animacao}"`,
  )
  // `color(srgb r g b / a)` ou `rgba(r, g, b, a)`: o alfa é o último número.
  const alfa = /[/,]\s*([\d.]+)\)$/.exec(lido.fundo)?.[1]
  conferirAviso(
    `${env}: o piso do balão é quase sólido`,
    alfa === undefined || Number(alfa) >= 0.9 ? true : `fundo ${lido.fundo}`,
  )
  if (esperado.recorte)
    conferirAviso(
      `${env}: a silhueta com espora e bisel`,
      lido.recorte.startsWith('polygon') ? true : `clip-path ${lido.recorte}`,
    )
  if (esperado.carimbo)
    conferirAviso(
      `${env}: o carimbo do tema`,
      lido.carimbo.includes(esperado.carimbo) ? true : `carimbo ${lido.carimbo}`,
    )
}
// Dispensar tira o balão da tela depois da saída — e só ele.
await avisos.goto(`${url}notificacoes.html?env=floresta`)
await avisos.waitForTimeout(700)
await avisos.locator('[data-aviso="fechar"]').first().click()
await avisos.waitForTimeout(800)
const sobraram = await avisos.locator('[data-halo-in="aviso"]').count()
conferirAviso('dispensar tira um balão', sobraram === 2 ? true : `sobraram ${sobraram}`)
// Com o desfoque do KWin atrás (`desfoque=sim`), a Floresta vira vidro aberto
// — o piso some — e SÓ ela: os temas desenhados sólidos continuam
// sólidos. Sem desfoque, o piso quase sólido de cima é o que vale.
for (const [env, vidro] of [
  ['floresta', true],
  ['citypop', false],
  ['cyberpunk', false],
  ['bioshock', false],
]) {
  await avisos.goto(`${url}notificacoes.html?env=${env}&desfoque=sim`)
  await avisos.waitForTimeout(700)
  const fundo = await avisos.evaluate(
    () => getComputedStyle(document.querySelector('[data-halo-in="aviso"]')).backgroundColor,
  )
  const alfa = Number(/[/,]\s*([\d.]+)\)$/.exec(fundo)?.[1] ?? 1)
  conferirAviso(
    `${env} com desfoque: ${vidro ? 'vira vidro aberto' : 'continua sólido'}`,
    (vidro ? alfa < 0.1 : alfa >= 0.9) ? true : `fundo ${fundo}`,
  )
}
await avisos.close()
console.log(
  linhasDosAvisos.length
    ? `  ✗ avisos\n${linhasDosAvisos.join('\n')}`
    : `  ✓ avisos (${conferidosDosAvisos})`,
)

await browser.close()
server.close()

if (pageErrors.length) {
  failed += pageErrors.length
  console.log(`\n  ✗ erros no console:\n${pageErrors.map((e) => `    ${e}`).join('\n')}`)
}

console.log(
  failed
    ? `\n✗ ${failed} verificação(ões) falharam · ${passed} passaram\n`
    : `\n✓ ${passed} verificações em ${APP_SCREENS.length} telas\n`,
)
process.exit(failed ? 1 : 0)
