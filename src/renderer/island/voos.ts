import type { IslandFlightStyle } from '@shared/island'

/**
 * Os quadros de cada variação do voo (Configurações → Ilha → Voo).
 *
 * Fora do `Voo.tsx` porque são dados, não desenho: o componente pede os
 * quadros e os toca. Tudo por WAAPI, e não por CSS, pelo motivo de sempre —
 * cada voo tem uma geometria diferente (a janela pode estar em qualquer canto
 * de qualquer tela), e um keyframe de CSS é fixo.
 *
 * TRÊS REGRAS que valem para toda variação nova, e que não são gosto:
 *
 * 1. **O cartão precisa estar opaco até ~10% do tempo.** O main só esconde a
 *    janela REAL depois de 90ms (ver `voar` em `island/window.ts`); um cartão
 *    ainda transparente ali deixaria a janela sumir à vista de todos.
 * 2. **Todas duram `VOO_CHEGADA_MS`.** O main revela a janela na volta contando
 *    a partir daí. Uma variação mais longa faria a janela aparecer antes de o
 *    cartão chegar, e uma mais curta deixaria o cartão parado esperando.
 * 3. **Só `transform` e `opacity` no cartão.** Elas compõem na GPU sem
 *    rasterizar a cada quadro. A primeira versão do voo usava `clip-path`
 *    animado e engasgava; e `filter: blur` em laço está fora por regra do
 *    projeto — o desfoque que existe é no CONTEÚDO, que é pequeno e some cedo.
 *
 * E uma de forma: dentro de uma variação, todos os quadros usam as MESMAS
 * funções de transform, na mesma ordem. Listas diferentes fazem o navegador
 * cair na interpolação de matriz, que passa por caminhos que ninguém desenhou.
 */

/** A geometria daquele voo: para onde ir, e o quanto encolher. */
export type Geometria = {
  /** Deslocamento do centro do cartão até a boca da pílula. */
  dx: number
  dy: number
  /** Escala final: o tamanho da boca dividido pelo da janela. */
  sx: number
  sy: number
}

export type Quadros = {
  carta: Keyframe[]
  conteudo: Keyframe[]
  easing: string
}

/**
 * O conteúdo do cartão (marca e título) some cedo na ida e chega tarde na
 * volta: espremido junto do cartão, ele viraria um borrão. Igual em todas as
 * variações — o que muda é o voo, não o que está escrito nele.
 */
const CONTEUDO_IDA: Keyframe[] = [
  { opacity: 1, filter: 'blur(0px)', offset: 0 },
  { opacity: 1, filter: 'blur(0px)', offset: 0.25 },
  { opacity: 0, filter: 'blur(3px)', offset: 0.55 },
  { opacity: 0, filter: 'blur(3px)', offset: 1 },
]

const CONTEUDO_VOLTA: Keyframe[] = [
  { opacity: 0, filter: 'blur(3px)', offset: 0 },
  { opacity: 0, filter: 'blur(3px)', offset: 0.45 },
  { opacity: 1, filter: 'blur(0px)', offset: 0.8 },
  { opacity: 1, filter: 'blur(0px)', offset: 1 },
]

/**
 * `sugado` — o voo original, quadro a quadro como ele sempre foi.
 *
 * Ele é o único escrito à mão nos DOIS sentidos: as outras variações derivam
 * a volta invertendo a ida (ver `inverter`), mas esta é o padrão, e quem já
 * usava a ilha não pode ver diferença nenhuma por causa de uma refatoração.
 *
 * O cartão se levanta da mesa, estreita — a largura cede antes da altura — e
 * parte rumo à pílula.
 */
function sugadoIda({ dx, dy, sx, sy }: Geometria): Keyframe[] {
  return [
    { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 0, offset: 0 },
    { transform: 'translate(0px, -2px) scale(1.003, 1.003)', opacity: 1, offset: 0.1 },
    {
      transform: 'translate(0px, -6px) scale(1.01, 1.01)',
      opacity: 1,
      offset: 0.2,
      easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
    },
    {
      transform: `translate(${dx * 0.5}px, ${dy * 0.45}px) scale(${0.38 + sx * 0.4}, ${0.55 + sy * 0.3})`,
      opacity: 1,
      offset: 0.62,
      easing: 'cubic-bezier(0.3, 0, 0.15, 1)',
    },
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 1, offset: 0.94 },
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0, offset: 1 },
  ]
}

