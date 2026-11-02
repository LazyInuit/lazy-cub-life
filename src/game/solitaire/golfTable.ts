/** Golf on the shared table: seven columns of five, with the stock, waste and streak below them. */
import {
  GOLF_SETTINGS,
  GOLF_TABLEAU,
  golfCanMove,
  golfCanPickUp,
  golfCardPoints,
  golfCovered,
  golfPileCards,
  golfTapMove,
  type GolfState,
} from './golf'
import { fanColumn, tableCardWidth, type TableLayout, type TableRules, type TableSpot } from './table'
import { SOLITAIRE_LAYOUT as L } from './theme'

const PAD = 4
/** Each card in a column sits this far below the last, as a share of card height. */
const ROW_STEP = 0.34
const STOCK_COL = 2
const WASTE_COL = 4

function layout(state: GolfState, boxW: number, boxH: number): TableLayout {
  const width = Math.min(boxW, L.maxBoardWidth)
  const columns = GOLF_SETTINGS.columns
  const cardW = tableCardWidth(width, columns, PAD, L.columnGap)
  const cardH = cardW * L.cardAspect
  const pitch = cardW * (1 + L.columnGap)
  const left = (boxW - width) / 2 + PAD
  const spots = new Map<string, TableSpot>()
  const piles = {} as TableLayout['piles']

  const step = Math.min(ROW_STEP, Math.max(0.22, (boxH - 2.6 * cardH) / ((GOLF_SETTINGS.rows - 1) * cardH)))
  const overlap = { faceDown: step, faceUp: step, minFaceDown: step, minFaceUp: step }
  GOLF_TABLEAU.forEach((pile, col) => {
    const x = left + col * pitch
    const bottom = fanColumn(golfPileCards(state, pile), x, 0, cardH * 4, cardH, overlap, pile, spots)
    piles[pile] = { x, y: 0, w: cardW, h: bottom + cardH, dropY: bottom }
  })

  const rowY = (GOLF_SETTINGS.rows - 1) * step * cardH + cardH + cardH * 0.45
  const place = (pile: string, col: number, zBase: number) => {
    const x = left + col * pitch
    piles[pile] = { x, y: rowY, w: cardW, h: cardH, dropY: rowY }
    golfPileCards(state, pile).forEach((card, index) => spots.set(card.id, { x, y: rowY, z: zBase + index, pile, index }))
  }
  place('stock', STOCK_COL, 100)
  // Played cards fly over the columns to land here.
  place('waste', WASTE_COL, 200)

  const noteX = left + (WASTE_COL + 1) * pitch
  return { width, cardW, cardH, spots, piles, note: { x: noteX, y: rowY, w: left + width - PAD - noteX, h: cardH } }
}

export const GOLF_TABLE: TableRules<GolfState> = {
  pileCards: golfPileCards,
  allCards: (state) => [...state.tableau.flat(), ...state.stock, ...state.waste],
  canPickUp: golfCanPickUp,
  canMove: golfCanMove,
  foundationFor: () => null,
  layout,
  slots: () => [
    { pile: 'stock', art: 'slotStockEmpty', placeholder: 'sol-slot-ph' },
    { pile: 'waste', art: 'slotWaste', placeholder: 'sol-slot-ph' },
  ],
  stock: 'stock',
  foundations: [],
  columns: GOLF_TABLEAU,
  dropTargets: ['waste'],
  tapMove: golfTapMove,
  dimmed: (state, pile, index) => golfCovered(state, pile, index),
  glowing: (state, pile, index) => pile === 'waste' && index === state.waste.length - 1,
  tapFeedback: true,
  note: (state) => (state.streak >= 2 ? [`Streak ×${state.streak}`, `next +${golfCardPoints(state.streak + 1)}`] : []),
}
