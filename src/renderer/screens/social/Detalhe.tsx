import { ArrowSquareOut } from '@phosphor-icons/react/dist/icons/ArrowSquareOut'
import { BookmarkSimple } from '@phosphor-icons/react/dist/icons/BookmarkSimple'
import { Heart } from '@phosphor-icons/react/dist/icons/Heart'
import { LinkSimple } from '@phosphor-icons/react/dist/icons/LinkSimple'
import { X } from '@phosphor-icons/react/dist/icons/X'
import type { CreativeCollection, CreativeItem } from '@shared/creative'
import { CREATIVE_KIND_LABEL } from '@shared/creative'
import { useEffect, useRef, useState } from 'react'
import { Capa } from './Capa'
import styles from './social.module.css'

/**
 * O detalhe de uma referência.
 *
 * FORA da linha de painéis, sempre: o `PanelRow` tem `perspective`, e ali a
 * ordem de pintura sai da profundidade e não do `z-index` — um modal declarado
 * dentro dele fica atrás dos painéis mesmo com `z-index: 20` (CLAUDE.md §
 * Modal). Quem o monta é a tela, no mesmo nível da linha.
 *
 * O foco entra no × ao abrir e volta para onde estava ao fechar, como no modal
 * de conversas do Claude. Fechar não mexe na rolagem do feed: o modal é uma
 * camada, e a grade continua exatamente onde estava.
 */
export function Detalhe({
  item,
  salvo,
  favorito,
  aoFechar,
  aoFavoritar,
  aoSalvar,
  colecoes,
  emColecoes,
  aoTrocarColecoes,
}: {
  item: CreativeItem
  salvo: boolean
  favorito: boolean
  aoFechar: () => void
  aoFavoritar: () => void
  aoSalvar: () => void
  colecoes: CreativeCollection[]
  emColecoes: string[]
  aoTrocarColecoes: (ids: string[]) => void
}) {
  const fechar = useRef<HTMLButtonElement>(null)
  const [copiado, setCopiado] = useState(false)
  const [imagem, setImagem] = useState(item.cover)

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    fechar.current?.focus()
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      anterior?.focus?.()
    }
  }, [aoFechar])

  const copiar = () => {
    void navigator.clipboard?.writeText(item.url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1600)
  }

  const metricas = [
    ['Curtidas', item.likes],
    ['Visualizações', item.views],
    ['Downloads', item.downloads],
  ].filter(([, v]) => v !== null) as [string, number][]

  return (
    <div className={styles.modalFundo} data-halo-modal>
      <button
        type="button"
        className={styles.modalVeu}
        aria-label="Fechar"
        aria-hidden="true"
        tabIndex={-1}
        onClick={aoFechar}
      />

      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={item.title || 'Referência'}
      >
        <div className={styles.modalTopo}>
          <div className={styles.modalTitulos}>
            {/* A origem antes do título: a atribuição é exigência dos termos
                do DeviantArt, e é o que separa uma fonte da outra numa tela
                que agrega. */}
            <span className={styles.modalEyebrow}>
              {item.provider.toUpperCase()} · {CREATIVE_KIND_LABEL[item.kind].toUpperCase()}
            </span>
            <span className={styles.modalNome}>{item.title || 'Sem título'}</span>
          </div>
          <button
            ref={fechar}
            type="button"
            className={styles.modalFechar}
            aria-label="Fechar"
            onClick={aoFechar}
          >
            <X size={13} />
          </button>
        </div>

        <div className={styles.modalCorpo}>
          <Capa url={imagem} alt={item.title} className={styles.capaGrande} />

          {item.gallery.length > 0 ? (
            <div className={styles.galeria}>
              {[item.cover, ...item.gallery].map((g) => (
                <button
                  key={g}
                  type="button"
                  className={
                    g === imagem ? `${styles.miniatura} ${styles.miniaturaOn}` : styles.miniatura
                  }
                  aria-label="Ver esta imagem"
                  aria-pressed={g === imagem}
                  onClick={() => setImagem(g)}
                >
                  <Capa url={g} alt="" />
                </button>
              ))}
            </div>
          ) : null}

          <div className={styles.detalheLinha}>
            {item.author ? <span className={styles.detalheAutor}>{item.author}</span> : null}
            {item.license ? <span className={styles.detalheLicenca}>{item.license}</span> : null}
          </div>

          {item.description ? <p className={styles.detalheTexto}>{item.description}</p> : null}

          {item.tags.length > 0 ? (
            <div className={styles.tags}>
              {item.tags.slice(0, 20).map((t) => (
                <span key={t} className={styles.tag}>
                  {t}
                </span>
              ))}
            </div>
          ) : null}

          {/* Onde este item está guardado. É aqui que se organiza — um item
              pode estar em VÁRIAS coleções, ou em nenhuma, e "em nenhuma" é um
              estado válido: ele continua na biblioteca, visível em "Tudo".
              Marcar uma coleção guarda o item se ele ainda não estava. */}
          {colecoes.length > 0 ? (
            <div className={styles.campo}>
              <span className={styles.campoRotulo}>Coleções</span>
              <div className={styles.filtros}>
                {colecoes.map((c) => {
                  const dentro = emColecoes.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={dentro}
                      className={dentro ? `${styles.chip} ${styles.chipOn}` : styles.chip}
                      onClick={() =>
                        aoTrocarColecoes(
                          dentro ? emColecoes.filter((x) => x !== c.id) : [...emColecoes, c.id],
                        )
                      }
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* Só as métricas que a plataforma informou. Nada de "0 curtidas"
              para dizer "não sei": ver a regra em `shared/creative.ts`. */}
          {metricas.length > 0 ? (
            <div className={styles.metricas}>
              {metricas.map(([rotulo, valor]) => (
                <span key={rotulo} className={styles.metrica}>
                  <span className={styles.metricaValor}>{valor.toLocaleString('pt-BR')}</span>
                  <span className={styles.metricaRotulo}>{rotulo}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.modalAcoes}>
          <button
            type="button"
            className={styles.acao}
            aria-pressed={favorito}
            onClick={aoFavoritar}
          >
            <Heart size={16} weight={favorito ? 'fill' : 'regular'} />
            {favorito ? 'Favorito' : 'Favoritar'}
          </button>
          <button type="button" className={styles.acao} aria-pressed={salvo} onClick={aoSalvar}>
            <BookmarkSimple size={16} weight={salvo ? 'fill' : 'regular'} />
            {salvo ? 'Na biblioteca' : 'Salvar'}
          </button>
          <button type="button" className={styles.acao} onClick={copiar}>
            <LinkSimple size={16} />
            {copiado ? 'Copiado' : 'Copiar link'}
          </button>
          {/* `noopener noreferrer`: a aba nova não recebe referência a esta
              janela nem o endereço de onde veio. */}
          <a
            className={`${styles.acao} ${styles.acaoPrincipal}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ArrowSquareOut size={16} />
            Abrir original
          </a>
        </div>
      </div>
    </div>
  )
}
