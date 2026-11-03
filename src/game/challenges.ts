import type { DailyGame } from './dailyTasks'
import { LEADERBOARD_BOARDS, type LeaderboardGame } from './leaderboard'
import { profilePhotoUrl } from './profilePhoto'
import { boardKey, isSpellitaireKey, SPELL_MODE_IDS, type Difficulty, type SpellMode } from './solitaire/keys'
import { modeInfo } from './solitaire/modes'
import { supabase } from './supabase'

/** Cub Cash a challenge can be for. The server checks the same list. */
export const WAGERS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500] as const

/** Most challenges a player can have going: sent and still waiting, plus active ones. The server checks the same. */
export const MAX_OPEN_CHALLENGES = 10

/** The starting Cub Cash every account gets. It can never be wagered, so only earned Cub Cash goes into challenges. */
export const STARTER_CASH = 100

/** Cub Cash this player can put into challenges: everything above the starting 100. */
export function wagerableCash(cash: number) {
  return Math.max(0, cash - STARTER_CASH)
}

export type ChallengeStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'declined' | 'expired'

export type Challenge = {
  id: string
  /** The score board both players play on: a game id, or a Spellitaire key with its mode and difficulty. */
  board: LeaderboardGame
  wager: number
  status: ChallengeStatus
  outcome: 'win' | 'draw' | 'no_scores' | 'refund' | null
  role: 'challenger' | 'opponent'
  opponent: { username: string; photoUrl: string | null }
  myBest: number | null
  theirBest: number | null
  won: boolean
  lost: boolean
  /** Cub Cash this player put in, and what came back to them. */
  staked: number
  paid: number
  createdAt: number
  acceptBy: number
  acceptedAt: number | null
  endsAt: number | null
  closedAt: number | null
}

export type ChallengeNoticeKind =
  | 'received'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'won'
  | 'lost'
  | 'draw'
  | 'no_scores'

export type ChallengeNotice = {
  id: number
  kind: ChallengeNoticeKind
  amount: number
  challengeId: string
  board: LeaderboardGame
  username: string
}

export type ChallengeList = {
  challenges: Challenge[]
  notices: ChallengeNotice[]
  /** Server time minus this phone's time, for countdowns. */
  clockOffset: number
  cubCash: number | null
}

export type ChallengePlayer = { rank: number; username: string; score: number; photoUrl: string | null }

/** One game a challenge can be played on. Spellitaire has one per mode and difficulty. */
export type ChallengeGame = {
  board: LeaderboardGame
  game: DailyGame
  label: string
  mode?: SpellMode
  difficulty?: Difficulty
}

const GAME_LABELS = new Map(LEADERBOARD_BOARDS.map((item) => [item.id, item.label]))

/** Every game on the leaderboards, so a new game is challengeable as soon as it has a board. */
export const CHALLENGE_GAMES: ChallengeGame[] = LEADERBOARD_BOARDS.flatMap((item): ChallengeGame[] => {
  if (item.id === 'overall') return []
  if (item.id !== 'solitaire') return [{ board: item.id, game: item.id, label: item.label }]
  return SPELL_MODE_IDS.flatMap((mode) =>
    (['easy', 'hard'] as const).map((difficulty) => ({
      board: boardKey(mode, difficulty),
      game: 'solitaire' as const,
      label: `${modeInfo(mode).name} · ${difficulty === 'hard' ? 'Hard' : 'Easy'}`,
      mode,
      difficulty,
    })),
  )
})

export function challengeGame(board: string): ChallengeGame | null {
  return CHALLENGE_GAMES.find((item) => item.board === board) ?? null
}

/** "Lazy Hoops", or "Spellitaire Pyramid · Hard". */
export function boardLabel(board: string) {
  const game = challengeGame(board)
  if (!game) return board
  return game.game === 'solitaire' ? `${GAME_LABELS.get('solitaire') ?? 'Spellitaire'} ${game.label}` : game.label
}

