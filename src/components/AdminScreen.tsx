import { useEffect, useState } from 'react'
import { signInAccount, signOutAccount, usernameFromUser } from '../game/account'
import {
  adjustCoins,
  adminReady,
  fillEnergy,
  listPlayers,
  playerActivity,
  playerHistory,
  setPlayerBan,
  setPlayerPassword,
  type AdminPlayer,
  type LedgerEntry,
  type PlayerSort,
} from '../game/admin'
import { ACTIVITY_AREAS } from '../game/activity'
import { removeProfilePhoto } from '../game/profilePhoto'
import { AdminCoinHistory } from './AdminCoinHistory'
import { AdminCoinTotals } from './AdminCoinTotals'
import { AdminOverview, formatPlayTime } from './AdminOverview'
import { levelFromXp } from '../game/progress'
import { supabase } from '../game/supabase'

type Gate = 'loading' | 'signed-out' | 'missing' | 'player' | 'admin'
type PlayerTab = 'overview' | 'coins' | 'actions'

const SORTS: { id: PlayerSort; label: string }[] = [
  { id: 'active', label: 'Recently active' },
  { id: 'new', label: 'Newest' },
  { id: 'coins', label: 'Most coins' },
  { id: 'level', label: 'Highest level' },
  { id: 'name', label: 'A–Z' },
]

