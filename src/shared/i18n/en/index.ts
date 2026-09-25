import { EN_APP } from './app'
import { EN_CLAUDE } from './claude'
import { EN_FILES } from './files'
import { EN_HOME } from './home'
import { EN_ISLAND } from './island'
import { EN_LAB } from './lab'
import { EN_LAUNCHER } from './launcher'
import { EN_MAIN } from './main'
import { EN_MEDIA } from './media'
import { EN_MUSIC } from './music'
import { EN_NOTIFICACOES } from './notificacoes'
import { EN_SETTINGS } from './settings'
import { EN_SHARED } from './shared'
import { EN_SOCIAL } from './social'
import { EN_UI } from './ui'

/**
 * O dicionário inglês inteiro: um arquivo por área, juntos aqui. Uma chave
 * repetida em duas áreas com traduções diferentes é um erro que o
 * `npm run i18n` aponta.
 */
export const EN: Record<string, string> = {
  ...EN_APP,
  ...EN_UI,
  ...EN_HOME,
  ...EN_SOCIAL,
  ...EN_CLAUDE,
  ...EN_FILES,
  ...EN_LAB,
  ...EN_MEDIA,
  ...EN_MUSIC,
  ...EN_SETTINGS,
  ...EN_ISLAND,
  ...EN_LAUNCHER,
  ...EN_NOTIFICACOES,
  ...EN_MAIN,
  ...EN_SHARED,
}
