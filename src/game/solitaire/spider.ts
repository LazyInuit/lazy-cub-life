/**
 * Spider. Pure rules: every function takes a state and returns a new one, or null when the move is
 * not allowed. 104 cards in ten columns; build down by one in any suit, but only same-suit runs move
 * together. A full King-to-Ace run of one suit is cleared automatically; clear eight to win. The
 * stock deals one card onto every column, five times.
 */
import { makeCopies, seededRandom, shuffle, type Card, type Suit } from '../cards/deck'
import type { KlondikeRewards } from './klondike'
import { KLONDIKE_SCORING, SOLITAIRE_REWARDS, SPIDER_SCORING } from './scoring'
import type { PileId, TableHint } from './table'

export type SpiderDifficulty = 'easy' | 'hard'

/** Every setting here can be adjusted after testing. */
export const SPIDER_SETTINGS = {
  columns: 10,
  /** Cards dealt to the columns at the start: the first four get 6, the rest 5. */
  dealt: 54,
  /** Cards dealt from the stock each time: one per column. */
  perDeal: 10,
  runs: 8,
  difficulty: {
    easy: { suits: ['spades'] as readonly Suit[], copies: 8 },
    hard: { suits: ['spades', 'hearts'] as readonly Suit[], copies: 4 },
  },
  blockedDealMessage: 'Fill all empty columns before dealing new cards.',
} as const

export const SP_TABLEAU = Array.from({ length: SPIDER_SETTINGS.columns }, (_, i) => `t${i}`)
/** Where cleared runs go. */
export const SP_DONE = 'f0'

type Piles = { stock: Card[]; foundations: Card[][]; tableau: Card[][] }

type Snapshot = Piles & {
  points: number
  moves: number
  won: boolean
  revealed: number
  completed: number
  homed: string[]
  coinCards: string[]
}

export type SpiderState = Piles & {
  seed: number
  difficulty: SpiderDifficulty
  points: number
  penalty: number
  moves: number
  hints: number
  undos: number
  won: boolean
  /** Face-down cards turned over so far, for XP. */
  revealed: number
  /** King-to-Ace runs cleared. */
  completed: number
  /** Cards in cleared runs, for XP. */
  homed: string[]
  /** The King of each cleared run: one Cub Cash coin per run. */
  coinCards: string[]
  history: Snapshot[]
}

const HISTORY_LIMIT = 1000
const isTableau = (pile: PileId) => pile[0] === 't'
const pileIndex = (pile: PileId) => Number(pile.slice(1))
const top = (cards: Card[]) => cards[cards.length - 1]

function copyPiles(state: Piles): Piles {
  const copy = (pile: Card[]) => pile.map((card) => ({ ...card }))
  return { stock: copy(state.stock), foundations: state.foundations.map(copy), tableau: state.tableau.map(copy) }
}

function withHistory(state: SpiderState): SpiderState {
  const snap: Snapshot = {
    ...copyPiles(state),
    points: state.points,
    moves: state.moves,
    won: state.won,
    revealed: state.revealed,
    completed: state.completed,
    homed: state.homed,
    coinCards: state.coinCards,
  }
  const history = [...state.history, snap]
  if (history.length > HISTORY_LIMIT) history.shift()
  return { ...state, ...copyPiles(state), history }
}

/** A deal: 54 cards round the ten columns (four get 6, six get 5), top cards face up; 50 in the stock. */
export function dealSpider(seed: number, difficulty: SpiderDifficulty): SpiderState {
  const { suits, copies } = SPIDER_SETTINGS.difficulty[difficulty]
  const deck = shuffle(makeCopies(suits, copies), seededRandom(seed))
  const tableau: Card[][] = SP_TABLEAU.map(() => [])
  for (let i = 0; i < SPIDER_SETTINGS.dealt; i += 1) tableau[i % SPIDER_SETTINGS.columns].push({ ...deck[i], faceUp: false })
  for (const pile of tableau) pile[pile.length - 1].faceUp = true
  return {
    seed,
    difficulty,
    stock: deck.slice(SPIDER_SETTINGS.dealt).map((card) => ({ ...card, faceUp: false })),
    foundations: [[]],
    tableau,
    points: 0,
    penalty: 0,
    moves: 0,
    hints: 0,
    undos: 0,
    won: false,
    revealed: 0,
    completed: 0,
    homed: [],
    coinCards: [],
    history: [],
  }
}

export function spPileCards(state: Piles, pile: PileId): Card[] {
  if (pile === 'stock') return state.stock
  if (pile === SP_DONE) return state.foundations[0]
  if (isTableau(pile)) return state.tableau[pileIndex(pile)] ?? []
  return []
}

/** Face up, each one lower than the last, all one suit. */
function isSuitRun(cards: Card[]) {
  for (let i = 1; i < cards.length; i += 1) {
    if (!cards[i].faceUp || cards[i].rank !== cards[i - 1].rank - 1 || cards[i].suit !== cards[i - 1].suit) return false
  }
  return cards.length > 0 && cards[0].faceUp
}

