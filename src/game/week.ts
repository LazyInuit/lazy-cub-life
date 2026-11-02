/**
 * The leaderboard week, matching the server's eastern_week_start(): weeks start on Monday at
 * midnight US Eastern time.
 */
const EASTERN_DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
})

const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

/** The Monday that starts this leaderboard week, as YYYY-MM-DD. */
export function easternWeekStart(now = new Date()): string {
  const parts = Object.fromEntries(EASTERN_DAY.formatToParts(now).map((part) => [part.type, part.value]))
  const day = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  const monday = new Date(day - ((WEEKDAY_INDEX[parts.weekday] ?? 1) - 1) * 86_400_000)
  return monday.toISOString().slice(0, 10)
}
