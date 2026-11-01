/**
 * Klondike solitaire, draw 1. Pure rules: every function takes a state and returns a new one,
 * or null when the move is not allowed. The board and screen only call these.
 */
import { isRed, makeDeck, seededRandom, shuffle, type Card } from '../cards/deck'
import { KLONDIKE_SCORING, SOLITAIRE_REWARDS } from './scoring'

export type FoundationId = 'f0' | 'f1' | 'f2' | 'f3'
export type TableauId = 't0' | 't1' | 't2' | 't3' | 't4' | 't5' | 't6'
export type PileId = 'stock' | 'waste' | FoundationId | TableauId

export const FOUNDATIONS: readonly FoundationId[] = ['f0', 'f1', 'f2', 'f3']
export const TABLEAU: readonly TableauId[] = ['t0', 't1', 't2', 't3', 't4', 't5', 't6']

type Piles = {
  stock: Card[]
  waste: Card[]
  foundations: Card[][]
  tableau: Card[][]
}

type Snapshot = Piles & {
  points: number
  moves: number
  recycles: number
  won: boolean
  stacked: string[]
  homed: string[]
  coinCards: string[]
}

/** Cards turned over per tap of the stock: 1 for Easy, 3 for Hard. */
export type DrawCount = 1 | 3

export type KlondikeState = Piles & {
  seed: number
  drawCount: DrawCount
  /** Points from moves. Undo takes these back. */
  points: number
  /** Hint and undo penalties. Undo never takes these back. */
  penalty: number
  moves: number
  recycles: number
  hints: number
  undos: number
  won: boolean
  /** Cards that have earned their stacking points; each card earns them once. */
  stacked: string[]
  /** Cards that have reached a foundation at least once, for XP. */
  homed: string[]
  /**
   * Cards that have earned a Cub Cash coin: a Queen put on a King, a Jack put on a Queen, or an Ace
   * put on a foundation. Each card earns its coin once.
   */
  coinCards: string[]
  history: Snapshot[]
}

export type Hint =
  | { kind: 'move'; from: PileId; index: number; to: PileId }
  | { kind: 'draw' }
  | { kind: 'recycle' }
  | { kind: 'none' }

const HISTORY_LIMIT = 1000

function isFoundation(pile: PileId): pile is FoundationId {
  return pile[0] === 'f'
}

function isTableau(pile: PileId): pile is TableauId {
  return pile[0] === 't'
}

function pileIndex(pile: FoundationId | TableauId) {
  return Number(pile.slice(1))
}

function copyPiles(state: Piles): Piles {
  return {
    stock: state.stock.map((card) => ({ ...card })),
    waste: state.waste.map((card) => ({ ...card })),
    foundations: state.foundations.map((pile) => pile.map((card) => ({ ...card }))),
    tableau: state.tableau.map((pile) => pile.map((card) => ({ ...card }))),
  }
}

function snapshot(state: KlondikeState): Snapshot {
  return {
    ...copyPiles(state),
    points: state.points,
    moves: state.moves,
    recycles: state.recycles,
    won: state.won,
    stacked: state.stacked,
    homed: state.homed,
    coinCards: state.coinCards,
  }
}

function withHistory(state: KlondikeState): KlondikeState {
  const history = [...state.history, snapshot(state)]
  if (history.length > HISTORY_LIMIT) history.shift()
  return { ...state, ...copyPiles(state), history }
}

/** A fresh deal. The same seed always gives the same deal. */
export function deal(seed: number, drawCount: DrawCount = 1): KlondikeState {
  const deck = shuffle(makeDeck(), seededRandom(seed))
  const tableau: Card[][] = []
  let next = 0
  for (let column = 0; column < 7; column += 1) {
    const pile: Card[] = []
    for (let row = 0; row <= column; row += 1) {
      pile.push({ ...deck[next], faceUp: row === column })
      next += 1
    }
    tableau.push(pile)
  }
  return {
    seed,
    drawCount,
    stock: deck.slice(next).map((card) => ({ ...card, faceUp: false })),
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    points: 0,
    penalty: 0,
    moves: 0,
    recycles: 0,
    hints: 0,
    undos: 0,
    won: false,
    stacked: [],
    homed: [],
    coinCards: [],
    history: [],
  }
}

export function pileCards(state: Piles, pile: PileId): Card[] {
  if (pile === 'stock') return state.stock
  if (pile === 'waste') return state.waste
  if (isFoundation(pile)) return state.foundations[pileIndex(pile)]
  return state.tableau[pileIndex(pile)]
}

function top(cards: Card[]): Card | undefined {
  return cards[cards.length - 1]
}

