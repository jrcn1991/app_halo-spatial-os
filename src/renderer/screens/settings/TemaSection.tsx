import type { EnvironmentId } from '@shared/environments'
import { ENVIRONMENTS } from '@shared/environments'
import { marcar, t } from '@shared/i18n'
import {
  corDoAmbiente,
  type EstadoDoTemaKde,
  ehCorHex,
  type ResultadoDoTemaKde,
} from '@shared/tema-kde'
import { type CSSProperties, useEffect, useState } from 'react'
import { useEstadoDoTemaKde } from '@/hooks/useTemaKde'
import { useHalo } from '@/store/useHalo'
import { Toggle } from '@/ui/Toggle'
import styles from '../SettingsScreen.module.css'

/**
 * Integrações → Tema: o CyberKDE segue o ambiente.
 *
 * Opcional e desligada por padrão (pedido do usuário, 29/09/2026). Ligada, a
 * troca de ambiente pede ao CyberKDE que se aplique, se ainda não estiver, e
 * que troque a cor de destaque para a do ambiente: pastas, ícones da dock,
 * janelas. Quem recolore é o próprio tema; o Halo só chama o `cyberkde` (ver
 * `main/services/tema-kde.ts`). A seção diz o que está valendo AGORA, não só
 * o que o interruptor pede.
 */
export function TemaSection() {
  const cfg = useHalo((s) => s.temaKde)
  const setTemaKde = useHalo((s) => s.setTemaKde)
  const ambienteAtivo = useHalo((s) => s.environment.id)
  const estado = useEstadoDoTemaKde()

  const definirCor = (id: EnvironmentId, cor: string | undefined) => {
    const cores = { ...cfg.cores }
    if (cor === undefined) delete cores[id]
    else cores[id] = cor.toUpperCase()
    setTemaKde({ cores })
  }

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{t('Integrações · tema do KDE')}</span>
        <span className={styles.title}>{t('Tema')}</span>
        <span className={styles.subtitle}>
          {t(
            'Com o CyberKDE instalado, a troca de ambiente também veste o KDE: o tema é aplicado se ainda não estiver, e a cor de destaque — pastas, ícones da dock, janelas — passa a ser a do ambiente.',
          )}
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>CyberKDE</span>
        <div className={styles.stack}>
          <Toggle
            label={t('O CyberKDE segue o ambiente')}
            checked={cfg.on}
            onChange={(on) => setTemaKde({ on })}
          />
        </div>
        {estado ? <span className={styles.note}>{fraseDoEstado(estado, cfg.on)}</span> : null}
        {estado?.ultima && !estado.emCurso
          ? estado.ultima.avisos.map((aviso) => (
              <span key={aviso} className={styles.note}>
                {aviso}
              </span>
            ))
          : null}
        <span className={styles.note}>
          {t(
            'O Halo não edita o tema: ele só executa o comando cyberkde, e é o tema que se regenera e reinicia o painel do Plasma no fim — leva alguns segundos. Nada roda sem um gesto seu: só ao trocar de ambiente, ao ligar a integração ou ao mudar a cor do ambiente em que você está. Para desfazer tudo no KDE, rode cyberkde off.',
          )}
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Cor de cada ambiente')}</span>
        <div className={styles.lista}>
          {ENVIRONMENTS.filter((e) => e.ready).map((ambiente) => (
            <LinhaDeCor
              key={ambiente.id}
              nome={ambiente.name}
              ativo={ambiente.id === ambienteAtivo}
              cor={corDoAmbiente(cfg, ambiente.id) ?? ''}
              escolhida={cfg.cores[ambiente.id] !== undefined}
              onCor={(cor) => definirCor(ambiente.id, cor)}
              onPadrao={() => definirCor(ambiente.id, undefined)}
            />
          ))}
        </div>
        <span className={styles.note}>
          {t(
            'O CyberKDE clareia uma cor escura demais para ela continuar legível sobre o fundo dele; a cor que você escolheu continua guardada como está.',
          )}
        </span>
      </div>
    </>
  )
}

