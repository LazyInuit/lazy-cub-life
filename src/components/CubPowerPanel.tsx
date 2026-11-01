import { useEffect, useRef, useState } from 'react'
import { MAX_STREAK_DAYS, powerToNextTier, streakMultiplier, weeklyPlaceLabel, type CubPower } from '../game/cubPower'
import loginStreakUrl from '../assets/home/login-streak.png'

type Props = {
  power: CubPower | null
  /** Set when showing another player's Cub Power on a visit. */
  ownerName?: string
  /** More games now count towards badge Power than this phone last saw. */
  newGame?: boolean
  onSeenNewGame?: () => void
  /** Must keep the same identity between renders: it runs once when the panel opens. */
  onRefresh?: () => unknown
  onClose: () => void
}

const TIER_FOR_POINTS: Record<number, string> = { 10: 'Bronze', 25: 'Silver', 50: 'Gold', 75: 'Platinum', 100: 'Diamond' }

export function PowerBolt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 2 4 13.5h6.5L9 22l11-12.5h-6.8z" fill="currentColor" />
    </svg>
  )
}

export function Trophy({ className = 'power-trophy-icon' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.4A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.4 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z"
        fill="currentColor"
      />
    </svg>
  )
}

/** Centres of the seven day circles in login-streak.png, as a share of its width. */
const STREAK_CIRCLES_X = [45.85, 53.17, 60.4, 67.53, 74.8, 82.03, 89.31]

/** The login streak artwork, with a circle filled green for each day of the current streak. */
export function LoginStreakBar({ days }: { days: number }) {
  const filled = Math.min(Math.max(0, days), STREAK_CIRCLES_X.length)
  return (
    <div className="power-streak-bar" role="img" aria-label={`Login streak: ${filled} of 7 days`}>
      <img src={loginStreakUrl} alt="" />
      {STREAK_CIRCLES_X.map((x, index) => (
        <span key={x} className={index < filled ? 'on' : ''} style={{ left: `${x}%` }} />
      ))}
    </div>
  )
}

/** Today's date in UTC (YYYY-MM-DD). A new login day starts at midnight UTC. */
function utcDay(at: number) {
  return new Date(at).toISOString().slice(0, 10)
}

