import type { AgentMessage } from '@shared/agents'
import type { DesktopApp } from '@shared/apps'
import type {
  IslandActivity,
  IslandClaude,
  IslandClip,
  IslandEvent,
  IslandLyricLine,
  IslandModule,
  IslandNotice,
  IslandSnapshot,
  IslandSpectrum,
  IslandTimer,
  IslandWindow,
  Reading,
  ShelfItem,
} from '@shared/island'
import {
  ALTURA_PILULA_MAX,
  ALTURA_PILULA_MIN,
  ALTURA_PILULA_PADRAO,
  VOO_CHEGADA_MS,
} from '@shared/island'
import type { SeafileResolution, SeafileState } from '@shared/seafile'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { type Comando, chaveDeUso, perguntaJson, resolver } from '../launcher/motor'
import { Glifo } from './Glifo'
import type { Achado } from './lancador'

/**
 * A ilha dinâmica.
 *
 * Três estados, e a passagem entre eles é o ponto: **fechada** ela é uma
 * pílula preta no topo que mostra UMA atividade (a de maior prioridade) e, se
 * houver uma segunda, uma bolha destacada ao lado; **aberta** ela escorre
 * para baixo e mostra um painel com abas; **em foco** um módulo ocupa a gota
 * inteira. Há um quarto momento passageiro, o **anúncio**: a pílula alarga
 * para contar uma novidade e se recolhe — um por vez, em fila.
 *
 * O desenho vem da Dynamic Island e dos apps de notch do macOS, e foi
 * revisado em 01/09/2026 por três olhares (UX, design Apple, movimento) — o
 * porquê de cada decisão está no DINAMICA.md.
 *
 * A janela tem o tamanho da gota (ver `island/window.ts`): abrir é pedir ao
 * main para crescê-la, e ela só ENCOLHE quando a gota avisa que assentou.
 */

/**
 * Os caminhos dos arquivos de um arrasto. `File.path` sumiu no Electron 32 e
 * devolvia `undefined` em silêncio — o arrasto caía no ramo de texto. Agora o
 * preload pergunta ao `webUtils`.
 */
const caminhosDe = (evento: React.DragEvent): string[] =>
  [...evento.dataTransfer.files]
    .map((arquivo) => window.halo?.files.pathOf(arquivo) ?? '')
    .filter((caminho) => caminho.length > 0)

/** Quanto tempo parado até a ilha desbotar. */
const OCIOSO_MS = 2600
/** O anúncio comum fica este tanto. */
const EVENTO_MS = 2500
/** Quanto antes do fim o anúncio começa a sair. */
const EVENTO_SAIDA_MS = 180
/** A roda do mouse sobre a pílula fechada mexe no volume, no máximo neste ritmo. */
const RODA_MS = 90
/**
 * Parar o mouse por este tanto abre a ilha. Cruzar o topo da tela não pode
 * abrir — com a ilha sobre o painel do KDE, o mouse passa por ela o dia todo.
 */
const PAIRAR_MS = 260
/** Tolerância ao sair: o mouse pode escorregar um instante sem fechar. */
const SAIR_MS = 140
/** Quanto o conteúdo demora a sumir antes de a casca recolher. */
const SAIDA_CONTEUDO_MS = 180
/** A pílula fechada tem largura intrínseca entre estes limites. */
const PILULA_MIN = 184
const PILULA_MAX = 320
/** As paddings da pílula, somadas à medida do conteúdo. */
const PILULA_PADDING = 24
/**
 * A altura da pílula, dentro dos limites do contrato. Vale para o valor da URL
 * e para o que chega por evento: os dois vêm de fora desta janela, e um `NaN`
 * na variável CSS deixaria a gota sem altura nenhuma.
 */
const limitarAltura = (px: number): number =>
  Number.isFinite(px)
    ? Math.max(ALTURA_PILULA_MIN, Math.min(ALTURA_PILULA_MAX, Math.round(px)))
    : ALTURA_PILULA_PADRAO
/**
 * Uma atividade de fora (um comando no shell) só entra na pílula depois
 * deste tanto: um `ls` não merece a ilha — o `npm run build`, sim.
 */
const ATIVIDADE_MIN_MS = 8000
/**
 * Uma faixa pausada há mais que isto sai da pílula até o play voltar. Pedido
 * do usuário (14/09/2026): com o Spotify aberto e a música pausada, a ilha
 * mostrava a faixa para sempre, até o Spotify ser fechado.
 */
const PAUSA_ESQUECIDA_MS = 20_000

/* ——— O espectro: os níveis da onda, fora do estado do React ————————
 *
 * Chegam ~15 vezes por segundo; passar por `useState` no topo re-renderizaria
 * a ilha inteira a cada quadro. Um armazém mínimo que só as ondas assinam.
 */
const espectro = {
  niveis: [] as IslandSpectrum,
  ouvintes: new Set<() => void>(),
  set(niveis: IslandSpectrum) {
    espectro.niveis = niveis
    for (const ouvinte of espectro.ouvintes) ouvinte()
  },
  subscribe(ouvinte: () => void) {
    espectro.ouvintes.add(ouvinte)
    return () => {
      espectro.ouvintes.delete(ouvinte)
    }
  },
  get: () => espectro.niveis,
}

const useEspectro = (): IslandSpectrum => useSyncExternalStore(espectro.subscribe, espectro.get)

/** O glifo de quem publicou uma atividade na API local. */
const glifoDaOrigem = (origem: string) =>
  /shell|zsh|bash|fish/i.test(origem)
    ? 'Terminal'
    : /claude|agente|agent/i.test(origem)
      ? 'Sparkle'
      : 'Lightning'

/** Os volumes removíveis, do jeito que a leitura `discos-lista` os codifica. */
type VolumeRemovivel = {
  device: string
  nome: string
  tamanho: string
  particao: string
  rotulo: string
  ponto: string
  livre: string
}

function volumesDe(modulo: IslandModule | undefined): VolumeRemovivel[] {
  const detalhe = leitura(modulo, 'discos-lista')?.detail ?? ''
  return detalhe
    .split(';')
    .filter(Boolean)
    .map((linha) => {
      const [
        device = '',
        nome = '',
        tamanho = '',
        particao = '',
        rotulo = '',
        ponto = '',
        livre = '',
      ] = linha.split('|')
      return { device, nome, tamanho, particao, rotulo, ponto, livre }
    })
}

type Agir = (id: string, arg?: string) => void

/** Um anúncio vivo. Só um é mostrado; os outros esperam na fila. */
type EventoVivo = { id: number; dado: IslandEvent; saindo: boolean }

/** As abas do painel aberto. */
type Aba = 'inicio' | 'modulos' | 'claude' | 'gaveta' | 'janelas' | 'avisos' | 'clips' | 'nota'

const ABAS: { id: Aba; nome: string; icone: string }[] = [
  { id: 'inicio', nome: 'Início', icone: 'House' },
  { id: 'modulos', nome: 'Painéis', icone: 'GridFour' },
  { id: 'claude', nome: 'Claude', icone: 'Sparkle' },
  { id: 'gaveta', nome: 'Gaveta', icone: 'Tray' },
  { id: 'janelas', nome: 'Janelas', icone: 'AppWindow' },
  { id: 'avisos', nome: 'Avisos', icone: 'BellRinging' },
  { id: 'clips', nome: 'Cópias', icone: 'Clipboard' },
  { id: 'nota', nome: 'Nota', icone: 'NotePencil' },
]

/** A leitura `id` de um módulo, se houver. */
const leitura = (modulo: IslandModule | undefined, id: string) =>
  modulo?.readings.find((r) => r.id === id)

