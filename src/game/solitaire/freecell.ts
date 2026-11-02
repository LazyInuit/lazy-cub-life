/**
 * FreeCell. Pure rules: every function takes a state and returns a new one, or null when the move is
 * not allowed. All 52 cards start face up in eight columns. Columns build down in alternating
 * colours; four free cells each hold one card; foundations build up by suit from Ace to King.
 */
import { isRed, makeDeck, seededRandom, shuffle, type Card } from '../cards/deck'
import type { KlondikeRewards } from './klondike'
import { bonusCoins, timeBonus, winCoinsFor } from './klondike'
import { FREECELL_DEALS } from './freecellDeals'
import { KLONDIKE_SCORING, SOLITAIRE_REWARDS } from './scoring'
import type { PileId, TableHint } from './table'

export type FreecellDifficulty = 'easy' | 'hard'

/** Every setting here can be adjusted after testing. */
export const FREECELL_SETTINGS = {
  columns: 8,
  cells: 4,
  /**
   * After each move, send cards home that can no longer be needed in the columns: Aces and 2s, and
   * any card whose opposite-colour cards one rank lower are already home.
   */
  autoFoundation: true,
} as const

export const FC_CELLS = ['c0', 'c1', 'c2', 'c3'] as const
export const FC_FOUNDATIONS = ['f0', 'f1', 'f2', 'f3'] as const
export const FC_TABLEAU = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'] as const

type Piles = { cells: (Card | null)[]; foundations: Card[][]; tableau: Card[][] }

type Snapshot = Piles & {
  points: number
  moves: number
  won: boolean
  stacked: string[]
  homed: string[]
  coinCards: string[]
}

export type FreecellState = Piles & {
  seed: number
  difficulty: FreecellDifficulty
  points: number
  penalty: number
  moves: number
  hints: number
  undos: number
  won: boolean
  /** Cards that have earned their stacking points; each card earns them once. */
  stacked: string[]
  /** Cards that have reached a foundation, for XP and points (once per card). */
  homed: string[]
  /** Cards that have earned a Cub Cash coin: a face card put on a face card, or an Ace put home. */
  coinCards: string[]
  history: Snapshot[]
}

const HISTORY_LIMIT = 1000

const isCell = (pile: PileId) => pile[0] === 'c'
const isFoundation = (pile: PileId) => pile[0] === 'f'
const isTableau = (pile: PileId) => pile[0] === 't'
const pileIndex = (pile: PileId) => Number(pile.slice(1))
const top = (cards: Card[]) => cards[cards.length - 1]

function copyPiles(state: Piles): Piles {
  return {
    cells: state.cells.map((card) => (card ? { ...card } : null)),
    foundations: state.foundations.map((pile) => pile.map((card) => ({ ...card }))),
    tableau: state.tableau.map((pile) => pile.map((card) => ({ ...card }))),
  }
}

function withHistory(state: FreecellState): FreecellState {
  const snap: Snapshot = {
    ...copyPiles(state),
    points: state.points,
    moves: state.moves,
    won: state.won,
    stacked: state.stacked,
    homed: state.homed,
    coinCards: state.coinCards,
  }
  const history = [...state.history, snap]
  if (history.length > HISTORY_LIMIT) history.shift()
  return { ...state, ...copyPiles(state), history }
}

