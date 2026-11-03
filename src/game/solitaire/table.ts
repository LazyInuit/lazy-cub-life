/**
 * What a solitaire table needs from a game mode, so one board can show any variation.
 * Each mode supplies its own rules and layout; the board only handles touch, drag and animation.
 */
import type { Card } from '../cards/deck'
import type { SolitaireAssetName } from './theme'

/** A pile on the table: 'stock', 'waste', 'r0', 'f0'..'f3', 't0'.. and so on, named by the mode. */
export type PileId = string

export type TableHint =
  | { kind: 'move'; from: PileId; index: number; to: PileId }
  | { kind: 'draw' }
  | { kind: 'recycle' }
  | { kind: 'none' }

export type TableSpot = { x: number; y: number; z: number; pile: PileId; index: number }
export type TableRect = { x: number; y: number; w: number; h: number }

export type TableLayout = {
  width: number
  cardW: number
  cardH: number
  spots: Map<string, TableSpot>
  /** Where each pile sits, and for columns where the next card would go. */
  piles: Record<PileId, TableRect & { dropY: number }>
  /** Where the mode's status lines go, if it has any. */
  note?: TableRect
  /** Shrinks the status lines when they sit in a narrow spot, such as beside the columns in landscape. */
  noteScale?: number
}

/** An empty pile outline: its artwork, and the placeholder style until that artwork is added. */
export type TableSlot = { pile: PileId; art: SolitaireAssetName; placeholder: string }

/** The parts of a game's state the board reads directly. */
export type TableState = { foundations: Card[][]; coinCards: string[] }

/** One mode's rules and layout, as the board uses them. Method syntax so each mode can use its own state type. */
export interface TableRules<S extends TableState> {
  pileCards(state: S, pile: PileId): Card[]
  allCards(state: S): Card[]
  canPickUp(state: S, pile: PileId, index: number): boolean
  canMove(state: S, from: PileId, index: number, to: PileId): boolean
  foundationFor(state: S, from: PileId, index: number): PileId | null
  /** `centreX` is where the screen's centre line crosses the box, when the box isn't centred on screen. */
  layout(state: S, boxW: number, boxH: number, centreX?: number): TableLayout
  slots(state: S): TableSlot[]
  /** The tap target that deals or draws from the stock. */
  readonly stock: PileId
  readonly foundations: readonly PileId[]
  /** Columns: cards fan downwards, and a dropped run lands below the last card. */
  readonly columns: readonly PileId[]
  /** Piles a dragged card can be dropped on. Foundations and columns unless given. */
  readonly dropTargets?: readonly PileId[]
  /** Where a double tap sends this card (such as a King in Pyramid). Without this, a double tap sends a card home. */
  tapMove?(state: S, pile: PileId, index: number): PileId | null
  /** Cards shown dimmed because they can't be played yet. */
  dimmed?(state: S, pile: PileId, index: number): boolean
  /** Cards given a soft glow, such as the active waste card in Golf. */
  glowing?(state: S, pile: PileId, index: number): boolean
  /** The number on the stock's badge: cards left unless given (Spider shows deals left). */
  stockCount?(state: S): number
  /** Short status lines shown on the table, such as "Completed 3 / 8". */
  note?(state: S): string[]
  /** A faint value shown in the top-right corner of a face-up card, such as 12 on a Queen in Pyramid. */
  cardValue?(card: Card): string | null
  /** A short message saying why these cards can't be picked up, when the player should be told. */
  blockedPickUp?(state: S, pile: PileId, index: number): string | null
  /** Shake a card tapped when it can't be played, or when a pair it was tapped for doesn't work. */
  readonly tapFeedback?: boolean
}

/**
 * A table wider than it is tall: the phone is on its side. Modes lay their piles out differently then,
 * sizing cards to the height as well as the width. Portrait tables never reach this.
 */
export function wideTable(boxW: number, boxH: number) {
  return boxW > boxH * 1.3
}

/**
 * Landscape card width: as big as fits `across` card widths side by side in the width, and `down`
 * card heights plus `extraW` card widths stacked in the height.
 */
export function wideCardWidth(boxW: number, boxH: number, across: number, down: number, aspect: number, extraW = 0) {
  return Math.max(16, Math.min(boxW / across, boxH / (down * aspect + extraW)))
}

/**
 * How tall the deepest of these columns is at its tightest, in card heights. Landscape layouts use it
 * to shrink the cards when a column grows too long to fit, instead of letting it run off the table.
 */
export function deepestColumn(columns: Card[][], minFaceDown: number, minFaceUp: number) {
  let deepest = 1
  for (const cards of columns) {
    if (cards.length === 0) continue
    const downs = cards.slice(0, -1).filter((card) => !card.faceUp).length
    const ups = cards.length - 1 - downs
    deepest = Math.max(deepest, 1 + downs * minFaceDown + ups * minFaceUp)
  }
  return deepest
}

/**
 * Spreads `count` columns of this card width across `span`, centred in the box: at least `minGap` and
 * at most `maxGap` card widths apart, so they use the wide screen without drifting too far apart.
 */
export function spreadColumns(boxW: number, span: number, count: number, cardW: number, minGap: number, maxGap: number) {
  const free = count > 1 ? (span - count * cardW) / (count - 1) : 0
  const gap = Math.min(cardW * maxGap, Math.max(cardW * minGap, free))
  const total = count * cardW + Math.max(0, count - 1) * gap
  const left = (boxW - total) / 2
  return { left, pitch: cardW + gap, total }
}

