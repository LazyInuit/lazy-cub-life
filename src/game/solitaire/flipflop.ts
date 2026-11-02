/**
 * Flipflop solitaire. Pure rules: every function takes a state and returns a new one, or null when the
 * move is not allowed. Columns build up or down by one in any suit, changing direction freely; only
 * same-suit runs in one direction move together. The stock deals one card onto every column, and the
 * last two cards become reserves.
 */
import { makeSuitDeck, seededRandom, shuffle, type Card, type Suit } from '../cards/deck'
import { bonusCoins, timeBonus, winCoinsFor, type KlondikeRewards } from './klondike'
import { KLONDIKE_SCORING, SOLITAIRE_REWARDS } from './scoring'
import type { PileId, TableHint } from './table'

export type FlipflopDifficulty = 'easy' | 'hard'

/** Every number here can be adjusted after testing. */
export const FLIPFLOP_SETTINGS = {
  /** Cards dealt to each column at the start. */
  dealPerColumn: 5,
  /** Cards left after the last full deal go here, one each. */
  reserves: 2,
  /** Dealing from the stock is allowed even with an empty column. */
  dealIntoEmpty: true,
  difficulty: {
    easy: { suits: ['spades'] as readonly Suit[], faceDown: 4 },
    hard: { suits: ['spades', 'hearts'] as readonly Suit[], faceDown: 4 },
  },
} as const

export const FF_FOUNDATIONS = ['f0', 'f1', 'f2', 'f3'] as const
export const FF_TABLEAU = ['t0', 't1', 't2', 't3', 't4'] as const
export const FF_RESERVES = ['r0', 'r1'] as const

type Piles = { stock: Card[]; reserves: Card[][]; foundations: Card[][]; tableau: Card[][] }

type Snapshot = Piles & {
  points: number
  moves: number
  won: boolean
  stacked: string[]
  homed: string[]
  coinCards: string[]
}

export type FlipflopState = Piles & {
  seed: number
  difficulty: FlipflopDifficulty
  /** Points from moves. Undo takes these back. */
  points: number
  /** Hint and undo penalties. Undo never takes these back. */
  penalty: number
  moves: number
  hints: number
  undos: number
  won: boolean
  /** Cards that have earned their stacking points; each card earns them once. */
  stacked: string[]
  /** Cards that have reached a foundation at least once, for XP. */
  homed: string[]
  /** Cards that have earned a Cub Cash coin: a face card put on a face card, or an Ace put home. */
  coinCards: string[]
  history: Snapshot[]
}

const HISTORY_LIMIT = 1000

const isFoundation = (pile: PileId) => pile[0] === 'f'
const isTableau = (pile: PileId) => pile[0] === 't'
const isReserve = (pile: PileId) => pile[0] === 'r'
const pileIndex = (pile: PileId) => Number(pile.slice(1))
const top = (cards: Card[]) => cards[cards.length - 1]

function copyPiles(state: Piles): Piles {
  const copy = (pile: Card[]) => pile.map((card) => ({ ...card }))
  return {
    stock: copy(state.stock),
    reserves: state.reserves.map(copy),
    foundations: state.foundations.map(copy),
    tableau: state.tableau.map(copy),
  }
}

function snapshot(state: FlipflopState): Snapshot {
  return {
    ...copyPiles(state),
    points: state.points,
    moves: state.moves,
    won: state.won,
    stacked: state.stacked,
    homed: state.homed,
    coinCards: state.coinCards,
  }
}

function withHistory(state: FlipflopState): FlipflopState {
  const history = [...state.history, snapshot(state)]
  if (history.length > HISTORY_LIMIT) history.shift()
  return { ...state, ...copyPiles(state), history }
}

/** A fresh deal. The same seed and difficulty always give the same deal. */
export function dealFlipflop(seed: number, difficulty: FlipflopDifficulty): FlipflopState {
  const settings = FLIPFLOP_SETTINGS.difficulty[difficulty]
  const deck = shuffle(makeSuitDeck(settings.suits), seededRandom(seed))
  const tableau: Card[][] = FF_TABLEAU.map(() => [])
  let next = 0
  for (let row = 0; row < FLIPFLOP_SETTINGS.dealPerColumn; row += 1) {
    for (const pile of tableau) {
      pile.push({ ...deck[next], faceUp: row >= settings.faceDown })
      next += 1
    }
  }
  return {
    seed,
    difficulty,
    stock: deck.slice(next).map((card) => ({ ...card, faceUp: false })),
    reserves: FF_RESERVES.map(() => []),
    foundations: FF_FOUNDATIONS.map(() => []),
    tableau,
    points: 0,
    penalty: 0,
    moves: 0,
    hints: 0,
    undos: 0,
    won: false,
    stacked: [],
    homed: [],
    coinCards: [],
    history: [],
  }
}

