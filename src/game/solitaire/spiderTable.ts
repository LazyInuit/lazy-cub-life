/**
 * Spider on the shared table: the stock top left, cleared runs top right with the progress between
 * them, and ten columns below.
 */
import {
  SP_DONE,
  SP_TABLEAU,
  SPIDER_SETTINGS,
  spCanMove,
  spCanPickUp,
  spDealsLeft,
  spPileCards,
  spTapMove,
  type SpiderState,
} from './spider'
import {
  deepestColumn,
  fanColumn,
  fanColumnWide,
  spreadColumns,
  tableCardWidth,
  wideCardWidth,
  wideTable,
  type TableLayout,
  type TableRules,
  type TableSpot,
} from './table'
import { SOLITAIRE_LAYOUT as L } from './theme'

const PAD = 3
/** Ten columns need tighter spacing than the other modes to keep the cards as big as possible. */
const COLUMN_GAP = 0.06

/**
 * Landscape: the ten columns get the full height, with the stock and its progress on the left and the
 * cleared runs on the right, so the cards can be much bigger than with a row above.
 */
function layoutWide(state: SpiderState, boxW: number, boxH: number): TableLayout {
  const columns = SP_TABLEAU.length
  const sideGap = 0.22
  const across = columns + 2 + (columns - 1) * COLUMN_GAP + 2 * sideGap
  const deepest = deepestColumn(state.tableau, L.wideMinFaceDownOverlap, L.wideMinFaceUpOverlap)
  const cardW = wideCardWidth(boxW - PAD * 2, boxH, across, Math.max(2.6, deepest), L.cardAspect)
  const cardH = cardW * L.cardAspect
  const side = cardW * (1 + sideGap)
  const cols = spreadColumns(boxW, boxW - PAD * 2 - side * 2, columns, cardW, COLUMN_GAP, 0.3)
  const spots = new Map<string, TableSpot>()
  const piles = {} as TableLayout['piles']

  const stockX = cols.left - side
  piles.stock = { x: stockX, y: 0, w: cardW, h: cardH, dropY: 0 }
  state.stock.forEach((card, index) => spots.set(card.id, { x: stockX, y: 0, z: index + 1, pile: 'stock', index }))
  const doneX = cols.left + cols.total + cardW * sideGap
  piles[SP_DONE] = { x: doneX, y: 0, w: cardW, h: cardH, dropY: 0 }
  state.foundations[0].forEach((card, index) => spots.set(card.id, { x: doneX, y: 0, z: 300 + index, pile: SP_DONE, index }))

  const room = Math.max(cardH * 0.5, boxH - cardH - 2)
  const overlap = {
    faceDown: L.faceDownOverlap,
    faceUp: L.faceUpOverlap,
    minFaceDown: L.wideMinFaceDownOverlap,
    minFaceUp: L.wideMinFaceUpOverlap,
  }
  SP_TABLEAU.forEach((pile, col) => {
    const x = cols.left + col * cols.pitch
    const bottom = fanColumnWide(spPileCards(state, pile), x, 0, room, cardH, overlap, pile, spots)
    piles[pile] = { x, y: 0, w: cardW, h: bottom + cardH, dropY: bottom }
  })

  // Progress under the stock, in the space beside the first column.
  const noteX = Math.max(0, stockX + cardW / 2 - (side - cardW * 0.1) / 2)
  const noteW = Math.min(side - cardW * 0.1, cols.left - noteX - 2)
  const note = { x: noteX, y: cardH + cardW * 0.2, w: noteW, h: cardH * 1.2 }
  return { width: cols.total + side * 2, cardW, cardH, spots, piles, note, noteScale: 0.48 }
}

function layout(state: SpiderState, boxW: number, boxH: number): TableLayout {
  if (wideTable(boxW, boxH)) return layoutWide(state, boxW, boxH)
  const width = Math.min(boxW, L.maxBoardWidth)
  const columns = SP_TABLEAU.length
  const cardW = tableCardWidth(width, columns, PAD, COLUMN_GAP)
  const cardH = cardW * L.cardAspect
  const pitch = cardW * (1 + COLUMN_GAP)
  const left = (boxW - width) / 2 + PAD
  const tableauTop = cardH + cardW * 0.3
  const spots = new Map<string, TableSpot>()
  const piles = {} as TableLayout['piles']

  const stockX = left
  piles.stock = { x: stockX, y: 0, w: cardW, h: cardH, dropY: 0 }
  state.stock.forEach((card, index) => spots.set(card.id, { x: stockX, y: 0, z: index + 1, pile: 'stock', index }))
  const doneX = left + (columns - 1) * pitch
  piles[SP_DONE] = { x: doneX, y: 0, w: cardW, h: cardH, dropY: 0 }
  // Cleared runs land here over everything else, so the cards fly above the columns.
  state.foundations[0].forEach((card, index) => spots.set(card.id, { x: doneX, y: 0, z: 300 + index, pile: SP_DONE, index }))

  const room = Math.max(cardH, boxH - tableauTop - cardH - 4)
  const overlap = {
    faceDown: L.faceDownOverlap,
    faceUp: L.faceUpOverlap,
    minFaceDown: L.minFaceDownOverlap,
    minFaceUp: L.minFaceUpOverlap,
  }
  SP_TABLEAU.forEach((pile, col) => {
    const x = left + col * pitch
    const bottom = fanColumn(spPileCards(state, pile), x, tableauTop, room, cardH, overlap, pile, spots)
    piles[pile] = { x, y: tableauTop, w: cardW, h: bottom - tableauTop + cardH, dropY: bottom }
  })

  const noteX = stockX + pitch * 1.5
  const note = { x: noteX, y: 0, w: doneX - pitch * 0.5 - noteX, h: cardH }
  return { width, cardW, cardH, spots, piles, note }
}

export const SPIDER_TABLE: TableRules<SpiderState> = {
  pileCards: spPileCards,
  allCards: (state) => [...state.stock, ...state.foundations.flat(), ...state.tableau.flat()],
  canPickUp: spCanPickUp,
  canMove: spCanMove,
  foundationFor: () => null,
  layout,
  slots: () => [
    { pile: 'stock', art: 'slotStockEmpty', placeholder: 'sol-slot-ph' },
    { pile: SP_DONE, art: 'slotFoundation', placeholder: 'sol-slot-ph' },
    ...SP_TABLEAU.map((pile) => ({ pile, art: 'slotTableau' as const, placeholder: 'sol-slot-ph' })),
  ],
  stock: 'stock',
  foundations: [SP_DONE],
  columns: SP_TABLEAU,
  dropTargets: SP_TABLEAU,
  tapMove: spTapMove,
  tapFeedback: true,
  stockCount: spDealsLeft,
  note: (state) => [`Completed ${state.completed} / ${SPIDER_SETTINGS.runs}`, `${spDealsLeft(state)} deals left`],
}
