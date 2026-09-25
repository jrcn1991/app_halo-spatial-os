import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/icons/ArrowCounterClockwise'
import { environmentById, environmentLabel } from '@shared/environments'
import { marcar, t } from '@shared/i18n'
import {
  ALTURA_PILULA_MAX,
  ALTURA_PILULA_MIN,
  ALTURA_PILULA_PADRAO,
  ISLAND_FLIGHTS,
  ISLAND_MOTIONS,
  ISLAND_OPENINGS,
  ISLAND_PLACEMENTS,
  type IslandFlightStyle,
  type IslandMotion,
  type IslandOpening,
  type IslandPlacement,
} from '@shared/island'
import { fusoValido } from '@shared/settings'
import { useState } from 'react'
import { useDisplays, useIslandCatalog } from '@/hooks/useIslandSettings'
import { useHalo } from '@/store/useHalo'
import { Slider } from '@/ui/Slider'
import { Tabs } from '@/ui/Tabs'
import { Toggle } from '@/ui/Toggle'
import styles from '../SettingsScreen.module.css'

/**
 * Ilha dinâmica.
 *
 * Ela é código isolado (ver `src/main/island/`), mas a configuração mora aqui,
 * junto de todas as outras — o usuário não deveria precisar saber onde cada
 * parte do app está para conseguir ajustá-la.
 *
 * Nasce desligada de propósito: a ilha aparece POR CIMA de tudo, e nada que
 * ocupa o topo da tela deve começar ligado sem alguém pedir.
 */
const MOVIMENTOS: Record<IslandMotion, string> = {
  gota: marcar('Gota'),
  elastico: marcar('Elástico'),
  desliza: marcar('Desliza'),
  expandir: marcar('Expandir'),
  nenhuma: marcar('Nenhuma'),
}

const EXPLICA: Record<IslandMotion, string> = {
  gota: marcar('Escorre do topo e assenta, com o peso de um líquido. É o padrão.'),
  elastico: marcar('Passa um pouco do ponto e volta — mais brincalhão.'),
  desliza: marcar('Entrada reta e curta, sem elasticidade. A mais discreta.'),
  expandir: marcar('Cresce a partir do topo, sem escorrer.'),
  nenhuma: marcar('Sem animação nenhuma. Útil em máquina apertada.'),
}

/**
 * O voo: como a janela entra na pílula e sai dela. Vale para a janela guardada
 * na gaveta e para o próprio Halo recolhido pelo Meta+Espaço — é o mesmo
 * fantasma, e duas peças iguais não deviam se mover de jeitos diferentes.
 */
const VOOS: Record<IslandFlightStyle, string> = {
  real: marcar('Janela de verdade'),
  'real-foguete': marcar('Verdade · Foguete'),
  'real-desmanchar': marcar('Verdade · Desmanchar'),
  sugado: marcar('Sugado'),
  genie: marcar('Gênio'),
  foguete: marcar('Foguete'),
  dobra: marcar('Dobra'),
  giro: marcar('Giro'),
  desmanchar: marcar('Desmanchar'),
  nenhuma: marcar('Nenhuma'),
}

const EXPLICA_VOO: Record<IslandFlightStyle, string> = {
  real: marcar(
    'Quem voa é a própria janela, com o conteúdo dela — quem anima é o compositor. Precisa do efeito do KWin, logo abaixo. Como ela voa na camada em que vive, uma janela aberta por cima esconde o voo; as outras variações desenham um cartão acima de tudo. É o padrão.',
  ),
  'real-foguete': marcar(
    'A janela de verdade, e ela PASSA da pílula e cai dentro dela — a subida vai mais alto que a boca antes de assentar.',
  ),
  'real-desmanchar': marcar(
    'A janela de verdade, cedendo opacidade desde o primeiro quadro: ela chega à pílula quase apagada.',
  ),
  sugado: marcar('Levanta da mesa, estreita e é sugado para dentro da pílula. É o padrão.'),
  genie: marcar(
    'A largura colapsa primeiro e a janela sobe por um gargalo, como o gênio da lâmpada.',
  ),
  foguete: marcar('Agacha, salta acima da pílula e cai dentro dela.'),
  dobra: marcar('Tomba para trás como uma folha e voa deitada.'),
  giro: marcar('Encolhe girando, como papel sugado por um ralo.'),
  desmanchar: marcar('Perde corpo pelo caminho e chega quase apagada.'),
  nenhuma: marcar('Sem cartão nenhum: a janela some e volta na hora. O anúncio continua.'),
}

