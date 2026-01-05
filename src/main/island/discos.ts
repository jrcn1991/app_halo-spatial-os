import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Reading } from '@shared/island'
import { announceToIslands } from './window'

/**
 * Discos removíveis: pendrives, cartões, HDs externos.
 *
 * O "Drive Eject" dos apps de notch: quando um pendrive entra a ilha avisa;
 * ejetar desmonta e desliga o dispositivo (`udisksctl`, o mesmo que o
 * Dolphin usa, com a permissão que o polkit já dá à sessão local) e a ilha
 * diz "pode tirar". A lista vem do `lsblk`, que lê o kernel — não há
 * daemon nosso; o vigia é o próprio instantâneo, que compara a lista de um
 * pulso com a do anterior.
 *
 * Nada aqui toca arquivo do usuário: montar, desmontar e desligar são
 * estados do dispositivo, os mesmos botões da bandeja do KDE.
 */

const run = promisify(execFile)
const TIMEOUT_MS = 4000

type Bloco = {
  name: string
  path: string
  rm: boolean
  hotplug: boolean
  tran: string | null
  mountpoint: string | null
  label: string | null
  size: number
  type: string
  vendor: string | null
  model: string | null
  fstype: string | null
  fsavail: number | null
  children?: Bloco[]
}

export type Volume = {
  /** `/dev/sdg1` */
  device: string
  label: string
  fstype: string
  mountpoint: string | null
  size: number
  avail: number | null
}

export type Removivel = {
  /** `/dev/sdg` */
  device: string
  name: string
  size: number
  volumes: Volume[]
}

/**
 * Tamanho em base 1000 — "GB" aqui significa 10^9 bytes.
 *
 * É a conta que o fabricante estampa no disco, e é o número que o usuário
 * espera ver de um pendrive de 32 GB. A tela de Arquivos usa base 1024
 * (`formatSize` em `screens/files/FilesScreen.tsx`), porque lá o vizinho é o
 * gerenciador de arquivos do KDE. As duas estão certas para a fonte de cada
 * uma; unificar faria uma delas mentir.
 */
const legivel = (bytes: number) =>
  bytes >= 1e12
    ? `${(bytes / 1e12).toFixed(1)} TB`
    : bytes >= 1e9
      ? `${(bytes / 1e9).toFixed(0)} GB`
      : bytes >= 1e6
        ? `${(bytes / 1e6).toFixed(0)} MB`
        : `${Math.round(bytes / 1e3)} kB`

/** Os discos removíveis desta máquina, com as partições deles. */
export async function removiveis(): Promise<Removivel[]> {
  const { stdout } = await run(
    'lsblk',
    [
      '-J',
      '-b',
      '-o',
      'NAME,PATH,RM,HOTPLUG,TRAN,MOUNTPOINT,LABEL,SIZE,TYPE,VENDOR,MODEL,FSTYPE,FSAVAIL',
    ],
    { timeout: TIMEOUT_MS },
  )
  const { blockdevices } = JSON.parse(stdout) as { blockdevices: Bloco[] }
  return blockdevices
    .filter((b) => b.type === 'disk' && (b.rm || b.hotplug || b.tran === 'usb'))
    .map((b) => ({
      device: b.path,
      name:
        [b.vendor, b.model]
          .map((s) => (s ?? '').trim())
          .filter(Boolean)
          .join(' ') || b.name,
      size: Number(b.size) || 0,
      volumes: (b.children ?? [])
        .filter((c) => c.type === 'part' && c.fstype)
        .map((c) => ({
          device: c.path,
          label: c.label ?? c.name,
          fstype: c.fstype ?? '',
          mountpoint: c.mountpoint,
          size: Number(c.size) || 0,
          avail: c.fsavail === null ? null : Number(c.fsavail),
        })),
    }))
}

/** Os dispositivos vistos no pulso anterior, para anunciar o que entrou e saiu. */
let vistos: Map<string, string> | null = null

