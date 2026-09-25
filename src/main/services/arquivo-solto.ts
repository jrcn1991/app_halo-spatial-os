import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, sep } from 'node:path'
import { t } from '@shared/i18n'

/**
 * A conferência de um arquivo que o RENDERER apontou para o main ler.
 *
 * Anexar ao Claude, mandar ao Seafile, mandar ao celular e ler o texto de uma
 * imagem recebem um caminho que veio da tela — quase sempre de um arrasto
 * (`files.pathOf`), então não dá para exigir que ele tenha passado por um
 * seletor de arquivo. O que dá para exigir é que seja um arquivo DE VERDADE:
 *
 * - **absoluto**: relativo seria relativo à pasta de trabalho do main, que o
 *   usuário não vê;
 * - **resolvido até o fim** (`realpath`): um link chamado `nota.txt` pode
 *   apontar para `/proc/self/environ`, e é o destino que importa;
 * - **fora de `/proc`, `/sys` e `/dev`**: ali os "arquivos" são janelas para
 *   o estado do sistema e dos processos — o ambiente do próprio main, com o
 *   que houver nele, e dispositivos que não acabam (`/dev/zero`). Eles se
 *   dizem arquivo comum de tamanho zero, e por isso passariam pelo teto;
 * - **arquivo comum e dentro do teto** de quem chama.
 *
 * Devolve o caminho resolvido — é ele que deve ser lido, para que o que foi
 * conferido seja o que é aberto.
 */
const PSEUDO = ['/proc', '/sys', '/dev'] as const

export async function arquivoSolto(
  caminho: unknown,
  teto: number,
): Promise<{ caminho: string; bytes: number }> {
  if (typeof caminho !== 'string' || !isAbsolute(caminho)) throw new Error(t('não é um arquivo'))
  const real = await realpath(caminho).catch(() => null)
  if (!real || PSEUDO.some((raiz) => real === raiz || real.startsWith(raiz + sep))) {
    throw new Error(t('não é um arquivo'))
  }
  const info = await stat(real)
  if (!info.isFile()) throw new Error(t('não é um arquivo'))
  if (info.size > teto) throw new Error(t('arquivo grande demais'))
  return { caminho: real, bytes: info.size }
}