/** A pile in a small block beside the columns: which of the block's columns and rows it sits in. */
export type BlockSpot = { pile: PileId; col: number; row: number }

/**
 * Landscape with the spare piles beside the columns rather than above them: a block of piles on the
 * left, the columns in the middle at full height, a block on the right. Cards are as big as fits both
 * the width and `down` card heights. Returns the card size, each column's x, and each block pile's spot.
 */
export function sideBlocks(
  boxW: number,
  boxH: number,
  columns: number,
  left: BlockSpot[],
  right: BlockSpot[],
  down: number,
  aspect: number,
  pad: number,
) {
  const pileGap = 0.1
  const sideGap = 0.3
  const columnGap = 0.1
  const rowGap = 0.12
  const colsOf = (spots: BlockSpot[]) => (spots.length ? Math.max(...spots.map((spot) => spot.col)) + 1 : 0)
  const rowsOf = (spots: BlockSpot[]) => (spots.length ? Math.max(...spots.map((spot) => spot.row)) + 1 : 0)
  const blockW = (n: number) => (n > 0 ? n + (n - 1) * pileGap + sideGap : 0)
  const leftCols = colsOf(left)
  const rightCols = colsOf(right)
  const rows = Math.max(rowsOf(left), rowsOf(right))
  const across = blockW(leftCols) + columns + (columns - 1) * columnGap + blockW(rightCols)
  const blocksDown = rows + ((rows - 1) * rowGap) / aspect
  const cardW = wideCardWidth(boxW - pad * 2, boxH, across, Math.max(down, blocksDown), aspect)
  const cardH = cardW * aspect
  const leftW = cardW * blockW(leftCols)
  const rightW = cardW * blockW(rightCols)
  const cols = spreadColumns(boxW, boxW - pad * 2 - leftW - rightW, columns, cardW, columnGap, 0.5)
  const groupLeft = (boxW - leftW - cols.total - rightW) / 2
  const colsLeft = groupLeft + leftW
  const rightLeft = colsLeft + cols.total + cardW * sideGap
  const place = new Map<PileId, { x: number; y: number }>()
  const spotY = (row: number) => row * (cardH + cardW * rowGap)
  for (const spot of left) place.set(spot.pile, { x: groupLeft + spot.col * cardW * (1 + pileGap), y: spotY(spot.row) })
  for (const spot of right) place.set(spot.pile, { x: rightLeft + spot.col * cardW * (1 + pileGap), y: spotY(spot.row) })
  return {
    cardW,
    cardH,
    colX: (col: number) => colsLeft + col * cols.pitch,
    place,
    width: leftW + cols.total + rightW,
  }
}

/** Shared sizing: card width for a board this wide with this many top-row spots. */
export function tableCardWidth(width: number, slots: number, pad: number, columnGap: number) {
  return (width - pad * 2) / (slots + (slots - 1) * columnGap)
}

/**
 * Landscape version of fanColumn: when a column is too long, face-down cards close up first (only a
 * sliver of them needs to show), then face-up ones, so a column always fits once the layout has sized
 * the cards with deepestColumn.
 */
export function fanColumnWide(
  cards: Card[],
  x: number,
  top: number,
  room: number,
  cardH: number,
  overlap: { faceDown: number; faceUp: number; minFaceDown: number; minFaceUp: number },
  pile: PileId,
  spots: Map<string, TableSpot>,
) {
  const downs = cards.slice(0, -1).filter((card) => !card.faceUp).length
  const ups = Math.max(0, cards.length - 1 - downs)
  let down = cardH * overlap.faceDown
  let up = cardH * overlap.faceUp
  if (downs * down + ups * up > room) {
    if (downs > 0) down = Math.max(cardH * overlap.minFaceDown, Math.min(down, (room - ups * up) / downs))
    if (ups > 0 && downs * down + ups * up > room) up = Math.max(cardH * overlap.minFaceUp, (room - downs * down) / ups)
  }
  let y = top
  cards.forEach((card, index) => {
    spots.set(card.id, { x, y, z: 10 + index, pile, index })
    if (index < cards.length - 1) y += card.faceUp ? up : down
  })
  return cards.length > 0 ? y : top
}

/** Fans a column's cards downwards, squeezing them when the column would run off the table. */
export function fanColumn(
  cards: Card[],
  x: number,
  top: number,
  room: number,
  cardH: number,
  overlap: { faceDown: number; faceUp: number; minFaceDown: number; minFaceUp: number },
  pile: PileId,
  spots: Map<string, TableSpot>,
) {
  const downs = cards.slice(0, -1).filter((card) => !card.faceUp).length
  const ups = Math.max(0, cards.length - 1 - downs)
  let down = cardH * overlap.faceDown
  let up = cardH * overlap.faceUp
  const need = downs * down + ups * up
  if (need > room) {
    const squeeze = room / need
    down = Math.max(cardH * overlap.minFaceDown, down * squeeze)
    up = Math.max(cardH * overlap.minFaceUp, up * squeeze)
  }
  let y = top
  cards.forEach((card, index) => {
    spots.set(card.id, { x, y, z: 10 + index, pile, index })
    if (index < cards.length - 1) y += card.faceUp ? up : down
  })
  return cards.length > 0 ? y : top
}
