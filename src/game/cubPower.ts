/**
 * Cub Power. The server works out the real numbers (supabase/cub-power.sql); these mirror its
 * formulas so the app can explain them and the check script can test them.
 */

export const BADGE_TIER_POINTS = { bronze: 10, silver: 25, gold: 50, platinum: 75, diamond: 100 } as const
export type BadgeTierName = keyof typeof BADGE_TIER_POINTS

/** Every game at Diamond is worth this much, however many games are released. */
export const MAX_BADGE_POWER = 700
export const MAX_STREAK_DAYS = 7
export const MAX_BENEFIT_PERCENT = 10
export const POWER_PER_PERCENT = 100

export function badgePower(rawPoints: number, activeGames: number): number {
  if (activeGames <= 0) return 0
  return Math.floor((Math.max(0, rawPoints) * 7) / activeGames)
}

export function levelPower(level: number): number {
  const lvl = Math.max(0, Math.floor(level))
  return (
    Math.min(lvl, 25) * 5 +
    Math.max(0, Math.min(lvl - 25, 25)) * 3 +
    Math.max(0, Math.min(lvl - 50, 50)) * 2 +
    Math.max(0, lvl - 100)
  )
}

/** The multiplier as a whole percentage: 100 with no streak, 135 at seven days or more. */
export function streakMultiplier(streakDays: number): number {
  return 100 + Math.min(Math.max(0, Math.floor(streakDays)), MAX_STREAK_DAYS) * 5
}

export function powerAfterStreak(basePower: number, streakDays: number): number {
  return Math.floor((Math.max(0, basePower) * streakMultiplier(streakDays)) / 100)
}

export function weeklyBoost(place: number | null | undefined): number {
  if (place === 1) return 100
  if (place === 2) return 75
  if (place === 3) return 50
  if (place != null && place >= 4 && place <= 10) return 25
  return 0
}

export function benefitPercent(totalPower: number): number {
  return Math.min(MAX_BENEFIT_PERCENT, Math.floor(Math.max(0, totalPower) / POWER_PER_PERCENT))
}

export function totalPower(parts: {
  rawBadgePoints: number
  activeGames: number
  level: number
  streakDays: number
  boostPlace?: number | null
}): number {
  const base = badgePower(parts.rawBadgePoints, parts.activeGames) + levelPower(parts.level)
  return powerAfterStreak(base, parts.streakDays) + weeklyBoost(parts.boostPlace)
}

/**
 * Adds amount * percent hundredths to what was left over and pays out the whole units.
 * Used for bonus Cub Cash on the server and bonus XP in the app, so 1% of small rewards still adds up.
 */
export function addBonusHundredths(remainder: number, amount: number, percent: number): { whole: number; remainder: number } {
  const pile = Math.max(0, Math.floor(remainder)) + Math.max(0, Math.floor(amount * Math.max(0, percent)))
  return { whole: Math.floor(pile / 100), remainder: pile % 100 }
}

/** A wardrobe price after the discount, rounded up to a whole coin. */
export function discountedPrice(price: number, percent: number): number {
  const pct = Math.min(Math.max(0, Math.floor(percent)), MAX_BENEFIT_PERCENT)
  return Math.ceil((price * (100 - pct)) / 100)
}

/** Power still needed for the next 1%, or null once every benefit is at 10%. */
export function powerToNextTier(total: number): number | null {
  if (benefitPercent(total) >= MAX_BENEFIT_PERCENT) return null
  return (benefitPercent(total) + 1) * POWER_PER_PERCENT - Math.max(0, total)
}

export function weeklyPlaceLabel(place: number | null | undefined): string | null {
  if (place === 1) return 'Weekly Champion'
  if (place === 2) return 'Second Place'
  if (place === 3) return 'Third Place'
  if (place != null && place >= 4 && place <= 10) return 'Top 10'
  return null
}

export type CubPowerGame = { game: string; title: string; best: number; points: number }

/** What get_cub_power returns, checked. */
export type CubPower = {
  total: number
  percent: number
  badgePoints: number
  activeGames: number
  badgePower: number
  badges: CubPowerGame[]
  level: number
  levelPower: number
  basePower: number
  streakCount: number
  streakDays: number
  streakMultiplier: number
  streakPower: number
  /** UTC day of the last check-in (YYYY-MM-DD). */
  lastLoginDay: string | null
  streakResetsAt: number | null
  boost: number
  boostPlace: number | null
  boostEndsAt: number | null
  coinBonusHundredths: number
}

function int(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
}

function time(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const at = Date.parse(value)
  return Number.isFinite(at) ? at : null
}

