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
import { fanColumn, tableCardWidth, type TableLayout, type TableRules, type TableSpot } from './table'
import { SOLITAIRE_LAYOUT as L } from './theme'

const PAD = 3
/** Ten columns need tighter spacing than the other modes to keep the cards as big as possible. */
const COLUMN_GAP = 0.06

function layout(state: SpiderState, boxW: number, boxH: number): TableLayout {
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
