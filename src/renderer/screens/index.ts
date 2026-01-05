import type { ComponentType } from 'react'
import type { Screen } from '@/store/useHalo'
import { ClaudeScreen } from './claude/ClaudeScreen'
import { FilesScreen } from './files/FilesScreen'
import { HomeScreen } from './HomeScreen'
import { LabScreen } from './lab/LabScreen'
import { MediaScreen } from './media/MediaScreen'
import { MusicScreen } from './music/MusicScreen'
import { SettingsScreen } from './SettingsScreen'
import { SocialScreen } from './social/SocialScreen'

export const SCREENS: Record<Screen, ComponentType> = {
  home: HomeScreen,
  social: SocialScreen,
  claude: ClaudeScreen,
  files: FilesScreen,
  lab: LabScreen,
  media: MediaScreen,
  music: MusicScreen,
  settings: SettingsScreen,
}
