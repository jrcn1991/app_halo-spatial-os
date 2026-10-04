import type { HaloSettings } from '@shared/settings'
import { useHalo } from '@/store/useHalo'

/**
 * Salva as configurações sempre que elas mudam.
 *
 * Fica fora do React de propósito: é um efeito de aplicação, não de tela, e
 * assinar o store direto evita renderizar qualquer coisa por causa disso. O
 * agrupamento das escritas (arrastar um slider dispara dezenas) acontece no
 * processo main, junto do arquivo — ver `src/main/settings.ts`.
 */
export function startPersistingSettings(): () => void {
  const api = globalThis.window?.halo
  if (!api) return () => {}

  let previous = snapshot(useHalo.getState())

  return useHalo.subscribe((state) => {
    const next = snapshot(state)
    if (
      next.language === previous.language &&
      next.appearance === previous.appearance &&
      next.environment === previous.environment &&
      next.widgets === previous.widgets &&
      next.hiddenScreens === previous.hiddenScreens &&
      next.favorites === previous.favorites &&
      next.desktop.on === previous.desktop.on &&
      next.desktop.startHidden === previous.desktop.startHidden &&
      next.media.playlist === previous.media.playlist &&
      next.media.favorites === previous.media.favorites &&
      next.media.groups === previous.media.groups &&
      next.media.tmdbKey === previous.media.tmdbKey &&
      next.claude.projects === previous.claude.projects &&
      next.claude.mode === previous.claude.mode &&
      next.island === previous.island &&
      next.launcher === previous.launcher &&
      next.notificacoes === previous.notificacoes &&
      next.temaKde === previous.temaKde &&
      next.seafile.server === previous.seafile.server &&
      next.seafile.library === previous.seafile.library &&
      next.mascot.file === previous.mascot.file &&
      next.mascot.on === previous.mascot.on &&
      next.mascot.liveliness === previous.mascot.liveliness &&
      next.music.spotifyClientId === previous.music.spotifyClientId &&
      next.music.spotifyRedirect === previous.music.spotifyRedirect &&
      next.news.feeds === previous.news.feeds
    ) {
      return
    }
    previous = next
    api.settings.save(next)
  })
}

function snapshot(state: ReturnType<typeof useHalo.getState>): HaloSettings {
  return {
    language: state.language,
    appearance: state.appearance,
    environment: state.environment,
    widgets: state.widgets,
    hiddenScreens: state.hiddenScreens,
    favorites: state.favorites,
    // `position` vai nula de propósito: quem a conhece é o main, e é ele quem
    // a preserva ao gravar — ver `saveSettings` em `src/main/settings.ts`.
    desktop: { on: state.desktopMode, position: null, startHidden: state.desktopStartHidden },
    // `recent` vai vazio de propósito: quem o conhece é o main, que o preserva
    // ao gravar — mesma proteção de `desktop.position`.
    media: {
      playlist: state.playlist,
      favorites: state.mediaFavorites,
      groups: state.mediaGroups,
      recent: [],
      tmdbKey: state.tmdbKey,
    },
    claude: {
      projects: state.claudeProjects,
      groups: state.claudeGroups,
      mode: state.claudeMode,
      cli: state.claudeCli,
    },
    island: state.island,
    launcher: state.launcher,
    notificacoes: state.notificacoes,
    temaKde: state.temaKde,
    // `token` vai vazio de propósito: quem o conhece é o main, que o preserva
    // ao gravar — mesma proteção do refresh token do Spotify.
    seafile: { server: state.seafileServer, token: '', library: state.seafileLibrary },
    mascot: {
      file: state.mascotFile,
      on: state.mascotOn,
      liveliness: state.mascotLiveliness,
    },
    // `spotifyRefreshToken` vai vazio de propósito: quem o conhece é o main,
    // que o preserva ao gravar — mesma proteção de `desktop.position`. Mandar
    // o que o renderer tem (o do arranque, ou nada) desconectaria a conta.
    music: {
      spotifyClientId: state.spotifyClientId,
      spotifyRedirect: state.spotifyRedirect,
      spotifyRefreshToken: '',
    },
    news: { feeds: state.newsFeeds },
  }
}
