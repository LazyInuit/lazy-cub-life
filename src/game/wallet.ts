import { readCubPower, type CubPower } from './cubPower'
import { sanitizeDaily, type DailyGame, type DailyProgress } from './dailyTasks'
import { supabase } from './supabase'
import type { CubSave } from './types'

export type GameCoinSource = 'flight' | 'hoops' | 'archer' | 'dojo' | 'match' | 'bubble' | 'river'

export type WalletPatch = {
  cubCash: number
  granted?: number
  /** Whole Cub Cash the Cub Power bonus paid on top of granted. */
  bonus?: number
  /** Cub Power bonus left over after this payout, in hundredths. */
  bonusHundredths?: number
  daily?: DailyProgress
  unlockedTraits?: string[]
  xpGained?: number
  energy?: number
}

type RpcRow = {
  cubCash?: unknown
  granted?: unknown
  bonus?: unknown
  bonusHundredths?: unknown
  ok?: unknown
  reason?: unknown
  daily?: unknown
  unlockedTraits?: unknown
  xp?: unknown
  energy?: unknown
  trait?: unknown
  coins?: unknown
  winnerUsername?: unknown
  winners?: unknown
}

export type WeeklyWinner = {
  place: number
  username: string
}

function asRecord(value: unknown): RpcRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as RpcRow
}

async function signedIn() {
  if (!supabase) return false
  const { data } = await supabase.auth.getSession()
  return Boolean(data.session)
}

export async function walletActive() {
  return signedIn()
}

function readPatch(value: unknown): WalletPatch | null {
  const row = asRecord(value)
  if (!row || typeof row.cubCash !== 'number' || !Number.isFinite(row.cubCash)) return null
  const patch: WalletPatch = { cubCash: Math.max(0, Math.floor(row.cubCash)) }
  if (typeof row.granted === 'number' && Number.isFinite(row.granted)) patch.granted = Math.floor(row.granted)
  if (typeof row.bonus === 'number' && Number.isFinite(row.bonus)) patch.bonus = Math.max(0, Math.floor(row.bonus))
  if (typeof row.bonusHundredths === 'number' && Number.isFinite(row.bonusHundredths)) {
    patch.bonusHundredths = Math.min(99, Math.max(0, Math.floor(row.bonusHundredths)))
  }
  if (row.daily) patch.daily = sanitizeDaily(row.daily)
  if (Array.isArray(row.unlockedTraits)) {
    patch.unlockedTraits = row.unlockedTraits.filter((item): item is string => typeof item === 'string')
  }
  if (typeof row.xp === 'number' && Number.isFinite(row.xp)) patch.xpGained = Math.max(0, row.xp)
  if (typeof row.energy === 'number' && Number.isFinite(row.energy)) patch.energy = Math.max(0, Math.min(100, Math.floor(row.energy)))
  return patch
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<{ row: RpcRow | null; missing: boolean }> {
  if (!supabase) return { row: null, missing: false }
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    const missing = error.code === 'PGRST202' || error.message.toLowerCase().includes('could not find the function')
    return { row: null, missing }
  }
  return { row: asRecord(data), missing: false }
}

async function call(fn: string, args: Record<string, unknown>) {
  if (!(await signedIn())) return { mode: 'local' as const }
  const { row, missing } = await rpc(fn, args)
  if (missing) return { mode: 'local' as const }
  return { mode: 'server' as const, row, patch: readPatch(row) }
}

/** Split a run total into the amounts the coin server already accepts. */
export function payoutParts(source: GameCoinSource, amount: number) {
  const gain = Math.max(0, Math.floor(amount))
  if (gain === 0) return []
  if (source === 'flight') {
    const parts: number[] = []
    let left = gain - (gain % 5)
    while (left > 0) {
      parts.push(5)
      left -= 5
    }
    return parts
  }
  if (source === 'match') {
    const parts: number[] = []
    let left = gain
    for (const size of [15, 10, 6, 3, 1]) {
      while (left >= size) {
        parts.push(size)
        left -= size
      }
    }
    return parts
  }
  const max = source === 'archer' ? 40 : 80
  const parts: number[] = []
  let left = gain
  while (left > 0) {
    const take = Math.min(max, left)
    parts.push(take)
    left -= take
  }
  return parts
}

const PAYOUT_GAP_MS: Record<GameCoinSource, number> = {
  flight: 8000,
  hoops: 20000,
  archer: 15000,
  dojo: 10000,
  match: 8000,
  bubble: 20000,
  river: 20000,
}

