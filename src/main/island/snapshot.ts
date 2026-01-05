import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
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
        'Tocando',
        'nada',
        tocando ? `${tocando.player} parado, sem faixa` : 'nenhum player aberto',
      ),
      ler('midia-estado', 'Estado', 'parado'),
      ler('midia-progresso', 'Progresso', '—', 'sem faixa'),
      ler('midia-player', 'Player', tocando ? `${tocando.player} (parado)` : 'nenhum'),
      ler('midia-modos', 'Modos', '—', 'sem player'),
    ]
  }

  const minutos = (s: number | null) =>
    s === null ? '—' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const razao =
    tocando.positionSec !== null && tocando.durationSec
      ? tocando.positionSec / tocando.durationSec
      : null

  const principal = ler('midia-tocando', 'Tocando', tocando.title || '—', tocando.artist, razao)
  // A capa já chega pronta do serviço do player (file:// vira data: lá).
  if (tocando.artUrl) principal.art = tocando.artUrl

  const modos = await midiaModos().catch(() => null)
  return [
    principal,
    ler('midia-estado', 'Estado', tocando.status === 'playing' ? 'tocando' : 'pausado'),
    ler(
      'midia-progresso',
      'Progresso',
      minutos(tocando.positionSec),
      `de ${minutos(tocando.durationSec)}`,
      razao,
    ),
    ler('midia-player', 'Player', tocando.player),
    ler(
      'midia-modos',
      'Embaralhar e repetir',
      modos ? (modos.shuffle ? 'embaralhando' : 'em ordem') : '—',
      modos
        ? modos.loop === 'Track'
          ? 'repete a faixa'
          : modos.loop === 'Playlist'
            ? 'repete a lista'
            : 'sem repetir'
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
  clear: 'céu limpo',
  clouds: 'nublado',
  fog: 'neblina',
  rain: 'chuva',
  snow: 'neve',
  storm: 'tempestade',
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
      'Hora',
      agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12 }),
    ),
    ler(
      'relogio-data',
      'Data',
      agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }),
    ),
  ]

  // Os relógios de outros fusos, escolhidos em Configurações. Sem nenhum, a
  // leitura diz isso — o catálogo a promete sempre.
  const fusos = currentSettings().island.clocks
  const mundo = fusos.map((zona) => ({
    zona,
    nome: zona.split('/').at(-1)?.replace(/_/g, ' ') ?? zona,
    hora: agora.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: zona,
      hour12,
    }),
  }))
  leituras.push(
    ler(
      'relogio-mundo',
      'Outros fusos',
      mundo[0] ? `${mundo[0].nome} ${mundo[0].hora}` : 'nenhum',
      // `nome hora;…`: o panorama desenha daqui.
      mundo.length > 0
        ? mundo.map((m) => `${m.nome} ${m.hora}`).join(';')
        : 'escolha fusos em Configurações → Ilha',
    ),
  )

  const cronometro = timerState()
  leituras.push(
    ler(
      'timer-restante',
      cronometro?.end === null ? 'Cronômetro' : 'Temporizador',
      cronometro
        ? cronometro.end === null
          ? mmss((Date.now() - cronometro.start) / 1000)
          : mmss((cronometro.end - Date.now()) / 1000)
        : '—',
      cronometro ? cronometro.label || `${cronometro.minutes} min` : 'nenhum em andamento',
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
      ler('clima-temp', 'Lá fora', `${Math.round(clima.temperatureC)}°`, clima.place),
      ler('clima-condicao', 'Céu', CEU[clima.condition] ?? clima.condition),
    )
  } catch {
    // Sem internet o relógio continua valendo: o clima some, o resto fica.
    leituras.push(ler('clima-temp', 'Lá fora', '—', 'clima indisponível', null, 'alerta'))
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
      'Não perturbe',
      silencio ? 'ligado' : 'desligado',
      silencio
        ? silencioNosso()
          ? 'pela ilha'
          : 'pelo applet do KDE'
        : 'as notificações aparecem',
      null,
      silencio ? 'alerta' : 'ok',
    ),
    ler(
      'avisos-recentes',
      'Notificações',
      String(lista.length),
      lista[0]
        ? `${lista[0].app}: ${lista[0].title}`.slice(0, 40)
        : 'nenhuma desde que a ilha subiu',
    ),
    ler(
      'avisos-vigia',
      'Vigia do D-Bus',
      vigia ? 'ouvindo' : 'parado',
      vigia ? 'dbus-monitor em org.freedesktop.Notifications' : 'ligue em Configurações → Ilha',
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
      'Agentes',
      String(agentes.length),
      trabalhando.length > 0 ? `${trabalhando.length} trabalhando` : 'nenhum ocupado',
      null,
      trabalhando.length > 0 ? 'alerta' : 'ok',
    ),
    ler('halo-containers', 'Containers', String(ativos), `de ${lista.length}`),
    ler(
      'halo-projetos',
      'Projetos alterados',
      String(sujos.length),
      sujos[0]?.name ?? 'tudo commitado',
    ),
    // O app dentro da própria ilha. É leitura, e não só um sinal para a
    // pílula, porque é estado do sistema como qualquer outro: quem abre a
    // aba Módulos vê onde a janela está.
    ler(
      'halo-na-ilha',
      'Janela do Halo',
      haloRecolhido() ? 'na ilha' : 'à vista',
      haloRecolhido() ? 'Meta+Space traz de volta' : 'Meta+Space recolhe',
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
      'Baixados',
      String(nomes.length),
      recentes[0]?.nome.slice(0, 28) ?? 'pasta vazia',
    ),
    ler(
      'capturas-recentes',
      'Capturas de tela',
      String(capturas.total),
      capturas.ultima?.name.slice(0, 28) ?? 'nenhuma na pasta do Spectacle',
    ),
    ler(
      'downloads-andamento',
      'Baixando agora',
      String(andamento.length),
      andamento[0]
        ? `${andamento[0].nome.slice(0, 22)} · ${legivel(andamento[0].bytes)}`
        : parados > 0
          ? `nada em andamento · ${parados} parado${parados > 1 ? 's' : ''}`
          : 'nada em andamento',
      null,
      andamento.length > 0 ? 'alerta' : 'ok',
    ),
  ]
}