export function isChallengeBoard(board: string): board is LeaderboardGame {
  return challengeGame(board) !== null || isSpellitaireKey(board)
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function str(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function photoFrom(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const avatar = value as { path?: unknown; version?: unknown }
  return typeof avatar.path === 'string' && avatar.path !== '' ? profilePhotoUrl(avatar.path, num(avatar.version) ?? 0) : null
}

const STATUSES: ChallengeStatus[] = ['pending', 'active', 'completed', 'cancelled', 'declined', 'expired']
const KINDS: ChallengeNoticeKind[] = ['received', 'accepted', 'declined', 'cancelled', 'expired', 'won', 'lost', 'draw', 'no_scores']

function readChallenge(value: unknown): Challenge | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const board = str(row.board)
  const status = str(row.status) as ChallengeStatus
  if (!isChallengeBoard(board) || !STATUSES.includes(status)) return null
  const other = (row.opponent && typeof row.opponent === 'object' ? row.opponent : {}) as Record<string, unknown>
  const outcome = str(row.outcome)
  return {
    id: str(row.id),
    board,
    wager: num(row.wager) ?? 0,
    status,
    outcome: outcome === 'win' || outcome === 'draw' || outcome === 'no_scores' || outcome === 'refund' ? outcome : null,
    role: row.role === 'challenger' ? 'challenger' : 'opponent',
    opponent: { username: str(other.username), photoUrl: photoFrom(other.avatar) },
    myBest: num(row.myBest),
    theirBest: num(row.theirBest),
    won: row.won === true,
    lost: row.lost === true,
    staked: num(row.staked) ?? 0,
    paid: num(row.paid) ?? 0,
    createdAt: num(row.createdAt) ?? 0,
    acceptBy: num(row.acceptBy) ?? 0,
    acceptedAt: num(row.acceptedAt),
    endsAt: num(row.endsAt),
    closedAt: num(row.closedAt),
  }
}

function readNotice(value: unknown): ChallengeNotice | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const kind = str(row.kind) as ChallengeNoticeKind
  const board = str(row.board)
  const id = num(row.id)
  if (id === null || !KINDS.includes(kind) || !isChallengeBoard(board)) return null
  return { id, kind, amount: num(row.amount) ?? 0, challengeId: str(row.challengeId), board, username: str(row.username) }
}

/** Server messages that are worth showing as they are. */
const FRIENDLY = [
  'Not enough Cub Cash',
  'Player not found',
  'You cannot challenge yourself',
  'That player cannot be challenged yet',
  'Too many open challenges',
  'Already challenged',
  'This account is banned',
]

function failure(message: string | undefined) {
  const text = message ?? ''
  if (text === 'Already challenged') return 'You already have an open challenge with this player in this game.'
  if (text === 'Too many open challenges') {
    return `You already have ${MAX_OPEN_CHALLENGES} challenges going (sent and active). Wait for one to finish first.`
  }
  if (text === 'That player cannot be challenged yet') return 'That player needs to play a game before they can be challenged.'
  if (text === 'Not enough earned Cub Cash') {
    return `Your first ${STARTER_CASH} Cub Cash can't be wagered. Earn more by playing games.`
  }
  if (FRIENDLY.includes(text)) return text
  if (text.toLowerCase().includes('could not find the function')) return 'Challenges are not switched on yet.'
  return 'Something went wrong. Please try again.'
}

async function call(fn: string, args: Record<string, unknown> = {}) {
  if (!supabase) throw new Error('Accounts are not connected.')
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(failure(error.message))
  return data as unknown
}

function cashOf(data: unknown) {
  return data && typeof data === 'object' ? num((data as { cubCash?: unknown }).cubCash) : null
}

/** Settles this player's overdue challenges on the server, then lists them all. */
export async function loadChallenges(): Promise<ChallengeList> {
  const asked = Date.now()
  const data = (await call('my_challenges')) as Record<string, unknown> | null
  const serverNow = num(data?.serverNow)
  return {
    challenges: Array.isArray(data?.challenges) ? data.challenges.map(readChallenge).filter((c): c is Challenge => c !== null) : [],
    notices: Array.isArray(data?.notices) ? data.notices.map(readNotice).filter((n): n is ChallengeNotice => n !== null) : [],
    clockOffset: serverNow === null ? 0 : serverNow - Math.round((asked + Date.now()) / 2),
    cubCash: cashOf(data),
  }
}

