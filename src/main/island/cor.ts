import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { t } from '@shared/i18n'

/**
 * O conta-gotas: a cor de um ponto da tela.
 *
 * O "Color Eyedropper" do Notchy. No Wayland um app não lê os pixels dos
 * outros — mas o KWin oferece um seletor próprio pelo D-Bus
 * (`org.kde.kwin.ColorPicker.pick`, o mesmo que o KColorChooser usa): o
 * cursor vira uma mira, o usuário clica, e o compositor devolve a cor como
 * um inteiro ARGB. Esc cancela, e aí o KWin responde erro — que a ilha
 * mostra como "Não deu", sem inventar cor nenhuma.
 */

const run = promisify(execFile)
/** O usuário pode demorar a mirar. */
const TIMEOUT_MS = 60_000

export async function pegarCor(): Promise<string> {
  const { stdout } = await run(
    'busctl',
    [
      '--user',
      '--json=short',
      'call',
      'org.kde.KWin',
      '/ColorPicker',
      'org.kde.kwin.ColorPicker',
      'pick',
    ],
    { timeout: TIMEOUT_MS },
  )
  // A assinatura é `(u)`: uma struct com um uint32 — o JSON vem `[[n]]`.
  const dados = (JSON.parse(stdout) as { data: unknown[] }).data.flat(2)
  const argb = Number(dados[0])
  if (!Number.isFinite(argb)) throw new Error(t('o KWin não devolveu uma cor'))
  return `#${(argb & 0xffffff).toString(16).padStart(6, '0')}`
}
