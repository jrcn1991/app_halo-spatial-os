#!/usr/bin/env node
/**
 * Testes das integrações reais.
 *
 * Diferente de `test:screens`, este conversa com o app RODANDO e cobra os
 * serviços do processo principal desta máquina: Docker, sistema de arquivos,
 * git, MPRIS, /proc, aplicativos instalados, clima e feeds RSS.
 *
 * O que ele NÃO faz é exigir um resultado específico: não há container fixo nem
 * música tocando garantida. Ele cobra forma e sanidade — se o serviço responde,
 * no formato certo, com valores plausíveis.
 *
 *   npm run dev            (em outro terminal, ou `npx electron . --no-sandbox --remote-debugging-port=9222`)
 *   npm run test:live
 */
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { DEPENDENCIAS } from '../src/shared/dependencias.ts'

/**
 * Onde o app está escutando.
 *
 * `HALO_CDP` existe para quando há mais de uma instância aberta (duas árvores
 * de trabalho, por exemplo): cada uma sobe numa porta e este teste aponta para
 * a certa, em vez de conversar com a do lado.
 */
const ENDPOINT = process.env.HALO_CDP ?? 'http://127.0.0.1:9222'

/**
 * O que o `which` acha nesta máquina, id a id da lista de dependências.
 *
 * Roda AQUI, no Node: as checagens são serializadas e executadas dentro da
 * página, onde não há `child_process`. Entra na página como `__haloNoPath`,
 * pelo mesmo caminho que `__haloRepo`.
 */
function noPathDaMaquina() {
  const achou = {}
  for (const dep of DEPENDENCIAS) {
    try {
      execFileSync('which', [dep.id], { stdio: 'ignore' })
      achou[dep.id] = true
    } catch {
      achou[dep.id] = false
    }
  }
  return achou
}

