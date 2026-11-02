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
  layout(state: S, boxW: number, boxH: number): TableLayout
  slots(state: S): TableSlot[]
  /** The tap target that deals or draws from the stock. */
  readonly stock: PileId
  readonly foundations: readonly PileId[]
  /** Columns: cards fan downwards, and a dropped run lands below the last card. */
  readonly columns: readonly PileId[]
  /** Piles a dragged card can be dropped on. Foundations and columns unless given. */
  readonly dropTargets?: readonly PileId[]
  /** A tap on this card does this move straight away (such as a King in Pyramid). */
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
  /** Shake a card tapped when it can't be played, or when a pair it was tapped for doesn't work. */
  readonly tapFeedback?: boolean
}

/** Shared sizing: card width for a board this wide with this many top-row spots. */
export function tableCardWidth(width: number, slots: number, pad: number, columnGap: number) {
  return (width - pad * 2) / (slots + (slots - 1) * columnGap)
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
