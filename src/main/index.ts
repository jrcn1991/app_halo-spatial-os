import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Attachment } from '@shared/agents'
import type { CreativeItem, CreativeProviderId, CreativeQuery } from '@shared/creative'
import type { EnvironmentId } from '@shared/environments'
import { definirIdioma, ehIdioma, t } from '@shared/i18n'
import type { AppInfo, DesktopModeResult, WindowSize } from '@shared/ipc-contract'
import { IPC } from '@shared/ipc-contract'
import type { IslandSettings, NoticesResult } from '@shared/island'
import type { CatalogQuery, ExtraResult } from '@shared/media'
import type { SeafileResolution } from '@shared/seafile'
import type { HaloSettings, RecenteDoLancador } from '@shared/settings'
import { alturaDaIlha } from '@shared/settings'
import type { SpotifyCommand } from '@shared/spotify'
import { app, BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain, screen } from 'electron'
import { guardarComVoo, runIslandAction } from './island/act'
import { abrir } from './island/actions'
import { listaDeAtividades, startApi, stopApi } from './island/api'
import { capturasDesde } from './island/capturas'
import { CATALOG } from './island/catalog'
import { agentesMudaram, estadoDoClaude } from './island/claude'
import { startClipboardWatch, stopClipboardWatch } from './island/clipboard'
import { instalarEfeito, removerEfeito } from './island/efeito'
import { aplicarEspectro, espectroTocando, pararEspectro } from './island/espectro'
import { alternarHalo, garantirHaloAVista, nascerRecolhido } from './island/halo'
import {
  apagarAtalhos,
  iniciarVigia,
  invalidarJanelas,
  janelasGuardadas,
  listarJanelas,
  pararVigia,
  soltarGuardadas,
} from './island/kwin'
import { shelfAdd, shelfDragStart, shelfList } from './island/shelf'
import { esquecerMemoria, islandSnapshot, setPulsoLeve } from './island/snapshot'
import { pararTeclado, vigiarTeclado } from './island/teclado'
import { bindTimer } from './island/timer'
import { applyWatchers, recentNotices, stopWatchers, watcherState } from './island/watch'
import {
  algumaIlhaAberta,
  announceToIslands,
  applyIsland,
  broadcastToIslands,
  closeIsland,
  flightReady,
  islandSettled,
  islandWindows,
  listDisplays,
  setIslandFocus,
  setIslandOpen,
  setIslandsHidden,
  setIslandTargets,
} from './island/window'
import { devolverMetaV, liberarMetaV } from './launcher/klipper'
import {
  applyLauncher,
  closeLauncher,
  hideLauncher,
  launcherMoved,
  moveLauncherBy,
  toggleLauncher,
} from './launcher/window'
import { mascotAdd, mascotAnimation, mascotInfo, mascotList, mascotPreview } from './mascot/mascot'
import {
  aplicarNotificacoes,
  encerrarNotificacoes,
  registrarIpcDasNotificacoes,
} from './notificacoes'
import {
  agentMessages,
  agentSessions,
  closeAgent,
  closeAllAgents,
  createAgent,
  listAgents,
  onAgentsChanged,
  readAttachment,
  sendToAgent,
} from './services/agents'
import { apps, launchApp } from './services/apps'
import {
  creativeConnections,
  creativePreview,
  creativeSearch,
  creativeSignIn,
  creativeSignOut,
  creativeTrending,
} from './services/creative'
import {
  anotarItem,
  apagarColecao,
  criarColecao,
  editarColecao,
  favoritarItem,
  gravarBibliotecaAgora,
  lerBiblioteca,
  moverItem,
  removerItem,
  salvarItem,
} from './services/creative/biblioteca'
import { creativeThumb } from './services/creative/capa'
import { fecharNavegador, liberarNavegadores } from './services/creative/navegador'
import { diagnosticoDoSistema } from './services/dependencias'
import { isX11, setDesktopLayer, X11_FLAG } from './services/desktop-layer'
import { containers } from './services/docker'
import { favorites, listDirectory, mounts, storage } from './services/files'
import { hostStats, iniciarHistorico, machines } from './services/host'
import { catalog, catalogStatus, categories, stream, titleDetail } from './services/media'
import { monitors } from './services/monitors'
import { restaurarPapelOriginal, temPapelOriginal } from './services/papel-original'
import { nowPlaying } from './services/player'
import {
  closePlayer,
  nowPlayingTitle,
  pinSupported,
  play,
  toggleFullscreen,
  toggleMini,
  togglePinned,
} from './services/player-window'
import { projectInfo, projects } from './services/projects'
import { headlines } from './services/rss'
import {
  onSeafileChanged,
  seafileClearDone,
  seafileLogin,
  seafileLogout,
  seafileResolve,
  seafileState,
  seafileUpload,
} from './services/seafile'
import {
  auth as spotifyAuth,
  connect as spotifyConnect,
  control as spotifyControl,
  detail as spotifyDetail,
  disconnect as spotifyDisconnect,
  library as spotifyLibrary,
  play as spotifyPlay,
  playback as spotifyPlayback,
  raise as spotifyRaise,
} from './services/spotify'
import { extra } from './services/tmdb'
import {
  applyWallpaper,
  EXTENSOES_DE_VIDEO,
  pluginDeVideoInstalado,
  wallpaperPreviews,
} from './services/wallpaper'
import {
  currentSettings,
  flushSettings,
  forgetProgress,
  gravarPadrao,
  primeiraAbertura,
  readSettings,
  saveLauncherUso,
  saveProgress,
  saveSeafileLibrary,
  saveSettings,
} from './settings'
import { bandejaDePe, criarBandeja, fecharBandeja, trazerParaAVista } from './tray'
import { currentWeather } from './weather'
import { createMainWindow, STAGE } from './window'

// Deixa o Electron usar Wayland nativo quando a sessão for Wayland; em X11
// ele cai em X11. Sem isto o app roda sempre por XWayland (escala borrada em
// telas HiDPI).
app.commandLine.appendSwitch('ozone-platform-hint', 'auto')

// O appmenu-gtk3-module (menu global, instalado no sistema) entra junto com o
// GTK no processo do Electron e, com a GLib 2.88 do Ubuntu 26.04, derruba o
// app no X11 com SIGSEGV — callback morto de g_bus_watch_name, medido em
// 31/08/2026 com um app Electron mínimo; desligar o proxy foi o único remédio
// que segurou o processo. O app não tem menu de janela, então nada se perde.
process.env.UBUNTU_MENUPROXY = '0'

/** Evita relançar em laço se a flag não pegar por algum motivo. */
const X11_TENTADO = '--halo-x11'

