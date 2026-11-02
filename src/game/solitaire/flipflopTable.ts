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
import { fanColumn, tableCardWidth, type TableLayout, type TableRules, type TableSpot } from './table'
import { SOLITAIRE_LAYOUT as L } from './theme'

const PAD = 4
/** Top row: stock, the two reserves, then the four foundations. Same card size as Classic. */
const TOP_ROW = ['stock', ...FF_RESERVES, ...FF_FOUNDATIONS] as const

function layout(state: FlipflopState, boxW: number, boxH: number): TableLayout {
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
