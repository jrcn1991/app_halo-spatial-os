import type { AppInfo } from '@shared/ipc-contract'
import { useEffect, useState } from 'react'
import styles from '../SettingsScreen.module.css'

/**
 * Sobre — o que é este app, de quem ele é, e sob que licença.
 *
 * Era a última seção "em breve" da tela, e o que faltava para preenchê-la já
 * existia: `appInfo` está no contrato de IPC desde o começo e não era lido por
 * ninguém.
 *
 * A licença não é enfeite aqui. O código é GPL-3.0, e os conjuntos de ícone do
 * clima são CC BY-NC-SA — **NonCommercial**, uma cláusula que muda o que o app
 * pode virar. A regra do projeto é que obrigação de licença fica visível onde
 * o material aparece (é por isso que o crédito do TMDB não sai do painel de
 * detalhes); esta é a tela onde a do app inteiro cabe.
 */

/** A página de quem faz o Halo. Abre no navegador do sistema, nunca aqui. */
const AUTOR = 'https://github.com/jrcn1991'

export function AboutSection() {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.halo?.appInfo().then(setInfo)
  }, [])

  return (
    <>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Halo — Spatial OS</span>
        <span className={styles.note}>
          Widget de área de trabalho em painéis de vidro: os medidores da máquina, os arquivos, a
          mídia, a música, os containers e os agentes do Claude, numa janela transparente que fica
          na camada do papel de parede. Feito para KDE Plasma em sessão X11.
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Versões</span>
        <div className={styles.card} data-halo-cartao="mini">
          <div className={styles.metric}>
            Halo
            {/* Enquanto não chega, um traço — e não "carregando": o valor vem
                do main em um quadro, e um estado de espera piscaria. */}
            <span className={styles.metricValue}>{info?.version ?? '—'}</span>
          </div>
          <div className={styles.metric}>
            Electron<span className={styles.metricValue}>{info?.electron ?? '—'}</span>
          </div>
          <div className={styles.metric}>
            Chromium<span className={styles.metricValue}>{info?.chrome ?? '—'}</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Quem faz</span>
        <div className={styles.linha}>
          <span className={styles.linhaTexto}>
            <span className={styles.linhaTitulo}>Rafael Neves</span>
            <span className={styles.linhaDetalhe}>github.com/jrcn1991</span>
          </span>
          {/*
            `<a target="_blank">`, e não um botão com IPC: o main já intercepta
            a abertura de janela e manda o endereço para o navegador do sistema,
            só para `http(s)` (ver `setWindowOpenHandler` em `main/window.ts`).
            É o mesmo caminho das manchetes da Home — um caminho, uma trava.
          */}
          <a
            className={styles.acao}
            href={AUTOR}
            target="_blank"
            rel="noreferrer"
            aria-label="Abrir a página de Rafael Neves no GitHub"
          >
            Abrir
          </a>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Licença</span>
        <span className={styles.note}>
          O código é <strong>GPL-3.0-or-later</strong>. O que vem de terceiros — fontes, ícones,
          bibliotecas e os dados buscados na internet — está listado em <code>THIRD-PARTY.md</code>,
          que viaja dentro do próprio pacote.
        </span>
        <span className={styles.note}>
          Uma obrigação vale ser dita aqui: os dois conjuntos de ícone do clima são{' '}
          <strong>CC BY-NC-SA</strong> — <strong>NonCommercial</strong>. Enquanto o Halo é
          distribuído sem cobrança, a cláusula está cumprida; se um dia ele for vendido, ou embutido
          em algo que se venda, os três precisam sair ou ser relicenciados.
        </span>
      </div>
    </>
  )
}