/** Can the cards from this index to the end move together? */
export function spCanPickUp(state: Piles, pile: PileId, index: number): boolean {
  if (!isTableau(pile)) return false
  const cards = spPileCards(state, pile)
  if (index < 0 || index >= cards.length) return false
  return isSuitRun(cards.slice(index))
}

/** Onto a card one higher (any suit), or into an empty column. */
export function spCanMove(state: SpiderState, from: PileId, index: number, to: PileId): boolean {
  if (state.won || from === to || !isTableau(to) || !spCanPickUp(state, from, index)) return false
  const onTop = top(spPileCards(state, to))
  return !onTop || onTop.rank === spPileCards(state, from)[index].rank + 1
}

/** Turns over a column's last card when it is face down. */
function revealTop(pile: Card[]): number {
  const last = top(pile)
  if (!last || last.faceUp) return 0
  last.faceUp = true
  return 1
}

/** Clears every finished King-to-Ace run of one suit, turning over what each uncovers. */
function clearRuns(next: SpiderState) {
  let points = 0
  let revealed = 0
  let completed = 0
  const homed: string[] = []
  const coins: string[] = []
  for (const pile of next.tableau) {
    if (pile.length < 13) continue
    const tail = pile.slice(-13)
    if (tail[0].rank !== 13 || !isSuitRun(tail)) continue
    pile.splice(-13)
    next.foundations[0].push(...tail)
    completed += 1
    points += SPIDER_SCORING.completeRun
    homed.push(...tail.map((card) => card.id))
    coins.push(tail[0].id)
    const turned = revealTop(pile)
    revealed += turned
    points += turned * SPIDER_SCORING.revealCard
  }
  return { points, revealed, completed, homed, coins }
}

function finish(next: SpiderState, points: number, revealed: number): SpiderState {
  const cleared = clearRuns(next)
  const completed = next.completed + cleared.completed
  return {
    ...next,
    points: points + cleared.points,
    revealed: revealed + cleared.revealed,
    completed,
    homed: [...next.homed, ...cleared.homed],
    coinCards: [...next.coinCards, ...cleared.coins],
    moves: next.moves + 1,
    won: completed >= SPIDER_SETTINGS.runs,
  }
}

/** Moves a card or a run, turns over what it uncovers, and clears any run it finishes, as one move. */
export function spMove(state: SpiderState, from: PileId, index: number, to: PileId): SpiderState | null {
  if (!spCanMove(state, from, index, to)) return null
  const next = withHistory(state)
  const source = spPileCards(next, from)
  spPileCards(next, to).push(...source.splice(index))
  const turned = revealTop(source)
  return finish(next, next.points + turned * SPIDER_SCORING.revealCard, next.revealed + turned)
}

/** Deals left in the stock (five at the start). */
export function spDealsLeft(state: Pick<SpiderState, 'stock'>) {
  return Math.ceil(state.stock.length / SPIDER_SETTINGS.perDeal)
}

export function spCanDeal(state: SpiderState) {
  return !state.won && state.stock.length > 0 && state.tableau.every((pile) => pile.length > 0)
}

/** Why the stock can't be dealt right now, if that's because of an empty column. */
export function spDealBlocked(state: SpiderState): string | null {
  if (state.won || state.stock.length === 0) return null
  return state.tableau.some((pile) => pile.length === 0) ? SPIDER_SETTINGS.blockedDealMessage : null
}

/** Deals one face-up card onto every column, as one move. Runs it finishes are cleared. */
export function spDeal(state: SpiderState): SpiderState | null {
  if (!spCanDeal(state)) return null
  const next = withHistory(state)
  for (const pile of next.tableau) {
    const card = next.stock.pop()
    if (card) pile.push({ ...card, faceUp: true })
  }
  return finish(next, next.points, next.revealed)
}

export function spCanUndo(state: SpiderState) {
  return state.history.length > 0 && !state.won
}

/** Takes back the last move or deal, with any card it turned and run it cleared. The undo penalty stays. */
export function spUndo(state: SpiderState): SpiderState | null {
  if (!spCanUndo(state)) return null
  const last = state.history[state.history.length - 1]
  return {
    ...state,
    ...copyPiles(last),
    points: last.points,
    moves: last.moves,
    won: last.won,
    revealed: last.revealed,
    completed: last.completed,
    homed: last.homed,
    coinCards: last.coinCards,
    history: state.history.slice(0, -1),
    undos: state.undos + 1,
    penalty: state.penalty + KLONDIKE_SCORING.undo,
  }
}

/** Every legal move, leaving out a whole column into an empty one (which changes nothing). */
function legalMoves(state: SpiderState) {
  const moves: { from: PileId; index: number; to: PileId }[] = []
  SP_TABLEAU.forEach((from) => {
    const cards = spPileCards(state, from)
    for (let index = 0; index < cards.length; index += 1) {
      if (!spCanPickUp(state, from, index)) continue
      for (const to of SP_TABLEAU) {
        if (index === 0 && spPileCards(state, to).length === 0) continue
        if (spCanMove(state, from, index, to)) moves.push({ from, index, to })
      }
    }
  })
  return moves
}