function sugadoVolta({ dx, dy, sx, sy }: Geometria): Keyframe[] {
  return [
    {
      transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
      opacity: 0,
      offset: 0,
    },
    {
      transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
      opacity: 1,
      offset: 0.06,
    },
    {
      transform: `translate(${dx * 0.5}px, ${dy * 0.55}px) scale(${0.38 + sx * 0.4}, ${0.55 + sy * 0.3})`,
      opacity: 1,
      offset: 0.45,
    },
    { transform: 'translate(0px, -4px) scale(1.006, 1.006)', opacity: 1, offset: 0.86 },
    { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, offset: 1 },
  ]
}

/**
 * As outras variações: só a IDA é escrita.
 *
 * A volta é a mesma coisa de trás para frente (`inverter`), e isso é decisão,
 * não economia: a janela precisa sair da pílula pelo caminho por onde entrou,
 * senão o gesto não se fecha. Escrever os dois sentidos à mão só criaria a
 * chance de eles discordarem.
 */
const IDAS: Record<
  // As `real…` e a `nenhuma` não desenham cartão, e a `sugado` tem os dois
  // sentidos escritos à mão: nenhuma delas chega aqui.
  Exclude<IslandFlightStyle, `real${string}` | 'sugado' | 'nenhuma'>,
  (g: Geometria) => Keyframe[]
> = {
  /**
   * `genie` — o gênio da lâmpada do macOS: a LARGURA colapsa quase toda
   * antes de o cartão subir, e o que sobe é uma faixa estreita e alta, como
   * quem passa por um gargalo. Depois é a altura que cede.
   */
  genie: ({ dx, dy, sx, sy }) => [
    { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 0, offset: 0 },
    { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, offset: 0.08 },
    {
      transform: `translate(${dx * 0.22}px, ${dy * 0.1}px) scale(0.34, 0.9)`,
      opacity: 1,
      offset: 0.36,
      easing: 'cubic-bezier(0.6, 0, 0.4, 1)',
    },
    {
      transform: `translate(${dx * 0.74}px, ${dy * 0.66}px) scale(${sx * 2.1}, 0.4)`,
      opacity: 1,
      offset: 0.74,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 1, offset: 0.95 },
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0, offset: 1 },
  ],

  /**
   * `foguete` — agacha, salta ALTO e cai dentro da boca. O cartão passa
   * acima da pílula na metade do caminho: é a arqueada que dá a impressão
   * de impulso, e não de sucção.
   */
  foguete: ({ dx, dy, sx, sy }) => [
    { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 0, offset: 0 },
    { transform: 'translate(0px, 5px) scale(0.985, 0.985)', opacity: 1, offset: 0.12 },
    {
      transform: `translate(${dx * 0.24}px, ${dy * 0.58}px) scale(0.72, 0.72)`,
      opacity: 1,
      offset: 0.4,
      easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
    },
    {
      transform: `translate(${dx * 0.82}px, ${dy * 1.14}px) scale(0.3, 0.3)`,
      opacity: 1,
      offset: 0.68,
    },
    {
      transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
      opacity: 1,
      offset: 0.95,
      easing: 'cubic-bezier(0.5, 0, 0.4, 1)',
    },
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0, offset: 1 },
  ],

  /**
   * `dobra` — o cartão tomba para trás como uma folha e voa deitado. Precisa
   * de `perspective` na própria transformação: o pai é a camada inteira, e
   * uma perspectiva ali valeria para a tela toda.
   */
  dobra: ({ dx, dy, sx, sy }) => [
    {
      transform: 'perspective(900px) translate(0px, 0px) rotateX(0deg) scale(1, 1)',
      opacity: 0,
      offset: 0,
    },
    {
      transform: 'perspective(900px) translate(0px, 0px) rotateX(0deg) scale(1, 1)',
      opacity: 1,
      offset: 0.1,
    },
    {
      transform: `perspective(900px) translate(0px, -6px) rotateX(56deg) scale(0.98, 0.74)`,
      opacity: 1,
      offset: 0.36,
      easing: 'cubic-bezier(0.5, 0, 0.5, 1)',
    },
    {
      transform: `perspective(900px) translate(${dx * 0.64}px, ${dy * 0.62}px) rotateX(80deg) scale(0.44, 0.2)`,
      opacity: 1,
      offset: 0.74,
    },
    {
      transform: `perspective(900px) translate(${dx}px, ${dy}px) rotateX(86deg) scale(${sx}, ${sy})`,
      opacity: 1,
      offset: 0.95,
    },
    {
      transform: `perspective(900px) translate(${dx}px, ${dy}px) rotateX(86deg) scale(${sx}, ${sy})`,
      opacity: 0,
      offset: 1,
    },
  ],

  /**
   * `giro` — encolhe girando, como um papel sugado por um ralo. O giro é
   * anti-horário e curto (32°): uma volta inteira leria como brincadeira, e
   * a ilha não é uma.
   */
  giro: ({ dx, dy, sx, sy }) => [
    { transform: 'translate(0px, 0px) rotate(0deg) scale(1, 1)', opacity: 0, offset: 0 },
    { transform: 'translate(0px, -3px) rotate(-2deg) scale(1.01, 1.01)', opacity: 1, offset: 0.1 },
    {
      transform: `translate(${dx * 0.5}px, ${dy * 0.48}px) rotate(-14deg) scale(0.4, 0.4)`,
      opacity: 1,
      offset: 0.58,
      easing: 'cubic-bezier(0.35, 0, 0.2, 1)',
    },
    {
      transform: `translate(${dx}px, ${dy}px) rotate(-32deg) scale(${sx}, ${sy})`,
      opacity: 1,
      offset: 0.95,
    },
    {
      transform: `translate(${dx}px, ${dy}px) rotate(-32deg) scale(${sx}, ${sy})`,
      opacity: 0,
      offset: 1,
    },
  ],

  /**
   * `desmanchar` — o cartão perde corpo pelo caminho e chega à boca já quase
   * apagado. Sem desfoque no cartão (regra do projeto): quem some é a
   * opacidade, e o encolhimento é uniforme, sem levantada nem giro.
   */
  desmanchar: ({ dx, dy, sx, sy }) => [
    { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 0, offset: 0 },
    { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, offset: 0.1 },
    {
      transform: `translate(${dx * 0.44}px, ${dy * 0.4}px) scale(0.62, 0.62)`,
      opacity: 0.58,
      offset: 0.46,
    },
    {
      transform: `translate(${dx * 0.86}px, ${dy * 0.86}px) scale(0.22, 0.22)`,
      opacity: 0.2,
      offset: 0.8,
    },
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0, offset: 1 },
  ],
}

