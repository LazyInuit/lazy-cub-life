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
import {
  fanColumn,
  spreadColumns,
  tableCardWidth,
  wideCardWidth,
  wideTable,
  type TableLayout,
  type TableRules,
  type TableSpot,
} from './table'
import { SOLITAIRE_LAYOUT as L } from './theme'

const PAD = 4
/** Each card in a column sits this far below the last, as a share of card height. */
const ROW_STEP = 0.34
const STOCK_COL = 2
const WASTE_COL = 4

/**
 * Landscape: the seven columns across the table at full height, with the stock and waste side by side
 * on their right and the streak under them.
 */
function layoutWide(state: GolfState, boxW: number, boxH: number): TableLayout {
  const columns = GOLF_SETTINGS.columns
  const rows = GOLF_SETTINGS.rows
  const sideGap = 0.4
  const pairGap = 0.15
  const columnGap = 0.08
  const across = columns + (columns - 1) * columnGap + sideGap + 2 + pairGap
  const cardW = wideCardWidth(boxW - PAD * 2, boxH, across, 1 + (rows - 1) * ROW_STEP, L.cardAspect)
  const cardH = cardW * L.cardAspect
  const step = Math.min(ROW_STEP, Math.max(0.22, (boxH - cardH) / ((rows - 1) * cardH)))
  const sideW = cardW * (sideGap + 2 + pairGap)
  const cols = spreadColumns(boxW - sideW, boxW - sideW - PAD * 2, columns, cardW, columnGap, 0.45)
  // The columns and the stock and waste beside them, centred together.
  const groupLeft = (boxW - cols.total - sideW) / 2
  const spots = new Map<string, TableSpot>()
  const piles = {} as TableLayout['piles']

  const overlap = { faceDown: step, faceUp: step, minFaceDown: step, minFaceUp: step }
  GOLF_TABLEAU.forEach((pile, col) => {
    const x = groupLeft + col * cols.pitch
    const bottom = fanColumn(golfPileCards(state, pile), x, 0, cardH * 4, cardH, overlap, pile, spots)
    piles[pile] = { x, y: 0, w: cardW, h: bottom + cardH, dropY: bottom }
  })

  const columnsH = (rows - 1) * step * cardH + cardH
  const pairX = groupLeft + cols.total + cardW * sideGap
  const rowY = Math.max(0, (columnsH - cardH * 1.7) / 2)
  const place = (pile: string, x: number, zBase: number) => {
    piles[pile] = { x, y: rowY, w: cardW, h: cardH, dropY: rowY }
    golfPileCards(state, pile).forEach((card, index) => spots.set(card.id, { x, y: rowY, z: zBase + index, pile, index }))
  }
  place('stock', pairX, 100)
  place('waste', pairX + cardW * (1 + pairGap), 200)

  const noteW = cardW * (2 + pairGap)
  const note = { x: pairX, y: rowY + cardH + cardW * 0.1, w: noteW, h: cardH * 0.6 }
  return { width: cols.total + sideW, cardW, cardH, spots, piles, note, noteScale: 0.8 }
}

function layout(state: GolfState, boxW: number, boxH: number): TableLayout {
  if (wideTable(boxW, boxH)) return layoutWide(state, boxW, boxH)
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
