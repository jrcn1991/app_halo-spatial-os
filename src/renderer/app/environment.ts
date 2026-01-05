import type { EnvironmentId } from '@shared/environments'
import type { AjustesDoAmbiente, ContentEntrance } from '@shared/settings'
import {
  CLARIDADE_HANDOFF,
  CONTENT_ENTRANCE_HANDOFF,
  GRAFICOS_HANDOFF,
  type StatGraphs,
  TRANSPARENCIA_HANDOFF,
} from '@shared/settings'
import { useLayoutEffect, useRef } from 'react'
import { useHalo } from '@/store/useHalo'
import { DEFAULT_ENTRANCE, ENTRANCE_NAMES, type EntranceName } from '@/styles/entrances'

/**
 * O ambiente ativo, aplicado à página inteira.
 *
 * O tema é um atributo no `documentElement` — `data-env` — e os arquivos
 * `styles/env-<id>.css` só redefinem tokens sob `:root[data-env='…']`. Assim
 * `floresta` continua sendo o `:root` de hoje, sem uma linha a mais, e trocar
 * de tema não remonta tela nenhuma: só os valores das variáveis mudam.
 *
 * O atributo mora no `documentElement` (e não no palco) porque o palco não
 * alcança tudo: modais e sobreposições ficam fora da linha de painéis, e o
 * `:root` é o único nó que está acima de todos eles.
 */

/**
 * Quanto tempo o sinal de troca fica de pé.
 *
 * Espelha `--dur-env` em `styles/tokens.css` — é a mesma transição, contada
 * dos dois lados. A fase 2 pendura a animação de "boot" do Cyberpunk neste
 * atributo.
 */
export const TROCA_MS = 600

export function useEnvironmentTheme(): void {
  const id = useHalo((s) => s.environment.id)
  // O ambiente do primeiro desenho não é uma troca: abrir o app já no tema
  // salvo não pode disparar a animação de boot.
  const anterior = useRef<EnvironmentId | null>(null)

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.env = id
    if (anterior.current === null || anterior.current === id) {
      anterior.current = id
      return
    }
    anterior.current = id
    root.dataset.envTrocando = 'sim'
    const timer = setTimeout(() => {
      delete root.dataset.envTrocando
    }, TROCA_MS)
    return () => clearTimeout(timer)
  }, [id])
}

/**
 * O PRESET de cada ambiente.
 *
 * Um ambiente traz o jeito dele de aparecer — é a terceira metade do que um
 * tema é, depois dos tokens e do papel de parede. A Floresta não aparece aqui
 * de propósito: ela É o handoff, e o handoff não tem preset — tem padrão.
 *
 * Os valores são ESCOLHA DO USUÁRIO, validados por ele na tela: trocar um é
 * trocar uma linha aqui, e nada mais. Não há regra que os derive do tema, e
 * inventar uma seria inventar gosto alheio.
 *
 * **Como isto convive com a escolha do usuário.** O campo guardado vale como
 * ESCOLHA EXPLÍCITA; vazio significa "automático". Então:
 *
 * - vazio → vale o preset do ambiente, e trocar de ambiente troca o movimento;
 * - um nome → vale o nome, em todos os ambientes, até alguém restaurar.
 *
 * O botão "Restaurar padrão" das duas seções é o que devolve o vazio. Sem ele
 * não haveria caminho de volta, e o preset viraria uma coisa que só se vê uma
 * vez.
 *
 * Isto SUBSTITUI a regra anterior, que era "no Cyberpunk, se a escolha for o
 * padrão do app, use datamosh". Ela funcionava e tinha um furo escrito no
 * próprio comentário: quem escolhesse "Surgir" à mão no Cyberpunk via o
 * Datamosh, porque não havia como distinguir "não escolhi" de "escolhi o
 * padrão". O vazio é essa distinção.
 *
 * Uma consequência honesta da troca: quem já tinha um `settings.json` gravado
 * tem um nome ali — foi o padrão que ficou salvo —, e para esse alguém o
 * preset do ambiente só aparece depois de um clique em "Restaurar padrão".
 * Reescrever o arquivo dele para "automático" seria adivinhar que ele nunca
 * escolheu, e o projeto não faz isso com preferência de usuário.
 */
export type PresetDoAmbiente = {
  /** Como as telas entram (as 13 do handoff). */
  entrada?: EntranceName
  /** Como o miolo do painel central troca, na navegação embutida. */
  transicao?: ContentEntrance
  /** Opacidade do vidro, 0–100. O vidro é parte da atmosfera de um tema. */
  transparencia?: number
  /** Quanta luz o vidro devolve, 0–100. */
  claridade?: number
  /** O gráfico do histórico nos medidores da home. */
  graficos?: StatGraphs
}

