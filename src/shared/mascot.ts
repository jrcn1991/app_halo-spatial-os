/**
 * O mascote da tela do Claude.
 *
 * Personagens do Microsoft Agent (`.acs`) — Genie, Clippy, Merlin — no lugar
 * do orbe do handoff. Eles reagem ao que os agentes estão fazendo: pensando,
 * usando ferramenta, parados, com erro.
 */

/** O que o mascote está representando agora. */
export type MascotMood = 'ocioso' | 'pensando' | 'ferramenta' | 'erro' | 'comemorando' | 'chegando'

/** Um personagem disponível para escolher. */
export type MascotChoice = { file: string; name: string; current: boolean }

/** Um quadro pronto para desenhar. */
export type MascotFrame = {
  /** PNG em `data:`, já composto com as camadas e a transparência. */
  image: string
  durationMs: number
}

export type MascotAnimation = {
  name: string
  frames: MascotFrame[]
}

/** O personagem carregado, sem os pixels — a tela pede os quadros por animação. */
export type MascotInfo = {
  ready: boolean
  /** Nome do arquivo, para a tela dizer quem está ali. */
  name: string
  width: number
  height: number
  /** Nomes de todas as animações do personagem. */
  animations: string[]
  /** Qual animação responde a cada estado, já resolvida para este personagem. */
  moods: Record<MascotMood, string | null>
  error: string | null
}

/**
 * Os candidatos de cada estado, em ordem de preferência.
 *
 * Personagens diferentes têm animações diferentes — o Genie tem `Processing`,
 * o Clippy tem `Processing` e `Searching`, e nenhum tem todos. Por isso a
 * escolha é uma lista: vale o primeiro que o personagem tiver, e `null` quando
 * ele não tem nenhum, caso em que a tela simplesmente não anima aquele estado.
 */
export const MOOD_CANDIDATES: Record<MascotMood, string[]> = {
  chegando: ['Show', 'Greet', 'Wave', 'RestPose'],
  ocioso: ['RestPose', 'Idle1_1', 'Blink'],
  pensando: ['Thinking', 'Think', 'Processing', 'Process', 'Reading', 'Read', 'RestPose'],
  ferramenta: [
    'Searching',
    'Search',
    'Writing',
    'Write',
    'Processing',
    'Process',
    'GestureRight',
    'RestPose',
  ],
  // `Embarrassed` e `Surprised` entraram depois: o Rover não tem nenhum dos
  // nomes clássicos de erro, e sem eles ele caía no `RestPose` — ficava parado
  // justamente quando algo dava errado.
  erro: [
    'Confused',
    'Sad',
    'DontRecognize',
    'Uncertain',
    'Embarrassed',
    'Surprised',
    'Alert',
    'Decline',
    'RestPose',
  ],
  // `Smile` e `BigSmile` entraram por causa de personagens que são só
  // expressões faciais: eles não têm `Congratulate`, mas sorrir serve.
  comemorando: [
    'Congratulate',
    'Pleased',
    'Acknowledge',
    'BigSmile',
    'Smile',
    'DoMagic2',
    'RestPose',
  ],
}

/**
 * O quanto o mascote se mexe quando não há nada acontecendo.
 *
 * Um personagem parado numa pose só parece travado — os do Microsoft Agent
 * piscavam e olhavam em volta sozinhos, e é isso que dá vida a eles.
 */
export type MascotLiveliness = 'calmo' | 'normal' | 'animado'

export const MASCOT_LIVELINESS: readonly MascotLiveliness[] = ['calmo', 'normal', 'animado']

/** Faixa de espera entre uma bobagem e outra, em milissegundos. */
export const IDLE_INTERVAL: Record<MascotLiveliness, [number, number]> = {
  calmo: [22_000, 45_000],
  normal: [9_000, 22_000],
  animado: [3_500, 9_000],
}

/**
 * Animações que não funcionam sozinhas.
 *
 * `…Return` e `…Continued` são a segunda metade de um par: `LookDownReturn` só
 * faz sentido depois de `LookDown`, e sozinha parece o personagem voltando de
 * lugar nenhum. `Hide` some com ele. `Move…` era feita para o personagem
 * atravessar a tela, o que aqui não acontece.
 */
const NAO_SOZINHAS = /(?:Return|Continued)$|^Hide$|^Show$|^Move(?:Up|Down|Left|Right)$|Listening$/

/**
 * As animações que sobram para o mascote fazer sozinho.
 *
 * Tudo o que o personagem tem, menos o que já responde a um estado (não faria
 * sentido ele "pensar" à toa) e menos as que não funcionam soltas. Sai de 37 a
 * 70 animações por personagem, contra as onze de uma lista fixa — e uma lista
 * fixa ainda deixaria de fora tudo que um personagem novo trouxesse.
 */
export function idlePool(animations: string[], emUso: (string | null)[]): string[] {
  const usadas = new Set(emUso.filter((n): n is string => Boolean(n)))
  return animations.filter((nome) => !usadas.has(nome) && !NAO_SOZINHAS.test(nome))
}

/**
 * Acha o nome de uma animação entre os candidatos de um estado.
 *
 * Duas frouxidões, cada uma paga por um personagem que não abria direito:
 *
 * - **Sem caixa.** O Alien nomeia tudo em caixa alta (`RESTPOSE`, `CONFUSED`)
 *   e por isso não casava com nada — os seis estados davam nulo e o mascote
 *   ficava imóvel, sem erro nenhum.
 * - **Por começo, numa SEGUNDA passada.** O Cop chama a pose parada de
 *   `RestposeS`, com um sufixo que é dele. Vale também para o par
 *   `Think`/`Thinking`, que a lista já tratava listando os dois.
 *
 * A segunda passada só roda depois que TODOS os candidatos falharam por
 * igualdade: senão o começo de um candidato fraco lá do início ganharia de
 * uma animação exata que estava mais adiante na lista.
 */
export function acharAnimacao(animations: string[], candidatos: string[]): string | null {
  const pares = animations.map((nome) => [nome, nome.toLowerCase()] as const)
  for (const candidato of candidatos) {
    const alvo = candidato.toLowerCase()
    const exato = pares.find(([, baixo]) => baixo === alvo)
    if (exato) return exato[0]
  }
  for (const candidato of candidatos) {
    const alvo = candidato.toLowerCase()
    const comeco = pares.find(([, baixo]) => baixo.startsWith(alvo))
    if (comeco) return comeco[0]
  }
  return null
}