/**
 * Garante X11, relançando o app uma vez se preciso.
 *
 * X11 é requisito do app, não preferência: este é um overlay de área de
 * trabalho, e é só no X11 que dá para escolher a camada da janela (ficar sobre
 * o papel de parede sem cobrir nada), saber e lembrar onde ela está, e manter
 * o player por cima. No Wayland um app comum não faz nenhuma das três — o
 * Electron aceita os pedidos e o compositor ignora, em silêncio.
 *
 * A plataforma é decidida antes do primeiro JS rodar, e só o argumento de
 * linha de comando a muda — `appendSwitch('ozone-platform', …)` não muda nada,
 * isso foi medido. Por isso o caminho normal já traz a flag (ver os scripts do
 * package.json e `linux.executableArgs`), e este relançamento é a rede de
 * segurança para quando ela não vier.
 *
 * Sem servidor X à vista o app segue no Wayland: melhor rodar com menos do que
 * não abrir. `DISPLAY` é o que o XWayland publica.
 *
 * Devolve `true` quando vai relançar e o resto do arranque deve parar.
 */
function ensureX11(): boolean {
  if (isX11() || !process.env.DISPLAY || process.argv.includes(X11_TENTADO)) return false
  app.relaunch({ args: [...process.argv.slice(1), X11_FLAG, X11_TENTADO] })
  app.exit(0)
  return true
}

/** Reabre o app do zero, deixando o arranque novo decidir a plataforma. */
function relaunch(): void {
  const args = process.argv.slice(1).filter((a) => a !== X11_FLAG && a !== X11_TENTADO)
  flushSettings()
  app.relaunch({ args })
  app.exit(0)
}

/**
 * A boca do efeito do KWin espera o arrasto do slider da altura parar: cada
 * reescrita do pacote faz o compositor recompilar o efeito (DESEMPENHO.md,
 * P3-13), e ninguém guarda uma janela na ilha no meio do ajuste.
 */
const ESPERA_DA_BOCA_MS = 700
let bocaDoEfeito: NodeJS.Timeout | undefined

/**
 * As configurações sem NENHUMA das alturas da ilha — a global e a do ambiente
 * ativo. É o que faz "só a altura mudou" continuar valendo agora que ela vem
 * de dois lugares (ver `alturaDaIlha`, em `shared/settings.ts`).
 */
function semAltura(settings: HaloSettings) {
  const { id, ajustes } = settings.environment
  const doAmbiente = ajustes[id]
  return {
    ...settings,
    island: { ...settings.island, pillHeight: 0 },
    environment: doAmbiente
      ? {
          ...settings.environment,
          ajustes: { ...ajustes, [id]: { ...doAmbiente, islandHeight: 0 } },
        }
      : settings.environment,
  }
}

/**
 * O idioma mudou em Configurações: o main passa a escrever na língua nova e
 * avisa TODAS as janelas — o app já trocou sozinho; a ilha, o lançador e os
 * balões só sabem por aqui.
 */
function avisarIdioma(antes: HaloSettings, depois: unknown): void {
  const novo = (depois as Partial<HaloSettings> | null)?.language
  if (!ehIdioma(novo) || novo === antes.language) return
  definirIdioma(novo)
  // As leituras da ilha guardadas na memória estão no idioma antigo.
  esquecerMemoria()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.idiomaMudou, novo)
  }
}

