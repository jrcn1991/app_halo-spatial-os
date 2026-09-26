import { join } from 'node:path'
import { type HaloSettings, TMDB_GUARDADA } from '@shared/settings'
import { BrowserWindow, screen, shell } from 'electron'
import { travarNavegacao } from './navegacao'
import { isX11, marcarForaDaBarra, setDesktopLayer, setSkipTaskbar } from './services/desktop-layer'
import { savePosition } from './settings'

/** A janela que recebe as configurações no arranque (ver o preload). */
export const MARCA_DAS_CONFIGURACOES = '--halo-settings-ipc'

/** Palco do handoff: 1440x900 exatos. A janela nasce nesse tamanho. */
export const STAGE = { width: 1440, height: 900 } as const
const ASPECT = STAGE.width / STAGE.height

/**
 * @param semBarraDeTarefas A janela fica FORA da barra de tarefas — o que só
 * pode acontecer quando existe bandeja para trazê-la de volta (ver `tray.ts`).
 * Aplicado em `ready-to-show`, por EWMH: o `skipTaskbar` do Electron é de
 * Windows e macOS, e no Linux não faz nada (ver `setSkipTaskbar`).
 * @param recolhida A janela nasce recolhida na ilha (`desktop.startHidden`):
 * ela é criada e CARREGADA igual — o `loadFile` e o `ready-to-show` acontecem
 * do mesmo jeito —, só não é mostrada. É isso que faz o primeiro Meta+Espaço
 * abrir na hora, em vez de esperar o renderer subir. A camada do papel de
 * parede e a saída da barra de tarefas são estado de janela MAPEADA, então
 * ficam para quando ela aparecer (ver `trazerHalo`, em `island/halo.ts`).
 */
export function createMainWindow(
  settings: HaloSettings,
  semBarraDeTarefas = false,
  recolhida = false,
): BrowserWindow {
  // A janela já nasce no tamanho salvo: aplicar depois faria ela pular à vista.
  const area = screen.getPrimaryDisplay().workAreaSize
  const scale = Math.min(
    settings.appearance.scale,
    area.width / STAGE.width,
    area.height / STAGE.height,
  )

  const width = Math.round(STAGE.width * scale)
  const height = Math.round(STAGE.height * scale)
  const position = usablePosition(settings.desktop.position, width, height)

  const win = new BrowserWindow({
    width,
    height,
    // Reabre onde o usuário deixou. Sem posição salva (ou fora de alcance) o
    // Electron centraliza sozinho, que é o comportamento que já existia.
    ...(position ?? {}),
    minWidth: 960,
    minHeight: Math.round(960 / ASPECT),
    useContentSize: true,
    show: false,
    frame: false,
    // Overlay: os painéis flutuam sobre a tela real. Sem fundo próprio.
    transparent: true,
    backgroundColor: '#00000000',
    // A sombra do KWin desenharia um retângulo em volta do palco vazio.
    hasShadow: false,
    title: 'Halo',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // Entrega as configurações ao renderer de forma síncrona, antes do
      // primeiro quadro — ver `settings.initial` no preload.
      // Só uma MARCA no argv: as configurações em si vão pelo IPC síncrono
      // que o preload pede ao nascer. No argv elas ficavam em
      // `/proc/<pid>/cmdline`, legíveis por outros usuários da máquina — a nota
      // da ilha, a gaveta, os projetos, o histórico (auditoria de 26/09/2026).
      additionalArguments: [MARCA_DAS_CONFIGURACOES],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // O palco é escalado por transform; o zoom do Chromium ficaria por cima.
      zoomFactor: 1,
    },
  })

  // Mantém a proporção do palco: o <Stage> escala, a geometria nunca deforma.
  win.setAspectRatio(ASPECT)

  win.once('ready-to-show', () => {
    if (recolhida) {
      // Nascida recolhida, ela não é mostrada — e camada e barra de tarefas são
      // estado de janela MAPEADA, então ficam para quando ela aparecer (ver
      // `trazerHalo`). O que NÃO pode esperar é o registro da intenção: quem
      // tira a janela da barra na volta só age sobre quem já pediu.
      if (semBarraDeTarefas) marcarForaDaBarra(win)
      return
    }
    win.show()
    // A camada só é aceita com a janela já mapeada — antes disso o
    // gerenciador descarta o pedido (medido). Vale igual para a barra de
    // tarefas: `skipTaskbar` do Electron não existe no Linux, e quem tira a
    // janela de lá é o mesmo ClientMessage do EWMH.
    if (settings.desktop.on) void setDesktopLayer(win, true)
    if (semBarraDeTarefas) void setSkipTaskbar(win, true)
  })

  // Guarda o canto onde a janela parou.
  //
  // É `move`, não `moved`: `moved` só existe no macOS e no Windows, e no Linux
  // nunca dispara — a posição simplesmente não era salva. `move` dispara a cada
  // quadro do arrasto, e é o debounce de `savePosition` que segura a escrita.
  //
  // Só no X11: no Wayland `getBounds` devolve 0,0 e gravar isso seria pior que
  // não gravar nada.
  if (isX11()) {
    win.on('move', () => {
      const bounds = win.getBounds()
      savePosition(bounds.x, bounds.y)
    })
  }

  // Dev: servidor do electron-vite (HMR). Produção: bundle em out/renderer.
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  // Nada abre janela nova; links externos vão para o navegador do sistema.
  //
  // Só http e https. `shell.openExternal` entrega o endereço ao ambiente, e
  // ali `file:`, `smb:` ou um esquema registrado por outro programa não abrem
  // uma página: executam alguma coisa. Os endereços da Social Arte vêm de
  // metadado de página alheia — conteúdo não confiável —, e essa é a diferença
  // entre "abrir o original" e "rodar o que a página mandar".
  travarNavegacao(win.webContents, (url) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  return win
}