export function ffPileCards(state: Piles, pile: PileId): Card[] {
  if (pile === 'stock') return state.stock
  if (isReserve(pile)) return state.reserves[pileIndex(pile)] ?? []
  if (isFoundation(pile)) return state.foundations[pileIndex(pile)] ?? []
  if (isTableau(pile)) return state.tableau[pileIndex(pile)] ?? []
  return []
}

/** A same-suit run going one way by one each step, like 7♠ 6♠ 5♠ or 5♠ 6♠ 7♠. */
function isSuitRun(cards: Card[]) {
  if (cards.length < 2) return true
  const step = cards[1].rank - cards[0].rank
  if (step !== 1 && step !== -1) return false
  for (let i = 1; i < cards.length; i += 1) {
    if (cards[i].suit !== cards[0].suit || cards[i].rank - cards[i - 1].rank !== step) return false
  }
  return true
}

/** Can the cards from this index to the end of the pile be picked up together? */
export function ffCanPickUp(state: Piles, pile: PileId, index: number): boolean {
  const cards = ffPileCards(state, pile)
  if (pile === 'stock' || index < 0 || index >= cards.length) return false
  if (!isTableau(pile)) return index === cards.length - 1
  const run = cards.slice(index)
  return run.every((card) => card.faceUp) && isSuitRun(run)
}

/** Can this run be put down on a pile? Columns take one higher or lower in any suit; empty columns take anything. */
export function ffCanPlace(state: Piles, cards: Card[], to: PileId): boolean {
  if (cards.length === 0) return false
  const lead = cards[0]
  const onTop = top(ffPileCards(state, to))
  if (isFoundation(to)) {
    if (cards.length !== 1) return false
    if (!onTop) return lead.rank === 1
    return onTop.suit === lead.suit && lead.rank === onTop.rank + 1
  }
  if (!isTableau(to)) return false
  if (!onTop) return true
  return onTop.faceUp && Math.abs(lead.rank - onTop.rank) === 1
}

export function ffCanMove(state: FlipflopState, from: PileId, index: number, to: PileId): boolean {
  if (state.won || from === to) return false
  if (!ffCanPickUp(state, from, index)) return false
  return ffCanPlace(state, ffPileCards(state, from).slice(index), to)
}

function moveScore(from: PileId, to: PileId) {
  if (isFoundation(to)) return isFoundation(from) ? 0 : KLONDIKE_SCORING.toFoundation
  if (isFoundation(from)) return KLONDIKE_SCORING.foundationToTableau
  return 0
}

const isWon = (state: Piles) => state.foundations.every((pile) => pile.length === 13)

/** Moves the cards from this index onward. Turns over a newly uncovered column card. */
export function ffMove(state: FlipflopState, from: PileId, index: number, to: PileId): FlipflopState | null {
  if (!ffCanMove(state, from, index, to)) return null
  const next = withHistory(state)
  const source = ffPileCards(next, from)
  const moving = source.splice(index)
  const below = top(ffPileCards(next, to))
  ffPileCards(next, to).push(...moving)
  let points = next.points + moveScore(from, to)
  const lead = moving[0]
  let { stacked, homed, coinCards } = next
  if (isTableau(to) && !isFoundation(from) && !stacked.includes(lead.id)) {
    points += KLONDIKE_SCORING.stackCard
    stacked = [...stacked, lead.id]
  }
  if (isFoundation(to) && !homed.includes(lead.id)) homed = [...homed, lead.id]
  const faceOnFace = isTableau(to) && below !== undefined && below.rank >= 11 && lead.rank >= 11
  const aceHome = isFoundation(to) && lead.rank === 1
  if ((faceOnFace || aceHome) && !coinCards.includes(lead.id)) coinCards = [...coinCards, lead.id]
  const uncovered = top(source)
  if (isTableau(from) && uncovered && !uncovered.faceUp) {
    uncovered.faceUp = true
    points += KLONDIKE_SCORING.revealCard
  }
  return { ...next, points, stacked, homed, coinCards, moves: next.moves + 1, won: isWon(next) }
}

