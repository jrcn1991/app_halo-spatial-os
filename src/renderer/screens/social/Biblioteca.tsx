import { FolderSimplePlus } from '@phosphor-icons/react/dist/icons/FolderSimplePlus'
import { Heart } from '@phosphor-icons/react/dist/icons/Heart'
import { LinkSimple } from '@phosphor-icons/react/dist/icons/LinkSimple'
import { Trash } from '@phosphor-icons/react/dist/icons/Trash'
import type { CreativeCollection, CreativeItem, CreativeSaved } from '@shared/creative'
import { marcar, t } from '@shared/i18n'
import { useEffect, useRef, useState } from 'react'
import { cx } from '@/ui/cx'
import { Capa } from './Capa'
import styles from './social.module.css'

/**
 * O painel direito: a biblioteca pessoal.
 *
 * Favoritar e salvar são coisas DIFERENTES, e a tela mantém a diferença: o
 * coração é marcação rápida, e a coleção é organização permanente. Um item
 * pode estar em várias coleções, ou em nenhuma — "em nenhuma" é um estado
 * válido, e ele continua na biblioteca.
 *
 * As coleções sugeridas (Inspirações, Modelos para imprimir…) aparecem como
 * SUGESTÃO e não são criadas sozinhas: o usuário pediu que fossem sugestões, e
 * uma pasta que aparece sem ninguém pedir é uma pasta que ninguém quis.
 *
 * O grupo aberto aqui é o DESTINO de quem for salvo no feed — por isso ele mora
 * na tela e não neste componente. Antes tudo caía solto: dois itens salvos,
 * `coleções=[]` e `favorito=false`, visíveis só em "Tudo" e em mais lugar
 * nenhum. Grupo que nunca recebe nada é grupo que não existe.
 */
const SUGESTOES = [
  marcar('Inspirações'),
  marcar('Paletas'),
  marcar('Interfaces e HUDs'),
  marcar('Tipografia'),
  marcar('Ilustração'),
  marcar('Ideias para depois'),
]

