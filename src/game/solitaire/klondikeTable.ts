/** Classic (Klondike) on the shared table: its rules and its seven-column layout. */
import {
  canMove,
  canPickUp,
  FOUNDATIONS,
  foundationFor,
  pileCards,
  TABLEAU,
  type KlondikeState,
  type PileId as KlondikePile,
} from './klondike'
import {
  deepestColumn,
  fanColumn,
  fanColumnWide,
  sideBlocks,
  tableCardWidth,
  wideTable,
  type TableLayout,
  type TableRules,
  type TableSpot,
} from './table'
import { SOLITAIRE_LAYOUT as L } from './theme'

const PAD = 4

/** Column index on the board for each top-row pile. */
const TOP_COLUMN: Record<'stock' | 'waste' | 'f0' | 'f1' | 'f2' | 'f3', number> = {
  stock: 0,
  waste: 1,
  f0: 3,
  f1: 4,
  f2: 5,
  f3: 6,
}

/**
 * Landscape: the seven columns get the full height, with the stock and waste on their left and the
 * four foundations in a square on their right, so the cards are as big as the screen allows. Room is
 * kept for a deep column before the cards shrink to fit it.
 */
function layoutWide(state: KlondikeState, boxW: number, boxH: number): TableLayout {
  const deepest = deepestColumn(state.tableau, L.wideMinFaceDownOverlap, L.wideMinFaceUpOverlap)
  // The waste fans downwards here when drawing three, so it needs a little more than two cards of height.
  const wasteFan = 0.2
  const blocks = sideBlocks(
    boxW,
    boxH,
    TABLEAU.length,
    [
      { pile: 'stock', col: 0, row: 0 },
      { pile: 'waste', col: 0, row: 1 },
    ],
    [
      { pile: 'f0', col: 0, row: 0 },
      { pile: 'f1', col: 1, row: 0 },
      { pile: 'f2', col: 0, row: 1 },
      { pile: 'f3', col: 1, row: 1 },
    ],
    Math.max(2.6, deepest, 2 + wasteFan * 2 + 0.1),
    L.cardAspect,
    PAD,
  )
  const { cardW, cardH, colX } = blocks
  const tableauTop = 0
  const spots = new Map<string, TableSpot>()
  const piles = {} as TableLayout['piles']

  for (const pile of ['stock', 'waste', ...FOUNDATIONS] as const) {
    const at = blocks.place.get(pile) ?? { x: 0, y: 0 }
    piles[pile] = { x: at.x, y: at.y, w: cardW, h: cardH, dropY: at.y }
    const cards = pileCards(state, pile)
    const fanFrom = pile === 'waste' && state.drawCount === 3 ? cards.length - 3 : cards.length
    cards.forEach((card, index) => {
      const shift = Math.max(0, index - fanFrom) * cardH * wasteFan
      spots.set(card.id, { x: at.x, y: at.y + shift, z: index + 1, pile, index })
    })
  }

  const room = Math.max(cardH * 0.5, boxH - cardH - 2)
  const overlap = {
    faceDown: L.faceDownOverlap,
    faceUp: L.faceUpOverlap,
    minFaceDown: L.wideMinFaceDownOverlap,
    minFaceUp: L.wideMinFaceUpOverlap,
  }
  TABLEAU.forEach((pile, col) => {
    const x = colX(col)
    const bottom = fanColumnWide(pileCards(state, pile), x, tableauTop, room, cardH, overlap, pile, spots)
    piles[pile] = { x, y: tableauTop, w: cardW, h: bottom - tableauTop + cardH, dropY: bottom }
  })

  return { width: blocks.width, cardW, cardH, spots, piles }
}

function layout(state: KlondikeState, boxW: number, boxH: number): TableLayout {
  if (wideTable(boxW, boxH)) return layoutWide(state, boxW, boxH)
  const width = Math.min(boxW, L.maxBoardWidth)
  const cardW = tableCardWidth(width, 7, PAD, L.columnGap)
  const cardH = cardW * L.cardAspect
  const gap = cardW * L.columnGap
  const colX = (col: number) => (boxW - width) / 2 + PAD + col * (cardW + gap)
  const tableauTop = cardH + cardW * 0.28
  const spots = new Map<string, TableSpot>()
  const piles = {} as TableLayout['piles']

  for (const pile of ['stock', 'waste', ...FOUNDATIONS] as const) {
    const x = colX(TOP_COLUMN[pile])
    piles[pile] = { x, y: 0, w: cardW, h: cardH, dropY: 0 }
    const cards = pileCards(state, pile)
    // Drawing three: the last three waste cards fan out so the ones underneath show.
    const fanFrom = pile === 'waste' && state.drawCount === 3 ? cards.length - 3 : cards.length
    cards.forEach((card, index) => {
      const shift = Math.max(0, index - fanFrom) * cardW * L.wasteFan
      spots.set(card.id, { x: x + shift, y: 0, z: index + 1, pile, index })
    })
  }

  const room = Math.max(cardH, boxH - tableauTop - cardH - 4)
  const overlap = {
    faceDown: L.faceDownOverlap,
    faceUp: L.faceUpOverlap,
    minFaceDown: L.minFaceDownOverlap,
    minFaceUp: L.minFaceUpOverlap,
  }
  TABLEAU.forEach((pile, col) => {
    const x = colX(col)
    const bottom = fanColumn(pileCards(state, pile), x, tableauTop, room, cardH, overlap, pile, spots)
    piles[pile] = { x, y: tableauTop, w: cardW, h: bottom - tableauTop + cardH, dropY: bottom }
  })

  return { width, cardW, cardH, spots, piles }
}

export const KLONDIKE_TABLE: TableRules<KlondikeState> = {
  pileCards: (state, pile) => pileCards(state, pile as KlondikePile),
  allCards: (state) => [...state.stock, ...state.waste, ...state.foundations.flat(), ...state.tableau.flat()],
  canPickUp: (state, pile, index) => canPickUp(state, pile as KlondikePile, index),
  canMove: (state, from, index, to) => canMove(state, from as KlondikePile, index, to as KlondikePile),
  foundationFor: (state, from, index) => foundationFor(state, from as KlondikePile, index),
  layout,
  slots: (state) => [
    {
      pile: 'stock',
      art: state.waste.length > 0 ? 'slotStock' : 'slotStockEmpty',
      placeholder: state.waste.length > 0 ? 'sol-slot-ph recycle' : 'sol-slot-ph',
    },
    { pile: 'waste', art: 'slotWaste', placeholder: 'sol-slot-ph' },
    ...FOUNDATIONS.map((pile) => ({ pile, art: 'slotFoundation' as const, placeholder: 'sol-slot-ph home' })),
    ...TABLEAU.map((pile) => ({ pile, art: 'slotTableau' as const, placeholder: 'sol-slot-ph' })),
  ],
  stock: 'stock',
  foundations: FOUNDATIONS,
  columns: TABLEAU,
}
