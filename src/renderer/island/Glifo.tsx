import { AppWindow } from '@phosphor-icons/react/dist/icons/AppWindow'
import { ArrowSquareOut } from '@phosphor-icons/react/dist/icons/ArrowSquareOut'
import { ArrowsLeftRight } from '@phosphor-icons/react/dist/icons/ArrowsLeftRight'
import { ArrowsOutSimple } from '@phosphor-icons/react/dist/icons/ArrowsOutSimple'
import { Bell } from '@phosphor-icons/react/dist/icons/Bell'
import { BellRinging } from '@phosphor-icons/react/dist/icons/BellRinging'
import { BellSlash } from '@phosphor-icons/react/dist/icons/BellSlash'
import { Bluetooth } from '@phosphor-icons/react/dist/icons/Bluetooth'
import { Broadcast } from '@phosphor-icons/react/dist/icons/Broadcast'
import { Broom } from '@phosphor-icons/react/dist/icons/Broom'
import { Camera } from '@phosphor-icons/react/dist/icons/Camera'
import { CaretLeft } from '@phosphor-icons/react/dist/icons/CaretLeft'
import { CaretRight } from '@phosphor-icons/react/dist/icons/CaretRight'
import { ChartBar } from '@phosphor-icons/react/dist/icons/ChartBar'
import { Check } from '@phosphor-icons/react/dist/icons/Check'
import { Circle } from '@phosphor-icons/react/dist/icons/Circle'
import { Clipboard } from '@phosphor-icons/react/dist/icons/Clipboard'
import { Clock } from '@phosphor-icons/react/dist/icons/Clock'
import { CloudArrowUp } from '@phosphor-icons/react/dist/icons/CloudArrowUp'
import { CloudSun } from '@phosphor-icons/react/dist/icons/CloudSun'
import { Coffee } from '@phosphor-icons/react/dist/icons/Coffee'
import { Copy } from '@phosphor-icons/react/dist/icons/Copy'
import { Cpu } from '@phosphor-icons/react/dist/icons/Cpu'
import { Desktop } from '@phosphor-icons/react/dist/icons/Desktop'
import { DeviceMobile } from '@phosphor-icons/react/dist/icons/DeviceMobile'
import { DownloadSimple } from '@phosphor-icons/react/dist/icons/DownloadSimple'
import { Eject } from '@phosphor-icons/react/dist/icons/Eject'
import { Envelope } from '@phosphor-icons/react/dist/icons/Envelope'
import { Eyedropper } from '@phosphor-icons/react/dist/icons/Eyedropper'
import { File } from '@phosphor-icons/react/dist/icons/File'
import { FolderOpen } from '@phosphor-icons/react/dist/icons/FolderOpen'
import { GraphicsCard } from '@phosphor-icons/react/dist/icons/GraphicsCard'
import { GridFour } from '@phosphor-icons/react/dist/icons/GridFour'
import { Hourglass } from '@phosphor-icons/react/dist/icons/Hourglass'
import { House } from '@phosphor-icons/react/dist/icons/House'
import { Keyboard } from '@phosphor-icons/react/dist/icons/Keyboard'
import { Lightning } from '@phosphor-icons/react/dist/icons/Lightning'
import { Link } from '@phosphor-icons/react/dist/icons/Link'
import { Lock } from '@phosphor-icons/react/dist/icons/Lock'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/icons/MagnifyingGlass'
import { Memory } from '@phosphor-icons/react/dist/icons/Memory'
import { Microphone } from '@phosphor-icons/react/dist/icons/Microphone'
import { MicrophoneSlash } from '@phosphor-icons/react/dist/icons/MicrophoneSlash'
import { Moon } from '@phosphor-icons/react/dist/icons/Moon'
import { MusicNotes } from '@phosphor-icons/react/dist/icons/MusicNotes'
import { NotePencil } from '@phosphor-icons/react/dist/icons/NotePencil'
import { PaperPlaneTilt } from '@phosphor-icons/react/dist/icons/PaperPlaneTilt'
import { Pause } from '@phosphor-icons/react/dist/icons/Pause'
import { Play } from '@phosphor-icons/react/dist/icons/Play'
import { Plug } from '@phosphor-icons/react/dist/icons/Plug'
import { PlugsConnected } from '@phosphor-icons/react/dist/icons/PlugsConnected'
import { Power } from '@phosphor-icons/react/dist/icons/Power'
import { PushPin } from '@phosphor-icons/react/dist/icons/PushPin'
import { Repeat } from '@phosphor-icons/react/dist/icons/Repeat'
import { Shuffle } from '@phosphor-icons/react/dist/icons/Shuffle'
import { SkipBack } from '@phosphor-icons/react/dist/icons/SkipBack'
import { SkipForward } from '@phosphor-icons/react/dist/icons/SkipForward'
import { Sparkle } from '@phosphor-icons/react/dist/icons/Sparkle'
import { SpeakerHigh } from '@phosphor-icons/react/dist/icons/SpeakerHigh'
import { SpeakerLow } from '@phosphor-icons/react/dist/icons/SpeakerLow'
import { SpeakerSlash } from '@phosphor-icons/react/dist/icons/SpeakerSlash'
import { SquareHalf } from '@phosphor-icons/react/dist/icons/SquareHalf'
import { SquaresFour } from '@phosphor-icons/react/dist/icons/SquaresFour'
import { Stop } from '@phosphor-icons/react/dist/icons/Stop'
import { Target } from '@phosphor-icons/react/dist/icons/Target'
import { Terminal } from '@phosphor-icons/react/dist/icons/Terminal'
import { TextAa } from '@phosphor-icons/react/dist/icons/TextAa'
import { TextT } from '@phosphor-icons/react/dist/icons/TextT'
import { Thermometer } from '@phosphor-icons/react/dist/icons/Thermometer'
import { Timer } from '@phosphor-icons/react/dist/icons/Timer'
import { Trash } from '@phosphor-icons/react/dist/icons/Trash'
import { Tray } from '@phosphor-icons/react/dist/icons/Tray'
import { UploadSimple } from '@phosphor-icons/react/dist/icons/UploadSimple'
import { Usb } from '@phosphor-icons/react/dist/icons/Usb'
import { Vibrate } from '@phosphor-icons/react/dist/icons/Vibrate'
import { WarningCircle } from '@phosphor-icons/react/dist/icons/WarningCircle'
import { WifiHigh } from '@phosphor-icons/react/dist/icons/WifiHigh'
import { WifiSlash } from '@phosphor-icons/react/dist/icons/WifiSlash'
import { X } from '@phosphor-icons/react/dist/icons/X'
import type { ComponentType } from 'react'

