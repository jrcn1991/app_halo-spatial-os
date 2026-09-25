import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { marcar, t } from '@shared/i18n'
import type { IslandEvent, Reading } from '@shared/island'

/**
 * Caps Lock e Num Lock, pelos LEDs do teclado.
 *
 * O "Caps Lock HUD" do Notchy. No Wayland ninguém lê o teclado dos outros —
 * mas o estado das travas é um LED, e o kernel publica cada LED em
 * `/sys/class/leds/<input>::capslock/brightness`: `1` aceso, `0` apagado.
 * Ler um arquivo do sysfs custa microssegundos, então o vigia lê a cada
 * 200ms e só fala quando muda. Não há evento a escutar (sysfs não avisa),
 * e 200ms é o bastante para o HUD parecer imediato.
 *
 * Com mais de um teclado (dois `inputN` para o mesmo aparelho, por exemplo,
 * pelo hub) vale "algum aceso".
 */

const LEDS = '/sys/class/leds'
const RITMO_MS = 200
const HUD_MS = 1500

let relogio: ReturnType<typeof setInterval> | undefined
let anunciar: ((evento: IslandEvent) => void) | null = null
let caminhos: { caps: string[]; num: string[] } | null = null
/** `null` até a primeira leitura calibrar; só a MUDANÇA vira HUD. */
let capsVisto: boolean | null = null
let numVisto: boolean | null = null

async function acharLeds(): Promise<{ caps: string[]; num: string[] }> {
  if (caminhos) return caminhos
  const nomes = await readdir(LEDS).catch(() => [] as string[])
  caminhos = {
    caps: nomes.filter((n) => /::capslock$/.test(n)).map((n) => join(LEDS, n, 'brightness')),
    num: nomes.filter((n) => /::numlock$/.test(n)).map((n) => join(LEDS, n, 'brightness')),
  }
  return caminhos
}

async function aceso(arquivos: string[]): Promise<boolean | null> {
  if (arquivos.length === 0) return null
  const valores = await Promise.all(
    arquivos.map((a) =>
      readFile(a, 'utf8').then(
        (t) => t.trim() !== '0',
        () => false,
      ),
    ),
  )
  return valores.some(Boolean)
}

export async function travas(): Promise<{ caps: boolean | null; num: boolean | null }> {
  const leds = await acharLeds()
  const [caps, num] = await Promise.all([aceso(leds.caps), aceso(leds.num)])
  return { caps, num }
}

async function olhar(): Promise<void> {
  const { caps, num } = await travas()
  if (caps !== null) {
    if (capsVisto !== null && caps !== capsVisto) {
      anunciar?.({
        icon: 'Keyboard',
        text: caps ? t('Caps Lock ligado') : t('Caps Lock desligado'),
        detail: '',
        level: caps ? 'alerta' : 'ok',
        kind: 'hud',
        key: 'capslock',
        ratio: null,
        ttlMs: HUD_MS,
      })
    }
    capsVisto = caps
  }
  if (num !== null) {
    if (numVisto !== null && num !== numVisto) {
      anunciar?.({
        icon: 'Keyboard',
        text: num ? t('Num Lock ligado') : t('Num Lock desligado'),
        detail: '',
        level: 'ok',
        kind: 'hud',
        key: 'numlock',
        ratio: null,
        ttlMs: HUD_MS,
      })
    }
    numVisto = num
  }
}

export function vigiarTeclado(aoAnunciar: (evento: IslandEvent) => void): void {
  anunciar = aoAnunciar
  if (relogio) return
  relogio = setInterval(() => void olhar().catch(() => {}), RITMO_MS)
}

export function pararTeclado(): void {
  clearInterval(relogio)
  relogio = undefined
  capsVisto = null
  numVisto = null
}

export const tecladoVigiado = (): boolean => relogio !== undefined

/** As leituras do módulo: o estado de cada trava e se o vigia está de pé. */
export async function teclado(): Promise<Reading[]> {
  const { caps, num } = await travas()
  const estado = (v: boolean | null) =>
    v === null ? t('sem LED') : v ? marcar('ligado') : marcar('desligado')
  return [
    {
      id: 'teclado-capslock',
      label: 'Caps Lock',
      value: estado(caps),
      detail:
        caps === null
          ? t('nenhum LED de Caps Lock em /sys/class/leds')
          : caps
            ? t('as maiúsculas estão presas')
            : t('maiúsculas soltas'),
      ratio: null,
      level: caps ? 'alerta' : 'ok',
    },
    {
      id: 'teclado-numlock',
      label: 'Num Lock',
      value: estado(num),
      detail: num === null ? t('nenhum LED de Num Lock em /sys/class/leds') : '',
      ratio: null,
      level: 'ok',
    },
    {
      id: 'teclado-vigia',
      label: t('HUD das travas'),
      value: tecladoVigiado() ? marcar('ouvindo') : marcar('parado'),
      detail: tecladoVigiado()
        ? t('LEDs do teclado a cada 200ms')
        : t('ligue o HUD em Configurações → Ilha'),
      ratio: null,
      level: tecladoVigiado() ? 'ok' : 'alerta',
    },
  ]
}
