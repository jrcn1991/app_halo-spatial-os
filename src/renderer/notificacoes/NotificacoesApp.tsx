import { localeDoIdioma, t } from '@shared/i18n'
import type { Aviso } from '@shared/notificacoes'
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Glifo } from '../island/Glifo'
import { AVISOS_DE_EXEMPLO } from './exemplos'

/**
 * A pilha de balões — as notificações do sistema com a roupa do ambiente.
 *
 * Quem sabe o que existe é o main (`main/notificacoes/`): ele manda a lista
 * viva a cada mudança, e esta página só a desenha e devolve os gestos. O que
 * é da página é o TEMPO de cada balão: a barra fina no pé dele é uma animação
 * CSS com a duração do aviso, e o fim dela é o fim do balão — por isso passar
 * o mouse por cima (que pausa a animação) segura o balão na tela, sem relógio
 * nenhum em JavaScript para dessincronizar.
 *
 * A forma é dos tokens e do tema: esta página só escreve FATOS — o papel do
 * bloco (`data-halo-in="aviso"`), a urgência (`data-urgencia`), a peça
 * (`data-aviso`), se está saindo (`data-saindo`) — e cada `env-<id>.css` lê o
 * que precisa. Nenhuma classe diz o nome de tema.
 *
 * Fora do Electron (os guarda-fidelidade) não há `window.halo`, e aí valem os
 * exemplos — que dizem que são exemplo.
 */

/** Quantos balões ficam à vista; o resto espera a vez, na ordem de chegada. */
const VISIVEIS = 4
/** A saída mais longa entre os temas é 420ms; o balão sai do DOM depois dela. */
const SAIDA_MS = 480

type Mostrado = { aviso: Aviso; saindo: boolean }

/** A hora do aviso, no formato do idioma — criada na hora de desenhar, para seguir a troca. */
const hora = (at: number) =>
  new Intl.DateTimeFormat(localeDoIdioma(), { hour: '2-digit', minute: '2-digit' }).format(at)

/** O alfa de uma cor computada (`rgba(…, a)`, `color(srgb … / a)`); sem alfa escrito, 1. */
function alfa(cor: string): number {
  if (cor === 'transparent') return 0
  const achado = /[/,]\s*([\d.]+)\s*\)$/.exec(cor)
  return achado ? Number(achado[1]) : 1
}

