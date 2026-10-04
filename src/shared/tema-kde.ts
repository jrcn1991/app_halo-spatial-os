/**
 * A integração com o CyberKDE, o tema do KDE do usuário — OPCIONAL.
 *
 * Pedido do usuário (29/09/2026), depois de os dois projetos terem ficado
 * independentes em 24/09: um interruptor em Configurações → Integrações →
 * Tema que, ligado, faz a troca de ambiente pedir ao CyberKDE que se aplique
 * (se ainda não estiver) e que troque a cor de destaque para a cor daquele
 * ambiente. Desligado — o padrão —, o Halo não chama o tema nunca.
 *
 * O Halo não pinta o KDE: quem recolore é o próprio `cyberkde`, pelo contrato
 * para programas que o projeto dele mantém (`cyberkde status|on|cor --json`).
 * Ver `src/main/services/tema-kde.ts`.
 */

import type { EnvironmentId } from './environments'

export type TemaKdeSettings = {
  /** Desligado por padrão: só quem tem o CyberKDE liga. */
  on: boolean
  /**
   * A cor de cada ambiente, quando o usuário escolheu uma. Ausente = a de
   * `CORES_PADRAO` — mesma regra do resto das configurações.
   */
  cores: Partial<Record<EnvironmentId, string>>
}

/**
 * A cor de cada ambiente quando ninguém escolheu. Pedido do usuário:
 * "Floresta é verde, City Pop é azul", e o Cyberpunk é o vermelho do próprio
 * CyberKDE. Os valores são dados que atravessam para outro programa (linha de
 * comando), não estilo do app — por isso moram aqui, e não em `styles/`.
 *
 * Escolhidos com o agente do CyberKDE (29/09/2026), com o contraste MEDIDO
 * contra a superfície do tema (`#1F1F2E`), mínimo 4,5:1 — abaixo disso o
 * tema clareia a cor sozinho, e ela chegaria diferente da escolhida.
 */
export const CORES_PADRAO: Partial<Record<EnvironmentId, string>> = {
  /** Verde, 10,4:1. */
  floresta: '#1DED83',
  /** Azul, 5,9:1. O azul do token do City Pop (`#2570D4`) daria 3,4:1. */
  citypop: '#3AA0FF',
  /** O vermelho de fábrica do CyberKDE — vai como `padrao` (ver `COR_DE_FABRICA`). */
  cyberpunk: '#F75049',
  /** Dourado, 8,8:1. */
  bioshock: '#F0B537',
}

/** A cor de fábrica do CyberKDE: pedi-la é pedir `cyberkde cor padrao`. */
export const COR_DE_FABRICA = '#F75049'

/** `#RRGGBB`. O `cyberkde` tolera sem o `#`; aqui só entra a forma completa. */
export function ehCorHex(valor: unknown): valor is string {
  return typeof valor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(valor)
}

/** A cor que vale para um ambiente: a escolhida, ou a padrão. `??`, nunca `||`. */
export function corDoAmbiente(cfg: TemaKdeSettings, id: EnvironmentId): string | undefined {
  return cfg.cores[id] ?? CORES_PADRAO[id]
}

/** O que a seção mostra: o que o tema diz de si e o que o Halo está fazendo. */
export type EstadoDoTemaKde = {
  /** O `cyberkde` existe nesta máquina. */
  instalado: boolean
  /** `status --json`: o tema está aplicado. `null` = não deu para ler. */
  ligado: boolean | null
  /** A cor PEDIDA em uso no tema, como ele a guarda. */
  cor: string | null
  /**
   * A cor que o tema USA: igual à pedida, ou mais clara quando a pedida não
   * teria contraste sobre o fundo dele. É a que a tela mostra como aplicada.
   */
  corAplicada: string | null
  /** Uma aplicação em curso, com o progresso que o tema anuncia. */
  emCurso: { ambiente: EnvironmentId; etapa: string; feitas: number; total: number } | null
  /** Como terminou a última aplicação pedida pelo Halo nesta sessão. */
  ultima: {
    ambiente: EnvironmentId
    resultado: ResultadoDoTemaKde
    /** A frase do tema quando falhou (o `erro` do JSON, ou o stderr). */
    detalhe: string
    /** Frases prontas do tema sobre o que ficou pendente (ex.: tela de login). */
    avisos: string[]
  } | null
}

/**
 * Como uma aplicação terminou. Código, e não frase: a frase é da tela, que
 * sabe o idioma. Mapeia os códigos de saída do contrato (0 aplicado · 1 falha
 * · 2 inválida · 3 ocupado · 4 pendência de sudo · 5 interrompido), mais os
 * casos que o Halo decide sozinho.
 */
export type ResultadoDoTemaKde =
  | 'aplicado'
  | 'aplicado-pendente'
  | 'ja-estava'
  | 'ausente'
  | 'ocupado'
  | 'prazo'
  | 'falha'
