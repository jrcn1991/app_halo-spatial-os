import { marcar, t } from '@shared/i18n'
import { CANTOS_DOS_AVISOS, type CantoDosAvisos } from '@shared/notificacoes'
import { useState } from 'react'
import { useEstadoDosAvisos, useExemploDeAviso } from '@/hooks/useNotificacoes'
import { useHalo } from '@/store/useHalo'
import { Tabs } from '@/ui/Tabs'
import { Toggle } from '@/ui/Toggle'
import styles from '../SettingsScreen.module.css'

const ROTULOS: Record<CantoDosAvisos, string> = {
  'topo-direita': marcar('Topo à direita'),
  'topo-esquerda': marcar('Topo à esquerda'),
  'base-direita': marcar('Base à direita'),
  'base-esquerda': marcar('Base à esquerda'),
}

/**
 * Notificações — os balões do sistema no estilo do ambiente.
 *
 * Ligado, o Halo desenha os balões com a roupa do tema ativo, e o Plasma
 * continua sendo o servidor. A seção diz o que está valendo AGORA (o estado
 * vem do main), e não só o que o interruptor pede: ligado e sem desenhar tem
 * um motivo, e a tela o mostra — é a regra do projeto para integração que não
 * pegou.
 */
export function NotificacoesSection() {
  const cfg = useHalo((s) => s.notificacoes)
  const setNotificacoes = useHalo((s) => s.setNotificacoes)
  // O estado muda sem a tela pedir (a janela carrega, o applet do KDE derruba
  // o silêncio): o hook o relê enquanto a seção está aberta.
  const estado = useEstadoDosAvisos()
  const exemploDeAviso = useExemploDeAviso()
  const [exemplo, setExemplo] = useState<'pronto' | 'mandando' | 'falhou'>('pronto')

  const mandarExemplo = () => {
    setExemplo('mandando')
    void exemploDeAviso()
      .then(() => setExemplo('pronto'))
      .catch(() => setExemplo('falhou'))
  }

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{t('Notificações · do sistema')}</span>
        <span className={styles.title}>{t('Notificações')}</span>
        <span className={styles.subtitle}>
          {t(
            'Os balões das notificações do computador vestem o ambiente ativo — o da Floresta na Floresta, o do Cyberpunk no Cyberpunk. Trocar de ambiente troca os balões junto.',
          )}
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Balões')}</span>
        <div className={styles.stack}>
          <Toggle
            label={t('Notificações no estilo do ambiente')}
            checked={cfg.on}
            onChange={(on) => setNotificacoes({ on })}
          />
        </div>
        {estado ? (
          <span className={styles.note}>
            {!estado.ligado
              ? t('Desligado: os balões são os do Plasma.')
              : estado.ativo
                ? estado.silencio
                  ? t(
                      'Com o Halo, e em "não perturbe" pela ilha: nada aparece até você desligar o silêncio.',
                    )
                  : t('Com o Halo agora.')
                : t('Ligado, mas os balões continuam com o Plasma: {motivo}.', {
                    motivo: estado.motivo,
                  })}
          </span>
        ) : null}
        <span className={styles.note}>
          {t(
            'O Plasma continua sendo o servidor: o histórico no sino da bandeja, as respostas aos aplicativos e o "não perturbe" seguem com ele. O Halo pede a ele que não desenhe os balões — por isso o sino mostra "não perturbe" enquanto o Halo está aberto — e desenha os seus. Se o Halo fechar ou travar, os balões do Plasma voltam na hora. As notificações críticas continuam no balão do Plasma: ele as mostra mesmo em "não perturbe", e desenhar as nossas daria duas.',
          )}
        </span>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.replay}
            onClick={mandarExemplo}
            // Sem estado não há servidor a quem mandar (fora do Electron, ou ele
            // ainda não respondeu).
            disabled={exemplo === 'mandando' || !estado}
          >
            {t('Mostrar um exemplo')}
          </button>
        </div>
        {exemplo === 'falhou' ? (
          <span className={styles.note}>
            {t('O servidor de notificações não respondeu ao exemplo.')}
          </span>
        ) : null}
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Onde aparecem')}</span>
        <Tabs
          label={t('Canto dos balões')}
          options={CANTOS_DOS_AVISOS.map((value) => ({ value, label: t(ROTULOS[value]) }))}
          value={cfg.canto}
          onChange={(canto) => setNotificacoes({ canto })}
        />
        <span className={styles.note}>
          {t(
            'Na tela principal, dentro da área útil — o painel do Plasma nunca é coberto. O padrão é onde o Plasma já punha os dele.',
          )}
        </span>
      </div>
    </>
  )
}
