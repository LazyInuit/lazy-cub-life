import { useEffect, useState } from 'react'
import { coinTotals, type CoinTotals } from '../game/admin'

const RANGES = [
  { id: 'all', label: 'All time', days: null },
  { id: 'week', label: 'Last 7 days', days: 7 },
  { id: 'day', label: 'Today', days: 1 },
] as const

const GAMES = [
  { source: 'flight', label: "Kovu's Space Dash" },
  { source: 'match', label: 'Pride Pairs' },
  { source: 'dojo', label: 'Ninja Cub Dojo' },
  { source: 'archer', label: 'Cupid Archery' },
  { source: 'hoops', label: 'Lazy Hoops' },
  { source: 'bubble', label: 'Bubble Blast' },
  { source: 'river', label: 'Lazy River' },
]

function coins(value: number) {
  return value.toLocaleString('en-US')
}

type Props = {
  /** Leave out for every player. */
  playerId?: string | null
}

/** Coins spent in the shop and wardrobe, and earned in each game, for every player or one. */
export function AdminCoinTotals({ playerId = null }: Props) {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('all')
  const [totals, setTotals] = useState<CoinTotals | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    const days = RANGES.find((item) => item.id === range)?.days ?? null
    setError(null)
    setTotals(null)
    void coinTotals(days, playerId)
      .then((next) => {
        if (!cancel) setTotals(next)
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : 'Could not load coin totals.')
      })
    return () => {
      cancel = true
    }
  }, [range, playerId])

  const gameTotal = totals ? GAMES.reduce((sum, game) => sum + (totals.grants[game.source] ?? 0), 0) : 0
  const since = totals?.labelsSince ? new Date(totals.labelsSince) : null

  const player = playerId !== null
  const content = (
    <>
      {player ? <h3>Coin economy</h3> : <h2>Coin economy</h2>}
      <div className="admin-coins-filter" role="tablist" aria-label="Time range">
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
      {error ? <p className="admin-error">{error}</p> : null}
      {!totals && !error ? <p>Loading...</p> : null}
      {totals ? (
        <>
          <h3>Spent</h3>
          <div className="admin-coins-totals">
            <div>
              <span>Shop</span>
              <strong className="admin-coins-out">{coins(totals.shopCoins)}</strong>
              <small>{coins(totals.shopCount)} drinks</small>
            </div>
            <div>
              <span>Wardrobe</span>
              <strong className="admin-coins-out">{coins(totals.wardrobeCoins)}</strong>
              <small>{coins(totals.wardrobeCount)} items</small>
            </div>
          </div>
          {since && range === 'all' ? (
            <p className="admin-economy-note">
              Shop and wardrobe spending is counted from{' '}
              {since.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, when labels started.
            </p>
          ) : null}
          <h3>Earned</h3>
          <ul className="admin-coins-groups">
            {GAMES.map((game) => (
              <li key={game.source}>
                <span>{game.label}</span>
                <strong className="admin-coins-in">{coins(totals.grants[game.source] ?? 0)}</strong>
              </li>
            ))}
            <li className="admin-economy-sum">
              <span>All games</span>
              <strong className="admin-coins-in">{coins(gameTotal)}</strong>
            </li>
            <li>
              <span>Daily tasks</span>
              <strong className="admin-coins-in">{coins(totals.dailyCoins)}</strong>
            </li>
            <li>
              <span>Weekly overall prizes</span>
              <strong className="admin-coins-in">{coins(totals.grants['weekly-overall'] ?? 0)}</strong>
            </li>
          </ul>
        </>
      ) : null}
    </>
  )

  if (player) return <div className="admin-coins admin-economy-player">{content}</div>
  return <section className="admin-card admin-economy">{content}</section>
}
