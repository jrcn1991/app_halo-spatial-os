import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { marcar, t } from '@shared/i18n'
import type { Reading } from '@shared/island'
import { gpuStats } from '../services/gpu'

/**
 * As fontes da ilha.
 *
 * Cada função lê UMA coisa desta máquina e devolve `Reading`s. Nenhuma inventa:
 * quando a fonte não responde, a função lança e o módulo aparece marcado como
 * indisponível — dizer "0%" quando não se sabe seria pior que dizer que não sabe.
 *
 * Tudo é leitura. As ações moram em `actions.ts`, separadas justamente para
 * ficar visível o que só observa e o que mexe no sistema.
 */

const run = promisify(execFile)

/** Nenhuma leitura vale travar a ilha: o que demora demais é descartado. */
const TIMEOUT_MS = 4000

async function cmd(comando: string, args: string[]): Promise<string> {
  const { stdout } = await run(comando, args, { timeout: TIMEOUT_MS })
  return stdout
}

const pct = (parte: number, total: number) =>
  total > 0 ? Math.max(0, Math.min(1, parte / total)) : 0
const nivel = (razao: number, alerta = 0.8, erro = 0.92): Reading['level'] =>
  razao >= erro ? 'erro' : razao >= alerta ? 'alerta' : 'ok'

const ler = (
  id: string,
  label: string,
  value: string,
  detail = '',
  ratio: number | null = null,
  level: Reading['level'] = 'ok',
): Reading => ({ id, label, value, detail, ratio, level })

/* ——— Processador e memória ————————————————————————————————— */

/** Duas amostras de `/proc/stat`: uso instantâneo não existe num arquivo só. */
async function cpuPercent(): Promise<number> {
  const amostra = async () => {
    const linha = (await readFile('/proc/stat', 'utf8')).split('\n')[0] ?? ''
    const campos = linha.trim().split(/\s+/).slice(1).map(Number)
    const total = campos.reduce((a, b) => a + b, 0)
    const ocioso = (campos[3] ?? 0) + (campos[4] ?? 0)
    return { total, ocupado: total - ocioso }
  }
  const antes = await amostra()
  await new Promise((r) => setTimeout(r, 120))
  const depois = await amostra()
  const dTotal = depois.total - antes.total
  return dTotal > 0 ? ((depois.ocupado - antes.ocupado) / dTotal) * 100 : 0
}

export async function sistema(): Promise<Reading[]> {
  const [uso, meminfo, loadavg, uptime] = await Promise.all([
    cpuPercent(),
    readFile('/proc/meminfo', 'utf8'),
    readFile('/proc/loadavg', 'utf8'),
    readFile('/proc/uptime', 'utf8'),
  ])

  const kb = (chave: string) =>
    Number(new RegExp(`^${chave}:\\s+(\\d+)`, 'm').exec(meminfo)?.[1] ?? 0)
  const totalGb = kb('MemTotal') / 1024 / 1024
  const livreGb = kb('MemAvailable') / 1024 / 1024
  const usadaGb = totalGb - livreGb
  const razaoMem = pct(usadaGb, totalGb)

  const carga = Number(loadavg.split(' ')[0] ?? 0)
  const nucleos = (await readFile('/proc/cpuinfo', 'utf8')).match(/^processor\s*:/gm)?.length ?? 1
  const segundos = Number(uptime.split(' ')[0] ?? 0)
  const dias = Math.floor(segundos / 86400)
  const horas = Math.floor((segundos % 86400) / 3600)

  return [
    ler(
      'cpu',
      t('Processador'),
      `${uso.toFixed(0)}%`,
      t('{n} núcleos', { n: nucleos }),
      uso / 100,
      nivel(uso / 100),
    ),
    ler(
      'memoria',
      t('Memória'),
      `${usadaGb.toFixed(1)} GB`,
      t('de {total}', { total: `${totalGb.toFixed(0)} GB` }),
      razaoMem,
      nivel(razaoMem),
    ),
    ler(
      'carga',
      t('Carga'),
      carga.toFixed(2),
      t('{n} núcleos', { n: nucleos }),
      pct(carga, nucleos),
      nivel(pct(carga, nucleos)),
    ),
    ler('uptime', t('Ligado há'), dias > 0 ? `${dias}d ${horas}h` : `${horas}h`),
  ]
}