export function ffCanDeal(state: FlipflopState) {
  if (state.won || state.stock.length === 0) return false
  return FLIPFLOP_SETTINGS.dealIntoEmpty || state.tableau.every((pile) => pile.length > 0)
}

/** Deals one stock card face up onto every column. The cards left after the last full deal become reserves. */
export function ffDeal(state: FlipflopState): FlipflopState | null {
  if (!ffCanDeal(state)) return null
  const next = withHistory(state)
  for (const pile of next.tableau) {
    const card = next.stock.pop()
    if (card) pile.push({ ...card, faceUp: true })
  }
  if (next.stock.length > 0 && next.stock.length <= next.reserves.length) {
    next.reserves.forEach((pile) => {
      const card = next.stock.pop()
      if (card) pile.push({ ...card, faceUp: true })
    })
  }
  return { ...next, moves: next.moves + 1 }
}

export function ffCanUndo(state: FlipflopState) {
  return state.history.length > 0 && !state.won
}

/** Takes back the last move. Its points go with it; the undo penalty stays. */
export function ffUndo(state: FlipflopState): FlipflopState | null {
  if (!ffCanUndo(state)) return null
  const last = state.history[state.history.length - 1]
  return {
    ...state,
    ...copyPiles(last),
    points: last.points,
    moves: last.moves,
    won: last.won,
    stacked: last.stacked,
    homed: last.homed,
    coinCards: last.coinCards,
    history: state.history.slice(0, -1),
    undos: state.undos + 1,
    penalty: state.penalty + KLONDIKE_SCORING.undo,
  }
}

/** The first foundation this card can go on, for double-tap. */
export function ffFoundationFor(state: FlipflopState, from: PileId, index: number): PileId | null {
  if (isFoundation(from) || index !== ffPileCards(state, from).length - 1) return null
  return FF_FOUNDATIONS.find((pile) => ffCanMove(state, from, index, pile)) ?? null
}

const firstFaceUp = (cards: Card[]) => cards.findIndex((card) => card.faceUp)

/** A helpful next step: a card home, a card turned over, a reserve played, or a deal. */
export function ffFindHint(state: FlipflopState): TableHint {
  if (state.won) return { kind: 'none' }
  const sources: PileId[] = [...FF_RESERVES, ...FF_TABLEAU]
  for (const from of sources) {
    const cards = ffPileCards(state, from)
    if (cards.length === 0) continue
    const to = ffFoundationFor(state, from, cards.length - 1)
    if (to) return { kind: 'move', from, index: cards.length - 1, to }
  }
  // Turn a card over: move the whole face-up part of a column off its face-down cards.
  for (const from of FF_TABLEAU) {
    const cards = ffPileCards(state, from)
    const firstUp = firstFaceUp(cards)
    if (firstUp <= 0) continue
    const onCard = FF_TABLEAU.find((to) => ffPileCards(state, to).length > 0 && ffCanMove(state, from, firstUp, to))
    const anywhere = onCard ?? FF_TABLEAU.find((to) => ffCanMove(state, from, firstUp, to))
    if (anywhere) return { kind: 'move', from, index: firstUp, to: anywhere }
  }
  for (const from of FF_RESERVES) {
    const cards = ffPileCards(state, from)
    if (cards.length === 0) continue
    const to = FF_TABLEAU.find((pile) => ffCanMove(state, from, 0, pile))
    if (to) return { kind: 'move', from, index: 0, to }
  }
  // Uncover a card that can then go home.
  for (const from of FF_TABLEAU) {
    const cards = ffPileCards(state, from)
    for (let i = Math.max(1, firstFaceUp(cards) + 1); i < cards.length; i += 1) {
      const uncovered = cards[i - 1]
      if (!uncovered.faceUp || !FF_FOUNDATIONS.some((pile) => ffCanPlace(state, [uncovered], pile))) continue
      const to = FF_TABLEAU.find((pile) => ffCanMove(state, from, i, pile))
      if (to) return { kind: 'move', from, index: i, to }
    }
  }
  if (ffCanDeal(state)) return { kind: 'draw' }
  return { kind: 'none' }
}

