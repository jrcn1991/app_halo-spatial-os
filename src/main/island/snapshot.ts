import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { localeDoIdioma, marcar, t } from '@shared/i18n'
import type { IslandModule, IslandSnapshot, Reading } from '@shared/island'
import { listAgents } from '../services/agents'
import { apps } from '../services/apps'
import { containers } from '../services/docker'
import { nowPlaying } from '../services/player'
import { projects } from '../services/projects'
import { currentSettings } from '../settings'
import { currentWeather } from '../weather'
import { midiaModos, totalAreasDeTrabalho } from './actions'
import { apiOuvindo, caminhoDoSocket, listaDeAtividades } from './api'
import { cafeinaAte, cafeinaNossa, inibicoes } from './cafeina'
import { resumoDeCapturas } from './capturas'
import { celular } from './celular'
import { claude } from './claude'
import { clipboardSource, clipboardWatching, clipsList } from './clipboard'
import { discos } from './discos'
import { espectroEstado } from './espectro'
import { foco } from './foco'
import { haloRecolhido } from './halo'
import { janelasGuardadas, listarJanelas, vigiaDePe } from './kwin'
import { letras } from './lyrics'
import { shelfList } from './shelf'
import { estaEmSilencio, silencioNosso } from './silencio'
import {
  areaDeTrabalho,
  audio,
  bluetooth,
  bluetoothBateria,
  disco,
  gpu,
  microfone,
  portas,
  processoTopo,
  rede,
  saidasAudio,
  servicos,
  sistema,
  temperaturas,
  vazao,
} from './sources'
import { teclado } from './teclado'
import { timerState } from './timer'
import { recentNotices, versaoDoSink, watcherState } from './watch'

/* ——— Memória por leitura ——————————————————————————————————————
 * O pulso da ilha bate a cada 2s e, sem isto, cada batida disparava ~20
 * processos externos (pactl×7, nmcli×2, bluetoothctl×2, ps, sensors, busctl,
 * qdbus6, ss, lsblk, docker, git…) — MEDIDO em 05/09/2026: o main a ~19% de
 * CPU com a máquina parada e a ilha recolhida.
 *
 * Cada leitura cara ganha um prazo de validade proporcional ao que ela mede:
 * temperatura e processo do topo mudam em segundos; portas, serviços e
 * Bluetooth em dezenas de segundos; o disco em minutos. Com a ilha RECOLHIDA
 * ninguém vê os módulos, e os prazos alongam dez vezes — o que a pílula mostra
 * (mídia, temporizador, avisos, relógio) não passa por aqui e continua a cada
 * batida.
 *
 * Duas coisas invalidam a memória na hora, para ela nunca mentir: uma ação do
 * usuário (ele mexeu no volume, ligou a cafeína — o próximo instantâneo tem
 * que mostrar) e a abertura da ilha (o painel abre com dado fresco). Ver
 * `esquecerMemoria`, chamada pelo main nos dois pontos. E o áudio leva a
 * versão do sink na chave: o `pactl subscribe` já sabe quando ele mudou.
 */
let pulsoLeve = false
/** A ilha está recolhida em todas as telas: prazos dez vezes mais longos. */
export function setPulsoLeve(sim: boolean): void {
  pulsoLeve = sim
}
const memorias = new Map<string, { at: number; versao: unknown; valor: Promise<unknown> }>()
function memo<T>(
  chave: string,
  ttlMs: number,
  ler: () => Promise<T>,
  versao: unknown = null,
): Promise<T> {
  const agora = Date.now()
  const prazo = ttlMs * (pulsoLeve ? 10 : 1)
  const tem = memorias.get(chave)
  if (tem && tem.versao === versao && agora - tem.at < prazo) return tem.valor as Promise<T>
  const valor = ler()
  // Erro não fica guardado: a próxima batida tenta de novo.
  valor.catch(() => memorias.delete(chave))
  memorias.set(chave, { at: agora, versao, valor })
  return valor
}
/** Uma ação do usuário ou a abertura da ilha: o próximo instantâneo lê tudo de novo. */
export function esquecerMemoria(): void {
  memorias.clear()
}

