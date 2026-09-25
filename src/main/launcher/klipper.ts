import dbus from 'dbus-next'

/**
 * O Meta+V do Klipper, liberado e devolvido pelo kglobalaccel.
 *
 * É a QUARTA coisa que este app escreve fora de si (as outras três estão em
 * CLAUDE.md, "Janela e camada"), e a única que mexe num atalho de OUTRO
 * programa. O que a sustenta: a tecla abre o lançador em vez do clipboard do
 * sistema por escolha explícita (`launcher.on`), o histórico de cópias que o
 * Klipper mostraria continua acessível (a ilha e o lançador leem o mesmo
 * histórico, do próprio Klipper), e o interruptor em Configurações → Lançador
 * devolve a tecla.
 *
 * O caminho é o oficial: `org.kde.KGlobalAccel.setForeignShortcut` é o que as
 * Configurações do Sistema chamam quando alguém reatribui uma tecla de outro
 * componente. Ele muda o atalho na hora e o kglobalaccel grava em
 * `~/.config/kglobalshortcutsrc` — nenhum arquivo é editado por nós.
 *
 * MEDIDO em 05/09/2026: liberar → o KWin passa a ver Meta+V disponível;
 * devolver → a linha `show-on-mouse-pos=Meta+V,Meta+V,…` volta idêntica.
 * O identificador de dois campos (`componente, ação`) basta — os dois nomes
 * amigáveis podem ir vazios. (Pelo `dbus-send` a leitura vinha vazia: ele
 * partia o texto nas vírgulas; com um cliente D-Bus de verdade funciona.)
 */

/** `Qt::MetaModifier | Qt::Key_V`: 0x10000000 + 0x56. */
const META_V = 268435542
const ACAO = ['plasmashell', 'show-on-mouse-pos', '', '']

/** O recorte da interface `org.kde.KGlobalAccel` que usamos, tipado. */
type Acessos = {
  setForeignShortcut(acao: string[], teclas: number[]): Promise<void>
  unregister(componente: string, acao: string): Promise<boolean>
}

async function kglobalaccel() {
  const bus = dbus.sessionBus()
  const objeto = await bus.getProxyObject('org.kde.kglobalaccel', '/kglobalaccel')
  return { bus, acessos: objeto.getInterface('org.kde.KGlobalAccel') as unknown as Acessos }
}

/** O Klipper deixa de responder ao Meta+V. Idempotente. */
export async function liberarMetaV(): Promise<void> {
  const { bus, acessos } = await kglobalaccel()
  try {
    await acessos.setForeignShortcut(ACAO, [])
  } finally {
    bus.disconnect()
  }
}

/** O Klipper volta a responder ao Meta+V — o padrão dele. Idempotente. */
export async function devolverMetaV(): Promise<void> {
  const { bus, acessos } = await kglobalaccel()
  try {
    await acessos.setForeignShortcut(ACAO, [META_V])
  } finally {
    bus.disconnect()
  }
}

/**
 * Esquece uma ação que um script do KWin registrou (os atalhos da ilha e do
 * lançador): a tecla fica livre e a linha sai de `kglobalshortcutsrc` na hora.
 * Descarregar o script não basta — o kglobalaccel guarda a ação e a tecla.
 */
export async function esquecerAcaoDoKWin(acao: string): Promise<void> {
  const { bus, acessos } = await kglobalaccel()
  try {
    await acessos.unregister('kwin', acao)
  } finally {
    bus.disconnect()
  }
}
