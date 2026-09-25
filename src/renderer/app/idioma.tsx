import { definirIdioma, ehIdioma, IDIOMA_PADRAO, type Idioma } from '@shared/i18n'
import { type ReactNode, useEffect, useState } from 'react'

/**
 * O idioma de uma janela, e a remontagem quando ele muda.
 *
 * `t()` lê o idioma do processo na hora em que desenha; para a tela inteira
 * trocar de língua de uma vez, a árvore é REMONTADA com uma chave nova. É um
 * evento raro (o usuário troca em Configurações), e remontar é o jeito que
 * não deixa um texto velho para trás num componente que não se redesenhou.
 *
 * `inicial`: o que a janela sabe no arranque — o app lê das configurações; a
 * ilha, o lançador e os balões recebem `lang=` na consulta da página. Depois
 * disso quem avisa é o main (`window.halo.idioma.onMudou`), que manda a troca
 * para todas as janelas.
 */
export function ComIdioma({ inicial, children }: { inicial: Idioma; children: ReactNode }) {
  const [idioma, setIdioma] = useState(() => {
    definirIdioma(inicial)
    return inicial
  })

  useEffect(() => {
    definirIdioma(inicial)
    setIdioma(inicial)
  }, [inicial])

  useEffect(
    () =>
      window.halo?.idioma.onMudou((novo) => {
        if (!ehIdioma(novo)) return
        definirIdioma(novo)
        setIdioma(novo)
      }),
    [],
  )

  useEffect(() => {
    document.documentElement.lang = idioma
  }, [idioma])

  return <IdiomaChave key={idioma}>{children}</IdiomaChave>
}

function IdiomaChave({ children }: { children: ReactNode }) {
  return <>{children}</>
}

/** O idioma que veio na consulta da página (`?lang=en`), para as janelas que não são o app. */
export function idiomaDaConsulta(): Idioma {
  const lang = new URLSearchParams(globalThis.location?.search ?? '').get('lang')
  return ehIdioma(lang) ? lang : IDIOMA_PADRAO
}
