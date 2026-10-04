import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import type { EnvironmentId } from '@shared/environments'
import { COR_DE_FABRICA, type EstadoDoTemaKde, type ResultadoDoTemaKde } from '@shared/tema-kde'
import { rodarComJson } from './processo-json'

/**
 * O ambiente pede ao CyberKDE que se aplique e troque de cor.
 *
 * EXCEÇÃO AUTORIZADA à regra "nunca escrever fora do app para conseguir um
 * efeito de sistema" (CLAUDE.md § Janela e camada), a quinta. O usuário pediu
 * (29/09/2026) uma integração OPCIONAL com o tema do KDE dele: com o
 * interruptor de Configurações → Integrações → Tema ligado, trocar de ambiente
 * liga o CyberKDE (se ainda não estiver) e troca a cor de destaque para a cor
 * do ambiente. Desligado — o padrão —, nada daqui roda.
 *
 * O Halo não escreve nada do tema: só executa o `cyberkde`, e é o script dele
 * que regenera e reaplica os arquivos, com o registro de reversão que ele
 * mantém (`cyberkde off` desfaz tudo). O contrato para programas é do projeto
 * CyberKDE e foi combinado com o agente de lá:
 *
 * - `cyberkde status --json` — uma linha: `ligado`, `cor`, `completa`…
 * - `cyberkde cor '#RRGGBB'|padrao --sem-sudo --json --progresso` — troca a
 *   cor; com o tema desligado ela só é GUARDADA, sem regenerar nada;
 * - `cyberkde on --sem-sudo --json --progresso` — aplica tudo, já com a cor
 *   guardada;
 * - stdout é UMA linha JSON; no stderr, `PROGRESSO {json}` por etapa;
 * - códigos: 0 aplicado · 1 falha · 2 inválido · 3 ocupado · 4 aplicado com
 *   pendência de sudo (só a tela de login, que mora em /usr) · 5 interrompido.
 *
 * Por isso a ordem é COR e depois ON quando o tema está desligado: ligar
 * primeiro geraria o tema inteiro na cor velha para regenerá-lo logo em
 * seguida na nova.
 *
 * Uma aplicação por vez, e o último pedido vence: quem troca de ambiente três
 * vezes seguidas quer o terceiro, e os dois do meio seriam trabalho jogado
 * fora (o tema reinicia o painel do Plasma no fim de cada um).
 */

/** O `cor` regenera ícones e reinicia o painel; o `on` aplica tudo. Folga larga. */
const PRAZO_COR_MS = 180_000
const PRAZO_ON_MS = 300_000
const PRAZO_LER_MS = 5_000
/**
 * O `status` é um processo externo, e a seção de Configurações pergunta o
 * estado a cada poucos segundos enquanto está aberta — então ele entra com
 * prazo de validade, como tudo que sai para fora (CLAUDE.md § Processo
 * externo). Uma aplicação que termina o esquece.
 */
const VALIDADE_STATUS_MS = 10_000

type Status = {
  ligado?: boolean
  /** A cor PEDIDA — é esta que se compara, não a `corAplicada` (que o tema clareia). */
  cor?: string
  corAplicada?: string
  completa?: boolean
  erro?: string
}

type RespostaDaCor = {
  cor?: string
  avisos?: string[]
  pendentesSudo?: string[]
  erro?: string
}

/**
 * Onde está o `cyberkde`. O `instalar.sh` dele põe um link em `~/.local/bin`,
 * e o app aberto pelo menu não herda o PATH do shell — o mesmo caso do
 * `claude` (ver `acharClaude`).
 */
export function acharCyberkde(): string | null {
  const pastas = [
    ...(process.env.PATH ?? '').split(delimiter).filter(Boolean),
    join(homedir(), '.local/bin'),
  ]
  for (const pasta of pastas) {
    const caminho = join(pasta, 'cyberkde')
    if (existsSync(caminho)) return caminho
  }
  return null
}

let pendente: { ambiente: EnvironmentId; cor: string } | null = null
let rodando = false
let emCurso: EstadoDoTemaKde['emCurso'] = null
let ultima: EstadoDoTemaKde['ultima'] = null
let lido: { quando: number; status: Status | null } | null = null

/** Pede a cor de um ambiente. Se já há uma em curso, esta espera — e substitui a que esperava. */
export function pedirTemaKde(ambiente: EnvironmentId, cor: string): void {
  pendente = { ambiente, cor }
  if (!rodando) void esvaziar()
}