/** `m:ss` → segundos. */
const segundos = (texto: string): number | null => {
  const m = /(\d+):(\d\d)/.exec(texto)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

const mmss = (s: number) =>
  `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`

export function IslandApp() {
  const [snapshot, setSnapshot] = useState<IslandSnapshot | null>(null)
  const [aberta, setAberta] = useState(false)
  /** O corpo continua montado por um instante ao fechar, para o fade. */
  const [corpoVivo, setCorpoVivo] = useState(false)
  const [aba, setAba] = useState<Aba>('inicio')
  const [foco, setFoco] = useState<string | null>(null)
  const [ocioso, setOcioso] = useState(false)
  const [hover, setHover] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [seafile, setSeafile] = useState<SeafileState | null>(null)
  const [shelf, setShelf] = useState<ShelfItem[]>([])
  const [guardadas, setGuardadas] = useState<IslandWindow[]>([])
  const [atividades, setAtividades] = useState<IslandActivity[]>([])
  const [claude, setClaude] = useState<IslandClaude | null>(null)
  const [eventos, setEventos] = useState<EventoVivo[]>([])
  /** Segura a ilha aberta mesmo com o mouse fora (o cadeado do DynamicNotch). */
  const [fixa, setFixa] = useState(false)
  /** Para que lado o painel desliza ao trocar de aba. */
  const [direcao, setDirecao] = useState<'esq' | 'dir'>('dir')
  /** A gota está chegando (escorre do topo uma vez, ao subir). */
  const [chegando, setChegando] = useState(true)
  /** Ações em voo: clicadas e ainda sem resposta do sistema. */
  const [pendentes, setPendentes] = useState<Set<string>>(new Set())
  /** A largura medida do conteúdo fechado e do anúncio. */
  const [larguraResumo, setLarguraResumo] = useState(PILULA_MIN)
  const [larguraEvento, setLarguraEvento] = useState(260)
  const gota = useRef<HTMLDivElement>(null)

  const parametros = new URLSearchParams(window.location.search)
  const motion = parametros.get('motion') ?? 'gota'
  const opacidadeOciosa = Number(parametros.get('idle') ?? 55) / 100
  const abrirAoPairar = (parametros.get('open') ?? 'hover') !== 'click'
  /**
   * A altura da pílula FECHADA. Chega na URL no arranque e por evento quando o
   * usuário arrasta o slider — é a única opção da ilha que não remonta a
   * janela (ver o `soAAltura` em `main/index.ts`), porque a gota anima até a
   * altura nova e quem arrasta está olhando para ela.
   */
  const [alturaPilula, setAlturaPilula] = useState(() =>
    limitarAltura(Number(parametros.get('h') ?? ALTURA_PILULA_PADRAO)),
  )
  useEffect(() => window.halo?.island.onAltura((px) => setAlturaPilula(limitarAltura(px))), [])

  /* ——— Dados ———————————————————————————————————————— */

  useEffect(() => {
    let vivo = true
    // Uma leitura ao montar, e depois só o que o main EMPURRA a cada pulso: a
    // ilha também pedia o instantâneo a cada 2s, e com duas telas eram três
    // montagens por batida (DESEMPENHO.md, P1-4). O push já era o mesmo dado.
    void window.halo?.island.snapshot().then((s) => vivo && setSnapshot(s))
    const cancelar = window.halo?.island.onSnapshot(setSnapshot)
    return () => {
      vivo = false
      cancelar?.()
    }
  }, [])

  useEffect(() => {
    let vivo = true
    const buscar = () => {
      void window.halo?.seafile.state().then((e) => vivo && setSeafile(e))
    }
    buscar()
    const cancelar = window.halo?.seafile.onChanged(setSeafile)
    return () => {
      vivo = false
      cancelar?.()
    }
  }, [])

  useEffect(() => {
    let vivo = true
    void window.halo?.island.shelf().then((itens) => vivo && setShelf(itens))
    const cancelar = window.halo?.island.onShelf(setShelf)
    return () => {
      vivo = false
      cancelar?.()
    }
  }, [])

  useEffect(() => {
    let vivo = true
    void window.halo?.island.janelasGuardadas().then((j) => vivo && setGuardadas(j))
    const cancelar = window.halo?.island.onJanelasGuardadas(setGuardadas)
    return () => {
      vivo = false
      cancelar?.()
    }
  }, [])

  useEffect(() => {
    let vivo = true
    void window.halo?.island.atividades().then((a) => vivo && setAtividades(a))
    const cancelar = window.halo?.island.onAtividades(setAtividades)
    return () => {
      vivo = false
      cancelar?.()
    }
  }, [])

  useEffect(() => window.halo?.island.onEspectro((niveis) => espectro.set(niveis)), [])

  useEffect(() => {
    let vivo = true
    void window.halo?.island.claude().then((c) => vivo && setClaude(c))
    const cancelar = window.halo?.island.onClaude(setClaude)
    return () => {
      vivo = false
      cancelar?.()
    }
  }, [])

  /* ——— Os anúncios: uma fila ————————————————————————————
   *
   * Um por vez, como os alertas da ilha do iOS — dois nunca dividem a
   * pílula. Cada um vive o próprio relógio: entra, mostra, sai. Um evento
   * com CHAVE (o HUD de volume) substitui o vivo da mesma chave em vez de
   * enfileirar: o volume subindo em passos é um chip mudando, não cinco.
   */
  const fila = useRef<EventoVivo[]>([])
  const sequencia = useRef(0)
  const relogiosEvento = useRef<ReturnType<typeof setTimeout>[]>([])
  /** Há um anúncio em cena (o relógio dele está armado). */
  const mostrando = useRef(false)

  const mostrarProximo = useCallback(() => {
    for (const r of relogiosEvento.current) clearTimeout(r)
    relogiosEvento.current = []
    const proximo = fila.current.shift()
    if (!proximo) {
      mostrando.current = false
      setEventos([])
      return
    }
    mostrando.current = true
    setEventos([proximo])
    const ttl = proximo.dado.ttlMs ?? EVENTO_MS
    relogiosEvento.current = [
      setTimeout(
        () => setEventos((es) => es.map((e) => (e.id === proximo.id ? { ...e, saindo: true } : e))),
        Math.max(0, ttl - EVENTO_SAIDA_MS),
      ),
      setTimeout(mostrarProximo, ttl),
    ]
  }, [])

  const anunciar = useCallback(
    (dado: IslandEvent) => {
      sequencia.current += 1
      const novo: EventoVivo = { id: sequencia.current, dado, saindo: false }
      if (dado.key) {
        // O mesmo assunto mudando: toma o lugar do vivo ou do enfileirado.
        const vivoAgora = vivoRef.current
        if (vivoAgora && vivoAgora.dado.key === dado.key && !vivoAgora.saindo) {
          setEventos([{ ...vivoAgora, dado }])
          // Recomeça o relógio do vivo.
          for (const r of relogiosEvento.current) clearTimeout(r)
          const ttl = dado.ttlMs ?? EVENTO_MS
          relogiosEvento.current = [
            setTimeout(
              () => setEventos((es) => es.map((e) => ({ ...e, saindo: true }))),
              Math.max(0, ttl - EVENTO_SAIDA_MS),
            ),
            setTimeout(mostrarProximo, ttl),
          ]
          return
        }
        const naFila = fila.current.findIndex((e) => e.dado.key === dado.key)
        if (naFila >= 0) {
          fila.current[naFila] = novo
          return
        }
      }
      fila.current.push(novo)
      // Sem efeito colateral dentro de updater do React: em desenvolvimento
      // ele roda duas vezes, e o segundo `shift` esvaziava a fila na hora.
      if (!mostrando.current) mostrarProximo()
    },
    [mostrarProximo],
  )

  /** O anúncio vivo, para o `anunciar` saber o que substituir sem updater. */
  const vivoRef = useRef<EventoVivo | null>(null)
  useEffect(() => {
    vivoRef.current = eventos[0] ?? null
  }, [eventos])

  useEffect(() => {
    const cancelar = window.halo?.island.onEvento(anunciar)
    return () => {
      cancelar?.()
      for (const r of relogiosEvento.current) clearTimeout(r)
    }
  }, [anunciar])

  /* ——— Agir: com feedback ——————————————————————————————
   *
   * Uma ação que falha vira anúncio de erro — clicar três vezes em algo que
   * não vai funcionar é o pior silêncio. E uma que dá certo pede o
   * instantâneo na hora: o toggle acende em ~100ms, não em até 2s.
   */
  const executar = useCallback<Agir>(
    (id, arg) => {
      setPendentes((p) => new Set(p).add(id))
      const soltar = () =>
        setPendentes((p) => {
          const n = new Set(p)
          n.delete(id)
          return n
        })
      window.halo?.island
        .run(id, arg)
        .then(() => window.halo?.island.snapshot().then(setSnapshot))
        .catch((erro: unknown) => {
          const mensagem = erro instanceof Error ? erro.message : String(erro)
          anunciar({
            icon: 'WarningCircle',
            text: 'Não deu',
            detail: mensagem.replace(/^.*island:action': Error: /, '').slice(0, 60),
            level: 'erro',
            kind: 'aviso',
            ttlMs: 4000,
          })
        })
        .finally(soltar)
    },
    [anunciar],
  )

  /* ——— Abrir e fechar ————————————————————————————————
   *
   * A janela tem o tamanho da gota, então abrir é pedir ao main para crescê-la
   * (já aos 120ms de hover — transparente, ninguém vê); ao fechar, o main só
   * encolhe quando a gota avisa que ASSENTOU (`transitionend` da altura).
   */
  const relogioAbrir = useRef<ReturnType<typeof setTimeout>>(undefined)
  const relogioFechar = useRef<ReturnType<typeof setTimeout>>(undefined)
  const preAberta = useRef(false)

  useEffect(() => {
    if (aberta) {
      preAberta.current = true
      window.halo?.island.setOpen(true)
      setCorpoVivo(true)
      return
    }
    setFoco(null)
    if (preAberta.current) {
      preAberta.current = false
      window.halo?.island.setOpen(false)
    }
    const relogio = setTimeout(() => setCorpoVivo(false), SAIDA_CONTEUDO_MS)
    return () => clearTimeout(relogio)
  }, [aberta])

  const entrou = useCallback(() => {
    clearTimeout(relogioFechar.current)
    setHover(true)
    setOcioso(false)
    if (!abrirAoPairar || aberta) return
    clearTimeout(relogioAbrir.current)
    relogioAbrir.current = setTimeout(() => setAberta(true), PAIRAR_MS)
  }, [abrirAoPairar, aberta])

  const saiu = useCallback(() => {
    clearTimeout(relogioAbrir.current)
    clearTimeout(relogioFechar.current)
    setHover(false)
    if (preAberta.current && !aberta) {
      preAberta.current = false
      window.halo?.island.setOpen(false)
    }
    if (fixa) return
    relogioFechar.current = setTimeout(() => setAberta(false), SAIR_MS)
  }, [fixa, aberta])

  const clicou = useCallback(() => {
    if (!aberta) setAberta(true)
  }, [aberta])

  // Soltar o alfinete com o mouse longe fecha na hora. Só na TRANSIÇÃO de
  // fixa para solta: conferir `:hover` a cada abertura fecharia a ilha durante
  // um arraste de arquivo, quando o Chromium não atualiza o `:hover`.
  const fixaAntes = useRef(fixa)
  useEffect(() => {
    const soltou = fixaAntes.current && !fixa
    fixaAntes.current = fixa
    if (soltou && !gota.current?.matches(':hover')) setAberta(false)
  }, [fixa])

  // Some quando ninguém está por perto: 2,6s depois de o mouse SAIR.
  useEffect(() => {
    if (aberta || hover) {
      setOcioso(false)
      return
    }
    const relogio = setTimeout(() => setOcioso(true), OCIOSO_MS)
    return () => clearTimeout(relogio)
  }, [aberta, hover])

  /**
   * Onde a gota e a bolha estão, para o main saber onde o mouse vale. A
   * janela nunca redimensiona; é isto que a mantém transparente fora da gota.
   * Vai a cada 100ms e a cada mudança de tamanho — retângulos são baratos.
   */
  const bolhaRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const mandar = () => {
      const lista: { x: number; y: number; width: number; height: number }[] = []
      for (const el of [gota.current, bolhaRef.current]) {
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          // Uma folga de 6px em volta: o cursor na borda ainda vale.
          lista.push({ x: r.left - 6, y: r.top, width: r.width + 12, height: r.height + 8 })
        }
      }
      window.halo?.island.alvo(lista)
    }
    mandar()
    // 500ms e não 100: o ResizeObserver já manda quando a gota muda de tamanho;
    // o batimento é só a rede de segurança da reescrita da shape (DESEMPENHO.md, P1-6).
    const relogio = setInterval(mandar, 500)
    const observador = new ResizeObserver(mandar)
    if (gota.current) observador.observe(gota.current)
    if (bolhaRef.current) observador.observe(bolhaRef.current)
    return () => {
      clearInterval(relogio)
      observador.disconnect()
    }
  }, [])

  /** A gota assentou (fim da transição de altura ou largura): avisa o main. */
  const assentou = useCallback((evento: React.TransitionEvent) => {
    if (evento.target !== gota.current) return
    if (evento.propertyName !== 'height' && evento.propertyName !== 'width') return
    window.halo?.island.assentou(gota.current?.offsetHeight ?? 0)
  }, [])

  /* ——— A largura intrínseca da pílula ————————————————————— */
  const medidorResumo = useRef<HTMLSpanElement>(null)
  const medidorEvento = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = medidorResumo.current
    if (!el) return
    const medir = () =>
      setLarguraResumo(Math.max(PILULA_MIN, Math.min(PILULA_MAX, el.offsetWidth + PILULA_PADDING)))
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])
  useLayoutEffect(() => {
    const el = medidorEvento.current
    if (!el) return
    const medir = () => setLarguraEvento(Math.max(200, Math.min(PILULA_MAX, el.offsetWidth + 28)))
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  /* ——— Abas ———————————————————————————————————————— */
  const escolherAba = useCallback(
    (proxima: Aba) => {
      const de = ABAS.findIndex((a) => a.id === aba)
      const para = ABAS.findIndex((a) => a.id === proxima)
      setDirecao(para >= de ? 'dir' : 'esq')
      setAba(proxima)
      setFoco(null)
    },
    [aba],
  )

  const abrirModulo = useCallback(
    (id: string) => {
      escolherAba('modulos')
      setFoco(id)
    },
    [escolherAba],
  )

  /* A roda horizontal troca de aba com a ilha aberta; a vertical, na pílula
   * fechada, mexe no volume (o gesto de deslizar sobre o notch). */
  const ultimaRoda = useRef(0)
  const ultimaAba = useRef(0)
  const aoRodar = useCallback(
    (evento: React.WheelEvent) => {
      if (aberta) {
        if (Math.abs(evento.deltaX) < 12 || Math.abs(evento.deltaX) < Math.abs(evento.deltaY))
          return
        const agora = Date.now()
        if (agora - ultimaAba.current < 380) return
        ultimaAba.current = agora
        const atual = ABAS.findIndex((a) => a.id === aba)
        const proxima = ABAS[(atual + (evento.deltaX > 0 ? 1 : ABAS.length - 1)) % ABAS.length]
        if (proxima) escolherAba(proxima.id)
        return
      }
      const agora = Date.now()
      if (agora - ultimaRoda.current < RODA_MS) return
      ultimaRoda.current = agora
      executar(evento.deltaY < 0 ? 'volume-subir' : 'volume-baixar')
    },
    [aberta, aba, escolherAba, executar],
  )

  /* ——— O voo —————————————————————————————————————————
   *
   * Quem desenha o fantasma é a camada (`Voo.tsx`); aqui a ilha só fecha o
   * painel — a pílula que encolhe é a boca — e quica quando ele chega. O
   * quique é WAAPI, não uma `animation` CSS: trocar `animation-name` numa
   * regra e devolvê-la faz a animação anterior RODAR DE NOVO, e foi assim que
   * a chegada da gota voltava a escorrer do topo a cada anúncio (01/09/2026).
   */
  useEffect(() => {
    let relogio: ReturnType<typeof setTimeout> | undefined
    const quicar = () => {
      const g = gota.current
      if (!g) return
      const gelatina = getComputedStyle(document.documentElement)
        .getPropertyValue('--ilha-gelatina')
        .trim()
      g.animate([{ transform: 'scale(1.04, 1.1)' }, { transform: 'scale(1)' }], {
        duration: 600,
        easing: gelatina || 'ease-out',
      })
    }
    const cancelar = window.halo?.island.onVoo((dado) => {
      clearTimeout(relogioAbrir.current)
      setFixa(false)
      setHover(false)
      setAberta(false)
      clearTimeout(relogio)
      // Ida: quica quando o cartão chega. Volta: quica ao cuspir, na hora.
      if (dado.sentido === 'volta') quicar()
      else relogio = setTimeout(quicar, VOO_CHEGADA_MS)
    })
    return () => {
      clearTimeout(relogio)
      cancelar?.()
    }
  }, [])

  useEffect(() => {
    const relogio = setTimeout(() => setChegando(false), 700)
    return () => clearTimeout(relogio)
  }, [])

  /* ——— Arrastar arquivos ————————————————————————————
   *
   * Soltar arquivo na gota tem dois destinos, e o alvo escolhe: guardar na
   * gaveta ou mandar para o Seafile. O que viaja é o caminho de cada arquivo
   * (ver `caminhosDe`).
   */
  const [mirando, setMirando] = useState<'gaveta' | 'seafile' | 'celular' | null>(null)

  const aoSoltar = useCallback(
    (evento: React.DragEvent) => {
      evento.preventDefault()
      setArrastando(false)
      setMirando(null)

      const caminhos = caminhosDe(evento)
      if (caminhos.length > 0) {
        if (mirando === 'seafile') {
          void window.halo?.seafile.upload(caminhos)
          // O andamento mora no cartão do Seafile, na aba dos painéis.
          escolherAba('modulos')
        } else if (mirando === 'celular') {
          // O "AirDrop": cada arquivo vai pelo KDE Connect.
          for (const caminho of caminhos) executar('celular-enviar', caminho)
        } else {
          for (const caminho of caminhos) executar('gaveta-guardar', caminho)
          escolherAba('gaveta')
        }
        return
      }
      const urls = (evento.dataTransfer.getData('text/uri-list') || '')
        .split('\n')
        .map((linha) => linha.trim())
        .filter((linha) => /^https?:\/\//.test(linha))
      if (urls.length > 0) {
        for (const url of urls)
          executar(mirando === 'celular' ? 'celular-enviar' : 'gaveta-guardar', url)
        if (mirando !== 'celular') escolherAba('gaveta')
        return
      }
      const texto = evento.dataTransfer.getData('text/plain').trim()
      if (texto) {
        if (mirando === 'celular') {
          executar('celular-enviar-texto', texto)
          return
        }
        executar('gaveta-guardar-texto', texto)
        escolherAba('gaveta')
      }
    },
    [mirando, executar, escolherAba],
  )

  const modulos = snapshot?.modules ?? []
  const por = (id: string) => modulos.find((m) => m.id === id)
  const emFoco = modulos.find((m) => m.id === foco) ?? null
  const midia = por('midia')
  const tocando = leitura(midia, 'midia-tocando')
  const temFaixa = tocando != null && tocando.value !== 'nada'
  const midiaEsquecida = usePausaEsquecida(
    temFaixa && leitura(midia, 'midia-estado')?.value !== 'tocando',
  )
  // A tinta da capa é destaque também: sai junto com a faixa esquecida.
  const tinta = useCorDaCapa(temFaixa && !midiaEsquecida ? tocando.art : undefined)

  /** O anúncio vivo, para mostrar no cabeçalho enquanto a ilha está aberta. */
  const vivo = eventos.find((e) => !e.saindo)?.dado ?? null
  const evento = eventos[0] ?? null

  const naPilula = useAtividades(
    snapshot,
    seafile,
    atividades,
    claude?.agent?.approval ?? null,
    midiaEsquecida,
  )
  const principal = naPilula[0] ?? null
  // O relógio nunca é bolha: é o vazio, não uma atividade.
  const segunda = naPilula[1] ?? null
  const secundaria = segunda && segunda.tipo !== 'relogio' ? segunda : null

  // O celular ao alcance: a gaveta e o alvo de soltar ganham "enviar ao celular".
  const celularLeitura = leitura(por('celular'), 'celular-dispositivo')
  const celularPerto =
    celularLeitura && celularLeitura.level === 'ok' && celularLeitura.value !== 'nenhum'
      ? celularLeitura.value
      : null

  return (
    <div className="palco" style={{ '--ilha-altura': `${alturaPilula}px` } as React.CSSProperties}>
      {/* Região, não botão: ela reage a passar o mouse e a receber arquivos,
          mas não é um controle — quem clica clica nos botões de dentro. O
          clique na região só existe para o modo "abrir ao clicar". */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: ver acima */}
      <section
        ref={gota}
        aria-label="Ilha dinâmica"
        className="gota"
        data-aberta={aberta ? 'sim' : 'nao'}
        data-hover={hover ? 'sim' : 'nao'}
        data-arrastando={arrastando ? 'sim' : 'nao'}
        data-evento={evento && !aberta ? 'sim' : 'nao'}
        data-nivel={evento?.dado.level ?? 'ok'}
        data-chegando={chegando ? 'sim' : 'nao'}
        data-motion={motion}
        style={
          {
            '--ilha-ocioso': ocioso && !aberta ? opacidadeOciosa : 1,
            '--largura': `${larguraResumo}px`,
            '--largura-evento': `${larguraEvento}px`,
            ...(tinta ? { '--ilha-tinta': tinta } : {}),
          } as React.CSSProperties
        }
        onMouseEnter={entrou}
        onMouseLeave={saiu}
        onClick={clicou}
        onWheel={aoRodar}
        onTransitionEnd={assentou}
        onDragEnter={(e) => {
          e.preventDefault()
          setArrastando(true)
          clearTimeout(relogioAbrir.current)
          setAberta(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setArrastando(false)
            setMirando(null)
          }
        }}
        onDrop={aoSoltar}
      >
        <Chegada />

        <div className="resumo" aria-live="polite">
          <span className="resumoConteudo" ref={medidorResumo}>
            {principal ? <Atividade atividade={principal} aoAgir={executar} /> : null}
          </span>
        </div>

        {evento && !aberta ? (
          <div
            className="anuncio"
            data-nivel={evento.dado.level}
            data-saindo={evento.saindo ? 'sim' : 'nao'}
            data-kind={evento.dado.kind ?? 'comum'}
            aria-live="polite"
          >
            <span className="anuncioConteudo" ref={medidorEvento}>
              <Anuncio evento={evento.dado} />
            </span>
          </div>
        ) : null}

        {corpoVivo ? (
          <div className="corpo" data-saindo={aberta ? 'nao' : 'sim'}>
            {arrastando ? (
              <Solte
                seafile={seafile}
                celular={celularPerto}
                mirando={mirando}
                aoMirar={setMirando}
              />
            ) : (
              <>
                <Cabeca
                  aba={aba}
                  aoEscolher={escolherAba}
                  contagens={{
                    gaveta: shelf.length,
                    avisos: snapshot?.notices.length ?? 0,
                    clips: snapshot?.clips.length ?? 0,
                    claude: claude?.agent?.approval ? 1 : 0,
                  }}
                  vivo={vivo}
                  silencio={leitura(por('avisos'), 'silencio')}
                  cafeina={leitura(por('desktop'), 'cafeina')}
                  halo={leitura(por('halo'), 'halo-na-ilha')}
                  fixa={fixa}
                  pendentes={pendentes}
                  aoFixar={() => setFixa((f) => !f)}
                  aoAgir={executar}
                />

                {aba === 'inicio' ? (
                  <Inicio
                    key="inicio"
                    direcao={direcao}
                    modulos={modulos}
                    timer={snapshot?.timer ?? null}
                    lyrics={snapshot?.lyrics ?? null}
                    at={snapshot?.at ?? 0}
                    pendentes={pendentes}
                    aoAgir={executar}
                    aoAbrirModulo={abrirModulo}
                  />
                ) : aba === 'modulos' ? (
                  emFoco ? (
                    <Foco
                      key={`foco-${emFoco.id}`}
                      modulo={emFoco}
                      audio={por('audio')}
                      lyrics={snapshot?.lyrics ?? null}
                      at={snapshot?.at ?? 0}
                      atividades={atividades}
                      aoVoltar={() => setFoco(null)}
                      aoAgir={executar}
                    />
                  ) : (
                    <Painel key="modulos" direcao={direcao}>
                      <div className="cards">
                        <SeafileCard
                          estado={seafile}
                          indice={0}
                          aoDecidir={(id, escolha) => window.halo?.seafile.resolve(id, escolha)}
                          aoLimpar={() => window.halo?.seafile.clearDone()}
                        />
                        {modulos.map((modulo, indice) => (
                          <Card
                            key={modulo.id}
                            modulo={modulo}
                            indice={indice + 1}
                            aoAbrir={() => setFoco(modulo.id)}
                            aoAgir={executar}
                          />
                        ))}
                      </div>
                    </Painel>
                  )
                ) : aba === 'claude' ? (
                  <Painel key="claude" direcao={direcao}>
                    <ClaudeFoco
                      estado={claude}
                      clips={snapshot?.clips.length ?? 0}
                      avisos={snapshot?.notices.length ?? 0}
                      tocando={!(tocando == null || tocando.value === 'nada')}
                      aoAgir={executar}
                    />
                  </Painel>
                ) : aba === 'gaveta' ? (
                  <Painel key="gaveta" direcao={direcao}>
                    <GavetaFoco itens={shelf} celular={celularPerto} aoAgir={executar} />
                  </Painel>
                ) : aba === 'janelas' ? (
                  <Painel key="janelas" direcao={direcao}>
                    <JanelasFoco guardadas={guardadas} aoAgir={executar} />
                  </Painel>
                ) : aba === 'avisos' ? (
                  <Painel key="avisos" direcao={direcao}>
                    <AvisosFoco avisos={snapshot?.notices ?? []} aoAgir={executar} />
                  </Painel>
                ) : aba === 'clips' ? (
                  <Painel key="clips" direcao={direcao}>
                    <ClipsFoco clips={snapshot?.clips ?? []} aoAgir={executar} />
                  </Painel>
                ) : (
                  <Painel key="nota" direcao={direcao}>
                    <Nota texto={snapshot?.note ?? ''} aoAgir={executar} />
                  </Painel>
                )}
              </>
            )}
          </div>
        ) : null}
      </section>

      <Bolha ref={bolhaRef} atividade={!aberta && !evento ? secundaria : null} aoAgir={executar} />
    </div>
  )
}

/* ——— As atividades: o que a pílula fechada mostra ——————————————
 *
 * Uma por vez, por prioridade fixa (microfone em uso > agente trabalhando >
 * temporizador > download > mídia > relógio); a segunda vira a bolha. É a
 * disciplina de omissão da Dynamic Island: clima, CPU e contagens não são
 * atividades — moram nos painéis.
 */
type Atividade =
  /** O Claude da ilha pede permissão para uma ferramenta: permitir ou negar aqui mesmo. */
  | { tipo: 'aprovacao'; tool: string; o: string }
  | { tipo: 'mic'; quem: string }
  | { tipo: 'agente'; texto: string }
  | { tipo: 'timer'; timer: IslandTimer }
  /** Uma atividade publicada na API local — um build, um comando longo. */
  | { tipo: 'atividade'; atividade: IslandActivity; n: number }
  | { tipo: 'download'; n: number; nome: string }
  /** Envio ao Seafile em curso — ou parado à espera de uma decisão. */
  | { tipo: 'envio'; n: number; nome: string; progress: number; pendente: boolean }
  | { tipo: 'midia'; nome: string; art: string | undefined; tocando: boolean }
  | { tipo: 'relogio'; hora: string }

/**
 * A faixa está pausada há `PAUSA_ESQUECIDA_MS`? Relógio próprio, não o
 * `snapshot.at`: com a ilha recolhida o pulso bate a cada 20s, e a pausa
 * sairia com até o dobro do prazo. O play (ou a faixa sumir) zera a conta.
 */
function usePausaEsquecida(pausada: boolean): boolean {
  const [esquecida, setEsquecida] = useState(false)
  useEffect(() => {
    setEsquecida(false)
    if (!pausada) return
    const relogio = setTimeout(() => setEsquecida(true), PAUSA_ESQUECIDA_MS)
    return () => clearTimeout(relogio)
  }, [pausada])
  return esquecida
}

function useAtividades(
  snapshot: IslandSnapshot | null,
  seafile: SeafileState | null,
  externas: IslandActivity[],
  aprovacao: NonNullable<IslandClaude['agent']>['approval'] | null,
  midiaEsquecida: boolean,
): Atividade[] {
  return useMemo(() => {
    const lista: Atividade[] = []
    if (!snapshot) return lista
    const por = (id: string) => snapshot.modules.find((m) => m.id === id)
    // Um pedido de permissão parado vem antes de tudo: o Claude está esperando.
    if (aprovacao) lista.push({ tipo: 'aprovacao', tool: aprovacao.tool, o: aprovacao.description })
    const mic = leitura(por('audio'), 'mic-em-uso')
    if (mic && mic.value !== '0') lista.push({ tipo: 'mic', quem: mic.detail })
    const agentes = leitura(por('halo'), 'halo-agentes')
    if (agentes && /trabalhando/.test(agentes.detail))
      lista.push({ tipo: 'agente', texto: agentes.detail })
    if (snapshot.timer) lista.push({ tipo: 'timer', timer: snapshot.timer })
    // Só o que já dura o bastante: `snapshot.at` bate a cada 2s e serve de relógio.
    const vivas = externas.filter(
      (a) => a.state === 'andamento' && snapshot.at - a.startedAt >= ATIVIDADE_MIN_MS,
    )
    if (vivas[0]) lista.push({ tipo: 'atividade', atividade: vivas[0], n: vivas.length })
    const envios = (seafile?.uploads ?? []).filter(
      (u) => u.state === 'enviando' || u.state === 'esperando',
    )
    const parados = (seafile?.uploads ?? []).filter((u) => u.state === 'existe')
    if (envios.length > 0 || parados.length > 0) {
      const total = envios.reduce((soma, u) => soma + u.bytes, 0)
      const feito = envios.reduce((soma, u) => soma + u.sent, 0)
      lista.push({
        tipo: 'envio',
        n: envios.length,
        nome: (envios[0] ?? parados[0])?.name ?? '',
        progress: total > 0 ? feito / total : 0,
        // Só decisão pendente, nada subindo: a pílula avisa em vez de medir.
        pendente: envios.length === 0,
      })
    }
    // Só o que está sendo escrito: um parcial parado (pausado, ou o resto
    // de um download cancelado) ficaria na pílula para sempre.
    const baixando = snapshot.downloads.filter((d) => !d.parado)
    if (baixando.length > 0) {
      lista.push({
        tipo: 'download',
        n: baixando.length,
        nome: baixando[0]?.nome ?? '',
      })
    }
    const tocando = leitura(por('midia'), 'midia-tocando')
    const estado = leitura(por('midia'), 'midia-estado')
    // Pausada há muito, a faixa sai da pílula (e da bolha) até o play voltar.
    // O player da ilha aberta continua mostrando: é destaque que some, não dado.
    if (tocando && tocando.value !== 'nada' && !midiaEsquecida) {
      lista.push({
        tipo: 'midia',
        nome: tocando.value,
        art: tocando.art,
        tocando: estado?.value === 'tocando',
      })
    }
    lista.push({ tipo: 'relogio', hora: leitura(por('tempo'), 'relogio-hora')?.value ?? '—' })
    return lista
  }, [snapshot, seafile, externas, aprovacao, midiaEsquecida])
}

function Atividade({ atividade, aoAgir }: { atividade: Atividade; aoAgir: Agir }) {
  switch (atividade.tipo) {
    case 'aprovacao':
      return (
        <>
          <span className="resumoIcone" data-nivel="alerta" data-viva="sim">
            <Glifo nome="Sparkle" tamanho={14} />
          </span>
          <span className="resumoTexto" title={`${atividade.tool}: ${atividade.o}`}>
            {atividade.tool} · {atividade.o}
          </span>
          <button
            type="button"
            className="aprovar"
            data-resposta="sim"
            title="Permitir"
            aria-label="Permitir"
            onClick={(e) => {
              e.stopPropagation()
              aoAgir('claude-aprovar', 'sim')
            }}
          >
            <Glifo nome="Check" tamanho={12} />
          </button>
          <button
            type="button"
            className="aprovar"
            data-resposta="nao"
            title="Negar"
            aria-label="Negar"
            onClick={(e) => {
              e.stopPropagation()
              aoAgir('claude-aprovar', 'nao')
            }}
          >
            <Glifo nome="X" tamanho={12} />
          </button>
        </>
      )
    case 'relogio':
      return (
        <span className="hora">
          <Rolar texto={atividade.hora} />
        </span>
      )
    case 'midia':
      return (
        <>
          {atividade.art ? <img className="capinha" src={atividade.art} alt="" /> : null}
          <span className="faixaNome" title={atividade.nome}>
            {atividade.nome}
          </span>
          <Ondas parado={!atividade.tocando} />
        </>
      )
    case 'timer':
      return (
        <>
          <span className="resumoIcone" data-nivel="alerta">
            <Glifo nome={atividade.timer.end === null ? 'Hourglass' : 'Timer'} tamanho={14} />
          </span>
          <span className="resumoTexto">
            <Contagem timer={atividade.timer} />
          </span>
        </>
      )
    case 'envio':
      return (
        <>
          <span className="resumoIcone" data-nivel={atividade.pendente ? 'alerta' : 'ok'}>
            <Glifo nome={atividade.pendente ? 'WarningCircle' : 'CloudArrowUp'} tamanho={14} />
          </span>
          {atividade.pendente ? (
            <span className="resumoTexto" title={atividade.nome}>
              {atividade.nome} já existe no Seafile
            </span>
          ) : (
            <span className="resumoEnvio" title={atividade.nome}>
              <span className="resumoTexto">
                {atividade.n === 1 ? atividade.nome : `${atividade.n} envios`} ·{' '}
                {Math.round(atividade.progress * 100)}%
              </span>
              <span className="barra resumoBarra">
                <span
                  className="barraCheia"
                  style={{ '--p': atividade.progress } as React.CSSProperties}
                />
              </span>
            </span>
          )}
        </>
      )
    case 'atividade': {
      const a = atividade.atividade
      const titulo = atividade.n > 1 ? `${a.title} +${atividade.n - 1}` : a.title
      return (
        <>
          <span className="resumoIcone" data-nivel="ok" data-viva="sim">
            <Glifo nome={glifoDaOrigem(a.source)} tamanho={14} />
          </span>
          {a.progress !== null ? (
            <span className="resumoEnvio" title={a.detail || a.title}>
              <span className="resumoTexto">
                {titulo} · {Math.round(a.progress * 100)}%
              </span>
              <span className="barra resumoBarra">
                <span className="barraCheia" style={{ '--p': a.progress } as React.CSSProperties} />
              </span>
            </span>
          ) : (
            <span className="resumoTexto" title={a.detail || a.title}>
              {titulo}
            </span>
          )}
        </>
      )
    }
    case 'download':
      return (
        <>
          <span className="resumoIcone" data-nivel="ok">
            <Glifo nome="DownloadSimple" tamanho={14} />
          </span>
          <span className="resumoTexto" title={atividade.nome}>
            {atividade.n === 1 ? atividade.nome : `${atividade.n} downloads`}
          </span>
        </>
      )
    case 'agente':
      return (
        <button
          type="button"
          className="resumoBotao"
          title={`${atividade.texto} — clique para abrir o Halo`}
          onClick={(e) => {
            e.stopPropagation()
            aoAgir('halo-tela')
          }}
        >
          <span className="resumoIcone" data-nivel="ok">
            <Glifo nome="Sparkle" tamanho={14} />
          </span>
          <span className="resumoTexto">{atividade.texto}</span>
        </button>
      )
    case 'mic':
      return (
        <>
          <span className="pontoMic" />
          <span className="resumoTexto" title={atividade.quem}>
            Microfone · {atividade.quem}
          </span>
        </>
      )
  }
}

/** A bolha: a segunda atividade, destacada à direita da pílula. */
function Bolha({
  ref,
  atividade,
  aoAgir,
}: {
  ref: React.RefObject<HTMLDivElement | null>
  atividade: Atividade | null
  aoAgir: Agir
}) {
  const [ultima, setUltima] = useState<Atividade | null>(atividade)
  // Ao sumir, a bolha encolhe com o conteúdo antigo ainda dentro.
  useEffect(() => {
    if (atividade) setUltima(atividade)
  }, [atividade])
  const a = atividade ?? ultima
  const nivel =
    a?.tipo === 'mic' ||
    a?.tipo === 'timer' ||
    a?.tipo === 'aprovacao' ||
    (a?.tipo === 'envio' && a.pendente)
      ? 'alerta'
      : 'ok'
  return (
    <div
      ref={ref}
      className="bolha"
      data-viva={atividade ? 'sim' : 'nao'}
      data-nivel={nivel}
      aria-hidden={!atividade}
    >
      {a?.tipo === 'mic' ? (
        <span className="pontoMic" />
      ) : a?.tipo === 'aprovacao' ? (
        <Glifo nome="Sparkle" tamanho={14} />
      ) : a?.tipo === 'timer' ? (
        <span className="bolhaTexto">
          <Contagem timer={a.timer} curta />
        </span>
      ) : a?.tipo === 'download' ? (
        <Glifo nome="DownloadSimple" tamanho={14} />
      ) : a?.tipo === 'atividade' ? (
        <Glifo nome={glifoDaOrigem(a.atividade.source)} tamanho={14} />
      ) : a?.tipo === 'envio' ? (
        <Glifo nome={a.pendente ? 'WarningCircle' : 'CloudArrowUp'} tamanho={14} />
      ) : a?.tipo === 'agente' ? (
        <button
          type="button"
          className="resumoBotao"
          title={a.texto}
          onClick={() => aoAgir('halo-tela')}
        >
          <Glifo nome="Sparkle" tamanho={14} />
        </button>
      ) : a?.tipo === 'midia' ? (
        <Ondas parado={!a.tocando} />
      ) : null}
    </div>
  )
}

/**
 * As cinco barras. Com o espectro ligado e algo tocando, cada barra segue o
 * nível medido da faixa dela (ver `island/espectro.ts`); sem medida, dançam
 * pela animação de sempre.
 */
function Ondas({ parado, className }: { parado: boolean; className?: string }) {
  const niveis = useEspectro()
  const medido = !parado && niveis.length === 5
  return (
    <span
      className={`ondas ${className ?? ''}`}
      data-parado={parado ? 'sim' : 'nao'}
      data-medido={medido ? 'sim' : 'nao'}
      aria-hidden="true"
    >
      {[0, 1, 2, 3, 4].map((n) => (
        <i key={n} style={medido ? { transform: `scaleY(${niveis[n] ?? 0.1})` } : undefined} />
      ))}
    </span>
  )
}

/**
 * A contagem do temporizador (para baixo) ou do cronômetro (para cima).
 * Conta sozinha, segundo a segundo, a partir do instante em que acaba: o
 * instantâneo bate a cada 2s e uma contagem nesse ritmo pularia números.
 */
function Contagem({ timer, curta }: { timer: IslandTimer; curta?: boolean }) {
  const texto = useContagem(timer)
  return <Rolar texto={curta && texto.length > 4 ? texto.slice(0, -3) : texto} />
}

function useContagem(timer: IslandTimer | null): string {
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => {
    if (!timer) return
    const relogio = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(relogio)
  }, [timer])
  if (!timer) return ''
  return mmss((timer.end === null ? agora - timer.start : timer.end - agora) / 1000)
}

/**
 * Números que ROLAM em vez de trocar: cada dígito é uma fita de 0 a 9 (mais
 * um 0 no fim) que desliza até o valor. Do 9 para o 0 a fita segue para a
 * décima casa e, assentada, salta sem transição para a primeira — sem o
 * chicote de nove casas para trás.
 */
function Rolar({ texto }: { texto: string }) {
  return (
    <span className="rolar">
      {[...texto].map((ch, i) =>
        /\d/.test(ch) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a posição É a identidade do dígito
          <Digito key={i} valor={Number(ch)} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: idem
          <span className="rolarFixo" key={i}>
            {ch}
          </span>
        ),
      )}
    </span>
  )
}

