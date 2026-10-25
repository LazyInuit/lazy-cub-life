import type { DailyGame } from './dailyTasks'
import { profilePhotoUrl } from './profilePhoto'
import { sanitizeSave } from './progress'
import { supabase } from './supabase'
import type { CubSave } from './types'

export const LEADERBOARD_PAGE = 20

/** Cub Cash for the top three overall scores when the week ends. */
export const WEEKLY_OVERALL_PRIZES = [
  { place: 1, amount: 500, label: '1st place' },
  { place: 2, amount: 200, label: '2nd place' },
  { place: 3, amount: 100, label: '3rd place' },
] as const

export const WEEKLY_OVERALL_PRIZE = WEEKLY_OVERALL_PRIZES[0].amount

export const LEADERBOARD_BOARDS: { id: LeaderboardBoard; label: string }[] = [
  { id: 'overall', label: 'Overall — All Games' },
  { id: 'flight', label: "Kovu's Space Dash" },
  { id: 'match', label: 'Pride Pairs' },
  { id: 'dojo', label: 'Ninja Cub Dojo' },
  { id: 'archer', label: 'Cupid Archery' },
  { id: 'hoops', label: 'Lazy Hoops' },
  { id: 'bubble', label: 'Bubble Blast' },
]

export type LeaderboardBoard = DailyGame | 'overall'
export type LeaderboardPeriod = 'week' | 'all'

export type LeaderboardRow = {
  rank: number
  username: string
  score: number
  mine: boolean
}

export type LeaderboardStanding = {
  rank: number
  username: string
  score: number
}

export type LeaderboardPage = {
  rows: LeaderboardRow[]
  mine: LeaderboardStanding | null
  total: number
  resetsAt: string | null
  serverNow: string | null
}

export async function submitLeaderboardScore(game: DailyGame, score: number) {
  if (!supabase || score <= 0) return
  const { error } = await supabase.rpc('submit_score', { p_game: game, p_score: score })
  if (error) return
}

export async function loadLeaderboard(
  game: LeaderboardBoard,
  period: LeaderboardPeriod,
  offset = 0,
): Promise<LeaderboardPage> {
  if (!supabase) {
    return { rows: [], mine: null, total: 0, resetsAt: null, serverNow: null }
  }
  const { data, error } = await supabase.rpc('leaderboard', {
    p_game: game,
    p_period: period,
    p_limit: LEADERBOARD_PAGE,
    p_offset: offset,
  })
  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('could not find the function') || message.includes('schema cache')) {
      throw new Error('Leaderboards need a database update.')
    }
    throw new Error('Could not load scores.')
  }
  const payload = typeof data === 'string' ? parseJson(data) : data
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Leaderboards need a database update.')
  }
  const page = payload as {
    rows?: unknown
    mine?: unknown
    total?: unknown
    resetsAt?: unknown
    serverNow?: unknown
  }
  const rows = Array.isArray(page.rows) ? page.rows.flatMap(readRow) : []
  return {
    rows,
    mine: readStanding(page.mine),
    total: readCount(page.total),
    resetsAt: typeof page.resetsAt === 'string' ? page.resetsAt : null,
    serverNow: typeof page.serverNow === 'string' ? page.serverNow : null,
  }
}

/** Last week's overall top three, readable without signing in. */
export async function loadLastWeeklyWinners(): Promise<{ place: number; username: string }[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('last_weekly_winners')
  if (error) return []
  const list = typeof data === 'string' ? parseJson(data) : data
  if (!Array.isArray(list)) return []
  const winners: { place: number; username: string }[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as { place?: unknown; username?: unknown }
    const place = readCount(row.place)
    const username = typeof row.username === 'string' ? row.username.trim() : ''
    if (place >= 1 && place <= 3 && username) winners.push({ place, username })
  }
  return winners
}

/** Where a score would sit on one game's boards, this week and all time. */
export async function loadScorePlace(game: DailyGame, score: number): Promise<{ week: number; all: number } | null> {
  if (!supabase || score <= 0) return null
  const { data, error } = await supabase.rpc('leaderboard_place', { p_game: game, p_score: Math.floor(score) })
  if (error) return null
  const payload = typeof data === 'string' ? parseJson(data) : data
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const entry = payload as { week?: unknown; all?: unknown }
  const week = readCount(entry.week)
  const all = readCount(entry.all)
  if (week <= 0 || all <= 0) return null
  return { week, all }
}

export type PlayerProfile = {
  username: string
  xp: number
  overall: number
  rank: number | null
  /** Best single score ever in each game, for badges. */
  bests: Partial<Record<DailyGame, number>>
  /** The player's uploaded photo, or null to show the default picture. */
  photoUrl: string | null
  /** Only the parts of the save a visit draws: outfits, owned traits, and the pumpkin. */
  room: CubSave
}