/** As leituras — e o anúncio de pendrive que entrou ou saiu, nunca no primeiro pulso. */
export async function discos(): Promise<Reading[]> {
  const lista = await removiveis()
  const agora = new Map(lista.map((d) => [d.device, d.name]))
  if (vistos) {
    for (const [device, nome] of agora) {
      if (vistos.has(device)) continue
      announceToIslands({
        icon: 'Usb',
        text: 'Dispositivo conectado',
        detail: nome.slice(0, 40),
        level: 'ok',
        kind: 'aviso',
        ttlMs: 4000,
      })
    }
    for (const [device, nome] of vistos) {
      if (agora.has(device)) continue
      announceToIslands({
        icon: 'Usb',
        text: 'Dispositivo removido',
        detail: nome.slice(0, 40),
        level: 'alerta',
        kind: 'aviso',
        ttlMs: 3000,
      })
    }
  }
  vistos = agora

  const montados = lista.flatMap((d) => d.volumes.filter((v) => v.mountpoint))
  const comMidia = lista.filter((d) => d.size > 0)
  return [
    {
      id: 'discos-removiveis',
      label: 'Removíveis',
      value: String(lista.length),
      detail: lista[0]
        ? `${lista[0].name}${lista[0].size > 0 ? ` · ${legivel(lista[0].size)}` : ' · sem mídia'}`
        : 'nenhum pendrive ou disco externo',
      ratio: null,
      level: 'ok',
    },
    {
      id: 'discos-montados',
      label: 'Montados',
      value: String(montados.length),
      detail: montados[0]
        ? `${montados[0].label} em ${montados[0].mountpoint}`.slice(0, 48)
        : comMidia.length > 0
          ? 'há mídia sem montar'
          : 'nada montado',
      ratio: null,
      level: 'ok',
    },
    // `dispositivo|nome|tamanho|partição|rótulo|ponto|livre;…` — a lista que
    // o painel desenha, no mesmo regime das saídas de áudio: sem canal novo.
    {
      id: 'discos-lista',
      label: 'Volumes',
      value: String(lista.reduce((n, d) => n + d.volumes.length, 0)),
      detail: lista
        .flatMap((d) =>
          d.volumes.length > 0
            ? d.volumes.map((v) =>
                [
                  d.device,
                  d.name,
                  legivel(d.size),
                  v.device,
                  v.label,
                  v.mountpoint ?? '',
                  v.avail === null ? '' : legivel(v.avail),
                ].join('|'),
              )
            : [
                [d.device, d.name, d.size > 0 ? legivel(d.size) : 'sem mídia', '', '', '', ''].join(
                  '|',
                ),
              ],
        )
        .join(';'),
      ratio: null,
      level: 'ok',
    },
  ]
}

async function udisks(...args: string[]): Promise<string> {
  const { stdout } = await run('udisksctl', [...args, '--no-user-interaction'], {
    timeout: 15_000,
  })
  return stdout
}

/**
 * Ejeta com segurança: desmonta cada partição montada e desliga o
 * dispositivo. Ao fim a ilha diz "pode tirar" — é o que se quer saber.
 */
export async function ejetarDisco(device: string): Promise<void> {
  const disco = (await removiveis()).find((d) => d.device === device)
  if (!disco) throw new Error('esse dispositivo não está mais aqui')
  for (const v of disco.volumes) {
    if (v.mountpoint) await udisks('unmount', '-b', v.device)
  }
  await udisks('power-off', '-b', device)
  announceToIslands({
    icon: 'Eject',
    text: 'Pode tirar',
    detail: disco.name.slice(0, 40),
    level: 'ok',
    kind: 'aviso',
    ttlMs: 4000,
  })
}

/** Monta uma partição de um removível e anuncia onde ela ficou. */
export async function montarDisco(device: string): Promise<string> {
  const volume = (await removiveis()).flatMap((d) => d.volumes).find((v) => v.device === device)
  if (!volume) throw new Error('essa partição não é de um removível')
  if (volume.mountpoint) return volume.mountpoint
  const saida = await udisks('mount', '-b', device)
  // "Mounted /dev/sdg1 at /media/usuario/PENDRIVE" (ou traduzido — o caminho é o que vale)
  const ponto = /\s(\/\S+)\.?\s*$/.exec(saida.trim())?.[1] ?? ''
  announceToIslands({
    icon: 'Usb',
    text: 'Montado',
    detail: (ponto || volume.label).slice(0, 40),
    level: 'ok',
    kind: 'aviso',
    ttlMs: 3000,
  })
  return ponto
}