/**
 * O ícone de um módulo ou ação, pelo nome.
 *
 * Um mapa explícito, e não `import * as Phosphor`: importar o pacote inteiro
 * levava o bundle da ilha a 4,8 MB — medido — porque nada podia ser podado. Só
 * o que a ilha usa entra aqui.
 *
 * Nome desconhecido cai num ícone neutro em vez de sumir: a ilha nunca fica
 * com um buraco no lugar do glifo.
 */
/**
 * A marca do Halo: os três painéis do palco, o do meio maior — é o que o app
 * É, e a 14px continua legível como três lâminas de vidro em vez de virar um
 * ícone genérico. Desenho nosso: o Phosphor não tem o Halo, e um "AppWindow"
 * ali diria "uma janela qualquer".
 *
 * Ela ignora o `weight` de propósito — as barras já são cheias, e não há
 * versão fina delas.
 */
function HaloMarca({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
      <title>Halo</title>
      <rect x="1" y="4.5" width="3.4" height="7" rx="1.4" />
      <rect x="6.1" y="2" width="3.8" height="12" rx="1.6" />
      <rect x="11.6" y="4.5" width="3.4" height="7" rx="1.4" />
    </svg>
  )
}

const ICONES: Record<
  string,
  ComponentType<{ size?: number; weight?: 'bold' | 'regular' | 'fill' }>
> = {
  Halo: HaloMarca,
  AppWindow,
  ArrowsLeftRight,
  ArrowSquareOut,
  Bell,
  BellRinging,
  BellSlash,
  Bluetooth,
  Broom,
  Camera,
  CaretLeft,
  CaretRight,
  Circle,
  Clock,
  CloudSun,
  CloudArrowUp,
  Cpu,
  Desktop,
  DownloadSimple,
  File,
  FolderOpen,
  GraphicsCard,
  Link,
  Lock,
  MusicNotes,
  Pause,
  Play,
  Power,
  Thermometer,
  SkipBack,
  SkipForward,
  Sparkle,
  SpeakerHigh,
  SpeakerLow,
  SpeakerSlash,
  SquaresFour,
  TextT,
  Timer,
  Tray,
  UploadSimple,
  WarningCircle,
  WifiHigh,
  WifiSlash,
  X,
  Microphone,
  MicrophoneSlash,
  Shuffle,
  Repeat,
  Hourglass,
  Envelope,
  SquareHalf,
  ArrowsOutSimple,
  Check,
  Clipboard,
  Coffee,
  Copy,
  GridFour,
  House,
  MagnifyingGlass,
  Memory,
  Moon,
  NotePencil,
  PushPin,
  Stop,
  Trash,
  Broadcast,
  ChartBar,
  DeviceMobile,
  Eject,
  Eyedropper,
  Keyboard,
  Lightning,
  PaperPlaneTilt,
  Plug,
  PlugsConnected,
  Target,
  Terminal,
  TextAa,
  Usb,
  Vibrate,
}

/**
 * O peso: o Phosphor Regular tem traço de 16/256 — a 14px dá 0,9px, uma
 * família mais fina que o texto ao lado. O SF Symbols Regular fica em
 * ~1,5px a 13pt. `bold` (24/256) chega lá para tudo até 16px; acima disso o
 * regular já tem corpo. `fill` é o estado ligado, como no Control Center.
 */
export function Glifo({
  nome,
  tamanho = 14,
  cheio = false,
}: {
  nome: string
  tamanho?: number
  cheio?: boolean | undefined
}) {
  const Icone = ICONES[nome] ?? Circle
  const peso = cheio ? 'fill' : tamanho <= 16 ? 'bold' : 'regular'
  return <Icone size={tamanho} weight={peso} />
}
