/**
 * Pyramid solitaire. Pure rules: every function takes a state and returns a new one, or null when the
 * move is not allowed. Clear the 28-card pyramid by removing pairs that add up to 13 (Kings go alone),
 * using uncovered pyramid cards and the top waste card.
 */
import { makeDeck, seededRandom, shuffle, type Card } from '../cards/deck'
import { timeBonus, winCoinsFor, type KlondikeRewards } from './klondike'
import { PYRAMID_DEALS } from './pyramidDeals'
import { KLONDIKE_SCORING, PYRAMID_SCORING, SOLITAIRE_REWARDS } from './scoring'
import type { PileId, TableHint } from './table'

export type PyramidDifficulty = 'easy' | 'hard'

/** Every number here can be adjusted after testing. */
export const PYRAMID_SETTINGS = {
  rows: 7,
  difficulty: {
    /** Passes through the stock (1 means it can't be turned back over). */
    easy: { passes: 3 },
    hard: { passes: 1 },
  },
  /**
   * Only deals that can be won are dealt, from the checked lists in pyramidDeals.ts. Without a list,
   * this many deals are checked in turn; if none is proven winnable in time, the last one is used.
   */
  dealTries: 40,
  /** How many positions the deal check may look at for each deal tried. */
  solverBudget: 6000,
} as const

export const PYRAMID_SIZE = (PYRAMID_SETTINGS.rows * (PYRAMID_SETTINGS.rows + 1)) / 2
export const PYRAMID_PILES = Array.from({ length: PYRAMID_SIZE }, (_, i) => `p${i}`)
/** Where removed cards go. */
export const PY_DISCARD = 'f0'

type Piles = { pyramid: (Card | null)[]; stock: Card[]; waste: Card[]; foundations: Card[][] }

type Snapshot = Piles & {
  points: number
  moves: number
  won: boolean
  passes: number
  homed: string[]
  coinCards: string[]
}

export type PyramidState = Piles & {
  seed: number
  difficulty: PyramidDifficulty
  /** Passes through the stock so far, counting the first. */
  passes: number
  points: number
  penalty: number
  moves: number
  hints: number
  undos: number
  won: boolean
  /** Cards removed, for XP. */
  homed: string[]
  /** The card that finished clearing each pyramid row: one Cub Cash coin per row. */
  coinCards: string[]
  history: Snapshot[]
}

const HISTORY_LIMIT = 1000

/** Row and place in the row of a pyramid position (0 is the top card). */
export function pyramidSpot(index: number) {
  let row = 0
  while (((row + 1) * (row + 2)) / 2 <= index) row += 1
  return { row, col: index - (row * (row + 1)) / 2 }
}

const rowStart = (row: number) => (row * (row + 1)) / 2
const isPyramid = (pile: PileId) => pile[0] === 'p'
const pyramidIndex = (pile: PileId) => Number(pile.slice(1))
const top = (cards: Card[]) => cards[cards.length - 1]

/** A pyramid position is open when both cards resting on it are gone (the bottom row starts open). */
function isOpen(pyramid: readonly unknown[], index: number) {
  const { row, col } = pyramidSpot(index)
  if (row === PYRAMID_SETTINGS.rows - 1) return true
  const below = rowStart(row + 1) + col
  return pyramid[below] === null && pyramid[below + 1] === null
}

function copyPiles(state: Piles): Piles {
  const copy = (pile: Card[]) => pile.map((card) => ({ ...card }))
  return {
    pyramid: state.pyramid.map((card) => (card ? { ...card } : null)),
    stock: copy(state.stock),
    waste: copy(state.waste),
    foundations: state.foundations.map(copy),
  }
}

function withHistory(state: PyramidState): PyramidState {
  const snap: Snapshot = {
    ...copyPiles(state),
    points: state.points,
    moves: state.moves,
    won: state.won,
    passes: state.passes,
    homed: state.homed,
    coinCards: state.coinCards,
  }
  const history = [...state.history, snap]
  if (history.length > HISTORY_LIMIT) history.shift()
  return { ...state, ...copyPiles(state), history }
}

function freshDeal(seed: number, difficulty: PyramidDifficulty): PyramidState {
  const deck = shuffle(makeDeck(), seededRandom(seed))
  return {
    seed,
    difficulty,
    pyramid: deck.slice(0, PYRAMID_SIZE).map((card) => ({ ...card, faceUp: true })),
    stock: deck.slice(PYRAMID_SIZE).map((card) => ({ ...card, faceUp: false })),
    waste: [],
    foundations: [[]],
    passes: 1,
    points: 0,
    penalty: 0,
    moves: 0,
    hints: 0,
    undos: 0,
    won: false,
    homed: [],
    coinCards: [],
    history: [],
  }
}