/** Can the cards from this index to the end of the pile be picked up together? */
export function canPickUp(state: Piles, pile: PileId, index: number): boolean {
  const cards = pileCards(state, pile)
  if (index < 0 || index >= cards.length) return false
  if (pile === 'stock') return false
  if (pile === 'waste' || isFoundation(pile)) return index === cards.length - 1
  for (let i = index; i < cards.length; i += 1) {
    const card = cards[i]
    if (!card.faceUp) return false
    if (i > index) {
      const above = cards[i - 1]
      if (card.rank !== above.rank - 1 || isRed(card.suit) === isRed(above.suit)) return false
    }
  }
  return true
}

/** Can this run of cards be put down on a pile? */
export function canPlace(state: Piles, cards: Card[], to: PileId): boolean {
  if (cards.length === 0 || to === 'stock' || to === 'waste') return false
  const lead = cards[0]
  const target = pileCards(state, to)
  const onTop = top(target)
  if (isFoundation(to)) {
    if (cards.length !== 1) return false
    if (!onTop) return lead.rank === 1
    return onTop.suit === lead.suit && lead.rank === onTop.rank + 1
  }
  if (!onTop) return lead.rank === 13
  return onTop.faceUp && lead.rank === onTop.rank - 1 && isRed(lead.suit) !== isRed(onTop.suit)
}

export function canMove(state: KlondikeState, from: PileId, index: number, to: PileId): boolean {
  if (state.won || from === to) return false
  if (!canPickUp(state, from, index)) return false
  return canPlace(state, pileCards(state, from).slice(index), to)
}

function moveScore(from: PileId, to: PileId) {
  if (isFoundation(to)) return isFoundation(from) ? 0 : KLONDIKE_SCORING.toFoundation
  if (isFoundation(from)) return KLONDIKE_SCORING.foundationToTableau
  return 0
}

function isWon(state: Piles) {
  return state.foundations.every((pile) => pile.length === 13)
}

/** Moves the cards from this index onward. Turns over a newly uncovered tableau card. */
export function move(state: KlondikeState, from: PileId, index: number, to: PileId): KlondikeState | null {
  if (!canMove(state, from, index, to)) return null
  const next = withHistory(state)
  const source = pileCards(next, from)
  const moving = source.splice(index)
  const below = top(pileCards(next, to))
  pileCards(next, to).push(...moving)
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
  const won = isWon(next)
  return { ...next, points, stacked, homed, coinCards, moves: next.moves + 1, won }
}

/**
 * Turns stock cards onto the waste (one in Easy, up to three in Hard, where only the last is playable),
 * or the whole waste back into the stock when the stock is empty.
 */
export function draw(state: KlondikeState, options: { free?: boolean } = {}): KlondikeState | null {
  if (state.won) return null
  if (state.stock.length === 0 && state.waste.length === 0) return null
  const next = withHistory(state)
  if (next.stock.length > 0) {
    for (let k = 0; k < state.drawCount && next.stock.length > 0; k += 1) {
      const card = next.stock.pop() as Card
      next.waste.push({ ...card, faceUp: true })
    }
    return { ...next, moves: next.moves + 1 }
  }
  const stock = next.waste.reverse().map((card) => ({ ...card, faceUp: false }))
  return {
    ...next,
    stock,
    waste: [],
    points: next.points + (options.free ? 0 : KLONDIKE_SCORING.recycleStock),
    recycles: next.recycles + 1,
    moves: next.moves + 1,
  }
}

export function canUndo(state: KlondikeState) {
  return state.history.length > 0 && !state.won
}

/** Takes back the last move. Its points go with it; the undo penalty stays. */
export function undo(state: KlondikeState): KlondikeState | null {
  if (!canUndo(state)) return null
  const history = state.history.slice(0, -1)
  const last = state.history[state.history.length - 1]
  return {
    ...state,
    ...copyPiles(last),
    points: last.points,
    moves: last.moves,
    recycles: last.recycles,
    won: last.won,
    stacked: last.stacked,
    homed: last.homed,
    coinCards: last.coinCards,
    history,
    undos: state.undos + 1,
    penalty: state.penalty + KLONDIKE_SCORING.undo,
  }
}

/** The first foundation this card can go on, for double-tap. */
export function foundationFor(state: KlondikeState, from: PileId, index: number): FoundationId | null {
  if (!canPickUp(state, from, index) || isFoundation(from)) return null
  if (index !== pileCards(state, from).length - 1) return null
  return FOUNDATIONS.find((pile) => canMove(state, from, index, pile)) ?? null
}

/** Somewhere useful this run can go: a foundation first, then a tableau column. */
export function bestTarget(state: KlondikeState, from: PileId, index: number): PileId | null {
  const foundation = foundationFor(state, from, index)
  if (foundation) return foundation
  const cards = pileCards(state, from)
  const lead = cards[index]
  for (const pile of TABLEAU) {
    if (!canMove(state, from, index, pile)) continue
    // A King already at the bottom of a column gains nothing by moving to another empty column.
    if (lead?.rank === 13 && isTableau(from) && index === 0 && pileCards(state, pile).length === 0) continue
    return pile
  }
  return null
}