/** O processo que mais consome agora. */
export async function processoTopo(): Promise<Reading[]> {
  const saida = await cmd('ps', ['-eo', 'comm,%cpu,%mem', '--sort=-%cpu'])
  const linha = saida.split('\n')[1]?.trim().split(/\s+/) ?? []
  const nome = linha[0] ?? '—'
  const cpu = Number(linha[1] ?? 0)
  return [
    ler(
      'processo-topo',
      t('Mais pesado'),
      nome,
      t('{n}% de CPU', { n: cpu.toFixed(0) }),
      cpu / 100,
      nivel(cpu / 100),
    ),
  ]
}

/* ——— Temperaturas e placa de vídeo ————————————————————————— */

export async function temperaturas(): Promise<Reading[]> {
  const saida = await cmd('sensors', ['-j'])
  const dados = JSON.parse(saida) as Record<string, Record<string, Record<string, number>>>

  let cpu: number | null = null
  const outras: { nome: string; valor: number }[] = []
  for (const [chip, sensores] of Object.entries(dados)) {
    for (const [nome, campos] of Object.entries(sensores)) {
      if (typeof campos !== 'object') continue
      const entrada = Object.entries(campos).find(([k]) => k.endsWith('_input'))
      if (!entrada) continue
      const valor = entrada[1]
      if (/package|tctl|tdie/i.test(nome) && cpu === null) cpu = valor
      else if (outras.length < 2) outras.push({ nome: `${chip.split('-')[0]} ${nome}`, valor })
    }
  }

  const leituras: Reading[] = []
  if (cpu !== null) {
    leituras.push(
      ler(
        'temp-cpu',
        t('Temperatura'),
        `${cpu.toFixed(0)}°C`,
        t('processador'),
        pct(cpu, 100),
        nivel(pct(cpu, 100), 0.75, 0.9),
      ),
    )
  }
  for (const [i, o] of outras.entries()) {
    leituras.push(ler(`temp-${i}`, o.nome.slice(0, 22), `${o.valor.toFixed(0)}°C`))
  }
  if (leituras.length === 0) throw new Error(t('nenhum sensor de temperatura'))
  return leituras
}

export async function gpu(): Promise<Reading[]> {
  // A MESMA leitura do amostrador do host (`services/gpu.ts`, com cache): eram
  // dois `nvidia-smi` por dois caminhos a cada 3s (DESEMPENHO.md, P1-8).
  const g = await gpuStats()
  if (!g) throw new Error(t('sem placa de vídeo legível'))
  const nome = g.name
  const uso = String(g.usagePercent)
  const temp = String(g.temperatureC ?? 0)
  const usada = String(g.memory.usedMb)
  const total = String(g.memory.totalMb)
  const razaoUso = Number(uso) / 100
  const razaoMem = pct(Number(usada), Number(total))
  return [
    ler(
      'gpu-uso',
      t('Placa de vídeo'),
      `${uso}%`,
      (nome ?? '').replace('NVIDIA ', ''),
      razaoUso,
      nivel(razaoUso),
    ),
    ler(
      'gpu-temp',
      t('Temperatura'),
      `${temp}°C`,
      'GPU',
      pct(Number(temp), 100),
      nivel(pct(Number(temp), 100), 0.75, 0.9),
    ),
    ler(
      'gpu-memoria',
      t('Memória de vídeo'),
      `${(Number(usada) / 1024).toFixed(1)} GB`,
      t('de {total}', { total: `${(Number(total) / 1024).toFixed(0)} GB` }),
      razaoMem,
      nivel(razaoMem),
    ),
  ]
}

/* ——— Áudio ————————————————————————————————————————————— */