async function aplicativos(): Promise<Reading[]> {
  const lista = await apps()
  return [ler('apps-buscar', 'Aplicativos', String(lista.length), 'instalados nesta máquina')]
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
    ler('kde-desktop-total', 'Áreas de trabalho', String(total)),
    ler(
      'cafeina',
      'Tela acordada',
      nossa ? 'pela ilha' : segurando.length > 0 ? `por ${segurando.length}` : 'não',
      nossa && cafeinaAte()
        ? `até ${new Date(cafeinaAte() ?? 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : segurando[0]
          ? `${segurando[0].quem}: ${segurando[0].motivo}`.slice(0, 40)
          : 'ninguém segurando',
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
      'Copiados',
      String(lista.length),
      lista[0]?.preview.slice(0, 40) ??
        (vigiando ? `nada copiado ainda · via ${clipboardSource()}` : 'histórico desligado'),
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
      'Na gaveta',
      String(itens.length),
      perdidos > 0
        ? `${perdidos} sumiram do disco`
        : (itens[0]?.name ?? 'solte arquivos na pílula'),
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
    ler('janelas-abertas', 'Janelas abertas', String(abertas.length), ativa?.title ?? ''),
    ler(
      'janelas-guardadas',
      'Guardadas na gaveta',
      String(guardadas.length),
      guardadas[0]?.title ?? 'nenhuma guardada',
    ),
    ler(
      'janelas-vigia',
      'Vigia do KWin',
      vigiaDePe() ? 'de pé' : 'parado',
      vigiaDePe() ? 'ouve tela cheia e o atalho' : 'a ilha não ouve o compositor',
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
      'Socket',
      ouvindo ? 'ouvindo' : 'parado',
      // O caminho: é o que um script precisa saber, e a homologação também.
      ouvindo ? caminhoDoSocket() : 'ligue a API local em Configurações → Ilha',
      null,
      ouvindo ? 'ok' : 'alerta',
    ),
    ler(
      'api-atividades',
      'Atividades',
      String(lista.length),
      vivas[0]
        ? `${vivas[0].title} · em andamento`.slice(0, 48)
        : lista[0]
          ? `${lista[0].title} · ${lista[0].state}`.slice(0, 48)
          : 'nada publicado — ver tools/ilha-shell.sh',
      null,
      vivas.length > 0 ? 'alerta' : 'ok',
    ),
  ]
}

/* ——— O instantâneo inteiro ————————————————————————————— */

export async function islandSnapshot(): Promise<IslandSnapshot> {
  const modules = await Promise.all([
    modulo('tempo', 'Relógio e clima', 'Clock', tempo, [
      { id: 'timer-iniciar', label: 'Temporizador de 25 min', icon: 'Timer' },
      { id: 'timer-cronometro', label: 'Cronômetro', icon: 'Hourglass' },
      { id: 'timer-parar', label: 'Parar', icon: 'X' },
    ]),
    modulo('midia', 'Tocando agora', 'MusicNotes', midia, [
      { id: 'midia-anterior', label: 'Anterior', icon: 'SkipBack' },
      { id: 'midia-alternar', label: 'Tocar ou pausar', icon: 'Play' },
      { id: 'midia-proxima', label: 'Próxima', icon: 'SkipForward' },
      { id: 'midia-abrir', label: 'Abrir o player', icon: 'ArrowSquareOut' },
      { id: 'midia-embaralhar', label: 'Embaralhar', icon: 'Shuffle' },
      { id: 'midia-repetir', label: 'Repetir', icon: 'Repeat' },
      { id: 'midia-copiar-link', label: 'Copiar o link', icon: 'Link' },
    ]),
    modulo('sistema', 'Sistema', 'Cpu', async () => [
      // CPU, memória e carga vêm do /proc: baratos, e vivos a cada batida.
      ...(await sistema()),
      ...(await memo('topo', 5000, processoTopo).catch(() => [])),
      ...(await memo('temperaturas', 5000, temperaturas).catch(() => [])),
      ...(await memo('disco', 20_000, disco).catch(() => [])),
      ...(await memo('servicos', 10_000, servicos).catch(() => [])),
      ...(await memo('portas', 10_000, portas).catch(() => [])),
    ]),
    modulo('gpu', 'Placa de vídeo', 'GraphicsCard', () => memo('gpu', 3000, gpu)),
    modulo(
      'audio',
      'Áudio',
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
            'Espectro',
            espectro.ouvindo ? 'ouvindo' : espectro.ligado ? 'parado' : 'desligado',
            espectro.ouvindo
              ? 'parec no monitor da saída'
              : espectro.ligado
                ? 'sobe quando algo tocar'
                : 'ligue em Configurações → Ilha',
            null,
            espectro.ligado ? 'ok' : 'alerta',
          ),
          ler(
            'saidas-audio',
            'Saídas',
            String(saidas.length),
            // `nome|descrição;…`: o seletor do player lê daqui, sem canal novo.
            saidas.map((s) => `${s.nome}|${s.descricao}`).join(';'),
          ),
          ler(
            'audio-vigia',
            'HUD de volume',
            vigia ? 'ouvindo' : 'parado',
            vigia ? 'pactl subscribe' : 'ligue em Configurações → Ilha',
            null,
            vigia ? 'ok' : 'alerta',
          ),
        ]
      },
      [
        { id: 'volume-baixar', label: 'Menos volume', icon: 'SpeakerLow' },
        { id: 'volume-mudo', label: 'Mudo', icon: 'SpeakerSlash' },
        { id: 'volume-subir', label: 'Mais volume', icon: 'SpeakerHigh' },
        { id: 'mic-mudo-alternar', label: 'Silenciar o microfone', icon: 'MicrophoneSlash' },
        { id: 'audio-trocar-saida', label: 'Trocar a saída', icon: 'ArrowsLeftRight' },
      ],
    ),
    modulo(
      'rede',
      'Rede',
      'WifiHigh',
      // A vazão é diferença de /proc/net/dev e fica viva; o `nmcli` tem prazo.
      async () => [...(await memo('rede', 10_000, rede)), ...(await vazao().catch(() => []))],
      [{ id: 'wifi-alternar', label: 'Ligar ou desligar o Wi-Fi', icon: 'WifiSlash' }],
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
            'Bateria Bluetooth',
            '—',
            `sem leitura: ${erro.message.slice(0, 60)}`,
            null,
            'alerta',
          ),
        ])),
      ],
      [{ id: 'bluetooth-alternar', label: 'Ligar ou desligar', icon: 'Power' }],
    ),
    modulo('desktop', 'Área de trabalho', 'SquaresFour', () => memo('desktop', 3000, desktop), [
      { id: 'cafeina-alternar', label: 'Cafeína: manter acordada', icon: 'Coffee' },
      { id: 'kde-desktop-anterior', label: 'Área anterior', icon: 'CaretLeft' },
      { id: 'kde-desktop-proxima', label: 'Próxima área', icon: 'CaretRight' },
      { id: 'kde-mostrar-desktop', label: 'Mostrar a área de trabalho', icon: 'Desktop' },
      { id: 'kde-captura', label: 'Capturar a tela', icon: 'Camera' },
      { id: 'cor-capturar', label: 'Conta-gotas: cor de um ponto', icon: 'Eyedropper' },
      { id: 'kde-bloquear', label: 'Bloquear', icon: 'Lock' },
    ]),
    modulo('halo', 'Halo', 'Sparkle', () => memo('halo', 30_000, halo), [
      { id: 'halo-tela', label: 'Trazer à vista', icon: 'ArrowSquareOut' },
      // O par do Meta+Space, aqui como ação do módulo: `active` acende a que
      // vale agora, do mesmo jeito que as ações que alternam.
      { id: 'halo-recolher', label: 'Recolher para a ilha', icon: 'Halo' },
      { id: 'halo-trazer', label: 'Trazer de volta', icon: 'Halo', active: haloRecolhido() },
    ]),
    modulo(
      'apps',
      'Aplicativos',
      'SquaresFour',
      async () => [
        ...(await memo('aplicativos', 15_000, aplicativos)),
        ...(await memo('baixados', 15_000, baixados).catch(() => [])),
      ],
      [
        { id: 'abrir-caminho', label: 'Abrir a pasta pessoal', icon: 'FolderOpen' },
        { id: 'texto-da-tela', label: 'Ler o texto de um pedaço da tela', icon: 'TextAa' },
      ],
    ),
    modulo('avisos', 'Notificações', 'BellRinging', avisos, [
      { id: 'silencio-alternar', label: 'Não perturbe', icon: 'BellSlash' },
      { id: 'avisos-limpar', label: 'Limpar a lista', icon: 'Broom' },
    ]),
    modulo('clips', 'Área de transferência', 'Clipboard', transferencia, [
      { id: 'clip-limpar', label: 'Limpar o histórico', icon: 'Broom' },
    ]),
    modulo('gaveta', 'Gaveta', 'Tray', gaveta, [
      { id: 'gaveta-limpar', label: 'Esvaziar a gaveta', icon: 'Broom' },
    ]),
    modulo('janelas', 'Janelas', 'AppWindow', janelas, [
      { id: 'janela-guardar', label: 'Guardar a janela ativa', icon: 'DownloadSimple' },
    ]),
    modulo('celular', 'Celular', 'DeviceMobile', () => memo('celular', 10_000, celular), [
      { id: 'celular-tocar', label: 'Fazer tocar', icon: 'Vibrate' },
      { id: 'celular-ping', label: 'Ping', icon: 'Broadcast' },
    ]),
    modulo('discos', 'Removíveis', 'Usb', () => memo('discos', 15_000, discos)),
    modulo('teclado', 'Teclado', 'Keyboard', teclado),
    modulo('foco', 'Foco', 'Target', foco, [
      { id: 'timer-iniciar', label: 'Sessão de 25 min', icon: 'Timer' },
      { id: 'foco-limpar', label: 'Apagar o histórico', icon: 'Broom' },
    ]),
    modulo('api', 'API local', 'PlugsConnected', api),
    modulo('claude', 'Claude', 'Sparkle', claude, [
      { id: 'claude-parar', label: 'Encerrar a conversa', icon: 'X' },
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
