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
  banned?: boolean
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

/** Coins spent and earned across every player. Days limits it to recent days. */
export async function coinTotals(days: number | null): Promise<CoinTotals> {
  if (!supabase) throw new Error('Accounts are not connected.')
  const { data, error } = await supabase.rpc('admin_coin_totals', { p_days: days })
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
