/**
 * Golf. Pure rules: every function takes a state and returns a new one, or null when the move is
 * not allowed. Clear all 35 face-up cards from seven columns by playing the bottom card of a column
 * onto the waste when it is one higher or lower than the waste card. Easy lets King and Ace join up.
 */
import { makeDeck, seededRandom, shuffle, type Card } from '../cards/deck'
import { GOLF_DEALS } from './golfDeals'
import type { KlondikeRewards } from './klondike'
import { timeBonus, winCoinsFor } from './klondike'
import { GOLF_SCORING, KLONDIKE_SCORING, SOLITAIRE_REWARDS } from './scoring'
import type { PileId, TableHint } from './table'

export type GolfDifficulty = 'easy' | 'hard'

/** Every setting here can be adjusted after testing. */
export const GOLF_SETTINGS = {
  columns: 7,
  rows: 5,
  difficulty: {
    /** Relaxed golf: King and Ace connect both ways. */
    easy: { wrap: true },
    /** Classic golf: Ace only to 2, King only to Queen. */
    hard: { wrap: false },
  },
} as const

export const GOLF_TABLEAU = Array.from({ length: GOLF_SETTINGS.columns }, (_, i) => `t${i}`)
export const GOLF_SIZE = GOLF_SETTINGS.columns * GOLF_SETTINGS.rows

type Piles = { tableau: Card[][]; stock: Card[]; waste: Card[] }

type Snapshot = Piles & {
  points: number
  moves: number
  won: boolean
  streak: number
  homed: string[]
  coinCards: string[]
}

export type GolfState = Piles & {
  seed: number
  difficulty: GolfDifficulty
  /** Nothing is ever built here; the board reads it for its sparkles. */
  foundations: Card[][]
  points: number
  penalty: number
  moves: number
  hints: number
  undos: number
  won: boolean
  /** Tableau cards played in a row since the last draw. */
  streak: number
  /** Tableau cards played, for XP. */
  homed: string[]
  /** One card for each Cub Cash coin earned by a long streak. */
  coinCards: string[]
  history: Snapshot[]
}

const HISTORY_LIMIT = 1000
const isTableau = (pile: PileId) => pile[0] === 't'
const pileIndex = (pile: PileId) => Number(pile.slice(1))
const top = (cards: Card[]) => cards[cards.length - 1]

/** Does a card of rank `a` go on a waste card of rank `b`? One apart, or King and Ace when wrapping. */
export function golfFits(a: number, b: number, wrap: boolean) {
  const gap = Math.abs(a - b)
  return gap === 1 || (wrap && gap === 12)
}

const wraps = (state: Pick<GolfState, 'difficulty'>) => GOLF_SETTINGS.difficulty[state.difficulty].wrap

function copyPiles(state: Piles): Piles {
  const copy = (pile: Card[]) => pile.map((card) => ({ ...card }))
  return { tableau: state.tableau.map(copy), stock: copy(state.stock), waste: copy(state.waste) }
}

function withHistory(state: GolfState): GolfState {
  const snap: Snapshot = {
    ...copyPiles(state),
    points: state.points,
    moves: state.moves,
    won: state.won,
    streak: state.streak,
    homed: state.homed,
    coinCards: state.coinCards,
  }
  const history = [...state.history, snap]
  if (history.length > HISTORY_LIMIT) history.shift()
  return { ...state, ...copyPiles(state), history }
}

/** A shuffled deal: 35 face-up cards in seven columns of five, one card turned onto the waste, 16 in the stock. */
export function freshGolf(seed: number, difficulty: GolfDifficulty): GolfState {
  const deck = shuffle(makeDeck(), seededRandom(seed))
  const tableau: Card[][] = GOLF_TABLEAU.map(() => [])
  deck.slice(0, GOLF_SIZE).forEach((card, i) => tableau[i % GOLF_SETTINGS.columns].push({ ...card, faceUp: true }))
  const rest = deck.slice(GOLF_SIZE)
  return {
    seed,
    difficulty,
    tableau,
    stock: rest.slice(1).map((card) => ({ ...card, faceUp: false })),
    waste: [{ ...rest[0], faceUp: true }],
    foundations: [],
    points: 0,
    penalty: 0,
    moves: 0,
    hints: 0,
    undos: 0,
    won: false,
    streak: 0,
    homed: [],
    coinCards: [],
    history: [],
  }
}

/** A deal checked to be winnable, picked by seed from the list for this difficulty. */
export function dealGolf(seed: number, difficulty: GolfDifficulty): GolfState {
  const checked = GOLF_DEALS[difficulty]
  const pick = checked.length > 0 ? checked[Math.abs(Math.floor(seed)) % checked.length] : seed
  return freshGolf(pick, difficulty)
}

