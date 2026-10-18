import { BADGES, type BadgeId } from '../game/profileArt'

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