/**
 * A deal that can be won, picked by seed from deals already checked for this difficulty, so the
 * same seed always gives the same deal.
 */
export function dealPyramid(seed: number, difficulty: PyramidDifficulty): PyramidState {
  const checked = PYRAMID_DEALS[difficulty]
  if (checked.length > 0) return freshDeal(checked[Math.abs(Math.floor(seed)) % checked.length], difficulty)
  let deal = freshDeal(seed, difficulty)
  for (let attempt = 0; attempt < PYRAMID_SETTINGS.dealTries; attempt += 1) {
    deal = freshDeal((seed + attempt) >>> 0, difficulty)
    if (pyramidWinnable(deal, PYRAMID_SETTINGS.solverBudget) === 'won') return deal
  }
  return deal
}

export function pyPileCards(state: Piles, pile: PileId): Card[] {
  if (pile === 'stock') return state.stock
  if (pile === 'waste') return state.waste
  if (pile === PY_DISCARD) return state.foundations[0]
  if (isPyramid(pile)) {
    const card = state.pyramid[pyramidIndex(pile)]
    return card ? [card] : []
  }
  return []
}

/** Is this card free to play: an uncovered pyramid card, or the top waste card? */
export function pyCanPickUp(state: Piles, pile: PileId, index: number): boolean {
  if (isPyramid(pile)) {
    const i = pyramidIndex(pile)
    return index === 0 && state.pyramid[i] != null && isOpen(state.pyramid, i)
  }
  if (pile === 'waste') return state.waste.length > 0 && index === state.waste.length - 1
  return false
}

/** A pyramid card still covered by a card resting on it, shown dimmed. */
export function pyCovered(state: Piles, pile: PileId) {
  if (!isPyramid(pile)) return false
  const i = pyramidIndex(pile)
  return state.pyramid[i] != null && !isOpen(state.pyramid, i)
}

/** The free card on a pile, if any. */
function freeCard(state: Piles, pile: PileId) {
  const cards = pyPileCards(state, pile)
  return cards.length > 0 && pyCanPickUp(state, pile, cards.length - 1) ? top(cards) : null
}

/**
 * "Moving" a card removes it: onto the discard pile when it is a King, or onto a free card that
 * makes 13 with it, which removes both.
 */
export function pyCanMove(state: PyramidState, from: PileId, index: number, to: PileId): boolean {
  if (state.won || from === to || !pyCanPickUp(state, from, index)) return false
  const card = pyPileCards(state, from)[index]
  if (to === PY_DISCARD) return card.rank === 13
  const other = freeCard(state, to)
  return other !== null && card.rank + other.rank === 13
}

function removeFrom(next: Piles, pile: PileId): Card {
  if (isPyramid(pile)) {
    const i = pyramidIndex(pile)
    const card = next.pyramid[i] as Card
    next.pyramid[i] = null
    return card
  }
  return next.waste.pop() as Card
}

const openCount = (pyramid: (Card | null)[]) => pyramid.filter((card, i) => card !== null && isOpen(pyramid, i)).length

/** Removes a King, or a pair making 13. Cards it uncovers become free. */
export function pyMove(state: PyramidState, from: PileId, index: number, to: PileId): PyramidState | null {
  if (!pyCanMove(state, from, index, to)) return null
  const next = withHistory(state)
  const removedBefore = state.pyramid.filter((card) => card === null).length
  const openBefore = openCount(state.pyramid)
  const piles = to === PY_DISCARD ? [from] : [from, to]
  const removed = piles.map((pile) => ({ pile, card: removeFrom(next, pile) }))
  let points = next.points
  for (const { pile, card } of removed) {
    next.foundations[0].push({ ...card, faceUp: true })
    points += isPyramid(pile) ? PYRAMID_SCORING.clearPyramidCard : PYRAMID_SCORING.clearStockCard
  }
  const pyramidRemoved = removed.filter(({ pile }) => isPyramid(pile)).length
  // Cards that became free: open now, less those that were open before and are still there.
  const uncovered = openCount(next.pyramid) - (openBefore - pyramidRemoved)
  if (uncovered > 0) points += uncovered * PYRAMID_SCORING.uncoverCard
  const ids = removed.map(({ card }) => card.id)
  // A coin for each row this move finishes clearing, popping over the card that cleared it.
  const rowCleared = (row: number) => next.pyramid.slice(rowStart(row), rowStart(row + 1)).every((card) => card === null)
  const coinRows = new Map<number, string>()
  for (const { pile, card } of removed) {
    if (!isPyramid(pile)) continue
    const { row } = pyramidSpot(pyramidIndex(pile))
    if (rowCleared(row) && !coinRows.has(row)) coinRows.set(row, card.id)
  }
  const coinIds = [...coinRows.values()]
  const coinCards = [...next.coinCards, ...coinIds.filter((id) => !next.coinCards.includes(id))]
  const won = removedBefore + pyramidRemoved === PYRAMID_SIZE
  return { ...next, points, homed: [...next.homed, ...ids], coinCards, moves: next.moves + 1, won }
}

