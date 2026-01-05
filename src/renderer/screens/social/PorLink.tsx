import { X } from '@phosphor-icons/react/dist/icons/X'
import type { CreativeCollection, CreativeItem } from '@shared/creative'
import { CREATIVE_KIND_LABEL, CREATIVE_KINDS } from '@shared/creative'
import { useEffect, useRef, useState } from 'react'
import { useCreativePreview } from '@/hooks/useCreative'
import { cx } from '@/ui/cx'
import { Capa } from './Capa'
import styles from './social.module.css'

/**
 * Salvar por link.
 *
 * É o caminho que funciona sem NENHUMA integração configurada, e por isso é o
 * primeiro que a tela oferece: cola-se o endereço de uma arte, um modelo ou
 * uma referência, o main lê o que a página publica sobre si (Open Graph) e a
 * prévia aparece antes de salvar.
 *
 * Quando a página não publica nada — casca de JS, muro de login, servidor que
 * recusa —, o caminho NÃO acaba: o usuário preenche o título à mão e salva
 * mesmo assim. Guardar o link com um nome próprio é melhor que perder a
 * referência, e era o que o pedido dizia.
 */
export function PorLink({
  colecoes,
  destino,
  aoFechar,
  aoSalvar,
}: {
  colecoes: CreativeCollection[]
  /**
   * O grupo aberto na Biblioteca, já marcado.
   *
   * Mesma regra do feed: o grupo aberto é o destino. Quem está olhando uma
   * coleção e cola um endereço quer aquilo ali dentro — obrigá-lo a marcar de
   * novo o que já está na tela seria pedir duas vezes a mesma coisa. Continua
   * podendo desmarcar.
   */
  destino: string
  aoFechar: () => void
  aoSalvar: (
    item: CreativeItem,
    onde: { collections: string[]; tags: string[]; note: string },
  ) => void
}) {
  const fechar = useRef<HTMLButtonElement>(null)
  const [url, setUrl] = useState('')
  const [titulo, setTitulo] = useState('')
  const [nota, setNota] = useState('')
  const [tags, setTags] = useState('')
  const [tipo, setTipo] = useState<CreativeItem['kind']>('outro')
  const [escolhidas, setEscolhidas] = useState<string[]>(destino ? [destino] : [])
  const { previa, lendo, ler } = useCreativePreview()

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

  // A prévia troca o título e o tipo por defaults melhores — mas só até a
  // pessoa escrever os dela: sobrescrever o que ela digitou seria roubar.
  useEffect(() => {
    if (previa?.item) {
      setTitulo((atual) => atual || previa.item?.title || '')
      setTipo(previa.item.kind)
    }
  }, [previa])

  const podeSalvar = Boolean(url.trim()) && Boolean(titulo.trim() || previa?.item?.title)

  const salvar = () => {
    const base = previa?.item
    const item: CreativeItem = base
      ? { ...base, title: titulo.trim() || base.title, kind: tipo }
      : {
          // Sem prévia: o item é o que a pessoa escreveu, e o link.
          id: `link:${url.trim()}`,
          provider: 'link',
          externalId: url.trim(),
          title: titulo.trim(),
          description: '',
          author: '',
          authorAvatar: '',
          cover: '',
          gallery: [],
          url: url.trim(),
          kind: tipo,
          tags: [],
          license: '',
          likes: null,
          views: null,
          downloads: null,
          publishedAt: null,
          meta: {},
        }

    aoSalvar(item, {
      collections: escolhidas,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      note: nota.trim(),
    })
    aoFechar()
  }

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

      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Salvar por link">
        <div className={styles.modalTopo}>
          <div className={styles.modalTitulos}>
            <span className={styles.modalEyebrow}>BIBLIOTECA</span>
            <span className={styles.modalNome}>Salvar por link</span>
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
          <label className={styles.campo}>
            <span className={styles.campoRotulo}>Endereço</span>
            <input
              className={styles.campoEntrada}
              type="url"
              value={url}
              placeholder="https://…"
              aria-label="Endereço da referência"
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => url.trim() && ler(url.trim())}
              onKeyDown={(e) => e.key === 'Enter' && url.trim() && ler(url.trim())}
            />
          </label>

          {lendo ? <span className={styles.vazioCorpo}>Lendo a página…</span> : null}

          {previa && !previa.ok ? (
            <span className={styles.aviso}>
              {previa.error}. Dá para salvar assim mesmo: escreva um título abaixo.
            </span>
          ) : null}

          {previa?.item ? (
            <div className={styles.previa}>
              <Capa url={previa.item.cover} alt="" className={styles.capaPequena} />
              <span className={styles.salvoTexto}>
                <span className={styles.salvoTitulo}>{previa.item.title}</span>
                <span className={styles.salvoOrigem}>
                  {previa.item.author} · {previa.item.provider}
                </span>
              </span>
            </div>
          ) : null}

          <label className={styles.campo}>
            <span className={styles.campoRotulo}>Título</span>
            <input
              className={styles.campoEntrada}
              value={titulo}
              placeholder="Como você quer encontrar isto depois"
              aria-label="Título da referência"
              onChange={(e) => setTitulo(e.target.value)}
            />
          </label>

          <div className={styles.campo}>
            <span className={styles.campoRotulo}>Tipo</span>
            <div className={styles.filtros}>
              {CREATIVE_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={tipo === k}
                  className={cx(styles.chip, tipo === k && styles.chipOn)}
                  onClick={() => setTipo(k)}
                >
                  {CREATIVE_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          {colecoes.length > 0 ? (
            <div className={styles.campo}>
              <span className={styles.campoRotulo}>Coleções</span>
              <div className={styles.filtros}>
                {colecoes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={escolhidas.includes(c.id)}
                    className={cx(styles.chip, escolhidas.includes(c.id) && styles.chipOn)}
                    onClick={() =>
                      setEscolhidas((atual) =>
                        atual.includes(c.id) ? atual.filter((x) => x !== c.id) : [...atual, c.id],
                      )
                    }
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <label className={styles.campo}>
            <span className={styles.campoRotulo}>Tags</span>
            <input
              className={styles.campoEntrada}
              value={tags}
              placeholder="separadas por vírgula"
              aria-label="Tags pessoais"
              onChange={(e) => setTags(e.target.value)}
            />
          </label>

          <label className={styles.campo}>
            <span className={styles.campoRotulo}>Nota</span>
            <textarea
              className={styles.campoTexto}
              value={nota}
              placeholder="Por que isto importa para você"
              aria-label="Nota pessoal"
              onChange={(e) => setNota(e.target.value)}
            />
          </label>
        </div>

        <div className={styles.modalAcoes}>
          <button type="button" className={styles.acao} onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className={`${styles.acao} ${styles.acaoPrincipal}`}
            disabled={!podeSalvar}
            onClick={salvar}
          >
            Salvar na biblioteca
          </button>
        </div>
      </div>
    </div>
  )
}
