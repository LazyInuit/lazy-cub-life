import { MAX_STREAK_DAYS, streakMultiplier, weeklyPlaceLabel, type PowerNotice } from '../game/cubPower'
import { LoginStreakBar, PowerBolt, Trophy, multiplierText, whenText } from './CubPowerPanel'

type Props = {
  notice: PowerNotice
  onClose: () => void
}

function StreakBody({ day, multiplier, reset }: { day: number; multiplier: number; reset: boolean }) {
  const filled = Math.min(day, MAX_STREAK_DAYS)
  const maxed = day >= MAX_STREAK_DAYS
  return (
    <>
      <p className="power-pop-kicker">{reset ? 'New streak' : 'Daily login'}</p>
      <h2>{reset ? 'Start a new streak today!' : `Day ${day} streak!`}</h2>
      {reset ? <p className="power-pop-note">Your last streak ended. Log in every day to build it back up.</p> : null}
      <LoginStreakBar days={filled} />
      <p className="power-pop-main">Cub Power {multiplierText(multiplier)} today</p>
      <p className="power-pop-note">
        {maxed
          ? 'Top streak bonus reached. Keep logging in to hold it!'
          : `Come back tomorrow for ${multiplierText(streakMultiplier(day + 1))}.`}
      </p>
      <p className="power-pop-small">Days change at midnight UTC.</p>
    </>
  )
}

/** One piece of Cub Power news over the home screen. Stays until tapped. */
export function PowerNoticePop({ notice, onClose }: Props) {
  return (
    <div className="power-pop" role="presentation" onClick={onClose}>
      <div className="power-pop-card" role="dialog" aria-modal="true" aria-label="Cub Power news">
        <div className="power-pop-face">
          {notice.kind === 'streak' ? (
            <StreakBody day={notice.day} multiplier={notice.multiplier} reset={notice.reset} />
          ) : notice.kind === 'boost' ? (
            <>
              <Trophy className="power-pop-icon" />
              <p className="power-pop-kicker">Last week's leaderboard</p>
              <h2>{weeklyPlaceLabel(notice.place)}!</h2>
              <p className="power-pop-main">+{notice.boost} Cub Power this week</p>
              {notice.endsAt ? <p className="power-pop-note">Until {whenText(notice.endsAt)}</p> : null}
            </>
          ) : (
            <>
              <PowerBolt className="power-pop-icon" />
              <p className="power-pop-kicker">Cub Power tier up</p>
              <h2>{notice.percent}% bonuses!</h2>
              <p className="power-pop-main">
                +{notice.percent}% Cub Cash · +{notice.percent}% XP · {notice.percent}% off wardrobe
              </p>
            </>
          )}
          <p className="power-pop-tap">Tap to continue</p>
        </div>
      </div>
    </div>
  )
}
