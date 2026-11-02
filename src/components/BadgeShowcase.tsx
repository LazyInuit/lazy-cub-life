import type { DailyGame } from '../game/dailyTasks'
import { BADGES, badgeProgress, type BadgeId } from '../game/profileArt'

type Props = {
  id: BadgeId
  onClose: () => void
  /** Line above the badge, such as "Badge earned!". */
  kicker?: string
}

/** One badge shown large with its name, tier, and game. Tap anywhere to close. */
export function BadgeShowcase({ id, onClose, kicker }: Props) {
  const badge = BADGES[id]
  return (
    <button type="button" className="badge-zoom" onClick={onClose} aria-label={`${badge.label}. Close`}>
      {kicker ? <span className="badge-zoom-kicker">{kicker}</span> : null}
      <img src={badge.src} alt="" />
      <strong>{badge.name}</strong>
      <span className="badge-zoom-tier">{badge.tier}</span>
      <span className="badge-zoom-game">{badge.game}</span>
      <span className="badge-zoom-hint">Tap to close</span>
    </button>
  )
}

/**
 * Pop-up at the end of a run that set a new best but earned no badge: the next badge (still locked)
 * and how many more points it needs, or the top badge when the game has none left to earn.
 */
export function BestProgressPop({ game, best, onClose, onView }: { game: DailyGame; best: number; onClose: () => void; onView: () => void }) {
  const progress = badgeProgress(game, best)
  if (!progress) return null
  const shown = BADGES[progress.top ? progress.current : progress.next]
  const pct = progress.top ? 100 : Math.min(100, Math.max(0, ((best - progress.from) / (progress.at - progress.from)) * 100))
  return (
    <div className="badge-earned-pop" role="dialog" aria-modal="true" aria-label="New best score">
      <div className="badge-earned-card">
        <button type="button" className="badge-zoom best-progress" onClick={onClose} aria-label="Close">
          <span className="badge-zoom-kicker">New best!</span>
          <span className="best-progress-score">{best.toLocaleString('en-US')}</span>
          <img className={progress.top ? undefined : 'locked'} src={shown.src} alt="" />
          <strong>{shown.name}</strong>
          <span className="badge-zoom-tier">{progress.top ? `${shown.tier} · Top badge!` : `Next: ${shown.tier}`}</span>
          {progress.top ? (
            <span className="badge-zoom-game">You have every {shown.game} badge</span>
          ) : (
            <>
              <span className="best-progress-left">
                {(progress.at - best).toLocaleString('en-US')} more points for {shown.tier}
              </span>
              <span className="best-progress-meter" aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </span>
            </>
          )}
          <span className="badge-zoom-hint">Tap to close</span>
        </button>
      </div>
      <button type="button" className="profile-visit badge-earned-view" onClick={onView}>
        View achievements
      </button>
    </div>
  )
}

/** Full-screen pop-up for a badge just earned at the end of a run. */
export function BadgeEarnedPop({ id, onClose, onView }: { id: BadgeId; onClose: () => void; onView: () => void }) {
  return (
    <div className="badge-earned-pop" role="dialog" aria-modal="true" aria-label="Badge earned">
      <div className="badge-earned-card">
        <BadgeShowcase id={id} onClose={onClose} kicker="Badge earned!" />
      </div>
      <button type="button" className="profile-visit badge-earned-view" onClick={onView}>
        View achievements
      </button>
    </div>
  )
}
