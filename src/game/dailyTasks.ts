import { TRAIT_CATEGORIES, type TraitCategory } from './cubTraits'
import type { CharacterAge } from './homeScene'
import { traitPrice } from './traitShop'

export type DailyGame = 'flight' | 'hoops' | 'archer' | 'dojo' | 'match'

/** One wardrobe style won from the board dice. */
export type BonusTrait = {
  age: CharacterAge
  category: TraitCategory
  name: string
}

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
  /** The board bonus has been paid this round. */
  bonusClaimed: boolean
  /** Trait won from the dice. Null when the bonus paid coins instead. */
  bonusTrait: BonusTrait | null
  /** Cub Cash from the dice. 0 when the bonus paid a trait. */
  bonusCoins: number
}

/** Chance the dice unlocks a trait the player does not own. */
export const BONUS_TRAIT_CHANCE = 0.2

/** Coin payouts when the dice does not award a trait. Lower amounts are more likely. */
export const BONUS_COIN_AMOUNTS = [10, 20, 30, 40, 50] as const

const BONUS_COIN_WEIGHTS = [5, 4, 3, 2, 1]

/** Cheaper unowned traits are more likely. A 100-coin style is ten times a 1,000-coin style. */
export function pickBonusTrait(unowned: BonusTrait[], random = Math.random): BonusTrait | null {
  if (unowned.length === 0) return null
  const weights = unowned.map((trait) => 1000 / Math.max(100, traitPrice(trait.age, trait.category, trait.name) ?? 100))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let pick = random() * total
  for (let i = 0; i < unowned.length; i += 1) {
    pick -= weights[i]
    if (pick < 0) return unowned[i]
  }
  return unowned[0]
}

export function rollBonusCoins(random = Math.random): (typeof BONUS_COIN_AMOUNTS)[number] {
  const total = BONUS_COIN_WEIGHTS.reduce((sum, weight) => sum + weight, 0)
  let pick = random() * total
  for (let i = 0; i < BONUS_COIN_AMOUNTS.length; i += 1) {
    pick -= BONUS_COIN_WEIGHTS[i]
    if (pick < 0) return BONUS_COIN_AMOUNTS[i]
  }
  return BONUS_COIN_AMOUNTS[0]
}

/** One challenge per game. The same five stay up for 24 hours after the first one starts. */
export const DAILY_TASKS: DailyTask[] = [
  {
    id: 'dash-20',
    game: 'flight',
    gameLabel: "Kovu's Space Dash",
    detail: 'Earn 20 points',
    goal: 20,
    reward: 10,
  },
  {
    id: 'hoops-5000',
    game: 'hoops',
    gameLabel: 'Lazy Hoops',
    detail: 'Earn 5000 points',
    goal: 5000,
    reward: 10,
  },
  {
    id: 'archer-2000',
    game: 'archer',
    gameLabel: 'Cupid Archery',
    detail: 'Earn 2000 points',
    goal: 2000,
    reward: 10,
  },
  {
    id: 'dojo-5000',
    game: 'dojo',
    gameLabel: 'Ninja Cub Dojo',
    detail: 'Earn 5000 points',
    goal: 5000,
    reward: 10,
  },
  {
    id: 'pairs-20',
    game: 'match',
    gameLabel: 'Pride Pairs',
    detail: 'Earn 20 points',
    goal: 20,
    reward: 10,
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
  return { startedAt: null, scores: {}, claimed: [], bonusClaimed: false, bonusTrait: null, bonusCoins: 0 }
}

function readBonusCoins(raw: Partial<DailyProgress>): number {
  return (BONUS_COIN_AMOUNTS as readonly number[]).includes(raw.bonusCoins ?? -1) ? (raw.bonusCoins as number) : 0
}

function readBonusTrait(raw: Partial<DailyProgress>): BonusTrait | null {
  const trait = raw.bonusTrait
  if (!trait || typeof trait !== 'object') return null
  const age = trait.age === 'young' || trait.age === 'old' ? trait.age : null
  const category = TRAIT_CATEGORIES.find((item) => item === trait.category) ?? null
  const name = typeof trait.name === 'string' ? trait.name.trim() : ''
  if (!age || !category || !name) return null
  return { age, category, name }
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
  const bonusClaimed = raw.bonusClaimed === true
  const bonusTrait = readBonusTrait(raw)
  const bonusCoins = bonusTrait ? 0 : readBonusCoins(raw)
  const startedAt =
    typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) ? Math.floor(raw.startedAt) : null
  if (startedAt != null) {
    if (now.getTime() >= startedAt + DAILY_WINDOW_MS) return emptyDaily()
    return { startedAt, scores, claimed, bonusClaimed, bonusTrait, bonusCoins }
  }
  const hasProgress = claimed.length > 0 || bonusClaimed || Object.values(scores).some((score) => (score ?? 0) > 0)
  if (hasProgress && raw.day === todayKey(now)) {
    return { startedAt: now.getTime(), scores, claimed, bonusClaimed, bonusTrait, bonusCoins }
  }
  return emptyDaily()
}

export function taskScore(daily: DailyProgress, task: DailyTask) {
  return Math.min(task.goal, daily.scores[task.game] ?? 0)
}

export function taskReady(daily: DailyProgress, task: DailyTask) {
  return (daily.scores[task.game] ?? 0) >= task.goal && !daily.claimed.includes(task.id)
}

/** Challenges whose score has reached the goal. */
export function tasksComplete(daily: DailyProgress) {
  return DAILY_TASKS.filter((task) => (daily.scores[task.game] ?? 0) >= task.goal).length
}

/** Any this many finished challenges unlock the daily bonus. */
export const BONUS_TASKS_REQUIRED = 3

export function bonusReady(daily: DailyProgress) {
  return tasksComplete(daily) >= BONUS_TASKS_REQUIRED && !daily.bonusClaimed
}

export function claimableCount(daily: DailyProgress) {
  return DAILY_TASKS.filter((task) => taskReady(daily, task)).length + (bonusReady(daily) ? 1 : 0)
}

/** True while a challenge is unfinished or a prize is still unclaimed. */
export function dailyNeedsAttention(daily: DailyProgress) {
  const tasksOpen = DAILY_TASKS.some(
    (task) => (daily.scores[task.game] ?? 0) < task.goal || !daily.claimed.includes(task.id),
  )
  return tasksOpen || !daily.bonusClaimed
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