export async function loadPlayerProfile(username: string): Promise<PlayerProfile> {
  if (!supabase) throw new Error('Accounts are not connected.')
  const { data, error } = await supabase.rpc('player_profile', { p_username: username })
  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('could not find the function') || message.includes('schema cache')) {
      throw new Error('Profiles need a database update.')
    }
    throw new Error('Could not load this player.')
  }
  const payload = typeof data === 'string' ? parseJson(data) : data
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Player not found.')
  }
  const entry = payload as {
    username?: unknown
    xp?: unknown
    overall?: unknown
    rank?: unknown
    bests?: unknown
    avatar?: unknown
    room?: unknown
  }
  if (typeof entry.username !== 'string' || entry.username === '') throw new Error('Player not found.')
  const xp = Math.max(0, readNumber(entry.xp))
  const rank = readCount(entry.rank)
  const room = entry.room && typeof entry.room === 'object' && !Array.isArray(entry.room)
    ? (entry.room as Record<string, unknown>)
    : {}
  const rawBests = entry.bests && typeof entry.bests === 'object' && !Array.isArray(entry.bests)
    ? (entry.bests as Record<string, unknown>)
    : {}
  const bests: Partial<Record<DailyGame, number>> = {}
  for (const game of ['flight', 'match', 'dojo', 'archer', 'hoops', 'bubble'] as const) {
    const best = readCount(rawBests[game])
    if (best > 0) bests[game] = best
  }
  const avatar = entry.avatar && typeof entry.avatar === 'object' && !Array.isArray(entry.avatar)
    ? (entry.avatar as { path?: unknown; version?: unknown })
    : null
  const photoUrl = avatar && typeof avatar.path === 'string' && avatar.path !== ''
    ? profilePhotoUrl(avatar.path, readCount(avatar.version))
    : null
  return {
    username: entry.username,
    xp,
    overall: Math.max(0, readCount(entry.overall)),
    rank: rank > 0 ? rank : null,
    bests,
    photoUrl,
    room: sanitizeSave({ ...room, version: 1, xp, halloween: room.halloween === true }),
  }
}

function readNumber(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) ? number : 0
}

export function nextEasternReset(now = new Date()) {
  const timeZone = 'America/New_York'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const weekday = part(parts, 'weekday')
  const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)
  let days = index < 0 ? 7 : (8 - index) % 7
  if (days === 0) days = 7
  const year = Number(part(parts, 'year'))
  const month = Number(part(parts, 'month'))
  const day = Number(part(parts, 'day'))
  return zonedMidnight(timeZone, year, month, day + days)
}

export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function readRow(value: unknown): LeaderboardRow[] {
  const standing = readStanding(value)
  if (!standing || !value || typeof value !== 'object') return []
  const mine = (value as { mine?: unknown }).mine === true
  return [{ ...standing, mine }]
}

function readStanding(value: unknown): LeaderboardStanding | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as { rank?: unknown; username?: unknown; score?: unknown }
  const rank = readCount(entry.rank)
  const score = readCount(entry.score)
  if (typeof entry.username !== 'string' || entry.username === '' || rank <= 0 || score <= 0) return null
  return { rank, username: entry.username, score }
}

function readCount(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) ? Math.floor(number) : 0
}

function part(parts: Intl.DateTimeFormatPart[], type: string) {
  return parts.find((item) => item.type === type)?.value ?? ''
}

function zonedMidnight(timeZone: string, year: number, month: number, day: number) {
  let utc = Date.UTC(year, month - 1, day, 0, 0, 0)
  for (let pass = 0; pass < 2; pass += 1) {
    utc = Date.UTC(year, month - 1, day, 0, 0, 0) - zoneOffset(timeZone, utc)
  }
  return new Date(utc)
}

function zoneOffset(timeZone: string, utcMillis: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMillis))
  let hour = Number(part(parts, 'hour'))
  let day = Number(part(parts, 'day'))
  let month = Number(part(parts, 'month'))
  let year = Number(part(parts, 'year'))
  if (hour === 24) {
    hour = 0
    const rolled = new Date(Date.UTC(year, month - 1, day + 1))
    year = rolled.getUTCFullYear()
    month = rolled.getUTCMonth() + 1
    day = rolled.getUTCDate()
  }
  const asUtc = Date.UTC(year, month - 1, day, hour, Number(part(parts, 'minute')), Number(part(parts, 'second')))
  return asUtc - utcMillis
}