/** A suggested next move, without changing the game. */
export function findHint(state: KlondikeState): Hint {
  if (state.won) return { kind: 'none' }
  const tops: PileId[] = ['waste', ...TABLEAU]
  for (const from of tops) {
    const cards = pileCards(state, from)
    if (cards.length === 0) continue
    const to = foundationFor(state, from, cards.length - 1)
    if (to) return { kind: 'move', from, index: cards.length - 1, to }
  }
  for (const from of TABLEAU) {
    const cards = pileCards(state, from)
    const firstUp = cards.findIndex((card) => card.faceUp)
    if (firstUp <= 0) continue
    for (const to of TABLEAU) {
      if (canMove(state, from, firstUp, to)) return { kind: 'move', from, index: firstUp, to }
    }
  }
  if (state.waste.length > 0) {
    const index = state.waste.length - 1
    for (const to of TABLEAU) {
      if (canMove(state, 'waste', index, to)) return { kind: 'move', from: 'waste', index, to }
    }
  }
  if (state.stock.length > 0) return { kind: 'draw' }
  if (state.waste.length > 0) return { kind: 'recycle' }
  return { kind: 'none' }
}

/**
 * The stock and waste cards that come up on top of the waste while going round the deck without
 * playing any. Drawing one at a time reaches every card; drawing three reaches only some of them.
 */
function reachableDeckCards(state: KlondikeState): Card[] {
  if (state.drawCount === 1) return [...state.stock, ...state.waste]
  let stock = [...state.stock]
  let waste = [...state.waste]
  const seen = new Map<string, Card>()
  const noteTop = () => {
    const card = top(waste)
    if (card) seen.set(card.id, card)
  }
  noteTop()
  let recycles = 0
  for (let step = 0; step < 200 && recycles < 2; step += 1) {
    if (stock.length === 0) {
      if (waste.length === 0) break
      stock = waste.reverse()
      waste = []
      recycles += 1
      continue
    }
    for (let k = 0; k < state.drawCount && stock.length > 0; k += 1) waste.push(stock.pop() as Card)
    noteTop()
  }
  return [...seen.values()]
}

/** How many setup moves (column shuffles, cards taken back off a foundation) to try before progress. */
const LOOKAHEAD = 2

/**
 * True while something useful can still be done. Progress means a card going home, a face-down card
 * turned over, a stock or waste card played (passes through the stock are unlimited, so every card
 * that comes up on top counts), or a column emptied for a King that is waiting. Up to LOOKAHEAD setup
 * moves are tried first, including taking a card back off a foundation to make room.
 */
