import {
  DEPENDENCIAS,
  type DiagnosticoDoSistema,
  type NivelDeDependencia,
} from '@shared/dependencias'
import { marcar, t } from '@shared/i18n'
import { useEffect, useState } from 'react'
import { cx } from '@/ui/cx'
import styles from '../SettingsScreen.module.css'

/**
 * O que o Halo precisa de fora, e o que esta máquina tem.
 *
 * O app chama 26 programas do sistema e não embute nenhum. Quase todos
 * degradam bem — a leitura some, a lista fica vazia —, mas até aqui eles
 * sumiam **em silêncio**: sem `sensors` a temperatura simplesmente não
 * aparecia na Home, e não havia como distinguir isso de um módulo desligado.
 * Pior, o áudio ausente dizia "ligue em Configurações → Ilha" quando o que
 * faltava era o `pactl`.
 *
 * A lista é a mesma de `npm run doctor` (`src/shared/dependencias.ts`) — esta
 * tela é para quem não abre terminal. E ela **não instala nada**: escrever
 * fora do app para conseguir um efeito de sistema é justamente o que o projeto
 * não faz (CLAUDE.md § Janela e camada). Ela diz o comando; rodar é do
 * usuário.
 */

const TITULOS: Record<NivelDeDependencia, string> = {
  essencial: marcar('Essenciais'),
  kde: marcar('Do KDE Plasma'),
  opcional: marcar('Opcionais'),
}

const EXPLICACOES: Record<NivelDeDependencia, string> = {
  essencial: marcar('Sem isto uma função central do app para de funcionar.'),
  kde: marcar('Vêm com o KDE Plasma, que é o ambiente-alvo do app. Fora dele não existem.'),
  opcional: marcar('Cada uma custa uma leitura ou uma ação — o resto segue igual.'),
}

const NIVEIS: readonly NivelDeDependencia[] = ['essencial', 'kde', 'opcional']

export function SystemSection() {
  const [diagnostico, setDiagnostico] = useState<DiagnosticoDoSistema | null>(null)

  useEffect(() => {
    void window.halo?.system.dependencies().then(setDiagnostico)
  }, [])

  return (
    <>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('O que o Halo chama de fora')}</span>
        <span className={styles.note}>
          {t(
            'O app conversa com o sistema por linha de comando e por D-Bus, e não embute nenhum desses programas. Esta tela diz quais estão aqui — e o que se perde sem cada um que falta. Ela não instala nada: o comando fica escrito, e rodar é você quem decide.',
          )}
        </span>
      </div>

      <SessaoGrafica diagnostico={diagnostico} />

      {NIVEIS.map((nivel) => (
        <Grupo key={nivel} nivel={nivel} diagnostico={diagnostico} />
      ))}

      <span className={styles.note}>
        {t('A mesma lista roda no terminal com')} <code>npm run doctor</code>
        {t(
          ', que sai com erro quando falta algo essencial — é o que se usa antes de empacotar uma versão.',
        )}
      </span>
    </>
  )
}

/**
 * A sessão gráfica vem antes dos programas.
 *
 * Não é nada que se instale, mas é o requisito que mais muda o que o app
 * consegue fazer: camada da janela, posição lembrada e "manter por cima" só
 * existem no X11 — no Wayland o Electron pede os três e o compositor ignora,
 * em silêncio (CLAUDE.md § Janela e camada).
 */
function SessaoGrafica({ diagnostico }: { diagnostico: DiagnosticoDoSistema | null }) {
  if (!diagnostico) return null
  const { tipo, x11 } = diagnostico.sessao
  const nativo = tipo === 'x11'
  const ok = nativo || x11

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>{t('Sessão gráfica')}</span>
      <div className={cx(styles.linha, styles.depLinha)}>
        <span className={cx(styles.depMarca, ok ? styles.depOk : styles.depFaltaGrave)}>
          {ok ? '✓' : '✗'}
        </span>
        <span className={styles.depTexto}>
          <span className={styles.depNome}>{nativo ? 'X11' : tipo}</span>
          <span className={styles.depDetalhe}>
            {nativo
              ? t('A camada da janela, a posição lembrada e o player por cima funcionam.')
              : ok
                ? t(
                    'Com XWayland de pé: o app abre como cliente X11 sobre ele, e as três coisas que precisa continuam existindo.',
                  )
                : t(
                    'Sem XWayland: o app abre, mas o compositor vai ignorar a camada da janela, a posição e o "manter por cima" — em silêncio.',
                  )}
          </span>
        </span>
      </div>
    </div>
  )
}

function Grupo({
  nivel,
  diagnostico,
}: {
  nivel: NivelDeDependencia
  diagnostico: DiagnosticoDoSistema | null
}) {
  const doNivel = DEPENDENCIAS.filter((d) => d.nivel === nivel)
  // Sem diagnóstico ninguém sabe de nada — é o caso de rodar fora do Electron
  // (`npm run test:screens` abre o app no navegador). A lista continua valendo
  // como documento do que o app chama; o que some é a marca de presença.
  const faltando = diagnostico ? doNivel.filter((d) => !diagnostico.presentes[d.id]) : []

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>
        {t(TITULOS[nivel])}
        {diagnostico
          ? faltando.length === 0
            ? ` · ${t('os {n} estão aqui', { n: doNivel.length })}`
            : ` · ${t('faltam {n} de {total}', { n: faltando.length, total: doNivel.length })}`
          : ` · ${doNivel.length}`}
      </span>
      <span className={styles.note}>{t(EXPLICACOES[nivel])}</span>
      <div className={styles.lista}>
        {doNivel.map((dep) => {
          const tem = diagnostico?.presentes[dep.id]
          return (
            <div key={dep.id} className={cx(styles.linha, styles.depLinha)}>
              <span
                className={cx(
                  styles.depMarca,
                  tem === true && styles.depOk,
                  tem === false && (nivel === 'essencial' ? styles.depFaltaGrave : styles.depFalta),
                )}
              >
                {tem === undefined ? '·' : tem ? '✓' : '✗'}
              </span>
              <span className={styles.depTexto}>
                <span className={styles.depNome}>{dep.id}</span>
                <span className={styles.depDetalhe}>
                  {/* Presente, o que interessa é PARA QUE ele serve; ausente, o
                      que se perde — que é a frase que faz alguém decidir se
                      vale instalar. */}
                  {tem === false
                    ? t('Sem ele: {perde}.', { perde: t(dep.perde) })
                    : t('Para {para}.', { para: t(dep.para) })}
                </span>
                {tem === false ? (
                  <span className={styles.depComando}>
                    {dep.pacote.startsWith('Claude Code') || dep.pacote.startsWith('driver')
                      ? // Nem tudo se instala com `apt`: o Claude Code tem
                        // instalador próprio e o driver da NVIDIA é escolha do
                        // usuário. Um `sudo apt install` mentiroso ali seria
                        // pior do que dizer o nome.
                        dep.pacote
                      : `sudo apt install ${dep.pacote}`}
                  </span>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