export function golfPileCards(state: Piles, pile: PileId): Card[] {
  if (pile === 'stock') return state.stock
  if (pile === 'waste') return state.waste
  if (isTableau(pile)) return state.tableau[pileIndex(pile)] ?? []
  return []
}

/** Only the bottom card of a column can be played. */
export function golfCanPickUp(state: Piles, pile: PileId, index: number): boolean {
  if (!isTableau(pile)) return false
  return index >= 0 && index === golfPileCards(state, pile).length - 1
}

/** A column's bottom card shown dimmed until the cards below it are gone. */
export function golfCovered(state: Piles, pile: PileId, index: number) {
  return isTableau(pile) && index < golfPileCards(state, pile).length - 1
}

export function golfCanMove(state: GolfState, from: PileId, index: number, to: PileId): boolean {
  if (state.won || to !== 'waste' || !golfCanPickUp(state, from, index)) return false
  const card = golfPileCards(state, from)[index]
  const onTop = top(state.waste)
  return onTop !== undefined && golfFits(card.rank, onTop.rank, wraps(state))
}

/** Points for the nth card in a row (n from 1): the base, plus a growing, capped streak bonus. */
export function golfCardPoints(n: number) {
  return GOLF_SCORING.clearCard + Math.min(GOLF_SCORING.streakCap, Math.max(0, n - 1) * GOLF_SCORING.streakStep)
}

/** Plays a column's bottom card onto the waste. */
export function golfMove(state: GolfState, from: PileId, index: number, to: PileId): GolfState | null {
  if (!golfCanMove(state, from, index, to)) return null
  const next = withHistory(state)
  const card = golfPileCards(next, from).pop() as Card
  next.waste.push(card)
  const streak = next.streak + 1
  let points = next.points + golfCardPoints(streak)
  const coinCards = streak % GOLF_SCORING.streakCoinEvery === 0 ? [...next.coinCards, card.id] : next.coinCards
  const won = next.tableau.every((pile) => pile.length === 0)
  if (won) points += next.stock.length * GOLF_SCORING.stockLeft
  return { ...next, points, streak, coinCards, homed: [...next.homed, card.id], moves: next.moves + 1, won }
}

export function golfCanDraw(state: GolfState) {
  return !state.won && state.stock.length > 0
}

/** Turns the next stock card onto the waste. Each stock card comes up once; the streak starts again. */
export function golfDraw(state: GolfState): GolfState | null {
  if (!golfCanDraw(state)) return null
  const next = withHistory(state)
  const card = next.stock.pop() as Card
  next.waste.push({ ...card, faceUp: true })
  return { ...next, streak: 0, moves: next.moves + 1 }
}

export function golfCanUndo(state: GolfState) {
  return state.history.length > 0 && !state.won
}

/** Takes back the last play or draw, with its points and streak. The undo penalty stays. */
export function golfUndo(state: GolfState): GolfState | null {
  if (!golfCanUndo(state)) return null
  const last = state.history[state.history.length - 1]
  return {
    ...state,
    ...copyPiles(last),
    points: last.points,
    moves: last.moves,
    won: last.won,
    streak: last.streak,
    homed: last.homed,
    coinCards: last.coinCards,
    history: state.history.slice(0, -1),
    undos: state.undos + 1,
    penalty: state.penalty + KLONDIKE_SCORING.undo,
  }
}

/** A tap on a playable card sends it to the waste. */
export function golfTapMove(state: GolfState, pile: PileId, index: number): PileId | null {
  return golfCanMove(state, pile, index, 'waste') ? 'waste' : null
}

const playable = (state: GolfState) => GOLF_TABLEAU.filter((pile) => golfCanMove(state, pile, golfPileCards(state, pile).length - 1, 'waste'))

/**
 * Looks for a way to clear the table from here, over ranks only. Returns the first step ('draw' or
 * a column) of a winning line, or null if none was found within `budget` positions.
 */
