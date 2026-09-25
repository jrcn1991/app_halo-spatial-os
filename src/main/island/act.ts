import { homedir } from 'node:os'
import { t } from '@shared/i18n'
import { vooDaJanelaDeVerdade } from '@shared/island'
import { BrowserWindow } from 'electron'
import { seafileUpload } from '../services/seafile'
import { currentSettings, saveIslandNote } from '../settings'
import * as acoes from './actions'
import { limparAtividade } from './api'
import { alternarCafeina } from './cafeina'
import { enviarAoCelular, enviarTextoAoCelular, pingCelular, tocarCelular } from './celular'
import { aprovar, definirProjeto, encerrar, perguntar } from './claude'
import { clipCopiar, clipEscrever, clipFixar, clipLimpar, clipRemover } from './clipboard'
import { pegarCor } from './cor'
import { ejetarDisco, montarDisco } from './discos'
import { efeitoCarregado } from './efeito'
import { limparFoco } from './foco'
import { haloRecolhido, recolherHalo, trazerHalo } from './halo'
import {
  encaixarJanela,
  esconderEMinimizar,
  focarJanela,
  janelasGuardadas,
  lerJanela,
  liberarBarra,
  mostrarJanela,
  prepararVolta,
  restaurarJanela,
} from './kwin'
import { lerTextoDaImagem, lerTextoDaTela } from './ocr'
import { shelfAdd, shelfAddText, shelfClear, shelfRemove } from './shelf'
import { alternarSilencio } from './silencio'
import { startStopwatch, startTimer, stopTimer } from './timer'
import { clearNotices, removeNotice } from './watch'
import { announceToIslands, flyBackFromIslands, flyToIslands } from './window'

/**
 * Do id do catálogo para a função que faz.
 *
 * Um mapa explícito, e não um `acoes[nome]` genérico: assim só o que está aqui
 * pode ser disparado pelo renderer. Um despachante que aceitasse qualquer nome
 * viraria uma porta aberta para chamar o que não deveria.
 */
