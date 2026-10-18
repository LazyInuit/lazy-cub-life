import { useEffect, useState } from 'react'
import { signInAccount, signOutAccount, usernameFromUser } from '../game/account'
import {
  adjustCoins,
  adminReady,
  fillEnergy,
  playerActivity,
  playerHistory,
  searchPlayers,
  setPlayerBan,
  setPlayerPassword,
  type AdminPlayer,
  type LedgerEntry,
} from '../game/admin'
import { ACTIVITY_AREAS, formatActivityMinutes } from '../game/activity'
import { removeProfilePhoto } from '../game/profilePhoto'
import { levelFromXp } from '../game/progress'
import { supabase } from '../game/supabase'

type Gate = 'loading' | 'signed-out' | 'missing' | 'player' | 'admin'

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

  const loadPlayers = async (term: string) => {
    setError(null)
    const rows = await searchPlayers(term)
    setPlayers(rows)
    setSelected((current) => rows.find((row) => row.id === current?.id) ?? rows[0] ?? null)
  }

  useEffect(() => {
    if (gate !== 'admin') return
    void loadPlayers('').catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load players'))
  }, [gate])

  useEffect(() => {
    setConfirmBan(false)
  }, [selected?.id])

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
        <h1>Player admin</h1>
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

      {gate === 'admin' ? (
        <div className="admin-layout">
          <section className="admin-card">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void loadPlayers(query).catch((reason: unknown) =>
                  setError(reason instanceof Error ? reason.message : 'Could not search'),
                )
              }}
            >
              <label>
                Find a player
                <input value={query} placeholder="Username" onChange={(event) => setQuery(event.target.value)} />
              </label>
              <button type="submit">Search</button>
            </form>
            {players.length === 0 ? <p>No player with that name.</p> : null}
            <ul className="admin-list">
              {players.map((player) => (
                <li key={player.id}>
                  <button
                    type="button"
                    className={player.id === selected?.id ? 'on' : ''}
                    onClick={() => setSelected(player)}
                  >
                    <strong>{player.username}</strong>
                    <span>
                      {player.cub_cash} coins{player.banned ? ' · Banned' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {selected ? (
            <section className="admin-card">
              <h2>{selected.username}</h2>
              <p>Level {levelFromXp(selected.xp)} · {selected.cub_cash} Cub Cash · Energy {selected.energy}</p>
              <p className="admin-eth">{selected.eth_address ? `ETH ${selected.eth_address}` : 'No ETH address saved'}</p>
              {selected.banned ? <p className="admin-error">This player is banned.</p> : null}
              {message ? <p className="admin-ok">{message}</p> : null}
              {error ? <p className="admin-error">{error}</p> : null}

              <label>
                Coins
                <input value={coinAmount} inputMode="numeric" onChange={(event) => setCoinAmount(event.target.value)} />
              </label>
              <label>
                Note
                <input value={coinNote} onChange={(event) => setCoinNote(event.target.value)} />
              </label>
              <button type="button" disabled={busy} onClick={() => void applyCoins(1)}>
                Add coins
              </button>
              <button type="button" disabled={busy} onClick={() => void applyCoins(-1)}>
                Remove coins
              </button>

              <button type="button" disabled={busy} onClick={() => void restoreEnergy()}>
                Fill energy
              </button>

              <button type="button" disabled={busy} onClick={() => void takeDownPhoto()}>
                Remove profile photo
              </button>

              <label>
                New password
                <input
                  type="text"
                  value={nextPassword}
                  autoComplete="off"
                  onChange={(event) => setNextPassword(event.target.value)}
                />
              </label>
              <button type="button" disabled={busy} onClick={() => void savePassword()}>
                Set password
              </button>

              {selected.banned ? (
                <button type="button" disabled={busy} onClick={() => void changeBan(false)}>
                  Unban player
                </button>
              ) : confirmBan ? (
                <>
                  <p>Ban {selected.username}? They will be signed out and cannot play.</p>
                  <button type="button" className="admin-ban" disabled={busy} onClick={() => void changeBan(true)}>
                    Ban player
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmBan(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="admin-ban" disabled={busy} onClick={() => setConfirmBan(true)}>
                  Ban player
                </button>
              )}

              <h3>Activity</h3>
              {activityNote ? <p>{activityNote}</p> : null}
              <ul className="admin-activity">
                {ACTIVITY_AREAS.map((row) => (
                  <li key={row.id}>
                    <span>{row.label}</span>
                    <strong>{formatActivityMinutes(activity[row.id] ?? 0)}</strong>
                  </li>
                ))}
              </ul>

              <h3>Coin history</h3>
              {history.length === 0 ? <p>No coin changes yet.</p> : null}
              <ul className="admin-history">
                {history.map((entry) => (
                  <li key={`${entry.created_at}-${entry.reason}-${entry.amount}`}>
                    <strong>{entry.amount > 0 ? `+${entry.amount}` : entry.amount}</strong>
                    <span>{entry.reason}</span>
                    <span>Balance {entry.balance_after}</span>
                  </li>
                ))}
              </ul>
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