/**
 * A volta de uma variação: a ida de trás para frente.
 *
 * Inverte a ordem e espelha os `offset`. A opacidade é reescrita em vez de
 * espelhada: na ida o último quadro apaga o cartão dentro da boca; na volta
 * ele precisa ACENDER logo depois de sair dela, e um espelho puro o deixaria
 * invisível justamente no trecho em que ele deve aparecer.
 *
 * O `easing` de um quadro vale para o trecho que COMEÇA nele, então ele
 * também anda uma casa: invertido, quem manda no trecho é o quadro seguinte.
 */
function inverter(ida: Keyframe[]): Keyframe[] {
  const invertidos = [...ida].reverse()
  return invertidos.map((quadro, i) => {
    const offset = 1 - Number(quadro.offset ?? 0)
    const proximo = invertidos[i + 1]
    return {
      transform: quadro.transform,
      // Acende no começo e fica: o cartão sai da boca e cresce à vista.
      opacity: offset <= 0.001 ? 0 : 1,
      offset,
      ...(proximo?.easing ? { easing: proximo.easing as string } : {}),
    }
  })
}

/**
 * Os quadros daquele voo.
 *
 * `real` e `nenhuma` normalmente não chegam aqui — nas duas o main não manda o
 * evento para a camada (ver `comoVoar` em `island/halo.ts`). Elas caem no
 * `sugado` mesmo assim, para o caso de o efeito do KWin não estar carregado:
 * um cartão conhecido é melhor que um voo sem quadros.
 */
export function quadrosDoVoo(
  estilo: IslandFlightStyle,
  sentido: 'ida' | 'volta',
  geo: Geometria,
): Quadros {
  // Quem não tem desenho próprio aqui cai no `sugado`: são as `real…` e a
  // `nenhuma`, que não deviam chegar (o main não manda o evento para a
  // camada), e o próprio `sugado`. Um cartão conhecido é melhor que um voo
  // sem quadros, se o efeito do KWin não estiver carregado.
  const desenho: ((g: Geometria) => Keyframe[]) | undefined = (
    IDAS as Partial<Record<IslandFlightStyle, (g: Geometria) => Keyframe[]>>
  )[estilo]
  if (!desenho) {
    return {
      carta: sentido === 'ida' ? sugadoIda(geo) : sugadoVolta(geo),
      conteudo: sentido === 'ida' ? CONTEUDO_IDA : CONTEUDO_VOLTA,
      // Uma curva só na volta, sem trecho próprio: com um trecho mais rápido o
      // cartão chegava aos 300ms e ficava parado esperando a janela (medido).
      easing: sentido === 'ida' ? 'linear' : 'cubic-bezier(0.45, 0, 0.2, 1)',
    }
  }
  const ida = desenho(geo)
  return {
    carta: sentido === 'ida' ? ida : inverter(ida),
    conteudo: sentido === 'ida' ? CONTEUDO_IDA : CONTEUDO_VOLTA,
    easing: 'linear',
  }
}
