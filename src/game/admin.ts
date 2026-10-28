import { supabase } from './supabase'
import { newNonce } from './wallet'

export type AdminPlayer = {
  id: string
  username: string
  cub_cash: number
  energy: number
  xp: number
  eth_address: string | null
  created_at: string
  last_visit: number
  /** Last recorded activity or save visit. Only from admin_players. */
  last_seen?: string | null
  banned?: boolean
}

export type PlayerSort = 'active' | 'new' | 'coins' | 'level' | 'name'

export type AdminOverview = {
  players: number
  newToday: number
  newWeek: number
  activeToday: number
  activeWeek: number
  banned: number
  cashHeld: number
  /** The last 14 days, oldest first. */
  signups: { day: string; count: number }[]
  /** Seconds spent and players who have played, by activity area. */
  areas: Record<string, { seconds: number; players: number }>
  /** Biggest coin earners in the last 24 hours. */
  earners: { id: string; username: string; earned: number; grants: number; banned: boolean }[]
}

export type LedgerEntry = {
  amount: number
  balance_after: number
  reason: string
  created_at: string
  actor: string | null
}

function missingFunction(error: { code?: string; message?: string }) {
  return error.code === 'PGRST202' || (error.message ?? '').toLowerCase().includes('could not find the function')
}

export async function adminReady(): Promise<'admin' | 'player' | 'missing' | 'signed-out'> {
  if (!supabase) return 'signed-out'
  const { data } = await supabase.auth.getSession()
  if (!data.session) return 'signed-out'
  const { data: allowed, error } = await supabase.rpc('admin_is_admin')
  if (error && missingFunction(error)) return 'missing'
  if (error || allowed !== true) return 'player'
  return 'admin'
}

function asPlayers(data: unknown): AdminPlayer[] {
  let value = data
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      return []
    }
  }
  return Array.isArray(value) ? (value as AdminPlayer[]) : []
}

export async function searchPlayers(query: string): Promise<AdminPlayer[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('admin_search', { p_query: query.trim() })
  if (error) throw new Error(error.message)
  return asPlayers(data)
}

/**
 * Players sorted for the dashboard. Until admin-overview.sql is run, falls back to the
 * first 25 alphabetical matches and says so with `sorted: false`.
 */
export async function listPlayers(query: string, sort: PlayerSort): Promise<{ players: AdminPlayer[]; sorted: boolean }> {
  if (!supabase) return { players: [], sorted: false }
  const { data, error } = await supabase.rpc('admin_players', { p_query: query.trim(), p_sort: sort, p_limit: 100 })
  if (error && missingFunction(error)) return { players: await searchPlayers(query), sorted: false }
  if (error) throw new Error(error.message)
  return { players: asPlayers(data), sorted: true }
}

/** The dashboard overview, or null until admin-overview.sql is run. */
export async function adminOverview(): Promise<AdminOverview | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('admin_overview')
  if (error && missingFunction(error)) return null
  if (error) throw new Error(error.message)
  const row = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0)
  const areas: AdminOverview['areas'] = {}
  if (row.areas && typeof row.areas === 'object' && !Array.isArray(row.areas)) {
    for (const [area, value] of Object.entries(row.areas as Record<string, unknown>)) {
      const item = (value ?? {}) as Record<string, unknown>
      areas[area] = { seconds: num(item.seconds), players: num(item.players) }
    }
  }
  const list = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]) : [])
  return {
    players: num(row.players),
    newToday: num(row.newToday),
    newWeek: num(row.newWeek),
    activeToday: num(row.activeToday),
    activeWeek: num(row.activeWeek),
    banned: num(row.banned),
    cashHeld: num(row.cashHeld),
    signups: list(row.signups).map((item) => ({ day: String(item.day ?? ''), count: num(item.count) })),
    areas,
    earners: list(row.earners).map((item) => ({
      id: String(item.id ?? ''),
      username: String(item.username ?? ''),
      earned: num(item.earned),
      grants: num(item.grants),
      banned: item.banned === true,
    })),
  }
}

export async function playerActivity(playerId: string): Promise<Record<string, number>> {
  if (!supabase) return {}
  const { data, error } = await supabase.rpc('admin_activity', { p_player: playerId })
  if (error) throw new Error(error.message)
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
  const times: Record<string, number> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) times[key] = value
  }
  return times
}