function registerIpc(): void {
  ipcMain.on(IPC.windowClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.on(IPC.settingsSave, (_e, settings) => {
    const antes = currentSettings()
    avisarIdioma(antes, settings)
    saveSettings(settings)
    const depois = currentSettings()
    // O lançador segue o tema: trocar de ambiente avisa a janela (sem recriar).
    if (
      antes.launcher.on !== depois.launcher.on ||
      antes.environment.id !== depois.environment.id
    ) {
      applyLauncher(depois.launcher.on, depois.environment.id)
    }
    // Os avisos também seguem o tema, e o interruptor deles liga e desliga a
    // conversa com o Plasma — ver `notificacoes/index.ts`.
    if (
      JSON.stringify(antes.notificacoes) !== JSON.stringify(depois.notificacoes) ||
      antes.environment.id !== depois.environment.id
    ) {
      void aplicarNotificacoes(depois.notificacoes, depois.environment.id)
    }
    // A ALTURA DA PÍLULA é só CSS: ela viaja pelo canal e a gota anima até a
    // altura nova. Se ela foi a única coisa que mudou, a ilha NÃO é remontada
    // — recriar a janela a cada passo do slider fazia a pílula sumir e cair do
    // topo de novo a cada pixel, e quem arrasta o slider está olhando para ela.
    // A boca do efeito do KWin também segue a altura, mas só quando o arrasto
    // para: reescrever o pacote faz o compositor recompilar o efeito.
    //
    // A altura que vale não é mais só `island.pillHeight`: o ambiente pode ter
    // a dele (`alturaDaIlha`). Então a comparação é entre as alturas
    // RESOLVIDAS, e o "só a altura mudou" ignora também o ajuste do ambiente
    // que a produziu — senão arrastar o slider com um ambiente que tem altura
    // própria remontaria a ilha a cada pixel, que é justamente o que este
    // atalho existe para evitar.
    // São DUAS perguntas, e confundi-las custou uma medição: "mandar a altura
    // nova?" e "posso pular a remontagem?". A primeira é sim sempre que a
    // altura resolvida mudou — inclusive quando quem a mudou foi a TROCA DE
    // AMBIENTE. MEDIDO em 20/09/2026: a ilha ficou nos 36 px do City Pop
    // depois de trocar para a Floresta, porque a troca muda o `environment.id`
    // junto e o "só a altura" dava falso.
    const alturaAntes = alturaDaIlha(antes)
    const alturaDepois = alturaDaIlha(depois)
    const alturaMudou = alturaAntes !== alturaDepois
    const soAAltura =
      alturaMudou && JSON.stringify(semAltura(antes)) === JSON.stringify(semAltura(depois))
    if (alturaMudou) {
      broadcastToIslands(IPC.islandAltura, alturaDepois)
      clearTimeout(bocaDoEfeito)
      bocaDoEfeito = setTimeout(() => {
        void aplicarEfeito(currentSettings().island).catch(() => {})
      }, ESPERA_DA_BOCA_MS)
    }
    // A ilha só é remontada quando algo dela muda: recriar a janela a cada
    // arrasto de slider de outra tela seria piscar por nada. O vigia também
    // cuida do atalho do lançador, então ele reage aos dois.
    const ilhaMudou = !soAAltura && JSON.stringify(antes.island) !== JSON.stringify(depois.island)
    if (ilhaMudou) {
      applyIsland(depois.island)
      applyWatchers(depois.island, announceToIslands)
      if (depois.island.on && depois.island.clipboard) startClipboardWatch()
      else stopClipboardWatch()
      aplicarExtras(depois.island)
      ritmoDaIlha()
    }
    if (ilhaMudou || antes.launcher.on !== depois.launcher.on) {
      void aplicarVigia(depois.island, depois.launcher.on)
    }
  })
  ipcMain.on(IPC.launcherHide, () => hideLauncher())
  ipcMain.on(IPC.launcherArrastar, (_e, dx: number, dy: number) => moveLauncherBy(dx, dy))
  ipcMain.on(IPC.launcherArrastou, () => launcherMoved())
  ipcMain.on(IPC.launcherUso, (_e, uso: Omit<RecenteDoLancador, 'n' | 'at'>) => {
    // Só a forma: o resto é o parse de settings que valida ao gravar.
    if (uso && typeof uso.chave === 'string' && typeof uso.id === 'string') saveLauncherUso(uso)
  })
  ipcMain.handle(IPC.launcherRecentes, () => currentSettings().launcher.recentes)
  ipcMain.on(IPC.launcherToggle, () => void toggleLauncher())
  ipcMain.handle(IPC.weatherCurrent, (_e, place: string) => currentWeather(place))
  ipcMain.handle(IPC.newsHeadlines, (_e, feeds: unknown) => headlines(feeds))
  // O histórico dos medidores é colhido pelo main, num ritmo só — ver host.ts.
  iniciarHistorico()
  ipcMain.handle(IPC.labHost, () => hostStats())
  ipcMain.handle(IPC.labMachines, () => machines())
  ipcMain.handle(IPC.labContainers, () => containers())
  ipcMain.handle(IPC.labMonitors, () => monitors())
  ipcMain.handle(IPC.filesList, (_e, path?: string) => listDirectory(path))
  ipcMain.handle(IPC.filesStorage, (_e, path?: string) => storage(path))
  ipcMain.handle(IPC.filesFavorites, () => favorites())
  ipcMain.handle(IPC.filesMounts, () => mounts())
  ipcMain.handle(IPC.playerNowPlaying, () => nowPlaying())
  ipcMain.handle(IPC.projectsList, () => projects())
  ipcMain.handle(IPC.projectsInfo, (_e, path: string) => projectInfo(path))
  ipcMain.handle(IPC.appsList, () => apps())
  ipcMain.handle(IPC.appsLaunch, (_e, id: string) => launchApp(id))
  ipcMain.handle(IPC.windowSetScale, (e, requested: number): WindowSize | null => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null

    // A tela manda: pedir 1,75x numa tela de 1080px de altura não cabe, e é
    // melhor entregar o maior que cabe do que uma janela cortada.
    const area = screen.getDisplayMatching(win.getBounds()).workAreaSize
    const max = Math.min(area.width / STAGE.width, area.height / STAGE.height)
    const scale = Math.min(requested, max)
    const width = Math.round(STAGE.width * scale)
    const height = Math.round(STAGE.height * scale)

    win.setSize(width, height)
    win.center()
    return { width, height, scale, max }
  })
  registerMediaIpc()
  registerAgentsIpc()
  registerIslandIpc()
  registerSeafileIpc()
  registerMascotIpc()
  registerSpotifyIpc()
  registrarIpcDasNotificacoes()
  ipcMain.on(IPC.windowRelaunch, relaunch)
  ipcMain.handle(IPC.windowDesktopMode, async (e, on: boolean): Promise<DesktopModeResult> => {
    const server = isX11() ? 'x11' : 'wayland'
    const win = BrowserWindow.fromWebContents(e.sender)
    const applied = win ? await setDesktopLayer(win, on) : false
    return { on, applied, server }
  })
  // Papel de parede: a única coisa que um ambiente muda fora do app — exceção
  // documentada em `services/wallpaper.ts`.
  ipcMain.handle(IPC.wallpaperApply, (_e, id: EnvironmentId) => applyWallpaper(id))
  ipcMain.handle(IPC.wallpaperPreviews, () => wallpaperPreviews())
  // O que falta nesta máquina. Não sai para nenhum processo — ver
  // `services/dependencias.ts`.
  ipcMain.handle(IPC.systemDependencies, () => diagnosticoDoSistema())
  // A imagem de um ambiente, escolhida pelo usuário. Escolher é leitura: o
  // diálogo não cria nem sobrescreve nada, e o app só guarda o caminho.
  const escolherArquivo = async (
    e: IpcMainInvokeEvent,
    title: string,
    filtro: { name: string; extensions: string[] },
  ): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opcoes = {
      title,
      properties: ['openFile' as const],
      filters: [filtro, { name: t('Todos os arquivos'), extensions: ['*'] }],
    }
    const escolha = await (win ? dialog.showOpenDialog(win, opcoes) : dialog.showOpenDialog(opcoes))
    return escolha.canceled ? null : (escolha.filePaths[0] ?? null)
  }
  ipcMain.handle(IPC.wallpaperChoose, (e) =>
    escolherArquivo(e, t('Escolher a imagem deste ambiente'), {
      name: t('Imagens'),
      extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif'],
    }),
  )
  ipcMain.handle(IPC.wallpaperChooseVideo, (e) =>
    escolherArquivo(e, t('Escolher o vídeo deste ambiente'), {
      name: t('Vídeos'),
      extensions: [...EXTENSOES_DE_VIDEO],
    }),
  )
  ipcMain.handle(IPC.wallpaperVideoPlugin, () => pluginDeVideoInstalado())
  ipcMain.handle(IPC.wallpaperOriginal, () => temPapelOriginal())
  ipcMain.handle(IPC.wallpaperRestaurar, () => restaurarPapelOriginal())
  ipcMain.handle(
    IPC.appInfo,
    (): AppInfo => ({
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      platform: process.platform,
    }),
  )
}

/**
 * Mídia e player.
 *
 * O caminho da lista vem das configurações do main, não do renderer: quem
 * manda no que está salvo é o main, e assim a tela não precisa carregar (nem
 * poderia inventar) o caminho a cada chamada.
 */