export function golfSolve(
  state: GolfState,
  budget: number,
  /** Positions already known to be lost on this deal, kept between calls. */
  failed = new Set<string>(),
): { first: PileId | 'draw'; nodes: number } | null {
  const cols = state.tableau.map((pile) => pile.map((card) => card.rank))
  const stock = state.stock.map((card) => card.rank)
  const wrap = wraps(state)
  const heights = cols.map((pile) => pile.length)
  let nodes = 0
  const search = (waste: number, stockLeft: number): PileId | 'draw' | 'won' | null => {
    if (heights.every((h) => h === 0)) return 'won'
    const key = `${heights.join('')}|${stockLeft}|${waste}`
    if (failed.has(key)) return null
    nodes += 1
    if (nodes > budget) return null
    // Columns first, the one with most cards left first: clearing tall columns keeps options open.
    const order = heights.map((_, i) => i).sort((a, b) => heights[b] - heights[a])
    for (const i of order) {
      const h = heights[i]
      if (h === 0 || !golfFits(cols[i][h - 1], waste, wrap)) continue
      heights[i] -= 1
      const result = search(cols[i][h - 1], stockLeft)
      heights[i] += 1
      if (result) return GOLF_TABLEAU[i]
      if (nodes > budget) return null
    }
    if (stockLeft > 0 && search(stock[stockLeft - 1], stockLeft - 1)) return 'draw'
    // Only a position looked at in full is known to be lost.
    if (nodes <= budget) failed.add(key)
    return null
  }
  const waste = top(state.waste)
  if (!waste) return null
  const first = search(waste.rank, stock.length)
  if (!first || first === 'won') return null
  return { first, nodes }
}

/** How many cards could be played in a row from here without drawing. */
function longestChain(state: GolfState, depth = 0): number {
  if (depth > 12) return 0
  let best = 0
  for (const pile of playable(state)) {
    const next = golfMove({ ...state, history: [] }, pile, golfPileCards(state, pile).length - 1, 'waste')
    if (next) best = Math.max(best, 1 + longestChain(next, depth + 1))
  }
  return best
}

/** How many positions a hint may look through to find a way to clear the table. */
const HINT_BUDGET = 40000

/**
 * Lost positions found while looking for hints, per deal. A deal's cards never change, so what was
 * lost stays lost, and each hint carries on from where the last one stopped looking.
 */
const lostPositions = new Map<string, Set<string>>()

function lostFor(state: GolfState) {
  const key = `${state.difficulty}:${state.seed}:${state.tableau.flat().length + state.waste.length + state.stock.length}`
  let lost = lostPositions.get(key)
  if (!lost) {
    if (lostPositions.size > 4) lostPositions.clear()
    lost = new Set()
    lostPositions.set(key, lost)
  }
  return lost
}

/**
 * A helpful card: the first step of a way to clear the table when there is one; otherwise the card
 * that starts the longest run without drawing. Draw only when no card can be played.
 */
export function golfFindHint(state: GolfState): TableHint {
  if (state.won) return { kind: 'none' }
  const plan = golfSolve(state, HINT_BUDGET, lostFor(state))?.first
  // The way through tries every card before drawing, so a planned draw means no card leads to a win.
  if (plan === 'draw') return { kind: 'draw' }
  if (plan) return { kind: 'move', from: plan, index: golfPileCards(state, plan).length - 1, to: 'waste' }
  let best: { pile: PileId; chain: number; height: number } | null = null
  for (const pile of playable(state)) {
    const next = golfMove({ ...state, history: [] }, pile, golfPileCards(state, pile).length - 1, 'waste')
    if (!next) continue
    const chain = 1 + longestChain(next)
    const height = golfPileCards(state, pile).length
    if (!best || chain > best.chain || (chain === best.chain && height > best.height)) best = { pile, chain, height }
  }
  if (best) return { kind: 'move', from: best.pile, index: golfPileCards(state, best.pile).length - 1, to: 'waste' }
  if (golfCanDraw(state)) return { kind: 'draw' }
  return { kind: 'none' }
}

export function golfTakeHint(state: GolfState): { state: GolfState; hint: TableHint } {
  const hint = golfFindHint(state)
  if (hint.kind === 'none') return { state, hint }
  return { state: { ...state, hints: state.hints + 1, penalty: state.penalty + KLONDIKE_SCORING.hint }, hint }
}

/** True while a card can be played or the stock still has cards. */
export function golfHasUsefulMove(state: GolfState): boolean {
  if (state.won) return false
  return golfCanDraw(state) || playable(state).length > 0
}

export function golfLiveScore(state: GolfState) {
  return Math.max(0, state.points + state.penalty)
}

/** Same rewards as the other modes: the win and speed bonuses only for a cleared table. */
export function golfRewardsFor(state: GolfState, seconds: number): KlondikeRewards {
  const final = golfLiveScore(state) + (state.won ? KLONDIKE_SCORING.winBonus + timeBonus(seconds) : 0)
  return {
    score: Math.min(SOLITAIRE_REWARDS.maxScore, final),
    xp: state.homed.length * SOLITAIRE_REWARDS.xpPerHome + (state.won ? SOLITAIRE_REWARDS.winXp : 0),
    coins: state.coinCards.length + (state.won ? winCoinsFor(state.difficulty === 'hard' ? 3 : 1) : 0),
    won: state.won,
  }
}
