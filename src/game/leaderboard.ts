import type { DailyGame } from './dailyTasks'
import { supabase } from './supabase'

export const LEADERBOARD_PAGE = 20

export const LEADERBOARD_BOARDS: { id: LeaderboardBoard; label: string }[] = [
  { id: 'overall', label: 'Overall — All Games' },
  { id: 'flight', label: "Kovu's Space Dash" },
  { id: 'match', label: 'Pride Pairs' },
  { id: 'dojo', label: 'Ninja Cub Dojo' },
  { id: 'archer', label: 'Cupid Archery' },
  { id: 'hoops', label: 'Lazy Hoops' },
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
