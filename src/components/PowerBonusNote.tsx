import type { RunBonus } from '../game/useCub'
import { PowerBolt } from './CubPowerPanel'

/** The whole Cub Cash and XP Cub Power added to this run, under the run's own rewards. */
export function PowerBonusNote({ bonus }: { bonus?: RunBonus }) {
  if (!bonus || (bonus.coins <= 0 && bonus.xp <= 0)) return null
  const parts: string[] = []
  if (bonus.coins > 0) parts.push(`+${bonus.coins} Cub Cash`)
  if (bonus.xp > 0) parts.push(`+${bonus.xp} XP`)
  return (
    <p className="power-run-bonus">
      <PowerBolt className="power-run-bolt" />
      Cub Power bonus: {parts.join(' · ')}
    </p>
  )
}