function registerMediaIpc(): void {
  const lista = () => currentSettings().media.playlist

  ipcMain.handle(IPC.mediaStatus, () => catalogStatus(lista()))
  ipcMain.handle(IPC.mediaCategories, () => categories(lista()))
  ipcMain.handle(IPC.mediaCatalog, (_e, query: CatalogQuery) => catalog(lista(), query))
  ipcMain.handle(IPC.mediaTitle, (_e, id: string) => titleDetail(lista(), id))
  ipcMain.handle(IPC.mediaExtra, async (_e, id: string): Promise<ExtraResult> => {
    const detalhe = await titleDetail(lista(), id)
    if (!detalhe) return { state: 'not-found' }
    return extra(detalhe.kind, detalhe.name, detalhe.year, currentSettings().media.tmdbKey)
  })

  // Escolher arquivo é leitura: o diálogo não cria nem sobrescreve nada.
  ipcMain.handle(IPC.mediaChoose, async (e): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const escolha = await (win
      ? dialog.showOpenDialog(win, dialogoDaLista())
      : dialog.showOpenDialog(dialogoDaLista()))
    return escolha.canceled ? null : (escolha.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.mediaPlay, async (_e, id: string, episode: string | null, startAt: number) => {
    const detalhe = await titleDetail(lista(), id)
    if (!detalhe) throw new Error(t('título não encontrado'))

    const escolhido = episode ? detalhe.list[Number(episode)] : null
    const subtitle = escolhido
      ? `T${escolhido.season} · E${escolhido.number}${escolhido.title ? ` — ${escolhido.title}` : ''}`
      : [detalhe.year, detalhe.group].filter(Boolean).join(' · ')

    play(
      {
        url: await stream(lista(), id, episode),
        title: detalhe.name,
        subtitle,
        poster: detalhe.poster,
        startAt: Math.max(0, startAt || 0),
      },
      { id, episode, name: detalhe.name, poster: detalhe.poster, subtitle },
    )
  })

  /**
   * O player avisa onde está, de tempos em tempos e ao fechar.
   *
   * Descartamos o que mal começou ou o que já acabou: guardar "0:07" ou os
   * créditos finais só encheria "Continuar assistindo" de lixo.
   */
  ipcMain.on(IPC.playerProgress, (_e, seconds: number, duration: number) => {
    const titulo = nowPlayingTitle()
    if (!titulo || !Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return

    const comecou = seconds > 30
    const acabou = seconds > duration - 90
    if (acabou) {
      forgetProgress(titulo.id, titulo.episode)
      enviarRecentes()
      return
    }
    if (!comecou) return

    saveProgress({ ...titulo, seconds, duration, at: Date.now() })
    enviarRecentes()
  })

  ipcMain.on(IPC.mediaForget, (_e, id: string, episode: string | null) => {
    forgetProgress(id, episode)
    enviarRecentes()
  })

  ipcMain.handle(IPC.playerPinSupported, () => pinSupported())

  ipcMain.handle(IPC.playerFullscreen, () => toggleFullscreen())
  ipcMain.handle(IPC.playerMini, () => toggleMini())
  ipcMain.handle(IPC.playerPin, () => togglePinned())
  ipcMain.on(IPC.playerClose, () => closePlayer())
}

/**
 * Spotify.
 *
 * Tudo no main pelo mesmo motivo do TMDB: a CSP do renderer permite
 * `connect-src 'self'` e nada mais — e além da rede há D-Bus aqui, que o
 * renderer nem poderia alcançar. Ver `services/spotify.ts` para a escolha
 * entre MPRIS e Spotify Connect, e `services/spotify-auth.ts` para o OAuth.
 */
function registerSpotifyIpc(): void {
  ipcMain.handle(IPC.spotifyAuth, () => spotifyAuth())
  ipcMain.handle(IPC.spotifyConnect, () => spotifyConnect())
  ipcMain.handle(IPC.spotifyDisconnect, () => spotifyDisconnect())
  ipcMain.handle(IPC.spotifyLibrary, () => spotifyLibrary())
  ipcMain.handle(IPC.spotifyDetail, (_e, uri: string) => spotifyDetail(uri))
  ipcMain.handle(IPC.spotifyPlayback, () => spotifyPlayback())
  ipcMain.handle(IPC.spotifyControl, (_e, comando: SpotifyCommand) => spotifyControl(comando))
  ipcMain.handle(IPC.spotifyPlay, (_e, uri: string) => spotifyPlay(uri))
  ipcMain.handle(IPC.spotifyRaise, () => spotifyRaise())
}

/**
 * Empurra o histórico para a janela do app.
 *
 * Quem escreve `media.recent` é o main; sem este aviso, "Continuar assistindo"
 * só mudaria quando o app reabrisse.
 */
function enviarRecentes(): void {
  const recentes = currentSettings().media.recent
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.mediaRecent, recentes)
  }
}

/**
 * Agentes do Claude.
 *
 * O modo de permissão vem das configurações a cada agente novo — mudar em
 * Configurações vale para os próximos, não para os que já estão de pé, porque
 * o CLI recebe o modo no arranque do processo.
 */
/** O último estado visto de cada agente, para a ilha anunciar transições. */
const estadosDeAgentes = new Map<string, string>()

