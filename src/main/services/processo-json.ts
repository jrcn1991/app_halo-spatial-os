import { spawn } from 'node:child_process'

/**
 * Roda um programa de fora que responde com UMA linha JSON no stdout — o
 * `cyberkde`, pelo contrato para programas combinado com o projeto dele — e
 * devolve o código de saída e essa linha.
 *
 * `spawn`, e não `execFile`, por duas coisas que o contrato pede:
 *
 * - o stdin nasce FECHADO (`/dev/null`): o contrato é para quem não tem
 *   terminal, e um `sudo` que sobrasse no caminho esperaria senha para sempre
 *   num pipe aberto;
 * - grupo de processos próprio (`detached`): com o prazo estourado, o SIGTERM
 *   vai ao GRUPO (`kill(-pid)`) e os filhos morrem junto. Mandado só ao
 *   script, ele esperaria o filho em curso terminar — medido pelo CyberKDE:
 *   até ~15 s com um gerador do tema rodando. E o tipo do `execFile` nem
 *   aceita `detached`.
 *
 * O stderr é lido ENQUANTO o processo roda, linha a linha: é por ali que o
 * progresso do CyberKDE chega. Prazo estourado volta com o código -1.
 *
 * O `stdout` cru volta junto com o JSON como rede: o contrato promete uma
 * linha JSON, mas quando o programa falha ANTES de montá-la (uso errado, por
 * exemplo) a frase que a tela precisa mostrar está no texto solto.
 */
export function rodarComJson<T>(
  caminho: string,
  args: string[],
  opcoes: {
    prazo: number
    env?: Record<string, string>
    aoLerLinha?: ((linha: string) => void) | undefined
  },
): Promise<{ codigo: number; json: T | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const filho = spawn(caminho, args, {
      env: { ...process.env, ...opcoes.env },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let resto = ''
    let estourou = false
    const relogio = setTimeout(() => {
      estourou = true
      try {
        if (filho.pid) process.kill(-filho.pid, 'SIGTERM')
      } catch {
        // Já tinha saído entre o prazo e o sinal.
      }
    }, opcoes.prazo)

    filho.stdout.on('data', (pedaco: Buffer) => {
      stdout += pedaco.toString()
    })
    filho.stderr.on('data', (pedaco: Buffer) => {
      const texto = pedaco.toString()
      stderr += texto
      if (!opcoes.aoLerLinha) return
      const linhas = (resto + texto).split('\n')
      resto = linhas.pop() ?? ''
      for (const linha of linhas) opcoes.aoLerLinha(linha)
    })
    // Sem o arquivo, ou sem permissão de execução: `error`, e às vezes
    // `close` depois. O primeiro `resolve` vale; o segundo não faz nada.
    filho.on('error', (erro) => {
      clearTimeout(relogio)
      resolve({ codigo: 1, json: null, stdout: '', stderr: erro.message })
    })
    filho.on('close', (codigo) => {
      clearTimeout(relogio)
      if (estourou) {
        resolve({ codigo: -1, json: null, stdout, stderr: 'não terminou a tempo' })
        return
      }
      resolve({ codigo: codigo ?? 1, json: ler<T>(stdout), stdout, stderr })
    })
  })
}

/** A última linha que for JSON — o contrato diz que é uma só, mas nada custa ser robusto. */
function ler<T>(stdout: string): T | null {
  const linhas = stdout.trim().split('\n').reverse()
  for (const linha of linhas) {
    try {
      const valor: unknown = JSON.parse(linha)
      if (valor && typeof valor === 'object') return valor as T
    } catch {
      // Não era JSON: a próxima linha pode ser.
    }
  }
  return null
}