const MAPA: Record<string, (arg: string | null) => Promise<unknown>> = {
  'volume-subir': () => acoes.volumeSubir(),
  'volume-baixar': () => acoes.volumeBaixar(),
  'volume-mudo': () => acoes.volumeMudo(),
  'volume-definir': (arg) => acoes.volumeDefinir(Number(arg ?? 0)),
  'audio-trocar-saida': () => acoes.trocarSaida(),

  'midia-alternar': () => acoes.midiaAlternar(),
  'midia-proxima': () => acoes.midiaProxima(),
  'midia-anterior': () => acoes.midiaAnterior(),
  'midia-abrir': () => acoes.midiaAbrir(),
  'midia-embaralhar': () => acoes.midiaEmbaralhar(),
  'midia-repetir': () => acoes.midiaRepetir(),
  'midia-buscar': (arg) => acoes.midiaBuscar(Number(arg ?? 0)),
  'mic-mudo-alternar': () => acoes.micMudo(),
  'audio-definir-saida': (arg) => acoes.definirSaida(arg ?? ''),
  'midia-copiar-link': async () => clipEscrever(await acoes.midiaLink()),

  'wifi-alternar': () => acoes.wifiAlternar(),
  'bluetooth-alternar': () => acoes.bluetoothAlternar(),

  'kde-desktop-proxima': () => acoes.trocarAreaDeTrabalho(1),
  'kde-desktop-anterior': () => acoes.trocarAreaDeTrabalho(-1),
  'kde-mostrar-desktop': () => acoes.mostrarAreaDeTrabalho(true),
  'kde-bloquear': () => acoes.bloquearTela(),
  'kde-captura': () => acoes.capturarTela(),
  'kde-notificar': (arg) => acoes.avisar('Halo', arg ?? t('aviso da ilha')),

  // ——— Conta-gotas e OCR: o resultado vai para a área de transferência e
  // é anunciado — a amostra de cor na pílula, o tamanho do texto lido.
  'cor-capturar': async () => {
    const cor = await pegarCor()
    await clipEscrever(cor)
    announceToIslands({
      icon: 'Eyedropper',
      text: cor,
      detail: t('copiada'),
      level: 'ok',
      color: cor,
      ttlMs: 3000,
    })
  },
  'texto-da-imagem': async (arg) => copiarTextoLido(await lerTextoDaImagem(arg ?? '')),
  'texto-da-tela': async () => copiarTextoLido(await lerTextoDaTela()),

  // ——— Temporizador e notificações ——————————————————————
  // `arg` é "25" ou "25 nome do foco": os minutos primeiro, o rótulo depois.
  'timer-iniciar': async (arg) => {
    const [minutos, ...rotulo] = (arg ?? '25').trim().split(/\s+/)
    startTimer(Number(minutos), rotulo.join(' '))
  },
  'timer-cronometro': async (arg) => {
    startStopwatch(arg ?? '')
  },
  'timer-parar': async () => stopTimer(),
  'avisos-limpar': async () => clearNotices(),
  'avisos-remover': async (arg) => removeNotice(Number(arg)),
  'silencio-alternar': async () => alternarSilencio(),
  // `arg` opcional: minutos até soltar sozinha.
  'cafeina-alternar': async (arg) => alternarCafeina(arg ? Number(arg) : undefined),

  // ——— Área de transferência e nota ——————————————————
  'clip-copiar': async (arg) => clipCopiar(Number(arg)),
  'clip-fixar': async (arg) => clipFixar(Number(arg)),
  'clip-remover': async (arg) => clipRemover(Number(arg)),
  'clip-limpar': async () => clipLimpar(),
  'nota-salvar': async (arg) => saveIslandNote(arg ?? ''),

  'apps-abrir': (arg) => acoes.abrirApp(arg ?? ''),
  // O remetente de uma notificação, pelo `.desktop` que ele declarou.
  'avisos-abrir-app': (arg) =>
    acoes.abrirApp(/\.desktop$/.test(arg ?? '') ? (arg ?? '') : `${arg}.desktop`),
  'abrir-caminho': (arg) => acoes.abrirDoRenderer(arg ?? homedir()),

  // ——— A gaveta de arquivos ————————————————————————————
  'gaveta-guardar': async (arg) => shelfAdd(arg ?? ''),
  'gaveta-guardar-texto': (arg) => shelfAddText(arg ?? ''),
  'gaveta-remover': async (arg) => shelfRemove(arg ?? ''),
  'gaveta-limpar': async () => shelfClear(),
  // Arquivo só abre se estiver na gaveta: pôr lá foi a escolha do usuário.
  'gaveta-abrir': (arg) => acoes.abrirDoRenderer(arg ?? homedir(), currentSettings().island.shelf),
  'gaveta-enviar': (arg) => seafileUpload(arg ?? ''),

  // ——— O celular (KDE Connect) ——————————————————————————
  'celular-tocar': async () => {
    const c = await tocarCelular()
    announceToIslands({
      icon: 'Vibrate',
      text: t('{nome} tocando', { nome: c.name }),
      detail: '',
      level: 'ok',
    })
  },
  'celular-ping': async () => {
    await pingCelular()
  },
  'celular-enviar': async (arg) => {
    const c = await enviarAoCelular(arg ?? '')
    announceToIslands({
      icon: 'PaperPlaneTilt',
      text: t('Enviado para {nome}', { nome: c.name }),
      detail: (arg ?? '').split('/').at(-1)?.slice(0, 40) ?? '',
      level: 'ok',
      kind: 'aviso',
      ttlMs: 3500,
    })
  },
  'celular-enviar-texto': async (arg) => {
    const c = await enviarTextoAoCelular(arg ?? '')
    announceToIslands({
      icon: 'PaperPlaneTilt',
      text: t('Texto enviado para {nome}', { nome: c.name }),
      detail: '',
      level: 'ok',
    })
  },

  // ——— Discos removíveis ————————————————————————————————
  'disco-ejetar': (arg) => ejetarDisco(arg ?? ''),
  'disco-montar': (arg) => montarDisco(arg ?? ''),
  'disco-abrir': (arg) => acoes.abrirDoRenderer(arg ?? homedir()),

  // ——— Foco e API local ————————————————————————————————
  'foco-limpar': async () => limparFoco(),
  'api-atividade-limpar': async (arg) => limparAtividade(arg ?? ''),

  // ——— O Claude da ilha ————————————————————————————————
  // `arg` é a pergunta em texto, ou JSON `{texto, contexto, anexo}`.
  'claude-perguntar': (arg) => perguntar(arg ?? ''),
  'claude-aprovar': async (arg) => aprovar(arg ?? 'nao'),
  'claude-parar': async () => encerrar(),
  'claude-projeto-definir': async (arg) => definirProjeto(arg ?? ''),

  // ——— A gaveta de janelas (scripting do KWin) ——————————
  'janela-guardar': (arg) => guardarComVoo(arg),
  'janela-restaurar': (arg) => restaurarComVoo(arg ?? ''),
  'janela-focar': (arg) => focarJanela(arg ?? ''),
  // `arg` é "<id> esquerda|direita|maximizar".
  'janela-encaixar': (arg) => {
    const [id = '', lado = 'esquerda'] = (arg ?? '').split(/\s+/)
    if (lado !== 'esquerda' && lado !== 'direita' && lado !== 'maximizar') {
      throw new Error('lado desconhecido')
    }
    return encaixarJanela(id, lado)
  },

  /**
   * Traz a janela do Halo de volta à vista.
   *
   * Ela vive na camada do papel de parede (`_NET_WM_STATE_BELOW`), e isso é o
   * que o app É: um widget de área de trabalho que nunca cobre outra janela.
   * Consequência que esta ação tem de respeitar — **não existe "trazer para a
   * frente"**. `show()` numa janela que já está visível não faz nada, e era
   * exatamente isso que acontecia: o botão parecia quebrado porque pedia o
   * impossível e não dizia nada.
   *
   * O que dá para fazer, em ordem: se ela está recolhida NA ILHA, trazê-la de
   * volta (o voo, o mesmo do Meta+Espaço); se está minimizada, restaurar. Se
   * já está à vista, o anúncio diz onde ela está — a regra da ilha é que ação
   * sem efeito vira aviso, nunca silêncio.
   */
  'halo-tela': async () => {
    if (haloRecolhido()) {
      await trazerHalo()
      return
    }
    const principal = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Halo')
    if (!principal || principal.isDestroyed())
      throw new Error(t('a janela do Halo não está aberta'))
    if (principal.isMinimized()) {
      principal.restore()
      principal.show()
      return
    }
    announceToIslands({
      icon: 'Halo',
      text: t('O Halo já está à vista'),
      detail: t('ele fica na camada do papel de parede'),
      level: 'ok',
    })
  },

  /**
   * O app entra na ilha, e volta de lá. É o gesto do Meta+Space e do botão do
   * início da pílula — a mesma função, chamada dos dois lugares, para não
   * haver dois caminhos que possam divergir. Ver `island/halo.ts`.
   */
  'halo-recolher': () => recolherHalo(),
  'halo-trazer': () => trazerHalo(),
}

