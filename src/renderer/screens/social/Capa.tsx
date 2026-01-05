import { useState } from 'react'
import { useCreativeThumb } from '@/hooks/useCreative'
import styles from './social.module.css'

/**
 * A capa de uma referência.
 *
 * Tenta a URL DIRETO primeiro, e só cai no main se ela não carregar.
 *
 * O motivo é medida, não elegância: a home do DeviantArt traz ~33 capas de uma
 * vez, e converter todas para `data:` no main seriam megabytes atravessando o
 * IPC a cada abertura da tela — a grade apareceria cinza e iria preenchendo. O
 * CDN deles está na CSP (`img-src https://*.wixmp.com`, com o motivo escrito
 * em `index.html`), então essas carregam como qualquer imagem.
 *
 * A reserva existe porque as outras fontes servem de onde quiserem, e ali a
 * CSP bloqueia. **Não há lista de hosts permitidos aqui**: uma cópia da CSP no
 * renderer envelheceria sozinha. O que se usa é o próprio bloqueio — imagem
 * barrada dispara `error`, e é ele que pede a conversão ao main. Quem decide
 * continua sendo a CSP, num lugar só.
 *
 * Enquanto nada chega, e quando nada vem, fica o quadro do tema: ele é o LUGAR
 * da imagem, não uma imagem que falhou.
 */
export function Capa({
  url,
  alt,
  className,
}: {
  url: string
  alt: string
  className?: string | undefined
}) {
  // Guarda o ENDEREÇO que falhou, e não um booleano: assim o estado se corrige
  // sozinho quando o cartão passa a mostrar outra obra, sem um efeito só para
  // desfazer o anterior.
  const [falhou, setFalhou] = useState('')
  const barrada = falhou !== '' && falhou === url
  // O pedido ao main só sai depois que a direta falhou.
  const convertida = useCreativeThumb(barrada ? url : '')

  const classe = className ? `${styles.capa} ${className}` : styles.capa
  const fonte = barrada ? convertida : url

  // `alt` vazio nos cartões: a imagem é decorativa ali — o título está no texto
  // ao lado, e repetir faria o leitor de tela dizer tudo duas vezes.
  return fonte ? (
    <img className={classe} src={fonte} alt={alt} loading="lazy" onError={() => setFalhou(url)} />
  ) : (
    <span className={classe} aria-hidden="true" />
  )
}