const DIGITOS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

function Digito({ valor }: { valor: number }) {
  const [posicao, setPosicao] = useState(valor)
  const [salto, setSalto] = useState(false)
  const anterior = useRef(valor)
  useEffect(() => {
    if (anterior.current === 9 && valor === 0) {
      setPosicao(10)
      const relogio = setTimeout(() => {
        setSalto(true)
        setPosicao(0)
        requestAnimationFrame(() => setSalto(false))
      }, 330)
      anterior.current = valor
      return () => clearTimeout(relogio)
    }
    anterior.current = valor
    setPosicao(valor)
  }, [valor])
  return (
    <span className="rolarCol">
      <span
        className="rolarFita"
        data-salto={salto ? 'sim' : 'nao'}
        style={{ transform: `translateY(${(-posicao * 100) / 11}%)` }}
      >
        {DIGITOS.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fita é fixa
          <span key={i}>{d}</span>
        ))}
      </span>
    </span>
  )
}

/**
 * A chegada: uma luz percorre a borda da pílula uma vez, depois que a gota
 * assentou — o "hello" do boring.notch, em meio segundo.
 */
function Chegada() {
  return (
    <svg className="chegada" aria-hidden="true">
      <rect
        x="0.5"
        y="-20"
        width="calc(100% - 1px)"
        height="calc(100% + 19px)"
        rx="18"
        pathLength="100"
      />
      <rect
        x="0.5"
        y="-20"
        width="calc(100% - 1px)"
        height="calc(100% + 19px)"
        rx="18"
        pathLength="100"
      />
    </svg>
  )
}

/** O anúncio: ícone + texto; o HUD (volume) é ícone + trilha, sem rótulo. */
function Anuncio({ evento }: { evento: IslandEvent }) {
  const hud = evento.kind === 'hud' && evento.ratio !== null && evento.ratio !== undefined
  return (
    <>
      {evento.color ? (
        <span className="amostraCor" style={{ background: evento.color }} />
      ) : (
        <span className="anuncioIcone">
          <Glifo nome={evento.icon} tamanho={16} />
        </span>
      )}
      {hud ? (
        <span className="hudBarra">
          <span className="hudCheia" style={{ '--p': evento.ratio ?? 0 } as React.CSSProperties} />
        </span>
      ) : (
        <>
          <span className="anuncioTexto">{evento.text}</span>
          {evento.detail ? <span className="anuncioDetalhe">{evento.detail}</span> : null}
        </>
      )}
    </>
  )
}

/* ——— A cor da capa ————————————————————————————————————
 *
 * A cor média da capa tinge a onda e o fundo do player. Sai de um canvas de
 * 8×8; só dá para ler imagem `data:` ou com CORS liberado — negada a leitura,
 * a tinta fica a padrão. Nunca um erro.
 */
function useCorDaCapa(art: string | undefined): string | null {
  const [cor, setCor] = useState<string | null>(null)
  useEffect(() => {
    if (!art) {
      setCor(null)
      return
    }
    let vivo = true
    const imagem = new Image()
    imagem.crossOrigin = 'anonymous'
    imagem.onload = () => {
      try {
        const tela = document.createElement('canvas')
        tela.width = 8
        tela.height = 8
        const ctx = tela.getContext('2d')
        if (!ctx) return
        ctx.drawImage(imagem, 0, 0, 8, 8)
        const dados = ctx.getImageData(0, 0, 8, 8).data
        let r = 0
        let g = 0
        let b = 0
        for (let i = 0; i < dados.length; i += 4) {
          r += dados[i] ?? 0
          g += dados[i + 1] ?? 0
          b += dados[i + 2] ?? 0
        }
        const n = dados.length / 4
        const clarear = (v: number) => Math.round(Math.min(255, (v / n) * 0.7 + 90))
        if (vivo) setCor(`rgb(${clarear(r)} ${clarear(g)} ${clarear(b)})`)
      } catch {
        if (vivo) setCor(null)
      }
    }
    imagem.onerror = () => vivo && setCor(null)
    imagem.src = art
    return () => {
      vivo = false
    }
  }, [art])
  return cor
}

/* ——— Painel: a moldura de cada aba ———————————————————————— */

function Painel({ direcao, children }: { direcao: 'esq' | 'dir'; children: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null)
  const [rola, setRola] = useState(false)
  useLayoutEffect(() => {
    const box = el.current
    if (!box) return
    const medir = () => setRola(box.scrollHeight > box.clientHeight + 2)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(box)
    return () => observador.disconnect()
  }, [])
  return (
    <div
      className="painel"
      ref={el}
      data-dir={direcao}
      data-rola={rola ? 'sim' : 'nao'}
      role="tabpanel"
    >
      {children}
    </div>
  )
}

/** O estado vazio, o mesmo em toda aba. */
function Vazio({ glifo, texto }: { glifo: string; texto: string }) {
  return (
    <div className="vazio">
      <Glifo nome={glifo} tamanho={28} />
      <span>{texto}</span>
    </div>
  )
}

