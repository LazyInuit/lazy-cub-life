import { useEffect, useState } from 'react'
import { ACTIVITY_AREAS } from '../game/activity'
import { adminShareStats, type ShareStatRow, type ShareStats } from '../game/admin'

const ACTIONS = [
  { id: 'save-image', label: 'Scorecard images saved', short: 'Images' },
  { id: 'save-replay', label: 'Replays saved', short: 'Replays' },
  { id: 'x-post', label: 'X posts opened', short: 'X posts' },
  { id: 'share-image', label: 'Images sent from the share menu', short: 'Img shared' },
  { id: 'share-replay', label: 'Replays sent from the share menu', short: 'Vid shared' },
] as const

const RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'all', label: 'All time' },
] as const

type Range = (typeof RANGES)[number]['id']

function count(value: number) {
  return value.toLocaleString('en-US')
}

function total(rows: ShareStatRow[], event: string, range: Range, game?: string) {
  return rows.filter((row) => row.event === event && (game === undefined || row.game === game)).reduce((sum, row) => sum + row[range], 0)
}

/** How often scorecards and replays are saved and shared, today, this week and all time, and per game. */
export function AdminShares({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<ShareStats | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('week')

  useEffect(() => {
    let cancel = false
    setError(null)
    void adminShareStats()
      .then((next) => {
        if (!cancel) setStats(next)
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : 'Could not load share stats.')
      })
    return () => {
      cancel = true
    }
  }, [refreshKey])

  if (error) {
    return (
      <section className="admin-card admin-wide">
        <h2>Scorecards &amp; replays</h2>
        <p className="admin-error">{error}</p>
      </section>
    )
  }
  if (stats === undefined) return null
  if (stats === null) {
    return (
      <section className="admin-card admin-wide">
        <h2>Scorecards &amp; replays</h2>
        <p>
          Share counts need one database update. In the Supabase SQL editor, paste <code>supabase/share-stats.sql</code> and run
          it. Counting starts from then.
        </p>
      </section>
    )
  }

  const since = stats.since ? new Date(`${stats.since}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null
  const games = ACTIVITY_AREAS.filter((area) => area.id !== 'home' && area.id !== 'wardrobe')
    .map((area) => ({ ...area, counts: ACTIONS.map((action) => total(stats.rows, action.id, range, area.id)) }))
    .sort((a, b) => b.counts.reduce((sum, n) => sum + n, 0) - a.counts.reduce((sum, n) => sum + n, 0))

  return (
    <section className="admin-card admin-wide admin-shares">
      <div className="admin-section-head">
        <h2>Scorecards &amp; replays</h2>
        <span className="admin-muted">Each action counts once per scorecard{since ? ` · counting since ${since}` : ''}</span>
      </div>

      <div className="admin-table" role="table" aria-label="Saves and shares">
        <div className="admin-row admin-row-head admin-share-row" role="row">
          <span role="columnheader">Action</span>
          {RANGES.map((item) => (
            <span key={item.id} role="columnheader">
              {item.label}
            </span>
          ))}
        </div>
        {ACTIONS.map((action) => (
          <div key={action.id} className="admin-row admin-share-row" role="row">
            <span role="cell">{action.label}</span>
            {RANGES.map((item) => (
              <strong key={item.id} role="cell">
                {count(total(stats.rows, action.id, item.id))}
              </strong>
            ))}
          </div>
        ))}
      </div>
      <p className="admin-muted admin-share-note">
        X posts opened counts the Open X Post button. Share Image and Share Replay open the phone's share menu, where the player can
        pick X or any other app; the game can't see which.
      </p>

      <div className="admin-section-head">
        <h3>By game</h3>
        <div className="admin-coins-filter admin-demo-range" role="tablist" aria-label="Time range">
          {RANGES.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={range === item.id} className={range === item.id ? 'on' : ''} onClick={() => setRange(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="admin-table" role="table" aria-label="Saves and shares by game">
        <div className="admin-row admin-row-head admin-share-game-row" role="row">
          <span role="columnheader">Game</span>
          {ACTIONS.map((action) => (
            <span key={action.id} role="columnheader">
              {action.short}
            </span>
          ))}
        </div>
        {games.map((game) => (
          <div key={game.id} className="admin-row admin-share-game-row" role="row">
            <span role="cell">{game.label}</span>
            {game.counts.map((value, index) => (
              <span key={ACTIONS[index].id} role="cell">
                {count(value)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