/**
 * Where a tap sends the run from this card: onto a card of the same suit one higher, else any card
 * one higher, else an empty column (unless it's the whole column already).
 */
export function spTapMove(state: SpiderState, pile: PileId, index: number): PileId | null {
  if (!spCanPickUp(state, pile, index)) return null
  const lead = spPileCards(state, pile)[index]
  const targets = SP_TABLEAU.filter((to) => spPileCards(state, to).length > 0 && spCanMove(state, pile, index, to))
  const sameSuit = targets.find((to) => top(spPileCards(state, to)).suit === lead.suit)
  if (sameSuit ?? targets[0]) return sameSuit ?? targets[0]
  if (index === 0) return null
  return SP_TABLEAU.find((to) => spPileCards(state, to).length === 0) ?? null
}

/**
 * A helpful move, in this order: turning a card over, finishing a run, emptying a column, joining a
 * run of the same suit, then tidying a mixed stack. Never a move off a card the run already belongs
 * on. With nothing useful, a deal.
 */
export function spFindHint(state: SpiderState): TableHint {
  if (state.won) return { kind: 'none' }
  let best: { move: { from: PileId; index: number; to: PileId }; score: number } | null = null
  for (const move of legalMoves(state)) {
    const cards = spPileCards(state, move.from)
    const lead = cards[move.index]
    const below = move.index > 0 ? cards[move.index - 1] : undefined
    const onto = top(spPileCards(state, move.to))
    const fitsNow = below !== undefined && below.faceUp && below.rank === lead.rank + 1
    const sameNow = fitsNow && below.suit === lead.suit
    const sameThen = onto !== undefined && onto.suit === lead.suit
    let score = 0
    if (!onto) {
      // Into an empty column: only worth it to turn a card over.
      if (below && !below.faceUp) score = 40
    } else if (!sameNow && !(fitsNow && !sameThen)) {
      score = 10
      if (below && !below.faceUp) score += 50
      if (move.index === 0) score += 30
      if (sameThen) score += 20
      const after = spMove({ ...state, history: [] }, move.from, move.index, move.to)
      if (after && after.completed > state.completed) score += 45
    }
    if (score > 0 && (!best || score > best.score)) best = { move, score }
  }
  if (best) return { kind: 'move', ...best.move }
  if (spCanDeal(state)) return { kind: 'draw' }
  // A deal is waiting on an empty column: fill it from the tallest column's movable end.
  if (spDealBlocked(state)) {
    const empty = SP_TABLEAU.find((pile) => spPileCards(state, pile).length === 0)
    const donors = SP_TABLEAU.filter((pile) => spPileCards(state, pile).length > 1).sort(
      (a, b) => spPileCards(state, b).length - spPileCards(state, a).length,
    )
    for (const from of donors) {
      const cards = spPileCards(state, from)
      let index = cards.length - 1
      while (index > 0 && spCanPickUp(state, from, index - 1)) index -= 1
      if (empty && spCanMove(state, from, index, empty)) return { kind: 'move', from, index, to: empty }
    }
  }
  return { kind: 'none' }
}

export function spTakeHint(state: SpiderState): { state: SpiderState; hint: TableHint } {
  const hint = spFindHint(state)
  if (hint.kind === 'none') return { state, hint }
  return { state: { ...state, hints: state.hints + 1, penalty: state.penalty + KLONDIKE_SCORING.hint }, hint }
}

/** True while a deal or any legal move is left. Running out of stock alone never ends the game. */
export function spHasUsefulMove(state: SpiderState): boolean {
  if (state.won) return false
  return spCanDeal(state) || legalMoves(state).length > 0
}

export function spLiveScore(state: SpiderState) {
  return Math.max(0, state.points + state.penalty)
}

/** Same rewards as the other modes, with the speed bonus dropping more slowly for this longer game. */
export function spRewardsFor(state: SpiderState, seconds: number): KlondikeRewards {
  const timeBonus = Math.max(
    0,
    Math.round(KLONDIKE_SCORING.timeBonusMax - Math.max(0, seconds) * SPIDER_SCORING.timeBonusPerSecond),
  )
  const final = spLiveScore(state) + (state.won ? KLONDIKE_SCORING.winBonus + timeBonus : 0)
  return {
    score: Math.min(SOLITAIRE_REWARDS.maxScore, final),
    xp: state.revealed + state.homed.length * SOLITAIRE_REWARDS.xpPerHome + (state.won ? SOLITAIRE_REWARDS.winXp : 0),
    coins:
      state.coinCards.length * SPIDER_SCORING.runCoins +
      (state.won ? (state.difficulty === 'hard' ? SOLITAIRE_REWARDS.hardWinCoins : SOLITAIRE_REWARDS.winCoins) : 0),
    won: state.won,
  }
}