export async function audio(): Promise<Reading[]> {
  const [volume, mudo, saida] = await Promise.all([
    cmd('pactl', ['get-sink-volume', '@DEFAULT_SINK@']),
    cmd('pactl', ['get-sink-mute', '@DEFAULT_SINK@']),
    cmd('pactl', ['get-default-sink']),
  ])
  const nivelVolume = Number(/(\d+)%/.exec(volume)?.[1] ?? 0)
  // `pactl` responde no idioma do sistema: "yes"/"no", "sim"/"não".
  const estaMudo = /:\s*(yes|sim)/i.test(mudo)
  const nomeSaida = saida.trim().split('.').slice(-1)[0]?.replace(/[-_]/g, ' ') ?? '—'

  return [
    ler(
      'volume',
      t('Volume'),
      estaMudo ? marcar('mudo') : `${nivelVolume}%`,
      nomeSaida.slice(0, 26),
      nivelVolume / 100,
      estaMudo ? 'alerta' : 'ok',
    ),
    ler('saida-audio', t('Saída'), nomeSaida.slice(0, 26)),
  ]
}

/**
 * As saídas de áudio disponíveis, para poder trocar.
 *
 * O `description` do `pactl` vem literalmente `"(null)"` nesta máquina — string,
 * não nulo — então não dá para confiar nele. O nome técnico do dispositivo é
 * feio mas sempre existe; limpá-lo dá um rótulo legível e verdadeiro.
 */
export async function saidasAudio(): Promise<{ nome: string; descricao: string }[]> {
  const saida = await cmd('pactl', ['-f', 'json', 'list', 'sinks'])
  const sinks = JSON.parse(saida) as {
    name: string
    description?: string
    properties?: Record<string, string>
  }[]

  const legivel = (sink: (typeof sinks)[number]) => {
    const candidatos = [sink.properties?.['device.description'], sink.description]
    const bom = candidatos.find((c) => c && c !== '(null)')
    if (bom) return bom
    // `alsa_output.pci-0000_01_00.1.hdmi-stereo` → `hdmi stereo`
    return (sink.name.split('.').at(-1) ?? sink.name).replace(/[-_]/g, ' ')
  }
  return sinks.map((sink) => ({ nome: sink.name, descricao: legivel(sink) }))
}

/* ——— Rede ————————————————————————————————————————————— */

export async function rede(): Promise<Reading[]> {
  const [dispositivos, wifi] = await Promise.all([
    cmd('nmcli', ['-t', '-f', 'TYPE,STATE,CONNECTION,IP4-CONNECTIVITY', 'device']),
    cmd('nmcli', ['-t', '-f', 'ACTIVE,SSID,SIGNAL', 'device', 'wifi']).catch(() => ''),
  ])

  const linhas = dispositivos
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split(':'))
  const ativo = linhas.find((l) => l[0] !== 'loopback' && l[0] !== 'bridge' && l[1] === 'connected')
  const ativaWifi = wifi.split('\n').find((l) => l.startsWith('sim:') || l.startsWith('yes:'))
  const sinal = Number(ativaWifi?.split(':')[2] ?? 0)

  const leituras: Reading[] = [
    ler(
      'rede-conexao',
      t('Rede'),
      ativo?.[2] ?? t('desconectado'),
      ativo?.[0] ?? '',
      null,
      ativo ? 'ok' : 'erro',
    ),
  ]
  if (ativaWifi) {
    leituras.push(
      ler(
        'wifi-sinal',
        t('Sinal'),
        `${sinal}%`,
        'Wi-Fi',
        sinal / 100,
        sinal < 35 ? 'alerta' : 'ok',
      ),
    )
  }

  const ip = await cmd('hostname', ['-I']).catch(() => '')
  const primeiro = ip.trim().split(/\s+/)[0]
  if (primeiro) leituras.push(ler('rede-ip', t('Endereço'), primeiro))

  return leituras
}

/** Vazão da interface, medida entre duas amostras de `/proc/net/dev`. */
export async function vazao(): Promise<Reading[]> {
  const amostra = async () => {
    const texto = await readFile('/proc/net/dev', 'utf8')
    let rx = 0
    let tx = 0
    for (const linha of texto.split('\n').slice(2)) {
      const [nome, resto] = linha.split(':')
      if (!nome || !resto || nome.trim() === 'lo') continue
      const campos = resto.trim().split(/\s+/).map(Number)
      rx += campos[0] ?? 0
      tx += campos[8] ?? 0
    }
    return { rx, tx }
  }
  const antes = await amostra()
  await new Promise((r) => setTimeout(r, 500))
  const depois = await amostra()

  const taxa = (bytes: number) => {
    const kbps = (bytes * 2) / 1024
    return kbps > 1024 ? `${(kbps / 1024).toFixed(1)} MB/s` : `${kbps.toFixed(0)} KB/s`
  }
  return [
    ler('rede-baixando', t('Baixando'), taxa(depois.rx - antes.rx)),
    ler('rede-enviando', t('Enviando'), taxa(depois.tx - antes.tx)),
  ]
}

