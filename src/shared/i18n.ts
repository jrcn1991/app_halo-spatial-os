import { EN } from './i18n/en'

/**
 * O idioma da interface.
 *
 * Português é o padrão e é a LÍNGUA DO CÓDIGO: o texto que se lê na tela é
 * escrito em português no próprio componente, e é ele a chave da tradução —
 * `t('Configurações')`. O inglês mora em `shared/i18n/en/`, um arquivo por
 * área do app. Assim o código continua legível (a frase está onde ela
 * aparece), e um texto sem tradução cai no português em vez de virar uma
 * chave crua na tela.
 *
 * `npm run i18n` (dentro de `npm run check`) confere que TODA chamada `t()` com
 * texto literal tem a versão em inglês — tradução que falta vira erro, não
 * surpresa na mão de quem usa em inglês.
 *
 * O estado é do PROCESSO: o main e cada janela (app, ilha, lançador, balões)
 * guardam o seu, e o main avisa todas quando o usuário troca.
 */
export type Idioma = 'pt-BR' | 'en'
export const IDIOMAS: readonly Idioma[] = ['pt-BR', 'en']
export const IDIOMA_PADRAO: Idioma = 'pt-BR'

export const ehIdioma = (valor: unknown): valor is Idioma =>
  typeof valor === 'string' && (IDIOMAS as readonly string[]).includes(valor)

let atual: Idioma = IDIOMA_PADRAO

export function definirIdioma(idioma: Idioma): void {
  atual = idioma
}

export const idiomaAtual = (): Idioma => atual

/** O locale do `Intl` e do `toLocale…` para o idioma: datas e números seguem a língua. */
export const localeDoIdioma = (idioma: Idioma = atual): string =>
  idioma === 'en' ? 'en-US' : 'pt-BR'

/**
 * Traduz um texto escrito em português.
 *
 * `vars` preenche `{nome}` no texto — a frase inteira é a chave, com os buracos
 * no lugar, porque a ordem das palavras muda de uma língua para a outra:
 * `t('{n} títulos', { n: 12 })` → "12 titles".
 */
export function t(texto: string, vars?: Record<string, string | number>): string {
  const base = atual === 'en' ? (EN[texto] ?? texto) : texto
  if (!vars) return base
  return base.replace(/\{(\w+)\}/g, (inteiro, chave: string) =>
    chave in vars ? String(vars[chave]) : inteiro,
  )
}

/**
 * Marca um texto para tradução SEM traduzir agora — para tabelas de dados
 * (rótulos de seção, opções de um seletor) que são traduzidas na hora de
 * desenhar, com `t(rotulo)`. Não faz nada em tempo de execução; existe para o
 * `npm run i18n` achar o texto e cobrar o inglês dele.
 */
export const marcar = (texto: string): string => texto