/* ——— Cabeçalho do painel: abas e atalhos ——————————————————— */

function Cabeca({
  aba,
  aoEscolher,
  contagens,
  vivo,
  silencio,
  cafeina,
  halo,
  fixa,
  pendentes,
  aoFixar,
  aoAgir,
}: {
  aba: Aba
  aoEscolher: (aba: Aba) => void
  contagens: { gaveta: number; avisos: number; clips: number; claude: number }
  vivo: IslandEvent | null
  silencio: Reading | undefined
  cafeina: Reading | undefined
  halo: Reading | undefined
  fixa: boolean
  pendentes: Set<string>
  aoFixar: () => void
  aoAgir: Agir
}) {
  const barra = useRef<HTMLDivElement>(null)
  const [capsula, setCapsula] = useState<{ x: number; w: number } | null>(null)

  // A cápsula segue o botão ativo — inclusive enquanto os nomes crescem ao
  // pairar, por isso o ResizeObserver na barra inteira.
  useLayoutEffect(() => {
    const b = barra.current
    if (!b) return
    const medir = () => {
      const ativo = b.querySelector<HTMLElement>('[aria-selected="true"]')
      if (ativo) setCapsula({ x: ativo.offsetLeft, w: ativo.offsetWidth })
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(b)
    for (const filho of b.children) observador.observe(filho)
    return () => observador.disconnect()
  }, [])

  const badge = (id: Aba) =>
    id === 'gaveta'
      ? contagens.gaveta
      : id === 'avisos'
        ? contagens.avisos
        : id === 'clips'
          ? contagens.clips
          : id === 'claude'
            ? contagens.claude
            : 0
  const silencioLigado = silencio?.value === 'ligado'
  const cafeinaLigada = cafeina?.value === 'pela ilha'
  const haloNaIlha = halo?.value === 'na ilha'

  return (
    <header className="cabeca" data-hud={vivo ? 'sim' : 'nao'}>
      <div className="abas" ref={barra} role="tablist" aria-label="Abas da ilha">
        {capsula ? (
          <span
            className="abaCapsula"
            style={{ transform: `translateX(${capsula.x}px)`, width: capsula.w }}
          />
        ) : null}
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            className="aba"
            aria-selected={a.id === aba}
            title={a.nome}
            onClick={() => aoEscolher(a.id)}
          >
            {/* O contador mora SOBRE o glifo, como numa tab bar de verdade — e
                não ao lado dele. Ao lado, cada badge custava ~29px de trilho, e
                com quatro contagens grandes as abas passavam por cima dos
                botões da direita: "Cópias 48" caía em cima do café e do
                Sparkle, e a última aba saía da janela. Fora do fluxo, o número
                cresce sem empurrar nada. */}
            <span className="abaGlifo">
              <Glifo nome={a.icone} tamanho={14} cheio={a.id === aba} />
              {badge(a.id) > 0 ? (
                // As fontes já têm teto (20 avisos, 30 cópias, 32 na gaveta),
                // então dois dígitos é o pior caso de hoje. O `99+` é para o
                // dia em que um teto subir sem ninguém lembrar desta medida.
                <span className="abaBadge">{badge(a.id) > 99 ? '99+' : badge(a.id)}</span>
              ) : null}
            </span>
            <span className="abaNome">{a.nome}</span>
          </button>
        ))}
      </div>

      {vivo ? (
        <div className="hudAberto" data-nivel={vivo.level} aria-live="polite">
          {vivo.color ? (
            <span className="amostraCor" style={{ background: vivo.color }} />
          ) : (
            <Glifo nome={vivo.icon} tamanho={14} />
          )}
          {vivo.kind === 'hud' && vivo.ratio !== null && vivo.ratio !== undefined ? (
            <span className="hudBarra">
              <span className="hudCheia" style={{ '--p': vivo.ratio } as React.CSSProperties} />
            </span>
          ) : (
            <span className="hudTexto">
              {vivo.detail ? `${vivo.text} · ${vivo.detail}` : vivo.text}
            </span>
          )}
        </div>
      ) : (
        <div className="cabecaBotoes">
          <button
            type="button"
            className="acao"
            data-ativa={fixa ? 'sim' : 'nao'}
            title={fixa ? 'Soltar (fecha quando o mouse sai)' : 'Segurar aberta'}
            aria-label="Segurar a ilha aberta"
            onClick={aoFixar}
          >
            <Glifo nome="PushPin" tamanho={14} cheio={fixa} />
          </button>
          <button
            type="button"
            className="acao"
            data-ativa={silencioLigado ? 'sim' : 'nao'}
            data-pendente={pendentes.has('silencio-alternar') ? 'sim' : 'nao'}
            title="Não perturbe: silencia as notificações"
            aria-label="Não perturbe"
            onClick={() => aoAgir('silencio-alternar')}
          >
            <Glifo
              nome={silencioLigado ? 'BellSlash' : 'Bell'}
              tamanho={14}
              cheio={silencioLigado}
            />
          </button>
          <button
            type="button"
            className="acao"
            data-ativa={cafeinaLigada ? 'sim' : 'nao'}
            data-pendente={pendentes.has('cafeina-alternar') ? 'sim' : 'nao'}
            title={
              cafeinaLigada
                ? `Cafeína ligada — a tela não apaga (${cafeina?.detail})`
                : 'Cafeína: manter a tela acordada'
            }
            aria-label="Cafeína: manter a tela acordada"
            onClick={() => aoAgir('cafeina-alternar')}
          >
            <Glifo nome="Coffee" tamanho={14} cheio={cafeinaLigada} />
          </button>
          {/* O quarto botão era "Abrir o Halo", e não funcionava: a janela vive
              na camada do papel de parede, e "trazer para a frente" não existe
              lá — o clique não fazia nada e nada dizia por quê. No lugar dele,
              o gesto que a linha do Halo no Início já faz, com o MESMO glifo:
              recolher para a ilha, e trazer de volta. Os quatro botões do
              cabeçalho passam a ser quatro alternâncias, que é o que eles
              parecem ser. */}
          <button
            type="button"
            className="acao"
            data-ativa={haloNaIlha ? 'sim' : 'nao'}
            data-pendente={
              pendentes.has('halo-recolher') || pendentes.has('halo-trazer') ? 'sim' : 'nao'
            }
            title={
              haloNaIlha
                ? 'A janela do Halo está na ilha — clique (ou Meta+Espaço) a traz de volta'
                : 'Recolher a janela do Halo para a ilha — clique, ou Meta+Espaço'
            }
            aria-label={haloNaIlha ? 'Trazer o Halo de volta' : 'Recolher o Halo para a ilha'}
            onClick={() => aoAgir(haloNaIlha ? 'halo-trazer' : 'halo-recolher')}
          >
            {/* Sem `cheio`: a marca do Halo é desenho nosso e não tem peso —
                quem acende é o `data-ativa`, como nos outros três. */}
            <Glifo nome="Halo" tamanho={14} />
          </button>
        </div>
      )}
    </header>
  )
}

/* ——— Início ————————————————————————————————————————————
 *
 * A "Home", organizada como a Apple organiza Control Center + Now Playing:
 * o player de largura inteira sentado no preto; embaixo, três blocos —
 * conectividade (lista com ícone em círculo), ferramentas (tiles) e o
 * temporizador (tile que mostra o tempo grande); e o lançador como um campo
 * de largura inteira. Tudo é ação de um clique.
 */
function Inicio({
  direcao,
  modulos,
  timer,
  lyrics,
  at,
  pendentes,
  aoAgir,
  aoAbrirModulo,
}: {
  direcao: 'esq' | 'dir'
  modulos: IslandModule[]
  timer: IslandTimer | null
  lyrics: IslandLyricLine[] | null
  at: number
  pendentes: Set<string>
  aoAgir: Agir
  aoAbrirModulo: (id: string) => void
}) {
  const por = (id: string) => modulos.find((m) => m.id === id)
  const midia = por('midia')
  const audio = por('audio')
  const rede = por('rede')
  const bluetooth = por('bluetooth')
  const avisos = por('avisos')
  const desktop = por('desktop')

  const volume = leitura(audio, 'volume')
  const mudo = volume?.value === 'mudo'
  const micMudo = leitura(audio, 'mic-mudo')?.value === 'mudo'
  const tocando = leitura(midia, 'midia-tocando')
  const nadaTocando = !tocando || tocando.value === 'nada'
  const conexao = leitura(rede, 'rede-conexao')
  const wifi = Boolean(leitura(rede, 'wifi-sinal'))
  const bt = leitura(bluetooth, 'bluetooth')
  const btLigado = bt?.value === 'ligado'
  const silencio = leitura(avisos, 'silencio')?.value === 'ligado'
  const cafeina = leitura(desktop, 'cafeina')?.value === 'pela ilha'
  // O próprio app: recolhido na ilha, ou à vista. Vem da leitura do módulo
  // (`island/halo.ts` → `halo-na-ilha`) e não de uma prop nova — é um estado
  // do sistema como o Wi-Fi, e chega pelo mesmo caminho de todos eles.
  const haloNaIlha = leitura(por('halo'), 'halo-na-ilha')?.value === 'na ilha'

  // O celular ao alcance e o pendrive com mídia entram na lista de
  // conectividade só quando existem — o Control Center não mostra o que não há.
  const celular = leitura(por('celular'), 'celular-dispositivo')
  const celularPerto = celular && celular.level === 'ok' && celular.value !== 'nenhum'
  const bateriaCelular = leitura(por('celular'), 'celular-bateria')
  const pendrive = volumesDe(por('discos')).find((v) => v.tamanho !== 'sem mídia')

  const ferramentas: {
    id: string
    nome: string
    icone: string
    ativa?: boolean
    modulo: string
  }[] = [
    {
      id: 'volume-mudo',
      nome: mudo ? 'Som: mudo' : 'Silenciar o som',
      icone: mudo ? 'SpeakerSlash' : 'SpeakerHigh',
      ativa: mudo,
      modulo: 'audio',
    },
    {
      id: 'mic-mudo-alternar',
      nome: micMudo ? 'Microfone: mudo' : 'Silenciar o microfone',
      icone: micMudo ? 'MicrophoneSlash' : 'Microphone',
      ativa: micMudo,
      modulo: 'audio',
    },
    {
      id: 'cafeina-alternar',
      nome: cafeina ? 'Cafeína ligada — a tela não apaga' : 'Cafeína: manter a tela acordada',
      icone: 'Coffee',
      ativa: cafeina,
      modulo: 'desktop',
    },
    {
      id: 'kde-mostrar-desktop',
      nome: 'Mostrar a área de trabalho',
      icone: 'Desktop',
      modulo: 'desktop',
    },
    { id: 'kde-captura', nome: 'Capturar a tela (Spectacle)', icone: 'Camera', modulo: 'desktop' },
    { id: 'kde-bloquear', nome: 'Bloquear a tela agora', icone: 'Lock', modulo: 'desktop' },
  ]

  return (
    <Painel direcao={direcao}>
      <div className="inicio">
        {nadaTocando ? (
          <Panorama modulos={modulos} aoAbrirModulo={aoAbrirModulo} />
        ) : (
          <Player
            modulo={midia}
            volume={volume}
            lyrics={lyrics}
            at={at}
            aoAgir={aoAgir}
            aoAbrir={() => aoAbrirModulo('midia')}
          />
        )}

        <div className="inicioGrade">
          <div className="bloco cascata" style={{ '--i': 0 } as React.CSSProperties}>
            {/* O Halo primeiro, e em destaque: é o app a que a ilha pertence,
                e o gesto que o usuário pediu (Meta+Space) mora aqui em forma
                de clique. Aceso = a janela está DENTRO da ilha. */}
            <Linha
              icone="Halo"
              nome="Halo"
              // Curto como as vizinhas (o nome da rede, "nada conectado"): a linha
              // tem ~120px e o resto é cortado. O que fazer com o clique está
              // no `title`, que é onde as outras também explicam.
              estado={haloNaIlha ? 'na ilha' : 'à vista'}
              ativa={haloNaIlha}
              pendente={pendentes.has('halo-recolher') || pendentes.has('halo-trazer')}
              title={
                haloNaIlha
                  ? 'A janela do Halo está na ilha — clique (ou Meta+Espaço) a traz de volta'
                  : 'Recolher a janela do Halo para a ilha — clique, ou Meta+Espaço'
              }
              onClick={() => aoAgir(haloNaIlha ? 'halo-trazer' : 'halo-recolher')}
              onContextMenu={() => aoAbrirModulo('halo')}
            />
            <Linha
              icone={wifi ? 'WifiHigh' : 'WifiSlash'}
              nome="Wi-Fi"
              estado={wifi ? (conexao?.value ?? 'ligado') : 'desligado'}
              ativa={wifi}
              pendente={pendentes.has('wifi-alternar')}
              title="Wi-Fi — botão direito abre o painel de rede"
              onClick={() => aoAgir('wifi-alternar')}
              onContextMenu={() => aoAbrirModulo('rede')}
            />
            <Linha
              icone="Bluetooth"
              nome="Bluetooth"
              estado={btLigado ? bt?.detail || 'ligado' : 'desligado'}
              ativa={btLigado}
              pendente={pendentes.has('bluetooth-alternar')}
              title="Bluetooth — botão direito abre o painel"
              onClick={() => aoAgir('bluetooth-alternar')}
              onContextMenu={() => aoAbrirModulo('bluetooth')}
            />
            <Linha
              icone={silencio ? 'BellSlash' : 'Bell'}
              nome="Silêncio"
              estado={silencio ? 'não perturbe' : 'notificações'}
              ativa={silencio}
              pendente={pendentes.has('silencio-alternar')}
              title="Não perturbe: silencia as notificações — botão direito abre os avisos"
              onClick={() => aoAgir('silencio-alternar')}
              onContextMenu={() => aoAbrirModulo('avisos')}
            />
            {celularPerto ? (
              <Linha
                icone="DeviceMobile"
                nome={celular.value}
                estado={
                  bateriaCelular && bateriaCelular.value !== '—'
                    ? `bateria ${bateriaCelular.value}${bateriaCelular.detail === 'carregando' ? ' ⚡' : ''}`
                    : 'KDE Connect'
                }
                ativa
                pendente={pendentes.has('celular-ping')}
                title="Celular pelo KDE Connect — clique manda um ping; botão direito abre o painel"
                onClick={() => aoAgir('celular-ping')}
                onContextMenu={() => aoAbrirModulo('celular')}
              />
            ) : null}
            {pendrive ? (
              <Linha
                icone="Usb"
                nome={pendrive.rotulo || pendrive.nome}
                estado={pendrive.ponto ? 'montado · clique ejeta' : 'clique ejeta'}
                ativa={Boolean(pendrive.ponto)}
                pendente={pendentes.has('disco-ejetar')}
                title={`${pendrive.nome} · ${pendrive.tamanho} — clique ejeta com segurança; botão direito abre o painel`}
                onClick={() => aoAgir('disco-ejetar', pendrive.device)}
                onContextMenu={() => aoAbrirModulo('discos')}
              />
            ) : null}
          </div>

          <div className="bloco ferramentas cascata" style={{ '--i': 1 } as React.CSSProperties}>
            {ferramentas.map((f) => (
              <button
                key={f.id}
                type="button"
                className="tile"
                data-ativa={f.ativa ? 'sim' : 'nao'}
                data-pendente={pendentes.has(f.id) ? 'sim' : 'nao'}
                title={`${f.nome} — botão direito abre o painel`}
                aria-label={f.nome}
                onClick={() => aoAgir(f.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  aoAbrirModulo(f.modulo)
                }}
              >
                <Glifo nome={f.icone} tamanho={16} cheio={f.ativa} />
              </button>
            ))}
          </div>

          <div className="bloco cronometro cascata" style={{ '--i': 2 } as React.CSSProperties}>
            <Temporizador timer={timer} foco={por('foco')} aoAgir={aoAgir} />
          </div>
        </div>

        <div className="cascata" style={{ '--i': 3 } as React.CSSProperties}>
          <Lancador aoAgir={aoAgir} />
        </div>
      </div>
    </Painel>
  )
}

function Linha({
  icone,
  nome,
  estado,
  ativa,
  pendente,
  title,
  onClick,
  onContextMenu,
}: {
  icone: string
  nome: string
  estado: string
  ativa: boolean
  pendente: boolean
  title: string
  onClick: () => void
  onContextMenu: () => void
}) {
  return (
    <button
      type="button"
      className="linha"
      data-ativa={ativa ? 'sim' : 'nao'}
      data-pendente={pendente ? 'sim' : 'nao'}
      title={title}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu()
      }}
    >
      <span className="linhaIcone">
        <Glifo nome={icone} tamanho={14} cheio={ativa} />
      </span>
      <span className="linhaTexto">
        <span className="linhaNome">{nome}</span>
        <span className="linhaEstado">{estado}</span>
      </span>
    </button>
  )
}

/**
 * O player da home: capa 60 com o fundo desfocado da própria capa, título
 * em letreiro quando não cabe, a onda, progresso com os tempos, controles
 * com o volume ao lado. Sem card: é uma Live Activity, senta no preto.
 */