async function esvaziar(): Promise<void> {
  rodando = true
  try {
    while (pendente) {
      const pedido = pendente
      pendente = null
      await aplicar(pedido.ambiente, pedido.cor)
    }
  } finally {
    rodando = false
    emCurso = null
    lido = null
  }
}

async function aplicar(ambiente: EnvironmentId, cor: string): Promise<void> {
  const terminar = (resultado: ResultadoDoTemaKde, detalhe = '', avisos: string[] = []) => {
    ultima = { ambiente, resultado, detalhe, avisos }
  }
  const caminho = acharCyberkde()
  if (!caminho) return terminar('ausente')

  emCurso = { ambiente, etapa: 'status', feitas: 0, total: 0 }
  // Leitura fresca: decidir "já estava" por uma leitura velha pularia a troca.
  lido = null
  const status = await lerStatus(caminho)
  const mesmaCor = status?.cor?.toUpperCase() === cor.toUpperCase()
  if (status?.ligado && status.completa !== false && mesmaCor) return terminar('ja-estava')

  const aoLerLinha = (linha: string) => {
    if (!linha.startsWith('PROGRESSO ')) return
    try {
      const p = JSON.parse(linha.slice('PROGRESSO '.length)) as {
        etapa?: string
        fase?: string
        item?: string
        feitas?: number
        total?: number
      }
      emCurso = {
        ambiente,
        etapa: [p.etapa, p.fase ?? p.item].filter(Boolean).join(':'),
        feitas: p.feitas ?? 0,
        total: p.total ?? 0,
      }
    } catch {
      // Linha de progresso quebrada: a barra só não anda desta vez.
    }
  }

  // A cor de fábrica vai como `padrao`: devolve o tema ao estado original em
  // vez de gravar por cima uma cor que já é a dele.
  const alvo = cor.toUpperCase() === COR_DE_FABRICA ? 'padrao' : cor
  const r = await rodarComJson<RespostaDaCor>(
    caminho,
    ['cor', alvo, '--sem-sudo', '--json', '--progresso'],
    { prazo: PRAZO_COR_MS, env: { CYBERKDE_SEM_SUDO: '1' }, aoLerLinha },
  )
  if (r.codigo !== 0 && r.codigo !== 4) return terminar(resultadoDe(r.codigo), detalheDe(r))
  let avisos = r.json?.avisos ?? []
  let pendenteDeSudo = r.codigo === 4

  // Desligado, o `cor` só guardou a cor: é o `on` que aplica o tema, já nela.
  if (status?.ligado !== true) {
    const on = await rodarComJson<RespostaDaCor>(
      caminho,
      ['on', '--sem-sudo', '--json', '--progresso'],
      { prazo: PRAZO_ON_MS, env: { CYBERKDE_SEM_SUDO: '1' }, aoLerLinha },
    )
    if (on.codigo !== 0 && on.codigo !== 4) return terminar(resultadoDe(on.codigo), detalheDe(on))
    avisos = [...avisos, ...(on.json?.avisos ?? [])]
    pendenteDeSudo ||= on.codigo === 4
  }
  terminar(pendenteDeSudo ? 'aplicado-pendente' : 'aplicado', '', [...new Set(avisos)])
}

function resultadoDe(codigo: number): ResultadoDoTemaKde {
  if (codigo === 3) return 'ocupado'
  if (codigo === -1) return 'prazo'
  return 'falha'
}

function detalheDe(r: { json: { erro?: string } | null; stdout: string; stderr: string }): string {
  const bruto = r.json?.erro ?? (r.stderr.trim().split('\n').pop() || r.stdout.trim())
  return bruto.slice(0, 300)
}

async function lerStatus(caminho: string): Promise<Status | null> {
  if (lido && Date.now() - lido.quando < VALIDADE_STATUS_MS) return lido.status
  const r = await rodarComJson<Status>(caminho, ['status', '--json'], { prazo: PRAZO_LER_MS })
  const status = r.codigo === 0 ? r.json : null
  lido = { quando: Date.now(), status }
  return status
}

/** O que a seção de Configurações mostra. Com uma aplicação em curso, o `status` não é lido. */
export async function estadoDoTemaKde(): Promise<EstadoDoTemaKde> {
  const caminho = acharCyberkde()
  if (!caminho)
    return {
      instalado: false,
      ligado: null,
      cor: null,
      corAplicada: null,
      emCurso: null,
      ultima,
    }
  const status = rodando ? (lido?.status ?? null) : await lerStatus(caminho)
  return {
    instalado: true,
    ligado: status?.ligado ?? null,
    cor: status?.cor ?? null,
    corAplicada: status?.corAplicada ?? null,
    emCurso,
    ultima,
  }
}
