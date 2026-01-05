import type {
  CreativeCollection,
  CreativeConnection,
  CreativeItem,
  CreativeLibrary,
  CreativePartial,
  CreativePreview,
  CreativeProviderId,
  CreativeQuery,
  CreativeSearchResult,
} from '@shared/creative'
import { useCallback, useEffect, useRef, useState } from 'react'
import { repositories } from '@/data'
import type { Async } from './useAsync'

/**
 * O estado de cada fonte, para a área "Fontes conectadas".
 *
 * `entrar` abre a página de acesso DA PLATAFORMA numa janela do sistema — o
 * app não desenha campo de senha. Voltar de lá muda o estado da fonte, e por
 * isso as duas ações recarregam a lista.
 */
export function useCreativeConnections() {
  const [data, setData] = useState<CreativeConnection[] | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const recarregar = useCallback(() => {
    repositories.creative.connections().then(setData).catch(setError)
  }, [])
  useEffect(recarregar, [recarregar])

  return {
    data,
    error,
    recarregar,
    entrar: (id: CreativeProviderId) => void repositories.creative.signIn(id),
    sair: (id: CreativeProviderId) => void repositories.creative.signOut(id).then(recarregar),
  }
}

/**
 * A busca unificada, com o cuidado que uma busca por digitação exige.
 *
 * Três coisas que ela faz e uma busca ingênua não faria:
 *
 * - **Debounce.** Cada tecla dispararia uma consulta a todas as fontes; 350ms
 *   é o intervalo em que uma pessoa termina de digitar uma palavra.
 * - **Cancelamento.** A resposta de uma busca antiga não pode sobrescrever a
 *   de uma nova — é a corrida clássica, e ela aparece como resultado que
 *   "volta" enquanto se digita. O contador `pedido` descarta o que chegou
 *   fora de ordem.
 * - **Não busca vazio.** Sem texto e sem filtro não há o que perguntar às
 *   fontes, e perguntar seria gastar cota para receber nada.
 */
export function useCreativeSearch(query: CreativeQuery): Async<CreativeSearchResult> & {
  buscando: boolean
  /** Carregando a PRÓXIMA página — a grade já tem o que mostrar. */
  carregandoMais: boolean
  /** Há mais para carregar? É o cursor, sem a tela precisar entendê-lo. */
  temMais: boolean
  carregarMais: () => void
} {
  const [estado, setEstado] = useState<Async<CreativeSearchResult>>({
    data: null,
    loading: false,
    error: null,
  })
  const [buscando, setBuscando] = useState(false)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const pedido = useRef(0)
  const [pedidoAtual, setPedidoAtual] = useState(0)
  const chave = JSON.stringify(query)

  useParciais(pedidoAtual, (parcial) => {
    setEstado((e) => ({
      data: {
        items: juntar(e.data?.items ?? [], parcial.items),
        cursor: e.data?.cursor ?? '',
        falhas: parcial.error
          ? [...(e.data?.falhas ?? []), { provider: parcial.provider, error: parcial.error }]
          : (e.data?.falhas ?? []),
      },
      loading: false,
      error: null,
    }))
    // A primeira fonte que responde já tira o esqueleto: a grade passa a
    // encher em vez de ficar 30s parecendo travada.
    setBuscando(false)
  })

  useEffect(() => {
    const q = JSON.parse(chave) as CreativeQuery
    if (!q.text.trim() && q.kinds.length === 0) {
      setEstado({ data: null, loading: false, error: null })
      setBuscando(false)
      return
    }

    const meu = ++pedido.current
    setBuscando(true)
    // Consulta nova zera a grade: misturar com a anterior mostraria resultado
    // de outra coisa enquanto esta viaja.
    setEstado({ data: null, loading: false, error: null })
    const timer = setTimeout(() => {
      setPedidoAtual(meu)
      // Busca nova sempre começa do princípio: o cursor de uma consulta não
      // vale para outra.
      repositories.creative
        .search({ ...q, cursor: '' }, meu)
        .then((data) => {
          // Chegou uma busca mais nova enquanto esta viajava: descarta.
          if (meu !== pedido.current) return
          setEstado({ data, loading: false, error: null })
          setBuscando(false)
        })
        .catch((error: Error) => {
          if (meu !== pedido.current) return
          setEstado({ data: null, loading: false, error })
          setBuscando(false)
        })
    }, 350)

    return () => clearTimeout(timer)
  }, [chave])

  /**
   * A próxima página, ACRESCENTADA ao que já está na tela.
   *
   * O `pedido` é o mesmo contador da busca: se o usuário digitar enquanto a
   * página seguinte viaja, ela é descartada em vez de aparecer colada no
   * resultado de outra consulta.
   *
   * A junção descarta repetidos por `id` — duas fontes podem devolver a mesma
   * obra, e a paginação de uma delas pode voltar a mostrar o que já veio.
   */
  const carregarMais = useCallback(() => {
    const atual = estado.data
    if (!atual?.cursor || carregandoMais) return
    const meu = pedido.current
    setCarregandoMais(true)
    repositories.creative
      .search({ ...(JSON.parse(chave) as CreativeQuery), cursor: atual.cursor })
      .then((mais) => {
        if (meu !== pedido.current) return
        setEstado((e) => {
          const antes = e.data?.items ?? []
          const vistos = new Set(antes.map((i) => i.id))
          return {
            data: {
              items: [...antes, ...mais.items.filter((i) => !vistos.has(i.id))],
              cursor: mais.cursor,
              falhas: mais.falhas,
            },
            loading: false,
            error: null,
          }
        })
      })
      .catch(() => undefined)
      .finally(() => {
        if (meu === pedido.current) setCarregandoMais(false)
      })
  }, [chave, estado.data, carregandoMais])

  return {
    ...estado,
    buscando,
    carregandoMais,
    temMais: Boolean(estado.data?.cursor),
    carregarMais,
  }
}