/**
 * O instantâneo que a ilha mostra.
 *
 * Ela reaproveita os serviços do app (MPRIS, clima, Docker, git, aplicativos)
 * em vez de duplicá-los — foi o que o usuário pediu ao dizer que ela pode usar
 * os mesmos mecanismos. O que ela NÃO faz é mudar qualquer um deles: só lê.
 *
 * Cada módulo é montado em separado e falha em separado: uma fonte fora do ar
 * marca aquele módulo como indisponível e os outros seguem. Uma ilha que some
 * inteira porque o `nvidia-smi` engasgou seria pior que uma com um card a menos.
 */

const ler = (
  id: string,
  label: string,
  value: string,
  detail = '',
  ratio: number | null = null,
  level: Reading['level'] = 'ok',
): Reading => ({ id, label, value, detail, ratio, level })

async function modulo(
  id: string,
  name: string,
  icon: string,
  buscar: () => Promise<Reading[]>,
  actions: IslandModule['actions'] = [],
): Promise<IslandModule> {
  try {
    return { id, name, icon, readings: await buscar(), actions, ok: true, error: null }
  } catch (erro) {
    return {
      id,
      name,
      icon,
      readings: [],
      actions,
      ok: false,
      error: (erro as Error).message.slice(0, 120),
    }
  }
}

/* ——— Módulos que reaproveitam os serviços do app ————————————— */

async function midia(): Promise<Reading[]> {
  const tocando = await nowPlaying()
  // As cinco leituras existem SEMPRE, mesmo sem player: o catálogo as
  // promete, e a homologação as cobra num sábado em que nada estiver tocando.
  // Player PARADO e sem faixa também é "nada": o Chromium publica um MPRIS
  // "Stopped" com metadados vazios enquanto uma aba qualquer existe (medido
  // em 01/09/2026), e a home mostrava um player com título "—" e três botões
  // mortos no lugar do panorama.
  const vazio = tocando && tocando.status === 'stopped' && !tocando.title
  if (!tocando || vazio) {
    return [
      ler(
        'midia-tocando',
        t('Tocando'),
        marcar('nada'),
        tocando
          ? t('{player} parado, sem faixa', { player: tocando.player })
          : t('nenhum player aberto'),
      ),
      ler('midia-estado', t('Estado'), marcar('parado')),
      ler('midia-progresso', t('Progresso'), '—', t('sem faixa')),
      ler(
        'midia-player',
        t('Player'),
        tocando ? t('{player} (parado)', { player: tocando.player }) : marcar('nenhum'),
      ),
      ler('midia-modos', t('Modos'), '—', t('sem player')),
    ]
  }

  const minutos = (s: number | null) =>
    s === null ? '—' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const razao =
    tocando.positionSec !== null && tocando.durationSec
      ? tocando.positionSec / tocando.durationSec
      : null

  const principal = ler('midia-tocando', t('Tocando'), tocando.title || '—', tocando.artist, razao)
  // A capa já chega pronta do serviço do player (file:// vira data: lá).
  if (tocando.artUrl) principal.art = tocando.artUrl

  const modos = await midiaModos().catch(() => null)
  return [
    principal,
    ler(
      'midia-estado',
      t('Estado'),
      tocando.status === 'playing' ? marcar('tocando') : marcar('pausado'),
    ),
    ler(
      'midia-progresso',
      t('Progresso'),
      minutos(tocando.positionSec),
      t('de {total}', { total: minutos(tocando.durationSec) }),
      razao,
    ),
    ler('midia-player', t('Player'), tocando.player),
    ler(
      'midia-modos',
      t('Embaralhar e repetir'),
      modos ? (modos.shuffle ? marcar('embaralhando') : marcar('em ordem')) : '—',
      modos
        ? modos.loop === 'Track'
          ? marcar('repete a faixa')
          : modos.loop === 'Playlist'
            ? marcar('repete a lista')
            : marcar('sem repetir')
        : '',
    ),
  ]
}

/**
 * A letra da faixa que toca, se o LRCLIB a tem e o usuário quer. Fora do
 * módulo de mídia de propósito: a busca é na rede, e cacheada por faixa.
 */
