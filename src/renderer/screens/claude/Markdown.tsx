import { Check } from '@phosphor-icons/react/dist/icons/Check'
import { Copy } from '@phosphor-icons/react/dist/icons/Copy'
import { t } from '@shared/i18n'
import { useState } from 'react'
import styles from './claude.module.css'

/**
 * O que o agente escreve, formatado.
 *
 * Um renderizador próprio e pequeno, em vez de biblioteca: o que chega de um
 * agente é código, lista e ênfase — e nada aqui usa `innerHTML`, então não há
 * como um texto vindo do modelo virar marcação executável. Uma biblioteca de
 * markdown traria mais superfície do que o necessário e o risco de HTML cru.
 *
 * O que ele entende: blocos ```, código `entre crases`, **negrito**, títulos
 * `#` e listas. O resto passa como texto, que é o comportamento certo — texto
 * que o renderizador não reconhece continua legível.
 */

/**
 * Um pedaço já com id.
 *
 * O id é montado aqui, na separação, e não no `map` da renderização: chave
 * tirada do índice do `map` é frágil quando a lista muda, e estes pedaços não
 * têm identidade própria para oferecer.
 */
type Pedaco = { id: string } & (
  | { tipo: 'codigo'; lingua: string; texto: string }
  | { tipo: 'texto'; texto: string }
)

/** Separa nos blocos de crase tripla, preservando o que vem entre eles. */
function separar(fonte: string): Pedaco[] {
  const pedacos: Pedaco[] = []
  const partes = fonte.split(/```/)
  for (const [indice, parte] of partes.entries()) {
    // Ímpar = dentro das crases. A primeira linha pode ser a linguagem.
    if (indice % 2 === 1) {
      const quebra = parte.indexOf('\n')
      const primeira = quebra === -1 ? '' : parte.slice(0, quebra).trim()
      const ehLingua = /^[a-z0-9+#-]{1,16}$/i.test(primeira)
      pedacos.push({
        id: `c${indice}`,
        tipo: 'codigo',
        lingua: ehLingua ? primeira : '',
        texto: (ehLingua ? parte.slice(quebra + 1) : parte).replace(/\n$/, ''),
      })
    } else if (parte) {
      pedacos.push({ id: `t${indice}`, tipo: 'texto', texto: parte })
    }
  }
  return pedacos
}

/**
 * As chaves misturam posição e conteúdo de propósito: o índice sozinho é
 * frágil quando a lista muda, e estes pedaços não têm id próprio.
 */
export function Markdown({ fonte }: { fonte: string }) {
  return (
    <>
      {separar(fonte).map((pedaco) =>
        pedaco.tipo === 'codigo' ? (
          <Codigo key={pedaco.id} lingua={pedaco.lingua} texto={pedaco.texto} />
        ) : (
          <Texto key={pedaco.id} fonte={pedaco.texto} />
        ),
      )}
    </>
  )
}

/** Bloco de código com a linguagem e o botão de copiar. */
function Codigo({ lingua, texto }: { lingua: string; texto: string }) {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    // Volta sozinho: o "copiado" é confirmação, não estado permanente.
    setTimeout(() => setCopiado(false), 1600)
  }

  return (
    <div className={styles.bloco}>
      <div className={styles.blocoTopo}>
        <span className={styles.blocoLingua}>{lingua || t('texto')}</span>
        <button
          type="button"
          className={styles.blocoCopiar}
          aria-label={copiado ? t('Copiado') : t('Copiar código')}
          onClick={() => void copiar()}
        >
          {copiado ? <Check size={12} weight="bold" /> : <Copy size={12} />}
          {copiado ? t('Copiado') : t('Copiar')}
        </button>
      </div>
      <pre className={styles.blocoCodigo}>
        <code>{texto}</code>
      </pre>
    </div>
  )
}

/** Parágrafos, títulos, listas e ênfase — tudo como elementos, nunca HTML cru. */
function Texto({ fonte }: { fonte: string }) {
  const linhas = fonte.split('\n')
  const saida: React.ReactNode[] = []
  let lista: string[] = []

  const fecharLista = (chave: string) => {
    if (lista.length === 0) return
    saida.push(
      <ul className={styles.lista} key={`l${chave}`}>
        {lista.map((item) => (
          <li key={item}>
            <Inline fonte={item} />
          </li>
        ))}
      </ul>,
    )
    lista = []
  }

  for (const [i, linha] of linhas.entries()) {
    const item = /^\s*[-*+]\s+(.*)$/.exec(linha) ?? /^\s*\d+\.\s+(.*)$/.exec(linha)
    if (item?.[1] !== undefined) {
      lista.push(item[1])
      continue
    }
    fecharLista(String(i))

    const titulo = /^(#{1,4})\s+(.*)$/.exec(linha)
    if (titulo?.[2]) {
      saida.push(
        <p className={styles.titulo} key={`t${i}`}>
          <Inline fonte={titulo[2]} />
        </p>,
      )
      continue
    }
    if (linha.trim()) {
      saida.push(
        <p className={styles.paragrafo} key={`p${i}`}>
          <Inline fonte={linha} />
        </p>,
      )
    }
  }
  fecharLista('fim')
  return <>{saida}</>
}

/** `código` e **negrito** dentro de uma linha. */
function Inline({ fonte }: { fonte: string }) {
  // Id montado aqui, fora do `map` da renderização — ver o comentário de `Pedaco`.
  const partes = fonte
    .split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((texto, posicao) => ({ id: `${posicao}:${texto.slice(0, 24)}`, texto }))

  return (
    <>
      {partes.map(({ id, texto: parte }) => {
        if (parte.startsWith('`') && parte.endsWith('`') && parte.length > 2) {
          return (
            <code className={styles.inline} key={id}>
              {parte.slice(1, -1)}
            </code>
          )
        }
        if (parte.startsWith('**') && parte.endsWith('**') && parte.length > 4) {
          return <strong key={id}>{parte.slice(2, -2)}</strong>
        }
        return <span key={id}>{parte}</span>
      })}
    </>
  )
}
