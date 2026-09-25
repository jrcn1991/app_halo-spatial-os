import { execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { marcar, t } from '@shared/i18n'
import type { Reading } from '@shared/island'
import { arquivoSolto } from '../services/arquivo-solto'
import { announceToIslands } from './window'

/**
 * O celular, pelo KDE Connect.
 *
 * É o "AirDrop" e o "Device Battery" dos apps de notch, com o que o KDE já
 * oferece: o `kdeconnectd` fala D-Bus (`org.kde.kdeconnect`), e cada
 * dispositivo pareado é um objeto em `/modules/kdeconnect/devices/<id>` com
 * um sub-objeto por plugin — `battery`, `share`, `findmyphone`, `ping`.
 * Nada aqui é rede nossa: quem fala com o celular é o daemon do KDE; a ilha
 * só pede a ele.
 *
 * Sem celular pareado ou ao alcance, as leituras dizem isso e as ações
 * recusam com o motivo — a homologação aceita esse "não deu" como resposta
 * certa, do mesmo jeito que aceita "nenhum player aberto".
 */

const run = promisify(execFile)
const TIMEOUT_MS = 3000
const SERVICO = 'org.kde.kdeconnect'
const RAIZ = '/modules/kdeconnect'

async function busctl(...args: string[]): Promise<unknown[]> {
  const { stdout } = await run('busctl', ['--user', '--json=short', ...args], {
    timeout: TIMEOUT_MS,
  })
  return (JSON.parse(stdout) as { data: unknown[] }).data
}

async function propriedade(caminho: string, iface: string, nome: string): Promise<unknown> {
  const dados = await busctl('get-property', SERVICO, caminho, iface, nome)
  return dados[0]
}

export type Celular = {
  id: string
  name: string
  reachable: boolean
  paired: boolean
  /** 0–100, ou `null` quando o plugin de bateria não respondeu. */
  battery: number | null
  charging: boolean
}

/** Os dispositivos que o KDE Connect conhece, pareados primeiro. */
export async function celulares(): Promise<Celular[]> {
  const ids = ((await busctl('call', SERVICO, RAIZ, 'org.kde.kdeconnect.daemon', 'devices'))[0] ??
    []) as string[]
  const lista = await Promise.all(
    ids.map(async (id) => {
      const caminho = `${RAIZ}/devices/${id}`
      const iface = 'org.kde.kdeconnect.device'
      const [name, reachable, paired] = await Promise.all([
        propriedade(caminho, iface, 'name').catch(() => id),
        propriedade(caminho, iface, 'isReachable').catch(() => false),
        propriedade(caminho, iface, 'isPaired').catch(() => false),
      ])
      const bateria = 'org.kde.kdeconnect.device.battery'
      const [charge, charging] = await Promise.all([
        propriedade(`${caminho}/battery`, bateria, 'charge').catch(() => null),
        propriedade(`${caminho}/battery`, bateria, 'isCharging').catch(() => false),
      ])
      return {
        id,
        name: String(name),
        reachable: Boolean(reachable),
        paired: Boolean(paired),
        battery: typeof charge === 'number' && charge >= 0 ? charge : null,
        charging: Boolean(charging),
      }
    }),
  )
  return lista.sort((a, b) => Number(b.paired) - Number(a.paired))
}

/** O celular com quem dá para falar agora. Sem um, o erro diz por quê. */
export async function celularAtivo(): Promise<Celular> {
  const lista = await celulares()
  const pareados = lista.filter((c) => c.paired)
  if (pareados.length === 0) throw new Error(t('nenhum celular pareado — abra o KDE Connect'))
  const perto = pareados.find((c) => c.reachable)
  if (!perto)
    throw new Error(t('{nome} está fora de alcance', { nome: pareados[0]?.name ?? t('o celular') }))
  return perto
}

async function plugin(nome: string, iface: string, metodo: string, ...args: string[]) {
  const c = await celularAtivo()
  await busctl(
    'call',
    SERVICO,
    `${RAIZ}/devices/${c.id}/${nome}`,
    `org.kde.kdeconnect.device.${iface}`,
    metodo,
    ...args,
  )
  return c
}

/** Faz o celular tocar, mesmo no silencioso: o "encontrar" do KDE Connect. */
export const tocarCelular = () => plugin('findmyphone', 'findmyphone', 'ring')

/** Um toque de presença: o celular mostra "Ping" — prova que a ponte está viva. */
export const pingCelular = () => plugin('ping', 'ping', 'sendPing')

/**
 * Manda um arquivo ou um endereço. Arquivo vai como `file://` e o KDE
 * Connect o transfere; `http(s)://` abre no navegador do celular.
 */
export async function enviarAoCelular(alvo: string): Promise<Celular> {
  // Arquivo vem do renderer: só arquivo comum, fora de `/proc` e afins (ver
  // `arquivo-solto.ts`). Sem teto — mandar um vídeo ao celular é o uso.
  const url = /^https?:\/\//.test(alvo)
    ? alvo
    : pathToFileURL((await arquivoSolto(alvo, Number.POSITIVE_INFINITY)).caminho).href
  if (!url.startsWith('file://') && !/^https?:\/\//.test(url)) {
    throw new Error(t('só arquivo (caminho absoluto) ou endereço http(s)'))
  }
  return plugin('share', 'share', 'shareUrl', 's', url)
}

/** Manda um trecho de texto: cai na área de transferência do celular. */
export async function enviarTextoAoCelular(texto: string): Promise<Celular> {
  const limpo = texto.trim()
  if (!limpo) throw new Error(t('nada para enviar'))
  return plugin('share', 'share', 'shareText', 's', limpo.slice(0, 20_000))
}

const ler = (
  id: string,
  label: string,
  value: string,
  detail = '',
  ratio: number | null = null,
  level: Reading['level'] = 'ok',
): Reading => ({ id, label, value, detail, ratio, level })

/** O último alcance visto, para anunciar quando o celular chega ou some. */
let alcanceVisto: Map<string, boolean> | null = null

/** As leituras do módulo — e o anúncio de chegada/saída, só quando muda. */
export async function celular(): Promise<Reading[]> {
  const lista = await celulares()
  const principal = lista.find((c) => c.paired && c.reachable) ?? lista.find((c) => c.paired)

  // Chegou ou saiu do alcance: um aviso, nunca no primeiro pulso.
  const agora = new Map(lista.filter((c) => c.paired).map((c) => [c.id, c.reachable]))
  if (alcanceVisto) {
    for (const [id, perto] of agora) {
      const antes = alcanceVisto.get(id)
      if (antes === undefined || antes === perto) continue
      const nome = lista.find((c) => c.id === id)?.name ?? t('Celular')
      announceToIslands({
        icon: 'DeviceMobile',
        text: perto ? t('{nome} por perto', { nome }) : t('{nome} saiu do alcance', { nome }),
        detail: perto ? 'KDE Connect' : '',
        level: perto ? 'ok' : 'alerta',
        kind: 'aviso',
        ttlMs: 3500,
      })
    }
  }
  alcanceVisto = agora

  const pareados = lista.filter((c) => c.paired).length
  return [
    ler(
      'celular-dispositivo',
      t('Celular'),
      principal?.name ?? marcar('nenhum'),
      principal
        ? principal.reachable
          ? t('ao alcance · KDE Connect')
          : t('fora de alcance')
        : pareados === 0
          ? t('nenhum pareado — abra o KDE Connect')
          : '',
      null,
      principal?.reachable ? 'ok' : 'alerta',
    ),
    ler(
      'celular-bateria',
      t('Bateria do celular'),
      principal?.reachable && principal.battery !== null ? `${principal.battery}%` : '—',
      principal?.reachable
        ? principal.battery === null
          ? t('o celular não informa')
          : principal.charging
            ? marcar('carregando')
            : t('na bateria')
        : t('sem celular ao alcance'),
      principal?.reachable && principal.battery !== null ? principal.battery / 100 : null,
      principal?.reachable && principal.battery !== null && principal.battery < 20
        ? 'alerta'
        : 'ok',
    ),
  ]
}