/** Counts a hint and its penalty. */
export function ffTakeHint(state: FlipflopState): { state: FlipflopState; hint: TableHint } {
  const hint = ffFindHint(state)
  if (hint.kind === 'none') return { state, hint }
  return { state: { ...state, hints: state.hints + 1, penalty: state.penalty + KLONDIKE_SCORING.hint }, hint }
}

/** How many setup moves (column shuffles, cards taken back off a foundation) to try before progress. */
const LOOKAHEAD = 2

/**
 * True while something useful can still be done: a deal, a card home, a reserve card played, or a
 * face-down card turned over, after up to LOOKAHEAD setup moves.
 */
export function ffHasUsefulMove(state: FlipflopState): boolean {
  if (state.won) return false
  if (ffCanDeal(state)) return true
  const seen = new Set<string>()
  const boardKey = (board: Piles) =>
    `${board.tableau.map((pile) => pile.map((card) => card.id).join('.')).join('|')}#${board.foundations.map((pile) => pile.length).join(',')}#${board.reserves.map((pile) => pile.length).join(',')}`

  const search = (board: Piles, depth: number, takenBack: ReadonlySet<string>): boolean => {
    const key = boardKey(board)
    if (seen.has(key)) return false
    seen.add(key)
    const fits = (card: Card, piles: readonly PileId[]) => piles.some((pile) => ffCanPlace(board, [card], pile))
    if (board.reserves.some((pile) => pile.length > 0 && (fits(top(pile), FF_FOUNDATIONS) || fits(top(pile), FF_TABLEAU)))) {
      return true
    }
    const setups: Piles[] = []
    for (let f = 0; f < FF_TABLEAU.length; f += 1) {
      const cards = board.tableau[f]
      const last = top(cards)
      if (last?.faceUp && !takenBack.has(last.id) && fits(last, FF_FOUNDATIONS)) return true
      const firstUp = firstFaceUp(cards)
      if (firstUp < 0) continue
      for (let i = firstUp; i < cards.length; i += 1) {
        if (!ffCanPickUp(board, FF_TABLEAU[f], i)) continue
        for (let t = 0; t < FF_TABLEAU.length; t += 1) {
          if (t === f || !ffCanPlace(board, cards.slice(i), FF_TABLEAU[t])) continue
          if (i === firstUp && i > 0) return true
          if (i === 0 && board.tableau[t].length === 0) continue
          const tableau = board.tableau.slice()
          tableau[f] = cards.slice(0, i)
          tableau[t] = [...board.tableau[t], ...cards.slice(i)]
          setups.push({ ...board, tableau })
        }
      }
    }
    if (depth === 0) return false
    for (const next of setups) if (search(next, depth - 1, takenBack)) return true
    for (let h = 0; h < board.foundations.length; h += 1) {
      const card = top(board.foundations[h])
      if (!card) continue
      for (let t = 0; t < FF_TABLEAU.length; t += 1) {
        if (!ffCanPlace(board, [card], FF_TABLEAU[t])) continue
        const foundations = board.foundations.slice()
        foundations[h] = board.foundations[h].slice(0, -1)
        const tableau = board.tableau.slice()
        tableau[t] = [...board.tableau[t], card]
        if (search({ ...board, foundations, tableau }, depth - 1, new Set([...takenBack, card.id]))) return true
      }
    }
    return false
  }

  const start: Piles = {
    stock: [],
    reserves: state.reserves.map((pile) => pile.slice()),
    foundations: state.foundations.map((pile) => pile.slice()),
    tableau: state.tableau.map((pile) => pile.slice()),
  }
  return search(start, LOOKAHEAD, new Set())
}

export function ffLiveScore(state: FlipflopState) {
  return Math.max(0, state.points + state.penalty)
}

/** Same scoring and rewards as Classic: the win and speed bonuses only for a completed game. */
export function ffRewardsFor(state: FlipflopState, seconds: number): KlondikeRewards {
  const final = ffLiveScore(state) + (state.won ? KLONDIKE_SCORING.winBonus + timeBonus(seconds) : 0)
  const score = Math.min(SOLITAIRE_REWARDS.maxScore, final)
  return {
    score,
    xp:
      state.stacked.length * SOLITAIRE_REWARDS.xpPerStack +
      state.homed.length * SOLITAIRE_REWARDS.xpPerHome +
      (state.won ? SOLITAIRE_REWARDS.winXp : 0),
    coins: bonusCoins(state) + (state.won ? winCoinsFor(state.difficulty === 'hard' ? 3 : 1) : 0),
    won: state.won,
  }
}
