import { useEffect, useRef, useState } from 'react'
import {
  LEADERBOARD_BOARDS,
  formatCountdown,
  loadLeaderboard,
  nextEasternReset,
  type LeaderboardBoard,
  type LeaderboardPeriod,
  type LeaderboardRow,
  type LeaderboardStanding,
} from '../game/leaderboard'
import { GamesButton, HomeButton } from './HomeButton'

type Props = {
  onHome: () => void
  onGames: () => void
}

export function LeaderboardScreen({ onHome, onGames }: Props) {
  const [game, setGame] = useState<LeaderboardBoard>('overall')
  const [period, setPeriod] = useState<LeaderboardPeriod>('week')
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [mine, setMine] = useState<LeaderboardStanding | null>(null)
  const [total, setTotal] = useState(0)
  const [resetsAt, setResetsAt] = useState<string | null>(null)
  const [serverNow, setServerNow] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const countdown = useCountdown(resetsAt, serverNow)
  const board = LEADERBOARD_BOARDS.find((item) => item.id === game)
  const more = !loading && !note && rows.length < total

  useEffect(() => {
    let cancel = false
    const first = offset === 0
    if (first) setLoading(true)
    else setLoadingMore(true)
    void loadLeaderboard(game, period, offset)
      .then((page) => {
        if (cancel) return
        setRows((current) => (first ? page.rows : [...current, ...page.rows]))
        setMine(page.mine)
        setTotal(page.total)
        if (page.resetsAt) setResetsAt(page.resetsAt)
        if (page.serverNow) setServerNow(page.serverNow)
        setNote(null)
        setLoading(false)
        setLoadingMore(false)
      })
      .catch((reason: unknown) => {
        if (cancel) return
        if (first) setRows([])
        setNote(reason instanceof Error ? reason.message : 'Could not load scores.')
        setLoading(false)
        setLoadingMore(false)
      })
    return () => {
      cancel = true
    }
  }, [game, period, offset])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const pickGame = (next: LeaderboardBoard) => {
    setGame(next)
    setOffset(0)
    setRows([])
    setMine(null)
    setNote(null)
    setLoading(true)
    setMenuOpen(false)
  }

  const pickPeriod = (next: LeaderboardPeriod) => {
    setPeriod(next)
    setOffset(0)
    setRows([])
    setMine(null)
    setNote(null)
    setLoading(true)
  }

  return (
    <section className="game-screen leaderboard-screen">
      <header className="top leaderboard-top">
        <div className="leaderboard-nav">
          <HomeButton className="game-home" onClick={onHome} />
          <GamesButton className="game-home" onClick={onGames} />
        </div>
        <h1>Leaderboards</h1>
      </header>

      <div className="leaderboard-field">
        <span>Leaderboard Selection</span>
        <div className="leaderboard-select-wrap" ref={menuRef}>
          <button
            type="button"
            className="leaderboard-select"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="leaderboard-select-mark" aria-hidden="true">
              🏆
            </span>
            <span className="leaderboard-select-value">{board?.label}</span>
          </button>
          {menuOpen ? (
            <ul className="leaderboard-menu" role="listbox" aria-label="Leaderboard">
              {LEADERBOARD_BOARDS.map((item) => (
                <li key={item.id}>
                  <button type="button" role="option" aria-selected={item.id === game} onClick={() => pickGame(item.id)}>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="leaderboard-switch" role="tablist" aria-label="Score period">
        <button type="button" role="tab" aria-selected={period === 'week'} onClick={() => pickPeriod('week')}>
          This Week
        </button>
        <button type="button" role="tab" aria-selected={period === 'all'} onClick={() => pickPeriod('all')}>
          All Time
        </button>
      </div>
      <p className="leaderboard-countdown">Week resets in {countdown}</p>

      <div className="leaderboard-scroll">
        <div className="leaderboard-heading">
          <h2>{game === 'overall' ? 'Overall Rankings' : board?.label}</h2>
          <p>
            {game === 'overall'
              ? 'Best from each game, added up.'
              : period === 'week'
                ? 'Best score this week.'
                : 'Best score ever.'}
          </p>
        </div>
        {loading ? <p className="leaderboard-empty">Loading scores...</p> : null}
        {note ? <p className="leaderboard-empty">{note}</p> : null}
        {!loading && !note && rows.length === 0 ? (
          <p className="leaderboard-empty">{period === 'week' ? 'No scores yet this week.' : 'No scores yet.'}</p>
        ) : null}
        {!loading && !note && rows.length > 0 ? (
          <ol className="leaderboard-list">
            {rows.map((row) => (
              <li key={row.username} className={rowClass(row)}>
                <span className="leaderboard-rank">{row.rank}</span>
                <span className="leaderboard-player">
                  <strong>{row.username}</strong>
                  {row.mine ? <small>Your position</small> : null}
                </span>
                <span className="leaderboard-score">{row.score.toLocaleString('en-US')}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {more ? (
          <button
            type="button"
            className="leaderboard-more"
            disabled={loadingMore}
            onClick={() => setOffset(rows.length)}
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        ) : null}
      </div>

      {!loading && !note ? (
        <div className="leaderboard-yours">
          <div>
            <strong>Your rank</strong>
            <p>{mine ? 'Your best score is on this board.' : 'Finish a game to join this board.'}</p>
          </div>
          <span>{mine ? `#${mine.rank}` : '—'}</span>
        </div>
      ) : null}
    </section>
  )
}

function rowClass(row: LeaderboardRow) {
  const medal = row.rank === 1 ? 'gold' : row.rank === 2 ? 'silver' : row.rank === 3 ? 'bronze' : ''
  return [medal, row.mine ? 'mine' : ''].filter(Boolean).join(' ')
}

function useCountdown(resetsAt: string | null, serverNow: string | null) {
  const [label, setLabel] = useState(() => formatCountdown(nextEasternReset().getTime() - Date.now()))

  useEffect(() => {
    const parsedReset = resetsAt ? Date.parse(resetsAt) : NaN
    const parsedNow = serverNow ? Date.parse(serverNow) : NaN
    const resetMs = Number.isFinite(parsedReset) ? parsedReset : nextEasternReset().getTime()
    const skew = Number.isFinite(parsedNow) ? parsedNow - Date.now() : 0
    const tick = () => {
      const left = resetMs - (Date.now() + skew)
      setLabel(left <= 0 ? '0h 00m 00s' : formatCountdown(left))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [resetsAt, serverNow])

  return label
}