/**
 * One player's seconds per area over the last `days` UK days, today included, and the day
 * daily tracking began. Null until activity-daily.sql is run.
 */
export async function playerActivityRange(
  playerId: string,
  days: number,
): Promise<{ times: Record<string, number>; since: string | null } | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('admin_activity_range', { p_player: playerId, p_days: days })
  if (error && missingFunction(error)) return null
  if (error) throw new Error(error.message)
  const row = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>
  const times: Record<string, number> = {}
  if (row.areas && typeof row.areas === 'object' && !Array.isArray(row.areas)) {
    for (const [key, value] of Object.entries(row.areas as Record<string, unknown>)) {
      const seconds = typeof value === 'number' ? value : Number(value)
      if (Number.isFinite(seconds)) times[key] = seconds
    }
  }
  return { times, since: typeof row.since === 'string' ? row.since : null }
}

export async function playerHistory(playerId: string): Promise<LedgerEntry[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('admin_history', { p_player: playerId })
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? (data as LedgerEntry[]) : []
}

export type CoinTotals = {
  shopCoins: number
  shopCount: number
  wardrobeCoins: number
  wardrobeCount: number
  /** Coins handed out by source: flight, match, dojo, archer, hoops, weekly-overall. */
  grants: Record<string, number>
  dailyCoins: number
  /** When labelled spending records begin. Shop and wardrobe totals start here. */
  labelsSince: string | null
}

/** Coins spent and earned across every player, or one player. Days limits it to recent days. */
export async function coinTotals(days: number | null, playerId: string | null = null): Promise<CoinTotals> {
  if (!supabase) throw new Error('Accounts are not connected.')
  const { data, error } = await supabase.rpc('admin_coin_totals', { p_days: days, p_player: playerId })
  if (error) {
    if (missingFunction(error)) throw new Error('Coin totals need a database update.')
    throw new Error(error.message)
  }
  const row = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0)
  const grants: Record<string, number> = {}
  if (row.grants && typeof row.grants === 'object' && !Array.isArray(row.grants)) {
    for (const [source, total] of Object.entries(row.grants as Record<string, unknown>)) grants[source] = count(total)
  }
  return {
    shopCoins: count(row.shopCoins),
    shopCount: count(row.shopCount),
    wardrobeCoins: count(row.wardrobeCoins),
    wardrobeCount: count(row.wardrobeCount),
    grants,
    dailyCoins: count(row.dailyCoins),
    labelsSince: typeof row.labelsSince === 'string' ? row.labelsSince : null,
  }
}

export async function adjustCoins(playerId: string, amount: number, note: string) {
  if (!supabase) throw new Error('Accounts are not connected.')
  const { data, error } = await supabase.rpc('admin_adjust_coins', {
    p_player: playerId,
    p_amount: amount,
    p_operation: newNonce(),
    p_note: note,
  })
  if (error) throw new Error(error.message)
  const row = data as { cubCash?: number }
  return typeof row?.cubCash === 'number' ? row.cubCash : null
}

export async function fillEnergy(playerId: string) {
  if (!supabase) throw new Error('Accounts are not connected.')
  const { error } = await supabase.rpc('admin_fill_energy', { p_player: playerId })
  if (error) throw new Error(error.message)
}

export async function setPlayerBan(playerId: string, banned: boolean) {
  if (!supabase) throw new Error('Accounts are not connected.')
  const { error } = await supabase.rpc('admin_set_ban', { p_player: playerId, p_banned: banned })
  if (!error) return
  const message = error.message.toLowerCase()
  if (message.includes('could not find the function') || message.includes('schema cache') || message.includes('column')) {
    throw new Error('Ban is not connected yet.')
  }
  if (message.includes('own account')) throw new Error('You cannot ban your own account.')
  if (message.includes('that account is an admin')) throw new Error('That account is an admin.')
  throw new Error(error.message)
}

export async function setPlayerPassword(playerId: string, password: string) {
  if (!supabase) throw new Error('Accounts are not connected.')
  const { error } = await supabase.rpc('admin_set_password', { p_player: playerId, p_password: password })
  if (error) throw new Error(error.message)
}
