import { type ChildProcess, spawn } from 'node:child_process'
import { IPC } from '@shared/ipc-contract'
import { broadcastToIslands, islandWindows } from './window'

/**
 * O espectro de áudio de verdade.
 *
 * As cinco barras da onda dançavam sozinhas (uma animação CSS). O "Live
 * audio spectrum" do Notchy faz o que o nome diz: as barras seguem a música.
 * Aqui o main ouve o MONITOR da saída padrão pelo `parec` (o mesmo caminho
 * que um gravador de "o que está tocando" usa), em mono a 8 kHz — 16 kB/s,
 * nada — e mede a energia em cinco faixas com Goertzel sobre os últimos 256
 * amostras. Os níveis viajam para as ilhas ~15 vezes por segundo.
 *
 * Só roda enquanto há ilha, a opção está ligada E algo está tocando: o pulso
 * do instantâneo avisa quando a mídia começa e para. Parado, o processo
 * morre e as barras voltam à animação.
 *
 * `@DEFAULT_MONITOR@` segue a saída padrão sozinho — trocar de fones para
 * HDMI não exige reiniciar o `parec` (medido em 02/09/2026 no PipeWire).
 */

const TAXA = 8000
const JANELA = 256
const RITMO_MS = 66
/** Centros das faixas (Hz), do grave ao agudo, dentro dos 4 kHz de Nyquist. */
const FAIXAS = [70, 200, 500, 1200, 3000]

let processo: ChildProcess | null = null
let ligado = false
let tocando = false
let amostras = new Int16Array(0)
let relogio: ReturnType<typeof setInterval> | undefined
/**
 * O teto de cada faixa: sobe na hora ao que a faixa tem, e decai devagar —
 * um controle automático de ganho por faixa. Nasce no piso, não em 1:
 * medido em 02/09/2026, com o teto em 1 as faixas fracas levavam ~20 s
 * decaindo até aparecerem, e só o grave mexia.
 */
const PISO = 0.002
const DECAIMENTO = 0.98
const tetos = FAIXAS.map(() => PISO)

function goertzel(freq: number, dados: Int16Array): number {
  const k = Math.round((JANELA * freq) / TAXA)
  const w = (2 * Math.PI * k) / JANELA
  const coef = 2 * Math.cos(w)
  let s0 = 0
  let s1 = 0
  let s2 = 0
  const inicio = dados.length - JANELA
  for (let i = inicio; i < dados.length; i += 1) {
    // Janela de Hann: sem ela as barras vazam energia entre faixas.
    const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - inicio)) / (JANELA - 1))
    s0 = h * ((dados[i] ?? 0) / 32768) + coef * s1 - s2
    s2 = s1
    s1 = s0
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coef * s1 * s2)) / (JANELA / 2)
}

function medir(): void {
  if (amostras.length < JANELA) return
  const niveis = FAIXAS.map((f, n) => {
    const energia = goertzel(f, amostras)
    const teto = Math.max(energia, (tetos[n] ?? PISO) * DECAIMENTO, PISO)
    tetos[n] = teto
    // Raiz para as barras baixas ainda mexerem; piso de 0,08 para não sumirem.
    return Math.max(0.08, Math.min(1, Math.sqrt(energia / teto)))
  })
  broadcastToIslands(IPC.islandEspectro, niveis)
}

function subir(): void {
  if (processo) return
  tetos.fill(PISO)
  const proc = spawn(
    'parec',
    [
      '--raw',
      `--format=s16le`,
      `--rate=${TAXA}`,
      '--channels=1',
      '--latency-msec=40',
      '-d',
      '@DEFAULT_MONITOR@',
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  )
  processo = proc
  proc.stdout?.on('data', (pedaco: Buffer) => {
    const novas = new Int16Array(pedaco.buffer, pedaco.byteOffset, Math.floor(pedaco.length / 2))
    const junto = new Int16Array(Math.min(amostras.length + novas.length, JANELA * 4))
    const cabe = junto.length - novas.length
    if (cabe > 0) junto.set(amostras.subarray(amostras.length - cabe), 0)
    junto.set(novas.subarray(Math.max(0, novas.length - junto.length)), Math.max(0, cabe))
    amostras = junto
  })
  const encerrou = () => {
    if (processo === proc) processo = null
  }
  proc.on('exit', encerrou)
  proc.on('error', encerrou)
  relogio = setInterval(medir, RITMO_MS)
}

function descer(): void {
  clearInterval(relogio)
  relogio = undefined
  processo?.kill()
  processo = null
  amostras = new Int16Array(0)
  // Barras de volta ao repouso na hora, não no próximo pulso.
  broadcastToIslands(IPC.islandEspectro, [])
}

function conciliar(): void {
  if (ligado && tocando && islandWindows().length > 0) subir()
  else descer()
}

/** A opção de Configurações. */
export function aplicarEspectro(on: boolean): void {
  ligado = on
  conciliar()
}

/** O pulso disse se há mídia tocando. */
export function espectroTocando(sim: boolean): void {
  if (tocando === sim) return
  tocando = sim
  conciliar()
}

export function pararEspectro(): void {
  tocando = false
  descer()
}

/** Para a leitura do catálogo dizer a verdade. */
export const espectroEstado = () => ({
  ligado,
  ouvindo: processo !== null && processo.exitCode === null,
})