/* ——— Bluetooth ————————————————————————————————————————— */

export async function bluetooth(): Promise<Reading[]> {
  const estado = await cmd('bluetoothctl', ['show'])
  const ligado = /Powered:\s*yes/i.test(estado)
  const conectados = await cmd('bluetoothctl', ['devices', 'Connected']).catch(() => '')
  const nomes = conectados
    .split('\n')
    .filter((l) => l.startsWith('Device'))
    .map((l) => l.split(' ').slice(2).join(' '))

  return [
    ler(
      'bluetooth',
      'Bluetooth',
      ligado ? marcar('ligado') : marcar('desligado'),
      nomes.length ? nomes[0] : ligado ? t('nada conectado') : '',
      null,
      ligado ? 'ok' : 'alerta',
    ),
    ler(
      'bluetooth-conectados',
      t('Conectados'),
      String(nomes.length),
      nomes.slice(0, 2).join(', '),
    ),
  ]
}

/**
 * A bateria dos dispositivos Bluetooth que a informam (fones, mouse,
 * teclado): o BlueZ publica `org.bluez.Battery1.Percentage` no bus de
 * sistema para cada um. Quem não informa não aparece — e sem nenhum, a
 * leitura diz isso em vez de um número.
 */
export async function bluetoothBateria(): Promise<Reading[]> {
  const saida = await cmd('busctl', [
    '--system',
    '--json=short',
    'call',
    'org.bluez',
    '/',
    'org.freedesktop.DBus.ObjectManager',
    'GetManagedObjects',
  ])
  type Ifaces = Record<string, Record<string, { data: unknown }>>
  const objetos = ((JSON.parse(saida) as { data: Record<string, Ifaces>[] }).data[0] ??
    {}) as Record<string, Ifaces>
  const comBateria = Object.values(objetos)
    .filter((ifaces) => ifaces['org.bluez.Battery1'] && ifaces['org.bluez.Device1'])
    .map((ifaces) => ({
      nome: String(
        ifaces['org.bluez.Device1']?.Alias?.data ?? ifaces['org.bluez.Device1']?.Name?.data ?? '?',
      ),
      carga: Number(ifaces['org.bluez.Battery1']?.Percentage?.data ?? -1),
    }))
    .filter((d) => d.carga >= 0)
    .sort((a, b) => a.carga - b.carga)
  const pior = comBateria[0]
  return [
    ler(
      'bluetooth-bateria',
      t('Bateria Bluetooth'),
      pior ? `${pior.carga}%` : '—',
      pior
        ? comBateria
            .map((d) => `${d.nome} ${d.carga}%`)
            .join(' · ')
            .slice(0, 60)
        : t('nenhum dispositivo conectado informa'),
      pior ? pior.carga / 100 : null,
      pior && pior.carga < 20 ? 'alerta' : 'ok',
    ),
  ]
}

/* ——— Disco ————————————————————————————————————————————— */

export async function disco(): Promise<Reading[]> {
  const saida = await cmd('df', ['-B1', '--output=target,size,used', '/'])
  const campos = saida.split('\n')[1]?.trim().split(/\s+/) ?? []
  const total = Number(campos[1] ?? 0)
  const usado = Number(campos[2] ?? 0)
  const razao = pct(usado, total)
  const gb = (b: number) => (b / 1e9).toFixed(0)
  return [
    ler(
      'disco-raiz',
      t('Disco'),
      `${gb(usado)} GB`,
      t('de {total}', { total: `${gb(total)} GB` }),
      razao,
      nivel(razao, 0.85, 0.95),
    ),
  ]
}

/* ——— Sistema operacional ————————————————————————————————— */

export async function servicos(): Promise<Reading[]> {
  const falhas = await cmd('systemctl', ['--failed', '--no-legend', '--plain'])
  const lista = falhas.split('\n').filter((l) => l.trim())
  return [
    ler(
      'systemd-falhas',
      t('Serviços com falha'),
      String(lista.length),
      lista[0]?.split(/\s+/)[0] ?? t('tudo certo'),
      null,
      lista.length > 0 ? 'alerta' : 'ok',
    ),
  ]
}