export function payoutGap(source: GameCoinSource) {
  return PAYOUT_GAP_MS[source]
}

/** A coin id that still works on the phone over the Wi-Fi address. */
export function newNonce() {
  const cryptoRef = globalThis.crypto
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    try {
      return cryptoRef.randomUUID()
    } catch {
      // http://192.168.x.x is not a secure page, so randomUUID is blocked there.
    }
  }
  const bytes = new Uint8Array(16)
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') cryptoRef.getRandomValues(bytes)
  else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function grantGameCoins(source: GameCoinSource, amount: number) {
  return call('grant_game_coins', {
    p_source: source,
    p_amount: Math.floor(amount),
    p_nonce: newNonce(),
  })
}

export type WeeklyPrize = WalletPatch & { winners: WeeklyWinner[] }

function readWinners(value: unknown): WeeklyWinner[] {
  if (!Array.isArray(value)) return []
  const winners: WeeklyWinner[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as { place?: unknown; username?: unknown }
    const place = row.place
    const username = typeof row.username === 'string' ? row.username.trim() : ''
    if (place !== 1 && place !== 2 && place !== 3) continue
    if (username === '') continue
    winners.push({ place, username })
  }
  return winners
}

/** Pay last week's top three overall scores, once. Also returns those names. */
export async function settleWeeklyPrize(): Promise<WeeklyPrize | null> {
  const result = await call('settle_weekly_overall_prize', {})
  if (result.mode !== 'server' || !result.patch) return null
  const winners = readWinners(result.row?.winners)
  const legacy = result.row?.winnerUsername
  if (winners.length === 0 && typeof legacy === 'string' && legacy.trim() !== '') {
    winners.push({ place: 1, username: legacy.trim() })
  }
  return { ...result.patch, winners }
}

/** This player's Cub Power. Also counts as today's login for the streak. Null if signed out or not installed. */
export async function getCubPower(): Promise<CubPower | null> {
  if (!supabase || !(await signedIn())) return null
  const { data, error } = await supabase.rpc('get_cub_power')
  if (error) return null
  return readCubPower(data)
}

export async function touchDailyBoard() {
  const result = await call('touch_daily_board', {})
  return result.mode === 'server' ? result.patch : null
}

export async function addDailyScore(game: DailyGame, points: number) {
  const result = await call('add_daily_score', { p_game: game, p_points: Math.floor(points) })
  return result.mode === 'server' ? result.patch : null
}

export async function claimDailyTask(taskId: string) {
  return call('claim_daily_task', { p_task: taskId })
}

export async function rollDailyBonus() {
  const result = await call('roll_daily_bonus', {})
  if (result.mode === 'local') return { mode: 'local' as const }
  if (!result.row || result.row.ok === false || !result.patch) return { mode: 'rejected' as const }
  return {
    mode: 'server' as const,
    patch: result.patch,
    trait: result.patch.daily?.bonusTrait ?? null,
    coins: result.patch.daily?.bonusCoins ?? 0,
  }
}

export async function buyDrinkOnServer(drink: 'milk' | 'juice') {
  const result = await call('buy_drink', { p_drink: drink })
  if (result.mode === 'local') return { mode: 'local' as const }
  if (!result.row || result.row.ok === false || !result.patch) {
    const reason = result.row?.reason === 'broke' ? 'broke' : result.row?.reason === 'full' ? 'full' : 'missing'
    return { mode: 'server' as const, ok: false as const, reason: reason as 'broke' | 'full' | 'missing' }
  }
  return { mode: 'server' as const, ok: true as const, patch: result.patch }
}

export async function purchaseTraitOnServer(age: string, category: string, name: string) {
  const result = await call('purchase_trait', { p_age: age, p_category: category, p_name: name })
  if (result.mode === 'local') return { mode: 'local' as const }
  if (!result.row) return { mode: 'server' as const, ok: false as const, reason: 'missing' as const }
  if (result.row.ok === false) {
    return { mode: 'server' as const, ok: false as const, reason: result.row.reason === 'broke' ? ('broke' as const) : ('missing' as const) }
  }
  if (!result.patch) return { mode: 'server' as const, ok: false as const, reason: 'missing' as const }
  return { mode: 'server' as const, ok: true as const, patch: result.patch }
}

export function applyWallet(save: CubSave, patch: WalletPatch): CubSave {
  return {
    ...save,
    cubCash: patch.cubCash,
    daily: patch.daily ?? save.daily,
    unlockedTraits: patch.unlockedTraits ?? save.unlockedTraits,
    energy: patch.energy ?? save.energy,
  }
}
