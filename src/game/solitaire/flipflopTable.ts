/** Flipflop on the shared table: stock and two reserves beside the foundations, then five columns. */
import {
  FF_FOUNDATIONS,
  FF_RESERVES,
  FF_TABLEAU,
  ffCanMove,
  ffCanPickUp,
  ffFoundationFor,
  ffPileCards,
  type FlipflopState,
} from './flipflop'
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
/** Top row: stock, the two reserves, then the four foundations. Same card size as Classic. */
const TOP_ROW = ['stock', ...FF_RESERVES, ...FF_FOUNDATIONS] as const

/**
 * Landscape: the five columns get the full height, with the stock and the two reserves under it on
 * their left and the foundations in a square on their right, so the cards are as big as the screen allows.
 */
function layoutWide(state: FlipflopState, boxW: number, boxH: number): TableLayout {
  const deepest = deepestColumn(state.tableau, L.wideMinFaceDownOverlap, L.wideMinFaceUpOverlap)
  const blocks = sideBlocks(
    boxW,
    boxH,
    FF_TABLEAU.length,
    [
      { pile: 'stock', col: 0, row: 0 },
      { pile: FF_RESERVES[0], col: 0, row: 1 },
      { pile: FF_RESERVES[1], col: 1, row: 1 },
    ],
    FF_FOUNDATIONS.map((pile, i) => ({ pile, col: i % 2, row: Math.floor(i / 2) })),
    Math.max(2.6, deepest),
    L.cardAspect,
    PAD,
  )
  const { cardW, cardH, colX } = blocks
  const tableauTop = 0
  const spots = new Map<string, TableSpot>()
  const piles = {} as TableLayout['piles']

  TOP_ROW.forEach((pile) => {
    const at = blocks.place.get(pile) ?? { x: 0, y: 0 }
    piles[pile] = { x: at.x, y: at.y, w: cardW, h: cardH, dropY: at.y }
    ffPileCards(state, pile).forEach((card, index) => spots.set(card.id, { x: at.x, y: at.y, z: index + 1, pile, index }))
  })

  const room = Math.max(cardH * 0.5, boxH - cardH - 2)
  const overlap = {
    faceDown: L.faceDownOverlap,
    faceUp: L.faceUpOverlap,
    minFaceDown: L.wideMinFaceDownOverlap,
    minFaceUp: L.wideMinFaceUpOverlap,
  }
  FF_TABLEAU.forEach((pile, col) => {
    const x = colX(col)
    const bottom = fanColumnWide(ffPileCards(state, pile), x, tableauTop, room, cardH, overlap, pile, spots)
    piles[pile] = { x, y: tableauTop, w: cardW, h: bottom - tableauTop + cardH, dropY: bottom }
  })

  return { width: blocks.width, cardW, cardH, spots, piles }
}

function layout(state: FlipflopState, boxW: number, boxH: number): TableLayout {
  if (wideTable(boxW, boxH)) return layoutWide(state, boxW, boxH)
  const width = Math.min(boxW, L.maxBoardWidth)
  const cardW = tableCardWidth(width, TOP_ROW.length, PAD, L.columnGap)
  const cardH = cardW * L.cardAspect
  const gap = cardW * L.columnGap
  const left = (boxW - width) / 2 + PAD
  const tableauTop = cardH + cardW * 0.28
  const spots = new Map<string, TableSpot>()
  const piles = {} as TableLayout['piles']

  TOP_ROW.forEach((pile, col) => {
    const x = left + col * (cardW + gap)
    piles[pile] = { x, y: 0, w: cardW, h: cardH, dropY: 0 }
    ffPileCards(state, pile).forEach((card, index) => spots.set(card.id, { x, y: 0, z: index + 1, pile, index }))
  })

  // Five columns spread across the same width as the top row.
  const span = width - PAD * 2 - cardW
  const room = Math.max(cardH, boxH - tableauTop - cardH - 4)
  const overlap = {
    faceDown: L.faceDownOverlap,
    faceUp: L.faceUpOverlap,
    minFaceDown: L.minFaceDownOverlap,
    minFaceUp: L.minFaceUpOverlap,
  }
  FF_TABLEAU.forEach((pile, col) => {
    const x = left + (span * col) / (FF_TABLEAU.length - 1)
    const bottom = fanColumn(ffPileCards(state, pile), x, tableauTop, room, cardH, overlap, pile, spots)
    piles[pile] = { x, y: tableauTop, w: cardW, h: bottom - tableauTop + cardH, dropY: bottom }
  })

  return { width, cardW, cardH, spots, piles }
}

export const FLIPFLOP_TABLE: TableRules<FlipflopState> = {
  pileCards: ffPileCards,
  allCards: (state) => [...state.stock, ...state.reserves.flat(), ...state.foundations.flat(), ...state.tableau.flat()],
  canPickUp: ffCanPickUp,
  canMove: ffCanMove,
  foundationFor: ffFoundationFor,
  layout,
  slots: () => [
    { pile: 'stock', art: 'slotStockEmpty', placeholder: 'sol-slot-ph' },
    ...FF_RESERVES.map((pile) => ({ pile, art: 'slotWaste' as const, placeholder: 'sol-slot-ph reserve' })),
    ...FF_FOUNDATIONS.map((pile) => ({ pile, art: 'slotFoundation' as const, placeholder: 'sol-slot-ph home' })),
    ...FF_TABLEAU.map((pile) => ({ pile, art: 'slotTableau' as const, placeholder: 'sol-slot-ph' })),
  ],
  stock: 'stock',
  foundations: FF_FOUNDATIONS,
  columns: FF_TABLEAU,
}