export const PRESETS_DO_AMBIENTE: Partial<Record<EnvironmentId, PresetDoAmbiente>> = {
  /*
   * City Pop.
   *
   * "Tela ligando" é a entrada que estala na horizontal como uma TV antiga —
   * é o gesto do tema, e não uma escolha bonita qualquer.
   *
   * Transparência 26 e claridade 46 são ESCOLHA DO USUÁRIO (05/09/2026), depois
   * de três rodadas medidas contra a referência (22 → 6, atrás da cor do
   * painel dela). Com o cobalto e as bordas acertados, ele preferiu o vidro
   * mais aberto e mais claro do que a referência pede — e é ele quem manda no
   * padrão de fábrica do tema.
   *
   * As ondas nos medidores são da referência — cada cartão de CPU, memória, GPU
   * e temperatura tem a sua, em neon. O usuário tinha decidido deixá-las de
   * fora e voltou atrás em 05/09/2026; entraram como preset DESTE ambiente,
   * para a Floresta continuar sendo o handoff.
   *
   * Como todo preset, é sugestão: mexer em Aparência ganha dele, e "Restaurar
   * padrão" o traz de volta.
   */
  citypop: {
    entrada: 'Tela ligando',
    transicao: 'deslize',
    transparencia: 26,
    claridade: 46,
    graficos: 'wave',
  },
  cyberpunk: { entrada: 'Deslize lateral', transicao: 'dobra', transparencia: 11 },
  bioshock: { entrada: 'Persiana', transicao: 'materializar', transparencia: 30, claridade: 11 },
}

/**
 * Os cinco valores que valem AGORA, dado o ambiente e o que foi ajustado nele.
 *
 * Uma função só, e não cinco espalhadas, porque a regra é a mesma em todos e
 * o erro que ela evita também: **ausente é "não escolhi"**, e ausente não pode
 * ser confundido com um valor. Em texto o `||` daria conta; em número, não —
 * `0` é transparência válida, e `escolha || preset` a trocaria pelo preset sem
 * ninguém notar. Por isso tudo aqui testa `?? `, contra `undefined`.
 */
export function valoresDoAmbiente(ambiente: EnvironmentId, ajuste: AjustesDoAmbiente = {}) {
  const preset = PRESETS_DO_AMBIENTE[ambiente]
  const entrada = ajuste.entrance as EntranceName | undefined
  return {
    entrada: (ENTRANCE_NAMES as string[]).includes(entrada ?? '')
      ? (entrada as EntranceName)
      : (preset?.entrada ?? DEFAULT_ENTRANCE),
    transicao: ajuste.contentEntrance ?? preset?.transicao ?? CONTENT_ENTRANCE_HANDOFF,
    transparencia: ajuste.transparency ?? preset?.transparencia ?? TRANSPARENCIA_HANDOFF,
    claridade: ajuste.clarity ?? preset?.claridade ?? CLARIDADE_HANDOFF,
    graficos: ajuste.graphs ?? preset?.graficos ?? GRAFICOS_HANDOFF,
  }
}

/** O ajuste do ambiente ATIVO. Objeto vazio quando ele está inteiro no preset. */
export function useAjuste(): AjustesDoAmbiente {
  const ambiente = useHalo((s) => s.environment.id)
  const ajustes = useHalo((s) => s.environment.ajustes)
  return ajustes[ambiente] ?? VAZIO
}

/** Os valores que valem no ambiente ativo, para quem desenha. */
export function useValoresDoAmbiente() {
  const ambiente = useHalo((s) => s.environment.id)
  return valoresDoAmbiente(ambiente, useAjuste())
}

/**
 * Referência estável para "ambiente sem ajuste".
 *
 * Um `{}` novo a cada chamada faria o seletor do zustand devolver um objeto
 * diferente toda vez, e todo componente que lê o ajuste renderizaria a cada
 * mudança de qualquer parte do store.
 */
const VAZIO: AjustesDoAmbiente = {}

/**
 * Troca o papel de parede da máquina, se houver máquina para trocar.
 *
 * Devolve a frase do que deu errado, ou vazio quando deu certo. Fora do
 * Electron (o navegador dos testes de tela) não existe `window.halo`: o tema
 * muda e o papel de parede é simplesmente ignorado — sem erro na tela, porque
 * ali não há área de trabalho nenhuma para mexer.
 */
export async function aplicarWallpaper(id: EnvironmentId): Promise<string> {
  const api = globalThis.window?.halo
  if (!api) return ''
  try {
    const resultado = await api.wallpaper.apply(id)
    return resultado.ok ? '' : resultado.error
  } catch (error) {
    return (error as Error).message
  }
}