function registerAgentsIpc(): void {
  onAgentsChanged(() => {
    const lista = listAgents()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.agentsChanged, lista)
    }

    // A ilha anuncia o agente que TERMINOU (estava trabalhando, ficou ocioso)
    // e o que deu erro. Só transições: anunciar cada pulso seria ruído.
    for (const agente of lista) {
      const antes = estadosDeAgentes.get(agente.id)
      const trabalhava = antes === 'pensando' || antes === 'ferramenta'
      if (trabalhava && agente.state === 'ocioso') {
        announceToIslands({
          icon: 'Sparkle',
          text: agente.name,
          detail: t('terminou o trabalho'),
          level: 'ok',
        })
      } else if (antes && antes !== 'erro' && agente.state === 'erro') {
        announceToIslands({
          icon: 'WarningCircle',
          text: agente.name,
          detail: (agente.error ?? t('deu erro')).slice(0, 60),
          level: 'erro',
        })
      }
      estadosDeAgentes.set(agente.id, agente.state)
    }
    // Agente encerrado sai do mapa, senão ele cresceria para sempre.
    const vivos = new Set(lista.map((a) => a.id))
    for (const id of estadosDeAgentes.keys()) if (!vivos.has(id)) estadosDeAgentes.delete(id)
    // O Claude da ilha: resposta nova e pedido de permissão vão à pílula.
    agentesMudaram()
  })

  ipcMain.handle(IPC.agentsList, () => listAgents())
  ipcMain.handle(IPC.agentsCreate, (_e, project: string, resume: string | null) =>
    createAgent(project, currentSettings().claude.mode, resume ?? undefined),
  )
  ipcMain.on(IPC.agentsSend, (_e, id: string, text: string, anexos: Attachment[]) =>
    sendToAgent(id, text, anexos),
  )
  ipcMain.handle(IPC.agentsSessions, (_e, project: string) => agentSessions(project))

  /**
   * Anexos.
   *
   * Sem caminhos, abre o seletor; com eles, lê os que já são conhecidos (o que
   * foi colado ou arrastado). A leitura é leitura: nada é escrito ou movido.
   */
  ipcMain.handle(IPC.agentsAttach, async (e, paths: string[] | null): Promise<Attachment[]> => {
    let escolhidos = paths
    if (!escolhidos) {
      const win = BrowserWindow.fromWebContents(e.sender)
      const opcoes = {
        title: t('Anexar arquivos'),
        properties: ['openFile' as const, 'multiSelections' as const],
      }
      const escolha = await (win
        ? dialog.showOpenDialog(win, opcoes)
        : dialog.showOpenDialog(opcoes))
      escolhidos = escolha.canceled ? [] : escolha.filePaths
    }
    const lidos = await Promise.all(escolhidos.map(readAttachment))
    return lidos.filter((a): a is Attachment => a !== null)
  })
  ipcMain.on(IPC.agentsClose, (_e, id: string) => closeAgent(id))
  ipcMain.handle(IPC.agentsMessages, (_e, id: string) => agentMessages(id))

  // Escolher pasta é leitura: o diálogo não cria nem sobrescreve nada.
  ipcMain.handle(IPC.claudeProjectAdd, async (e): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opcoes = { title: t('Escolher um projeto'), properties: ['openDirectory' as const] }
    const escolha = await (win ? dialog.showOpenDialog(win, opcoes) : dialog.showOpenDialog(opcoes))
    return escolha.canceled ? null : (escolha.filePaths[0] ?? null)
  })

  // Abrir a pasta de um projeto no gerenciador de arquivos (um clique na pasta
  // do repositório a abre no gerenciador). Pelo mesmo `gio open`
  // da ilha, sem programa novo. Só PASTA e só de projeto FIXADO: o caminho vem
  // do renderer, e `gio open` num arquivo rodaria o aplicativo padrão dele —
  // e o app não executa nada (CLAUDE.md § Arquivos são somente leitura).
  ipcMain.handle(IPC.claudeProjectOpen, async (_e, caminho: unknown): Promise<boolean> => {
    if (typeof caminho !== 'string' || !currentSettings().claude.projects.includes(caminho))
      return false
    const info = await stat(caminho).catch(() => null)
    if (!info?.isDirectory()) return false
    return abrir(caminho).then(
      () => true,
      () => false,
    )
  })

  // Apontar o `claude` à mão, quando ele não está em nenhum lugar conhecido.
  // Também é leitura: o app só guarda o caminho e o passa ao `spawn`.
  ipcMain.handle(IPC.claudeChooseCli, async (e): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opcoes = {
      title: t('Onde está o programa claude'),
      // Começa em `~/.local/bin`, que é onde o instalador oficial o põe.
      defaultPath: join(homedir(), '.local/bin'),
      properties: ['openFile' as const],
    }
    const escolha = await (win ? dialog.showOpenDialog(win, opcoes) : dialog.showOpenDialog(opcoes))
    return escolha.canceled ? null : (escolha.filePaths[0] ?? null)
  })
}

/** O mascote: um `.acs` do Microsoft Agent, escolhido pelo usuário. */
function registerMascotIpc(): void {
  ipcMain.handle(IPC.mascotInfo, () => mascotInfo())
  ipcMain.handle(IPC.mascotAnimation, (_e, nome: string) => mascotAnimation(nome))
  ipcMain.handle(IPC.mascotList, () => mascotList())
  ipcMain.handle(IPC.mascotPreview, (_e, arquivo: string) => mascotPreview(arquivo))
  ipcMain.handle(IPC.mascotChoose, async (e): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opcoes = {
      title: t('Escolher um personagem'),
      properties: ['openFile' as const],
      filters: [
        { name: t('Personagens do Microsoft Agent'), extensions: ['acs'] },
        { name: t('Todos os arquivos'), extensions: ['*'] },
      ],
    }
    const escolha = await (win ? dialog.showOpenDialog(win, opcoes) : dialog.showOpenDialog(opcoes))
    if (escolha.canceled || !escolha.filePaths[0]) return null
    // Copia para a biblioteca: o arquivo escolhido pode estar numa pasta
    // temporária, e o personagem sumiria na próxima abertura.
    return mascotAdd(escolha.filePaths[0])
  })
}

/**
 * Seafile.
 *
 * A senha atravessa uma vez, no login, e não é guardada: o que fica é o token,
 * escrito por `saveSeafileToken`. O renderer nunca o recebe.
 */
/** Envios já anunciados pela ilha, para não repetir a cada mudança de estado. */
const enviosAnunciados = new Set<string>()

function registerSeafileIpc(): void {
  onSeafileChanged(() => {
    void seafileState().then((estado) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.seafileChanged, estado)
      }

      // A ilha anuncia o desfecho de cada envio — a pílula alarga, conta e se
      // recolhe. Só desfechos novos: um mapa lembra o que já foi anunciado, por
      // id do envio (por nome, mandar o mesmo arquivo de novo ficava mudo).
      for (const envio of estado.uploads) {
        if (envio.state !== 'pronto' && envio.state !== 'erro' && envio.state !== 'existe') continue
        const chave = `${envio.id}:${envio.state}`
        if (enviosAnunciados.has(chave)) continue
        enviosAnunciados.add(chave)
        if (envio.state === 'existe') {
          announceToIslands({
            icon: 'WarningCircle',
            text: envio.name,
            detail: t('já existe no Seafile'),
            level: 'alerta',
            kind: 'aviso',
          })
          continue
        }
        announceToIslands({
          icon: envio.state === 'pronto' ? 'CloudArrowUp' : 'WarningCircle',
          text: envio.name,
          detail:
            envio.state === 'pronto'
              ? t('enviado ao Seafile')
              : envio.error
                ? t('o envio falhou · {motivo}', { motivo: envio.error })
                : t('o envio falhou'),
          level: envio.state === 'pronto' ? 'ok' : 'erro',
        })
      }
    })
  })

  ipcMain.handle(IPC.seafileState, () => seafileState())
  ipcMain.handle(IPC.seafileLogin, (_e, user: string, password: string) =>
    seafileLogin(user, password),
  )
  ipcMain.on(IPC.seafileLogout, () => seafileLogout())
  ipcMain.on(IPC.seafileLibrary, (_e, id: string) => saveSeafileLibrary(id))
  ipcMain.on(IPC.seafileClear, () => seafileClearDone())
  ipcMain.on(IPC.seafileResolve, (_e, id: string, choice: SeafileResolution) =>
    seafileResolve(id, choice),
  )
  ipcMain.handle(IPC.seafileUpload, async (_e, paths: string[]) => {
    // Um de cada vez: o servidor está na rede local, e paralelizar dez vídeos
    // só faria todos ficarem lentos juntos.
    for (const caminho of paths) await seafileUpload(caminho)
  })
}

/**
 * Ilha dinâmica.
 *
 * Isolada de propósito (ver `src/main/island/`): ela lê o sistema e o que os
 * serviços do app já sabem, mas não altera nenhum deles. As ações que mexem no
 * computador estão todas em `island/actions.ts`, num arquivo só, para essa
 * superfície ficar visível de relance.
 */