export function readCubPower(value: unknown): CubPower | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.total !== 'number') return null
  const badges: CubPowerGame[] = Array.isArray(row.badges)
    ? row.badges.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const game = item as Record<string, unknown>
        if (typeof game.game !== 'string' || typeof game.title !== 'string') return []
        return [{ game: game.game, title: game.title, best: int(game.best), points: int(game.points) }]
      })
    : []
  const place = int(row.boostPlace, 0)
  return {
    total: Math.max(0, int(row.total)),
    percent: Math.min(MAX_BENEFIT_PERCENT, Math.max(0, int(row.percent))),
    badgePoints: int(row.badgePoints),
    activeGames: int(row.activeGames),
    badgePower: int(row.badgePower),
    badges,
    level: int(row.level, 1),
    levelPower: int(row.levelPower),
    basePower: int(row.basePower),
    streakCount: int(row.streakCount),
    streakDays: int(row.streakDays),
    streakMultiplier: int(row.streakMultiplier, 100),
    streakPower: int(row.streakPower),
    lastLoginDay: typeof row.lastLoginDay === 'string' ? row.lastLoginDay : null,
    streakResetsAt: time(row.streakResetsAt),
    boost: int(row.boost),
    boostPlace: place > 0 ? place : null,
    boostEndsAt: time(row.boostEndsAt),
    coinBonusHundredths: Math.min(99, Math.max(0, int(row.coinBonusHundredths))),
  }
}

/** A home-screen pop-up about Cub Power. Each one shows once and stays until tapped. */
export type PowerNotice =
  | { kind: 'streak'; day: number; multiplier: number; reset: boolean }
  | { kind: 'boost'; place: number; boost: number; endsAt: number | null }
  | { kind: 'tier'; percent: number }

/** What this phone has already shown a player. */
export type PowerSeen = {
  /** UTC day the streak pop-up last showed (YYYY-MM-DD). */
  day?: string
  /** Streak length on that day, to spot a streak that has reset. */
  streak?: number
  /** End of the boost week already announced. */
  boostEndsAt?: number
  /** Benefit percent last seen, to spot a new tier. */
  percent?: number
}

/**
 * Pop-ups for fresh Cub Power news, in the order to show them, and what to remember afterwards.
 * The streak shows once per UTC day, a boost once per week, and a tier only when it goes up
 * (the first reading on a phone sets where it starts).
 */
export function powerNoticesFor(power: CubPower, seen: PowerSeen): { notices: PowerNotice[]; seen: PowerSeen } {
  const notices: PowerNotice[] = []
  const next: PowerSeen = { ...seen, percent: power.percent }
  if (power.lastLoginDay && power.streakCount > 0 && seen.day !== power.lastLoginDay) {
    const reset = seen.day !== undefined && (seen.streak ?? 0) > 1 && power.streakCount === 1
    notices.push({ kind: 'streak', day: power.streakCount, multiplier: power.streakMultiplier, reset })
    next.day = power.lastLoginDay
    next.streak = power.streakCount
  }
  if (power.boost > 0 && power.boostPlace && power.boostEndsAt != null && seen.boostEndsAt !== power.boostEndsAt) {
    notices.push({ kind: 'boost', place: power.boostPlace, boost: power.boost, endsAt: power.boostEndsAt })
    next.boostEndsAt = power.boostEndsAt
  }
  if (seen.percent !== undefined && power.percent > seen.percent) {
    notices.push({ kind: 'tier', percent: power.percent })
  }
  return { notices, seen: next }
}

function seenKey(username: string) {
  return `lazy-cub-power-seen:${username.trim().toLowerCase()}`
}

export function readPowerSeen(username: string): PowerSeen {
  try {
    const raw = JSON.parse(localStorage.getItem(seenKey(username)) ?? '{}') as Record<string, unknown>
    const seen: PowerSeen = {}
    if (typeof raw.day === 'string') seen.day = raw.day
    if (typeof raw.streak === 'number') seen.streak = raw.streak
    if (typeof raw.boostEndsAt === 'number') seen.boostEndsAt = raw.boostEndsAt
    if (typeof raw.percent === 'number') seen.percent = raw.percent
    return seen
  } catch {
    return {}
  }
}

export function writePowerSeen(username: string, seen: PowerSeen) {
  try {
    localStorage.setItem(seenKey(username), JSON.stringify(seen))
  } catch {
    // Private browsing can refuse storage. The pop-ups may then repeat, which is harmless.
  }
}

function seenGamesKey(username: string) {
  return `lazy-cub-power-games:${username.trim().toLowerCase()}`
}

/**
 * True when more games count towards badge Power than this phone last saw, which lowers
 * badge Power until the new game's badges are earned. Remembers the new count.
 */
export function noteActiveGames(username: string, activeGames: number): boolean {
  if (activeGames <= 0) return false
  try {
    const key = seenGamesKey(username)
    const seen = Number(localStorage.getItem(key))
    localStorage.setItem(key, String(activeGames))
    return Number.isFinite(seen) && seen > 0 && activeGames > seen
  } catch {
    return false
  }
}