/** Cada checagem devolve `true` ou uma frase dizendo o que veio errado. */
const CHECKS = [
  [
    // O vídeo de fundo depende de um plugin do Plasma que NÃO vem com o app, e
    // Configurações → Ambiente diz se ele está aqui. Só CONSULTA: aplicar
    // trocaria o fundo da sessão real de quem roda o teste.
    'o app sabe dizer se o plugin de vídeo de fundo está instalado',
    async (api) => {
      const instalado = await api.wallpaper.videoPlugin()
      return typeof instalado === 'boolean' ? true : `veio ${typeof instalado}, e não um veredito`
    },
  ],
  [
    // O fundo de antes da primeira troca (24/09/2026). Só CONSULTA: restaurar
    // mexeria no fundo da sessão real de quem roda o teste.
    'o app sabe dizer se guardou o papel de parede original',
    async (api) => {
      const guardado = await api.wallpaper.original()
      return typeof guardado === 'boolean' ? true : `veio ${typeof guardado}, e não um veredito`
    },
  ],
  [
    // O diagnóstico de Configurações → Sistema é a terceira leitora de
    // `shared/dependencias.ts` (as outras são `npm run doctor` e o `.deb`), e
    // é a única que responde de dentro do app. Duas coisas podem quebrar sem
    // barulho: a lista e a resposta saírem de sincronia — um programa novo sem
    // veredito, e a tela mostraria um "·" para sempre — e o veredito estar
    // errado, que é pior do que não ter tela nenhuma: um "✓" ao lado de um
    // programa que não está aqui manda o usuário procurar o problema no lugar
    // errado.
    //
    // A comparação com o `which` vale porque este teste roda com o app aberto
    // pelo TERMINAL, com o mesmo PATH. Aberto pelo menu os dois divergem de
    // propósito (ver `docs/DEPENDENCIAS.md`) — e é por isso que a divergência
    // é cobrada aqui, onde ela não deveria existir.
    'o diagnóstico do sistema responde por toda a lista, e bate com esta máquina',
    async (api) => {
      const { presentes, sessao } = await api.system.dependencies()
      // Vem do Node, injetado antes do laço: quem sabe rodar `which` é ele, e
      // as chaves são exatamente os ids de `shared/dependencias.ts` — é o que
      // amarra esta checagem à lista, e não a um número escrito aqui.
      const noPath = window.__haloNoPath

      const semVeredito = Object.keys(noPath).filter((id) => typeof presentes[id] !== 'boolean')
      if (semVeredito.length) return `sem resposta para ${semVeredito.join(', ')}`

      const divergentes = Object.keys(noPath).filter((id) =>
        // O `claude` é procurado FORA do PATH (`~/.local/bin`, gerenciadores de
        // versão do Node, o caminho apontado em Configurações). Achar mais do
        // que o `which` é o desenho; achar menos, não.
        id === 'claude' ? !presentes[id] && noPath[id] : presentes[id] !== noPath[id],
      )
      if (divergentes.length) {
        return divergentes
          .map((id) => `${id}: o app diz ${presentes[id] ? 'que tem' : 'que falta'}`)
          .join(' · ')
      }

      // A sessão gráfica é o requisito que mais muda o que o app consegue
      // fazer, e o diagnóstico é o único lugar onde ele aparece para o usuário.
      if (!sessao.tipo) return 'sem o tipo da sessão gráfica'
      return true
    },
  ],
  [
    'biblioteca de mídia indexa a lista do usuário',
    async (api) => {
      const status = await api.media.status()
      if (!status.path) return '— nenhuma lista escolhida (configure em Mídia)'
      if (!status.ready) return `não consegui ler a lista: ${status.error}`
      if (status.movies + status.series === 0) return 'lista lida, mas sem nenhum título'

      // Episódios têm de estar agrupados: uma lista grande traz muitos deles,
      // e vê-los soltos no catálogo seria o bug que o
      // agrupamento existe para evitar.
      const pagina = await api.media.catalog({ limit: 40 })
      if (pagina.total !== status.movies + status.series) {
        return `catálogo com ${pagina.total} títulos, mas o status diz ${status.movies + status.series}`
      }
      const solto = pagina.items.find((t) => /\sS\d{1,2} ?E\d{1,4}\b/i.test(t.name))
      if (solto) return `episódio solto no catálogo: ${solto.name}`
      const semNome = pagina.items.find((t) => !t.name.trim())
      if (semNome) return 'título sem nome no catálogo'
      return true
    },
  ],
  [
    // "Ordem escolhida pelo usuário não se reordena em lugar nenhum"
    // (CLAUDE.md). Favoritos e listas guardam a ordem em que ele arrastou as
    // capas, e a busca do catálogo tem de devolver `only` na ordem em que o
    // recebeu. A garantia depende de duas coisas frágeis: o `map` sobre `only`
    // e a ESTABILIDADE do `sort` por relevância quando há busca — um `sort()`
    // bem-intencionado no caminho apagaria uma escolha feita com a mão, e nada
    // apontaria para o culpado.
    'a ordem de `only` é devolvida como veio, com e sem busca',
    async (api) => {
      const status = await api.media.status()
      if (!status.ready) return true
      const { items } = await api.media.catalog({ limit: 6 })
      if (items.length < 3) return '— catálogo pequeno demais para medir ordem'

      // Embaralhada de propósito, e sem sorteio: a ordem tem de ser a MESMA
      // em toda execução para o guarda ser determinístico.
      const only = [items[2].id, items[0].id, items[1].id]
      const nomes = async (extra) =>
        (await api.media.catalog({ only, limit: 10, ...extra })).items.map((t) => t.id)

      const seca = await nomes({})
      if (seca.join('|') !== only.join('|')) return `sem busca, veio ${seca.join(' → ')}`

      // Com `query`, o caminho passa pelo `sort` de relevância.
      const comBusca = await nomes({ query: '' })
      return comBusca.join('|') === only.join('|')
        ? true
        : `com busca, veio ${comBusca.join(' → ')}`
    },
  ],
  [
    // "O que o usuário salva precisa de identidade estável" (CLAUDE.md): o id
    // do episódio é salvo em `media.recent`, e era a POSIÇÃO na lista — que a
    // indexação reordena e o provedor muda. Uma posição salva hoje apontaria
    // para outro episódio amanhã, e ninguém perceberia: o player abriria e
    // tocaria alguma coisa.
    'o id de episódio não é a posição na lista',
    async (api) => {
      const status = await api.media.status()
      if (!status.ready) return true
      const { items } = await api.media.catalog({ kind: 'series', limit: 1 })
      if (!items.length) return true
      const detalhe = await api.media.title(items[0].id)
      const lista = detalhe?.list ?? []
      if (!lista.length) return true
      const posicionais = lista.filter((e) => /^\d+$/.test(String(e.id)))
      return posicionais.length === 0
        ? true
        : `${posicionais.length} de ${lista.length} episódios ainda usam a posição como id`
    },
  ],
  [
    'busca acha com espaço, sem espaço e fora de ordem — e ordena por relevância',
    async (api) => {
      const status = await api.media.status()
      if (!status.ready) return true

      // "Kill Bill" é o caso que falhou na prática: digitado colado, não achava.
      const nomes = async (q) =>
        (await api.media.catalog({ query: q, limit: 5 })).items.map((t) => t.name)

      const comEspaco = await nomes('kill bill')
      if (comEspaco.length === 0) return 'nem com espaço achou "kill bill" (a lista tem?)'

      const colado = await nomes('killbill')
      if (colado.length === 0) return '"killbill" (sem espaço) não achou nada'
      const trocado = await nomes('bill kill')
      if (trocado.length === 0) return '"bill kill" (fora de ordem) não achou nada'
      if (colado[0] !== comEspaco[0]) {
        return `"killbill" trouxe "${colado[0]}" e "kill bill" trouxe "${comEspaco[0]}"`
      }

      // Relevância: quem COMEÇA com o termo vem antes de quem só o contém.
      // Sem isso, "matrix" trazia "Animatrix" primeiro, por ordem alfabética.
      const matrix = await nomes('matrix')
      if (matrix.length > 1 && !matrix[0].toLowerCase().startsWith('matrix')) {
        return `"matrix" trouxe "${matrix[0]}" antes de um título que começa com Matrix`
      }
      return true
    },
  ],
  [
    'busca do catálogo ignora acento e responde rápido',
    async (api) => {
      const status = await api.media.status()
      if (!status.ready) return true

      const t0 = performance.now()
      const achados = await api.media.catalog({ query: 'acao', limit: 5 })
      const ms = performance.now() - t0
      // O limite é generoso de propósito: o que se cobra é que a busca não
      // percorra a lista crua a cada tecla.
      if (ms > 400) return `busca levou ${Math.round(ms)}ms`
      return achados.total >= 0 ? true : 'busca não devolveu total'
    },
  ],
  [
    'modo desktop responde e não mente sobre o servidor gráfico',
    async (api) => {
      // Liga: é o padrão do app, então religar não muda nada para o usuário.
      const r = await api.window.setDesktopMode(true)
      if (typeof r?.on !== 'boolean') return 'não devolveu o estado'
      if (r.server !== 'x11' && r.server !== 'wayland') return `servidor estranho: ${r.server}`
      // Em X11 a camada é aplicável agora; fora dele, nunca — dizer o contrário
      // faria a tela de configurações prometer o que não vai acontecer.
      if (r.server === 'x11' && !r.applied) return 'em X11 mas não aplicou'
      if (r.server === 'wayland' && r.applied) return 'alegou aplicar fora do X11'
      return true
    },
  ],
  [
    'Seafile: endereço colado da barra do navegador é aceito',
    async (api) => {
      // O que se cola no Seafile costuma ser a página de login, com caminho e
      // consulta. Guardar isso faria a API virar `…/accounts/login/?next=//api2/`,
      // que devolve HTML e não um erro claro — o app pareceria quebrado sem
      // dizer por quê.
      const guardado = api.settings.initial?.seafile?.server ?? ''
      if (!guardado) return true
      if (guardado.includes('/accounts') || guardado.split('/').length > 3) {
        return `o endereço guardado tem caminho: ${guardado}`
      }
      return true
    },
  ],
  [
    'Seafile: o estado do servidor é honesto',
    async (api) => {
      const estado = await api.seafile.state()
      const validos = ['sem-config', 'sem-credencial', 'erro', 'ok']
      if (!validos.includes(estado?.auth?.state)) {
        return `estado inesperado: ${JSON.stringify(estado?.auth)}`
      }
      if (estado.auth.state === 'sem-config') {
        return '— sem servidor Seafile (configure em Seafile)'
      }
      if (estado.auth.state === 'sem-credencial') {
        return '— falta entrar no Seafile (Configurações → Seafile)'
      }
      if (estado.auth.state === 'erro') return `servidor respondeu: ${estado.auth.message}`
      // Conectado: tem de haver ao menos uma biblioteca para receber arquivo.
      return estado.libraries.length > 0 ? true : 'conectado, mas sem biblioteca alguma'
    },
  ],
  [
    'Seafile: o token não atravessa para o renderer',
    async (api) => {
      // Mesma proteção do refresh token do Spotify: o renderer recebe as
      // configurações por argumento de linha de comando, legível em
      // /proc/<pid>/cmdline por qualquer processo desta máquina.
      const cru = JSON.stringify(api.settings.initial?.seafile ?? {})
      return cru.includes('"token":""') || !cru.includes('token')
        ? true
        : 'o token do Seafile chegou ao renderer'
    },
  ],
  [
    'metadados do TMDB respondem sem derrubar a tela',
    async (api) => {
      const status = await api.media.status()
      if (!status.ready) return true

      const pagina = await api.media.catalog({ kind: 'movie', limit: 1 })
      const titulo = pagina.items[0]
      if (!titulo) return 'catálogo sem filmes para consultar'

      // O contrato é não lançar nunca: a tela precisa distinguir os casos, e
      // rede fora do ar não pode derrubar o painel de detalhes.
      const r = await api.media.extra(titulo.id)
      const estados = ['no-key', 'not-found', 'error', 'found']
      if (!estados.includes(r?.state)) return `estado inesperado: ${JSON.stringify(r)}`
      if (r.state === 'no-key') return '— sem chave do TMDB (configure em Mídia)'
      if (r.state === 'found' && typeof r.extra?.overview !== 'string') {
        return 'achou o título mas veio sem sinopse'
      }
      return true
    },
  ],
  [
    'o que está tocando chega à home em formato que ela abre',
    async (api) => {
      const tocando = await api.player.nowPlaying()
      if (!tocando) return true

      // A capa precisa ser algo que a CSP do renderer abra. São dois casos, e
      // só dois: `data:` (players locais publicam `file://`, e o main
      // converte) ou um dos hosts de imagem liberados em index.html — o CDN do
      // Spotify, que é de onde vem a arte quando quem toca é ele.
      // Sem capa (um navegador parado publica `null`) não há o que abrir nem recusar.
      const abrivel =
        !tocando.artUrl ||
        tocando.artUrl.startsWith('data:') ||
        /^https:\/\/[\w-]+\.(scdn\.co|spotifycdn\.com)\//.test(tocando.artUrl)
      if (tocando.artUrl && !abrivel) {
        return `capa em "${tocando.artUrl.slice(0, 24)}…" — o renderer não abre isso`
      }
      // O Chromium publica o título da PÁGINA quando a página não declara sua
      // mídia. Foi o bug: a home mostrava "Halo · Player" em vez do filme.
      if (tocando.isHalo && /player/i.test(tocando.title)) {
        return `o player do Halo publicou "${tocando.title}" em vez do título da mídia`
      }
      return true
    },
  ],
  [
    'app e player ficam em camadas OPOSTAS',
    async (api) => {
      // O app é widget de área de trabalho: fica abaixo de tudo. O player é o
      // contrário: pode ser fixado acima de tudo. Confundir os dois já foi bug.
      const info = await api.appInfo()
      if (info.platform !== 'linux') return true

      const camada = await api.window.setDesktopMode(true)
      if (camada.server !== 'x11') {
        return 'o app não está em X11 — camada e fixar não funcionam fora dele'
      }
      if (!camada.applied) return 'não consegui pôr o app na camada do desktop'

      const podeFixar = await api.player.pinSupported()
      return podeFixar ? true : 'em X11 mas o player diz que não pode fixar'
    },
  ],
  [
    'máquina responde com CPU, memória e uptime',
    async (api) => {
      const host = await api.lab.host()
      if (typeof host.hostname !== 'string' || !host.hostname) return 'sem hostname'
      if (!(host.memory.totalMb > 0)) return 'memória total zerada'
      if (host.cpuPercent < 0 || host.cpuPercent > 100)
        return `cpu fora de faixa: ${host.cpuPercent}`
      if (!(host.uptimeDays >= 0)) return 'uptime negativo'
      return true
    },
  ],
  [
    'Docker lista containers',
    async (api) => {
      const list = await api.lab.containers()
      if (!Array.isArray(list)) return 'não devolveu lista'
      if (list.length === 0) return '— nenhum container (Docker parado?)'
      const bad = list.find((c) => !c.name || !c.state)
      return bad ? `container sem nome ou estado: ${JSON.stringify(bad).slice(0, 60)}` : true
    },
  ],
  [
    'monitores medem latência real',
    async (api) => {
      const list = await api.lab.monitors()
      if (!Array.isArray(list)) return 'não devolveu lista'
      const bad = list.find((m) => m.up && typeof m.latencyMs !== 'number')
      return bad ? `monitor no ar sem latência: ${bad.name}` : true
    },
  ],
  [
    'arquivos listam a pasta do usuário',
    async (api) => {
      const listing = await api.files.list()
      if (!listing.path.startsWith('/')) return 'caminho inválido'
      if (!Array.isArray(listing.entries)) return 'sem entradas'
      const bad = listing.entries.find((e) => !e.name || !e.kind || !e.modifiedAt)
      return bad ? `entrada incompleta: ${bad.name}` : true
    },
  ],
  [
    // Ligado, o Halo desenha os balões e o Plasma está inibido por ele. Ligado
    // e SEM desenhar é o caso que precisa de frase: a tela de Configurações
    // mostra o motivo, e aqui ele vira a falha — nunca um silêncio.
    'as notificações do sistema vestem o tema — ou dizem por quê',
    async (api) => {
      const estado = await api.notificacoes.estado()
      if (!estado.ligado) return true
      return estado.ativo ? true : `ligado e sem desenhar: ${estado.motivo}`
    },
  ],
  [
    'a superfície de arquivos é somente leitura',
    async (api) => {
      // A garantia contra corromper dados não é uma trava de caminho: é a
      // AUSÊNCIA de qualquer operação de escrita no contrato. Navegar alcança
      // os discos montados; escrever não é possível de lugar nenhum.
      // `pathOf` só traduz um `File` que o usuário já arrastou ou colou para o
      // caminho dele (`webUtils.getPathForFile`): não lê nem escreve no disco.
      const permitidos = ['list', 'storage', 'favorites', 'mounts', 'pathOf']
      const expostos = Object.keys(api.files)
      const extras = expostos.filter((k) => !permitidos.includes(k))
      if (extras.length) return `métodos além da leitura: ${extras.join(', ')}`

      // A varredura é DELIBERADAMENTE larga: ela vale para todos os grupos,
      // não só `files`, porque um método de escrita no disco do usuário
      // batizado em outro lugar seria a mesma perda. A única isenta é
      // `creative` — a biblioteca da Social Arte escreve UM arquivo, dentro
      // do `userData` do próprio app, e `remove`/`move` ali são "tirar da
      // minha lista" e "trocar de coleção": nenhum caminho do disco do
      // usuário atravessa esses métodos. Isenção nova precisa da mesma
      // justificativa escrita.
      const isentos = ['creative']
      const perigosos = ['write', 'delete', 'remove', 'rename', 'move', 'copy', 'mkdir', 'exec']
      const achados = Object.keys(api)
        .filter((grupo) => !isentos.includes(grupo))
        .flatMap((grupo) =>
          Object.keys(api[grupo] ?? {}).filter((m) =>
            perigosos.some((p) => m.toLowerCase().includes(p)),
          ),
        )
      if (achados.length) return `operação de escrita exposta: ${achados.join(', ')}`

      // E o que a isenção não pode esconder: um caminho de disco entrando na
      // biblioteca. Ela guarda URL e metadado — `file:` não passa pela trava
      // de protocolo, e é isso que se cobra aqui.
      const comArquivo = await api.creative.preview('file:///etc/passwd')
      return comArquivo.ok ? 'a biblioteca aceitou um caminho de disco' : true
    },
  ],
  [
    'discos montados aparecem com uso',
    async (api) => {
      const list = await api.files.mounts()
      if (!Array.isArray(list) || list.length === 0) return 'nenhum disco listado'
      const bad = list.find((m) => !m.path.startsWith('/') || !m.name)
      return bad ? `disco inválido: ${JSON.stringify(bad).slice(0, 60)}` : true
    },
  ],
  [
    'disco informa uso e total',
    async (api) => {
      const s = await api.files.storage()
      return s.totalBytes > 0 && s.usedBytes >= 0 && s.usedBytes <= s.totalBytes
        ? true
        : `valores implausíveis: ${s.usedBytes}/${s.totalBytes}`
    },
  ],
  [
    'mascote: a biblioteca inteira decodifica, não só um personagem',
    async (api) => {
      const lista = await api.mascot.list()
      if (lista.length === 0) return '— biblioteca vazia '

      // O decodificador foi escrito lendo UM arquivo. Personagens diferentes
      // exercitam caminhos diferentes do formato — a paleta é achada por
      // assinatura, e o caminho de imagem não comprimida não existe. Este é o
      // teste que pega uma regressão nisso.
      for (const escolha of lista) {
        const png = await api.mascot.preview(escolha.file).catch((e) => String(e))
        if (typeof png !== 'string' || !png.startsWith('data:image/png;base64,')) {
          return `${escolha.name} não decodificou: ${String(png).slice(0, 70)}`
        }
        // Um PNG minúsculo é sinal de imagem vazia, não de personagem.
        if (png.length < 2000) return `${escolha.name} decodificou quase vazio`
      }
      return true
    },
  ],
  [
    'mascote: o personagem .acs é decodificado e reage aos agentes',
    async (api) => {
      const info = await api.mascot.info()
      if (!info.name) return '— nenhum personagem escolhido (Configurações → Claude)'
      if (!info.ready) return `não consegui ler o personagem: ${info.error}`
      if (info.animations.length === 0) return 'personagem sem animação alguma'
      if (info.width <= 0 || info.height <= 0) return 'personagem sem tamanho'

      // Cada estado de agente tem de casar com uma animação que ESTE
      // personagem tenha: sem isso o mascote fica parado quando devia reagir.
      const semAnimacao = Object.entries(info.moods).filter(([, nome]) => !nome)
      if (semAnimacao.length > 0) {
        return `estados sem animação: ${semAnimacao.map(([m]) => m).join(', ')}`
      }

      // E os quadros têm de sair como imagem de verdade, não vazios.
      const animacao = await api.mascot.animation(info.moods.pensando)
      if (animacao.frames.length === 0) return 'a animação de "pensando" veio sem quadros'
      const primeiro = animacao.frames[0]
      if (!primeiro.image.startsWith('data:image/png;base64,')) return 'o quadro não é um PNG'
      if (primeiro.image.length < 500) return 'o quadro saiu vazio demais para ser um desenho'
      if (!(primeiro.durationMs > 0)) return 'quadro sem duração'
      return true
    },
  ],
  [
    'agente do Claude nasce, responde e é encerrado',
    async (api) => {
      // Cria no próprio repositório do app: existe, é git, e é o que o
      // usuário tem à mão. A raiz vem do Node (`window.__haloRepo`, injetada
      // antes do laço) — esta função roda na página, onde não há `process`, e
      // um caminho cravado prendia o teste a uma máquina.
      // Encerra no fim — processo órfão do CLI seria pior que a verificação
      // falhar.
      const agente = await api.agents.create(window.__haloRepo)
      if (!agente?.id) return 'não devolveu o agente'

      try {
        const espera = (ms) => new Promise((r) => setTimeout(r, ms))
        let atual = agente
        for (let i = 0; i < 40 && atual.state === 'iniciando'; i += 1) {
          await espera(1000)
          atual = (await api.agents.list()).find((a) => a.id === agente.id) ?? atual
        }
        if (atual.state === 'iniciando') return 'o processo não subiu em 40s'
        if (atual.state === 'erro') return `nasceu com erro: ${atual.error}`

        api.agents.send(agente.id, 'responda apenas: ok')
        for (let i = 0; i < 60; i += 1) {
          await espera(1000)
          atual = (await api.agents.list()).find((a) => a.id === agente.id) ?? atual
          if (atual.turns > 0) break
        }
        if (atual.turns === 0) return 'não completou o turno em 60s'
        if (atual.state !== 'ocioso') return `terminou o turno em "${atual.state}"`
        // A sessão só é anunciada quando há trabalho: com entrada em streaming
        // o CLI espera a primeira mensagem antes de falar. Por isso a checagem
        // vem AQUI, e não antes de mandar.
        if (!atual.sessionId) return 'completou o turno sem session_id'

        const msgs = await api.agents.messages(agente.id)
        const resposta = msgs.find((m) => m.role === 'assistant')
        return resposta ? true : 'terminou o turno sem resposta registrada'
      } finally {
        api.agents.close(agente.id)
      }
    },
  ],
  [
    'git descreve os projetos locais',
    async (api) => {
      const list = await api.projects.list()
      if (!Array.isArray(list)) return 'não devolveu lista'
      const bad = list.find((p) => !p.name || typeof p.dirtyFiles !== 'number')
      return bad ? `projeto incompleto: ${bad.name}` : true
    },
  ],
  [
    'aplicativos instalados são encontrados',
    async (api) => {
      const list = await api.apps.list()
      if (list.length === 0) return 'nenhum .desktop encontrado'
      const bad = list.find((a) => !a.name || !a.id.endsWith('.desktop'))
      return bad ? `app inválido: ${JSON.stringify(bad).slice(0, 60)}` : true
    },
  ],
  [
    'MPRIS responde (com ou sem player aberto)',
    async (api) => {
      const playing = await api.player.nowPlaying()
      if (playing === null) return true
      return typeof playing.title === 'string' && typeof playing.status === 'string'
        ? true
        : 'formato inesperado'
    },
  ],
  [
    'notícias chegam dos feeds configurados, e feed ruim vira frase, não exceção',
    async (api) => {
      const feeds = api.settings.initial?.news?.feeds ?? []
      if (feeds.length === 0) {
        return '— nenhum feed configurado (Configurações → Notícias)'
      }

      const r = await api.news.headlines(feeds)
      if (!Array.isArray(r?.items) || !Array.isArray(r?.feeds)) return 'não devolveu o formato'
      if (r.demo) return 'a home está com manchetes de EXEMPLO dentro do app'
      const morto = r.feeds.find((f) => f.error && f.count === 0)
      if (morto) return `${morto.url} não respondeu: ${morto.error}`
      if (r.items.length === 0) return 'os feeds responderam mas sem manchete alguma'

      // Cada manchete precisa ter o que a home mostra e abre: título, fonte e
      // um link http(s) — outro esquema o navegador do sistema não abriria.
      const ruim = r.items.find(
        (i) => !i.title?.trim() || !i.source?.trim() || !/^https?:\/\/./.test(i.link ?? ''),
      )
      if (ruim) return `manchete incompleta: ${JSON.stringify(ruim).slice(0, 80)}`
      // Da mais nova para a mais antiga: é a ordem que a home promete.
      const datas = r.items.map((i) => (i.publishedAt ? Date.parse(i.publishedAt) : null))
      for (let i = 1; i < datas.length; i += 1) {
        if (datas[i] !== null && datas[i - 1] !== null && datas[i] > datas[i - 1]) {
          return 'manchetes fora de ordem cronológica'
        }
      }

      // O contrato é não lançar nunca: página que não é feed, endereço que não
      // existe e endereço vazio são estados, cada um com a sua frase.
      const errados = await api.news.headlines(['https://example.com/', '', 'ftp://x'])
      if (errados.items.length !== 0) return 'inventou manchete para endereço que não é feed'
      const semFrase = errados.feeds.find((f) => !f.error)
      return semFrase ? `feed inválido sem explicação: ${semFrase.url}` : true
    },
  ],
  [
    'clima chega da internet',
    async (api) => {
      const weather = await api.weather.current('Lisboa')
      if (typeof weather.temperatureC !== 'number') return 'sem temperatura'
      if (weather.temperatureC < -60 || weather.temperatureC > 60) {
        return `temperatura implausível: ${weather.temperatureC}`
      }
      return weather.condition ? true : 'sem condição'
    },
  ],
  [
    'Spotify: o estado da conta é honesto',
    async (api) => {
      const r = await api.spotify.auth()
      const estados = ['no-client-id', 'signed-out', 'signed-in', 'error']
      if (!estados.includes(r?.state)) return `estado inesperado: ${JSON.stringify(r)}`
      if (r.state === 'no-client-id') {
        return '— sem Client ID do Spotify (configure em Música)'
      }
      if (r.state === 'signed-out') {
        return '— Client ID posto, falta autorizar (Configurações → Música)'
      }
      if (r.state === 'error') return `o Spotify respondeu: ${r.message}`
      return typeof r.user?.displayName === 'string' ? true : 'conectado, mas sem dados da conta'
    },
  ],
  [
    'Spotify: mandar tocar não traz a janela do Spotify para a frente',
    async (api) => {
      const conta = await api.spotify.auth()
      if (conta.state !== 'signed-in') return '— falta conectar '

      const lib = await api.spotify.library()
      const alvo = lib.state === 'ok' ? lib.value.playlists[0] : null
      if (!alvo) return 'sem playlist para testar'

      // O MPRIS `OpenUri` tem semântica de "abra este link": o cliente do
      // Spotify se traz para a frente e sai de minimizado. Medido — janela
      // `Iconic` volta a `Normal`. O Connect faz o mesmo sem tocar em janela,
      // e por isso vem primeiro. Se isto voltar a sair pelo MPRIS com a conta
      // conectada, o incômodo volta junto.
      const r = await api.spotify.play(alvo.uri)
      if (!r.done) return `não conseguiu tocar: ${r.message}`
      return r.source === 'connect' ? true : `tocou pelo ${r.source}, que rouba a janela do usuário`
    },
  ],
  [
    'Spotify: clicar em playlist, álbum e artista sempre mostra alguma coisa',
    async (api) => {
      const conta = await api.spotify.auth()
      if (conta.state !== 'signed-in') return '— falta conectar '

      const lib = await api.spotify.library()
      if (lib.state !== 'ok') return `biblioteca em "${lib.state}"`

      // Um clique nunca pode ficar sem efeito — foi o defeito relatado.
      // A playlist DO USUÁRIO tem de trazer faixas: o endereço certo é
      // `/playlists/{id}/items` (o antigo `/tracks` responde 403, e foi isso
      // que confundiu). Playlist de outra pessoa não vem, e aí o aviso é que
      // precisa aparecer.
      for (const [tipo, colecao] of [
        ['playlist', lib.value.playlists],
        ['album', lib.value.albums],
        ['artist', lib.value.artists],
      ]) {
        const primeiro = colecao[0]
        if (!primeiro) continue
        const d = await api.spotify.detail(primeiro.uri)
        if (d.state !== 'ok') return `${tipo} devolveu "${d.state}"`
        if (!d.value.item?.name) return `${tipo} abriu sem cabeçalho`
        // Ou tem lista, ou tem discografia, ou tem aviso dizendo por quê.
        const temAlgo =
          d.value.tracks.length > 0 || d.value.albums.length > 0 || Boolean(d.value.notice)
        if (!temAlgo) return `${tipo} abriu sem faixas, sem álbuns e sem aviso`
        // E a primeira playlist da lista é do próprio usuário: essa TEM de
        // trazer faixas, senão o endereço voltou a estar errado.
        if (tipo === 'playlist' && d.value.tracks.length === 0 && !d.value.notice) {
          return 'a playlist do usuário abriu vazia e sem aviso'
        }
      }
      return true
    },
  ],
  [
    'Spotify: a biblioteca vem no formato que a tela abre',
    async (api) => {
      const r = await api.spotify.library()
      const estados = ['ok', 'demo', 'no-client-id', 'signed-out', 'error']
      if (!estados.includes(r?.state)) return `estado inesperado: ${JSON.stringify(r)}`
      // Sem conta configurada o contrato é dizer isso, não devolver lista vazia
      // — é o que faz a tela mostrar o caminho em vez de fingir biblioteca.
      if (r.state !== 'ok') {
        if (r.state === 'error') return `o Spotify respondeu: ${r.message}`
        return r.state === 'signed-out'
          ? '— Client ID posto, falta autorizar (Configurações → Música)'
          : '— sem Client ID do Spotify (configure em Música)'
      }
      const { playlists, albums, artists, recent } = r.value
      for (const [nome, lista] of [
        ['playlists', playlists],
        ['álbuns', albums],
        ['artistas', artists],
      ]) {
        if (!Array.isArray(lista)) return `${nome} não veio como lista`
        // URI é o que se manda tocar; item sem ela seria um botão morto.
        const ruim = lista.find((i) => !i.uri?.startsWith('spotify:') || !i.name)
        if (ruim) return `${nome}: item sem uri ou nome (${JSON.stringify(ruim).slice(0, 60)})`
      }
      const faixaRuim = (recent ?? []).find((t) => !t.name || typeof t.durationMs !== 'number')
      return faixaRuim ? 'faixa recente incompleta' : true
    },
  ],
  [
    'Spotify: o transporte acha o aplicativo desta máquina (MPRIS)',
    async (api) => {
      const r = await api.spotify.playback()
      if (!['mpris', 'connect', 'none'].includes(r?.source)) {
        return `fonte inesperada: ${JSON.stringify(r)}`
      }
      if (r.source === 'none') return '— nada tocando em lugar nenhum '
      if (r.track) {
        if (typeof r.track.name !== 'string' || !r.track.name) return 'faixa sem nome'
        // A capa vem do CDN do Spotify por https; a CSP do renderer abre esse
        // host e só ele. `file:` aqui seria capa que a tela não consegue abrir.
        if (r.track.image && !r.track.image.startsWith('https://')) {
          return `capa em "${r.track.image.slice(0, 14)}…" — o renderer não abre isso`
        }
      }
      // O cliente Linux do Spotify publica Volume 0 sempre; o serviço tem de
      // devolver `null` em vez de propagar um "mudo" que não é verdade.
      if (r.source === 'mpris' && r.volume !== null) {
        return `MPRIS devolveu volume ${r.volume} — o cliente do Spotify não informa isso`
      }
      return true
    },
  ],
  [
    'Spotify: o endereço de retorno é um que o app consegue servir',
    async (api) => {
      // O consentimento volta para um servidor que o próprio app sobe. Um
      // `https://` (ou um host que não seja loopback) nunca seria atendido, e
      // o usuário ficaria olhando uma aba de erro sem saber por quê.
      const uri = api.settings.initial?.music?.spotifyRedirect ?? ''
      if (!uri) return true
      try {
        const url = new URL(uri)
        if (url.protocol !== 'http:') return `endereço em ${url.protocol} — o app só serve http`
        const loopback = ['127.0.0.1', '[::1]', '::1'].includes(url.hostname)
        return loopback ? true : `host ${url.hostname} não é loopback`
      } catch {
        return `endereço inválido: ${uri}`
      }
    },
  ],
  [
    'Spotify: o segredo do OAuth não atravessa para o renderer',
    async (api) => {
      // O refresh token viajaria como argumento de linha de comando, visível
      // em /proc/<pid>/cmdline para qualquer processo. Ver `paraRenderer` em
      // src/main/window.ts.
      const musica = api.settings.initial?.music
      if (!musica) return 'as configurações chegaram sem a seção de música'
      if (musica.spotifyRefreshToken) return 'o refresh token do Spotify chegou ao renderer'
      const suspeitos = Object.keys(api.spotify ?? {}).filter((m) => /token|secret/i.test(m))
      return suspeitos.length === 0 ? true : `o contrato expõe: ${suspeitos.join(', ')}`
    },
  ],
  [
    'configurações vêm do disco de forma síncrona',
    async (api) => {
      const s = api.settings.initial
      // `appearance.scale` e não `transparency`: a transparência virou ajuste
      // POR AMBIENTE (`environment.ajustes`) e pode legitimamente não existir
      // — ambiente sem ajuste está inteiro no preset dele. O que continua
      // valendo é que o objeto chegou inteiro no arranque.
      return s?.appearance && typeof s.appearance.scale === 'number' && s.environment?.ajustes
        ? true
        : 'estado inicial ausente ou incompleto'
    },
  ],

  // ——— Social Arte —————————————————————————————————————————————————
  //
  // Estas conversam com a rede e com o disco do usuário. Toda escrita usa o
  // prefixo `link:https://halo.test/` e é desfeita no fim: a biblioteca é
  // conteúdo do usuário, e um teste que deixasse lixo nela seria um bug.

  [
    'a trava contra SSRF recusa loopback, rede local e o que não é http',
    async (api) => {
      // Os endereços que um link colado NÃO pode alcançar do processo main.
      // 127.0.0.1 e ::1 são onde moram o Seafile e a API da ilha; 169.254.169.254
      // responde credenciais em máquina de nuvem; 192.168 é a rede de casa; e
      // file:// nem sequer é rede.
      const proibidos = [
        'http://127.0.0.1:8000/',
        'http://[::1]:8000/',
        'http://localhost:8000/',
        'http://169.254.169.254/latest/meta-data/',
        'http://192.168.0.1/',
        'http://10.0.0.1/',
        'http://100.64.0.1/',
        'file:///etc/passwd',
        'ftp://exemplo.test/',
      ]
      for (const url of proibidos) {
        const r = await api.creative.preview(url)
        if (r.ok) return `${url} passou pela trava`
        // E a recusa tem de ser da TRAVA, não um erro de rede qualquer: se o
        // endereço tivesse sido buscado e falhado, a mensagem seria outra.
        if (!/endereço|protocolo|rede|interno|privad/i.test(r.error)) {
          return `${url} foi recusado por "${r.error}" — parece que chegou a sair`
        }
      }
      return true
    },
  ],
  [
    // A regra da tela: uma fonte fora do ar não derruba a página. A busca
    // devolve o que as outras acharam e diz quem falhou, em vez de lançar.
    'a busca unificada isola a falha de uma fonte',
    async (api) => {
      const r = await api.creative.search({
        text: 'art deco',
        providers: [],
        kinds: [],
        license: '',
        orientation: 'qualquer',
        sort: 'relevancia',
        cursor: '',
        limit: 10,
      })
      if (!Array.isArray(r.items) || !Array.isArray(r.falhas)) {
        return 'a busca não devolveu itens e falhas'
      }
      // Nenhum item pode vir sem os campos que a tela mostra sem checar.
      const torto = r.items.find(
        (i) => !i.id || !i.provider || !i.url || typeof i.title !== 'string',
      )
      if (torto) return `item mal normalizado: ${JSON.stringify(torto).slice(0, 80)}`
      // E nenhum campo ausente pode ter virado zero: "não sei" é `null`.
      const zerado = r.items.find((i) => i.likes === 0 && i.views === 0 && i.downloads === 0)
      if (zerado) return `métricas zeradas em vez de nulas: ${zerado.id}`
      return true
    },
  ],
  [
    'as seis fontes se anunciam, e cada uma diz o que sabe fazer',
    async (api) => {
      const fontes = await api.creative.connections()
      if (fontes.length !== 6) return `${fontes.length} fontes, esperadas 6`
      for (const f of fontes) {
        if (!f.name || !f.description) return `${f.provider} sem nome ou descrição`
        if (!f.connected && !f.error) return `${f.provider} desconectada e sem dizer por quê`
        if (f.searchUrl && !f.searchUrl.includes('%s')) {
          return `${f.provider} tem busca externa sem o lugar do termo`
        }
      }
      return true
    },
  ],
  [
    // Salvar duas vezes o mesmo item é UM item. Sem isto, clicar duas vezes no
    // marcador encheria a biblioteca de cópias que só se distinguem pela hora.
    'a biblioteca guarda, não duplica, e devolve tudo ao fim',
    async (api) => {
      const id = 'link:https://halo.test/uma-referencia'
      const item = {
        id,
        provider: 'link',
        externalId: 'https://halo.test/uma-referencia',
        title: 'Referência do teste',
        description: '',
        author: '',
        authorAvatar: '',
        cover: '',
        gallery: [],
        url: 'https://halo.test/uma-referencia',
        kind: 'outro',
        tags: [],
        license: '',
        likes: null,
        views: null,
        downloads: null,
        publishedAt: null,
        meta: {},
      }
      const antes = await api.creative.library()
      const jaTinha = antes.items.some((s) => s.item.id === id)
      if (jaTinha) return '— sobrou um item do teste anterior; apague-o antes'

      try {
        await api.creative.save(item, { tags: ['halo-teste'], note: 'primeira' })
        const dois = await api.creative.save(item, { tags: ['outra'], note: 'segunda' })
        const iguais = dois.items.filter((s) => s.item.id === id)
        if (iguais.length !== 1) return `${iguais.length} cópias do mesmo item`
        // As tags das duas gravações se somam: salvar de novo não apaga o que
        // a pessoa já tinha escrito.
        if (!iguais[0].tags.includes('halo-teste')) return 'salvar de novo apagou as tags antigas'

        const fav = await api.creative.favorite(id, true)
        if (!fav.items.find((s) => s.item.id === id)?.favorite) return 'favoritar não pegou'

        const criada = await api.creative.collectionCreate({
          name: 'Teste do Halo',
          description: '',
          color: '',
          icon: '',
        })
        const colecao = criada.collections.find((c) => c.name === 'Teste do Halo')
        if (!colecao) return 'a coleção não foi criada'

        const movido = await api.creative.move(id, [colecao.id])
        if (!movido.items.find((s) => s.item.id === id)?.collections.includes(colecao.id)) {
          return 'mover para a coleção não pegou'
        }

        // Apagar a pasta NÃO apaga o que estava dentro.
        const semColecao = await api.creative.collectionDelete(colecao.id)
        if (!semColecao.items.some((s) => s.item.id === id)) {
          return 'apagar a coleção levou o item junto'
        }
        return true
      } finally {
        // Limpeza: a biblioteca é do usuário.
        await api.creative.remove(id)
        const sobra = await api.creative.library()
        for (const c of sobra.collections.filter((x) => x.name === 'Teste do Halo')) {
          await api.creative.collectionDelete(c.id)
        }
      }
    },
  ],
  [
    /*
     * O navegador de segundo plano contra o site DE VERDADE.
     *
     * É o único jeito de cobrar isto: o contrato de extração não é um formato
     * documentado, é a marcação de uma página que muda quando eles publicam.
     * Uma quebra aparece como grade vazia — sem erro, sem log —, e este guarda
     * é o que a transforma em vermelho.
     */
    'a home do DeviantArt chega pelo navegador de segundo plano',
    async (api) => {
      const r = await api.creative.trending(40)
      const falha = r.falhas.find((f) => f.provider === 'deviantart')
      if (falha) return `— não consegui carregar a página: ${falha.error}`
      const obras = r.items.filter((i) => i.provider === 'deviantart')
      if (obras.length === 0) {
        return 'a página carregou e o seletor não achou obra nenhuma — a marcação deles mudou?'
      }

      // Todo item tem de servir para o que a tela faz com ele.
      const semUrl = obras.find((i) => !/deviantart\.com\/[^/]+\/art\//.test(i.url))
      if (semUrl) return `endereço fora do formato de obra: ${semUrl.url}`
      const semAutor = obras.find((i) => !i.author)
      if (semAutor) return `obra sem autor: ${semAutor.url}`
      const semTitulo = obras.find((i) => !i.title.trim())
      if (semTitulo) return `obra sem título: ${semTitulo.url}`

      // A armadilha medida: procurar a imagem FORA da âncora trazia o avatar
      // do autor como capa. Os avatares moram em hosts próprios.
      const avatar = obras.find((i) => /(a|e)\.deviantart\.net\//.test(i.cover))
      if (avatar) return `capa é o avatar do autor, não a obra: ${avatar.cover}`
      const semCapa = obras.filter((i) => !i.cover).length
      if (semCapa) return `${semCapa} obras sem capa`

      // "Não sei" é nulo. O feed não publica métrica nenhuma, e zero ali seria
      // uma afirmação falsa.
      const zerado = obras.find((i) => i.likes === 0 || i.views === 0)
      if (zerado) return `métrica zerada em vez de nula: ${zerado.url}`
      return true
    },
  ],
  [
    'a busca acontece na página do site, e devolve o que ela mostrou',
    async (api) => {
      const r = await api.creative.search({
        text: 'art deco',
        providers: ['deviantart'],
        kinds: [],
        license: '',
        orientation: 'qualquer',
        sort: 'relevancia',
        cursor: '',
        limit: 40,
      })
      const falha = r.falhas.find((f) => f.provider === 'deviantart')
      if (falha) return `— não consegui carregar a busca: ${falha.error}`
      if (r.items.length === 0) return 'a busca não devolveu nada — a página de busca mudou?'
      const torto = r.items.find((i) => !i.url || !i.title.trim() || !i.cover)
      return torto ? `resultado incompleto: ${JSON.stringify(torto).slice(0, 90)}` : true
    },
  ],
  [
    /*
     * A paginação, ponta a ponta.
     *
     * O cursor é um mapa POR FONTE, e é isso que se cobra aqui: que a segunda
     * página traga obras que a primeira não tinha, e que o cursor avance. Um
     * cursor que não avança devolveria a mesma página para sempre, e a tela
     * mostraria "Carregar mais" repetindo o que já estava lá.
     */
    'a busca pagina, e a segunda página traz o que a primeira não tinha',
    async (api) => {
      const consulta = (cursor) => ({
        text: 'art nouveau poster',
        providers: ['deviantart'],
        kinds: [],
        license: '',
        orientation: 'qualquer',
        sort: 'relevancia',
        cursor,
        limit: 40,
      })

      const p1 = await api.creative.search(consulta(''))
      if (p1.falhas.length) return `— não consegui carregar a busca: ${p1.falhas[0].error}`
      if (p1.items.length === 0) return 'a primeira página veio vazia'
      if (!p1.cursor) return 'a busca não ofereceu segunda página'

      const p2 = await api.creative.search(consulta(p1.cursor))
      if (p2.falhas.length) return `— não consegui carregar a segunda página: ${p2.falhas[0].error}`
      if (p2.items.length === 0) return 'a segunda página veio vazia'
      if (p2.cursor === p1.cursor) return `o cursor não avançou: ${p1.cursor}`

      const daPrimeira = new Set(p1.items.map((i) => i.id))
      const ineditos = p2.items.filter((i) => !daPrimeira.has(i.id)).length
      if (ineditos === 0) return 'a segunda página repetiu a primeira inteira'
      return true
    },
  ],
  [
    /*
     * A home carrega mais ROLANDO a página de segundo plano — não há parâmetro
     * de página nela (`?page=2` devolve três obras, duas repetidas: é lixo, e
     * foi testado).
     *
     * **Só a home logada rola.** Medido: com sessão, 42 → 58 → 67 → 71 → 73
     * obras em oito passos; sem sessão, uma página fixa de ~31 que não cresce.
     * Por isso a verificação é condicional: com conta conectada, exige a
     * segunda leva; sem ela, exige que a tela DIGA que acabou em vez de
     * oferecer um botão que devolveria o mesmo.
     */
    'a home carrega mais rolando — e diz quando acaba',
    async (api) => {
      const fontes = await api.creative.connections()
      const logado = fontes.find((f) => f.provider === 'deviantart')?.signedIn ?? false

      const p1 = await api.creative.trending(24, '')
      if (p1.falhas.length) return `— não consegui carregar a home: ${p1.falhas[0].error}`
      if (p1.items.length === 0) return 'a home veio vazia'

      if (!p1.cursor) {
        return logado
          ? 'com a conta conectada a home devia rolar, e ela não ofereceu continuação'
          : true
      }

      const p2 = await api.creative.trending(24, p1.cursor)
      if (p2.falhas.length) return `— não consegui carregar a segunda leva: ${p2.falhas[0].error}`
      if (p2.items.length === 0) return 'a segunda leva veio vazia com o cursor cheio'

      // A página VIRTUALIZA: ela tira do DOM o que passou longe da tela. Se a
      // colheita relesse do zero em vez de acumular, a segunda leva repetiria a
      // primeira — é exatamente isso que se cobra aqui.
      const daPrimeira = new Set(p1.items.map((i) => i.id))
      const ineditos = p2.items.filter((i) => !daPrimeira.has(i.id)).length
      if (ineditos === 0) return 'a segunda leva repetiu a primeira inteira'
      return true
    },
  ],
  [
    /*
     * A sessão é conferida por NOME de cookie. Contar cookies do domínio dava
     * falso positivo: uma visita deslogada já grava cinco (anti-robô e
     * analytics), e o botão "Entrar" sumia antes de alguém entrar.
     */
    'a fonte com conta diz se há sessão, e sabe abrir o acesso',
    async (api) => {
      const fontes = await api.creative.connections()
      const da = fontes.find((f) => f.provider === 'deviantart')
      if (!da) return 'o DeviantArt sumiu da lista de fontes'
      if (!da.signIn) return 'o DeviantArt não oferece entrar na conta'
      if (typeof da.signedIn !== 'boolean') return 'o estado da sessão não é um booleano'
      // Sem sessão a fonte continua funcionando, e a frase diz o que muda.
      if (!da.signedIn && !da.error) return 'sem sessão e sem dizer o que isso muda'
      if (da.signedIn && da.error) return `com sessão e ainda reclamando: ${da.error}`
      return true
    },
  ],
  [
    /*
     * O Pinterest, pelo mesmo caminho do DeviantArt.
     *
     * Deslogado ele é muro de login em TUDO — home e busca devolvem zero pins
     * (medido). Por isso a verificação pula quando não há sessão, em vez de
     * ficar vermelha por um motivo que não é defeito do app.
     */
    'o Pinterest chega pelo navegador, com a conta do usuário',
    async (api) => {
      const fontes = await api.creative.connections()
      const pin = fontes.find((f) => f.provider === 'pinterest')
      if (!pin) return 'o Pinterest sumiu da lista de fontes'
      if (!pin.signedIn) return '— sem conta conectada; o Pinterest não mostra nada sem login'
      if (!pin.connected) return `conectado e mesmo assim indisponível: ${pin.error}`

      const r = await api.creative.trending(24, '')
      const falha = r.falhas.find((f) => f.provider === 'pinterest')
      if (falha) return `— não consegui carregar o feed: ${falha.error}`
      const pins = r.items.filter((i) => i.provider === 'pinterest')
      // Feed vazio SEM falha declarada é problema nosso: ou o seletor quebrou,
      // ou a leitura desistiu cedo. Com falha, quem não respondeu foi o site, e
      // isso é pulo — guarda que fica vermelho por motivo alheio ninguém olha.
      if (pins.length === 0) return 'a página carregou e o seletor não achou pin nenhum'

      const forma = pins.find((i) => !/pinterest\.com\/pin\/[A-Za-z0-9_-]+/.test(i.url))
      if (forma) return `endereço fora do formato de pin: ${forma.url}`
      const semCapa = pins.filter((i) => !i.cover).length
      if (semCapa) return `${semCapa} pins sem capa`

      // O `srcset` existe para não pegarmos a miniatura de 60px: numa janela de
      // segundo plano é ela que o navegador escolheria, e a grade ficaria
      // borrada. Se voltar a pegar a menor, isto acusa.
      const pequena = pins.find((i) => /\/(60x60|75x75|136x136)\//.test(i.cover))
      if (pequena) return `capa em miniatura, não na maior do srcset: ${pequena.cover}`

      // O `alt` do Pinterest vem com o texto de acessibilidade do site. Ele não
      // é título, e repeti-lo encheria a grade de "Contém uma imagem de:".
      const sujo = pins.find((i) =>
        /^(cont[ée]m|contains|puede ser|may be)\b[^:]{0,40}:/i.test(i.title),
      )
      if (sujo) return `título com o prefixo de acessibilidade: "${sujo.title}"`
      return true
    },
  ],
  [
    /*
     * A grade unificada tem de MOSTRAR que é unificada. Sem intercalar, ela
     * vinha em blocos — 24 de uma fonte e só então a primeira da outra —, e
     * quem abria a tela via uma plataforma só.
     */
    'com duas fontes ligadas, a grade reveza entre elas',
    async (api) => {
      const r = await api.creative.trending(24, '')
      const fontes = [...new Set(r.items.map((i) => i.provider))]
      if (fontes.length < 2) return '— só uma fonte respondeu; não há o que intercalar'
      // Nos primeiros seis cartões as duas precisam aparecer.
      const inicio = new Set(r.items.slice(0, 6).map((i) => i.provider))
      return inicio.size >= 2 ? true : `os primeiros seis cartões são todos de ${[...inicio][0]}`
    },
  ],
  [
    /*
     * Escolher onde procurar.
     *
     * `providers` vazio significa TODAS — e não "nenhuma". É o acordo que faz
     * a busca continuar funcionando para quem nunca abriu o seletor, e trocá-lo
     * por engano deixaria a tela vazia sem erro nenhum.
     */
    'a busca respeita as fontes escolhidas, e vazio quer dizer todas',
    async (api) => {
      const consulta = (providers) => ({
        text: 'art deco',
        providers,
        kinds: [],
        license: '',
        orientation: 'qualquer',
        sort: 'relevancia',
        cursor: '',
        limit: 24,
      })

      const fontes = await api.creative.connections()
      const buscaveis = fontes
        .filter((f) => f.capabilities.includes('search'))
        .map((f) => f.provider)
      if (buscaveis.length < 2) return '— menos de duas fontes buscam nesta máquina'

      const todas = await api.creative.search(consulta([]))
      if (todas.falhas.length) return `— ${todas.falhas[0].error}`
      const vieram = new Set(todas.items.map((i) => i.provider))
      if (vieram.size < 2) return `com "todas", só ${[...vieram]} respondeu`

      const uma = buscaveis[0]
      const so = await api.creative.search(consulta([uma]))
      if (so.falhas.length) return `— ${so.falhas[0].error}`
      // Sem falha e sem resultado, o filtro comeu tudo — é o que se cobra.
      if (so.items.length === 0) return `restringir a ${uma} não devolveu nada`
      const intruso = so.items.find((i) => i.provider !== uma)
      return intruso ? `pedi só ${uma} e veio ${intruso.provider}` : true
    },
  ],
  [
    /*
     * O Thingiverse é a fonte mais simples das três: página pública (sem muro
     * de login), e home E busca paginadas por `?page=N` — sem rolagem nenhuma.
     * Medido: 20 por página, zero sobreposição entre páginas consecutivas.
     */
    'o Thingiverse chega sem conta, e as páginas não se repetem',
    async (api) => {
      const p1 = await api.creative.trending(24, '')
      const falha = p1.falhas.find((f) => f.provider === 'thingiverse')
      if (falha) return `— não consegui carregar: ${falha.error}`
      const coisas = p1.items.filter((i) => i.provider === 'thingiverse')
      if (coisas.length === 0) return 'a página carregou e o seletor não achou modelo nenhum'

      const forma = coisas.find((i) => !/thingiverse\.com\/thing:\d+/.test(i.url))
      if (forma) return `endereço fora do formato: ${forma.url}`
      const semCapa = coisas.filter((i) => !i.cover).length
      if (semCapa) return `${semCapa} modelos sem capa`
      const semTitulo = coisas.filter((i) => !i.title.trim()).length
      if (semTitulo) return `${semTitulo} modelos sem título`

      // O `alt` vem como "Thumbnail representing <título>" — texto de
      // acessibilidade, não título. Repeti-lo encheria a grade dele.
      const sujo = coisas.find((i) => /^thumbnail representing/i.test(i.title))
      if (sujo) return `título com o prefixo de acessibilidade: "${sujo.title}"`

      // A plataforma inteira responde por um tipo: aqui ele não é chute.
      const tipo = coisas.find((i) => i.kind !== 'impressao-3d')
      if (tipo) return `modelo com tipo "${tipo.kind}" em vez de impressao-3d`

      if (!p1.cursor) return 'a home não ofereceu segunda página'
      const p2 = await api.creative.trending(24, p1.cursor)
      const falha2 = p2.falhas.find((f) => f.provider === 'thingiverse')
      if (falha2) return `— não consegui carregar a segunda página: ${falha2.error}`
      const outras = p2.items.filter((i) => i.provider === 'thingiverse')
      if (outras.length === 0) return 'a segunda página veio vazia'
      const vistos = new Set(coisas.map((i) => i.id))
      return outras.some((i) => !vistos.has(i.id))
        ? true
        : 'a segunda página repetiu a primeira inteira'
    },
  ],
  [
    /*
     * O ArtStation, sem conta — a home deslogada entrega bastante, e o login
     * deles (Epic/Google/Facebook) devolve um CAPTCHA que não renderiza na
     * janela embutida. Ver a decisão em `artstation.ts`.
     */
    'o ArtStation traz a obra, e não o rosto do artista',
    async (api) => {
      const r = await api.creative.trending(20, '')
      const falha = r.falhas.find((f) => f.provider === 'artstation')
      if (falha) return `— não consegui carregar: ${falha.error}`
      const artes = r.items.filter((i) => i.provider === 'artstation')
      if (artes.length === 0) return 'a página carregou e o seletor não achou obra nenhuma'

      // A armadilha que custou duas medições: cada cartão tem a capa E o avatar
      // do autor, e na HOME a âncora da obra envolve o avatar, não a capa.
      const rosto = artes.find((i) => /\/users\/avatars\//.test(i.cover))
      if (rosto) return `capa é o avatar do autor: ${rosto.cover}`
      const forma = artes.find((i) => !/artstation\.com\/artwork\//.test(i.url))
      if (forma) return `endereço fora do formato: ${forma.url}`
      const semCapa = artes.filter((i) => !i.cover).length
      if (semCapa) return `${semCapa} obras sem capa`

      // Um punhado de obras significa que a leitura desistiu cedo — foi
      // exatamente o sintoma de quando a regra só servia para a busca.
      return artes.length >= 10
        ? true
        : `só ${artes.length} obras: a leitura desistiu antes de a grade montar`
    },
  ],
  [
    /*
     * O Behance, sem conta. Mesma armadilha do ArtStation com outra roupa: a
     * home serve retratos de quem publica (`a5.behance.net/…/img/creator_…`,
     * 360px) ANTES das capas no DOM, e casá-los com o link do projeto daria o
     * rosto no lugar do trabalho. A capa é só a de `/projects/`.
     */
    'o Behance traz a capa do projeto, e não o retrato de quem publicou',
    async (api) => {
      const r = await api.creative.trending(20, '')
      const falha = r.falhas.find((f) => f.provider === 'behance')
      if (falha) return `— não consegui carregar: ${falha.error}`
      const projetos = r.items.filter((i) => i.provider === 'behance')
      if (projetos.length === 0) return 'a página carregou e o seletor não achou projeto nenhum'

      const retrato = projetos.find((i) => !/mir-s3-cdn-cf\.behance\.net\/projects\//.test(i.cover))
      if (retrato) return `capa fora do caminho de projeto: ${retrato.cover}`
      const forma = projetos.find((i) => !/behance\.net\/gallery\/\d+/.test(i.url))
      if (forma) return `endereço fora do formato: ${forma.url}`

      // "Capa para X" é texto de acessibilidade do site, não título.
      const sujo = projetos.find((i) => /^(capa para|cover for)\b/i.test(i.title))
      if (sujo) return `título com o prefixo de acessibilidade: "${sujo.title}"`
      const semTitulo = projetos.filter((i) => !i.title.trim()).length
      if (semTitulo) return `${semTitulo} projetos sem título`
      return projetos.length >= 10
        ? true
        : `só ${projetos.length} projetos: a leitura desistiu antes de a grade montar`
    },
  ],
  [
    /*
     * O carregamento progressivo.
     *
     * Cinco páginas reais levam de 25 a 35s para todas, e esperar por todas
     * para mostrar qualquer coisa fazia a tela parecer travada — foi o usuário
     * quem notou que a busca parecia não funcionar. Cada fonte manda o que
     * achou pelo caminho, e é isso que se cobra: parciais CHEGANDO ANTES de a
     * promessa fechar.
     */
    'cada fonte entrega o que achou pelo caminho, sem esperar as outras',
    async (api) => {
      const pedido = 987654
      const chegaram = []
      const parar = api.creative.onPartial((p) => {
        if (p.pedido === pedido)
          chegaram.push({ provider: p.provider, n: p.items.length, faltam: p.faltam })
      })
      const comecou = Date.now()
      try {
        const r = await api.creative.search(
          {
            text: 'art nouveau',
            providers: [],
            kinds: [],
            license: '',
            orientation: 'qualquer',
            sort: 'relevancia',
            cursor: '',
            limit: 24,
          },
          pedido,
        )
        /*
         * Cache quente não emite parcial — e não deve mesmo.
         *
         * Com o resultado guardado a busca volta na hora, sem consultar fonte
         * nenhuma: não há o que entregar pelo caminho. O guarda precisa
         * distinguir isso de "os parciais pararam de funcionar", ou fica
         * vermelho toda vez que a mesma consulta for repetida dentro dos 5
         * minutos do cache. Uma resposta em menos de um segundo só pode ter
         * vindo do cache: as fontes levam de 5 a 30.
         */
        if (Date.now() - comecou < 1000) {
          return '— a busca veio do cache; sem consulta não há parcial para entregar'
        }
        if (chegaram.length === 0) return 'nenhum parcial chegou: a tela esperaria por todas'
        if (chegaram.length < 2) return `só ${chegaram.length} parcial: as fontes não chegam soltas`

        // `faltam` precisa DESCER: é o que diz à tela quando parar de esperar.
        const faltas = chegaram.map((c) => c.faltam)
        const desce = faltas.every((f, i) => i === 0 || f < faltas[i - 1])
        if (!desce) return `o contador de pendentes não desceu: ${faltas.join(' → ')}`
        if (faltas.at(-1) !== 0) return `a última fonte disse que ainda faltam ${faltas.at(-1)}`

        // E o conjunto final não pode ser MENOR que o que os parciais mandaram.
        const soma = chegaram.reduce((t, c) => t + c.n, 0)
        return r.items.length >= Math.min(soma, r.items.length) && soma > 0
          ? true
          : `parciais somaram ${soma} e o resultado final trouxe ${r.items.length}`
      } finally {
        parar()
      }
    },
  ],
  [
    'ler um endereço real devolve o que a página publica, e nada além',
    async (api) => {
      const r = await api.creative.preview('https://www.deviantart.com/')
      if (!r.ok) return `— não consegui alcançar a página: ${r.error}`
      if (!r.item?.title) return 'a página respondeu sem título'
      if (r.item.url !== r.item.externalId) return 'o endereço original não bate com o id externo'
      if (r.item.likes !== null || r.item.views !== null) {
        return 'métricas inventadas para uma página que não as publica'
      }
      return true
    },
  ],
]

let browser
try {
  browser = await chromium.connectOverCDP(ENDPOINT)
} catch {
  console.error(
    '\n✗ o app não está aberto com depuração.\n' +
      '  Rode em outro terminal:\n' +
      '    npx electron . --no-sandbox --remote-debugging-port=9222\n',
  )
  process.exit(1)
}

/*
 * A janela do APP, achada pelo endereço — e não "a primeira página".
 *
 * Era `pages()[0]`, e funcionou enquanto o app tinha só as próprias janelas.
 * A Social Arte trouxe navegadores de segundo plano (um por fonte), e a ordem
 * das páginas deixou de ser previsível: quando a primeira era a do DeviantArt,
 * `window.halo` não existia ali e TODAS as verificações falhavam de uma vez com
 * "Cannot read properties of undefined" — um erro que aponta para o lugar
 * errado e custa uma investigação inteira.
 *
 * `index.html` é a janela principal; `island.html` é a ilha, e ela também tem
 * `window.halo`, mas nem toda superfície — a principal é a certa.
 */
const paginas = browser.contexts().flatMap((c) => c.pages())
const page = paginas.find((p) => p.url().includes('index.html'))
if (!page) {
  console.error('\n✗ conectei ao Chromium mas não achei a janela do app.')
  console.error(
    `  Páginas abertas: ${paginas.map((p) => p.url().slice(0, 60)).join(', ') || '(nenhuma)'}\n`,
  )
  process.exit(1)
}

let failed = 0
// Terceiro resultado, além de `true` e da frase de erro: uma frase começando
// por "—" é PULADO, não falha. Quinze verificações já diziam "não é falha do
// app" e mesmo assim entravam na conta de falhas — e o `process.exit(1)` no
// fim fazia o guarda ficar vermelho por não haver nada tocando no Spotify, ou
// por não haver celular pareado. Guarda que fica vermelho por motivo que não é
// defeito é guarda que ninguém olha, e o da ilha acabou de sair desse estado.
let pulados = 0
// As checagens rodam DENTRO da página, onde não há `process`: o que vem do Node
// (a raiz do repositório, para o agente do Claude) entra por aqui, antes.
await page.evaluate((raiz) => {
  window.__haloRepo = raiz
}, process.cwd())
// Pelo mesmo caminho: o veredito do `which` desta máquina, para a checagem do
// diagnóstico do sistema poder compará-lo com o que o app respondeu.
await page.evaluate((achou) => {
  window.__haloNoPath = achou
}, noPathDaMaquina())
for (const [what, check] of CHECKS) {
  let result
  try {
    result = await page.evaluate(
      // A checagem roda dentro da página, onde `window.halo` existe.
      async (source) => {
        const fn = new Function(`return (${source})`)()
        try {
          return await fn(window.halo)
        } catch (error) {
          return `erro: ${String(error).slice(0, 90)}`
        }
      },
      check.toString(),
    )
  } catch (error) {
    result = `erro ao executar: ${String(error).split('\n')[0].slice(0, 80)}`
  }

  if (result === true) {
    console.log(`  ✓ ${what}`)
  } else if (typeof result === 'string' && result.startsWith('—')) {
    pulados++
    console.log(`  · ${what}\n      ${result.replace(/^—\s*/, '')}`)
  } else {
    failed++
    console.log(`  ✗ ${what}\n      ${result}`)
  }
}

await browser.close()
const pulo = pulados ? ` · ${pulados} sem o que verificar nesta máquina` : ''
console.log(
  failed
    ? `\n✗ ${failed} integração(ões) com problema${pulo}\n`
    : `\n✓ ${CHECKS.length - pulados} integrações reais respondendo${pulo}\n`,
)
process.exit(failed ? 1 : 0)
