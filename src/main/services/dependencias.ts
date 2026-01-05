import { existsSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import { DEPENDENCIAS, type DiagnosticoDoSistema } from '@shared/dependencias'
import { acharClaude } from './agents'

/**
 * O que falta nesta máquina.
 *
 * Mesma lista que `npm run doctor` percorre (`src/shared/dependencias.ts`), só
 * que respondida para dentro do app: a tela de Configurações → Sistema mostra
 * o mesmo diagnóstico para quem não abre terminal.
 *
 * Duas decisões que valem explicação:
 *
 * 1. **Nenhum processo externo.** O `doctor` chama `which` 25 vezes porque ele
 *    roda uma vez e vai embora; aqui isso seriam 25 forks do Electron mais o
 *    programa, 4–36 ms de parede cada (MEDIDO em 05/09/2026, CLAUDE.md §
 *    "Processo externo é o custo que se vê"). Varrer o PATH com `existsSync` é
 *    exatamente o mesmo teste que o `spawn` vai fazer depois, e não sai daqui.
 * 2. **O PATH que vale é o DO APP.** Aberto pelo menu, o Electron não herda o
 *    PATH que o shell montaria, e `~/.local/bin` costuma ficar de fora.
 *    Perguntar ao shell diria "está instalado" sobre um programa que o app
 *    não consegue chamar — a resposta honesta é a que o app enxerga, que é a
 *    mesma que os serviços vão enfrentar.
 */
export function diagnosticoDoSistema(): DiagnosticoDoSistema {
  const presentes: Record<string, boolean> = {}
  for (const dep of DEPENDENCIAS) presentes[dep.id] = noCaminho(dep.id)

  // O `claude` é o único que o app procura fora do PATH: o serviço de agentes
  // olha em `~/.local/bin`, nos gerenciadores de versão do Node e no caminho
  // que o usuário apontou em Configurações → Claude. Perguntar só ao PATH
  // diria "faltando" sobre um CLI que a tela do Claude abre sem reclamar.
  const claude = acharClaude()
  presentes.claude = isAbsolute(claude) ? existsSync(claude) : noCaminho(claude)

  return {
    presentes,
    sessao: {
      tipo: process.env.XDG_SESSION_TYPE ?? 'desconhecida',
      x11: Boolean(process.env.DISPLAY),
    },
  }
}

/** Está numa das pastas do PATH? É o mesmo teste que o `spawn` fará. */
function noCaminho(binario: string): boolean {
  const pastas = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  return pastas.some((pasta) => existsSync(join(pasta, binario)))
}
