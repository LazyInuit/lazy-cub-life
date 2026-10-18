import { useEffect, useRef, useState } from 'react'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import {
  LEADERBOARD_BOARDS,
  WEEKLY_OVERALL_PRIZES,
  formatCountdown,
  loadLeaderboard,
  nextEasternReset,
  type LeaderboardBoard,
  type LeaderboardPeriod,
  type LeaderboardRow,
  type PlayerProfile,
} from '../game/leaderboard'
import { hasProfileCard } from '../game/profileArt'
import { settleWeeklyPrize, type WeeklyWinner } from '../game/wallet'
import type { WalletPatch } from '../game/wallet'
import { GamesButton, HomeButton } from './HomeButton'
import { PlayerProfileCard } from './PlayerProfileCard'
import { VisitHome } from './VisitHome'

type Props = {
  onHome: () => void
  onGames: () => void
  onSettlePrize?: (patch?: WalletPatch | null) => void
}

export function LeaderboardScreen({ onHome, onGames, onSettlePrize }: Props) {
  const [game, setGame] = useState<LeaderboardBoard>('overall')
  const [period, setPeriod] = useState<LeaderboardPeriod>('week')
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [total, setTotal] = useState(0)
  const [resetsAt, setResetsAt] = useState<string | null>(null)
  const [serverNow, setServerNow] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [lastWinners, setLastWinners] = useState<WeeklyWinner[]>([])
  const [profileOpen, setProfileOpen] = useState<{ username: string; mine: boolean } | null>(null)
  const [visiting, setVisiting] = useState<PlayerProfile | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollTop = useRef(0)
  const countdown = useCountdown(resetsAt, serverNow)
  const board = LEADERBOARD_BOARDS.find((item) => item.id === game)
  const more = !loading && !note && rows.length < total

  useEffect(() => {
    let cancel = false
    void settleWeeklyPrize().then((prize) => {
      if (cancel) return
      setLastWinners(prize?.winners ?? [])
      onSettlePrize?.(prize)
    })
    return () => {
      cancel = true
    }
  }, [onSettlePrize])

  useEffect(() => {
    let cancel = false
    const first = offset === 0
    if (first) setLoading(true)
    else setLoadingMore(true)
    void loadLeaderboard(game, period, offset)
      .then((page) => {
        if (cancel) return
        setRows((current) => (first ? page.rows : [...current, ...page.rows]))
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
    setNote(null)
    setLoading(true)
    setMenuOpen(false)
  }

  const pickPeriod = (next: LeaderboardPeriod) => {
    setPeriod(next)
    setOffset(0)
    setRows([])
    setNote(null)
    setLoading(true)
  }

  useEffect(() => {
    if (visiting) return
    const list = scrollRef.current
    if (list) list.scrollTop = scrollTop.current
  }, [visiting])

  if (visiting) {
    return <VisitHome profile={visiting} onReturn={() => setVisiting(null)} />
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
      {game === 'overall' && period === 'week' ? (
        <div
          className="leaderboard-prize-banner"
          aria-label={WEEKLY_OVERALL_PRIZES.map((prize) => {
            const winner = lastWinners.find((row) => row.place === prize.place)?.username ?? 'not decided yet'
            return `${prize.label} wins ${prize.amount} Cub Cash. Last week's ${prize.label} is ${winner}.`
          }).join(' ')}
        >
          <div className="leaderboard-prize-head">
            <span>This week prizes</span>
            <span>Last week winners</span>
          </div>
          {WEEKLY_OVERALL_PRIZES.map((prize) => {
            const winner = lastWinners.find((row) => row.place === prize.place)?.username
            return (
              <div className="leaderboard-prize-row" key={prize.place}>
                <div className="leaderboard-prize-offer">
                  <span className="leaderboard-prize-place">
                    <PlaceMedal place={prize.place} />
                    <span className="leaderboard-prize-kicker">{prize.label}</span>
                  </span>
                  <span className="leaderboard-prize-amount">
                    <img src={coinUrl} alt="" />
                    {prize.amount}
                  </span>
                </div>
                <div className="leaderboard-prize-winner">
                  <strong className="leaderboard-prize-name">{winner ?? '—'}</strong>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="leaderboard-scroll" ref={scrollRef}>
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
                  <span className="leaderboard-name-line">
                    {hasProfileCard(row.username) ? (
                      <button
                        type="button"
                        className="leaderboard-name-btn"
                        aria-label={`View ${row.username}'s profile`}
                        onClick={() => setProfileOpen({ username: row.username, mine: row.mine })}
                      >
                        <strong>{row.username}</strong>
                      </button>
                    ) : (
                      <strong>{row.username}</strong>
                    )}
                    {row.mine ? <span className="leaderboard-you">You</span> : null}
                  </span>
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
      {profileOpen ? (
        <PlayerProfileCard
          key={profileOpen.username}
          username={profileOpen.username}
          mine={profileOpen.mine}
          onClose={() => setProfileOpen(null)}
          onVisit={(profile) => {
            scrollTop.current = scrollRef.current?.scrollTop ?? 0
            setProfileOpen(null)
            setVisiting(profile)
          }}
        />
      ) : null}
    </section>
  )
}

function PlaceMedal({ place }: { place: number }) {
  const face = place === 1 ? '#ffe08a' : place === 2 ? '#f4f7fb' : '#f0b27a'
  const edge = place === 1 ? '#8d5224' : place === 2 ? '#5e6b7c' : '#7a4520'
  const shade = place === 1 ? '#c4843e' : place === 2 ? '#9aa6b5' : '#a86432'
  return (
    <svg className="leaderboard-prize-medal" viewBox="0 0 32 36" aria-hidden="true">
      <path d="M10 1.5h5.2L16 14h-7.2z" fill="#d24b42" />
      <path d="M16.8 1.5H22L23.2 14H16z" fill="#3d6fbe" />
      <circle cx="16" cy="22" r="11" fill={shade} />
      <circle cx="16" cy="22" r="8.4" fill={face} stroke={edge} strokeWidth="1.4" />
      <circle cx="16" cy="22" r="6.2" fill="none" stroke={edge} strokeWidth="0.8" opacity="0.55" />
      <text x="16" y="25.5" textAnchor="middle" fontSize="9" fontWeight="800" fill={edge}>
        {place}
      </text>
    </svg>
  )
}

function rowClass(row: LeaderboardRow) {
  if (row.rank === 1) return 'gold'
  if (row.rank === 2) return 'silver'
  if (row.rank === 3) return 'bronze'
  return ''
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