export function hasUsefulMove(state: KlondikeState): boolean {
  if (state.won) return false
  if (state.drawCount === 1 && canAutoComplete(state)) return true
  const deckCards = reachableDeckCards(state)
  const kingInDeck = deckCards.some((card) => card.rank === 13)
  const seen = new Set<string>()
  const boardKey = (board: Piles) =>
    `${board.tableau.map((pile) => pile.map((card) => card.id).join('.')).join('|')}#${board.foundations.map((pile) => pile.length).join(',')}`

  const search = (board: Piles, depth: number, takenBack: ReadonlySet<string>): boolean => {
    const key = boardKey(board)
    if (seen.has(key)) return false
    seen.add(key)
    const fits = (card: Card, piles: readonly PileId[]) => piles.some((pile) => canPlace(board, [card], pile))
    if (deckCards.some((card) => fits(card, FOUNDATIONS) || fits(card, TABLEAU))) return true
    const kingWaiting =
      kingInDeck || board.tableau.some((pile) => pile.some((card, i) => card.faceUp && card.rank === 13 && i > 0))

    const setups: Piles[] = []
    for (let f = 0; f < TABLEAU.length; f += 1) {
      const from = TABLEAU[f]
      const cards = board.tableau[f]
      const last = top(cards)
      // A card taken back off a foundation going straight home again is not progress.
      if (last?.faceUp && !takenBack.has(last.id) && fits(last, FOUNDATIONS)) return true
      const firstUp = cards.findIndex((card) => card.faceUp)
      if (firstUp < 0) continue
      for (let i = firstUp; i < cards.length; i += 1) {
        if (!canPickUp(board, from, i)) continue
        for (let t = 0; t < TABLEAU.length; t += 1) {
          if (t === f || !canPlace(board, cards.slice(i), TABLEAU[t])) continue
          if (i === firstUp && i > 0) return true
          const toEmpty = board.tableau[t].length === 0
          if (i === 0 && toEmpty) continue
          if (i === 0 && kingWaiting) return true
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
      for (const to of TABLEAU) {
        if (!canPlace(board, [card], to)) continue
        const foundations = board.foundations.slice()
        foundations[h] = board.foundations[h].slice(0, -1)
        const t = TABLEAU.indexOf(to)
        const tableau = board.tableau.slice()
        tableau[t] = [...board.tableau[t], card]
        if (search({ ...board, foundations, tableau }, depth - 1, new Set([...takenBack, card.id]))) return true
      }
    }
    return false
  }

  const start: Piles = {
    stock: [],
    waste: [],
    foundations: state.foundations.map((pile) => pile.slice()),
    tableau: state.tableau.map((pile) => pile.slice()),
  }
  return search(start, LOOKAHEAD, new Set())
}

/** Counts a hint and its penalty. */
export function takeHint(state: KlondikeState): { state: KlondikeState; hint: Hint } {
  const hint = findHint(state)
  if (hint.kind === 'none') return { state, hint }
  return { state: { ...state, hints: state.hints + 1, penalty: state.penalty + KLONDIKE_SCORING.hint }, hint }
}

/**
 * Once every tableau card is face up the game can always be finished: the lowest card left is never
 * under another card, so it can always go home.
 */
export function canAutoComplete(state: KlondikeState) {
  if (state.won) return false
  return state.tableau.every((pile) => pile.every((card) => card.faceUp))
}

/** One step of auto-complete: a card home if one can go, otherwise a free draw or recycle. */
export function autoStep(state: KlondikeState): KlondikeState | null {
  if (!canAutoComplete(state)) return null
  let bestFrom: PileId | null = null
  let bestRank = 99
  for (const from of ['waste', ...TABLEAU] as PileId[]) {
    const cards = pileCards(state, from)
    const card = top(cards)
    if (!card || !foundationFor(state, from, cards.length - 1)) continue
    if (card.rank < bestRank) {
      bestRank = card.rank
      bestFrom = from
    }
  }
  if (bestFrom) {
    const cards = pileCards(state, bestFrom)
    const to = foundationFor(state, bestFrom, cards.length - 1) as FoundationId
    return move(state, bestFrom, cards.length - 1, to)
  }
  return draw(state, { free: true })
}

/** Score shown during play: move points less penalties, never below 0. */
export function liveScore(state: KlondikeState) {
  return Math.max(0, state.points + state.penalty)
}

export function timeBonus(seconds: number) {
  return Math.max(0, Math.round(KLONDIKE_SCORING.timeBonusMax - Math.max(0, seconds) * KLONDIKE_SCORING.timeBonusPerSecond))
}

/** Final score. Only a completed game earns the win and time bonuses. */
export function finalScore(state: KlondikeState, seconds: number) {
  const base = liveScore(state)
  if (!state.won) return base
  return base + KLONDIKE_SCORING.winBonus + timeBonus(seconds)
}

export function cardsOnFoundations(state: Piles) {
  return state.foundations.reduce((sum, pile) => sum + pile.length, 0)
}

export type KlondikeRewards = { score: number; xp: number; coins: number; won: boolean }

export function winCoinsFor(drawCount: DrawCount) {
  return drawCount === 3 ? SOLITAIRE_REWARDS.hardWinCoins : SOLITAIRE_REWARDS.winCoins
}

/** Cub Cash earned during play: face cards stacked on each other and Aces put home. */
export function bonusCoins(state: Pick<KlondikeState, 'coinCards'>) {
  return state.coinCards.reduce(
    (sum, id) => sum + (id[0] === 'A' ? SOLITAIRE_REWARDS.aceCoins : SOLITAIRE_REWARDS.faceStackCoins),
    0,
  )
}

/** What a finished or abandoned game pays. Coins earned in play always count; a win adds its own. */
export function rewardsFor(state: KlondikeState, seconds: number): KlondikeRewards {
  const score = Math.min(SOLITAIRE_REWARDS.maxScore, finalScore(state, seconds))
  return {
    score,
    xp:
      state.stacked.length * SOLITAIRE_REWARDS.xpPerStack +
      state.homed.length * SOLITAIRE_REWARDS.xpPerHome +
      (state.won ? SOLITAIRE_REWARDS.winXp : 0),
    coins: bonusCoins(state) + (state.won ? winCoinsFor(state.drawCount) : 0),
    won: state.won,
  }
}

/** Lets a game's rewards be paid once, however many times the end of the game is reported. */
export function createPayOnce() {
  let paid = false
  return {
    pay(action: () => void) {
      if (paid) return false
      paid = true
      action()
      return true
    },
    get paid() {
      return paid
    },
  }
}