function Player({
  modulo,
  volume,
  lyrics,
  at,
  aoAgir,
  aoAbrir,
}: {
  modulo: IslandModule | undefined
  volume: Reading | undefined
  lyrics: IslandLyricLine[] | null
  at: number
  aoAgir: Agir
  aoAbrir: () => void
}) {
  const tocando = leitura(modulo, 'midia-tocando')
  const estado = leitura(modulo, 'midia-estado')
  const progresso = leitura(modulo, 'midia-progresso')
  const nada = !tocando || tocando.value === 'nada'
  const toca = estado?.value === 'tocando'
  const linha = useLinhaDaLetra(lyrics, progresso, toca, at)
  const posicao = usePosicao(progresso, toca, at)

  return (
    <div
      className="player cascata"
      data-tocando={toca ? 'sim' : 'nao'}
      style={{ '--i': 0 } as React.CSSProperties}
    >
      {tocando?.art ? <img className="playerFundo" src={tocando.art} alt="" /> : null}
      <div className="playerLinha">
        <button
          type="button"
          className="playerCapaAlvo"
          onClick={aoAbrir}
          title="Abrir o painel de mídia"
        >
          <Capa art={tocando?.art} />
        </button>
        <span className="playerTitulos">
          <Letreiro
            className="playerTitulo"
            texto={nada ? 'Nada tocando' : (tocando?.value ?? '')}
          />
          <Letreiro
            className="playerArtista"
            texto={nada ? 'abra um player e ele aparece aqui' : (tocando?.detail ?? '')}
          />
          {linha?.text ? (
            <span className="playerLetra" key={linha.at}>
              {linha.text}
            </span>
          ) : null}
        </span>
        {!nada ? <Ondas parado={!toca} className="playerOndas" /> : null}
      </div>

      {!nada && progresso ? (
        <div className="playerProgresso">
          <Barra
            ratio={posicao.ratio}
            tinta
            aoBuscar={(razao) => buscar(progresso, razao, aoAgir)}
          />
          <span className="midiaTempos">
            <span>{mmss(posicao.segundos)}</span>
            <span>-{mmss(posicao.duracao - posicao.segundos)}</span>
          </span>
        </div>
      ) : null}

      <div className="playerControles">
        <button
          type="button"
          className="acao"
          aria-label="Anterior"
          onClick={() => aoAgir('midia-anterior')}
        >
          <Glifo nome="SkipBack" tamanho={18} cheio />
        </button>
        <button
          type="button"
          className="acao playerTocar"
          aria-label="Tocar ou pausar"
          onClick={() => aoAgir('midia-alternar')}
        >
          <Glifo nome={toca ? 'Pause' : 'Play'} tamanho={22} cheio />
        </button>
        <button
          type="button"
          className="acao"
          aria-label="Próxima"
          onClick={() => aoAgir('midia-proxima')}
        >
          <Glifo nome="SkipForward" tamanho={18} cheio />
        </button>
        <Volume reading={volume} aoAgir={aoAgir} />
      </div>
    </div>
  )
}

/* ——— O panorama: a home sem player ——————————————————————
 *
 * Sem nada tocando, um player com três botões mortos e "Nada tocando" é um
 * espaço vazio no lugar mais nobre do painel. No lugar dele entra o que a
 * máquina sabe agora: hora e data, o clima quando o serviço responde, e os
 * medidores vivos (processador, memória, temperatura, rede) — cada um abre o
 * módulo de onde veio. Só leitura real: medidor sem fonte não aparece, em
 * vez de mostrar um "0%" inventado.
 */