async function letraDaFaixa() {
  if (!currentSettings().island.lyrics) return null
  const tocando = await nowPlaying().catch(() => null)
  if (!tocando?.title) return null
  return letras(tocando.title, tocando.artist, tocando.durationSec)
}

/** A condição em português: o serviço fala a língua do Open-Meteo. */
const CEU: Record<string, string> = {
  clear: marcar('céu limpo'),
  clouds: marcar('nublado'),
  fog: marcar('neblina'),
  rain: marcar('chuva'),
  snow: marcar('neve'),
  storm: marcar('tempestade'),
}

async function tempo(): Promise<Reading[]> {
  const agora = new Date()
  // O formato de 12h é escolha do usuário, em Configurações → Widgets, e a
  // ilha obedecia a home e ignorava a escolha: relógio de 24h ao lado de um de
  // 12h, na mesma máquina. Aqui o sufixo AM/PM FICA — a home o corta porque o
  // handoff desenha um relógio grande onde a metade do dia é óbvia, e isto é
  // uma leitura de uma linha, onde "3:20" sozinho não diz qual das duas é.
  //
  // `widgets.clock.seconds` não é seguido de propósito: o instantâneo da ilha
  // é remontado a cada dois segundos (e a cada vinte com ela recolhida), então
  // um relógio com segundos mostraria um valor velho — mentira pequena, mas
  // mentira. Ver DESEMPENHO.md.
  const hour12 = currentSettings().widgets.clock.hour12
  const leituras = [
    ler(
      'relogio-hora',
      t('Hora'),
      agora.toLocaleTimeString(localeDoIdioma(), { hour: '2-digit', minute: '2-digit', hour12 }),
    ),
    ler(
      'relogio-data',
      t('Data'),
      agora.toLocaleDateString(localeDoIdioma(), {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      }),
    ),
  ]

  // Os relógios de outros fusos, escolhidos em Configurações. Sem nenhum, a
  // leitura diz isso — o catálogo a promete sempre.
  const fusos = currentSettings().island.clocks
  const mundo = fusos.map((zona) => ({
    zona,
    nome: zona.split('/').at(-1)?.replace(/_/g, ' ') ?? zona,
    hora: agora.toLocaleTimeString(localeDoIdioma(), {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: zona,
      hour12,
    }),
  }))
  leituras.push(
    ler(
      'relogio-mundo',
      t('Outros fusos'),
      mundo[0] ? `${mundo[0].nome} ${mundo[0].hora}` : marcar('nenhum'),
      // `nome hora;…`: o panorama desenha daqui.
      mundo.length > 0
        ? mundo.map((m) => `${m.nome} ${m.hora}`).join(';')
        : t('escolha fusos em Configurações → Ilha'),
    ),
  )

  const cronometro = timerState()
  leituras.push(
    ler(
      'timer-restante',
      cronometro?.end === null ? t('Cronômetro') : t('Temporizador'),
      cronometro
        ? cronometro.end === null
          ? mmss((Date.now() - cronometro.start) / 1000)
          : mmss((cronometro.end - Date.now()) / 1000)
        : '—',
      cronometro ? cronometro.label || `${cronometro.minutes} min` : t('nenhum em andamento'),
      cronometro?.end
        ? Math.max(0, cronometro.end - Date.now()) / (cronometro.minutes * 60_000)
        : null,
    ),
  )

  const cidade = currentSettings().widgets.weather.place
  // Sem cidade escolhida o clima some da ilha; quem pede a cidade é a Home.
  if (!cidade) return leituras
  try {
    const clima = await currentWeather(cidade)
    leituras.push(
      ler('clima-temp', t('Lá fora'), `${Math.round(clima.temperatureC)}°`, clima.place),
      ler('clima-condicao', t('Céu'), t(CEU[clima.condition] ?? clima.condition)),
    )
  } catch {
    // Sem internet o relógio continua valendo: o clima some, o resto fica.
    leituras.push(ler('clima-temp', t('Lá fora'), '—', t('clima indisponível'), null, 'alerta'))
  }
  return leituras
}