/**
 * As configurações que a janela recebe — sem os segredos.
 *
 * O refresh token do Spotify fica de fora por dois motivos que se somam: o
 * renderer não tem uso para ele (quem fala com o Spotify é o main) e este
 * objeto viaja como **argumento de linha de comando**, visível em
 * `/proc/<pid>/cmdline` para qualquer processo da máquina. Segredo em argv é
 * segredo publicado.
 *
 * Tirá-lo daqui é seguro porque o caminho de volta já o preserva: o renderer
 * devolve o campo vazio e `saveSettings` mantém o que está no disco (ver
 * `src/main/settings.ts`).
 */
export function paraRenderer(settings: HaloSettings): HaloSettings {
  // Todo segredo sai daqui. São três hoje — o refresh do Spotify, o token do
  // Seafile e a chave do TMDB — e a lista cresce junto com as integrações:
  // qualquer credencial nova precisa ser acrescentada aqui, ou ela vaza pelo
  // mesmo caminho. A chave do TMDB vira uma marca, e não vazio, porque a
  // tela de Configurações precisa dizer que ela existe.
  return {
    ...settings,
    media: { ...settings.media, tmdbKey: settings.media.tmdbKey ? TMDB_GUARDADA : '' },
    music: { ...settings.music, spotifyRefreshToken: '' },
    seafile: { ...settings.seafile, token: '' },
  }
}

/**
 * A posição salva, se ela ainda faz sentido nas telas de agora.
 *
 * Monitor desconectado, resolução trocada ou arranjo diferente deixariam a
 * janela fora de alcance — pior ainda sem moldura, que é o caso aqui: não
 * haveria barra de título para trazê-la de volta. Por isso a posição só vale
 * se sobrar janela suficiente dentro de alguma área útil para o usuário
 * conseguir pegá-la pelo dock.
 */
function usablePosition(
  saved: { x: number; y: number } | null,
  width: number,
  height: number,
): { x: number; y: number } | null {
  if (!saved) return null

  /** O bastante para o dock aparecer e a janela ser arrastável. */
  const VISIVEL = { width: Math.min(width, 320), height: Math.min(height, 120) }

  const cabe = screen.getAllDisplays().some(({ workArea }) => {
    const dentroX = saved.x + VISIVEL.width > workArea.x && saved.x < workArea.x + workArea.width
    const dentroY = saved.y + VISIVEL.height > workArea.y && saved.y < workArea.y + workArea.height
    return dentroX && dentroY
  })
  return cabe ? saved : null
}
