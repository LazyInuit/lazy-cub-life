import { useEffect, useState } from 'react'
import { loadCubPowerBoard, type CubPowerBoardPage, type CubPowerRow } from '../game/leaderboard'
import { hasProfileCard } from '../game/profileArt'
import { PowerBolt } from './CubPowerPanel'

function rowClass(row: CubPowerRow) {
  const medal = row.rank === 1 ? 'gold' : row.rank === 2 ? 'silver' : row.rank === 3 ? 'bronze' : ''
  return [medal, row.mine ? 'mine' : ''].filter(Boolean).join(' ')
}

function PowerValue({ power }: { power: number }) {
  return (
    <span className="leaderboard-score power-board-value">
      <PowerBolt className="power-board-bolt" />
      {power.toLocaleString('en-US')}
    </span>
  )
}

/**
 * Every player ranked by Cub Power right now, shown inside the Cub Power panel. With onOpenProfile,
 * names open the player's profile card, with Visit, like the game leaderboard.
 */
export function CubPowerBoard({
  onBack,
  onOpenProfile,
}: {
  onBack: () => void
  onOpenProfile?: (username: string, mine: boolean) => void
}) {
  const [page, setPage] = useState<CubPowerBoardPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let cancel = false
    loadCubPowerBoard(0)
      .then((first) => {
        if (!cancel) setPage(first)
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : 'Could not load the Cub Power leaderboard.')
      })
    return () => {
      cancel = true
    }
  }, [])

  const loadMore = () => {
    if (!page) return
    setLoadingMore(true)
    loadCubPowerBoard(page.rows.length)
      .then((next) => setPage({ ...next, rows: [...page.rows, ...next.rows] }))
      .catch(() => undefined)
      .finally(() => setLoadingMore(false))
  }

  const mineShown = page?.rows.some((row) => row.mine) ?? false

  return (
    <div className="power-board">
      <div className="power-board-head">
        <button type="button" className="power-board-back" onClick={onBack}>
          ‹ Back
        </button>
        <h2 className="achievements-title">Leaderboard</h2>
      </div>
      <p className="power-board-note">Every cub's Cub Power right now.</p>
      {error ? <p className="leaderboard-empty">{error}</p> : null}
      {!error && !page ? <p className="leaderboard-empty">Loading...</p> : null}
      {page && page.rows.length === 0 ? <p className="leaderboard-empty">No cubs on the board yet.</p> : null}
      {page && page.rows.length > 0 ? (
        <ol className="leaderboard-list power-board-list">
          {page.rows.map((row) => {
            const canOpen = onOpenProfile !== undefined && hasProfileCard(row.username)
            const cells = (
              <>
                <span className="leaderboard-rank">{row.rank}</span>
                <span className="leaderboard-player">
                  <span className="leaderboard-name-line">
                    <strong>{row.username}</strong>
                    {row.mine ? <span className="leaderboard-you">You</span> : null}
                    {!row.mine && canOpen ? <span className="leaderboard-visit">Visit</span> : null}
                  </span>
                </span>
                <PowerValue power={row.power} />
              </>
            )
            if (!canOpen) {
              return (
                <li key={row.username} className={rowClass(row)}>
                  {cells}
                </li>
              )
            }
            return (
              <li key={row.username} className={`${rowClass(row)} has-profile`.trim()}>
                <button
                  type="button"
                  className="leaderboard-row-btn"
                  aria-label={row.mine ? 'View your profile' : `View ${row.username}'s profile`}
                  onClick={() => onOpenProfile(row.username, row.mine)}
                >
                  {cells}
                </button>
              </li>
            )
          })}
        </ol>
      ) : null}
      {page && page.rows.length < page.total ? (
        <button type="button" className="leaderboard-more power-board-more" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? 'Loading...' : 'Show more'}
        </button>
      ) : null}
      {page?.mine && !mineShown ? (
        <ol className="leaderboard-list power-board-list power-board-mine">
          <li className="mine">
            <span className="leaderboard-rank">{page.mine.rank}</span>
            <span className="leaderboard-player">
              <span className="leaderboard-name-line">
                <strong>{page.mine.username}</strong>
                <span className="leaderboard-you">You</span>
              </span>
            </span>
            <PowerValue power={page.mine.power} />
          </li>
        </ol>
      ) : null}
    </div>
  )
}