/** `12:34` de um tanto de segundos. */
function mmss(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** As notificações do sistema que o vigia viu desde que a ilha subiu. */
async function avisos(): Promise<Reading[]> {
  const lista = recentNotices()
  const vigia = watcherState().avisos
  const silencio = await estaEmSilencio().catch(() => false)
  return [
    ler(
      'silencio',
      t('Não perturbe'),
      silencio ? marcar('ligado') : marcar('desligado'),
      silencio
        ? silencioNosso()
          ? t('pela ilha')
          : t('pelo applet do KDE')
        : t('as notificações aparecem'),
      null,
      silencio ? 'alerta' : 'ok',
    ),
    ler(
      'avisos-recentes',
      t('Notificações'),
      String(lista.length),
      lista[0]
        ? `${lista[0].app}: ${lista[0].title}`.slice(0, 40)
        : t('nenhuma desde que a ilha subiu'),
    ),
    ler(
      'avisos-vigia',
      t('Vigia do D-Bus'),
      vigia ? marcar('ouvindo') : marcar('parado'),
      vigia
        ? t('dbus-monitor em org.freedesktop.Notifications')
        : t('ligue em Configurações → Ilha'),
      null,
      vigia ? 'ok' : 'alerta',
    ),
  ]
}

async function halo(): Promise<Reading[]> {
  const agentes = listAgents()
  const trabalhando = agentes.filter((a) => a.state === 'pensando' || a.state === 'ferramenta')

  const [lista, repos] = await Promise.all([
    containers().catch(() => []),
    projects().catch(() => []),
  ])
  const ativos = lista.filter((c) => c.state === 'running').length
  const sujos = repos.filter((p) => p.dirtyFiles > 0)

  return [
    ler(
      'halo-agentes',
      t('Agentes'),
      String(agentes.length),
      // "trabalhando" fica em português: a ilha procura a palavra no detalhe.
      trabalhando.length > 0 ? `${trabalhando.length} trabalhando` : t('nenhum ocupado'),
      null,
      trabalhando.length > 0 ? 'alerta' : 'ok',
    ),
    ler(
      'halo-containers',
      t('Containers'),
      String(ativos),
      t('de {total}', { total: lista.length }),
    ),
    ler(
      'halo-projetos',
      t('Projetos alterados'),
      String(sujos.length),
      sujos[0]?.name ?? t('tudo commitado'),
    ),
    // O app dentro da própria ilha. É leitura, e não só um sinal para a
    // pílula, porque é estado do sistema como qualquer outro: quem abre a
    // aba Módulos vê onde a janela está.
    ler(
      'halo-na-ilha',
      t('Janela do Halo'),
      haloRecolhido() ? marcar('na ilha') : marcar('à vista'),
      haloRecolhido() ? t('Meta+Space traz de volta') : t('Meta+Space recolhe'),
    ),
  ]
}

/**
 * Um download em andamento: o navegador escreve num arquivo temporário
 * (`.part` no Firefox, `.crdownload` no Chrome, `.partial` em outros) e
 * renomeia ao terminar. Contar esses arquivos é o que o DynamicNotch faz
 * no macOS — mas o arquivo existir não basta. O Chrome deixa para trás um
 * `Não confirmado NNNNNN.crdownload` a cada download cancelado ou
 * interrompido, e a pílula chegou a mostrar um deles como "baixando" por
 * quase um dia (MEDIDO: parciais sem uma escrita em 20 horas). O que diz se está baixando é a
 * ESCRITA: um parcial que não muda há mais de um minuto está pausado ou
 * abandonado, e a pílula não o mostra. Ele continua na lista, marcado
 * `parado`, para o anúncio de "concluído" saber que não terminou — sumiu.
 */
const PARCIAL = /\.(part|crdownload|partial|download)$/i
/** Sem uma escrita neste tempo, o parcial não está sendo baixado. */
const DOWNLOAD_PARADO_MS = 60_000

export type Baixando = { nome: string; bytes: number; parado: boolean }

/** Os parciais de ~/Downloads: os que estão sendo escritos e os parados. */
export async function baixandoAgora(): Promise<Baixando[]> {
  const pasta = join(homedir(), 'Downloads')
  const nomes = (await readdir(pasta).catch(() => [])).filter((n) => PARCIAL.test(n))
  const agora = Date.now()
  const lista = await Promise.all(
    nomes.slice(0, 10).map(async (nome) => {
      const info = await stat(join(pasta, nome)).catch(() => null)
      return info
        ? {
            nome: nome.replace(PARCIAL, ''),
            bytes: info.size,
            parado: agora - info.mtimeMs > DOWNLOAD_PARADO_MS,
          }
        : null
    }),
  )
  // Os vivos primeiro: a pílula e a leitura mostram o primeiro da lista.
  return lista
    .filter((x): x is Baixando => x !== null)
    .sort((a, b) => Number(a.parado) - Number(b.parado))
}

const legivel = (bytes: number) =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : bytes >= 1e6
      ? `${(bytes / 1e6).toFixed(1)} MB`
      : `${Math.round(bytes / 1e3)} kB`

/** Os últimos arquivos que caíram em ~/Downloads, e o que ainda está caindo. */
async function baixados(): Promise<Reading[]> {
  const pasta = join(homedir(), 'Downloads')
  const nomes = await readdir(pasta)
  const comData = await Promise.all(
    nomes.slice(0, 60).map(async (nome) => {
      const info = await stat(join(pasta, nome)).catch(() => null)
      return info ? { nome, at: info.mtimeMs } : null
    }),
  )
  const recentes = comData
    .filter((x): x is { nome: string; at: number } => x !== null)
    .sort((a, b) => b.at - a.at)
    .slice(0, 3)
  const parciais = await baixandoAgora()
  const andamento = parciais.filter((d) => !d.parado)
  const parados = parciais.length - andamento.length

  const capturas = await resumoDeCapturas().catch(() => ({ total: 0, ultima: null }))

  return [
    ler(
      'downloads-recentes',
      t('Baixados'),
      String(nomes.length),
      recentes[0]?.nome.slice(0, 28) ?? t('pasta vazia'),
    ),
    ler(
      'capturas-recentes',
      t('Capturas de tela'),
      String(capturas.total),
      capturas.ultima?.name.slice(0, 28) ?? t('nenhuma na pasta do Spectacle'),
    ),
    ler(
      'downloads-andamento',
      t('Baixando agora'),
      String(andamento.length),
      andamento[0]
        ? `${andamento[0].nome.slice(0, 22)} · ${legivel(andamento[0].bytes)}`
        : parados > 0
          ? t(parados > 1 ? 'nada em andamento · {n} parados' : 'nada em andamento · {n} parado', {
              n: parados,
            })
          : t('nada em andamento'),
      null,
      andamento.length > 0 ? 'alerta' : 'ok',
    ),
  ]
}

async function aplicativos(): Promise<Reading[]> {
  const lista = await apps()
  return [ler('apps-buscar', t('Aplicativos'), String(lista.length), t('instalados nesta máquina'))]
}

async function desktop(): Promise<Reading[]> {
  const [atual, total, segurando] = await Promise.all([
    areaDeTrabalho(),
    totalAreasDeTrabalho(),
    inibicoes().catch(() => []),
  ])
  const nossa = cafeinaNossa()
  return [
    ...atual,
    ler('kde-desktop-total', t('Áreas de trabalho'), String(total)),
    ler(
      'cafeina',
      t('Tela acordada'),
      nossa
        ? marcar('pela ilha')
        : segurando.length > 0
          ? t('por {n}', { n: segurando.length })
          : 'não',
      nossa && cafeinaAte()
        ? t('até {hora}', {
            hora: new Date(cafeinaAte() ?? 0).toLocaleTimeString(localeDoIdioma(), {
              hour: '2-digit',
              minute: '2-digit',
            }),
          })
        : segurando[0]
          ? `${segurando[0].quem}: ${segurando[0].motivo}`.slice(0, 40)
          : t('ninguém segurando'),
      null,
      nossa || segurando.length > 0 ? 'alerta' : 'ok',
    ),
  ]
}

/** O histórico da área de transferência: quantos e o último. */
async function transferencia(): Promise<Reading[]> {
  const lista = clipsList()
  const vigiando = clipboardWatching()
  return [
    ler(
      'clip-recentes',
      t('Copiados'),
      String(lista.length),
      lista[0]?.preview.slice(0, 40) ??
        (vigiando
          ? t('nada copiado ainda · via {fonte}', { fonte: clipboardSource() })
          : t('histórico desligado')),
      null,
      vigiando ? 'ok' : 'alerta',
    ),
  ]
}

/** A gaveta de arquivos: quantos itens e o último guardado. */
async function gaveta(): Promise<Reading[]> {
  const itens = shelfList()
  const perdidos = itens.filter((i) => !i.exists).length
  return [
    ler(
      'gaveta-arquivos',
      t('Na gaveta'),
      String(itens.length),
      perdidos > 0
        ? t('{n} sumiram do disco', { n: perdidos })
        : (itens[0]?.name ?? t('solte arquivos na pílula')),
      null,
      perdidos > 0 ? 'alerta' : 'ok',
    ),
  ]
}

/** Janelas do computador, pelo scripting do KWin (com cache — ver `kwin.ts`). */
async function janelas(): Promise<Reading[]> {
  const [abertas, guardadas] = [await listarJanelas(), janelasGuardadas()]
  const ativa = abertas.find((j) => j.active)
  return [
    ler('janelas-abertas', t('Janelas abertas'), String(abertas.length), ativa?.title ?? ''),
    ler(
      'janelas-guardadas',
      t('Guardadas na gaveta'),
      String(guardadas.length),
      guardadas[0]?.title ?? t('nenhuma guardada'),
    ),
    ler(
      'janelas-vigia',
      t('Vigia do KWin'),
      vigiaDePe() ? marcar('de pé') : marcar('parado'),
      vigiaDePe() ? t('ouve tela cheia e o atalho') : t('a ilha não ouve o compositor'),
      null,
      vigiaDePe() ? 'ok' : 'alerta',
    ),
  ]
}

/** A API local: o socket e o que foi publicado nele. */
async function api(): Promise<Reading[]> {
  const lista = listaDeAtividades()
  const vivas = lista.filter((a) => a.state === 'andamento')
  const ouvindo = apiOuvindo()
  return [
    ler(
      'api-socket',
      t('Socket'),
      ouvindo ? marcar('ouvindo') : marcar('parado'),
      // O caminho: é o que um script precisa saber, e a homologação também.
      ouvindo ? caminhoDoSocket() : t('ligue a API local em Configurações → Ilha'),
      null,
      ouvindo ? 'ok' : 'alerta',
    ),
    ler(
      'api-atividades',
      t('Atividades'),
      String(lista.length),
      vivas[0]
        ? t('{titulo} · em andamento', { titulo: vivas[0].title }).slice(0, 48)
        : lista[0]
          ? `${lista[0].title} · ${lista[0].state}`.slice(0, 48)
          : t('nada publicado — ver tools/ilha-shell.sh'),
      null,
      vivas.length > 0 ? 'alerta' : 'ok',
    ),
  ]
}

/* ——— O instantâneo inteiro ————————————————————————————— */

export async function islandSnapshot(): Promise<IslandSnapshot> {
  const modules = await Promise.all([
    modulo('tempo', t('Relógio e clima'), 'Clock', tempo, [
      { id: 'timer-iniciar', label: t('Temporizador de 25 min'), icon: 'Timer' },
      { id: 'timer-cronometro', label: t('Cronômetro'), icon: 'Hourglass' },
      { id: 'timer-parar', label: t('Parar'), icon: 'X' },
    ]),
    modulo('midia', t('Tocando agora'), 'MusicNotes', midia, [
      { id: 'midia-anterior', label: t('Anterior'), icon: 'SkipBack' },
      { id: 'midia-alternar', label: t('Tocar ou pausar'), icon: 'Play' },
      { id: 'midia-proxima', label: t('Próxima'), icon: 'SkipForward' },
      { id: 'midia-abrir', label: t('Abrir o player'), icon: 'ArrowSquareOut' },
      { id: 'midia-embaralhar', label: t('Embaralhar'), icon: 'Shuffle' },
      { id: 'midia-repetir', label: t('Repetir'), icon: 'Repeat' },
      { id: 'midia-copiar-link', label: t('Copiar o link'), icon: 'Link' },
    ]),
    modulo('sistema', t('Sistema'), 'Cpu', async () => [
      // CPU, memória e carga vêm do /proc: baratos, e vivos a cada batida.
      ...(await sistema()),
      ...(await memo('topo', 5000, processoTopo).catch(() => [])),
      ...(await memo('temperaturas', 5000, temperaturas).catch(() => [])),
      ...(await memo('disco', 20_000, disco).catch(() => [])),
      ...(await memo('servicos', 10_000, servicos).catch(() => [])),
      ...(await memo('portas', 10_000, portas).catch(() => [])),
    ]),
    modulo('gpu', t('Placa de vídeo'), 'GraphicsCard', () => memo('gpu', 3000, gpu)),
    modulo(
      'audio',
      t('Áudio'),
      'SpeakerHigh',
      async () => {
        // A versão do sink na chave: mudou o volume, a leitura é refeita já.
        const leituras = await memo('audio', 10_000, audio, versaoDoSink())
        const saidas = await memo('saidas-audio', 10_000, saidasAudio).catch(() => [])
        const vigia = watcherState().volume
        const espectro = espectroEstado()
        return [
          ...leituras,
          ...(await memo('microfone', 5000, microfone).catch(() => [])),
          ler(
            'audio-espectro',
            t('Espectro'),
            espectro.ouvindo
              ? marcar('ouvindo')
              : espectro.ligado
                ? marcar('parado')
                : marcar('desligado'),
            espectro.ouvindo
              ? t('parec no monitor da saída')
              : espectro.ligado
                ? t('sobe quando algo tocar')
                : t('ligue em Configurações → Ilha'),
            null,
            espectro.ligado ? 'ok' : 'alerta',
          ),
          ler(
            'saidas-audio',
            t('Saídas'),
            String(saidas.length),
            // `nome|descrição;…`: o seletor do player lê daqui, sem canal novo.
            saidas.map((s) => `${s.nome}|${s.descricao}`).join(';'),
          ),
          ler(
            'audio-vigia',
            t('HUD de volume'),
            vigia ? marcar('ouvindo') : marcar('parado'),
            vigia ? 'pactl subscribe' : t('ligue em Configurações → Ilha'),
            null,
            vigia ? 'ok' : 'alerta',
          ),
        ]
      },
      [
        { id: 'volume-baixar', label: t('Menos volume'), icon: 'SpeakerLow' },
        { id: 'volume-mudo', label: t('Mudo'), icon: 'SpeakerSlash' },
        { id: 'volume-subir', label: t('Mais volume'), icon: 'SpeakerHigh' },
        { id: 'mic-mudo-alternar', label: t('Silenciar o microfone'), icon: 'MicrophoneSlash' },
        { id: 'audio-trocar-saida', label: t('Trocar a saída'), icon: 'ArrowsLeftRight' },
      ],
    ),
    modulo(
      'rede',
      t('Rede'),
      'WifiHigh',
      // A vazão é diferença de /proc/net/dev e fica viva; o `nmcli` tem prazo.
      async () => [...(await memo('rede', 10_000, rede)), ...(await vazao().catch(() => []))],
      [{ id: 'wifi-alternar', label: t('Ligar ou desligar o Wi-Fi'), icon: 'WifiSlash' }],
    ),
    modulo(
      'bluetooth',
      'Bluetooth',
      'Bluetooth',
      async () => [
        ...(await memo('bluetooth', 15_000, bluetooth)),
        // O BlueZ pode não responder (sem adaptador, sem bus de sistema): a
        // leitura fica e diz o motivo, em vez de sumir da grade.
        ...(await memo('bluetooth-bateria', 30_000, bluetoothBateria).catch((erro: Error) => [
          ler(
            'bluetooth-bateria',
            t('Bateria Bluetooth'),
            '—',
            t('sem leitura: {motivo}', { motivo: erro.message.slice(0, 60) }),
            null,
            'alerta',
          ),
        ])),
      ],
      [{ id: 'bluetooth-alternar', label: t('Ligar ou desligar'), icon: 'Power' }],
    ),
    modulo('desktop', t('Área de trabalho'), 'SquaresFour', () => memo('desktop', 3000, desktop), [
      { id: 'cafeina-alternar', label: t('Cafeína: manter acordada'), icon: 'Coffee' },
      { id: 'kde-desktop-anterior', label: t('Área anterior'), icon: 'CaretLeft' },
      { id: 'kde-desktop-proxima', label: t('Próxima área'), icon: 'CaretRight' },
      { id: 'kde-mostrar-desktop', label: t('Mostrar a área de trabalho'), icon: 'Desktop' },
      { id: 'kde-captura', label: t('Capturar a tela'), icon: 'Camera' },
      { id: 'cor-capturar', label: t('Conta-gotas: cor de um ponto'), icon: 'Eyedropper' },
      { id: 'kde-bloquear', label: t('Bloquear'), icon: 'Lock' },
    ]),
    modulo('halo', 'Halo', 'Sparkle', () => memo('halo', 30_000, halo), [
      { id: 'halo-tela', label: t('Trazer à vista'), icon: 'ArrowSquareOut' },
      // O par do Meta+Space, aqui como ação do módulo: `active` acende a que
      // vale agora, do mesmo jeito que as ações que alternam.
      { id: 'halo-recolher', label: t('Recolher para a ilha'), icon: 'Halo' },
      { id: 'halo-trazer', label: t('Trazer de volta'), icon: 'Halo', active: haloRecolhido() },
    ]),
    modulo(
      'apps',
      t('Aplicativos'),
      'SquaresFour',
      async () => [
        ...(await memo('aplicativos', 15_000, aplicativos)),
        ...(await memo('baixados', 15_000, baixados).catch(() => [])),
      ],
      [
        { id: 'abrir-caminho', label: t('Abrir a pasta pessoal'), icon: 'FolderOpen' },
        { id: 'texto-da-tela', label: t('Ler o texto de um pedaço da tela'), icon: 'TextAa' },
      ],
    ),
    modulo('avisos', t('Notificações'), 'BellRinging', avisos, [
      { id: 'silencio-alternar', label: t('Não perturbe'), icon: 'BellSlash' },
      { id: 'avisos-limpar', label: t('Limpar a lista'), icon: 'Broom' },
    ]),
    modulo('clips', t('Área de transferência'), 'Clipboard', transferencia, [
      { id: 'clip-limpar', label: t('Limpar o histórico'), icon: 'Broom' },
    ]),
    modulo('gaveta', t('Gaveta'), 'Tray', gaveta, [
      { id: 'gaveta-limpar', label: t('Esvaziar a gaveta'), icon: 'Broom' },
    ]),
    modulo('janelas', t('Janelas'), 'AppWindow', janelas, [
      { id: 'janela-guardar', label: t('Guardar a janela ativa'), icon: 'DownloadSimple' },
    ]),
    modulo('celular', t('Celular'), 'DeviceMobile', () => memo('celular', 10_000, celular), [
      { id: 'celular-tocar', label: t('Fazer tocar'), icon: 'Vibrate' },
      { id: 'celular-ping', label: 'Ping', icon: 'Broadcast' },
    ]),
    modulo('discos', t('Removíveis'), 'Usb', () => memo('discos', 15_000, discos)),
    modulo('teclado', t('Teclado'), 'Keyboard', teclado),
    modulo('foco', t('Foco'), 'Target', foco, [
      { id: 'timer-iniciar', label: t('Sessão de 25 min'), icon: 'Timer' },
      { id: 'foco-limpar', label: t('Apagar o histórico'), icon: 'Broom' },
    ]),
    modulo('api', t('API local'), 'PlugsConnected', api),
    modulo('claude', 'Claude', 'Sparkle', claude, [
      { id: 'claude-parar', label: t('Encerrar a conversa'), icon: 'X' },
    ]),
  ])

  return {
    at: Date.now(),
    modules,
    timer: timerState(),
    notices: recentNotices(),
    downloads: await baixandoAgora().catch(() => []),
    clips: clipsList(),
    note: currentSettings().island.note,
    lyrics: await letraDaFaixa().catch(() => null),
    activities: listaDeAtividades(),
    halo: { recolhido: haloRecolhido() },
  }
}