/** Área de trabalho virtual do KDE. */
export async function areaDeTrabalho(): Promise<Reading[]> {
  const atual = await cmd('qdbus6', ['org.kde.KWin', '/KWin', 'currentDesktop'])
  return [ler('kde-desktop', t('Área de trabalho'), atual.trim())]
}

/* ——— Microfone ——————————————————————————————————————————— */

/**
 * O microfone: se está mudo, e QUEM está gravando dele agora.
 *
 * A segunda leitura é o indicador de privacidade dos apps de notch (o ponto
 * laranja do macOS): cada aplicativo que abre o microfone vira um
 * `source-output` no PipeWire, com o nome dele nas propriedades.
 */
export async function microfone(): Promise<Reading[]> {
  const [mudo, gravando] = await Promise.all([
    cmd('pactl', ['get-source-mute', '@DEFAULT_SOURCE@']),
    quemGrava(),
  ])
  const estaMudo = /:\s*(yes|sim)/i.test(mudo)
  return [
    ler(
      'mic-mudo',
      t('Microfone'),
      estaMudo ? marcar('mudo') : marcar('aberto'),
      estaMudo ? t('ninguém te ouve') : '',
      null,
      estaMudo ? 'alerta' : 'ok',
    ),
    ler(
      'mic-em-uso',
      t('Gravando do microfone'),
      String(gravando.length),
      gravando.slice(0, 2).join(', ') || t('nenhum aplicativo'),
      null,
      gravando.length > 0 ? 'erro' : 'ok',
    ),
  ]
}

/**
 * Só os nomes de quem grava DO MICROFONE — para a leitura e para o vigia.
 *
 * Um `source-output` também nasce de quem grava o MONITOR de uma saída (o
 * espectro da própria ilha, um gravador de "o que está tocando"): isso não
 * é o microfone, e marcá-lo com o ponto laranja seria mentir sobre
 * privacidade. Medido em 02/09/2026: o `parec` do espectro aparecia como
 * "Microfone · parec". As fontes cujo nome termina em `.monitor` ficam de
 * fora.
 */
export async function quemGrava(): Promise<string[]> {
  const [saida, fontes] = await Promise.all([
    cmd('pactl', ['-f', 'json', 'list', 'source-outputs']).catch(() => '[]'),
    cmd('pactl', ['-f', 'json', 'list', 'sources']).catch(() => '[]'),
  ])
  const monitores = new Set(
    (JSON.parse(fontes) as { index: number; name: string }[])
      .filter((f) => f.name.endsWith('.monitor'))
      .map((f) => f.index),
  )
  return (JSON.parse(saida) as { source?: number; properties?: Record<string, string> }[])
    .filter((o) => o.source === undefined || !monitores.has(o.source))
    .map((o) => o.properties?.['application.name'] ?? o.properties?.['media.name'] ?? '')
    .filter(Boolean)
}

/* ——— Portas em escuta ——————————————————————————————————— */

/**
 * As portas TCP em escuta, com o processo quando ele é nosso — o `ss` só
 * mostra o dono das portas do próprio usuário; as do sistema vêm sem nome, e
 * é assim mesmo. É a leitura de "quem está na porta 3000" do Notchy.
 */
export async function portas(): Promise<Reading[]> {
  const saida = await cmd('ss', ['-ltnpH'])
  const linhas = saida
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const vistas = new Map<number, string>()
  for (const linha of linhas) {
    const porta = Number(/:(\d+)\s+\S+:\*/.exec(linha)?.[1] ?? 0)
    if (!porta || vistas.has(porta)) continue
    vistas.set(porta, /users:\(\("([^"]+)"/.exec(linha)?.[1] ?? '')
  }
  const ordenadas = [...vistas.entries()].sort((a, b) => a[0] - b[0])
  const resumo = ordenadas
    .slice(0, 4)
    .map(([p, quem]) => (quem ? `${p} ${quem}` : String(p)))
    .join(' · ')
  return [ler('portas-escuta', t('Portas em escuta'), String(ordenadas.length), resumo)]
}
