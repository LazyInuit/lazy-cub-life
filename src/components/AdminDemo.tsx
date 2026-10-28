import { useEffect, useState } from 'react'
import { ACTIVITY_AREAS } from '../game/activity'
import { adminDemoStats, type DemoStats } from '../game/admin'

const RANGES = [
  { id: 'week', label: 'Last 7 days' },
  { id: 'all', label: 'All time' },
] as const

function count(value: number) {
  return value.toLocaleString('en-US')
}

function percent(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—'
}

function dayNumber(day: string) {
  const date = new Date(`${day}T12:00:00`)
  return Number.isNaN(date.getTime()) ? day : String(date.getDate())
}

/** Anonymous demo counts: players, sign-ups from the demo, and which games demo players try. */
export function AdminDemo({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<DemoStats | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('week')

  useEffect(() => {
    let cancel = false
    setError(null)
    void adminDemoStats()
      .then((next) => {
        if (!cancel) setStats(next)
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : 'Could not load demo stats.')
      })
    return () => {
      cancel = true
    }
  }, [refreshKey])

  if (error) {
    return (
      <section className="admin-card admin-wide">
        <h2>Demo version</h2>
        <p className="admin-error">{error}</p>
      </section>
    )
  }
  if (stats === undefined) return null
  if (stats === null) {
    return (
      <section className="admin-card admin-wide">
        <h2>Demo version</h2>
        <p>
          Demo counts need one database update. In the Supabase SQL editor, paste <code>supabase/demo-stats.sql</code> and
          run it. Counting starts from then.
        </p>
      </section>
    )
  }

  const games = range === 'week' ? stats.gamesWeek : stats.gamesAll
  const rows = ACTIVITY_AREAS.filter((area) => area.id !== 'home' && area.id !== 'wardrobe')
    .map((area) => ({ ...area, runs: games[area.id] ?? 0 }))
    .sort((a, b) => b.runs - a.runs)
  const topRuns = Math.max(1, ...rows.map((row) => row.runs))
  const topDay = Math.max(1, ...stats.days.map((day) => day.count))
  const since = stats.since ? new Date(`${stats.since}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null

  return (
    <section className="admin-card admin-wide admin-demo">
      <div className="admin-section-head">
        <h2>Demo version</h2>
        <span className="admin-muted">Anonymous counts, one per device per day{since ? ` · counting since ${since}` : ''}</span>
      </div>

      <div className="admin-tiles admin-tiles-small admin-demo-tiles">
        <div className="admin-tile">
          <span>Demo players</span>
          <strong>{count(stats.startsToday)}</strong>
          <small>today · {count(stats.startsWeek)} this week · {count(stats.startsAll)} all time</small>
        </div>
        <div className="admin-tile">
          <span>Made an account</span>
          <strong>{count(stats.signupsWeek)}</strong>
          <small>
            this week ({percent(stats.signupsWeek, stats.startsWeek)}) · {count(stats.signupsAll)} all time (
            {percent(stats.signupsAll, stats.startsAll)})
          </small>
        </div>
      </div>

      <div className="admin-demo-grid">
        <div>
          <h3>Demo players per day</h3>
          <div className="admin-spark" role="img" aria-label="Demo players per day for the last 14 days">
            {stats.days.map((day) => (
              <div key={day.day} className="admin-spark-day" title={`${day.day}: ${day.count}`}>
                <span className="admin-spark-count">{day.count > 0 ? day.count : ''}</span>
                <span className="admin-spark-bar admin-spark-bar-demo" style={{ height: `${Math.max(4, (day.count / topDay) * 100)}%` }} />
                <span className="admin-spark-label">{dayNumber(day.day)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="admin-section-head">
            <h3>Games tried in the demo</h3>
            <div className="admin-coins-filter admin-demo-range" role="tablist" aria-label="Time range">
              {RANGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={range === item.id}
                  className={range === item.id ? 'on' : ''}
                  onClick={() => setRange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <ul className="admin-bars">
            {rows.map((row) => (
              <li key={row.id}>
                <div className="admin-bar-head">
                  <span>{row.label}</span>
                  <span>
                    <strong>{count(row.runs)}</strong> players
                  </span>
                </div>
                <span className="admin-bar-track">
                  <span className="admin-bar-fill" style={{ width: `${(row.runs / topRuns) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
