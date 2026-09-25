import { marcar } from '@shared/i18n'

/**
 * As 13 variações de entrada do handoff.
 *
 * As strings abaixo são copiadas VERBATIM da classe `Component.ENTRANCES` do
 * protótipo (`Halo Spatial Social.dc.html`). Manter o formato bruto é
 * intencional: qualquer divergência com o handoff vira um diff de uma linha.
 *
 * Regra do handoff: `--from-x` vive SÓ no painel; as variações passam apenas o
 * escalar `--s-dir`. Nunca declarar `--from-x` na raiz.
 */

export const ENTRANCES = {
  'Surgir da barra':
    '--dur: 0.58s; --dur-side: 0.66s; --c-y: 230px; --c-s: 0.42; --s-z: -340px; --s-s: 0.5; --s-delay: 0.16s;',
  Cascata:
    '--dur: 0.5s; --dur-side: 0.62s; --c-y: 110px; --c-s: 0.86; --c-rx: 12deg; --s-y: 90px; --s-dir: 0; --s-z: -140px; --s-s: 0.9; --s-delay: 0.22s; --dock-delay: 0.4s;',
  Órbita:
    '--dur: 0.62s; --dur-side: 0.86s; --ease: cubic-bezier(0.16, 1, 0.3, 1); --c-y: 60px; --c-s: 0.7; --c-rz: -3deg; --s-dir: -2.6; --s-z: -680px; --s-s: 0.62; --s-delay: 0.1s;',
  Materializar:
    '--dur: 0.7s; --dur-side: 0.8s; --ease: ease-out; --c-y: 0px; --c-s: 0.97; --c-blur: 16px; --s-dir: 0; --s-z: 0px; --s-s: 0.97; --s-blur: 20px; --s-delay: 0.12s;',
  Dobra:
    '--dur: 0.6s; --dur-side: 0.7s; --c-y: 140px; --c-s: 0.9; --c-rx: -72deg; --s-dir: 0; --s-y: 120px; --s-z: -60px; --s-s: 0.94; --s-delay: 0.2s;',
  Leque:
    '--dur: 0.5s; --dur-side: 0.72s; --ease: cubic-bezier(0.2, 1, 0.3, 1); --c-y: 60px; --c-s: 0.9; --s-dir: 0.15; --s-y: 60px; --s-z: -200px; --s-s: 0.88; --s-rz: 10deg; --s-delay: 0.18s;',
  Elástico:
    '--dur: 0.72s; --dur-side: 0.84s; --ease: cubic-bezier(0.34, 1.56, 0.64, 1); --c-y: 190px; --c-s: 0.55; --s-dir: 0.6; --s-z: -260px; --s-s: 0.7; --s-delay: 0.14s;',
  Implodir:
    '--dur: 0.62s; --dur-side: 0.7s; --ease: cubic-bezier(0.16, 1, 0.3, 1); --c-y: 0px; --c-s: 1.35; --c-blur: 10px; --s-dir: -2.2; --s-z: 340px; --s-s: 1.4; --s-blur: 12px; --s-delay: 0.06s;',
  Persiana:
    '--dur: 0.6s; --dur-side: 0.74s; --c-y: 40px; --c-s: 1; --c-sy: 0.05; --s-dir: 0; --s-z: -60px; --s-s: 1; --s-ry: 82deg; --s-delay: 0.2s;',
  'Tela ligando':
    '--dur: 0.5s; --dur-side: 0.6s; --ease: cubic-bezier(0.2, 1.4, 0.4, 1); --c-y: 0px; --c-s: 1.06; --c-sy: 0.02; --c-blur: 6px; --s-dir: 0; --s-z: 0px; --s-s: 1.04; --s-blur: 10px; --s-delay: 0.16s;',
  'Estalo (reunir)':
    '--dur: 0.95s; --dur-side: 1.15s; --ease: cubic-bezier(0.12, 0.9, 0.2, 1); --c-y: -90px; --c-x: 40px; --c-s: 1.12; --c-rz: -2deg; --c-blur: 30px; --s-dir: 1.4; --s-y: -150px; --s-z: -120px; --s-s: 1.14; --s-rz: 6deg; --s-blur: 34px; --s-delay: 0.2s; --dock-delay: 0.5s;',
  Enxame:
    '--dur: 0.66s; --dur-side: 0.9s; --ease: cubic-bezier(0.16, 1, 0.3, 1); --c-y: 120px; --c-s: 0.8; --c-rz: 4deg; --s-dir: 1.8; --s-y: -180px; --s-z: -420px; --s-s: 0.55; --s-rz: -14deg; --s-delay: 0.12s;',
  'Deslize lateral':
    '--dur: 0.55s; --dur-side: 0.68s; --ease: cubic-bezier(0.33, 1, 0.36, 1); --c-x: -320px; --c-y: 0px; --c-s: 0.94; --s-dir: -3.2; --s-z: -120px; --s-s: 0.96; --s-delay: 0.08s;',
} as const

export type EntranceName = keyof typeof ENTRANCES

/**
 * Uma linha por variação, lida dos próprios valores acima — nada inventado.
 * Ex.: "Órbita" tem `--s-dir: -2.6` e `--s-z: -680px`, ou seja, os laterais
 * partem de muito longe e do lado oposto.
 */
export const ENTRANCE_HINTS: Record<EntranceName, string> = {
  'Surgir da barra': marcar('O centro sobe do dock; os laterais saem do meio.'),
  Cascata: marcar('Tudo desce de cima, os laterais logo depois.'),
  Órbita: marcar('Os laterais chegam de muito longe, pelo lado oposto.'),
  Materializar: marcar('Aparece no lugar, saindo do desfoque.'),
  Dobra: marcar('O centro tomba para trás e se endireita.'),
  Leque: marcar('Os painéis abrem em leque, inclinados.'),
  Elástico: marcar('Sobe do dock e passa um pouco do ponto.'),
  Implodir: marcar('Vem grande demais e encolhe até encaixar.'),
  Persiana: marcar('Abre na vertical, como uma persiana.'),
  'Tela ligando': marcar('Estala na horizontal, como uma TV antiga.'),
  'Estalo (reunir)': marcar('Os painéis se reúnem de longe, devagar e desfocados.'),
  Enxame: marcar('Chegam espalhados, de cima e de longe.'),
  'Deslize lateral': marcar('Tudo desliza da esquerda.'),
}

export const ENTRANCE_NAMES = Object.keys(ENTRANCES) as EntranceName[]

export const DEFAULT_ENTRANCE: EntranceName = 'Surgir da barra'

/** Tempos de uma variação, para mostrar em Configurações. */
export function entranceTiming(name: EntranceName) {
  const vars = entranceVars(name)
  return {
    centro: vars['--dur'] ?? '0.58s',
    laterais: vars['--dur-side'] ?? '0.66s',
    atraso: vars['--s-delay'] ?? '0.16s',
  }
}

/** Converte a string do handoff no objeto de custom properties do React. */
export function entranceVars(name: EntranceName): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const decl of ENTRANCES[name].split(';')) {
    const i = decl.indexOf(':')
    if (i === -1) continue
    const prop = decl.slice(0, i).trim()
    if (!prop.startsWith('--')) continue
    vars[prop] = decl.slice(i + 1).trim()
  }
  return vars
}