const ASSENTO: Record<IslandPlacement, string> = {
  sobre: marcar('Sobre a barra'),
  abaixo: marcar('Abaixo da barra'),
}

const EXPLICA_ASSENTO: Record<IslandPlacement, string> = {
  sobre: marcar(
    'Por cima do painel do sistema, como o notch fica na barra de menus. Não gasta nenhum pixel de área útil.',
  ),
  abaixo: marcar(
    'Logo abaixo do painel. Nunca cobre o que ele mostra no centro, mas rouba uma faixa das janelas maximizadas.',
  ),
}

const ABERTURA: Record<IslandOpening, string> = {
  hover: marcar('Ao passar o mouse'),
  click: marcar('Só ao clicar'),
}

const EXPLICA_ABERTURA: Record<IslandOpening, string> = {
  hover: marcar(
    'Parar o mouse sobre a pílula por um instante abre a ilha. Cruzar o topo da tela não abre.',
  ),
  click: marcar('Passar por cima não faz nada; um clique na pílula abre, e o mouse saindo fecha.'),
}

/**
 * O campo dos fusos: texto livre separado por vírgula, validado a cada tecla
 * pelo Intl — só o que ele aceita chega ao store. O texto digitado fica no
 * campo mesmo com um nome errado no meio, para não comer o que o usuário
 * ainda está escrevendo.
 */
function Fusos({ valor, aoMudar }: { valor: string[]; aoMudar: (fusos: string[]) => void }) {
  const [texto, setTexto] = useState(valor.join(', '))
  const invalidos = texto
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t && !fusoValido(t))
  return (
    <div className={styles.stack}>
      <input
        className={styles.campo}
        type="text"
        value={texto}
        placeholder="Europe/Lisbon, Asia/Tokyo"
        aria-label={t('Fusos horários')}
        spellCheck={false}
        onChange={(e) => {
          setTexto(e.target.value)
          aoMudar(
            e.target.value
              .split(',')
              .map((t) => t.trim())
              .filter((t) => t && fusoValido(t))
              .slice(0, 8),
          )
        }}
      />
      {invalidos.length > 0 ? (
        <span className={styles.note}>
          {t('Não reconheço: {nomes}', { nomes: invalidos.join(', ') })}
        </span>
      ) : null}
    </div>
  )
}

