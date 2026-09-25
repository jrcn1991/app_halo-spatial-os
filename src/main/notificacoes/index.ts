import { type EnvironmentId, environmentById, environmentLabel } from '@shared/environments'
import { t } from '@shared/i18n'
import { IPC } from '@shared/ipc-contract'
import type { EstadoDosAvisos, NotificacoesSettings } from '@shared/notificacoes'
import { ipcMain } from 'electron'
import { type AreaDeVidro, kwinDesfoca } from './desfoque'
import {
  abrirJanelaDosAvisos,
  empurrarAvisos,
  envDosAvisos,
  fecharJanelaDosAvisos,
  janelaDosAvisosAberta,
  regiaoDosAvisos,
  reposicionarAvisos,
  vidroDosAvisos,
} from './janela'
import {
  agirNoAviso,
  alternarSilencioDosAvisos,
  desinibir,
  desligarServidor,
  esquecerAviso,
  estadoDoServidor,
  fecharAviso,
  inibir,
  ligarServidor,
  listaDeAvisos,
  mandarExemplo,
  naoPerturbeDoPlasma,
  silencioDosAvisos,
} from './servidor'

/**
 * As notificações do sistema no estilo do ambiente: quem decide a ORDEM.
 *
 * A ordem é o que sustenta a promessa de nunca perder um balão:
 *
 *   1. conecta ao servidor e registra o vigia (`servidor.ts`);
 *   2. cria a janela dos avisos e espera a página carregar (`janela.ts`);
 *   3. SÓ ENTÃO inibe o Plasma.
 *
 * Qualquer passo que falhe deixa os balões com o Plasma, que é onde eles
 * sempre estiveram. E o caminho de volta é imediato: desligar o interruptor,
 * o renderer da janela morrer ou o app fechar devolvem os balões ao Plasma na
 * hora — os dois primeiros por `UnInhibit`, o último porque a inibição morre
 * com a conexão.
 *
 * Isto não é uma quinta coisa escrita fora do app (CLAUDE.md § Janela e
 * camada): é conversa por D-Bus, como o MPRIS e a bandeja. Nada fica gravado
 * na configuração do Plasma, e fechar a conexão desfaz tudo.
 */

let config: NotificacoesSettings | null = null
let ambiente: EnvironmentId = 'floresta'
let janelaPronta = false
/** Por que não está desenhando, quando está ligado e não está. */
let motivo = ''
/** Uma mudança de cada vez: ligar e desligar rápido não pode cruzar os passos. */
let fila: Promise<void> = Promise.resolve()
let reabrindo: NodeJS.Timeout | undefined

const ativo = (): boolean => Boolean(config?.on) && janelaPronta && estadoDoServidor().inibido

function empurrar(): void {
  empurrarAvisos(ativo() ? listaDeAvisos() : [])
}

async function tentarInibir(): Promise<void> {
  if (!config?.on || !janelaPronta || estadoDoServidor().revogado) return
  try {
    await inibir()
    motivo = ''
  } catch (erro) {
    motivo = t('o Plasma recusou o pedido de silêncio ({motivo}); os balões continuam com ele', {
      motivo: (erro as Error).message,
    })
  }
  empurrar()
}

function aoPronta(): void {
  janelaPronta = true
  void tentarInibir()
}

/** O renderer da janela morreu: os balões voltam ao Plasma AGORA, e a janela renasce. */
function aoCair(): void {
  janelaPronta = false
  void desinibir()
  fecharJanelaDosAvisos()
  clearTimeout(reabrindo)
  reabrindo = setTimeout(() => {
    if (config?.on) void aplicarNotificacoes(config, ambiente)
  }, 1500)
}

async function aplicar(cfg: NotificacoesSettings, env: EnvironmentId): Promise<void> {
  const anterior = config
  const trocouAmbiente = env !== ambiente
  config = cfg
  ambiente = env

  if (!cfg.on) {
    clearTimeout(reabrindo)
    janelaPronta = false
    await desligarServidor()
    fecharJanelaDosAvisos()
    motivo = ''
    return
  }

  try {
    await ligarServidor(empurrar)
  } catch (erro) {
    motivo = t(
      'o servidor de notificações desta sessão não aceita vigia (só o do Plasma aceita) — os balões continuam com ele ({motivo})',
      { motivo: (erro as Error).message },
    )
    fecharJanelaDosAvisos()
    return
  }

  if (!janelaDosAvisosAberta()) {
    janelaPronta = false
    // O KWin decide se o balão pode ser vidro: sem o efeito de desfoque, um
    // balão aberto seria texto sobre texto (ver `desfoque.ts`).
    abrirJanelaDosAvisos(env, cfg.canto, await kwinDesfoca(), aoPronta, aoCair)
    return
  }
  if (anterior?.canto !== cfg.canto) reposicionarAvisos(cfg.canto)
  if (trocouAmbiente) envDosAvisos(env)
}

