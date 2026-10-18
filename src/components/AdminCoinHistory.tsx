import { useState } from 'react'
import type { LedgerEntry } from '../game/admin'

type Filter = 'all' | 'spent' | 'earned'

/** "Spent: Wardrobe - Old cub Mane Black" splits into a group ("Wardrobe") and a detail. */
function spendGroup(reason: string) {
  if (/^admin/i.test(reason)) return 'Admin removed'
  if (reason === 'balance change') return 'Before labels'
  const body = reason.replace(/^Spent:\s*/i, '')
  const dash = body.indexOf(' - ')
  return dash > 0 ? body.slice(0, dash) : body
}

function cleanReason(reason: string) {
  if (reason === 'balance change') return 'Coin change (before labels were added)'
  return reason.replace(/^(Spent|Earned):\s*/i, '')
}

function when(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Every Cub Cash change for one player, with what they spent coins on. */
export function AdminCoinHistory({ history }: { history: LedgerEntry[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const spent = history.filter((entry) => entry.amount < 0)
  const earned = history.filter((entry) => entry.amount > 0)
  const totalSpent = spent.reduce((sum, entry) => sum - entry.amount, 0)
  const totalEarned = earned.reduce((sum, entry) => sum + entry.amount, 0)
  const groups = new Map<string, { coins: number; count: number }>()
  for (const entry of spent) {
    const group = spendGroup(entry.reason)
    const current = groups.get(group) ?? { coins: 0, count: 0 }
    groups.set(group, { coins: current.coins - entry.amount, count: current.count + 1 })
  }
  const shown = filter === 'spent' ? spent : filter === 'earned' ? earned : history

  return (
    <div className="admin-coins">
      <h3>Coin transactions</h3>
      <div className="admin-coins-totals">
        <div>
          <span>Spent</span>
          <strong className="admin-coins-out">{totalSpent.toLocaleString('en-US')}</strong>
        </div>
        <div>
          <span>Earned</span>
          <strong className="admin-coins-in">{totalEarned.toLocaleString('en-US')}</strong>
        </div>
      </div>
      {groups.size > 0 ? (
        <ul className="admin-coins-groups" aria-label="Spending by type">
          {[...groups.entries()]
            .sort((a, b) => b[1].coins - a[1].coins)
            .map(([group, info]) => (
              <li key={group}>
                <span>{group}</span>
                <span>
                  {info.count} × · {info.coins.toLocaleString('en-US')} coins
                </span>
              </li>
            ))}
        </ul>
      ) : null}
      <div className="admin-coins-filter" role="tablist" aria-label="Show">
        {(['all', 'spent', 'earned'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? 'on' : ''}
            onClick={() => setFilter(value)}
          >
            {value === 'all' ? 'All' : value === 'spent' ? 'Spent' : 'Earned'}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p>{filter === 'spent' ? 'No coins spent yet.' : filter === 'earned' ? 'No coins earned yet.' : 'No coin changes yet.'}</p>
      ) : (
        <ul className="admin-history">
          {shown.map((entry, index) => (
            <li key={`${entry.created_at}-${index}`}>
              <strong className={entry.amount < 0 ? 'admin-coins-out' : 'admin-coins-in'}>
                {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
              </strong>
              <span>
                {cleanReason(entry.reason)}
                {entry.actor && entry.reason.startsWith('Admin') ? ` (by ${entry.actor})` : ''}
                <small>{when(entry.created_at)}</small>
              </span>
              <span>Bal {entry.balance_after.toLocaleString('en-US')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
