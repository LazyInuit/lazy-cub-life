import { useEffect, useState } from 'react'
import { ACTIVITY_AREAS } from '../game/activity'
import { adminOverview, type AdminOverview as Overview } from '../game/admin'

/** Coins earned in 24 hours at or above this get a "check" flag on the watch list. */
const WATCH_COINS = 300

function count(value: number) {
  return value.toLocaleString('en-US')
}

/** "3 h 20 min", "45 min" or "< 1 min". */
export function formatPlayTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 60) return seconds > 0 ? '< 1 min' : '0 min'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${count(hours)} h ${rest} min` : `${count(hours)} h`
}

function dayLabel(day: string) {
  const date = new Date(`${day}T12:00:00`)
  if (Number.isNaN(date.getTime())) return day
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
}

type Props = {
  /** Bumped by the page's Refresh button. */
  refreshKey: number
  onPickPlayer: (id: string, username: string) => void
}

/** Players, sign-ups, the most played games, and big coin earners, at a glance. */
export function AdminOverview({ refreshKey, onPickPlayer }: Props) {
  const [overview, setOverview] = useState<Overview | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    setError(null)
    void adminOverview()
      .then((next) => {
        if (!cancel) setOverview(next)
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : 'Could not load the overview.')
      })
    return () => {
      cancel = true
    }
  }, [refreshKey])

  if (error) {
    return (
      <section className="admin-card admin-wide">
        <p className="admin-error">{error}</p>
      </section>
    )
  }
  if (overview === undefined) {
    return (
      <section className="admin-card admin-wide">
        <p>Loading the overview…</p>
      </section>
    )
  }
  if (overview === null) {
    return (
      <section className="admin-card admin-wide">
        <h2>Overview</h2>
        <p>
          The overview needs one database update. In the Supabase SQL editor, paste <code>supabase/admin-overview.sql</code>{' '}
          and run it, then press Refresh.
        </p>
      </section>
    )
  }

  const games = ACTIVITY_AREAS.map((area) => ({ ...area, ...(overview.areas[area.id] ?? { seconds: 0, players: 0 }) })).sort(
    (a, b) => b.seconds - a.seconds,
  )
  const topSeconds = Math.max(1, ...games.map((game) => game.seconds))
  const topSignups = Math.max(1, ...overview.signups.map((day) => day.count))

  return (
    <>
      <section className="admin-tiles admin-wide" aria-label="Players at a glance">
        <div className="admin-tile">
          <span>Players</span>
          <strong>{count(overview.players)}</strong>
          <small>accounts</small>
        </div>
        <div className="admin-tile">
          <span>New</span>
          <strong>{count(overview.newToday)}</strong>
          <small>today · {count(overview.newWeek)} this week</small>
        </div>
        <div className="admin-tile">
          <span>Active</span>
          <strong>{count(overview.activeToday)}</strong>
          <small>today · {count(overview.activeWeek)} this week</small>
        </div>
        <div className="admin-tile">
          <span>Cub Cash held</span>
          <strong>{count(overview.cashHeld)}</strong>
          <small>across all players</small>
        </div>
        <div className={`admin-tile${overview.banned > 0 ? ' admin-tile-warn' : ''}`}>
          <span>Banned</span>
          <strong>{count(overview.banned)}</strong>
          <small>accounts</small>
        </div>
      </section>

      <div className="admin-overview-grid admin-wide">
        <section className="admin-card">
          <h2>Sign-ups</h2>
          <p className="admin-muted">New accounts each day, last 14 days.</p>
          <div className="admin-spark" role="img" aria-label="New accounts per day for the last 14 days">
            {overview.signups.map((day) => (
              <div key={day.day} className="admin-spark-day" title={`${dayLabel(day.day)}: ${day.count}`}>
                <span className="admin-spark-count">{day.count > 0 ? day.count : ''}</span>
                <span className="admin-spark-bar" style={{ height: `${Math.max(4, (day.count / topSignups) * 100)}%` }} />
                <span className="admin-spark-label">{dayLabel(day.day).split(' ')[1]}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-card">
          <h2>Most played</h2>
          <p className="admin-muted">Total time spent by all players, and how many have played each.</p>
          <ul className="admin-bars">
            {games.map((game) => (
              <li key={game.id}>
                <div className="admin-bar-head">
                  <span>{game.label}</span>
                  <span>
                    <strong>{formatPlayTime(game.seconds)}</strong> · {count(game.players)} players
                  </span>
                </div>
                <span className="admin-bar-track">
                  <span className="admin-bar-fill" style={{ width: `${(game.seconds / topSeconds) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="admin-card">
          <h2>Watch list</h2>
          <p className="admin-muted">Most Cub Cash earned in the last 24 hours. {count(WATCH_COINS)}+ is flagged to check.</p>
          {overview.earners.length === 0 ? (
            <p>No coins earned in the last 24 hours.</p>
          ) : (
            <ul className="admin-watch">
              {overview.earners.map((earner) => (
                <li key={earner.id}>
                  <button type="button" onClick={() => onPickPlayer(earner.id, earner.username)}>
                    <span className="admin-watch-name">
                      {earner.username}
                      {earner.banned ? <em className="admin-chip admin-chip-bad">Banned</em> : null}
                      {earner.earned >= WATCH_COINS ? <em className="admin-chip admin-chip-warn">Check</em> : null}
                    </span>
                    <span>
                      <strong className="admin-coins-in">+{count(earner.earned)}</strong>
                      <small> in {count(earner.grants)} payouts</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