/** Sobe, ajusta ou desce, conforme a configuração. */
export function aplicarNotificacoes(cfg: NotificacoesSettings, env: EnvironmentId): Promise<void> {
  fila = fila
    .then(() => aplicar(cfg, env))
    .catch((erro: Error) => {
      motivo = erro.message
    })
  return fila
}

/** O app vai fechar: devolve os balões ao Plasma sem esperar a conexão cair. */
export function encerrarNotificacoes(): void {
  clearTimeout(reabrindo)
  janelaPronta = false
  fecharJanelaDosAvisos()
  void desligarServidor()
}

export function estadoDasNotificacoes(): EstadoDosAvisos {
  const servidor = estadoDoServidor()
  const ligado = Boolean(config?.on)
  const agora = ativo()
  let porque = motivo
  if (ligado && !agora && !porque) {
    porque = servidor.revogado
      ? t(
          'o "não perturbe" foi desligado pelo sino do KDE, e os balões voltaram a ser dele — desligue e ligue aqui para o Halo retomar',
        )
      : t('subindo a janela dos avisos')
  }
  return { ligado, ativo: agora, motivo: agora ? '' : porque, silencio: servidor.silencio }
}

/* ——— A ilha: o "não perturbe" dela passa por aqui ———————————————— */

/** Os balões são do Halo agora (e o silêncio da ilha tem de ser o nosso). */
export const avisosDoHalo = (): boolean => ativo()

/**
 * Silêncio que vale enquanto os balões são nossos: o da ilha, ou o do applet
 * do KDE. O `Inhibited` do servidor não serve mais para isso — ele fica
 * ligado o tempo todo, por nossa causa.
 */
export const emSilencioComAvisos = (): boolean => silencioDosAvisos() || naoPerturbeDoPlasma()

export { alternarSilencioDosAvisos, silencioDosAvisos }

/* ——— IPC ————————————————————————————————————————————————————— */

const idValido = (id: unknown): id is number => Number.isInteger(id) && (id as number) > 0

function retangulos(bruto: unknown): Electron.Rectangle[] {
  if (!Array.isArray(bruto)) return []
  return bruto
    .filter(
      (r): r is Electron.Rectangle =>
        typeof r === 'object' &&
        r !== null &&
        ['x', 'y', 'width', 'height'].every((k) =>
          Number.isFinite((r as Record<string, number>)[k]),
        ),
    )
    .slice(0, 12)
}

export function registrarIpcDasNotificacoes(): void {
  ipcMain.handle(IPC.notificacoesLista, () => (ativo() ? listaDeAvisos() : []))
  ipcMain.on(IPC.notificacoesAgir, (_e, id: unknown, chave: unknown) => {
    if (idValido(id) && typeof chave === 'string') void agirNoAviso(id, chave)
  })
  ipcMain.on(IPC.notificacoesFechar, (_e, id: unknown) => {
    if (idValido(id)) void fecharAviso(id)
  })
  ipcMain.on(IPC.notificacoesEsquecer, (_e, id: unknown) => {
    if (idValido(id)) esquecerAviso(id)
  })
  ipcMain.on(IPC.notificacoesRegiao, (_e, bruto: unknown) => regiaoDosAvisos(retangulos(bruto)))
  ipcMain.on(IPC.notificacoesDesfoque, (_e, bruto: unknown) =>
    vidroDosAvisos(
      retangulos(bruto).map(
        (r): AreaDeVidro => ({
          ...r,
          raio: Number.isFinite((r as Partial<AreaDeVidro>).raio)
            ? Math.max(0, Math.min(64, (r as AreaDeVidro).raio))
            : 0,
        }),
      ),
    ),
  )
  ipcMain.handle(IPC.notificacoesEstado, () => estadoDasNotificacoes())
  ipcMain.handle(IPC.notificacoesExemplo, () => {
    const env = environmentById(ambiente)
    return mandarExemplo(env ? environmentLabel(env) : 'Halo')
  })
}