function registerIslandIpc(): void {
  ipcMain.handle(IPC.islandSnapshot, () => islandSnapshot())
  ipcMain.handle(IPC.islandAction, async (_e, actionId: string, arg: string | null) => {
    const resultado = await runIslandAction(actionId, arg)
    // O usuário mexeu em algo: o próximo instantâneo não pode vir da memória.
    esquecerMemoria()
    return resultado
  })
  ipcMain.handle(IPC.islandDisplays, () => listDisplays())
  ipcMain.handle(IPC.islandCatalog, () => CATALOG)
  ipcMain.on(IPC.islandOpen, (e, on: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) setIslandOpen(win, on)
    // Abriu: o painel merece dado fresco, e o pulso volta ao ritmo cheio já.
    if (on) {
      esquecerMemoria()
      setPulsoLeve(false)
      void islandSnapshot().then((s) => broadcastToIslands(IPC.islandPush, s))
    }
  })
  ipcMain.on(IPC.islandFoco, (e, on: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) void setIslandFocus(win, on)
  })
  ipcMain.on(IPC.islandAssentou, (e, altura: number) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) islandSettled(win, Number(altura) || 0)
  })
  ipcMain.on(IPC.islandAlvo, (e, retangulos: Electron.Rectangle[]) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) setIslandTargets(win, Array.isArray(retangulos) ? retangulos : [])
  })
  ipcMain.on(IPC.islandVooPronto, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) flightReady(win)
  })
  ipcMain.handle(IPC.islandShelf, () => shelfList())

  // A home lê a MESMA lista que a ilha: o vigia do D-Bus é um só, e duplicá-lo
  // daria duas listas que discordam. `listening` é o que permite a tela dizer
  // "ligue as notificações" em vez de mostrar vazio como se nada tivesse
  // acontecido — o vigia só existe com a ilha ligada e `island.notices` ligado.
  /* ——— Social Arte ————————————————————————————————————————
     Cada handler é fino de propósito: a lógica mora em `services/creative/`,
     e o que acontece aqui é só o cruzamento do IPC. As operações de biblioteca
     devolvem a biblioteca INTEIRA — ela é pequena o bastante, e devolver o
     todo tira a chance de a tela e o disco discordarem. */
  ipcMain.handle(IPC.creativeConnections, () => creativeConnections())
  // O `pedido` é opcional: quem o manda recebe cada fonte assim que ela
  // responde, por `creative:partial`, além do conjunto completo no fim.
  ipcMain.handle(IPC.creativeSearch, (_e, query: CreativeQuery, pedido?: number) =>
    creativeSearch(query, pedido),
  )
  ipcMain.handle(IPC.creativeTrending, (_e, limite: number, cursor: string, pedido?: number) =>
    creativeTrending(limite, cursor, pedido),
  )
  // O login abre a página DA PLATAFORMA numa janela com moldura e endereço à
  // vista; o app não desenha campo de senha nenhum. Ver `creative/navegador.ts`.
  ipcMain.handle(IPC.creativeSignIn, (_e, id: CreativeProviderId) => creativeSignIn(id))
  ipcMain.handle(IPC.creativeSignOut, (_e, id: CreativeProviderId) => creativeSignOut(id))
  ipcMain.on(IPC.creativeRelease, () => liberarNavegadores())
  ipcMain.handle(IPC.creativePreview, (_e, url: string) => creativePreview(url))
  ipcMain.handle(IPC.creativeThumb, (_e, url: string) => creativeThumb(url))
  ipcMain.handle(IPC.creativeLibrary, () => lerBiblioteca())
  ipcMain.handle(IPC.creativeSave, (_e, item: CreativeItem, onde) => salvarItem(item, onde ?? {}))
  ipcMain.handle(IPC.creativeRemove, (_e, id: string) => removerItem(id))
  ipcMain.handle(IPC.creativeFavorite, (_e, id: string, on: boolean) => favoritarItem(id, on))
  ipcMain.handle(IPC.creativeMove, (_e, id: string, cols: string[]) => moverItem(id, cols))
  ipcMain.handle(IPC.creativeAnnotate, (_e, id: string, nota: string, tags: string[]) =>
    anotarItem(id, nota, tags),
  )
  ipcMain.handle(IPC.creativeCollectionCreate, (_e, dados) => criarColecao(dados))
  ipcMain.handle(IPC.creativeCollectionEdit, (_e, id: string, dados) => editarColecao(id, dados))
  ipcMain.handle(IPC.creativeCollectionDelete, (_e, id: string) => apagarColecao(id))

  ipcMain.handle(
    IPC.islandNotices,
    (): NoticesResult => ({ listening: watcherState().avisos, items: recentNotices() }),
  )
  ipcMain.on(IPC.islandDragStart, (e, caminho: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) void shelfDragStart(win, caminho)
  })
  ipcMain.handle(IPC.islandJanelas, () => listarJanelas())
  ipcMain.handle(IPC.islandJanelasGuardadas, () => janelasGuardadas())
  ipcMain.handle(IPC.islandAtividades, () => listaDeAtividades())
  ipcMain.handle(IPC.islandClaude, () => estadoDoClaude())
}

/**
 * Só listas: apontar um vídeo solto aqui não construiria biblioteca nenhuma.
 * Função, e não constante, para os textos seguirem o idioma do momento.
 */
const dialogoDaLista = () => ({
  title: t('Escolher a lista da biblioteca'),
  properties: ['openFile' as const],
  filters: [
    { name: t('Listas de reprodução'), extensions: ['m3u', 'm3u8'] },
    { name: t('Todos os arquivos'), extensions: ['*'] },
  ],
})

/**
 * O app nasce recolhido na ilha?
 *
 * A escolha é do usuário (`desktop.startHidden`, em Configurações → Janela),
 * mas ela só é obedecida quando existe caminho de volta: a ilha, que desenha o
 * botão do Halo na pílula e registra o Meta+Espaço, ou a bandeja, cujo ícone
 * alterna o app. Sem nenhum dos dois, uma janela que nasce escondida é uma
 * janela que não existe — o app subiria sem nada na tela e sem gesto nenhum
 * que o alcançasse. É a mesma regra que mantém Home e Configurações no dock.
 *
 * E a PRIMEIRA abertura nunca nasce recolhida. Quem acabou de instalar clica
 * no menu e não vê nada — só um ícone novo perto do relógio, que ele não sabe
 * que é o app — e conclui que o Halo não abriu (achado da análise de
 * portabilidade, 24/09/2026). Da segunda abertura em diante vale a escolha.
 */
function nasceRecolhido(settings: HaloSettings, temBandeja: boolean): boolean {
  if (!settings.desktop.startHidden || primeiraAbertura()) return false
  return settings.island.on || temBandeja
}