/** O texto lido vai para a área de transferência, e a pílula diz quanto leu. */
async function copiarTextoLido(texto: string): Promise<void> {
  await clipEscrever(texto)
  announceToIslands({
    icon: 'TextAa',
    text: t('Texto copiado'),
    detail: t('{n} caracteres · {inicio}', {
      n: texto.length,
      inicio: texto.split('\n')[0]?.slice(0, 30) ?? '',
    }),
    level: 'ok',
    kind: 'aviso',
    ttlMs: 4000,
  })
}

/**
 * Guarda a janela e a faz VOAR para a pílula — o gesto da gaveta.
 *
 * A ordem é a da revisão de movimento: lê a janela (geometria), desenha o
 * fantasma sobre ela, só ENTÃO a esconde e minimiza; aos 380ms a pílula
 * "abre a boca" com o anúncio, enquanto o fantasma ainda entra.
 */
export async function guardarComVoo(id: string | null): Promise<void> {
  const janela = await lerJanela(id)
  // Com o efeito do KWin, quem voa é a janela de verdade: a camada não
  // desenha cartão, e a ilha só fecha o painel e quica na chegada.
  // O efeito só entra na variação "Janela de verdade" (Configurações → Ilha →
  // Voo). Escolhida qualquer outra, quem voa é o cartão — inclusive aqui, na
  // gaveta: a variação vale para os dois voos, e seria estranho a janela
  // guardada se mover de um jeito e o Halo de outro.
  const efeito = efeitoCarregado() && vooDaJanelaDeVerdade(currentSettings().island.flight)
  const cartao = !efeito && currentSettings().island.flight !== 'nenhuma'
  await flyToIslands(janela, { cartao })
  await esconderEMinimizar(janela, { invisivel: !efeito })
  setTimeout(() => {
    announceToIslands({
      key: 'gaveta',
      icon: 'Tray',
      text: t('Guardada na gaveta'),
      detail: janela.title.slice(0, 40),
      level: 'ok',
      ttlMs: 2600,
    })
  }, 380)
}