export function IslandSection() {
  const island = useHalo((s) => s.island)
  const setIsland = useHalo((s) => s.setIsland)
  // A altura da pílula é do AMBIENTE ATIVO, não global: cada ambiente pede
  // uma pílula diferente sobre a barra.
  const ambiente = useHalo((s) => s.environment.id)
  const ajuste = useHalo((s) => s.environment.ajustes)[ambiente]
  const setIslandHeight = useHalo((s) => s.setIslandHeight)
  const escolhida = ajuste?.islandHeight !== undefined
  const altura = ajuste?.islandHeight ?? island.pillHeight
  const doAmbiente = environmentById(ambiente)
  const nomeDoAmbiente = doAmbiente ? environmentLabel(doAmbiente) : ambiente
  const telas = useDisplays().data ?? []
  const integracoes = useIslandCatalog().data?.length ?? 0

  const opcoesTela = [
    { value: 'primary', label: t('Tela principal') },
    ...telas.map((tela) => ({ value: tela.id, label: tela.label })),
    { value: 'all', label: t('Todas') },
  ]

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{t('Ilha dinâmica')}</span>
        <span className={styles.title}>{t('A gota no topo da tela')}</span>
        <span className={styles.subtitle}>
          {t(
            'Uma faixa que fica acima de tudo, mostra o que importa e deixa agir sem abrir o app. Passe o mouse nela para abrir.',
          )}
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Ativar')}</span>
        <div className={styles.stack}>
          <Toggle
            label={t('Mostrar a ilha dinâmica')}
            checked={island.on}
            onChange={() => setIsland({ on: !island.on })}
          />
        </div>
        <span className={styles.note}>
          {integracoes > 0
            ? t('{n} integrações com o sistema e com os aplicativos desta máquina.', {
                n: integracoes,
              })
            : t('Ela lê o sistema e comanda áudio, mídia, rede e área de trabalho.')}
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Em qual tela')}</span>
        <Tabs
          label={t('Tela da ilha')}
          options={opcoesTela}
          value={island.display}
          onChange={(proxima) => setIsland({ display: proxima })}
        />
        <span className={styles.note}>
          {telas.length > 1
            ? t('Esta máquina tem {n} telas. "Todas" põe uma ilha em cada uma.', {
                n: telas.length,
              })
            : t('Só uma tela conectada agora.')}
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Onde ela se assenta')}</span>
        <Tabs
          label={t('Posição em relação à barra')}
          options={ISLAND_PLACEMENTS.map((p) => ({ value: p, label: t(ASSENTO[p]) }))}
          value={island.placement}
          onChange={(proximo) => setIsland({ placement: proximo })}
        />
        <span className={styles.note}>{t(EXPLICA_ASSENTO[island.placement])}</span>
      </div>

      {/* A altura é POR AMBIENTE: na
          Floresta a pílula fica um pouco mais baixa, para não passar muito da
          barra do tema, que é menor. O slider escreve no ambiente ATIVO, como
          o vidro em Aparência; ausente vale a altura global da ilha. */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Altura da pílula')}</span>
        <Slider
          label={t('Altura fechada')}
          value={altura}
          min={ALTURA_PILULA_MIN}
          max={ALTURA_PILULA_MAX}
          step={1}
          format={(v) => `${Math.round(v)} px`}
          onChange={(valor) => setIslandHeight(ambiente, Math.round(valor))}
        />
        <span className={styles.note}>
          {t(
            'Vale só para a ilha FECHADA — aberta, a altura continua sendo a do conteúdo. A bolha, o arredondamento, a capa da faixa e a onda encolhem junto; o texto não muda de corpo, e por isso o mínimo é {min} px. {padrao} px é o desenho original.',
            { min: ALTURA_PILULA_MIN, padrao: ALTURA_PILULA_PADRAO },
          )}{' '}
          {escolhida
            ? t('Este é o valor que você escolheu para {nome}.', { nome: nomeDoAmbiente })
            : t(
                'Mexer no slider fixa a altura só em {nome}; os outros ambientes continuam com a deles.',
                { nome: nomeDoAmbiente },
              )}
        </span>
        <button
          type="button"
          className={`${styles.replay} ${styles.secondary}`}
          onClick={() => setIslandHeight(ambiente, undefined)}
          disabled={!escolhida}
          title={
            escolhida
              ? t('Devolve a altura que o ambiente {nome} traz', { nome: nomeDoAmbiente })
              : t('Já está na altura que o ambiente {nome} traz', { nome: nomeDoAmbiente })
          }
        >
          <ArrowCounterClockwise size={17} />
          {t('Restaurar padrão')}
        </button>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Como abre')}</span>
        <Tabs
          label={t('Gesto de abrir')}
          options={ISLAND_OPENINGS.map((o) => ({ value: o, label: t(ABERTURA[o]) }))}
          value={island.opening}
          onChange={(proximo) => setIsland({ opening: proximo })}
        />
        <span className={styles.note}>{t(EXPLICA_ABERTURA[island.opening])}</span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Movimento')}</span>
        <Tabs
          label={t('Animação da ilha')}
          options={ISLAND_MOTIONS.map((m) => ({ value: m, label: t(MOVIMENTOS[m]) }))}
          value={island.motion}
          onChange={(proximo) => setIsland({ motion: proximo as IslandMotion })}
        />
        <span className={styles.note}>{t(EXPLICA[island.motion])}</span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Voo')}</span>
        <Tabs
          label={t('Animação do voo')}
          options={ISLAND_FLIGHTS.map((v) => ({ value: v, label: t(VOOS[v]) }))}
          value={island.flight}
          onChange={(proximo) => setIsland({ flight: proximo as IslandFlightStyle })}
          wrap
        />
        <span className={styles.note}>
          {t(
            'Como a janela entra na pílula e sai dela — vale para a janela guardada na gaveta e para o próprio Halo recolhido com Meta+Espaço.',
          )}{' '}
          {t(EXPLICA_VOO[island.flight])}
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('O que ela escuta')}</span>
        <div className={styles.stack}>
          <Toggle
            label={t('HUD de volume')}
            checked={island.hud}
            onChange={() => setIsland({ hud: !island.hud })}
          />
          <Toggle
            label={t('Anunciar as notificações do sistema')}
            checked={island.notices}
            onChange={() => setIsland({ notices: !island.notices })}
          />
          <Toggle
            label={t('Histórico da área de transferência')}
            checked={island.clipboard}
            onChange={() => setIsland({ clipboard: !island.clipboard })}
          />
          <Toggle
            label={t('Letras sincronizadas (LRCLIB)')}
            checked={island.lyrics}
            onChange={() => setIsland({ lyrics: !island.lyrics })}
          />
          <Toggle
            label={t('Sumir quando a janela ativa está em tela cheia')}
            checked={island.fullscreenHide}
            onChange={() => setIsland({ fullscreenHide: !island.fullscreenHide })}
          />
          <Toggle
            label={t('Atalho Meta+Shift+H: guardar a janela ativa na ilha')}
            checked={island.shortcut}
            onChange={() => setIsland({ shortcut: !island.shortcut })}
          />
          <Toggle
            label={t('Atalho Meta+Espaço: recolher o Halo para a ilha, e trazer de volta')}
            checked={island.appShortcut}
            onChange={() => setIsland({ appShortcut: !island.appShortcut })}
          />
          <Toggle
            label={t('Efeito do KWin: a janela de verdade voa para a ilha')}
            checked={island.kwinEffect}
            onChange={() => setIsland({ kwinEffect: !island.kwinEffect })}
          />
          <Toggle
            label={t('Espectro de áudio: a onda da pílula segue a música')}
            checked={island.spectrum}
            onChange={() => setIsland({ spectrum: !island.spectrum })}
          />
          <Toggle
            label={t('API local: scripts e o shell publicam atividades na pílula')}
            checked={island.api}
            onChange={() => setIsland({ api: !island.api })}
          />
        </div>
        <span className={styles.note}>
          {t(
            'O HUD mostra a barra de volume na pílula quando ele muda, pelas teclas ou pela roda do mouse sobre a ilha. As notificações continuam aparecendo no KDE — a ilha só as escuta pelo D-Bus e guarda as últimas vinte. O histórico de cópias vem do Klipper, fica só na memória e morre com o app. As letras vêm do LRCLIB, um banco aberto — o app manda só título, artista e duração da faixa.',
          )}{' '}
          {t(
            'Os dois atalhos gravam uma linha nos atalhos globais do KDE (~/.config/kglobalshortcutsrc) e somem ao desligar — Meta+Espaço recolhe a janela do próprio Halo para a pílula, onde ela vira o botão aceso do início; apertar de novo, ou clicar nesse botão, a traz de volta ao mesmo canto e à mesma camada.',
          )}{' '}
          {t(
            'O efeito do KWin instala um pacote em ~/.local/share/kwin-wayland/effects/halo-gaveta e o carrega no compositor — é o que faz a janela guardada voar com o conteúdo dela (no Wayland ninguém captura a janela dos outros); desligar remove o pacote, e fica um cartão preto no lugar. São os dois únicos ajustes que saem da pasta do app.',
          )}{' '}
          {t(
            'O espectro ouve o monitor da saída de áudio (parec) só enquanto algo toca. A API local é um socket em $XDG_RUNTIME_DIR/halo-ilha.sock, que só o seu usuário alcança — ver tools/ilha-shell.sh e tools/ilha-avisar.sh no repositório.',
          )}
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Relógios de outros fusos')}</span>
        <Fusos valor={island.clocks} aoMudar={(clocks) => setIsland({ clocks })} />
        <span className={styles.note}>
          {t(
            'Nomes IANA separados por vírgula — Europe/Lisbon, Asia/Tokyo, America/New_York. Aparecem no panorama da home e no módulo de relógio. Um nome que a máquina não conhece é ignorado.',
          )}
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Discrição quando parada')}</span>
        <Slider
          label={t('Opacidade em repouso')}
          value={island.idleOpacity}
          onChange={(valor) => setIsland({ idleOpacity: valor })}
        />
        <span className={styles.note}>
          {t('Sem o mouse por perto ela desbota até {n}%. Em 100% fica sempre nítida.', {
            n: Math.round(island.idleOpacity),
          })}
        </span>
      </div>
    </>
  )
}