/** When the player was last in the game, as epoch ms, or 0 if never. */
function lastSeenMs(player: AdminPlayer) {
  const seen = player.last_seen ? new Date(player.last_seen).getTime() : 0
  return Math.max(Number.isFinite(seen) ? seen : 0, player.last_visit || 0)
}

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "4 days ago", or a date. */
function ago(ms: number, now = Date.now()) {
  if (!ms) return 'Never'
  const minutes = Math.floor((now - ms) / 60000)
  if (minutes < 2) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function joined(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Green for today, amber within a week, grey after that. */
function freshness(ms: number, now = Date.now()) {
  if (!ms) return 'old'
  const hours = (now - ms) / 3600000
  return hours < 24 ? 'today' : hours < 24 * 7 ? 'week' : 'old'
}

export function AdminScreen() {
  const [gate, setGate] = useState<Gate>('loading')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [signedInAs, setSignedInAs] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [players, setPlayers] = useState<AdminPlayer[]>([])
  const [selected, setSelected] = useState<AdminPlayer | null>(null)
  const [history, setHistory] = useState<LedgerEntry[]>([])
  const [activity, setActivity] = useState<Record<string, number>>({})
  const [activityNote, setActivityNote] = useState<string | null>(null)
  const [coinAmount, setCoinAmount] = useState('10')
  const [coinNote, setCoinNote] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmBan, setConfirmBan] = useState(false)
  const [sort, setSort] = useState<PlayerSort>('active')
  const [sorted, setSorted] = useState(true)
  const [tab, setTab] = useState<PlayerTab>('overview')
  const [refreshKey, setRefreshKey] = useState(0)
  const [copied, setCopied] = useState(false)

  const refreshGate = async () => {
    if (!supabase) {
      setGate('missing')
      return
    }
    const { data } = await supabase.auth.getSession()
    setSignedInAs(usernameFromUser(data.session?.user))
    const status = await adminReady()
    setGate(status === 'signed-out' ? 'signed-out' : status)
  }

  useEffect(() => {
    void refreshGate()
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange(() => {
      void refreshGate()
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const loadPlayers = async (term: string, by: PlayerSort = sort) => {
    setError(null)
    const result = await listPlayers(term, by)
    setPlayers(result.players)
    setSorted(result.sorted)
    setSelected((current) => result.players.find((row) => row.id === current?.id) ?? current ?? result.players[0] ?? null)
    return result.players
  }

  const loadOrReport = (term: string, by: PlayerSort = sort) =>
    loadPlayers(term, by).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not load players')
      return [] as AdminPlayer[]
    })

  useEffect(() => {
    if (gate !== 'admin') return
    void loadOrReport(query, sort)
    // Reload when the sort changes or Refresh is pressed; typing waits for Search.
  }, [gate, sort, refreshKey])

  useEffect(() => {
    setConfirmBan(false)
    setCopied(false)
    setMessage(null)
  }, [selected?.id])

  /** From the watch list: find the player by name and open them. */
  const pickPlayer = async (id: string, name: string) => {
    const here = players.find((row) => row.id === id)
    if (here) {
      setSelected(here)
      setTab('coins')
      return
    }
    setQuery(name)
    const rows = await loadOrReport(name, sort)
    const found = rows.find((row) => row.id === id)
    if (found) {
      setSelected(found)
      setTab('coins')
    }
  }

  const copyEth = async () => {
    if (!selected?.eth_address) return
    try {
      await navigator.clipboard.writeText(selected.eth_address)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  useEffect(() => {
    if (!selected) {
      setHistory([])
      setActivity({})
      setActivityNote(null)
      return
    }
    const playerId = selected.id
    let cancel = false
    void playerHistory(playerId)
      .then((rows) => {
        if (!cancel) setHistory(rows)
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : 'Could not load history')
      })
    void playerActivity(playerId)
      .then((times) => {
        if (cancel) return
        setActivity(times)
        setActivityNote(null)
      })
      .catch((reason: unknown) => {
        if (cancel) return
        const message = reason instanceof Error ? reason.message.toLowerCase() : ''
        setActivity({})
        setActivityNote(
          message.includes('could not find') || message.includes('schema cache')
            ? 'Activity tracking is not connected yet.'
            : 'Could not load activity.',
        )
      })
    return () => {
      cancel = true
    }
  }, [selected?.id])

  const signIn = async () => {
    setBusy(true)
    setError(null)
    const failure = await signInAccount(username, password)
    setBusy(false)
    if (failure) setError(failure)
  }

  const applyCoins = async (direction: 1 | -1) => {
    if (!selected) return
    const typed = Number(coinAmount.trim())
    if (!Number.isInteger(typed) || typed === 0) {
      setError('Enter a whole number of coins, other than zero.')
      return
    }
    const amount = Math.abs(typed) * direction
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const balance = await adjustCoins(selected.id, amount, coinNote)
      if (balance != null) {
        setSelected({ ...selected, cub_cash: balance })
        setPlayers((rows) => rows.map((row) => (row.id === selected.id ? { ...row, cub_cash: balance } : row)))
      }
      setHistory(await playerHistory(selected.id))
      setMessage(amount > 0 ? `Added ${amount} coins.` : `Removed ${Math.abs(amount)} coins.`)
      setCoinNote('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not change coins')
    } finally {
      setBusy(false)
    }
  }

  const restoreEnergy = async () => {
    if (!selected) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await fillEnergy(selected.id)
      setSelected({ ...selected, energy: 100 })
      setPlayers((rows) => rows.map((row) => (row.id === selected.id ? { ...row, energy: 100 } : row)))
      setMessage('Energy filled. They should close the game and open it again.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not fill energy')
    } finally {
      setBusy(false)
    }
  }

  const takeDownPhoto = async () => {
    if (!selected) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const removed = await removeProfilePhoto(selected.id)
      setMessage(removed ? `${selected.username}'s profile photo was removed.` : `${selected.username} has no profile photo.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove the photo')
    } finally {
      setBusy(false)
    }
  }

  const changeBan = async (banned: boolean) => {
    if (!selected) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await setPlayerBan(selected.id, banned)
      setSelected({ ...selected, banned })
      setPlayers((rows) => rows.map((row) => (row.id === selected.id ? { ...row, banned } : row)))
      setConfirmBan(false)
      setMessage(banned ? `${selected.username} is banned.` : `${selected.username} can play again.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update the ban')
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async () => {
    if (!selected) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await setPlayerPassword(selected.id, nextPassword)
      setNextPassword('')
      setMessage(`Password updated for ${selected.username}. Tell them the new one. No email was sent.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not set the password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-bar">
        <div>
          <h1>Lazy Cub Life admin</h1>
          {signedInAs && (gate === 'admin' || gate === 'player') ? <p className="admin-muted">Signed in as {signedInAs}</p> : null}
        </div>
        <div className="admin-bar-actions">
          {gate === 'admin' ? (
            <button type="button" onClick={() => setRefreshKey((key) => key + 1)}>
              Refresh
            </button>
          ) : null}
          {gate === 'admin' || gate === 'player' ? (
            <button
              type="button"
              onClick={() => {
                void signOutAccount()
              }}
            >
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      {gate === 'loading' ? <p>Checking your login…</p> : null}

      {gate === 'missing' ? (
        <section className="admin-card">
          <p>The admin tables are not in Supabase yet.</p>
          <p>Open the SQL editor, paste <code>supabase/admin.sql</code>, and run it. Then sign in here again.</p>
        </section>
      ) : null}

      {gate === 'signed-out' ? (
        <form
          className="admin-card"
          onSubmit={(event) => {
            event.preventDefault()
            if (!busy) void signIn()
          }}
        >
          <label>
            Username
            <input value={username} autoCapitalize="none" maxLength={12} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="admin-error">{error}</p> : null}
          <button type="submit" disabled={busy}>
            {busy ? 'Please wait' : 'Sign in'}
          </button>
        </form>
      ) : null}

      {gate === 'player' ? (
        <section className="admin-card">
          <p>{signedInAs ?? 'This login'} is not an admin yet.</p>
          <p>In the Supabase SQL editor, run:</p>
          <code className="admin-sql">
            {`insert into public.admins (user_id)
select id from auth.users
where email = '${signedInAs ?? 'yourname'}@users.lazycub.life';`}
          </code>
          <button type="button" onClick={() => void refreshGate()}>
            Check again
          </button>
        </section>
      ) : null}

      {gate === 'admin' ? <AdminOverview refreshKey={refreshKey} onPickPlayer={(id, name) => void pickPlayer(id, name)} /> : null}

      {gate === 'admin' ? <AdminCoinTotals key={`economy-${refreshKey}`} /> : null}

      {gate === 'admin' ? (
        <div className="admin-layout admin-wide">
          <section className="admin-card admin-players">
            <div className="admin-section-head">
              <h2>Players</h2>
              <span className="admin-muted">{players.length} shown</span>
            </div>
            <form
              className="admin-search"
              onSubmit={(event) => {
                event.preventDefault()
                void loadOrReport(query, sort)
              }}
            >
              <input value={query} placeholder="Search by username" aria-label="Search by username" onChange={(event) => setQuery(event.target.value)} />
              <button type="submit">Search</button>
            </form>
            <div className="admin-coins-filter admin-sorts" role="tablist" aria-label="Sort players">
              {SORTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={sort === item.id}
                  className={sort === item.id ? 'on' : ''}
                  disabled={!sorted && item.id !== 'name'}
                  onClick={() => setSort(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {!sorted ? (
              <p className="admin-muted">
                Sorting and more than 25 players need <code>supabase/admin-overview.sql</code>. Showing the first 25 A–Z.
              </p>
            ) : null}
            {players.length === 0 ? <p>No player with that name.</p> : null}
            <div className="admin-table" role="table" aria-label="Players">
              <div className="admin-row admin-row-head" role="row">
                <span role="columnheader">Player</span>
                <span role="columnheader">Lvl</span>
                <span role="columnheader">Coins</span>
                <span role="columnheader">Last seen</span>
              </div>
              {players.map((player) => {
                const seen = lastSeenMs(player)
                return (
                  <button
                    key={player.id}
                    type="button"
                    role="row"
                    className={`admin-row${player.id === selected?.id ? ' on' : ''}`}
                    onClick={() => setSelected(player)}
                  >
                    <span role="cell" className="admin-row-name">
                      <i className={`admin-dot admin-dot-${freshness(seen)}`} aria-hidden="true" />
                      {player.username}
                      {player.banned ? <em className="admin-chip admin-chip-bad">Banned</em> : null}
                    </span>
                    <span role="cell">{levelFromXp(player.xp)}</span>
                    <span role="cell">{player.cub_cash.toLocaleString('en-US')}</span>
                    <span role="cell" className="admin-row-seen">
                      {ago(seen)}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {selected ? (
            <section className="admin-card admin-player">
              <div className="admin-player-head">
                <div>
                  <h2>
                    {selected.username}
                    {selected.banned ? <em className="admin-chip admin-chip-bad">Banned</em> : null}
                  </h2>
                  <p className="admin-muted">
                    Joined {joined(selected.created_at)} · Last seen {ago(lastSeenMs(selected)).toLowerCase()}
                  </p>
                </div>
              </div>

              <div className="admin-tiles admin-tiles-small">
                <div className="admin-tile">
                  <span>Level</span>
                  <strong>{levelFromXp(selected.xp)}</strong>
                </div>
                <div className="admin-tile">
                  <span>Cub Cash</span>
                  <strong>{selected.cub_cash.toLocaleString('en-US')}</strong>
                </div>
                <div className="admin-tile">
                  <span>Energy</span>
                  <strong>{selected.energy}%</strong>
                  <span className="admin-bar-track">
                    <span className="admin-bar-fill admin-bar-fill-in" style={{ width: `${selected.energy}%` }} />
                  </span>
                </div>
              </div>

              <div className="admin-eth">
                {selected.eth_address ? (
                  <>
                    <span>ETH {selected.eth_address}</span>
                    <button type="button" className="admin-small-btn" onClick={() => void copyEth()}>
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </>
                ) : (
                  <span>No ETH address saved</span>
                )}
              </div>

              {message ? <p className="admin-ok">{message}</p> : null}
              {error ? <p className="admin-error">{error}</p> : null}

              <div className="admin-coins-filter admin-tabs" role="tablist" aria-label="Player details">
                {(
                  [
                    ['overview', 'Activity'],
                    ['coins', 'Coins'],
                    ['actions', 'Actions'],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'overview' ? (
                <div className="admin-tab-body">
                  <h3>Time spent</h3>
                  {activityNote ? <p>{activityNote}</p> : null}
                  <ul className="admin-bars">
                    {(() => {
                      const top = Math.max(1, ...ACTIVITY_AREAS.map((row) => activity[row.id] ?? 0))
                      return [...ACTIVITY_AREAS]
                        .sort((a, b) => (activity[b.id] ?? 0) - (activity[a.id] ?? 0))
                        .map((row) => (
                          <li key={row.id}>
                            <div className="admin-bar-head">
                              <span>{row.label}</span>
                              <strong>{formatPlayTime(activity[row.id] ?? 0)}</strong>
                            </div>
                            <span className="admin-bar-track">
                              <span className="admin-bar-fill" style={{ width: `${((activity[row.id] ?? 0) / top) * 100}%` }} />
                            </span>
                          </li>
                        ))
                    })()}
                  </ul>
                </div>
              ) : null}

              {tab === 'coins' ? (
                <div className="admin-tab-body">
                  <AdminCoinTotals key={selected.id} playerId={selected.id} />
                  <AdminCoinHistory history={history} />
                </div>
              ) : null}

              {tab === 'actions' ? (
                <div className="admin-tab-body">
                  <div className="admin-group">
                    <h3>Cub Cash</h3>
                    <div className="admin-field-row">
                      <label>
                        Coins
                        <input value={coinAmount} inputMode="numeric" onChange={(event) => setCoinAmount(event.target.value)} />
                      </label>
                      <label>
                        Note (shown in their coin history)
                        <input value={coinNote} onChange={(event) => setCoinNote(event.target.value)} />
                      </label>
                    </div>
                    <div className="admin-button-row">
                      <button type="button" disabled={busy} onClick={() => void applyCoins(1)}>
                        Add coins
                      </button>
                      <button type="button" disabled={busy} onClick={() => void applyCoins(-1)}>
                        Remove coins
                      </button>
                    </div>
                  </div>

                  <div className="admin-group">
                    <h3>Account</h3>
                    <div className="admin-button-row">
                      <button type="button" disabled={busy} onClick={() => void restoreEnergy()}>
                        Fill energy
                      </button>
                      <button type="button" disabled={busy} onClick={() => void takeDownPhoto()}>
                        Remove profile photo
                      </button>
                    </div>
                    <label>
                      New password
                      <input type="text" value={nextPassword} autoComplete="off" onChange={(event) => setNextPassword(event.target.value)} />
                    </label>
                    <button type="button" disabled={busy} onClick={() => void savePassword()}>
                      Set password
                    </button>
                  </div>

                  <div className="admin-group admin-danger">
                    <h3>Danger zone</h3>
                    {selected.banned ? (
                      <button type="button" disabled={busy} onClick={() => void changeBan(false)}>
                        Unban player
                      </button>
                    ) : confirmBan ? (
                      <>
                        <p>Ban {selected.username}? They will be signed out and cannot play.</p>
                        <div className="admin-button-row">
                          <button type="button" className="admin-ban" disabled={busy} onClick={() => void changeBan(true)}>
                            Ban player
                          </button>
                          <button type="button" disabled={busy} onClick={() => setConfirmBan(false)}>
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <button type="button" className="admin-ban" disabled={busy} onClick={() => setConfirmBan(true)}>
                        Ban player
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="admin-card">
              <p>No players yet.</p>
            </section>
          )}
        </div>
      ) : null}
    </main>
  )
}