/**
 * Ver `restaurarComVoo`. O YetAnotherMagicLamp anima o desminimizar em
 * ~400ms (medido em quadros): a janela fica invisível esse tanto antes do
 * voo. E a barra só volta depois do voo (520ms) e do prazo em que o YAML
 * desiste de esperar um ícone (~900ms).
 */
const YAML_MS = 450
const LIBERAR_BARRA_MS = 1100

/**
 * Devolve a janela com o voo de VOLTA: o cartão sai da pílula e cresce até o
 * lugar dela; quando chega, a janela real reaparece por baixo e o cartão
 * some. Janela que não está na gaveta (só minimizada) volta sem voo.
 */
export async function restaurarComVoo(id: string): Promise<void> {
  const janela = janelasGuardadas().find((j) => j.id === id)
  if (!janela) return restaurarJanela(id)
  if (efeitoCarregado() && vooDaJanelaDeVerdade(currentSettings().island.flight)) {
    // Com o efeito do KWin a volta é em três tempos (ver `efeito.ts`): a
    // janela é desminimizada INVISÍVEL — o efeito de minimizar do sistema
    // (YetAnotherMagicLamp) a anima no escuro em direção ao ícone antigo,
    // que era a janela vista saindo da posição dela —; passado o tempo dele, a
    // ilha quica e a opacidade vai a 1, o que dispara o voo de volta no
    // nosso efeito; e a barra só volta depois do voo e do prazo em que o
    // YAML desiste de esperar um ícone (~900ms), para ninguém disputar a
    // janela de novo.
    await prepararVolta(id)
    await new Promise((r) => setTimeout(r, YAML_MS))
    await flyBackFromIslands(janela, { cartao: false })
    await mostrarJanela(id)
    await new Promise((r) => setTimeout(r, LIBERAR_BARRA_MS))
    await liberarBarra(id)
    return
  }
  const chegou = flyBackFromIslands(janela, {
    cartao: currentSettings().island.flight !== 'nenhuma',
  })
  // Desminimiza já, invisível: o efeito de desminimizar do sistema roda
  // debaixo do voo sem aparecer. Só quando o cartão assenta a janela é
  // revelada, e a barra volta.
  await prepararVolta(id)
  await chegou
  await mostrarJanela(id)
  await liberarBarra(id)
}

/** Executa uma ação do catálogo. Id desconhecido é erro, não silêncio. */
export async function runIslandAction(id: string, arg: string | null): Promise<void> {
  const acao = MAPA[id]
  if (!acao) throw new Error(`ação desconhecida: ${id}`)
  await acao(arg)
}