app.whenReady().then(async () => {
  if (ensureX11()) return

  // Uma instância só. Dois cliques no ícone dariam dois overlays sobre a mesma
  // área de trabalho, duas ilhas disputando o mesmo atalho global (e o Meta+V
  // que o app tira do Klipper) e dois processos gravando o mesmo
  // `settings.json` — o último a escrever apagaria o que o outro tivesse
  // mudado. Em desenvolvimento essa dor já custou depuração com quatro apps
  // abertos (CLAUDE.md § Antes de dizer que terminou); no pacote ela vira um
  // clique acidental do usuário.
  if (!app.requestSingleInstanceLock()) {
    app.exit(0)
    return
  }

  const settings = readSettings()
  // Antes de qualquer janela ou menu: o main também escreve na tela (a
  // bandeja, a ilha, os avisos).
  definirIdioma(settings.language)
  gravarPadrao()
  registerIpc()
  // A bandeja ANTES da janela, e a ordem é o que sustenta a regra: com a
  // janela fora da barra de tarefas, a bandeja é o único caminho de volta
  // depois de escondê-la. Sem ela (um ambiente sem StatusNotifierItem), a
  // janela nasce NA barra — menos elegante, e ainda alcançável. Ver `tray.ts`.
  const temBandeja = await criarBandeja()
  const recolhida = nasceRecolhido(settings, temBandeja)
  const principal = createMainWindow(settings, temBandeja, recolhida)
  // Escondida ou minimizada, a janela avisa o renderer para pausar as
  // animações; de volta, retoma (DESEMPENHO.md, P3-12).
  const dormir = (sim: boolean) => () => {
    if (!principal.isDestroyed()) principal.webContents.send(IPC.windowDormindo, sim)
  }
  principal.on('minimize', dormir(true))
  principal.on('hide', dormir(true))
  principal.on('restore', dormir(false))
  principal.on('show', dormir(false))
  if (recolhida) {
    nascerRecolhido(principal)
    // O aviso de dormir tem de ser dado à mão: `hide` só dispara para janela
    // que esteve à vista, e esta nunca esteve. Sem ele o renderer subiria
    // animando por trás de nada — e é justamente o custo que este modo evita.
    // No `did-finish-load` porque antes disso não há quem ouça.
    principal.webContents.once('did-finish-load', () => {
      if (!principal.isDestroyed()) principal.webContents.send(IPC.windowDormindo, true)
    })
  }
  applyIsland(settings.island)
  applyLauncher(settings.launcher.on, settings.environment.id)
  void aplicarNotificacoes(settings.notificacoes, settings.environment.id)
  bindTimer(announceToIslands)
  applyWatchers(settings.island, announceToIslands)
  if (settings.island.on && settings.island.clipboard) startClipboardWatch()
  void aplicarVigia(settings.island, settings.launcher.on)
  aplicarExtras(settings.island)
  ritmoDaIlha()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(readSettings(), temBandeja)
  })

  // Abrir o app de novo com ele já rodando não abre nada: traz o que existe.
  // Quem clicou no ícone quer VER a janela, e é o mesmo caminho da bandeja —
  // `trazerParaAVista` cobre os três estados em que ela pode estar (recolhida
  // pela gaveta da ilha, minimizada, escondida). Sem `focus()`: a janela vive
  // na camada do papel de parede, e o Electron não fala com o compositor.
  app.on('second-instance', () => trazerParaAVista(principal))
})

// O que ainda estava no debounce não pode ir embora com o app — e processos
// do CLI não podem ficar órfãos depois que a janela fecha.
/**
 * Os vigias menores da ilha, ligados e desligados junto com ela: o HUD das
 * travas do teclado (vai com a opção do HUD), o espectro de áudio e a API
 * local — cada um com a própria opção em Configurações.
 */
function aplicarExtras(ilha: IslandSettings): void {
  if (ilha.on && ilha.hud) vigiarTeclado(announceToIslands)
  else pararTeclado()
  aplicarEspectro(ilha.on && ilha.spectrum)
  if (ilha.on && ilha.api) {
    void startApi().catch((erro: Error) => {
      console.warn(`[halo] a API local da ilha não subiu: ${erro.message}`)
    })
  } else void stopApi()
}

/**
 * O vigia do KWin: tela cheia esconde a ilha; o atalho global (se o usuário o
 * ligou) guarda a janela ativa com o voo.
 */
async function aplicarVigia(ilha: IslandSettings, lancador: boolean): Promise<void> {
  await aplicarEfeito(ilha).catch(() => {
    // Sem KWin, ou sem permissão de escrever o pacote: o cartão continua.
  })
  // O Meta+V: liberado do Klipper ANTES de o script tentar registrá-lo (o KDE
  // não entrega tecla ocupada). A devolução é o contrário, e vem no FIM: só
  // depois que a ação do Halo solta a tecla (`apagarAtalho`, dentro de
  // `iniciarVigia`/`apagarAtalhos`) o Klipper consegue pegá-la de volta.
  // MEDIDO em 24/09/2026: devolvendo antes, o KDE recusava em silêncio e o
  // Klipper ficava sem Meta+V.
  if (lancador) await liberarMetaV().catch(() => {})
  // Sem ilha não há pílula para trazer o app de volta — mas a bandeja também é
  // caminho de volta, a mesma regra de `nasceRecolhido`. Só sem os DOIS o app
  // reaparece à força. Antes isto ignorava a bandeja, e numa máquina nova (a
  // ilha nasce desligada) o `startHidden` nunca era obedecido: medido em
  // 24/09/2026 com um perfil vazio, a janela abria mapeada toda vez.
  const semCaminhoDeVolta = !ilha.on && !bandejaDePe()
  if (!ilha.on && !lancador) {
    if (semCaminhoDeVolta) garantirHaloAVista()
    await pararVigia()
    await apagarAtalhos()
    await devolverMetaV().catch(() => {})
    return
  }
  if (semCaminhoDeVolta) garantirHaloAVista()
  await iniciarVigia(
    {
      // Os atalhos da ilha só existem com a ilha; o do lançador, com o lançador.
      atalho: ilha.on && ilha.shortcut,
      atalhoApp: ilha.on && ilha.appShortcut,
      atalhoLancador: lancador,
    },
    (evento) => {
      // Só a ilha da tela com a janela em tela cheia some; a da outra fica.
      // A geometria vem do KWin, e `getDisplayMatching` acha a tela do Electron
      // que mais a cobre.
      if (evento.tipo === 'tela-cheia') {
        setIslandsHidden(
          ilha.fullscreenHide ? evento.telas.map((r) => screen.getDisplayMatching(r).id) : [],
        )
      }
      if (evento.tipo === 'atalho-guardar') void guardarComVoo(null).catch(() => {})
      if (evento.tipo === 'atalho-halo') void alternarHalo().catch(() => {})
      if (evento.tipo === 'atalho-lancador') void toggleLauncher().catch(() => {})
      if (evento.tipo === 'janelas') invalidarJanelas()
    },
  ).catch(() => {
    // Sem KWin (outro ambiente): a ilha vive sem o vigia.
  })
  if (!lancador) await devolverMetaV().catch(() => {})
}