export function Biblioteca({
  colecoes,
  salvos,
  filtro,
  aoFiltrar,
  aoAbrir,
  aoFavoritar,
  aoRemover,
  aoCriarColecao,
  aoApagarColecao,
  aoSalvarPorLink,
}: {
  colecoes: CreativeCollection[]
  salvos: CreativeSaved[]
  /** O grupo aberto — e o DESTINO de quem for salvo daqui. */
  filtro: string
  aoFiltrar: (filtro: string) => void
  aoAbrir: (item: CreativeItem) => void
  aoFavoritar: (item: CreativeItem) => void
  aoRemover: (id: string) => void
  aoCriarColecao: (nome: string) => void
  aoApagarColecao: (id: string) => void
  aoSalvarPorLink: () => void
}) {
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const campoNome = useRef<HTMLInputElement>(null)

  // O foco vai para o campo assim que ele aparece — quem clicou em "Nova" já
  // quer digitar. Por `ref` e não por `autofocus`: o atributo rouba o foco de
  // quem estiver navegando por teclado em outro ponto da página, e por isso a
  // regra de acessibilidade o proíbe. Aqui o campo só existe depois do clique.
  useEffect(() => {
    if (criando) campoNome.current?.focus()
  }, [criando])

  const termo = busca.trim().toLowerCase()
  const lista = salvos
    .filter((s) =>
      filtro === 'tudo'
        ? true
        : filtro === 'favoritos'
          ? s.favorite
          : s.collections.includes(filtro),
    )
    .filter(
      (s) =>
        !termo ||
        s.item.title.toLowerCase().includes(termo) ||
        s.item.author.toLowerCase().includes(termo) ||
        s.tags.some((tag) => tag.toLowerCase().includes(termo)),
    )

  const criar = () => {
    const limpo = nome.trim()
    if (!limpo) return
    aoCriarColecao(limpo)
    setNome('')
    setCriando(false)
  }

  return (
    <>
      <div className={styles.header}>
        <span className={styles.title}>{t('Biblioteca')}</span>
        {/* Guardar por link é ação DA BIBLIOTECA, e é aqui que ela mora. No
            campo de busca ela dividia espaço com procurar — dois verbos
            diferentes na mesma caixa, e o de guardar não tem nada a ver com o
            que se digita ali. */}
        <button type="button" className={styles.porLink} onClick={aoSalvarPorLink}>
          <LinkSimple size={13} />
          {t('Por link')}
        </button>
        <span className={styles.contador}>{salvos.length}</span>
      </div>

      <div className={styles.filtros}>
        <button
          type="button"
          aria-pressed={filtro === 'tudo'}
          className={cx(styles.chip, filtro === 'tudo' && styles.chipOn)}
          onClick={() => aoFiltrar('tudo')}
        >
          {t('Tudo')}
        </button>
        <button
          type="button"
          aria-pressed={filtro === 'favoritos'}
          className={cx(styles.chip, filtro === 'favoritos' && styles.chipOn)}
          onClick={() => aoFiltrar('favoritos')}
        >
          <Heart size={11} weight="fill" /> {t('Favoritos')}
        </button>
        {colecoes.map((c) => (
          <span key={c.id} className={styles.colecaoLinha}>
            <button
              type="button"
              aria-pressed={filtro === c.id}
              className={cx(styles.chip, filtro === c.id && styles.chipOn)}
              onClick={() => aoFiltrar(c.id)}
            >
              {c.name}
            </button>
            <button
              type="button"
              className={cx(styles.colecaoTirar, confirmando === c.id && styles.colecaoArmado)}
              aria-label={
                confirmando === c.id
                  ? t('Confirmar: apagar {nome}', { nome: c.name })
                  : t('Apagar a coleção {nome}', { nome: c.name })
              }
              title={confirmando === c.id ? t('Clique de novo para apagar') : undefined}
              onMouseLeave={() => setConfirmando(null)}
              onClick={() => {
                // Dois cliques, como apagar uma lista de mídia: uma coleção é
                // organização que a pessoa fez com a mão. Os ITENS ficam —
                // apagar a pasta não apaga o que estava dentro.
                if (confirmando !== c.id) {
                  setConfirmando(c.id)
                  return
                }
                setConfirmando(null)
                if (filtro === c.id) aoFiltrar('tudo')
                aoApagarColecao(c.id)
              }}
            >
              {confirmando === c.id ? t('APAGAR?') : <Trash size={11} />}
            </button>
          </span>
        ))}

        {criando ? (
          <input
            ref={campoNome}
            className={styles.colecaoCampo}
            value={nome}
            placeholder={t('Nome da coleção')}
            aria-label={t('Nome da nova coleção')}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') criar()
              if (e.key === 'Escape') setCriando(false)
            }}
            onBlur={criar}
          />
        ) : (
          <button type="button" className={styles.chip} onClick={() => setCriando(true)}>
            <FolderSimplePlus size={12} /> {t('Nova')}
          </button>
        )}
      </div>

      {colecoes.length === 0 ? (
        <div className={styles.sugestoes}>
          <span className={styles.sugestoesRotulo}>{t('Sugestões de coleção')}</span>
          <div className={styles.filtros}>
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                className={styles.chipFraco}
                onClick={() => aoCriarColecao(t(s))}
              >
                {t(s)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {salvos.length > 0 ? (
        <input
          className={styles.buscaSalvos}
          type="search"
          value={busca}
          placeholder={t('Procurar no que você salvou…')}
          aria-label={t('Procurar nos itens salvos')}
          onChange={(e) => setBusca(e.target.value)}
        />
      ) : null}

      <div className={styles.salvos}>
        {lista.map((s) => (
          <div key={s.item.id} className={styles.salvo}>
            <button
              type="button"
              className={styles.salvoAbrir}
              onClick={() => aoAbrir(s.item)}
              aria-label={t('Ver {titulo}', { titulo: s.item.title || t('referência') })}
            >
              <Capa url={s.item.cover} alt="" className={styles.capaPequena} />
              <span className={styles.salvoTexto}>
                <span className={styles.salvoTitulo}>{s.item.title || t('Sem título')}</span>
                <span className={styles.salvoOrigem}>{s.item.provider}</span>
              </span>
            </button>
            <button
              type="button"
              className={styles.cartaoBotao}
              aria-label={s.favorite ? t('Desfavoritar') : t('Favoritar')}
              aria-pressed={s.favorite}
              onClick={() => aoFavoritar(s.item)}
            >
              <Heart size={13} weight={s.favorite ? 'fill' : 'regular'} />
            </button>
            <button
              type="button"
              className={styles.cartaoBotao}
              aria-label={t('Tirar da biblioteca')}
              onClick={() => aoRemover(s.item.id)}
            >
              <Trash size={13} />
            </button>
          </div>
        ))}

        {salvos.length > 0 && lista.length === 0 ? (
          <span className={styles.vazioCorpo}>{t('Nada com esse filtro.')}</span>
        ) : null}
      </div>
    </>
  )
}
