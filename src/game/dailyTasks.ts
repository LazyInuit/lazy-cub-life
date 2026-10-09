export type DailyGame = 'flight' | 'hoops' | 'archer' | 'dojo' | 'match'

export type DailyTask = {
  id: string
  game: DailyGame
  gameLabel: string
  detail: string
  goal: number
  reward: number
}

export type DailyProgress = {
  /** Epoch ms when the player started the first challenge of this round. Null until then. */
  startedAt: number | null
  /** Points earned this round, added up across every play. */
  scores: Partial<Record<DailyGame, number>>
  /** Task ids already paid out this round. */
  claimed: string[]
}

/** One challenge per game. The same five stay up for 24 hours after the first one starts. */
export const DAILY_TASKS: DailyTask[] = [
  {
    id: 'dash-20',
    game: 'flight',
    gameLabel: "Kovu's Space Dash",
    detail: 'Earn 20 points',
    goal: 20,
    reward: 50,
  },
  {
    id: 'hoops-5000',
    game: 'hoops',
    gameLabel: 'Lazy Hoops',
    detail: 'Earn 5000 points',
    goal: 5000,
    reward: 50,
  },
  {
    id: 'archer-2000',
    game: 'archer',
    gameLabel: 'Cupid Archery',
    detail: 'Earn 2000 points',
    goal: 2000,
    reward: 50,
  },
  {
    id: 'dojo-5000',
    game: 'dojo',
    gameLabel: 'Ninja Cub Dojo',
    detail: 'Earn 5000 points',
    goal: 5000,
    reward: 50,
  },
  {
    id: 'pairs-20',
    game: 'match',
    gameLabel: 'Pride Pairs',
    detail: 'Earn 20 points',
    goal: 20,
    reward: 50,
  },
]

const GAMES: DailyGame[] = ['flight', 'hoops', 'archer', 'dojo', 'match']

export const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000

function todayKey(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function emptyDaily(): DailyProgress {
  return { startedAt: null, scores: {}, claimed: [] }
}

function readScores(raw: Partial<DailyProgress>): DailyProgress['scores'] {
  const scores: DailyProgress['scores'] = {}
  if (!raw.scores || typeof raw.scores !== 'object') return scores
  for (const game of GAMES) {
    const score = raw.scores[game]
    if (typeof score === 'number' && Number.isFinite(score)) {
      scores[game] = Math.max(0, Math.floor(score))
    }
  }
  return scores
}

function readClaimed(raw: Partial<DailyProgress>) {
  const known = new Set(DAILY_TASKS.map((task) => task.id))
  return Array.isArray(raw.claimed)
    ? [...new Set(raw.claimed.filter((id): id is string => typeof id === 'string' && known.has(id)))]
    : []
}

/** The live board. A round that has run for 24 hours comes back empty. */
export function dailyView(daily: DailyProgress | undefined, now = new Date()): DailyProgress {
  if (!daily) return emptyDaily()
  if (daily.startedAt != null && now.getTime() >= daily.startedAt + DAILY_WINDOW_MS) return emptyDaily()
  return daily
}

export function sanitizeDaily(value: unknown, now = new Date()): DailyProgress {
  if (!value || typeof value !== 'object') return emptyDaily()
  const raw = value as Partial<DailyProgress> & { day?: string }
  const scores = readScores(raw)
  const claimed = readClaimed(raw)
  const startedAt =
    typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) ? Math.floor(raw.startedAt) : null
  if (startedAt != null) {
    if (now.getTime() >= startedAt + DAILY_WINDOW_MS) return emptyDaily()
    return { startedAt, scores, claimed }
  }
  const hasProgress = claimed.length > 0 || Object.values(scores).some((score) => (score ?? 0) > 0)
  if (hasProgress && raw.day === todayKey(now)) {
    return { startedAt: now.getTime(), scores, claimed }
  }
  return emptyDaily()
}

export function taskScore(daily: DailyProgress, task: DailyTask) {
  return Math.min(task.goal, daily.scores[task.game] ?? 0)
}

export function taskReady(daily: DailyProgress, task: DailyTask) {
  return (daily.scores[task.game] ?? 0) >= task.goal && !daily.claimed.includes(task.id)
}

export function claimableCount(daily: DailyProgress) {
  return DAILY_TASKS.filter((task) => taskReady(daily, task)).length
}

/** Milliseconds left in the round. Null until the player starts a challenge. */
export function msUntilDailyReset(startedAt: number | null, now = new Date()) {
  if (startedAt == null) return null
  return Math.max(0, startedAt + DAILY_WINDOW_MS - now.getTime())
}

export function formatResetCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}
