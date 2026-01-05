import { ArrowClockwise } from '@phosphor-icons/react/dist/icons/ArrowClockwise'
import { ArrowSquareOut } from '@phosphor-icons/react/dist/icons/ArrowSquareOut'
import { CheckCircle } from '@phosphor-icons/react/dist/icons/CheckCircle'
import { SignIn } from '@phosphor-icons/react/dist/icons/SignIn'
import { WarningCircle } from '@phosphor-icons/react/dist/icons/WarningCircle'
import type {
  CreativeConnection,
  CreativeKind,
  CreativeProviderId,
  CreativeSort,
} from '@shared/creative'
import { CREATIVE_KIND_LABEL, CREATIVE_KINDS } from '@shared/creative'
import { cx } from '@/ui/cx'
import styles from './social.module.css'

/**
 * O painel esquerdo: de onde o conteúdo vem, e como filtrá-lo.
 *
 * "Fontes conectadas" primeiro, e não os filtros, porque é a pergunta que
 * antecede todas as outras: sem fonte não há o que buscar. Cada linha diz o
 * que aquela plataforma sabe fazer AGORA — e quando não sabe, diz o que falta,
 * em vez de aparecer como um botão morto.
 */
export function Fontes({
  fontes,
  aoEntrar,
  aoSair,
  termo,
  tipos,
  aoTrocarTipos,
  ordem,
  aoTrocarOrdem,
}: {
  fontes: CreativeConnection[] | null
  aoEntrar: (id: CreativeProviderId) => void
  aoSair: (id: CreativeProviderId) => void
  termo: string
  tipos: CreativeKind[]
  aoTrocarTipos: (tipos: CreativeKind[]) => void
  ordem: CreativeSort
  aoTrocarOrdem: (ordem: CreativeSort) => void
}) {
  const alternar = (tipo: CreativeKind) =>
    aoTrocarTipos(tipos.includes(tipo) ? tipos.filter((t) => t !== tipo) : [...tipos, tipo])

  return (
    <div className={styles.colunaFontes}>
      <div className={styles.header}>
        <span className={styles.title}>Fontes conectadas</span>
      </div>

      <div className={styles.fontes}>
        {(fontes ?? []).map((fonte) => (
          <div key={fonte.provider} className={styles.fonte}>
            <div className={styles.fonteTopo}>
              {fonte.connected ? (
                <CheckCircle size={15} weight="fill" color="var(--accent-green)" />
              ) : (
                <WarningCircle size={15} color="var(--text-tertiary)" />
              )}
              <span className={styles.fonteNome}>{fonte.name}</span>
              {fonte.lastSyncAt ? (
                <span className={styles.fonteQuando} title={`Última busca: ${fonte.lastSyncAt}`}>
                  <ArrowClockwise size={11} />
                </span>
              ) : null}
            </div>
            <span className={styles.fonteDescricao}>{fonte.description}</span>

            {/* As capacidades são o que ela sabe fazer AGORA — e só interessam
                quando ela está de pé. Numa fonte bloqueada, a informação útil é
                o motivo, e a lista de capacidades só somaria ruído. */}
            {fonte.connected && fonte.capabilities.length > 0 ? (
              <span className={styles.fonteCaps}>
                {fonte.capabilities
                  .map((c) => CAPACIDADE[c])
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : null}

            {/* Cortado em duas linhas, com o texto inteiro no `title`: o motivo
                precisa caber ao lado de outras quatro fontes, e cinco
                parágrafos num painel de 300px empurrariam os filtros para
                fora da tela. */}
            {fonte.error ? (
              <span className={styles.fonteErro} title={fonte.error}>
                {fonte.error}
              </span>
            ) : null}

            {/* A conta: quem pede a senha é o SITE, numa janela com moldura e
                com o endereço à vista — o app não desenha campo de senha
                nenhum (ver `creative/navegador.ts`). "Sair" esquece os cookies
                aqui na máquina; não mexe na conta. */}
            {fonte.signIn ? (
              <span className={styles.fonteConta}>
                {fonte.signedIn ? (
                  <>
                    <span className={styles.fonteContaOk}>conta conectada</span>
                    <button
                      type="button"
                      className={styles.fonteSair}
                      onClick={() => aoSair(fonte.provider)}
                    >
                      Sair
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.fonteEntrar}
                    onClick={() => aoEntrar(fonte.provider)}
                  >
                    <SignIn size={12} />
                    Entrar na minha conta
                  </button>
                )}
              </span>
            ) : null}

            {/* A saída honesta de uma fonte que não pode ser consultada daqui:
                em vez de raspar o que os termos proíbem, leva até o site. O
                termo digitado vai junto. `noopener noreferrer`: a aba nova não
                recebe referência a esta janela nem de onde veio. */}
            {fonte.searchUrl ? (
              <a
                className={styles.fonteBusca}
                href={fonte.searchUrl.replace('%s', encodeURIComponent(termo.trim()))}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ArrowSquareOut size={11} />
                Procurar no site
              </a>
            ) : null}
          </div>
        ))}
      </div>

      <div className={styles.header}>
        <span className={styles.subtitulo}>Tipo</span>
      </div>
      <div className={styles.tipos}>
        {CREATIVE_KINDS.map((tipo) => (
          <button
            key={tipo}
            type="button"
            aria-pressed={tipos.includes(tipo)}
            className={cx(styles.chip, tipos.includes(tipo) && styles.chipOn)}
            onClick={() => alternar(tipo)}
          >
            {CREATIVE_KIND_LABEL[tipo]}
          </button>
        ))}
      </div>

      <div className={styles.rodapeFiltros}>
        <span className={styles.subtitulo}>Ordenar</span>
        <div className={styles.ordens}>
          {(['relevancia', 'recentes', 'populares'] as CreativeSort[]).map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={ordem === o}
              className={cx(styles.chip, ordem === o && styles.chipOn)}
              onClick={() => aoTrocarOrdem(o)}
            >
              {ORDEM[o]}
            </button>
          ))}
        </div>
        {tipos.length > 0 ? (
          <button type="button" className={styles.limpar} onClick={() => aoTrocarTipos([])}>
            Limpar {tipos.length} filtro{tipos.length > 1 ? 's' : ''}
          </button>
        ) : null}
      </div>
    </div>
  )
}

const CAPACIDADE: Record<string, string> = {
  search: 'busca',
  trending: 'destaques',
  item: 'lê um link colado',
  collections: 'coleções',
}

const ORDEM: Record<CreativeSort, string> = {
  relevancia: 'Relevância',
  recentes: 'Recentes',
  populares: 'Populares',
}