/**
 * Acompanha os parciais de um pedido e vai juntando o que chega.
 *
 * As fontes respondem em ritmos muito diferentes — a mais rápida em 5s, a mais
 * lenta 30s depois —, e esperar por todas para mostrar qualquer coisa faz a
 * tela parecer travada. Aqui cada uma entra na grade assim que chega.
 *
 * `pedido` é o que descarta o que veio tarde: quem digitou outra coisa no meio
 * não vê o resultado da consulta anterior aparecer por cima.
 *
 * Repetidos são descartados por `id` — duas fontes podem devolver a mesma obra,
 * e a promessa final também repassa tudo.
 */
function useParciais(pedido: number, aoChegar: (parcial: CreativePartial) => void) {
  const guardado = useRef(aoChegar)
  guardado.current = aoChegar

  useEffect(() => {
    return repositories.creative.onPartial((parcial) => {
      if (parcial.pedido === pedido) guardado.current(parcial)
    })
  }, [pedido])
}

/** Junta o que chegou, sem repetir, preservando a ordem de chegada. */
function juntar(antes: CreativeItem[], novos: CreativeItem[]): CreativeItem[] {
  const vistos = new Set(antes.map((i) => i.id))
  return [...antes, ...novos.filter((i) => !vistos.has(i.id))]
}

/**
 * A home das fontes — o que elas mostram sem ninguém procurar nada.
 *
 * No DeviantArt é a página inicial carregada por um navegador de verdade em
 * segundo plano: com sessão, o feed de quem o usuário segue; sem ela, o feed
 * público. Demora alguns segundos porque é uma página sendo carregada, e não
 * uma resposta de API — por isso `carregando` é separado de `data`: a grade
 * mostra esqueleto em vez de vazio.
 *
 * `recarregar` é o gesto explícito de "de novo": depois de entrar na conta, a
 * home é outra, e esperar o cache de 90s vencer pareceria que o login não
 * pegou.
 */
export function useCreativeTrending(limite = 40) {
  const [data, setData] = useState<CreativeSearchResult | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const pedido = useRef(0)
  const [pedidoAtual, setPedidoAtual] = useState(0)

  const recarregar = useCallback(() => {
    const meu = ++pedido.current
    setPedidoAtual(meu)
    setCarregando(true)
    // A grade começa vazia e vai enchendo pelos parciais; a promessa fecha o
    // conjunto no fim e é ela que manda.
    setData(null)
    repositories.creative
      .trending(limite, '', meu)
      .then((r) => {
        if (meu !== pedido.current) return
        setData(r)
        setError(null)
      })
      .catch((erro: Error) => {
        if (meu !== pedido.current) return
        setError(erro)
      })
      .finally(() => {
        if (meu === pedido.current) setCarregando(false)
      })
  }, [limite])

  useParciais(pedidoAtual, (parcial) => {
    setData((atual) => ({
      items: juntar(atual?.items ?? [], parcial.items),
      cursor: atual?.cursor ?? '',
      falhas: parcial.error
        ? [...(atual?.falhas ?? []), { provider: parcial.provider, error: parcial.error }]
        : (atual?.falhas ?? []),
    }))
    // A primeira fonte que chega já tira o esqueleto da tela.
    setCarregando(false)
  })

  useEffect(recarregar, [recarregar])

  /** A próxima página da home, acrescentada — mesma regra da busca. */
  const carregarMais = useCallback(() => {
    if (!data?.cursor || carregandoMais) return
    const meu = pedido.current
    setCarregandoMais(true)
    repositories.creative
      .trending(limite, data.cursor)
      .then((mais) => {
        if (meu !== pedido.current) return
        setData((atual) => {
          const antes = atual?.items ?? []
          const vistos = new Set(antes.map((i) => i.id))
          return {
            items: [...antes, ...mais.items.filter((i) => !vistos.has(i.id))],
            cursor: mais.cursor,
            falhas: mais.falhas,
          }
        })
      })
      .catch(() => undefined)
      .finally(() => {
        if (meu === pedido.current) setCarregandoMais(false)
      })
  }, [data, limite, carregandoMais])

  return {
    data,
    carregando,
    carregandoMais,
    temMais: Boolean(data?.cursor),
    error,
    recarregar,
    carregarMais,
  }
}