export function NotificacoesApp({ canto }: { canto: string }) {
  const halo = window.halo
  const [mostrados, setMostrados] = useState<Mostrado[]>(() =>
    halo ? [] : AVISOS_DE_EXEMPLO.map((aviso) => ({ aviso, saindo: false })),
  )
  const pilha = useRef<HTMLElement>(null)
  const saidas = useRef(new Set<number>())
  /**
   * Quem já terminou de ENTRAR. O vidro de verdade (o desfoque do KWin atrás
   * do balão) só é pedido para estes: durante a entrada o balão desliza e
   * aparece aos poucos, e um retângulo desfocado parado no lugar final
   * chegaria antes dele.
   */
  const [assentados, setAssentados] = useState<ReadonlySet<number>>(() => new Set())

  /** Marca a saída e tira do DOM quando a animação dela terminou. */
  const sair = useCallback((id: number) => {
    setMostrados((atuais) => atuais.map((m) => (m.aviso.id === id ? { ...m, saindo: true } : m)))
    if (saidas.current.has(id)) return
    saidas.current.add(id)
    setTimeout(() => {
      saidas.current.delete(id)
      setMostrados((atuais) => atuais.filter((m) => !(m.aviso.id === id && m.saindo)))
      setAssentados((s) => {
        if (!s.has(id)) return s
        const resto = new Set(s)
        resto.delete(id)
        return resto
      })
    }, SAIDA_MS)
  }, [])

  /**
   * A lista nova do main. O que sumiu dela SAI (com animação, no lugar onde
   * estava); o que é novo entra; o que já estava só troca de conteúdo — uma
   * notificação substituída (mesmo id) muda no lugar, sem entrar de novo.
   */
  const receber = useCallback(
    (lista: Aviso[]) => {
      const ids = new Set(lista.map((a) => a.id))
      setMostrados((atuais) => {
        const resultado: Mostrado[] = lista.map((aviso) => ({ aviso, saindo: false }))
        atuais.forEach((m, i) => {
          if (ids.has(m.aviso.id)) return
          resultado.splice(Math.min(i, resultado.length), 0, { ...m, saindo: true })
        })
        return resultado
      })
      for (const m of mostrados) if (!ids.has(m.aviso.id)) sair(m.aviso.id)
    },
    [mostrados, sair],
  )

  const receberRef = useRef(receber)
  receberRef.current = receber
  useEffect(() => {
    if (!halo) return
    void halo.notificacoes.lista().then((l) => receberRef.current(l))
    return halo.notificacoes.onAvisos((l) => receberRef.current(l))
  }, [])

  /*
   * Onde os balões estão — o main escreve isso na região de entrada do X, e
   * fora dela o ponteiro atravessa a janela. Medido de novo depois da entrada
   * (o `transform` dela desloca o retângulo) e a cada mudança da pilha.
   * Lista vazia diz ao main que a última saída acabou: a janela se esconde.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: a medida é do DOM que `mostrados` acabou de desenhar — o efeito não lê a variável, lê o que ela pôs na tela
  useLayoutEffect(() => {
    if (!halo) return
    const medir = () => {
      const blocos = [
        ...(pilha.current?.querySelectorAll<HTMLElement>('[data-halo-in="aviso"]') ?? []),
      ]
      halo.notificacoes.regiao(
        blocos.map((el) => {
          const r = el.getBoundingClientRect()
          return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }
        }),
      )
      if (document.documentElement.dataset.desfoque !== 'sim') return
      // O vidro: só balão TRANSLÚCIDO pede desfoque (um tema sólido não ganha
      // nada, e o Cyberpunk teria os chanfros borrados por baixo), só depois
      // de assentado, e pela geometria de LAYOUT — `offset*` ignora o
      // `transform`, e o desfoque vai onde o balão fica, não onde ele passa.
      halo.notificacoes.desfoque(
        blocos
          .filter((el) => {
            const estilo = getComputedStyle(el)
            const assentou =
              assentados.has(Number(el.dataset.avisoId)) || estilo.animationName === 'none'
            return el.dataset.saindo !== 'sim' && assentou && alfa(estilo.backgroundColor) < 0.9
          })
          .map((el) => ({
            x: el.offsetLeft,
            y: el.offsetTop,
            width: el.offsetWidth,
            height: el.offsetHeight,
            raio: Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
          })),
      )
    }
    medir()
    const depois = setTimeout(medir, 560)
    return () => clearTimeout(depois)
  }, [mostrados, assentados])

  const agir = (aviso: Aviso, chave: string) => {
    halo?.notificacoes.agir(aviso.id, chave)
    sair(aviso.id)
  }
  const fechar = (aviso: Aviso) => {
    halo?.notificacoes.fechar(aviso.id)
    sair(aviso.id)
  }
  const esquecer = (aviso: Aviso) => {
    halo?.notificacoes.esquecer(aviso.id)
    sair(aviso.id)
  }

  let vivos = 0
  const visiveis = mostrados.filter((m) => m.saindo || vivos++ < VISIVEIS)

  return (
    <main ref={pilha} className="pilha" data-canto={canto} aria-live="polite">
      {visiveis.map(({ aviso, saindo }) => (
        <article
          key={aviso.id}
          className="aviso"
          data-halo-in="aviso"
          data-urgencia={aviso.urgencia}
          data-saindo={saindo ? 'sim' : 'nao'}
          data-aviso-id={aviso.id}
          aria-label={`${aviso.app}: ${aviso.titulo}`}
          onAnimationEnd={(e) => {
            // Só a entrada do PRÓPRIO balão: o fim da barra do tempo e o pisca
            // do ícone também sobem até aqui.
            if (e.target !== e.currentTarget || saindo) return
            setAssentados((s) => (s.has(aviso.id) ? s : new Set(s).add(aviso.id)))
          }}
        >
          <div className="avisoTopo">
            <span className="avisoIcone" data-aviso="icone">
              {aviso.icone ? (
                <img src={aviso.icone} alt="" />
              ) : (
                <Glifo
                  nome={aviso.urgencia === 'critica' ? 'WarningCircle' : 'BellRinging'}
                  tamanho={15}
                />
              )}
            </span>
            <span className="avisoApp" data-aviso="app">
              {aviso.app || t('Notificação')}
            </span>
            <span className="avisoHora" data-aviso="hora">
              {aviso.at ? hora(aviso.at) : t('agora')}
            </span>
            <button
              type="button"
              className="avisoFechar"
              data-aviso="fechar"
              aria-label={t('Dispensar')}
              title={t('Dispensar (sai do histórico também)')}
              onClick={() => fechar(aviso)}
            >
              <Glifo nome="X" tamanho={13} />
            </button>
          </div>

          {/* O corpo é um botão: é a ação `default` do aplicativo (abrir a
              conversa, o e-mail). Sem ela, clicar só tira o balão da tela —
              no histórico do Plasma ele continua, como no balão dele. */}
          <button
            type="button"
            className="avisoMiolo"
            data-aviso="miolo"
            data-padrao={aviso.temPadrao ? 'sim' : 'nao'}
            onClick={() => (aviso.temPadrao ? agir(aviso, 'default') : esquecer(aviso))}
          >
            {aviso.imagem ? (
              <img className="avisoImagem" data-aviso="imagem" src={aviso.imagem} alt="" />
            ) : null}
            <span className="avisoTexto">
              {aviso.titulo ? (
                <span className="avisoTitulo" data-aviso="titulo">
                  {aviso.titulo}
                </span>
              ) : null}
              {aviso.corpo ? (
                <span className="avisoCorpo" data-aviso="corpo">
                  {aviso.corpo}
                </span>
              ) : null}
            </span>
          </button>

          {aviso.acoes.length > 0 ? (
            <div className="avisoAcoes">
              {aviso.acoes.map((acao) => (
                <button
                  key={acao.chave}
                  type="button"
                  className="avisoAcao"
                  data-aviso="acao"
                  onClick={() => agir(aviso, acao.chave)}
                >
                  {acao.rotulo}
                </button>
              ))}
            </div>
          ) : null}

          {aviso.expiraMs !== null && !saindo ? (
            <span
              className="avisoTempo"
              data-aviso="tempo"
              // A duração é do AVISO, não do tema: por isso em linha. A cor e a
              // forma da barra continuam sendo do tema.
              style={{ '--aviso-tempo': `${aviso.expiraMs}ms` } as CSSProperties}
              onAnimationEnd={(e) => {
                if (e.animationName === 'halo-aviso-tempo') esquecer(aviso)
              }}
            />
          ) : null}
        </article>
      ))}
    </main>
  )
}