export async function sendChallenge(username: string, board: LeaderboardGame, wager: number) {
  const data = await call('challenge_send', { p_opponent: username, p_board: board, p_wager: wager })
  return { cubCash: cashOf(data) }
}

export async function cancelChallenge(id: string) {
  const data = (await call('challenge_cancel', { p_id: id })) as { status?: unknown } | null
  return { status: str(data?.status), cubCash: cashOf(data) }
}

export async function respondChallenge(id: string, accept: boolean) {
  const data = (await call('challenge_respond', { p_id: id, p_accept: accept })) as { status?: unknown } | null
  return { status: str(data?.status), cubCash: cashOf(data) }
}

export async function markNoticesSeen(ids: number[]) {
  if (ids.length === 0) return
  await call('challenge_notices_seen', { p_ids: ids })
}

export async function findPlayers(query: string, offset = 0) {
  const data = (await call('challenge_players', { p_query: query, p_limit: 20, p_offset: offset })) as Record<string, unknown> | null
  const rows: ChallengePlayer[] = Array.isArray(data?.rows)
    ? data.rows.flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const row = value as Record<string, unknown>
        const username = str(row.username)
        if (!username) return []
        return [{ rank: num(row.rank) ?? 0, username, score: num(row.score) ?? 0, photoUrl: photoFrom(row.avatar) }]
      })
    : []
  return { rows, total: num(data?.total) ?? rows.length }
}

/** A finished challenge between any two players, for the community results. */
export type CommunityResult = {
  id: string
  board: LeaderboardGame
  wager: number
  draw: boolean
  challenger: { username: string; photoUrl: string | null; best: number | null }
  opponent: { username: string; photoUrl: string | null; best: number | null }
  winner: string | null
  mine: boolean
  closedAt: number
}

function readSide(value: unknown) {
  const side = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return { username: str(side.username), photoUrl: photoFrom(side.avatar), best: num(side.best) }
}

/** `query` keeps only results where either player's name contains it. */
export async function loadCommunityResults(offset = 0, query = '') {
  const data = (await call('challenge_results', { p_limit: 20, p_offset: offset, p_query: query.trim() })) as Record<
    string,
    unknown
  > | null
  const rows: CommunityResult[] = Array.isArray(data?.rows)
    ? data.rows.flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const row = value as Record<string, unknown>
        const board = str(row.board)
        if (!isChallengeBoard(board)) return []
        return [
          {
            id: str(row.id),
            board,
            wager: num(row.wager) ?? 0,
            draw: row.outcome === 'draw',
            challenger: readSide(row.challenger),
            opponent: readSide(row.opponent),
            winner: typeof row.winner === 'string' ? row.winner : null,
            mine: row.mine === true,
            closedAt: num(row.closedAt) ?? 0,
          },
        ]
      })
    : []
  return { rows, more: data?.more === true }
}

/** Counts a finished run towards this player's running challenges on that board. */
export async function submitChallengeScore(board: LeaderboardGame, score: number) {
  if (!supabase || score <= 0) return
  await supabase.rpc('submit_challenge_score', { p_board: board, p_score: Math.floor(score) })
}

/** "5h 12m", "12m 30s". */
export function timeLeft(until: number | null, now: number) {
  if (until === null) return ''
  const seconds = Math.max(0, Math.floor((until - now) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${seconds % 60}s`
  return `${seconds}s`
}

/** Challenges counting towards the limit: sent and still waiting, plus active ones either way. */
export function openChallengeCount(list: ChallengeList | null) {
  if (!list) return 0
  return list.challenges.filter((c) => c.status === 'active' || (c.status === 'pending' && c.role === 'challenger')).length
}

/** Received challenges waiting for an answer, plus results not looked at yet. */
export function challengesNeedingAttention(list: ChallengeList | null) {
  if (!list) return 0
  const waiting = list.challenges.filter((c) => c.status === 'pending' && c.role === 'opponent').length
  return waiting + list.notices.length
}
