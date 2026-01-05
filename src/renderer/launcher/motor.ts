import type { DesktopApp } from '@shared/apps'
import type { IslandClip, IslandWindow } from '@shared/island'
import type { RecenteDoLancador } from '@shared/settings'
import { type Achado, atalhoDoTexto, contaDoTexto, emojisDoTexto } from '../island/lancador'

/**
 * O MOTOR do lançador — um só, com duas carcaças.
 *
 * A ilha tem o lançador dela (visual da ilha) e a janela de Meta+V tem o dela
 * (visual do tema do app). Os dois digitam no mesmo lugar: aqui. Entra o texto
 * e o que há para procurar; sai o que cada carcaça desenha. Nada aqui fala com
 * o main nem sabe de janela — é função pura, testável em qualquer página.
 *
 * O desenho é o do Raycast e do Vicinae: um campo basta. Conta, conversão,
 * atalho de busca e emoji vêm de `lancador.ts`; comandos da ilha, aplicativos,
 * cópias e janelas vêm das fontes que a carcaça passa.
 */

/** Sem acentos e em minúsculas, para "cafeina" casar com "Cafeína". */
export const simples = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** Uma pergunta ao Claude da ilha, como a ação `claude-perguntar` a recebe. */
export const perguntaJson = (texto: string, contexto?: string, anexo?: string) =>
  JSON.stringify({ texto, ...(contexto ? { contexto } : {}), ...(anexo ? { anexo } : {}) })

export type Comando = { id: string; nome: string; chaves: string; icone: string; arg?: string }

export const COMANDOS: Comando[] = [
  { id: 'cafeina-alternar', nome: 'Cafeína', chaves: 'acordada tela dormir', icone: 'Coffee' },
  {
    id: 'silencio-alternar',
    nome: 'Não perturbe',
    chaves: 'silencio notificacoes dnd',
    icone: 'BellSlash',
  },
  { id: 'volume-mudo', nome: 'Mudo', chaves: 'som volume mute', icone: 'SpeakerSlash' },
  {
    id: 'mic-mudo-alternar',
    nome: 'Silenciar o microfone',
    chaves: 'mic',
    icone: 'MicrophoneSlash',
  },
  { id: 'kde-bloquear', nome: 'Bloquear a tela', chaves: 'lock trancar', icone: 'Lock' },
  {
    id: 'kde-captura',
    nome: 'Capturar a tela',
    chaves: 'screenshot print spectacle',
    icone: 'Camera',
  },
  { id: 'texto-da-tela', nome: 'Ler texto da tela (OCR)', chaves: 'ocr copiar', icone: 'TextAa' },
  {
    id: 'cor-capturar',
    nome: 'Conta-gotas',
    chaves: 'cor pipeta hex eyedropper',
    icone: 'Eyedropper',
  },
  {
    id: 'kde-mostrar-desktop',
    nome: 'Mostrar a área de trabalho',
    chaves: 'desktop',
    icone: 'Desktop',
  },
  {
    id: 'janela-guardar',
    nome: 'Guardar a janela ativa',
    chaves: 'gaveta minimizar',
    icone: 'Tray',
  },
  { id: 'timer-cronometro', nome: 'Cronômetro', chaves: 'stopwatch', icone: 'Hourglass' },
  { id: 'timer-parar', nome: 'Parar o temporizador', chaves: 'timer', icone: 'Stop' },
  { id: 'wifi-alternar', nome: 'Wi-Fi', chaves: 'rede', icone: 'WifiHigh' },
  { id: 'bluetooth-alternar', nome: 'Bluetooth', chaves: '', icone: 'Bluetooth' },
  {
    id: 'audio-trocar-saida',
    nome: 'Trocar a saída de áudio',
    chaves: 'fone hdmi',
    icone: 'ArrowsLeftRight',
  },
  {
    id: 'celular-tocar',
    nome: 'Fazer o celular tocar',
    chaves: 'telefone achar',
    icone: 'Vibrate',
  },
  { id: 'midia-alternar', nome: 'Tocar ou pausar', chaves: 'play pause musica', icone: 'Play' },
  { id: 'midia-proxima', nome: 'Próxima faixa', chaves: 'next musica', icone: 'SkipForward' },
]

/** "25", "timer 15 foco", "cafeína 60": números viram temporizador ou cafeína por tempo. */
export function comandosDoTexto(termo: string): Comando[] {
  const t = simples(termo)
  /*
   * O temporizador exige a PALAVRA ou a unidade — não basta um número.
   *
   * O padrão antigo era `(?:timer|temporizador|foco)?\s*(\d+)…` com tudo
   * opcional, então qualquer coisa que começasse com número virava um
   * temporizador. Isso passava despercebido enquanto o campo só conhecia
   * aplicativo e comando; com a calculadora ali do lado ficou gritante —
   * "15% de 240" oferecia "Temporizador de 15 min · % de 240" logo abaixo da
   * resposta certa. E o rótulo não pode conter operador, senão "2+2" pediria
   * um timer de 2 minutos chamado "+2".
   */
  const timer =
    /^(?:(?:timer|temporizador|foco)\s*(\d{1,3})|(\d{1,3})\s*(?:min|m)\b)\s*([^\d+\-*/%^]*)$/.exec(
      t,
    )
  const lista: Comando[] = []
  if (timer && Number(timer[1] ?? timer[2]) > 0) {
    const min = Number(timer[1] ?? timer[2])
    const rotulo = (timer[3] ?? '').trim()
    lista.push({
      id: 'timer-iniciar',
      nome: `Temporizador de ${min} min${rotulo ? ` · ${rotulo}` : ''}`,
      chaves: '',
      icone: 'Timer',
      arg: `${min} ${rotulo}`.trim(),
    })
  }
  const cafe = /^cafe(?:ina)?\s+(\d{1,3})\s*(?:min|m)?$/.exec(t)
  if (cafe) {
    lista.push({
      id: 'cafeina-alternar',
      nome: `Cafeína por ${cafe[1]} min`,
      chaves: '',
      icone: 'Coffee',
      arg: cafe[1] ?? '',
    })
  }
  return lista
}

