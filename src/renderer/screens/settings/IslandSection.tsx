import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/icons/ArrowCounterClockwise'
import { environmentById, environmentLabel } from '@shared/environments'
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
import { useEffect, useState } from 'react'
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
  gota: 'Gota',
  elastico: 'Elástico',
  desliza: 'Desliza',
  expandir: 'Expandir',
  nenhuma: 'Nenhuma',
}

const EXPLICA: Record<IslandMotion, string> = {
  gota: 'Escorre do topo e assenta, com o peso de um líquido. É o padrão.',
  elastico: 'Passa um pouco do ponto e volta — mais brincalhão.',
  desliza: 'Entrada reta e curta, sem elasticidade. A mais discreta.',
  expandir: 'Cresce a partir do topo, sem escorrer.',
  nenhuma: 'Sem animação nenhuma. Útil em máquina apertada.',
}

/**
 * O voo: como a janela entra na pílula e sai dela. Vale para a janela guardada
 * na gaveta e para o próprio Halo recolhido pelo Meta+Espaço — é o mesmo
 * fantasma, e duas peças iguais não deviam se mover de jeitos diferentes.
 */
const VOOS: Record<IslandFlightStyle, string> = {
  real: 'Janela de verdade',
  'real-foguete': 'Verdade · Foguete',
  'real-desmanchar': 'Verdade · Desmanchar',
  sugado: 'Sugado',
  genie: 'Gênio',
  foguete: 'Foguete',
  dobra: 'Dobra',
  giro: 'Giro',
  desmanchar: 'Desmanchar',
  nenhuma: 'Nenhuma',
}

const EXPLICA_VOO: Record<IslandFlightStyle, string> = {
  real: 'Quem voa é a própria janela, com o conteúdo dela — quem anima é o compositor. Precisa do efeito do KWin, logo abaixo. Como ela voa na camada em que vive, uma janela aberta por cima esconde o voo; as outras variações desenham um cartão acima de tudo. É o padrão.',
  'real-foguete':
    'A janela de verdade, e ela PASSA da pílula e cai dentro dela — a subida vai mais alto que a boca antes de assentar.',
  'real-desmanchar':
    'A janela de verdade, cedendo opacidade desde o primeiro quadro: ela chega à pílula quase apagada.',
  sugado: 'Levanta da mesa, estreita e é sugado para dentro da pílula. É o padrão.',
  genie: 'A largura colapsa primeiro e a janela sobe por um gargalo, como o gênio da lâmpada.',
  foguete: 'Agacha, salta acima da pílula e cai dentro dela.',
  dobra: 'Tomba para trás como uma folha e voa deitada.',
  giro: 'Encolhe girando, como papel sugado por um ralo.',
  desmanchar: 'Perde corpo pelo caminho e chega quase apagada.',
  nenhuma: 'Sem cartão nenhum: a janela some e volta na hora. O anúncio continua.',
}

const ASSENTO: Record<IslandPlacement, string> = {
  sobre: 'Sobre a barra',
  abaixo: 'Abaixo da barra',
}

const EXPLICA_ASSENTO: Record<IslandPlacement, string> = {
  sobre:
    'Por cima do painel do sistema, como o notch fica na barra de menus. Não gasta nenhum pixel de área útil.',
  abaixo:
    'Logo abaixo do painel. Nunca cobre o que ele mostra no centro, mas rouba uma faixa das janelas maximizadas.',
}

const ABERTURA: Record<IslandOpening, string> = {
  hover: 'Ao passar o mouse',
  click: 'Só ao clicar',
}

const EXPLICA_ABERTURA: Record<IslandOpening, string> = {
  hover:
    'Parar o mouse sobre a pílula por um instante abre a ilha. Cruzar o topo da tela não abre.',
  click: 'Passar por cima não faz nada; um clique na pílula abre, e o mouse saindo fecha.',
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
        aria-label="Fusos horários"
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
        <span className={styles.note}>Não reconheço: {invalidos.join(', ')}</span>
      ) : null}
    </div>
  )
}