export function pyMaxPasses(state: Pick<PyramidState, 'difficulty'>) {
  return PYRAMID_SETTINGS.difficulty[state.difficulty].passes
}

export function pyCanRecycle(state: PyramidState) {
  return state.stock.length === 0 && state.waste.length > 0 && state.passes < pyMaxPasses(state)
}

export function pyCanDraw(state: PyramidState) {
  return !state.won && (state.stock.length > 0 || pyCanRecycle(state))
}

/** Turns the next stock card onto the waste, or the waste back over when passes remain. Free either way. */
export function pyDraw(state: PyramidState): PyramidState | null {
  if (!pyCanDraw(state)) return null
  const next = withHistory(state)
  if (next.stock.length > 0) {
    const card = next.stock.pop() as Card
    next.waste.push({ ...card, faceUp: true })
    return { ...next, moves: next.moves + 1 }
  }
  const stock = next.waste.reverse().map((card) => ({ ...card, faceUp: false }))
  return { ...next, stock, waste: [], passes: next.passes + 1, moves: next.moves + 1 }
}

export function pyCanUndo(state: PyramidState) {
  return state.history.length > 0 && !state.won
}

/** Takes back the last move. Its points go with it; the undo penalty stays. */
export function pyUndo(state: PyramidState): PyramidState | null {
  if (!pyCanUndo(state)) return null
  const last = state.history[state.history.length - 1]
  return {
    ...state,
    ...copyPiles(last),
    points: last.points,
    moves: last.moves,
    won: last.won,
    passes: last.passes,
    homed: last.homed,
    coinCards: last.coinCards,
    history: state.history.slice(0, -1),
    undos: state.undos + 1,
    penalty: state.penalty + KLONDIKE_SCORING.undo,
  }
}

/** A tap on a free King removes it straight away. */
export function pyTapMove(state: PyramidState, pile: PileId, index: number): PileId | null {
  return pyCanMove(state, pile, index, PY_DISCARD) ? PY_DISCARD : null
}

/** Every free card: uncovered pyramid cards, then the top waste card. */
function freePiles(state: Piles): PileId[] {
  const piles = PYRAMID_PILES.filter((pile) => pyCanPickUp(state, pile, 0))
  if (state.waste.length > 0) piles.push('waste')
  return piles
}

/** A helpful next step: a King, a pair (pyramid pairs first), then a draw or turning the stock over. */
export function pyFindHint(state: PyramidState): TableHint {
  if (state.won) return { kind: 'none' }
  const free = freePiles(state)
  for (const pile of free) {
    if (freeCard(state, pile)?.rank === 13) return { kind: 'move', from: pile, index: pyPileCards(state, pile).length - 1, to: PY_DISCARD }
  }
  const pairs: { from: PileId; to: PileId }[] = []
  for (let a = 0; a < free.length; a += 1) {
    for (let b = a + 1; b < free.length; b += 1) {
      const first = freeCard(state, free[a])
      const second = freeCard(state, free[b])
      if (first && second && first.rank + second.rank === 13) {
        pairs.push(free[b] === 'waste' ? { from: 'waste', to: free[a] } : { from: free[a], to: free[b] })
      }
    }
  }
  const pyramidPair = pairs.find((pair) => pair.from !== 'waste')
  const pair = pyramidPair ?? pairs[0]
  if (pair) return { kind: 'move', from: pair.from, index: pyPileCards(state, pair.from).length - 1, to: pair.to }
  if (state.stock.length > 0) return { kind: 'draw' }
  if (pyCanRecycle(state)) return { kind: 'recycle' }
  return { kind: 'none' }
}

export function pyTakeHint(state: PyramidState): { state: PyramidState; hint: TableHint } {
  const hint = pyFindHint(state)
  if (hint.kind === 'none') return { state, hint }
  return { state: { ...state, hints: state.hints + 1, penalty: state.penalty + KLONDIKE_SCORING.hint }, hint }
}

/**
 * True while something can still be done: a King or a pair to remove, a card to draw, or the stock to
 * turn over. With nothing to pair, drawing still counts while the stock lasts.
 */