/** O que há para procurar. Cada carcaça passa o que tem; o resto fica vazio. */
export type Fontes = {
  apps: DesktopApp[] | null
  clips?: IslandClip[]
  janelas?: IslandWindow[]
  /** O que já foi executado: sobe na lista (ver `pontuacao`). */
  recentes?: RecenteDoLancador[]
}

/**
 * Frequência com recência — a ideia do "frecency" do Firefox e do Raycast.
 *
 * Só contar usos deixaria para sempre no topo o que foi usado dez vezes há um
 * mês; só a recência esqueceria o que se usa todo dia. A pontuação é `n`
 * decaindo pela meia-vida de uma semana: um uso de hoje vale 1, um de sete
 * dias atrás vale 0,5, e dez usos de um mês atrás valem ~0,6 — menos que dois
 * de hoje. Números escolhidos por parecerem justos na conta, não medidos.
 */
const MEIA_VIDA_MS = 7 * 24 * 60 * 60 * 1000
export function pontuacao(r: RecenteDoLancador, agora = Date.now()): number {
  const idade = Math.max(0, agora - r.at)
  return r.n * 2 ** (-idade / MEIA_VIDA_MS)
}

/** A chave de um item, como `RecenteDoLancador.chave` a guarda. */
export const chaveDeUso = (tipo: RecenteDoLancador['tipo'], id: string, arg?: string) =>
  `${tipo}:${id}${arg ? `:${arg}` : ''}`

/** Ordena por pontuação de uso, mantendo a ordem original entre os sem uso. */
function porUso<T>(lista: T[], chave: (item: T) => string, recentes: RecenteDoLancador[]): T[] {
  if (recentes.length === 0) return lista
  const agora = Date.now()
  const pontos = new Map(recentes.map((r) => [r.chave, pontuacao(r, agora)]))
  return lista
    .map((item, i) => ({ item, i, p: pontos.get(chave(item)) ?? 0 }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map((x) => x.item)
}

/**
 * Os recentes que valem mostrar com o campo vazio: os mais pontuados entre
 * apps e comandos. Cópias e janelas ficam de fora — são voláteis, e um
 * recente que aponta para uma janela fechada seria um botão que não faz nada.
 */
export function recentesParaMostrar(
  recentes: RecenteDoLancador[],
  maximo = 8,
): RecenteDoLancador[] {
  const agora = Date.now()
  return recentes
    .filter((r) => r.tipo === 'app' || r.tipo === 'comando')
    .sort((a, b) => pontuacao(b, agora) - pontuacao(a, agora))
    .slice(0, maximo)
}

export type Resultado = {
  /** O texto normalizado — vazio quando não há o que procurar. */
  chave: string
  /** O que o campo responde sozinho: conta, conversão, atalho, emoji. */
  respostas: Achado[]
  /** O que a ilha sabe fazer, e a pergunta ao Claude. */
  comandos: Comando[]
  apps: DesktopApp[]
  clips: IslandClip[]
  janelas: IslandWindow[]
}

const LIMITES = { comandos: 4, apps: 6, clips: 4, janelas: 4 }

/** Resolve um texto contra as fontes. A ordem das seções é a que a tela desenha. */
export function resolver(termo: string, fontes: Fontes): Resultado {
  const texto = termo.trim()
  const chave = simples(texto)
  const vazio: Resultado = { chave, respostas: [], comandos: [], apps: [], clips: [], janelas: [] }
  if (!chave) return vazio

  // "? como faço…" vai para o Claude da ilha, e só para ele.
  if (texto.startsWith('?')) {
    const pergunta = texto.slice(1).trim()
    return {
      ...vazio,
      comandos: pergunta
        ? [
            {
              id: 'claude-perguntar',
              nome: `Perguntar ao Claude: ${pergunta}`,
              chaves: '',
              icone: 'Sparkle',
              arg: perguntaJson(pergunta),
            },
          ]
        : [],
    }
  }

  const conta = contaDoTexto(texto)
  const atalho = atalhoDoTexto(texto)
  const respostas = [conta, atalho, ...emojisDoTexto(texto)].filter((x): x is Achado => x !== null)
  const recentes = fontes.recentes ?? []
  const comandos = porUso(
    [
      ...comandosDoTexto(texto),
      ...COMANDOS.filter((c) => simples(`${c.nome} ${c.chaves}`).includes(chave)),
    ],
    (c) => chaveDeUso('comando', c.id, c.arg),
    recentes,
  ).slice(0, LIMITES.comandos)
  const apps = porUso(
    (fontes.apps ?? []).filter((a) => simples(a.name).includes(chave)),
    (a) => chaveDeUso('app', a.id),
    recentes,
  ).slice(0, LIMITES.apps)
  const clips = (fontes.clips ?? [])
    .filter((c) => simples(c.preview).includes(chave))
    .slice(0, LIMITES.clips)
  const janelas = (fontes.janelas ?? [])
    .filter((j) => simples(`${j.title} ${j.appClass}`).includes(chave))
    .slice(0, LIMITES.janelas)

  return { chave, respostas, comandos, apps, clips, janelas }
}