function Panorama({
  modulos,
  aoAbrirModulo,
}: {
  modulos: IslandModule[]
  aoAbrirModulo: (id: string) => void
}) {
  const por = (id: string) => modulos.find((m) => m.id === id)
  const tempo = por('tempo')
  const hora = leitura(tempo, 'relogio-hora')?.value ?? '—'
  // "terça-feira, 01 de setembro" não cabe ao lado dos medidores; sem o
  // "-feira" cabe, e a primeira letra sobe como numa frase.
  const dataCrua = (leitura(tempo, 'relogio-data')?.value ?? '').replace('-feira', '')
  const data = dataCrua.charAt(0).toUpperCase() + dataCrua.slice(1)
  const clima = leitura(tempo, 'clima-temp')
  const ceu = leitura(tempo, 'clima-condicao')
  const temClima = Boolean(clima && clima.level === 'ok' && clima.value !== '—')
  // Os relógios de outros fusos (`nome hora;…`), quando o usuário escolheu algum.
  const mundo = leitura(tempo, 'relogio-mundo')
  const fusos = mundo && mundo.value !== 'nenhum' ? mundo.detail.split(';').filter(Boolean) : []

  const medidas = [
    { reading: leitura(por('sistema'), 'cpu'), icone: 'Cpu', modulo: 'sistema' },
    { reading: leitura(por('sistema'), 'memoria'), icone: 'Memory', modulo: 'sistema' },
    { reading: leitura(por('sistema'), 'temp-cpu'), icone: 'Thermometer', modulo: 'sistema' },
    { reading: leitura(por('gpu'), 'gpu-uso'), icone: 'GraphicsCard', modulo: 'gpu' },
    { reading: leitura(por('rede'), 'rede-baixando'), icone: 'DownloadSimple', modulo: 'rede' },
  ]
    .filter((m): m is typeof m & { reading: Reading } => Boolean(m.reading))
    .slice(0, 4)

  return (
    <div className="panorama cascata" style={{ '--i': 0 } as React.CSSProperties}>
      <button
        type="button"
        className="panoramaRelogio"
        onClick={() => aoAbrirModulo('tempo')}
        title="Abrir relógio e clima"
      >
        <span className="panoramaHora">{hora}</span>
        <span className="panoramaData">{data}</span>
        {temClima ? (
          <span className="panoramaClima">
            <Glifo nome="CloudSun" tamanho={14} />
            {clima?.value}
            {ceu?.value ? ` · ${ceu.value}` : ''}
          </span>
        ) : null}
        {fusos.length > 0 ? (
          <span className="panoramaFusos">
            {fusos.slice(0, 3).map((f) => (
              <span key={f} className="panoramaFuso">
                {f}
              </span>
            ))}
          </span>
        ) : null}
      </button>
      <div className="panoramaMedidas">
        {medidas.map((m, indice) => (
          <button
            key={m.reading.id}
            type="button"
            className="medida cascata"
            data-nivel={m.reading.level}
            style={{ '--i': indice + 1 } as React.CSSProperties}
            onClick={() => aoAbrirModulo(m.modulo)}
            title={`${m.reading.label} — ${m.reading.detail}`}
          >
            <span className="medidaTopo">
              <Glifo nome={m.icone} tamanho={14} />
              <span className="medidaNome">{m.reading.label}</span>
            </span>
            <span className="medidaValor">{m.reading.value}</span>
            <i
              className="medidaBarra"
              style={{ '--razao': m.reading.ratio ?? 0 } as React.CSSProperties}
              data-vazia={m.reading.ratio === null ? 'sim' : 'nao'}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

/** A capa com a troca animada: a nova cresce por cima, a velha se afasta. */
function Capa({ art }: { art: string | undefined }) {
  const [antiga, setAntiga] = useState<string | null>(null)
  const vista = useRef(art)
  useEffect(() => {
    if (vista.current && vista.current !== art) {
      setAntiga(vista.current)
      const relogio = setTimeout(() => setAntiga(null), 200)
      vista.current = art
      return () => clearTimeout(relogio)
    }
    vista.current = art
  }, [art])
  if (!art) {
    return (
      <span className="playerCapaVazia">
        <Glifo nome="MusicNotes" tamanho={24} />
      </span>
    )
  }
  return (
    <>
      {antiga ? <img className="playerCapa" src={antiga} alt="" data-saindo="sim" /> : null}
      <img
        className="playerCapa"
        src={art}
        alt=""
        key={art}
        data-entrando={antiga ? 'sim' : 'nao'}
      />
    </>
  )
}

/** Clicar na barra de progresso leva a faixa àquele ponto (o scrub dos apps de notch). */
function buscar(progresso: Reading, razao: number, aoAgir: Agir): void {
  const duracao = segundos(progresso.detail)
  if (duracao === null) return
  aoAgir('midia-buscar', String(Math.round(razao * duracao)))
}

/**
 * A posição da faixa AGORA: o instantâneo dá a posição a cada 2s, e entre um
 * e outro ela é extrapolada pelo relógio enquanto toca — senão a barra
 * andaria aos trancos.
 */
function usePosicao(progresso: Reading | undefined, tocando: boolean, at: number) {
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => {
    if (!tocando) return
    const relogio = setInterval(() => setAgora(Date.now()), 500)
    return () => clearInterval(relogio)
  }, [tocando])
  const base = segundos(progresso?.value ?? '') ?? 0
  const duracao = segundos(progresso?.detail ?? '') ?? 0
  const s = Math.min(
    duracao || Number.POSITIVE_INFINITY,
    base + (tocando ? Math.max(0, agora - at) / 1000 : 0),
  )
  return { segundos: s, duracao, ratio: duracao > 0 ? Math.max(0, Math.min(1, s / duracao)) : 0 }
}

/** A linha da letra que vale AGORA. */
function useLinhaDaLetra(
  lyrics: IslandLyricLine[] | null,
  progresso: Reading | undefined,
  tocando: boolean,
  at: number,
): IslandLyricLine | null {
  const posicao = usePosicao(progresso, tocando, at)
  if (!lyrics || !progresso) return null
  let atual: IslandLyricLine | null = null
  for (const l of lyrics) {
    if (l.at <= posicao.segundos) atual = l
    else break
  }
  return atual
}

/**
 * O controle deslizante de volume. Enquanto o usuário arrasta, o valor é o
 * dele — o instantâneo que chega no meio não pode puxar o botão de volta.
 */
function Volume({ reading, aoAgir }: { reading: Reading | undefined; aoAgir: Agir }) {
  const [arrastando, setArrastando] = useState<number | null>(null)
  const ultimo = useRef(0)
  const nivel = arrastando ?? Math.round((reading?.ratio ?? 0) * 100)
  const mudo = reading?.value === 'mudo'

  return (
    <label className="volume" title={mudo ? 'Mudo' : `Volume ${nivel}%`}>
      <Glifo
        nome={mudo ? 'SpeakerSlash' : nivel > 50 ? 'SpeakerHigh' : 'SpeakerLow'}
        tamanho={14}
      />
      <input
        type="range"
        min={0}
        max={100}
        value={nivel}
        aria-label="Volume"
        style={{ '--v': `${nivel}%` } as React.CSSProperties}
        onChange={(e) => {
          const valor = Number(e.target.value)
          setArrastando(valor)
          const agora = Date.now()
          if (agora - ultimo.current > 100) {
            ultimo.current = agora
            aoAgir('volume-definir', String(valor))
          }
        }}
        onPointerUp={() => {
          if (arrastando !== null) aoAgir('volume-definir', String(arrastando))
          setTimeout(() => setArrastando(null), 1200)
        }}
      />
    </label>
  )
}

/** Texto que rola quando não cabe — o marquee do boring.notch. */
function Letreiro({ texto, className }: { texto: string; className: string }) {
  const caixa = useRef<HTMLSpanElement>(null)
  const [longo, setLongo] = useState(false)
  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => {
      const trecho = el.querySelector<HTMLElement>('.letreiroTrilho > span')
      setLongo((trecho?.offsetWidth ?? 0) > el.clientWidth + 2)
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])
  return (
    <span
      className={`letreiro ${className}`}
      data-longo={longo ? 'sim' : 'nao'}
      ref={caixa}
      title={texto}
    >
      <span className="letreiroTrilho">
        <span>{texto}</span>
        {longo ? <span aria-hidden="true">{texto}</span> : null}
      </span>
    </span>
  )
}

/** O temporizador: o tempo grande; sem contagem, os presets, o cronômetro e o foco da semana. */
function Temporizador({
  timer,
  foco,
  aoAgir,
}: {
  timer: IslandTimer | null
  foco: IslandModule | undefined
  aoAgir: Agir
}) {
  const contagem = useContagem(timer)
  const cronometro = timer?.end === null
  const restante =
    timer?.end != null ? Math.max(0, timer.end - Date.now()) / (timer.minutes * 60_000) : 0
  return (
    <>
      <span className="cronometroTopo">
        <Glifo nome={cronometro ? 'Hourglass' : 'Timer'} tamanho={12} />
        {cronometro ? 'Cronômetro' : 'Temporizador'}
      </span>
      {timer ? (
        <div className="cronometroVivo">
          <span className="cronometroTempo">
            <Rolar texto={contagem} />
          </span>
          <span className="cronometroRotulo">
            {timer.label || (cronometro ? 'contando' : `${timer.minutes} min`)}
          </span>
          {!cronometro ? <Barra ratio={restante} tinta /> : null}
          <div className="cronometroPresets">
            <button type="button" className="acaoLarga" onClick={() => aoAgir('timer-parar')}>
              <Glifo nome="Stop" tamanho={12} cheio />
              Parar
            </button>
          </div>
        </div>
      ) : (
        <div className="cronometroPresets">
          {[5, 15, 25, 50].map((min) => (
            <button
              key={min}
              type="button"
              className="acaoLarga"
              title={min === 25 ? 'Um pomodoro: 25 minutos de foco' : `${min} minutos`}
              onClick={() => aoAgir('timer-iniciar', `${min} ${min === 25 ? 'foco' : ''}`.trim())}
            >
              {min === 25 ? '25 · foco' : `${min} min`}
            </button>
          ))}
          <button
            type="button"
            className="acaoLarga"
            title="Cronômetro: conta para cima"
            onClick={() => aoAgir('timer-cronometro')}
          >
            <Glifo nome="Hourglass" tamanho={12} />
            Cronômetro
          </button>
          <FocoSemana modulo={foco} compacto />
        </div>
      )}
    </>
  )
}

/**
 * Os sete dias de foco: uma barra por dia, hoje à direita — o "focus
 * chart" do Notchy. Só sessões que chegaram ao fim contam (ver `foco.ts`).
 */
function FocoSemana({
  modulo,
  compacto,
}: {
  modulo: IslandModule | undefined
  compacto?: boolean
}) {
  const semana = leitura(modulo, 'foco-semana')
  const hoje = leitura(modulo, 'foco-hoje')
  const sequencia = leitura(modulo, 'foco-sequencia')
  if (!semana) return null
  const dias = semana.detail.split('·').map((n) => Number(n) || 0)
  if (dias.length !== 7) return null
  const maior = Math.max(...dias, 1)
  const total = dias.reduce((a, b) => a + b, 0)
  if (compacto && total === 0) return null
  // A letra de cada dia, do mais antigo para hoje.
  const letras = [...Array(7)].map((_, n) =>
    new Date(Date.now() - (6 - n) * 86_400_000)
      .toLocaleDateString('pt-BR', { weekday: 'narrow' })
      .toUpperCase(),
  )
  return (
    <span
      className="focoGrafico"
      data-compacto={compacto ? 'sim' : 'nao'}
      title={`${semana.label}: ${semana.value} · ${hoje?.value ?? ''} hoje`}
    >
      <span className="focoBarras">
        {dias.map((min, n) => (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: a posição É o dia
            key={n}
            data-hoje={n === 6 ? 'sim' : 'nao'}
            data-vazio={min === 0 ? 'sim' : 'nao'}
            style={{ '--h': min / maior } as React.CSSProperties}
            title={`${letras[n]}: ${min} min`}
          />
        ))}
      </span>
      {!compacto ? (
        <span className="focoDias">
          {letras.map((l, n) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: idem
            <span key={n}>{l}</span>
          ))}
        </span>
      ) : null}
      <span className="focoLegenda">
        {hoje?.value ?? '0 min'} hoje
        {sequencia && !/^0 /.test(sequencia.value) ? ` · ${sequencia.value} seguidos` : ''}
      </span>
    </span>
  )
}

/**
 * Os comandos da paleta: o que a ilha sabe fazer, por nome. Casam pelo nome
 * ou pelas palavras-chave, sem acento — "cafeina", "ocr", "lock".
 */

/**
 * O lançador — e a paleta de comandos. Digitar filtra os aplicativos
 * instalados E o que a ilha sabe fazer; um clique (ou Enter) abre ou
 * executa. Recebe o teclado sob demanda (ver `setIslandFocus`).
 */
function Lancador({ aoAgir }: { aoAgir: Agir }) {
  const [apps, setApps] = useState<DesktopApp[] | null>(null)
  const [busca, setBusca] = useState('')
  useEffect(() => {
    if (apps !== null || !busca) return
    void window.halo?.apps
      .list()
      .then(setApps)
      .catch(() => setApps([]))
  }, [busca, apps])

  const termo = busca.trim()
  /*
   * O que o campo resolve — conta, conversão, atalho, emoji, comando, app —
   * vem do MOTOR compartilhado com o lançador de Meta+V (`launcher/motor.ts`).
   * Esta é uma das duas carcaças dele; a outra veste o tema do app.
   */
  const {
    respostas,
    comandos,
    apps: achados,
    chave,
  } = useMemo(() => resolver(termo, { apps }), [termo, apps])

  // O uso vai para o main: é a mesma memória de "recentes" do lançador de
  // Meta+V — mesmo motor, e o que se usa aqui sobe lá também.
  const abrir = (app: DesktopApp) => {
    aoAgir('apps-abrir', app.id)
    window.halo?.launcher.uso({
      chave: chaveDeUso('app', app.id),
      tipo: 'app',
      id: app.id,
      titulo: app.name,
      icone: 'AppWindow',
    })
    setBusca('')
  }
  const rodar = (c: Comando) => {
    aoAgir(c.id, c.arg)
    window.halo?.launcher.uso({
      chave: chaveDeUso('comando', c.id, c.arg),
      tipo: 'comando',
      id: c.id,
      ...(c.arg ? { arg: c.arg } : {}),
      titulo: c.nome,
      icone: c.icone,
    })
    setBusca('')
  }
  /*
   * Uma resposta do campo COPIA ou ABRE, e as duas passam pela ilha.
   *
   * Copiar reusa `clip-escrever`, que já é o caminho da área de transferência
   * (e alimenta a aba Cópias); abrir reusa `abrir-caminho`, que é `gio open` e
   * manda a URL para o navegador do sistema. Nada novo no main: o lançador
   * ganhou vocabulário, não poder.
   */
  const responder = (r: Achado) => {
    if (r.abrir) aoAgir('abrir-caminho', r.abrir)
    else if (r.copiar) aoAgir('clip-escrever', r.copiar)
    setBusca('')
  }

  return (
    <div className="lancador">
      <label className="lancadorCampo">
        <Glifo nome="MagnifyingGlass" tamanho={14} />
        <input
          type="search"
          placeholder="App, comando, conta, g busca, :emoji — ou ? pergunta ao Claude"
          value={busca}
          aria-label="Buscar aplicativo, comando, conta ou emoji"
          onFocus={() => window.halo?.island.setFocus(true)}
          onBlur={() => window.halo?.island.setFocus(false)}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // A ordem é a MESMA da lista desenhada abaixo: o Enter faz o que
              // está em primeiro lugar na tela, e não uma preferência secreta.
              const resposta = respostas[0]
              const comando = comandos[0]
              const app = achados[0]
              if (resposta) responder(resposta)
              else if (comando) rodar(comando)
              else if (app) abrir(app)
            }
            if (e.key === 'Escape') setBusca('')
          }}
        />
      </label>
      {chave ? (
        <div className="lancadorLista">
          {respostas.map((r, indice) => (
            <button
              // O título é único dentro de uma resposta: há no máximo uma conta e
              // um atalho, e cada emoji aparece uma vez. O índice fora da chave
              // porque a lista se refaz a cada tecla — chave por posição faria o
              // React reaproveitar o nó de uma resposta pela de outra.
              key={r.titulo}
              type="button"
              className="acaoLarga resposta cascata"
              style={{ '--i': indice } as React.CSSProperties}
              title={r.abrir ? `Abrir: ${r.abrir}` : 'Copiar'}
              onClick={() => responder(r)}
            >
              <Glifo nome={r.icone} tamanho={12} />
              <span className="respostaTitulo">{r.titulo}</span>
              {r.detalhe ? <span className="respostaDetalhe">{r.detalhe}</span> : null}
            </button>
          ))}
          {comandos.map((c, indice) => (
            <button
              key={`${c.id}-${c.arg ?? ''}`}
              type="button"
              className="acaoLarga comando cascata"
              style={{ '--i': respostas.length + indice } as React.CSSProperties}
              title={`Comando da ilha: ${c.nome}`}
              onClick={() => rodar(c)}
            >
              <Glifo nome={c.icone} tamanho={12} />
              {c.nome}
            </button>
          ))}
          {achados.map((app, indice) => (
            <button
              key={app.id}
              type="button"
              className="acaoLarga cascata"
              style={{ '--i': respostas.length + comandos.length + indice } as React.CSSProperties}
              title={app.comment ?? app.name}
              onClick={() => abrir(app)}
            >
              {app.name}
            </button>
          ))}
          {apps !== null &&
          achados.length === 0 &&
          comandos.length === 0 &&
          respostas.length === 0 ? (
            <span className="leituraDetalhe">Nenhum aplicativo nem comando com esse nome</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/* ——— Painéis (os módulos) ——————————————————————————————— */

/** Um módulo, resumido. Clicar abre ele inteiro. */
function Card({
  modulo,
  indice,
  aoAbrir,
  aoAgir,
}: {
  modulo: IslandModule
  indice: number
  aoAbrir: () => void
  aoAgir: Agir
}) {
  const principal = modulo.readings[0]
  const segunda = modulo.readings[1]
  // O detalhe não repete o rótulo: se repetiria, mostra a segunda leitura.
  const detalhe =
    principal?.detail && principal.detail !== principal.label
      ? principal.detail
      : (segunda?.value ?? principal?.label ?? '')

  return (
    <div
      className="card cascata"
      data-ok={modulo.ok ? 'sim' : 'nao'}
      style={{ '--i': indice } as React.CSSProperties}
    >
      <button type="button" className="cardAlvo" onClick={aoAbrir} title={`Abrir ${modulo.name}`}>
        <span className="cardTopo">
          <Glifo nome={modulo.icon} tamanho={14} />
          <span className="cardNome">{modulo.name}</span>
        </span>
        {modulo.ok && principal ? (
          <>
            <span className="cardValor">
              {principal.value === 'nada' ? 'Nada tocando' : principal.value}
            </span>
            <span className="cardDetalhe">{detalhe}</span>
            {principal.ratio !== null ? (
              <Barra ratio={principal.ratio} nivel={principal.level} />
            ) : null}
          </>
        ) : (
          <span className="cardDetalhe">{modulo.error ?? 'sem dado'}</span>
        )}
      </button>

      {modulo.actions.length > 0 ? (
        <div className="cardAcoes">
          {modulo.actions.slice(0, 4).map((acao) => (
            <button
              key={acao.id}
              type="button"
              className="acao"
              title={acao.label}
              aria-label={acao.label}
              onClick={() => aoAgir(acao.id)}
            >
              <Glifo nome={acao.icon} tamanho={14} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Um módulo aberto. Mídia tem tela própria; o resto é a grade de leituras. */
function Foco({
  modulo,
  audio,
  lyrics,
  at,
  atividades,
  aoVoltar,
  aoAgir,
}: {
  modulo: IslandModule
  audio: IslandModule | undefined
  lyrics: IslandLyricLine[] | null
  at: number
  atividades: IslandActivity[]
  aoVoltar: () => void
  aoAgir: Agir
}) {
  return (
    <Painel direcao="dir">
      <button type="button" className="focoTopo" onClick={aoVoltar} title="Voltar aos painéis">
        <Glifo nome="CaretLeft" tamanho={14} />
        <Glifo nome={modulo.icon} tamanho={14} />
        <span className="focoNome">{modulo.name}</span>
      </button>

      {modulo.id === 'midia' ? (
        <MidiaFoco modulo={modulo} audio={audio} lyrics={lyrics} at={at} aoAgir={aoAgir} />
      ) : (
        <FocoGenerico modulo={modulo} atividades={atividades} aoAgir={aoAgir} />
      )}
    </Painel>
  )
}

/** Leituras que são LISTA codificada para outro painel: não vão para a grade. */
const CODIFICADAS = new Set(['discos-lista', 'saidas-audio'])

function FocoGenerico({
  modulo,
  atividades,
  aoAgir,
}: {
  modulo: IslandModule
  atividades: IslandActivity[]
  aoAgir: Agir
}) {
  return (
    <>
      {modulo.id === 'foco' ? <FocoSemana modulo={modulo} /> : null}
      <div className="leituras">
        {modulo.readings
          .filter((l) => !CODIFICADAS.has(l.id))
          .map((l, indice) => (
            <div
              className="leitura cascata"
              key={l.id}
              style={{ '--i': indice } as React.CSSProperties}
            >
              <span className="leituraLabel">{l.label}</span>
              <span className="leituraValor" data-nivel={l.level}>
                {l.value}
              </span>
              {l.detail ? (
                <span className="leituraDetalhe">
                  {l.id === 'relogio-mundo' ? l.detail.replace(/;/g, ' · ') : l.detail}
                </span>
              ) : null}
              {l.ratio !== null ? <Barra ratio={l.ratio} nivel={l.level} /> : null}
            </div>
          ))}
        {modulo.readings.length === 0 ? (
          <span className="leituraDetalhe">{modulo.error ?? 'sem dado'}</span>
        ) : null}
      </div>

      {modulo.actions.length > 0 ? (
        <div className="focoAcoes">
          {modulo.actions.map((acao) => (
            <button
              key={acao.id}
              type="button"
              className="acaoLarga"
              onClick={() => aoAgir(acao.id)}
            >
              <Glifo nome={acao.icon} tamanho={14} />
              {acao.label}
            </button>
          ))}
        </div>
      ) : null}

      {modulo.id === 'discos' ? <Removiveis modulo={modulo} aoAgir={aoAgir} /> : null}
      {modulo.id === 'api' ? (
        <Atividades lista={atividades} modulo={modulo} aoAgir={aoAgir} />
      ) : null}

      {modulo.id === 'desktop' ? (
        <div className="focoAcoes">
          <span className="secao">Cafeína por</span>
          {[30, 60, 120, 240].map((min) => (
            <button
              key={min}
              type="button"
              className="acaoLarga"
              onClick={() => aoAgir('cafeina-alternar', String(min))}
            >
              {min < 60 ? `${min} min` : `${min / 60} h`}
            </button>
          ))}
        </div>
      ) : null}
    </>
  )
}

/** Os volumes removíveis: montar, abrir, ejetar — e "pode tirar" quando ejeta. */
function Removiveis({ modulo, aoAgir }: { modulo: IslandModule; aoAgir: Agir }) {
  const volumes = volumesDe(modulo)
  if (volumes.length === 0) return null
  return (
    <div className="lista">
      <span className="secao">Volumes</span>
      {volumes.map((v, indice) => (
        <div
          key={`${v.device}-${v.particao}`}
          className="janela cascata"
          data-ativa={v.ponto ? 'sim' : 'nao'}
          style={{ '--i': indice } as React.CSSProperties}
        >
          <Glifo nome="Usb" tamanho={14} />
          <span className="janelaTitulo" title={`${v.nome} · ${v.particao || v.device}`}>
            {v.rotulo || v.nome}
            <span className="janelaClasse">
              {' '}
              {v.ponto
                ? `${v.ponto}${v.livre ? ` · ${v.livre} livres` : ''}`
                : v.particao
                  ? 'não montado'
                  : v.tamanho}
            </span>
          </span>
          {v.particao && !v.ponto ? (
            <button
              type="button"
              className="acao"
              title="Montar"
              aria-label={`Montar ${v.rotulo}`}
              onClick={() => aoAgir('disco-montar', v.particao)}
            >
              <Glifo nome="Plug" tamanho={14} />
            </button>
          ) : null}
          {v.ponto ? (
            <button
              type="button"
              className="acao"
              title="Abrir no gerenciador de arquivos"
              aria-label={`Abrir ${v.rotulo}`}
              onClick={() => aoAgir('disco-abrir', v.ponto)}
            >
              <Glifo nome="FolderOpen" tamanho={14} />
            </button>
          ) : null}
          <button
            type="button"
            className="acao"
            title="Ejetar com segurança"
            aria-label={`Ejetar ${v.nome}`}
            onClick={() => aoAgir('disco-ejetar', v.device)}
          >
            <Glifo nome="Eject" tamanho={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** As atividades publicadas na API local, com o caminho do socket para quem quer publicar. */
function Atividades({
  lista,
  modulo,
  aoAgir,
}: {
  lista: IslandActivity[]
  modulo: IslandModule
  aoAgir: Agir
}) {
  const socket = leitura(modulo, 'api-socket')
  return (
    <div className="lista">
      {lista.length > 0 ? <span className="secao">Publicadas</span> : null}
      {lista.map((a, indice) => (
        <div
          key={a.id}
          className="janela cascata"
          data-ativa={a.state === 'andamento' ? 'sim' : 'nao'}
          style={{ '--i': indice } as React.CSSProperties}
        >
          <span
            className="atividadeEstado"
            data-estado={a.state}
            data-viva={a.state === 'andamento' ? 'sim' : 'nao'}
          >
            <Glifo
              nome={
                a.state === 'ok'
                  ? 'Check'
                  : a.state === 'erro'
                    ? 'WarningCircle'
                    : glifoDaOrigem(a.source)
              }
              tamanho={14}
            />
          </span>
          <span className="janelaTitulo" title={a.detail || a.title}>
            {a.title}
            <span className="janelaClasse">
              {' '}
              {a.detail || a.source}
              {a.progress !== null ? ` · ${Math.round(a.progress * 100)}%` : ''}
            </span>
          </span>
          <button
            type="button"
            className="acao"
            title="Tirar da lista"
            aria-label={`Tirar ${a.title} da lista`}
            onClick={() => aoAgir('api-atividade-limpar', a.id)}
          >
            <Glifo nome="X" tamanho={12} />
          </button>
        </div>
      ))}
      {socket?.level === 'ok' ? (
        <span className="leituraDetalhe apiDica">
          Publique com tools/ilha-avisar.sh, ou carregue tools/ilha-shell.sh no seu shell para os
          comandos longos aparecerem aqui.
        </span>
      ) : null}
    </div>
  )
}

/** Mídia aberta: a "live activity" — capa grande, progresso, controles, saídas, letra. */
function MidiaFoco({
  modulo,
  audio,
  lyrics,
  at,
  aoAgir,
}: {
  modulo: IslandModule
  audio: IslandModule | undefined
  lyrics: IslandLyricLine[] | null
  at: number
  aoAgir: Agir
}) {
  const tocando = leitura(modulo, 'midia-tocando')
  const estado = leitura(modulo, 'midia-estado')
  const progresso = leitura(modulo, 'midia-progresso')
  const player = leitura(modulo, 'midia-player')
  const modos = leitura(modulo, 'midia-modos')
  const nada = !tocando || tocando.value === 'nada'
  const toca = estado?.value === 'tocando'
  const linha = useLinhaDaLetra(lyrics, progresso, toca, at)
  const posicao = usePosicao(progresso, toca, at)
  const embaralhando = modos?.value === 'embaralhando'
  const repetindo =
    modos?.detail === 'repete a faixa'
      ? 'faixa'
      : modos?.detail === 'repete a lista'
        ? 'lista'
        : null

  return (
    <div className="midiaFoco">
      <div className="midiaLinha">
        {tocando?.art ? (
          <img className="midiaCapa" src={tocando.art} alt="" />
        ) : (
          <span className="midiaCapaVazia">
            <Glifo nome="MusicNotes" tamanho={24} />
          </span>
        )}
        <span className="midiaTitulos">
          <span className="midiaTitulo">{nada ? 'Nada tocando' : tocando?.value}</span>
          <span className="midiaArtista">
            {nada ? 'abra um player e ele aparece aqui' : tocando?.detail}
          </span>
          {player && !nada ? <span className="leituraDetalhe">{player.value}</span> : null}
        </span>
        {!nada ? <Ondas parado={!toca} className="playerOndas" /> : null}
      </div>

      {!nada && progresso ? (
        <div>
          <Barra
            ratio={posicao.ratio}
            tinta
            aoBuscar={(razao) => buscar(progresso, razao, aoAgir)}
          />
          <span className="midiaTempos">
            <span>{mmss(posicao.segundos)}</span>
            <span>-{mmss(posicao.duracao - posicao.segundos)}</span>
          </span>
        </div>
      ) : null}

      <div className="midiaControles">
        <button
          type="button"
          className="acaoLarga"
          aria-label="Anterior"
          onClick={() => aoAgir('midia-anterior')}
        >
          <Glifo nome="SkipBack" tamanho={16} cheio />
        </button>
        <button
          type="button"
          className="acaoLarga"
          aria-label="Tocar ou pausar"
          onClick={() => aoAgir('midia-alternar')}
        >
          <Glifo nome={toca ? 'Pause' : 'Play'} tamanho={18} cheio />
        </button>
        <button
          type="button"
          className="acaoLarga"
          aria-label="Próxima"
          onClick={() => aoAgir('midia-proxima')}
        >
          <Glifo nome="SkipForward" tamanho={16} cheio />
        </button>
        <button
          type="button"
          className="acaoLarga"
          aria-label="Abrir o player"
          title="Trazer o player para a frente"
          onClick={() => aoAgir('midia-abrir')}
        >
          <Glifo nome="ArrowSquareOut" tamanho={16} />
        </button>
        <button
          type="button"
          className="acaoLarga"
          data-ativa={embaralhando ? 'sim' : 'nao'}
          aria-label="Embaralhar"
          title={embaralhando ? 'Embaralhando' : 'Em ordem'}
          onClick={() => aoAgir('midia-embaralhar')}
        >
          <Glifo nome="Shuffle" tamanho={16} />
        </button>
        <button
          type="button"
          className="acaoLarga"
          data-ativa={repetindo ? 'sim' : 'nao'}
          aria-label="Repetir"
          title={
            repetindo === 'faixa'
              ? 'Repete a faixa'
              : repetindo === 'lista'
                ? 'Repete a lista'
                : 'Sem repetir'
          }
          onClick={() => aoAgir('midia-repetir')}
        >
          <Glifo nome="Repeat" tamanho={16} />
          {repetindo === 'faixa' ? <span className="repeteUm">1</span> : null}
        </button>
        <button
          type="button"
          className="acaoLarga"
          aria-label="Copiar o link"
          title="Copiar o link da faixa"
          onClick={() => aoAgir('midia-copiar-link')}
        >
          <Glifo nome="Link" tamanho={16} />
        </button>
      </div>

      <Saidas audio={audio} aoAgir={aoAgir} />

      {lyrics && !nada ? <Letras linhas={lyrics} atual={linha} /> : null}
    </div>
  )
}

/** As saídas de áudio: a ativa acesa, clicar troca (movendo o que toca junto). */
function Saidas({ audio, aoAgir }: { audio: IslandModule | undefined; aoAgir: Agir }) {
  const lista = leitura(audio, 'saidas-audio')?.detail ?? ''
  const atual = leitura(audio, 'saida-audio')?.value ?? ''
  const saidas = lista
    .split(';')
    .filter(Boolean)
    .map((par) => {
      const [nome = '', descricao = ''] = par.split('|')
      return { nome, descricao }
    })
  if (saidas.length < 2) return null
  return (
    <div className="focoAcoes">
      <span className="secao">Saída</span>
      {saidas.map((s) => (
        <button
          key={s.nome}
          type="button"
          className="acaoLarga"
          data-ativa={
            (s.nome.split('.').at(-1) ?? '').replace(/[-_]/g, ' ') === atual ? 'sim' : 'nao'
          }
          title={s.nome}
          onClick={() => aoAgir('audio-definir-saida', s.nome)}
        >
          {nomeDaSaida(s.nome, s.descricao)}
        </button>
      ))}
    </div>
  )
}

/** "… High Definition Audio Controller" é o chip; "HDMI" é a saída. */
function nomeDaSaida(nome: string, descricao: string): string {
  if (/hdmi/i.test(nome)) return 'HDMI'
  if (/analog/i.test(nome)) return 'Alto-falantes'
  if (/usb/i.test(nome)) return 'USB'
  if (/bluez|bluetooth/i.test(nome)) return 'Bluetooth'
  return descricao.length > 28 ? `${descricao.slice(0, 27)}…` : descricao
}

/** A letra inteira, com a linha atual em destaque e sempre à vista. */
function Letras({ linhas, atual }: { linhas: IslandLyricLine[]; atual: IslandLyricLine | null }) {
  const caixa = useRef<HTMLDivElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: rola quando a linha atual muda
  useEffect(() => {
    const box = caixa.current
    const el = box?.querySelector<HTMLElement>('[data-atual="sim"]')
    // Só a caixa da letra rola — `scrollIntoView` arrastaria o painel inteiro.
    if (box && el) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2, behavior: 'smooth' })
  }, [atual])
  return (
    <div className="letras" ref={caixa}>
      {linhas.map((l) => (
        <span
          key={`${l.at}-${l.text}`}
          className="letraLinha"
          data-atual={l === atual ? 'sim' : 'nao'}
          data-passada={atual && l.at < atual.at ? 'sim' : 'nao'}
        >
          {l.text || '♪'}
        </span>
      ))}
      <span className="letraCredito">letras · LRCLIB</span>
    </div>
  )
}

/* ——— O Claude da ilha ————————————————————————————————————
 *
 * Uma conversa: as mensagens do agente da ilha (as últimas), o pedido de
 * permissão parado com "permitir" e "negar", atalhos com o contexto da
 * ilha, e o campo de pergunta. O agente é o mesmo motor da tela do Claude
 * (ver `island/claude.ts`).
 */
function ClaudeFoco({
  estado,
  clips,
  avisos,
  tocando,
  aoAgir,
}: {
  estado: IslandClaude | null
  clips: number
  avisos: number
  tocando: boolean
  aoAgir: Agir
}) {
  const [texto, setTexto] = useState('')
  const caixa = useRef<HTMLDivElement>(null)
  const agente = estado?.agent ?? null
  const mensagens = estado?.messages ?? []
  const pedido = agente?.approval ?? null
  const ocupado = agente?.state === 'pensando' || agente?.state === 'ferramenta'

  // A conversa fica no fim, como um chat.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rola quando chega mensagem
  useEffect(() => {
    const box = caixa.current
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' })
  }, [mensagens.length, agente?.state])

  const enviar = () => {
    const limpo = texto.trim()
    if (!limpo) return
    aoAgir('claude-perguntar', perguntaJson(limpo))
    setTexto('')
  }

  const projetoNome = (p: string) => p.split('/').filter(Boolean).at(-1) ?? p

  return (
    <div className="claudeFoco">
      <div className="claudeTopo">
        <span className="claudeEstado" data-estado={agente?.state ?? 'fechado'}>
          <Glifo nome="Sparkle" tamanho={14} cheio={Boolean(agente)} />
          {agente
            ? agente.state === 'pensando'
              ? 'pensando…'
              : agente.state === 'ferramenta'
                ? `usando ${agente.activity || 'ferramenta'}`
                : agente.state === 'erro'
                  ? 'deu erro'
                  : pedido
                    ? 'esperando você'
                    : 'pronto'
            : 'fechado'}
        </span>
        <span className="claudeProjeto" title={estado?.project ?? ''}>
          {estado ? `${projetoNome(estado.project)} · ${estado.mode}` : ''}
        </span>
        {agente ? (
          <button
            type="button"
            className="acao"
            title="Encerrar a conversa"
            aria-label="Encerrar a conversa"
            onClick={() => aoAgir('claude-parar')}
          >
            <Glifo nome="X" tamanho={12} />
          </button>
        ) : null}
      </div>

      {!agente && estado && estado.projects.length > 1 ? (
        <div className="focoAcoes">
          <span className="secao">Projeto</span>
          {estado.projects.map((p) => (
            <button
              key={p}
              type="button"
              className="acaoLarga"
              data-ativa={p === estado.project ? 'sim' : 'nao'}
              title={p}
              onClick={() => aoAgir('claude-projeto-definir', p)}
            >
              {projetoNome(p)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="claudeConversa" ref={caixa}>
        {mensagens.length === 0 ? (
          <Vazio
            glifo="Sparkle"
            texto="Pergunte algo. O Claude roda no projeto escolhido e vê o que a ilha sabe."
          />
        ) : null}
        {mensagens.slice(-30).map((m) => (
          <Fala key={m.id} mensagem={m} />
        ))}
        {ocupado ? (
          <span className="claudeDigitando" aria-live="polite">
            <i />
            <i />
            <i />
          </span>
        ) : null}
      </div>

      {pedido ? (
        <div className="claudePedido">
          <span className="claudePedidoTitulo">
            <Glifo nome="WarningCircle" tamanho={14} />
            Quer usar {pedido.tool}
          </span>
          <span className="claudePedidoEntrada" title={pedido.input}>
            {pedido.input || pedido.description}
          </span>
          <span className="envioBotoes">
            <button
              type="button"
              className="envioBotao"
              data-cor="acao"
              onClick={() => aoAgir('claude-aprovar', 'sim')}
            >
              Permitir
            </button>
            <button
              type="button"
              className="envioBotao"
              onClick={() => aoAgir('claude-aprovar', 'nao')}
            >
              Negar
            </button>
          </span>
        </div>
      ) : null}

      <div className="claudeAtalhos">
        <button
          type="button"
          className="acaoLarga"
          disabled={clips === 0}
          title={clips === 0 ? 'Nada copiado ainda' : 'O Claude explica o último texto copiado'}
          onClick={() =>
            aoAgir(
              'claude-perguntar',
              perguntaJson('Explique o que é isto, em poucas linhas.', 'clip'),
            )
          }
        >
          <Glifo nome="Clipboard" tamanho={12} />
          Explicar a cópia
        </button>
        <button
          type="button"
          className="acaoLarga"
          disabled={clips === 0}
          title={
            clips === 0 ? 'Nada copiado ainda' : 'Traduz o último texto copiado para o português'
          }
          onClick={() =>
            aoAgir(
              'claude-perguntar',
              perguntaJson('Traduza para o português do Brasil. Só a tradução.', 'clip'),
            )
          }
        >
          <Glifo nome="TextAa" tamanho={12} />
          Traduzir a cópia
        </button>
        <button
          type="button"
          className="acaoLarga"
          disabled={avisos === 0}
          title={avisos === 0 ? 'Nenhuma notificação' : 'Resume as notificações recentes'}
          onClick={() =>
            aoAgir(
              'claude-perguntar',
              perguntaJson('Resuma estas notificações e diga o que merece atenção.', 'avisos'),
            )
          }
        >
          <Glifo nome="BellRinging" tamanho={12} />
          Resumir avisos
        </button>
        <button
          type="button"
          className="acaoLarga"
          disabled={!tocando}
          title={tocando ? 'Conta algo sobre a faixa que toca' : 'Nada tocando'}
          onClick={() =>
            aoAgir(
              'claude-perguntar',
              perguntaJson(
                'Conte, em três linhas, algo interessante sobre esta faixa ou artista.',
                'tocando',
              ),
            )
          }
        >
          <Glifo nome="MusicNotes" tamanho={12} />
          Sobre a faixa
        </button>
      </div>

      <label className="lancadorCampo claudeCampo">
        <Glifo nome="Sparkle" tamanho={14} />
        <input
          type="text"
          placeholder={agente ? 'Continue a conversa…' : 'Pergunte ao Claude…'}
          value={texto}
          aria-label="Pergunta ao Claude"
          onFocus={() => window.halo?.island.setFocus(true)}
          onBlur={() => window.halo?.island.setFocus(false)}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') enviar()
            if (e.key === 'Escape') setTexto('')
          }}
        />
        <button
          type="button"
          className="acao"
          disabled={!texto.trim()}
          title="Enviar"
          aria-label="Enviar"
          onClick={enviar}
        >
          <Glifo nome="PaperPlaneTilt" tamanho={14} />
        </button>
      </label>
    </div>
  )
}

/** Uma fala: o usuário à direita, o Claude à esquerda, ferramenta e sistema como notas. */
function Fala({ mensagem }: { mensagem: AgentMessage }) {
  if (mensagem.role === 'tool' || mensagem.role === 'system') {
    return (
      <span className="claudeNota" data-role={mensagem.role}>
        <Glifo nome={mensagem.role === 'tool' ? 'Lightning' : 'Circle'} tamanho={11} />
        {mensagem.text.slice(0, 120)}
      </span>
    )
  }
  return (
    <div className="claudeFala" data-role={mensagem.role}>
      {mensagem.role === 'assistant' ? <Trechos fonte={mensagem.text} /> : mensagem.text}
    </div>
  )
}

/**
 * Markdown mínimo, em elementos React — nunca `innerHTML` (texto de um
 * modelo não vira marcação executável). Parágrafos, listas, blocos de
 * código e `código` em linha; o resto fica como texto.
 */
function Trechos({ fonte }: { fonte: string }) {
  const partes = fonte.split(/```/)
  return (
    <>
      {partes.map((parte, n) => {
        const chave = `${n}-${parte.slice(0, 16)}`
        if (n % 2 === 1) {
          const [primeira = '', ...resto] = parte.split('\n')
          const codigo = /^[a-z0-9+#-]{1,16}$/i.test(primeira.trim()) ? resto.join('\n') : parte
          return (
            <pre className="claudeCodigo" key={chave}>
              {codigo.replace(/^\n|\n$/g, '')}
            </pre>
          )
        }
        return parte
          .split(/\n{2,}/)
          .filter((p) => p.trim())
          .map((paragrafo, i) => {
            const linhas = paragrafo.split('\n')
            const ehLista = linhas.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))
            const k = `${chave}-${i}`
            if (ehLista) {
              return (
                <ul className="claudeLista" key={k}>
                  {linhas.map((l) => (
                    <li key={l}>
                      <EmLinha fonte={l.replace(/^\s*([-*•]|\d+[.)])\s+/, '')} />
                    </li>
                  ))}
                </ul>
              )
            }
            return (
              <p key={k}>
                <EmLinha fonte={paragrafo.replace(/^#+\s*/, '')} />
              </p>
            )
          })
      })}
    </>
  )
}

/** Negrito e `código` em linha. */
function EmLinha({ fonte }: { fonte: string }) {
  const pedacos = fonte.split(/(`[^`]+`|\*\*[^*]+\*\*)/)
  return (
    <>
      {pedacos.map((p, n) => {
        const k = `${n}-${p.slice(0, 12)}`
        if (p.startsWith('`') && p.endsWith('`')) return <code key={k}>{p.slice(1, -1)}</code>
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={k}>{p.slice(2, -2)}</strong>
        return p
      })}
    </>
  )
}

/* ——— Gaveta ———————————————————————————————————————————— */

function glifoDoItem(item: ShelfItem): string {
  if (!item.exists) return 'WarningCircle'
  if (item.kind === 'url') return 'Link'
  if (item.kind === 'texto') return 'TextT'
  return 'File'
}

/**
 * A gaveta. Arquivos e trechos de texto são arrastáveis PARA FORA: o
 * `dragstart` é cancelado no DOM e o main assume com um arrasto nativo.
 */
const IMAGEM = /\.(png|jpe?g|webp|bmp|tiff?)$/i

function GavetaFoco({
  itens,
  celular,
  aoAgir,
}: {
  itens: ShelfItem[]
  /** O nome do celular ao alcance, ou nada: liga o "enviar ao celular". */
  celular: string | null
  aoAgir: Agir
}) {
  if (itens.length === 0) {
    return (
      <Vazio
        glifo="Tray"
        texto="Arraste arquivos, texto ou endereços para a pílula e eles ficam aqui"
      />
    )
  }
  return (
    <div className="gaveta">
      <ul className="itens">
        {itens.map((item, indice) => (
          <li
            key={item.path}
            className="item cascata"
            data-existe={item.exists ? 'sim' : 'nao'}
            title={item.exists ? item.path : `${item.path} — sumiu do disco`}
            draggable={item.kind !== 'url'}
            onDragStart={(e) => {
              e.preventDefault()
              if (item.exists && item.kind !== 'url') window.halo?.island.dragStart(item.path)
            }}
            style={{ '--i': indice } as React.CSSProperties}
          >
            <Glifo nome={glifoDoItem(item)} tamanho={22} />
            <span className="itemNome">{item.name}</span>
            <span className="itemAcoes">
              <button
                type="button"
                className="acao"
                title="Abrir"
                aria-label={`Abrir ${item.name}`}
                onClick={() => aoAgir('gaveta-abrir', item.path)}
              >
                <Glifo nome="ArrowSquareOut" tamanho={12} />
              </button>
              {item.kind !== 'url' ? (
                <button
                  type="button"
                  className="acao"
                  title="Enviar ao Seafile"
                  aria-label={`Enviar ${item.name} ao Seafile`}
                  onClick={() => aoAgir('gaveta-enviar', item.path)}
                >
                  <Glifo nome="CloudArrowUp" tamanho={12} />
                </button>
              ) : null}
              {celular && item.exists ? (
                <button
                  type="button"
                  className="acao"
                  title={`Enviar para ${celular} (KDE Connect)`}
                  aria-label={`Enviar ${item.name} para ${celular}`}
                  onClick={() => aoAgir('celular-enviar', item.path)}
                >
                  <Glifo nome="DeviceMobile" tamanho={12} />
                </button>
              ) : null}
              {item.exists && item.kind === 'arquivo' && IMAGEM.test(item.path) ? (
                <button
                  type="button"
                  className="acao"
                  title="Ler o texto da imagem (OCR) e copiar"
                  aria-label={`Ler o texto de ${item.name}`}
                  onClick={() => aoAgir('texto-da-imagem', item.path)}
                >
                  <Glifo nome="TextAa" tamanho={12} />
                </button>
              ) : null}
              {item.exists && item.kind !== 'url' ? (
                <button
                  type="button"
                  className="acao"
                  title="Perguntar ao Claude o que é isto"
                  aria-label={`Perguntar ao Claude sobre ${item.name}`}
                  onClick={() =>
                    aoAgir(
                      'claude-perguntar',
                      perguntaJson(
                        'O que é este arquivo? Resuma em poucas linhas.',
                        undefined,
                        item.path,
                      ),
                    )
                  }
                >
                  <Glifo nome="Sparkle" tamanho={12} />
                </button>
              ) : null}
              <button
                type="button"
                className="acao"
                title="Tirar da gaveta"
                aria-label={`Tirar ${item.name} da gaveta`}
                onClick={() => aoAgir('gaveta-remover', item.path)}
              >
                <Glifo nome="X" tamanho={12} />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ——— Janelas ——————————————————————————————————————————— */

function JanelasFoco({ guardadas, aoAgir }: { guardadas: IslandWindow[]; aoAgir: Agir }) {
  const [abertas, setAbertas] = useState<IslandWindow[] | null>(null)
  useEffect(() => {
    let vivo = true
    void window.halo?.island
      .janelas()
      .then((j) => vivo && setAbertas(j))
      .catch(() => vivo && setAbertas([]))
    return () => {
      vivo = false
    }
  }, [])

  const guardadaIds = new Set(guardadas.map((j) => j.id))
  const visiveis = (abertas ?? []).filter((j) => !guardadaIds.has(j.id))

  return (
    <div className="lista">
      {guardadas.length > 0 ? (
        <span className="secao">Guardadas — clique para devolver</span>
      ) : null}
      {guardadas.map((janela, indice) => (
        <div
          key={janela.id}
          className="janela cascata"
          style={{ '--i': indice } as React.CSSProperties}
        >
          <Glifo nome="Tray" tamanho={14} />
          <button
            type="button"
            className="janelaTitulo"
            onClick={() => aoAgir('janela-restaurar', janela.id)}
          >
            {janela.title}
          </button>
          <span className="janelaClasse">{janela.appClass}</span>
        </div>
      ))}

      <span className="secao">{abertas === null ? 'Listando janelas…' : 'Abertas'}</span>
      {visiveis.map((janela, indice) => (
        <div
          key={janela.id}
          className="janela cascata"
          data-ativa={janela.active ? 'sim' : 'nao'}
          style={{ '--i': guardadas.length + indice + 1 } as React.CSSProperties}
        >
          <Glifo nome="AppWindow" tamanho={14} />
          <button
            type="button"
            className="janelaTitulo"
            title="Trazer para a frente"
            onClick={() => aoAgir('janela-focar', janela.id)}
          >
            {janela.title}
          </button>
          <button
            type="button"
            className="acao"
            title="Metade esquerda"
            aria-label={`Encaixar ${janela.title} à esquerda`}
            onClick={() => aoAgir('janela-encaixar', `${janela.id} esquerda`)}
          >
            <Glifo nome="SquareHalf" tamanho={14} />
          </button>
          <button
            type="button"
            className="acao espelhado"
            title="Metade direita"
            aria-label={`Encaixar ${janela.title} à direita`}
            onClick={() => aoAgir('janela-encaixar', `${janela.id} direita`)}
          >
            <Glifo nome="SquareHalf" tamanho={14} />
          </button>
          <button
            type="button"
            className="acao"
            title="Maximizar"
            aria-label={`Maximizar ${janela.title}`}
            onClick={() => aoAgir('janela-encaixar', `${janela.id} maximizar`)}
          >
            <Glifo nome="ArrowsOutSimple" tamanho={14} />
          </button>
          <button
            type="button"
            className="acao"
            title="Guardar na gaveta (a janela voa para a pílula)"
            aria-label={`Guardar ${janela.title}`}
            onClick={() => aoAgir('janela-guardar', janela.id)}
          >
            <Glifo nome="Tray" tamanho={14} />
          </button>
        </div>
      ))}
      {abertas !== null && visiveis.length === 0 ? (
        <Vazio glifo="AppWindow" texto="Nenhuma janela aberta" />
      ) : null}
    </div>
  )
}

/* ——— Avisos ———————————————————————————————————————————— */

const hora = (at: number) =>
  new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Uma cor estável por aplicativo, pelo hash do nome. As oito moram em `tokens.css`. */
function corDoApp(app: string): string {
  let h = 0
  for (const ch of app) h = (h * 31 + ch.charCodeAt(0)) % 8
  return `var(--ilha-app-${h})`
}

function AvisosFoco({ avisos, aoAgir }: { avisos: IslandNotice[]; aoAgir: Agir }) {
  if (avisos.length === 0)
    return (
      <Vazio glifo="BellRinging" texto="As notificações que os aplicativos mandarem ficam aqui" />
    )
  return (
    <div className="lista">
      <div className="focoAcoes">
        <span className="secao">Recentes</span>
        <button
          type="button"
          className="acaoLarga"
          style={{ marginLeft: 'auto' }}
          title="O Claude resume as notificações e diz o que merece atenção"
          onClick={() =>
            aoAgir(
              'claude-perguntar',
              perguntaJson('Resuma estas notificações e diga o que merece atenção.', 'avisos'),
            )
          }
        >
          <Glifo nome="Sparkle" tamanho={14} />
          Resumir
        </button>
        <button type="button" className="acaoLarga" onClick={() => aoAgir('avisos-limpar')}>
          <Glifo nome="Broom" tamanho={14} />
          Limpar
        </button>
      </div>
      {avisos.map((aviso, indice) => (
        <div
          key={aviso.id}
          className="aviso cascata"
          data-urgente={aviso.urgent ? 'sim' : 'nao'}
          style={{ '--i': indice } as React.CSSProperties}
        >
          <span className="avisoTopo">
            <span className="avisoApp">
              <i className="avisoCor" style={{ background: corDoApp(aviso.app) }} />
              {aviso.app || 'sistema'}
            </span>
            <span className="avisoHora">{hora(aviso.at)}</span>
          </span>
          <span className="avisoTitulo">{aviso.title}</span>
          {aviso.body ? <span className="avisoCorpo">{aviso.body}</span> : null}
          <span className="avisoAcoes">
            {aviso.desktopEntry ? (
              <button
                type="button"
                className="acao"
                title={`Abrir ${aviso.app}`}
                aria-label={`Abrir ${aviso.app}`}
                onClick={() => aoAgir('avisos-abrir-app', aviso.desktopEntry)}
              >
                <Glifo nome="ArrowSquareOut" tamanho={12} />
              </button>
            ) : null}
            <button
              type="button"
              className="acao"
              title="Dispensar"
              aria-label="Dispensar"
              onClick={() => aoAgir('avisos-remover', String(aviso.id))}
            >
              <Glifo nome="X" tamanho={12} />
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}

/* ——— Área de transferência ————————————————————————————— */

function ClipsFoco({ clips, aoAgir }: { clips: IslandClip[]; aoAgir: Agir }) {
  const [copiado, setCopiado] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const termo = busca.trim().toLowerCase()
  const vistos = termo ? clips.filter((c) => c.preview.toLowerCase().includes(termo)) : clips
  if (clips.length === 0)
    return (
      <Vazio glifo="Clipboard" texto="O que você copiar aparece aqui, para pegar de volta depois" />
    )
  return (
    <div className="lista">
      <label className="lancadorCampo busca">
        <Glifo nome="MagnifyingGlass" tamanho={14} />
        <input
          type="search"
          placeholder="Buscar nas cópias…"
          value={busca}
          aria-label="Buscar nas cópias"
          onFocus={() => window.halo?.island.setFocus(true)}
          onBlur={() => window.halo?.island.setFocus(false)}
          onChange={(e) => setBusca(e.target.value)}
        />
      </label>
      {vistos.length === 0 ? <span className="leituraDetalhe">Nada com esse texto</span> : null}
      {vistos.map((clip, indice) => (
        <div
          key={clip.id}
          className="clip cascata"
          data-fixo={clip.pinned ? 'sim' : 'nao'}
          style={{ '--i': indice } as React.CSSProperties}
        >
          <button
            type="button"
            className="clipAlvo"
            title="Copiar de novo"
            onClick={() => {
              aoAgir('clip-copiar', String(clip.id))
              setCopiado(clip.id)
              setTimeout(() => setCopiado((c) => (c === clip.id ? null : c)), 1400)
            }}
          >
            {clip.kind === 'cor' && copiado !== clip.id ? (
              <span className="clipCor" style={{ background: clip.preview }} />
            ) : (
              <Glifo
                nome={
                  copiado === clip.id
                    ? 'Check'
                    : clip.kind === 'url'
                      ? 'Link'
                      : clip.kind === 'email'
                        ? 'Envelope'
                        : 'TextT'
                }
                tamanho={14}
              />
            )}
            <span
              className="clipTexto"
              data-mono={clip.kind === 'url' || clip.kind === 'cor' ? 'sim' : 'nao'}
            >
              {clip.preview}
            </span>
            <span className="clipMeta">
              {clip.length > clip.preview.length ? `${clip.length} caracteres · ` : ''}
              {hora(clip.at)}
            </span>
          </button>
          <span className="itemAcoes">
            {clip.kind === 'url' || clip.kind === 'email' ? (
              <button
                type="button"
                className="acao"
                title={clip.kind === 'email' ? 'Escrever e-mail' : 'Abrir no navegador'}
                aria-label={clip.kind === 'email' ? 'Escrever e-mail' : 'Abrir no navegador'}
                onClick={() =>
                  aoAgir(
                    'gaveta-abrir',
                    clip.kind === 'email' ? `mailto:${clip.preview}` : clip.preview,
                  )
                }
              >
                <Glifo nome="ArrowSquareOut" tamanho={12} />
              </button>
            ) : null}
            <button
              type="button"
              className="acao"
              data-ativa={clip.pinned ? 'sim' : 'nao'}
              title={clip.pinned ? 'Soltar' : 'Fixar'}
              aria-label={clip.pinned ? 'Soltar' : 'Fixar'}
              onClick={() => aoAgir('clip-fixar', String(clip.id))}
            >
              <Glifo nome="PushPin" tamanho={12} cheio={clip.pinned} />
            </button>
            <button
              type="button"
              className="acao"
              title="Tirar do histórico"
              aria-label="Tirar do histórico"
              onClick={() => aoAgir('clip-remover', String(clip.id))}
            >
              <Glifo nome="X" tamanho={12} />
            </button>
          </span>
        </div>
      ))}
      <div className="focoAcoes">
        <button type="button" className="acaoLarga" onClick={() => aoAgir('clip-limpar')}>
          <Glifo nome="Broom" tamanho={14} />
          Limpar · fixados ficam
        </button>
      </div>
    </div>
  )
}

/* ——— Nota ————————————————————————————————————————————— */

function Nota({ texto, aoAgir }: { texto: string; aoAgir: Agir }) {
  const [valor, setValor] = useState(texto)
  const [emUso, setEmUso] = useState(false)
  const [salvo, setSalvo] = useState(true)
  const relogio = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!emUso && salvo) setValor(texto)
  }, [texto, emUso, salvo])

  return (
    <div className="nota">
      <textarea
        className="notaCampo"
        value={valor}
        placeholder="Anote algo — fica guardado na ilha."
        aria-label="Nota rápida"
        onFocus={() => {
          setEmUso(true)
          window.halo?.island.setFocus(true)
        }}
        onBlur={() => {
          setEmUso(false)
          window.halo?.island.setFocus(false)
        }}
        onChange={(e) => {
          const proximo = e.target.value
          setValor(proximo)
          setSalvo(false)
          clearTimeout(relogio.current)
          relogio.current = setTimeout(() => {
            aoAgir('nota-salvar', proximo)
            setSalvo(true)
          }, 600)
        }}
      />
      <span className="notaEstado">{salvo ? 'guardada' : 'guardando…'}</span>
    </div>
  )
}

/* ——— Peças compartilhadas ——————————————————————————————— */

function Barra({
  ratio,
  nivel,
  tinta,
  aoBuscar,
}: {
  ratio: number
  nivel?: Reading['level']
  tinta?: boolean
  /** Com isto a barra vira um controle: clicar leva àquele ponto. */
  aoBuscar?: (razao: number) => void
}) {
  const p = Math.max(0, Math.min(1, ratio))
  const cheia = (
    <span
      className="barraCheia"
      data-nivel={nivel ?? 'ok'}
      data-tinta={tinta ? 'sim' : 'nao'}
      style={{ '--p': p } as React.CSSProperties}
    />
  )
  if (!aoBuscar) return <span className="barra">{cheia}</span>
  return (
    <button
      type="button"
      className="barra barraBuscavel"
      aria-label="Ir para um ponto da faixa"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        aoBuscar(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)))
      }}
    >
      {cheia}
    </button>
  )
}

/**
 * Enquanto se arrasta um arquivo sobre a gota: os alvos — gaveta, Seafile e,
 * com o celular ao alcance, o celular (o "AirDrop" pelo KDE Connect).
 */
function Solte({
  seafile,
  celular,
  mirando,
  aoMirar,
}: {
  seafile: SeafileState | null
  celular: string | null
  mirando: 'gaveta' | 'seafile' | 'celular' | null
  aoMirar: (alvo: 'gaveta' | 'seafile' | 'celular' | null) => void
}) {
  const pronto = seafile?.auth.state === 'ok' && Boolean(seafile.library)
  const biblioteca = seafile?.libraries.find((l) => l.id === seafile.library)

  return (
    <div className="solte">
      <section
        aria-label="Guardar na gaveta"
        className="alvoSoltar"
        data-pronto="sim"
        data-mirando={mirando === 'gaveta' || mirando === null ? 'sim' : 'nao'}
        onDragEnter={() => aoMirar('gaveta')}
        onDragOver={(e) => e.preventDefault()}
      >
        <Glifo nome="Tray" tamanho={28} />
        <span className="solteTitulo">Guardar na gaveta</span>
        <span className="solteDetalhe">fica na ilha, para arrastar de volta depois</span>
      </section>

      <section
        aria-label="Enviar ao Seafile"
        className="alvoSoltar"
        data-pronto={pronto ? 'sim' : 'nao'}
        data-mirando={mirando === 'seafile' ? 'sim' : 'nao'}
        onDragEnter={() => aoMirar('seafile')}
        onDragOver={(e) => e.preventDefault()}
      >
        <Glifo nome={pronto ? 'CloudArrowUp' : 'WarningCircle'} tamanho={28} />
        <span className="solteTitulo">
          {pronto ? 'Enviar ao Seafile' : 'Seafile sem configurar'}
        </span>
        <span className="solteDetalhe">
          {pronto
            ? `vai para ${biblioteca?.name ?? 'a biblioteca escolhida'}`
            : seafile?.auth.state === 'sem-config'
              ? 'Configurações → Seafile: o endereço do servidor'
              : seafile?.auth.state === 'sem-credencial'
                ? 'Configurações → Seafile: falta entrar na conta'
                : seafile?.auth.state === 'erro'
                  ? seafile.auth.message
                  : 'escolha uma biblioteca em Configurações'}
        </span>
      </section>

      {celular ? (
        <section
          aria-label="Enviar ao celular"
          className="alvoSoltar"
          data-pronto="sim"
          data-mirando={mirando === 'celular' ? 'sim' : 'nao'}
          onDragEnter={() => aoMirar('celular')}
          onDragOver={(e) => e.preventDefault()}
        >
          <Glifo nome="DeviceMobile" tamanho={28} />
          <span className="solteTitulo">Enviar ao celular</span>
          <span className="solteDetalhe">{celular} · pelo KDE Connect</span>
        </section>
      ) : null}
    </div>
  )
}

/** Bytes em prosa curta, para o cartão: "1,2 MB de 4 MB". */
function tamanho(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const unidades = ['kB', 'MB', 'GB', 'TB']
  let valor = bytes
  let i = -1
  while (valor >= 1000 && i < unidades.length - 1) {
    valor /= 1000
    i += 1
  }
  return `${valor < 10 ? valor.toFixed(1).replace('.', ',') : Math.round(valor)} ${unidades[i]}`
}

/** "hoje", "ontem", "há 3 dias" — o quanto basta para decidir se substitui. */
function quando(iso: string): string {
  if (!iso) return ''
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 30) return `há ${dias} dias`
  return new Date(iso).toLocaleDateString('pt-BR')
}

/**
 * O card do Seafile: estado do servidor e os envios.
 *
 * Com envios na lista o card ocupa a linha inteira — uma barra de progresso
 * num terço de card não dá para ler. Cada envio é uma linha com nome, estado
 * e barra; o parado em `existe` traz os três botões da decisão.
 */
function SeafileCard({
  estado,
  indice,
  aoDecidir,
  aoLimpar,
}: {
  estado: SeafileState | null
  indice: number
  aoDecidir: (id: string, escolha: SeafileResolution) => void
  aoLimpar: () => void
}) {
  const auth = estado?.auth
  const uploads = estado?.uploads ?? []
  const enviando = uploads.filter((u) => u.state === 'enviando' || u.state === 'esperando')
  const parados = uploads.filter((u) => u.state === 'existe')
  const terminados = uploads.filter((u) => u.state === 'pronto' || u.state === 'erro')
  const total = enviando.reduce((soma, u) => soma + u.bytes, 0)
  const feito = enviando.reduce((soma, u) => soma + u.sent, 0)
  const biblioteca = estado?.libraries.find((l) => l.id === estado.library)
  const valor =
    auth?.state === 'ok'
      ? parados.length > 0
        ? `${parados.length} para decidir`
        : enviando.length > 0
          ? `${Math.round((total > 0 ? feito / total : 0) * 100)}%`
          : 'conectado'
      : auth?.state === 'sem-config'
        ? 'sem servidor'
        : auth?.state === 'sem-credencial'
          ? 'falta entrar'
          : auth?.state === 'erro'
            ? 'erro'
            : '—'

  return (
    <div
      className="card cascata"
      data-ok={auth?.state === 'ok' ? 'sim' : 'nao'}
      data-largo={uploads.length > 0 ? 'sim' : 'nao'}
      style={{ '--i': indice } as React.CSSProperties}
    >
      <div className="cardAlvo">
        <span className="cardTopo">
          <Glifo nome="CloudArrowUp" tamanho={14} />
          <span className="cardNome">Seafile</span>
          {terminados.length > 0 && enviando.length === 0 ? (
            <button
              type="button"
              className="acao envioLimpar"
              title="Limpar os envios terminados"
              onClick={aoLimpar}
            >
              <Glifo nome="Broom" tamanho={14} />
            </button>
          ) : null}
        </span>
        <span className="cardValor">{valor}</span>
        <span className="cardDetalhe">
          {auth?.state === 'ok'
            ? enviando.length > 0
              ? `${tamanho(feito)} de ${tamanho(total)} · ${biblioteca?.name ?? 'biblioteca'}`
              : (biblioteca?.name ?? 'arraste um arquivo aqui')
            : 'arraste um arquivo aqui'}
        </span>
      </div>
      {uploads.length > 0 ? (
        <div className="envios">
          {uploads
            .slice(-4)
            .reverse()
            .map((u) => (
              <div key={u.id} className="envio" data-estado={u.state}>
                <span className="envioLinha">
                  <span className="envioNome" title={u.name}>
                    {u.name}
                  </span>
                  <span className="envioEstado">
                    {u.state === 'enviando'
                      ? `${Math.round(u.progress * 100)}% · ${tamanho(u.sent)} de ${tamanho(u.bytes)}`
                      : u.state === 'esperando'
                        ? 'na fila'
                        : u.state === 'pronto'
                          ? `enviado · ${tamanho(u.bytes)}`
                          : u.state === 'existe'
                            ? `já existe lá · ${tamanho(u.remote?.size ?? 0)}${u.remote?.modified ? `, ${quando(u.remote.modified)}` : ''}`
                            : (u.error ?? 'falhou')}
                  </span>
                </span>
                {u.state === 'enviando' || u.state === 'esperando' || u.state === 'pronto' ? (
                  <span className="barra">
                    <span
                      className="barraCheia"
                      style={{ '--p': u.progress } as React.CSSProperties}
                    />
                  </span>
                ) : null}
                {u.state === 'existe' ? (
                  <span className="envioBotoes">
                    <button
                      type="button"
                      className="envioBotao"
                      data-cor="acao"
                      title={`Substituir o arquivo que está no Seafile pelo seu (${tamanho(u.bytes)})`}
                      onClick={() => aoDecidir(u.id, 'substituir')}
                    >
                      Substituir
                    </button>
                    <button
                      type="button"
                      className="envioBotao"
                      title="Enviar como cópia: o Seafile guarda os dois"
                      onClick={() => aoDecidir(u.id, 'copia')}
                    >
                      Manter os dois
                    </button>
                    <button
                      type="button"
                      className="envioBotao"
                      title="Não enviar"
                      onClick={() => aoDecidir(u.id, 'cancelar')}
                    >
                      Cancelar
                    </button>
                  </span>
                ) : null}
              </div>
            ))}
        </div>
      ) : null}
    </div>
  )
}