function LinhaDeCor(props: {
  nome: string
  ativo: boolean
  cor: string
  escolhida: boolean
  onCor: (cor: string) => void
  onPadrao: () => void
}) {
  const { nome, ativo, cor, escolhida, onCor, onPadrao } = props
  const [rascunho, setRascunho] = useState(cor)
  useEffect(() => setRascunho(cor), [cor])

  const confirmar = (valor: string) => {
    const hex = valor.trim().startsWith('#') ? valor.trim() : `#${valor.trim()}`
    if (ehCorHex(hex)) onCor(hex)
    else setRascunho(cor)
  }

  return (
    <div className={styles.linha}>
      <div className={styles.linhaTexto}>
        <span className={styles.linhaTitulo}>{nome}</span>
        <span className={styles.linhaDetalhe}>
          {ativo ? t('ambiente ativo') : escolhida ? t('escolhida por você') : t('padrão')}
        </span>
      </div>
      {/* O seletor nativo é o próprio quadrado da cor. A cor vai por variável,
          não por `background` em linha: ela é dado do usuário, não estilo. */}
      <input
        type="color"
        className={styles.corDoAmbiente}
        style={{ '--cor-do-ambiente': cor } as CSSProperties}
        value={cor.toLowerCase()}
        aria-label={t('Cor do {nome}', { nome })}
        onChange={(e) => setRascunho(e.target.value.toUpperCase())}
        onBlur={(e) => confirmar(e.target.value)}
      />
      <input
        className={`${styles.hexInput} ${styles.hexCurto}`}
        value={rascunho}
        spellCheck={false}
        aria-label={t('Cor do {nome} em hexadecimal', { nome })}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={(e) => confirmar(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && confirmar(e.currentTarget.value)}
      />
      <button type="button" className={styles.acao} disabled={!escolhida} onClick={onPadrao}>
        {t('Padrão')}
      </button>
    </div>
  )
}

const FRASES: Record<ResultadoDoTemaKde, string> = {
  aplicado: marcar('Aplicado no {ambiente}.'),
  'aplicado-pendente': marcar(
    'Aplicado no {ambiente}; só a tela de login ficou para depois (pede root).',
  ),
  'ja-estava': marcar('O {ambiente} já estava com esta cor — nada foi chamado.'),
  ausente: marcar('O comando cyberkde não foi encontrado.'),
  ocupado: marcar(
    'O CyberKDE estava ocupado com outra operação; troque de ambiente de novo em instantes.',
  ),
  prazo: marcar(
    'O CyberKDE não terminou a tempo no {ambiente}; rode a troca de novo para completar.',
  ),
  falha: marcar('O CyberKDE falhou no {ambiente}: {detalhe}'),
}

function fraseDoEstado(estado: EstadoDoTemaKde, ligada: boolean): string {
  const nomeDe = (id: EnvironmentId) => ENVIRONMENTS.find((e) => e.id === id)?.name ?? id
  if (!estado.instalado) {
    return t(
      'O CyberKDE não está instalado nesta máquina (o comando cyberkde não está no PATH nem em ~/.local/bin). Sem ele a integração não faz nada.',
    )
  }
  if (estado.emCurso) {
    const { ambiente, etapa, feitas, total } = estado.emCurso
    return total > 0
      ? t('Aplicando o {ambiente} no CyberKDE — {etapa} ({feitas} de {total})…', {
          ambiente: nomeDe(ambiente),
          etapa,
          feitas: String(feitas),
          total: String(total),
        })
      : t('Aplicando o {ambiente} no CyberKDE…', { ambiente: nomeDe(ambiente) })
  }
  if (estado.ultima) {
    return t(FRASES[estado.ultima.resultado], {
      ambiente: nomeDe(estado.ultima.ambiente),
      detalhe: estado.ultima.detalhe,
    })
  }
  if (estado.ligado === null) return t('O CyberKDE não respondeu ao status.')
  const clareada =
    estado.cor &&
    estado.corAplicada &&
    estado.cor.toUpperCase() !== estado.corAplicada.toUpperCase()
  const tema = estado.ligado
    ? clareada
      ? t(
          'O CyberKDE está aplicado. Você pediu {cor}, mas o tema usa {aplicada}: a cor pedida não teria contraste sobre o fundo dele.',
          { cor: estado.cor ?? '', aplicada: estado.corAplicada ?? '' },
        )
      : t('O CyberKDE está aplicado, com a cor {cor}.', { cor: estado.cor ?? '?' })
    : t('O CyberKDE está instalado, mas não aplicado.')
  return ligada ? tema : `${tema} ${t('A integração está desligada: o Halo não o chama.')}`
}