export function pyHasUsefulMove(state: PyramidState): boolean {
  if (state.won) return false
  if (pyCanDraw(state)) return true
  return pyFindHint(state).kind === 'move'
}

export function pyLiveScore(state: PyramidState) {
  return Math.max(0, state.points + state.penalty)
}

/** Same rewards as the other modes: the win and speed bonuses only for a cleared pyramid. */
export function pyRewardsFor(state: PyramidState, seconds: number): KlondikeRewards {
  const final = pyLiveScore(state) + (state.won ? KLONDIKE_SCORING.winBonus + timeBonus(seconds) : 0)
  return {
    score: Math.min(SOLITAIRE_REWARDS.maxScore, final),
    xp: state.homed.length * SOLITAIRE_REWARDS.xpPerHome + (state.won ? SOLITAIRE_REWARDS.winXp : 0),
    coins: state.coinCards.length * PYRAMID_SCORING.rowCoins + (state.won ? winCoinsFor(state.difficulty === 'hard' ? 3 : 1) : 0),
    won: state.won,
  }
}

/**
 * Can this position still be won? A depth-first search over ranks only (suits never matter here),
 * looking at no more than `budget` positions: 'budget' means it ran out before knowing.
 */
export function pyramidWinnable(state: PyramidState, budget: number): 'won' | 'lost' | 'budget' {
  type Node = { pyr: number[]; stock: number[]; waste: number[]; passes: number }
  const maxPasses = pyMaxPasses(state)
  const below = Array.from({ length: PYRAMID_SIZE }, (_, i) => {
    const { row, col } = pyramidSpot(i)
    return row === PYRAMID_SETTINGS.rows - 1 ? -1 : rowStart(row + 1) + col
  })
  const open = (pyr: number[], i: number) => pyr[i] > 0 && (below[i] < 0 || (pyr[below[i]] === 0 && pyr[below[i] + 1] === 0))
  const seen = new Set<string>()
  let nodes = 0
  const start: Node = {
    pyr: state.pyramid.map((card) => card?.rank ?? 0),
    stock: state.stock.map((card) => card.rank),
    waste: state.waste.map((card) => card.rank),
    passes: state.passes,
  }
  const stack: Node[] = [start]
  while (stack.length > 0) {
    const node = stack.pop() as Node
    // Kings are always safe to take at once.
    let changed = true
    while (changed) {
      changed = false
      for (let i = 0; i < PYRAMID_SIZE; i += 1) {
        if (node.pyr[i] === 13 && open(node.pyr, i)) {
          node.pyr[i] = 0
          changed = true
        }
      }
      if (node.waste[node.waste.length - 1] === 13) {
        node.waste.pop()
        changed = true
      }
    }
    if (node.pyr.every((rank) => rank === 0)) return 'won'
    const key = `${node.pyr.join(',')}|${node.stock.join(',')}|${node.waste.join(',')}|${node.passes}`
    if (seen.has(key)) continue
    seen.add(key)
    nodes += 1
    if (nodes > budget) return 'budget'
    const moves: Node[] = []
    const frees: number[] = []
    for (let i = 0; i < PYRAMID_SIZE; i += 1) if (open(node.pyr, i)) frees.push(i)
    const wasteTop = node.waste[node.waste.length - 1]
    if (node.stock.length > 0) {
      moves.push({ ...node, pyr: node.pyr, stock: node.stock.slice(0, -1), waste: [...node.waste, node.stock[node.stock.length - 1]] })
    } else if (node.waste.length > 0 && node.passes < maxPasses) {
      moves.push({ pyr: node.pyr, stock: node.waste.slice().reverse(), waste: [], passes: node.passes + 1 })
    }
    for (const i of frees) {
      if (wasteTop !== undefined && node.pyr[i] + wasteTop === 13) {
        const pyr = node.pyr.slice()
        pyr[i] = 0
        moves.push({ ...node, pyr, waste: node.waste.slice(0, -1) })
      }
    }
    for (let a = 0; a < frees.length; a += 1) {
      for (let b = a + 1; b < frees.length; b += 1) {
        if (node.pyr[frees[a]] + node.pyr[frees[b]] !== 13) continue
        const pyr = node.pyr.slice()
        pyr[frees[a]] = 0
        pyr[frees[b]] = 0
        moves.push({ ...node, pyr })
      }
    }
    // Pairs are pushed last so they are tried first.
    for (const move of moves) stack.push({ ...move, pyr: move.pyr.slice(), waste: move.waste.slice(), stock: move.stock.slice() })
  }
  return 'lost'
}