function countdownText(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

/**
 * When the next day of the login streak can be collected, in the player's own time zone, with a live
 * countdown. When it arrives the panel refreshes, which counts that day's login.
 */
function StreakClock({ power, onRefresh }: { power: CubPower; onRefresh?: () => unknown }) {
  const [now, setNow] = useState(() => Date.now())
  // The panel already refreshes when it opens, so only a new day starting while it is open asks again.
  const askedFor = useRef(utcDay(Date.now()))
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const today = utcDay(now)
  const counted = power.lastLoginDay === today
  useEffect(() => {
    if (counted || askedFor.current === today) return
    askedFor.current = today
    onRefresh?.()
  }, [counted, today, onRefresh])

  const date = new Date(now)
  const nextAt = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
  const opensAt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(nextAt)

  return (
    <div className="power-streak-clock" role="timer" aria-live="polite">
      {counted ? (
        <p className="power-streak-done">✓ Day {power.streakCount} login achieved today</p>
      ) : (
        <p className="power-streak-done waiting">Counting today's login...</p>
      )}
      <p className="power-streak-countdown">
        Next login day in <strong>{countdownText(nextAt - now)}</strong>
      </p>
      <p className="power-streak-opens">Opens at {opensAt}</p>
    </div>
  )
}

export function multiplierText(percent: number) {
  return `×${(percent / 100).toFixed(2)}`
}

export function whenText(at: number | null) {
  if (at == null) return null
  return new Date(at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

/** Cub Power: the total, what it is made of, and what it gives. */
export function CubPowerPanel({ power, ownerName, newGame = false, onSeenNewGame, onRefresh, onClose }: Props) {
  useEffect(() => {
    onRefresh?.()
  }, [onRefresh])
  const title = ownerName ? `${ownerName}'s Cub Power` : 'Cub Power'

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const next = power ? powerToNextTier(power.total) : null
  const placeLabel = power ? weeklyPlaceLabel(power.boostPlace) : null

  return (
    <div className="profile-pop" role="presentation" onClick={onClose}>
      <div
        className="profile-card achievements-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="profile-close" onClick={onClose} aria-label={`Close ${title}`}>
          ×
        </button>
        <div className="profile-card-face achievements-face power-face">
          {ownerName ? <p className="power-owner">{ownerName}'s</p> : null}
          <h2 className="achievements-title">Cub Power</h2>
          {!power ? (
            <p className="profile-empty">Loading...</p>
          ) : (
            <>
              <p className="power-total">
                <PowerBolt className="power-bolt" />
                {power.total.toLocaleString('en-US')}
              </p>
              <LoginStreakBar days={power.streakCount} />
              <div className="power-streak-text">
                <p className="power-streak-today">Cub Power {multiplierText(power.streakMultiplier)} today</p>
                {ownerName ? null : (
                  <p className="power-streak-next">
                    {power.streakDays >= MAX_STREAK_DAYS
                      ? 'Top streak bonus reached. Keep logging in to hold it!'
                      : `Log in tomorrow for ${multiplierText(streakMultiplier(power.streakDays + 1))}.`}
                  </p>
                )}
              </div>
              {ownerName ? null : <StreakClock power={power} onRefresh={onRefresh} />}
              {newGame && onSeenNewGame ? (
                <div className="power-note" role="status">
                  <p>New game added! Earn its achievement badges to build your Cub Power.</p>
                  <button type="button" onClick={onSeenNewGame}>
                    Got it
                  </button>
                </div>
              ) : null}

              <section className="power-section">
                <h3>Active benefits</h3>
                {power.percent > 0 ? (
                  <ul className="power-benefits">
                    <li>
                      <strong>+{power.percent}%</strong> Cub Cash
                    </li>
                    <li>
                      <strong>+{power.percent}%</strong> XP
                    </li>
                    <li>
                      <strong>{power.percent}%</strong> off wardrobe
                    </li>
                  </ul>
                ) : (
                  <p className="power-quiet">
                    {ownerName ? 'No bonuses yet. They start at 100 Cub Power.' : 'Reach 100 Cub Power to unlock your first 1%.'}
                  </p>
                )}
                <p className="power-next">
                  {next === null
                    ? 'Maximum benefits unlocked!'
                    : `${next.toLocaleString('en-US')} more Power to unlock ${power.percent + 1}%.`}
                </p>
              </section>

              <section className="power-section">
                <h3>How it adds up</h3>
                <dl className="power-parts">
                  <div>
                    <dt>Badge Power</dt>
                    <dd>{power.badgePower.toLocaleString('en-US')}</dd>
                  </div>
                  <div>
                    <dt>
                      Level Power <small>Lv {power.level}</small>
                    </dt>
                    <dd>{power.levelPower.toLocaleString('en-US')}</dd>
                  </div>
                  <div>
                    <dt>
                      Login streak{' '}
                      <small>
                        {power.streakCount > 0 ? `${power.streakCount} day${power.streakCount === 1 ? '' : 's'}` : 'none'}
                      </small>
                    </dt>
                    <dd>{multiplierText(power.streakMultiplier)}</dd>
                  </div>
                  <div>
                    <dt>Leaderboard Reward</dt>
                    <dd>+{power.boost}</dd>
                  </div>
                </dl>
                {placeLabel ? (
                  <p className="power-trophy">
                    <Trophy />
                    <span>
                      {placeLabel} — +{power.boost} Power
                      {power.boostEndsAt ? <small>Until {whenText(power.boostEndsAt)}</small> : null}
                    </span>
                  </p>
                ) : null}
              </section>

              <section className="power-section">
                <h3>Badges</h3>
                <ul className="power-games">
                  {power.badges.map((game) => (
                    <li key={game.game}>
                      <span>{game.title}</span>
                      <span className={game.points > 0 ? 'power-tier' : 'power-tier none'}>
                        {TIER_FOR_POINTS[game.points] ?? 'No badge'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="power-section power-help">
                <p>
                  Your highest badge in each game counts (Bronze 10 up to Diamond 100). All Diamonds always make 700
                  Badge Power, so a new game lowers it until you earn that game's badges.
                </p>
                <p>Each level adds Power: +5 up to level 25, +3 to 50, +2 to 100, then +1.</p>
                <p>
                  Log in 7 days in a row for up to ×1.35. Bonus resets if a daily login is missed. Days change at
                  midnight UTC.
                </p>
                <p>
                  Finish in this week's overall leaderboard top 10 for a boost next week: 1st +100, 2nd +75, 3rd +50,
                  4th–10th +25. Weeks end Monday midnight US Eastern.
                </p>
                <p>Every 100 Cub Power adds 1% to each benefit, up to 10%. Leaderboard scores are never changed.</p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