/** A shuffled deal: cards go round the eight columns in turn, so four get 7 and four get 6. */
export function freshFreecell(seed: number, difficulty: FreecellDifficulty): FreecellState {
  const deck = shuffle(makeDeck(), seededRandom(seed))
  const tableau: Card[][] = FC_TABLEAU.map(() => [])
  deck.forEach((card, i) => tableau[i % FREECELL_SETTINGS.columns].push({ ...card, faceUp: true }))
  return {
    seed,
    difficulty,
    cells: FC_CELLS.map(() => null),
    foundations: FC_FOUNDATIONS.map(() => []),
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

/**
 * A deal checked to be winnable, picked by seed from the list for this difficulty, so the same seed
 * always gives the same deal.
 */
export function dealFreecell(seed: number, difficulty: FreecellDifficulty): FreecellState {
  const checked = FREECELL_DEALS[difficulty]
  const pick = checked.length > 0 ? checked[Math.abs(Math.floor(seed)) % checked.length] : seed
  const state = freshFreecell(pick, difficulty)
  // Aces (and anything else safe) dealt to the bottom of a column go home straight away, rather
  // than jumping there on the first move.
  return { ...state, ...autoHome(state, state) }
}

export function fcPileCards(state: Piles, pile: PileId): Card[] {
  if (isCell(pile)) {
    const card = state.cells[pileIndex(pile)]
    return card ? [card] : []
  }
  if (isFoundation(pile)) return state.foundations[pileIndex(pile)] ?? []
  if (isTableau(pile)) return state.tableau[pileIndex(pile)] ?? []
  return []
}

/** Does `upper` go on `lower` in a column: one lower and the other colour? */
const fitsOn = (upper: Card, lower: Card) => upper.rank === lower.rank - 1 && isRed(upper.suit) !== isRed(lower.suit)

function isRun(cards: Card[]) {
  for (let i = 1; i < cards.length; i += 1) if (!fitsOn(cards[i], cards[i - 1])) return false
  return true
}

const emptyCells = (state: Piles) => state.cells.filter((card) => card === null).length
const emptyColumns = (state: Piles) => state.tableau.filter((pile) => pile.length === 0).length

/**
 * Most cards that can move together, using the empty free cells and columns as stepping stones:
 * (empty cells + 1) × 2^(empty columns). Moving into an empty column, that column doesn't count.
 */
export function fcMaxRun(state: Piles, toEmptyColumn: boolean) {
  const columns = emptyColumns(state) - (toEmptyColumn ? 1 : 0)
  return (emptyCells(state) + 1) * 2 ** Math.max(0, columns)
}

/** Can these cards be picked up together: a free-cell card, or a run at the bottom of a column? */
export function fcCanPickUp(state: Piles, pile: PileId, index: number): boolean {
  const cards = fcPileCards(state, pile)
  if (index < 0 || index >= cards.length) return false
  if (isCell(pile)) return true
  if (!isTableau(pile)) return false
  const run = cards.slice(index)
  return isRun(run) && run.length <= fcMaxRun(state, false)
}

export function fcCanMove(state: FreecellState, from: PileId, index: number, to: PileId): boolean {
  if (state.won || from === to || !fcCanPickUp(state, from, index)) return false
  const moving = fcPileCards(state, from).slice(index)
  const lead = moving[0]
  if (isCell(to)) return moving.length === 1 && state.cells[pileIndex(to)] === null
  if (isFoundation(to)) {
    if (moving.length !== 1) return false
    const onTop = top(fcPileCards(state, to))
    return onTop ? onTop.suit === lead.suit && lead.rank === onTop.rank + 1 : lead.rank === 1
  }
  if (!isTableau(to)) return false
  const target = fcPileCards(state, to)
  if (target.length === 0) return moving.length <= fcMaxRun(state, true)
  return fitsOn(lead, top(target))
}

/** Cards that can't be needed in the columns any more, so sending them home can't hurt. */
function safeHome(state: Piles, card: Card) {
  if (card.rank <= 2) return true
  const heights = new Map(state.foundations.map((pile) => [top(pile)?.suit, pile.length] as const))
  const otherColour = (['spades', 'hearts', 'diamonds', 'clubs'] as const).filter((suit) => isRed(suit) !== isRed(card.suit))
  return otherColour.every((suit) => (heights.get(suit) ?? 0) >= card.rank - 1)
}

function foundationIndexFor(state: Piles, card: Card) {
  const same = state.foundations.findIndex((pile) => top(pile)?.suit === card.suit)
  if (same >= 0) return top(state.foundations[same]).rank === card.rank - 1 ? same : -1
  return card.rank === 1 ? state.foundations.findIndex((pile) => pile.length === 0) : -1
}

const isWon = (state: Piles) => state.foundations.every((pile) => pile.length === 13)

type Gains = Pick<FreecellState, 'points' | 'stacked' | 'homed' | 'coinCards'>

/** Points and rewards for cards arriving somewhere, each earned once per card. */
function award(gains: Gains, moving: Card[], to: PileId, below: Card | undefined): Gains {
  let { points, stacked, homed, coinCards } = gains
  const lead = moving[0]
  if (isTableau(to) && !stacked.includes(lead.id)) {
    points += KLONDIKE_SCORING.stackCard
    stacked = [...stacked, lead.id]
  }
  if (isFoundation(to) && !homed.includes(lead.id)) {
    points += KLONDIKE_SCORING.toFoundation
    homed = [...homed, lead.id]
  }
  const faceOnFace = isTableau(to) && below !== undefined && below.rank >= 11 && lead.rank >= 11
  const aceHome = isFoundation(to) && lead.rank === 1
  if ((faceOnFace || aceHome) && !coinCards.includes(lead.id)) coinCards = [...coinCards, lead.id]
  return { points, stacked, homed, coinCards }
}

function takeFrom(next: Piles, pile: PileId, index: number): Card[] {
  if (isCell(pile)) {
    const card = next.cells[pileIndex(pile)] as Card
    next.cells[pileIndex(pile)] = null
    return [card]
  }
  return fcPileCards(next, pile).splice(index)
}

function putOn(next: Piles, pile: PileId, cards: Card[]) {
  if (isCell(pile)) next.cells[pileIndex(pile)] = cards[0]
  else fcPileCards(next, pile).push(...cards)
}

/** Sends every safe card home, one after another, as part of the move that freed them. */
function autoHome(next: FreecellState, gains: Gains): Gains {
  if (!FREECELL_SETTINGS.autoFoundation) return gains
  let moved = true
  while (moved) {
    moved = false
    const sources: PileId[] = [...FC_CELLS, ...FC_TABLEAU]
    for (const from of sources) {
      const card = top(fcPileCards(next, from))
      if (!card || !safeHome(next, card)) continue
      const f = foundationIndexFor(next, card)
      if (f < 0) continue
      const cards = takeFrom(next, from, fcPileCards(next, from).length - 1)
      next.foundations[f].push(...cards)
      gains = award(gains, cards, FC_FOUNDATIONS[f], undefined)
      moved = true
    }
  }
  return gains
}

/** Moves a card or a run (as one action), then sends any safe cards home. */
export function fcMove(state: FreecellState, from: PileId, index: number, to: PileId): FreecellState | null {
  if (!fcCanMove(state, from, index, to)) return null
  const next = withHistory(state)
  const below = top(fcPileCards(next, to))
  const moving = takeFrom(next, from, index)
  putOn(next, to, moving)
  let gains = award(next, moving, to, below)
  gains = autoHome(next, gains)
  return { ...next, ...gains, moves: next.moves + 1, won: isWon(next) }
}

export function fcCanUndo(state: FreecellState) {
  return state.history.length > 0 && !state.won
}

/** Takes back the last move, with any cards it sent home. Its points go with it; the undo penalty stays. */
export function fcUndo(state: FreecellState): FreecellState | null {
  if (!fcCanUndo(state)) return null
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

export function fcFoundationFor(state: FreecellState, from: PileId, index: number): PileId | null {
  if (isFoundation(from) || index !== fcPileCards(state, from).length - 1) return null
  return FC_FOUNDATIONS.find((pile) => fcCanMove(state, from, index, pile)) ?? null
}

/** Does this column card already sit on the card it belongs on? Then moving it alone breaks a run. */
function sitsInRun(state: Piles, pile: PileId, index: number) {
  if (!isTableau(pile) || index === 0) return false
  const cards = fcPileCards(state, pile)
  return fitsOn(cards[index], cards[index - 1])
}

/**
 * Where a tap sends a card: home if it can go, else onto another column (a card before an empty
 * one), else an empty free cell, unless that would split a run that is already in order.
 */
export function fcTapMove(state: FreecellState, pile: PileId, index: number): PileId | null {
  if (!fcCanPickUp(state, pile, index)) return null
  const home = fcFoundationFor(state, pile, index)
  if (home) return home
  const onCard = FC_TABLEAU.find((to) => fcPileCards(state, to).length > 0 && fcCanMove(state, pile, index, to))
  if (onCard) return onCard
  const wholeColumn = isTableau(pile) && index === 0
  if (!wholeColumn) {
    const empty = FC_TABLEAU.find((to) => fcPileCards(state, to).length === 0 && fcCanMove(state, pile, index, to))
    if (empty) return empty
  }
  if (isTableau(pile) && !sitsInRun(state, pile, index)) {
    const cell = FC_CELLS.find((to) => fcCanMove(state, pile, index, to))
    if (cell) return cell
  }
  return null
}

/** Every legal move, each run start and destination once. */
function legalMoves(state: FreecellState) {
  const moves: { from: PileId; index: number; to: PileId }[] = []
  const sources: PileId[] = [...FC_CELLS, ...FC_TABLEAU]
  const targets: PileId[] = [...FC_FOUNDATIONS, ...FC_TABLEAU, ...FC_CELLS]
  for (const from of sources) {
    const cards = fcPileCards(state, from)
    for (let index = 0; index < cards.length; index += 1) {
      if (!fcCanPickUp(state, from, index)) continue
      for (const to of targets) if (fcCanMove(state, from, index, to)) moves.push({ from, index, to })
    }
  }
  return moves
}

/** How deep the lowest card still needed next sits; smaller is better. */
function lowestDepth(state: Piles) {
  let best = Number.POSITIVE_INFINITY
  state.tableau.forEach((pile) => {
    pile.forEach((card, i) => {
      if (foundationIndexFor(state, card) >= 0) best = Math.min(best, pile.length - 1 - i)
    })
  })
  return best
}

/**
 * How many positions a hint may look ahead through to find a way to win from here. 8000 takes about
 * a third of a second at worst on a laptop; following the hints then wins most Hard deals.
 */
export const HINT_SETTINGS = { budget: 8000 }

/**
 * A helpful move: the first step of a way to win from here when one can be found quickly. Otherwise
 * a card home; a move that empties a column or uncovers a card that can go home; a free-cell card
 * back into a column; then other column moves that change something. Never a move that just shuffles.
 */
export function fcFindHint(state: FreecellState): TableHint {
  if (state.won) return { kind: 'none' }
  const planned = solveFrom(nodeFromState(state), HINT_SETTINGS.budget)?.first
  if (planned) {
    const to = planned.to === 'home' ? fcFoundationFor(state, planned.from, planned.index) : planned.to
    if (to && fcCanMove(state, planned.from, planned.index, to)) return { kind: 'move', from: planned.from, index: planned.index, to }
  }
  const moves = legalMoves(state)
  const home = moves.find((m) => isFoundation(m.to))
  if (home) return { kind: 'move', ...home }
  const before = lowestDepth(state)
  let best: { move: (typeof moves)[number]; score: number } | null = null
  for (const m of moves) {
    if (isFoundation(m.to)) continue
    // Moving a run off a card it already belongs on, or a whole column into an empty one, changes nothing.
    if (isTableau(m.from) && sitsInRun(state, m.from, m.index) && !isCell(m.to)) continue
    if (isTableau(m.from) && m.index === 0 && isTableau(m.to) && fcPileCards(state, m.to).length === 0) continue
    const after = fcMove({ ...state, history: [] }, m.from, m.index, m.to)
    if (!after) continue
    let score = 0
    score += (after.homed.length - state.homed.length) * 50
    if (isTableau(m.from) && fcPileCards(after, m.from).length === 0) score += 30
    if (isCell(m.from) && isTableau(m.to)) score += 25
    if (isTableau(m.to) && fcPileCards(state, m.to).length > 0) score += 15
    if (lowestDepth(after) < before) score += 20
    if (isCell(m.to)) score -= 10
    if (isTableau(m.to) && fcPileCards(state, m.to).length === 0) score -= 5
    if (!best || score > best.score) best = { move: m, score }
  }
  return best && best.score > 0 ? { kind: 'move', ...best.move } : { kind: 'none' }
}

export function fcTakeHint(state: FreecellState): { state: FreecellState; hint: TableHint } {
  const hint = fcFindHint(state)
  if (hint.kind === 'none') return { state, hint }
  return { state: { ...state, hints: state.hints + 1, penalty: state.penalty + KLONDIKE_SCORING.hint }, hint }
}

/** True while any legal move is left anywhere: columns, free cells or foundations. */
export function fcHasUsefulMove(state: FreecellState): boolean {
  if (state.won) return false
  return legalMoves(state).length > 0
}

export function fcLiveScore(state: FreecellState) {
  return Math.max(0, state.points + state.penalty)
}

/** Same rewards as Classic: the win and speed bonuses only for a completed game. */
export function fcRewardsFor(state: FreecellState, seconds: number): KlondikeRewards {
  const final = fcLiveScore(state) + (state.won ? KLONDIKE_SCORING.winBonus + timeBonus(seconds) : 0)
  return {
    score: Math.min(SOLITAIRE_REWARDS.maxScore, final),
    xp:
      state.stacked.length * SOLITAIRE_REWARDS.xpPerStack +
      state.homed.length * SOLITAIRE_REWARDS.xpPerHome +
      (state.won ? SOLITAIRE_REWARDS.winXp : 0),
    coins: bonusCoins(state) + (state.won ? winCoinsFor(state.difficulty === 'hard' ? 3 : 1) : 0),
    won: state.won,
  }
}

// The solver works on cards as numbers: suit * 13 + rank - 1, with suits 0 and 3 black, 1 and 2 red.
const SUIT_INDEX = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 } as const
const codeOf = (card: Card) => SUIT_INDEX[card.suit] * 13 + card.rank - 1
const rankOf = (c: number) => (c % 13) + 1
const suitOf = (c: number) => Math.floor(c / 13)
const redCode = (c: number) => suitOf(c) === 1 || suitOf(c) === 2
const fitsCode = (upper: number, lower: number) => rankOf(upper) === rankOf(lower) - 1 && redCode(upper) !== redCode(lower)

/** A move as the solver found it; 'home' means whichever foundation takes the card. */
type SolverMove = { from: PileId; index: number; to: PileId | 'home' }

type SolverNode = {
  cols: number[][]
  /** Four free cells; -1 is empty. */
  cells: number[]
  /** Cards home in each suit. */
  home: number[]
  g: number
  /** The first move on the way here from where the search began. */
  first: SolverMove | null
}

/** Sends safe cards home, the same rule as the game's own auto moves. */
function settle(n: SolverNode) {
  const safe = (c: number) => {
    const r = rankOf(c)
    if (r !== n.home[suitOf(c)] + 1) return false
    if (r <= 2) return true
    const others = redCode(c) ? [0, 3] : [1, 2]
    return others.every((s) => n.home[s] >= r - 1)
  }
  let moved = true
  while (moved) {
    moved = false
    for (let i = 0; i < n.cells.length; i += 1) {
      if (n.cells[i] >= 0 && safe(n.cells[i])) {
        n.home[suitOf(n.cells[i])] += 1
        n.cells[i] = -1
        moved = true
      }
    }
    for (const col of n.cols) {
      while (col.length > 0 && safe(col[col.length - 1])) {
        n.home[suitOf(col[col.length - 1])] += 1
        col.pop()
        moved = true
      }
    }
  }
}

const solverKey = (n: SolverNode) =>
  `${n.cols.map((c) => c.join('.')).sort().join('|')}#${n.cells.filter((c) => c >= 0).sort((a, b) => a - b).join('.')}#${n.home.join('.')}`

function solverHeuristic(n: SolverNode) {
  let h = (52 - n.home.reduce((a, b) => a + b, 0)) * 3 + n.cells.filter((c) => c >= 0).length * 2
  for (const col of n.cols) {
    // Cards out of order, or above a lower card, block progress.
    for (let i = 1; i < col.length; i += 1) if (!fitsCode(col[i], col[i - 1])) h += 1
    let min = 99
    for (let i = 0; i < col.length; i += 1) {
      if (rankOf(col[i]) > min) h += 1
      min = Math.min(min, rankOf(col[i]))
    }
  }
  return h
}

function nodeFromState(state: Piles): SolverNode {
  const home = [0, 0, 0, 0]
  for (const pile of state.foundations) {
    const card = top(pile)
    if (card) home[SUIT_INDEX[card.suit]] = pile.length
  }
  return {
    cols: state.tableau.map((pile) => pile.map(codeOf)),
    cells: state.cells.map((card) => (card ? codeOf(card) : -1)),
    home,
    g: 0,
    first: null,
  }
}

/**
 * Best-first search for a way to win, looking at no more than `budget` positions. Returns how many it
 * looked at and the first move of the win, or null if it found none in time.
 */
function solveFrom(start: SolverNode, budget: number): { expanded: number; first: SolverMove | null } | null {
  const clone = (n: SolverNode): SolverNode => ({
    cols: n.cols.map((c) => c.slice()),
    cells: n.cells.slice(),
    home: n.home.slice(),
    g: n.g + 1,
    first: n.first,
  })
  const heap: { f: number; n: SolverNode }[] = []
  const push = (n: SolverNode) => {
    heap.push({ f: solverHeuristic(n) + n.g * 0.5, n })
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p].f <= heap[i].f) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const first = heap[0]
    const last = heap.pop() as { f: number; n: SolverNode }
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l].f < heap[m].f) m = l
        if (r < heap.length && heap[r].f < heap[m].f) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return first.n
  }

  settle(start)
  push(start)
  const seen = new Set<string>([solverKey(start)])
  let expanded = 0
  while (heap.length > 0) {
    const n = pop()
    if (n.home.every((h) => h === 13)) return { expanded, first: n.first }
    expanded += 1
    if (expanded > budget) return null
    const freeCells = n.cells.filter((c) => c < 0).length
    const emptyCols = n.cols.filter((c) => c.length === 0).length
    const children: SolverNode[] = []
    const add = (child: SolverNode, move: SolverMove) => {
      if (!child.first) child.first = move
      settle(child)
      const key = solverKey(child)
      if (seen.has(key)) return
      seen.add(key)
      children.push(child)
    }
    // Foundation moves that aren't automatic.
    n.cols.forEach((col, i) => {
      const c = col[col.length - 1]
      if (c !== undefined && rankOf(c) === n.home[suitOf(c)] + 1) {
        const child = clone(n)
        child.cols[i].pop()
        child.home[suitOf(c)] += 1
        add(child, { from: `t${i}`, index: col.length - 1, to: 'home' })
      }
    })
    n.cells.forEach((c, i) => {
      if (c >= 0 && rankOf(c) === n.home[suitOf(c)] + 1) {
        const child = clone(n)
        child.cells[i] = -1
        child.home[suitOf(c)] += 1
        add(child, { from: `c${i}`, index: 0, to: 'home' })
      }
    })
    // Free-cell cards onto columns.
    n.cells.forEach((c, i) => {
      if (c < 0) return
      let triedEmpty = false
      n.cols.forEach((col, j) => {
        if (col.length === 0) {
          if (triedEmpty) return
          triedEmpty = true
        } else if (!fitsCode(c, col[col.length - 1])) return
        const child = clone(n)
        child.cells[i] = -1
        child.cols[j].push(c)
        add(child, { from: `c${i}`, index: 0, to: `t${j}` })
      })
    })
    // Runs between columns, within the supermove limit.
    n.cols.forEach((col, i) => {
      if (col.length === 0) return
      let runStart = col.length - 1
      while (runStart > 0 && fitsCode(col[runStart], col[runStart - 1])) runStart -= 1
      let triedEmpty = false
      n.cols.forEach((target, j) => {
        if (i === j) return
        if (target.length === 0) {
          if (triedEmpty) return
          triedEmpty = true
          const limit = (freeCells + 1) * 2 ** Math.max(0, emptyCols - 1)
          // Into an empty column: the longest run that fits, unless it's the whole column.
          const from = Math.max(runStart, col.length - limit)
          if (from === 0) return
          const child = clone(n)
          child.cols[j] = child.cols[i].splice(from)
          add(child, { from: `t${i}`, index: from, to: `t${j}` })
          return
        }
        const limit = (freeCells + 1) * 2 ** emptyCols
        const lower = target[target.length - 1]
        for (let s = Math.max(runStart, col.length - limit); s < col.length; s += 1) {
          if (!fitsCode(col[s], lower)) continue
          const child = clone(n)
          child.cols[j].push(...child.cols[i].splice(s))
          add(child, { from: `t${i}`, index: s, to: `t${j}` })
          break
        }
      })
    })
    // Column cards into a free cell.
    const cell = n.cells.indexOf(-1)
    if (cell >= 0) {
      n.cols.forEach((col, i) => {
        if (col.length === 0) return
        const child = clone(n)
        child.cells[cell] = child.cols[i].pop() as number
        add(child, { from: `t${i}`, index: col.length - 1, to: `c${cell}` })
      })
    }
    for (const child of children) push(child)
  }
  return null
}

/**
 * Solves a deal from the start, looking at no more than `budget` positions. Returns how many it
 * looked at to find a win (fewer means easier), or null if it didn't find one. Used ahead of time to
 * pick deals for each difficulty.
 */
export function freecellSolve(seed: number, budget: number): number | null {
  return solveFrom(nodeFromState(freshFreecell(seed, 'easy')), budget)?.expanded ?? null
}