export function IslandSection() {
  const island = useHalo((s) => s.island)
  const setIsland = useHalo((s) => s.setIsland)
  // A altura da pílula é do AMBIENTE ATIVO, não global: cada ambiente pede
  // uma pílula diferente sobre a barra (pedido do usuário, 20/09/2026).
  const ambiente = useHalo((s) => s.environment.id)
  const ajuste = useHalo((s) => s.environment.ajustes)[ambiente]
  const setIslandHeight = useHalo((s) => s.setIslandHeight)
  const escolhida = ajuste?.islandHeight !== undefined
  const altura = ajuste?.islandHeight ?? island.pillHeight
  const doAmbiente = environmentById(ambiente)
  const nomeDoAmbiente = doAmbiente ? environmentLabel(doAmbiente) : ambiente
  const [telas, setTelas] = useState<{ id: string; label: string; primary: boolean }[]>([])
  const [integracoes, setIntegracoes] = useState(0)

  useEffect(() => {
    void window.halo?.island.displays().then(setTelas)
    void window.halo?.island.catalog().then((c) => setIntegracoes(c.length))
  }, [])

  const opcoesTela = [
    { value: 'primary', label: 'Tela principal' },
    ...telas.map((tela) => ({ value: tela.id, label: tela.label })),
    { value: 'all', label: 'Todas' },
  ]

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Ilha dinâmica</span>
        <span className={styles.title}>A gota no topo da tela</span>
        <span className={styles.subtitle}>
          Uma faixa que fica acima de tudo, mostra o que importa e deixa agir sem abrir o app. Passe
          o mouse nela para abrir.
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Ativar</span>
        <div className={styles.stack}>
          <Toggle
            label="Mostrar a ilha dinâmica"
            checked={island.on}
            onChange={() => setIsland({ on: !island.on })}
          />
        </div>
        <span className={styles.note}>
          {integracoes > 0
            ? `${integracoes} integrações com o sistema e com os aplicativos desta máquina.`
            : 'Ela lê o sistema e comanda áudio, mídia, rede e área de trabalho.'}
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Em qual tela</span>
        <Tabs
          label="Tela da ilha"
          options={opcoesTela}
          value={island.display}
          onChange={(proxima) => setIsland({ display: proxima })}
        />
        <span className={styles.note}>
          {telas.length > 1
            ? `Esta máquina tem ${telas.length} telas. "Todas" põe uma ilha em cada uma.`
            : 'Só uma tela conectada agora.'}
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Onde ela se assenta</span>
        <Tabs
          label="Posição em relação à barra"
          options={ISLAND_PLACEMENTS.map((p) => ({ value: p, label: ASSENTO[p] }))}
          value={island.placement}
          onChange={(proximo) => setIsland({ placement: proximo })}
        />
        <span className={styles.note}>{EXPLICA_ASSENTO[island.placement]}</span>
      </div>

      {/* A altura é POR AMBIENTE desde 20/09/2026, pedido do usuário: na
          Floresta a pílula fica um pouco mais baixa, para não passar muito da
          barra do tema, que é menor. O slider escreve no ambiente ATIVO, como
          o vidro em Aparência; ausente vale a altura global da ilha. */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Altura da pílula</span>
        <Slider
          label="Altura fechada"
          value={altura}
          min={ALTURA_PILULA_MIN}
          max={ALTURA_PILULA_MAX}
          step={1}
          format={(v) => `${Math.round(v)} px`}
          onChange={(valor) => setIslandHeight(ambiente, Math.round(valor))}
        />
        <span className={styles.note}>
          Vale só para a ilha FECHADA — aberta, a altura continua sendo a do conteúdo. A bolha, o
          arredondamento, a capa da faixa e a onda encolhem junto; o texto não muda de corpo, e por
          isso o mínimo é {ALTURA_PILULA_MIN} px. {ALTURA_PILULA_PADRAO} px é o desenho original.{' '}
          {escolhida
            ? `Este é o valor que você escolheu para ${nomeDoAmbiente}.`
            : `Mexer no slider fixa a altura só em ${nomeDoAmbiente}; os outros ambientes continuam com a deles.`}
        </span>
        <button
          type="button"
          className={`${styles.replay} ${styles.secondary}`}
          onClick={() => setIslandHeight(ambiente, undefined)}
          disabled={!escolhida}
          title={
            escolhida
              ? `Devolve a altura que o ambiente ${nomeDoAmbiente} traz`
              : `Já está na altura que o ambiente ${nomeDoAmbiente} traz`
          }
        >
          <ArrowCounterClockwise size={17} />
          Restaurar padrão
        </button>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Como abre</span>
        <Tabs
          label="Gesto de abrir"
          options={ISLAND_OPENINGS.map((o) => ({ value: o, label: ABERTURA[o] }))}
          value={island.opening}
          onChange={(proximo) => setIsland({ opening: proximo })}
        />
        <span className={styles.note}>{EXPLICA_ABERTURA[island.opening]}</span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Movimento</span>
        <Tabs
          label="Animação da ilha"
          options={ISLAND_MOTIONS.map((m) => ({ value: m, label: MOVIMENTOS[m] }))}
          value={island.motion}
          onChange={(proximo) => setIsland({ motion: proximo as IslandMotion })}
        />
        <span className={styles.note}>{EXPLICA[island.motion]}</span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Voo</span>
        <Tabs
          label="Animação do voo"
          options={ISLAND_FLIGHTS.map((v) => ({ value: v, label: VOOS[v] }))}
          value={island.flight}
          onChange={(proximo) => setIsland({ flight: proximo as IslandFlightStyle })}
          wrap
        />
        <span className={styles.note}>
          Como a janela entra na pílula e sai dela — vale para a janela guardada na gaveta e para o
          próprio Halo recolhido com Meta+Espaço. {EXPLICA_VOO[island.flight]}
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>O que ela escuta</span>
        <div className={styles.stack}>
          <Toggle
            label="HUD de volume"
            checked={island.hud}
            onChange={() => setIsland({ hud: !island.hud })}
          />
          <Toggle
            label="Anunciar as notificações do sistema"
            checked={island.notices}
            onChange={() => setIsland({ notices: !island.notices })}
          />
          <Toggle
            label="Histórico da área de transferência"
            checked={island.clipboard}
            onChange={() => setIsland({ clipboard: !island.clipboard })}
          />
          <Toggle
            label="Letras sincronizadas (LRCLIB)"
            checked={island.lyrics}
            onChange={() => setIsland({ lyrics: !island.lyrics })}
          />
          <Toggle
            label="Sumir quando a janela ativa está em tela cheia"
            checked={island.fullscreenHide}
            onChange={() => setIsland({ fullscreenHide: !island.fullscreenHide })}
          />
          <Toggle
            label="Atalho Meta+Shift+H: guardar a janela ativa na ilha"
            checked={island.shortcut}
            onChange={() => setIsland({ shortcut: !island.shortcut })}
          />
          <Toggle
            label="Atalho Meta+Espaço: recolher o Halo para a ilha, e trazer de volta"
            checked={island.appShortcut}
            onChange={() => setIsland({ appShortcut: !island.appShortcut })}
          />
          <Toggle
            label="Efeito do KWin: a janela de verdade voa para a ilha"
            checked={island.kwinEffect}
            onChange={() => setIsland({ kwinEffect: !island.kwinEffect })}
          />
          <Toggle
            label="Espectro de áudio: a onda da pílula segue a música"
            checked={island.spectrum}
            onChange={() => setIsland({ spectrum: !island.spectrum })}
          />
          <Toggle
            label="API local: scripts e o shell publicam atividades na pílula"
            checked={island.api}
            onChange={() => setIsland({ api: !island.api })}
          />
        </div>
        <span className={styles.note}>
          O HUD mostra a barra de volume na pílula quando ele muda, pelas teclas ou pela roda do
          mouse sobre a ilha. As notificações continuam aparecendo no KDE — a ilha só as escuta pelo
          D-Bus e guarda as últimas vinte. O histórico de cópias vem do Klipper, fica só na memória
          e morre com o app. As letras vêm do LRCLIB, um banco aberto — o app manda só título,
          artista e duração da faixa. Os dois atalhos gravam uma linha nos atalhos globais do KDE
          (~/.config/kglobalshortcutsrc) e somem ao desligar — Meta+Espaço recolhe a janela do
          próprio Halo para a pílula, onde ela vira o botão aceso do início; apertar de novo, ou
          clicar nesse botão, a traz de volta ao mesmo canto e à mesma camada. O efeito do KWin
          instala um pacote em ~/.local/share/kwin-wayland/effects/halo-gaveta e o carrega no
          compositor — é o que faz a janela guardada voar com o conteúdo dela (no Wayland ninguém
          captura a janela dos outros); desligar remove o pacote, e fica um cartão preto no lugar.
          São os dois únicos ajustes que saem da pasta do app. O espectro ouve o monitor da saída de
          áudio (parec) só enquanto algo toca. A API local é um socket em
          $XDG_RUNTIME_DIR/halo-ilha.sock, que só o seu usuário alcança — ver tools/ilha-shell.sh e
          tools/ilha-avisar.sh no repositório.
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Relógios de outros fusos</span>
        <Fusos valor={island.clocks} aoMudar={(clocks) => setIsland({ clocks })} />
        <span className={styles.note}>
          Nomes IANA separados por vírgula — Europe/Lisbon, Asia/Tokyo, America/New_York. Aparecem
          no panorama da home e no módulo de relógio. Um nome que a máquina não conhece é ignorado.
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Discrição quando parada</span>
        <Slider
          label="Opacidade em repouso"
          value={island.idleOpacity}
          onChange={(valor) => setIsland({ idleOpacity: valor })}
        />
        <span className={styles.note}>
          Sem o mouse por perto ela desbota até {Math.round(island.idleOpacity)}%. Em 100% fica
          sempre nítida.
        </span>
      </div>
    </>
  )
}
