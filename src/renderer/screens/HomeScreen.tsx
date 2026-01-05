import { Panel } from '@/ui/Panel'
import { PanelRow } from '@/ui/PanelRow'
import { ClockWidget } from './home/ClockWidget'
import { Dashboard, Environments } from './home/Dashboard'
import { PlayingWidget } from './home/PlayingWidget'
import { StatsWidget } from './home/StatsWidget'
import { WeatherWidget } from './home/WeatherWidget'

/** Geometria: protótipo linha 79 (linha), 82 / 128 / 307 (painéis). */
export function HomeScreen() {
  return (
    <PanelRow gap={24} perspective={2600} padding="40px 40px 130px">
      <Panel
        variant="side"
        w={270}
        h={600}
        radius={28}
        padding="18px 16px"
        gap={12}
        rest="rotateY(18deg) translateZ(-60px)"
        fromX={150}
      >
        <ClockWidget />
        <WeatherWidget />
        <PlayingWidget />
        <StatsWidget />
      </Panel>

      <Panel variant="center" w={700} h={610} radius={32} padding="22px 22px 20px" gap={16}>
        <Dashboard />
      </Panel>

      <Panel
        variant="side"
        w={250}
        h={600}
        radius={28}
        padding="20px 16px"
        gap={16}
        rest="rotateY(-18deg) translateZ(-60px)"
        fromX={-150}
      >
        <Environments />
      </Panel>
    </PanelRow>
  )
}