/**
 * O pulso da ilha.
 *
 * Um relógio só no main, que calcula o instantâneo uma vez e manda para todas
 * as ilhas abertas — com duas telas, calcular duas vezes seria desperdício. Ele
 * para quando não há ilha nenhuma.
 */
let pulso: NodeJS.Timeout | undefined
/** A última faixa vista, para anunciar quando ela muda. */
let faixaVista: string | null = null
/** Os downloads vistos em andamento: o que some da lista terminou. */
let baixandoVistos: Set<string> | null = null
/** Desde quando se olham as capturas: só as feitas com a ilha de pé contam. */
let capturasDesdeQuando = 0
const capturasVistas = new Set<string>()

function ritmoDaIlha(): void {
  clearInterval(pulso)
  pulso = undefined
  if (islandWindows().length === 0) return
  if (!capturasDesdeQuando) capturasDesdeQuando = Date.now()

  pulso = setInterval(() => {
    if (islandWindows().length === 0) {
      clearInterval(pulso)
      pulso = undefined
      return
    }
    // Recolhida em todas as telas, a ilha só mostra a pílula: as leituras
    // caras ganham prazos dez vezes mais longos (ver `memo` em snapshot.ts).
    setPulsoLeve(!algumaIlhaAberta())
    void islandSnapshot().then((s) => {
      broadcastToIslands(IPC.islandPush, s)

      // Faixa nova é anunciada: a pílula alarga, mostra e se recolhe — o
      // gesto do HyperIsland. Só quando MUDA, e nunca no primeiro pulso:
      // anunciar o que já estava tocando quando a ilha subiu seria ruído.
      const tocando = s.modules
        .find((m) => m.id === 'midia')
        ?.readings.find((r) => r.id === 'midia-tocando')
      const faixa = tocando && tocando.value !== 'nada' ? tocando.value : null
      // O espectro só ouve enquanto algo toca de verdade.
      const estado = s.modules
        .find((m) => m.id === 'midia')
        ?.readings.find((r) => r.id === 'midia-estado')
      espectroTocando(Boolean(faixa) && estado?.value === 'tocando')
      if (faixa && faixaVista !== null && faixa !== faixaVista) {
        announceToIslands({
          icon: 'MusicNotes',
          text: faixa,
          detail: tocando?.detail ?? '',
          level: 'ok',
        })
      }
      faixaVista = faixa ?? faixaVista
      if (faixaVista === null) faixaVista = ''

      // Download que estava em andamento e sumiu da lista terminou (o
      // navegador renomeou o arquivo parcial). Nunca no primeiro pulso, e
      // nunca para um parcial que já estava PARADO: esse não terminou, foi
      // cancelado ou limpo — e "concluído" seria mentira.
      const agora = new Set(s.downloads.map((d) => d.nome))
      const vivos = new Set(s.downloads.filter((d) => !d.parado).map((d) => d.nome))
      if (baixandoVistos) {
        for (const nome of baixandoVistos) {
          if (agora.has(nome)) continue
          announceToIslands({
            icon: 'DownloadSimple',
            text: t('Download concluído'),
            detail: nome.slice(0, 40),
            level: 'ok',
            kind: 'aviso',
            ttlMs: 4500,
          })
        }
      }
      baixandoVistos = vivos

      // Captura de tela nova: anuncia e vai para a gaveta como referência —
      // o "screenshot shelf" dos apps de notch, sem copiar o arquivo.
      void capturasDesde(capturasDesdeQuando).then((novas) => {
        for (const captura of novas) {
          if (capturasVistas.has(captura.path)) continue
          capturasVistas.add(captura.path)
          try {
            shelfAdd(captura.path)
          } catch {
            // Gaveta cheia ou caminho recusado: o anúncio ainda vale.
          }
          announceToIslands({
            icon: 'Camera',
            text: t('Captura salva na gaveta'),
            detail: captura.name.slice(0, 40),
            level: 'ok',
            kind: 'aviso',
            ttlMs: 4500,
          })
        }
      })
    })
  }, 2000)
}

// Janelas na gaveta estão fora da barra e invisíveis: antes de sair, elas
// são soltas (um ciclo no KWin, assíncrono) — senão ficariam presas assim.
// Por isso SIGTERM e SIGINT viram `app.quit()`: sem isto o processo morreria
// sem `before-quit`, e o "fechar" do sistema deixaria as janelas presas.
for (const sinal of ['SIGTERM', 'SIGINT'] as const) process.on(sinal, () => app.quit())
let guardadasSoltas = false
app.on('before-quit', (evento) => {
  if (!guardadasSoltas && janelasGuardadas().length > 0) {
    guardadasSoltas = true
    evento.preventDefault()
    const limite = new Promise((r) => setTimeout(r, 1500))
    void Promise.race([soltarGuardadas().catch(() => {}), limite]).then(() => app.quit())
    return
  }
  flushSettings()
  // A biblioteca da Social Arte tem debounce próprio, como as configurações:
  // sem isto o último item salvo se perderia ao fechar dentro dos 400ms.
  gravarBibliotecaAgora()
  // A janela escondida do navegador de segundo plano e a de acesso: nenhuma
  // aparece na barra de tarefas, e uma janela sem dono é um processo que fica.
  fecharNavegador()
  closeAllAgents()
  stopWatchers()
  stopClipboardWatch()
  pararTeclado()
  pararEspectro()
  void stopApi()
  void pararVigia()
  closeIsland()
  closeLauncher()
  // Os balões voltam ao Plasma já, sem esperar a conexão do D-Bus cair.
  encerrarNotificacoes()
  // O ícone da bandeja é um nome NOSSO no barramento: sem soltar, ele ficaria
  // no painel até o D-Bus perceber a queda da conexão.
  fecharBandeja()
})

/**
 * O efeito do KWin (ver `island/efeito.ts`): instalado e carregado com a
 * ilha ligada e a opção ligada; removido em qualquer outro caso — a opção
 * desligada não deixa rastro fora da pasta do app.
 */
async function aplicarEfeito(ilha: IslandSettings): Promise<void> {
  // O estilo entra no pacote: a trajetória da janela de verdade mora no código
  // do efeito, e trocá-la em Configurações o reescreve e recarrega.
  if (ilha.on && ilha.kwinEffect) await instalarEfeito(ilha.flight, alturaDaIlha(currentSettings()))
  else await removerEfeito()
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
