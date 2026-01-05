/**
 * Entidades do app.
 *
 * `Weather` vive em `@shared` porque o processo main também a produz (ele é
 * quem fala com a API). O resto do domínio, que não cruza processos, fica aqui.
 */

export type { DesktopApp } from '@shared/apps'
export type {
  DirectoryListing,
  Favorite,
  FileEntry,
  FileKind,
  Mount,
  StorageInfo,
} from '@shared/files'
export type { Container, ContainerState, HostStats, Machine, Monitor } from '@shared/lab'
/** Notícias vivem em `@shared/news`: o main é quem busca e faz o parse dos feeds. */
export type { NewsFeedStatus, NewsItem, NewsResult } from '@shared/news'
export type { NowPlaying, PlaybackStatus } from '@shared/player'
export type { Project } from '@shared/projects'
/**
 * Música vive em `@shared/spotify`: o processo main também a produz (é ele quem
 * fala com a Web API e com o D-Bus). Ver `src/shared/spotify.ts`.
 */
export type {
  SpotifyAuth,
  SpotifyItem,
  SpotifyLibrary,
  SpotifyPlayback,
  SpotifyTrack,
} from '@shared/spotify'
export type { Weather, WeatherCondition } from '@shared/weather'

/**
 * Notificações da home — as do SISTEMA, vistas pelo vigia do D-Bus.
 *
 * `kind` é do desenho, não do D-Bus: o servidor de notificações do freedesktop
 * tem urgência 0/1/2, e o handoff tem três tons. Urgente vira `error`, o resto
 * vira `info`, e `ok` fica para o que o próprio app anuncia.
 */
export type Notification = {
  kind: 'ok' | 'info' | 'error'
  title: string
  body: string
  /** O `.desktop` de quem mandou, quando ele se identificou. */
  app: string
}

/**
 * O que a coluna de notificações recebe.
 *
 * `listening` existe porque a coluna VAZIA tem duas causas — "nada aconteceu" e
 * "ninguém está ouvindo" — e mostrar as duas iguais seria a tela mentindo. O
 * vigia é o da ilha, e só existe com ela ligada.
 */
export type Notifications = { listening: boolean; items: Notification[] }