/**
 * A biblioteca, e as ações que a mudam.
 *
 * Toda ação devolve a biblioteca inteira e o estado é substituído por ela: não
 * há remontagem otimista, e por isso a tela nunca mostra um estado que o disco
 * não tem. A biblioteca é pequena o bastante para isso ser barato.
 */
export function useCreativeLibrary() {
  const [library, setLibrary] = useState<CreativeLibrary | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const recarregar = useCallback(() => {
    repositories.creative.library().then(setLibrary).catch(setError)
  }, [])

  useEffect(recarregar, [recarregar])

  // Cada ação é o mesmo formato: chama, recebe a biblioteca nova, substitui.
  const agir = useCallback(
    (feito: Promise<CreativeLibrary>) => feito.then(setLibrary).catch(setError),
    [],
  )

  return {
    library,
    error,
    recarregar,
    salvar: (item: CreativeItem, onde: Parameters<typeof repositories.creative.save>[1]) =>
      agir(repositories.creative.save(item, onde)),
    remover: (id: string) => agir(repositories.creative.remove(id)),
    favoritar: (id: string, on: boolean) => agir(repositories.creative.favorite(id, on)),
    mover: (id: string, colecoes: string[]) => agir(repositories.creative.move(id, colecoes)),
    anotar: (id: string, nota: string, tags: string[]) =>
      agir(repositories.creative.annotate(id, nota, tags)),
    criarColecao: (dados: Parameters<typeof repositories.creative.collectionCreate>[0]) =>
      agir(repositories.creative.collectionCreate(dados)),
    editarColecao: (id: string, dados: Partial<CreativeCollection>) =>
      agir(repositories.creative.collectionEdit(id, dados)),
    apagarColecao: (id: string) => agir(repositories.creative.collectionDelete(id)),
  }
}

/**
 * A prévia de uma URL colada. Pedida no clique, não na digitação.
 *
 * `lida` guarda o último endereço que deu certo, e ler o MESMO de novo não faz
 * nada. Isso não é economia de rede: o campo relê no `blur`, e clicar em
 * "Salvar na biblioteca" tira o foco dele — a segunda leitura apagava a prévia,
 * o bloco sumia, o modal encolhia sob o cursor e o clique caía no vazio. O
 * botão simplesmente não funcionava, e nada apontava para o culpado.
 *
 * Uma leitura que FALHOU pode ser repetida: é o caso em que tentar de novo é
 * exatamente o que a pessoa quer.
 */
export function useCreativePreview() {
  const [previa, setPrevia] = useState<CreativePreview | null>(null)
  const [lendo, setLendo] = useState(false)
  const lida = useRef('')

  const ler = useCallback((url: string) => {
    if (url === lida.current) return
    lida.current = url
    setLendo(true)
    setPrevia(null)
    repositories.creative
      .preview(url)
      .then((r) => {
        // Falhou: solta o endereço para que tentar de novo seja possível.
        if (!r.ok) lida.current = ''
        setPrevia(r)
      })
      .catch((erro: Error) => {
        lida.current = ''
        setPrevia({ ok: false, error: erro.message, item: null })
      })
      .finally(() => setLendo(false))
  }, [])

  return {
    previa,
    lendo,
    ler,
    limpar: () => {
      lida.current = ''
      setPrevia(null)
    },
  }
}

/**
 * A capa de uma referência, já como `data:`.
 *
 * A CSP do renderer é `img-src 'self' data:` mais três hosts nomeados, e as
 * fontes criativas servem de onde quiserem — quem baixa é o main
 * (`services/creative/capa.ts`), que também confere pelos primeiros bytes que
 * aquilo é mesmo uma imagem.
 *
 * `cancelado` evita escrever estado depois que o cartão saiu da tela: numa
 * grade que rola, isso acontece o tempo todo.
 */
export function useCreativeThumb(url: string): string {
  const [dados, setDados] = useState('')

  useEffect(() => {
    if (!url) {
      setDados('')
      return
    }
    let cancelado = false
    repositories.creative
      .thumb(url)
      .then((d) => {
        if (!cancelado) setDados(d)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [url])

  return dados
}

/**
 * Enquanto a tela Social Arte está montada, os navegadores de fundo vivem;
 * ao sair dela, fecham na hora em vez de esperar os 3 min de ociosidade —
 * cinco Chromiums renderizando páginas de terceiro que ninguém vai ler
 * (DESEMPENHO.md, P0-3). A sessão fica: voltar não pede login de novo.
 */
export function useLiberarNavegadores(): void {
  useEffect(() => () => repositories.creative.release(), [])
}
