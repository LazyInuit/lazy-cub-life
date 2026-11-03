/** FreeCell on the shared table: four free cells and four foundations across the top, eight columns below. */
import {
  FC_CELLS,
  FC_FOUNDATIONS,
  FC_TABLEAU,
  fcBlockedPickUp,
  fcCanMove,
  fcCanPickUp,
  fcFoundationFor,
  fcPileCards,
  fcTapMove,
  type FreecellState,
} from './freecell'
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
const TOP_ROW = [...FC_CELLS, ...FC_FOUNDATIONS] as const

/**
 * Landscape: the eight columns get the full height, with the free cells in a square on their left and
 * the foundations in a square on their right, so the cards are as big as the screen allows.
 */
function layoutWide(state: FreecellState, boxW: number, boxH: number): TableLayout {
  const square = (piles: readonly string[]) => piles.map((pile, i) => ({ pile, col: i % 2, row: Math.floor(i / 2) }))
  const deepest = deepestColumn(state.tableau, L.wideMinFaceUpOverlap, L.wideMinFaceUpOverlap)
  const blocks = sideBlocks(boxW, boxH, FC_TABLEAU.length, square(FC_CELLS), square(FC_FOUNDATIONS), Math.max(2.7, deepest), L.cardAspect, PAD)
  const { cardW, cardH, colX } = blocks
  const tableauTop = 0
  const spots = new Map<string, TableSpot>()
  const piles = {} as TableLayout['piles']

  TOP_ROW.forEach((pile) => {
    const at = blocks.place.get(pile) ?? { x: 0, y: 0 }
    piles[pile] = { x: at.x, y: at.y, w: cardW, h: cardH, dropY: at.y }
    fcPileCards(state, pile).forEach((card, index) => spots.set(card.id, { x: at.x, y: at.y, z: index + 1, pile, index }))
  })

  const room = Math.max(cardH * 0.5, boxH - cardH - 2)
  const overlap = {
    faceDown: L.faceUpOverlap,
    faceUp: L.faceUpOverlap,
    minFaceDown: L.wideMinFaceUpOverlap,
    minFaceUp: L.wideMinFaceUpOverlap,
  }
  FC_TABLEAU.forEach((pile, col) => {
    const x = colX(col)
    const bottom = fanColumnWide(fcPileCards(state, pile), x, tableauTop, room, cardH, overlap, pile, spots)
    piles[pile] = { x, y: tableauTop, w: cardW, h: bottom - tableauTop + cardH, dropY: bottom }
  })

  return { width: blocks.width, cardW, cardH, spots, piles }
}

function layout(state: FreecellState, boxW: number, boxH: number): TableLayout {
  if (wideTable(boxW, boxH)) return layoutWide(state, boxW, boxH)
  const width = Math.min(boxW, L.maxBoardWidth)
  const cardW = tableCardWidth(width, FC_TABLEAU.length, PAD, L.columnGap)
  const cardH = cardW * L.cardAspect
  const gap = cardW * L.columnGap
  const colX = (col: number) => (boxW - width) / 2 + PAD + col * (cardW + gap)
  const tableauTop = cardH + cardW * 0.28
  const spots = new Map<string, TableSpot>()
  const piles = {} as TableLayout['piles']

  TOP_ROW.forEach((pile, col) => {
    const x = colX(col)
    piles[pile] = { x, y: 0, w: cardW, h: cardH, dropY: 0 }
    fcPileCards(state, pile).forEach((card, index) => spots.set(card.id, { x, y: 0, z: index + 1, pile, index }))
  })

  const room = Math.max(cardH, boxH - tableauTop - cardH - 4)
  // Every card starts face up, so columns use the face-up spacing, squeezing as they grow.
  const overlap = {
    faceDown: L.faceUpOverlap,
    faceUp: L.faceUpOverlap,
    minFaceDown: L.minFaceUpOverlap,
    minFaceUp: L.minFaceUpOverlap,
  }
  FC_TABLEAU.forEach((pile, col) => {
    const x = colX(col)
    const bottom = fanColumn(fcPileCards(state, pile), x, tableauTop, room, cardH, overlap, pile, spots)
    piles[pile] = { x, y: tableauTop, w: cardW, h: bottom - tableauTop + cardH, dropY: bottom }
  })

  return { width, cardW, cardH, spots, piles }
}

export const FREECELL_TABLE: TableRules<FreecellState> = {
  pileCards: fcPileCards,
  allCards: (state) => [
    ...state.cells.filter((card): card is NonNullable<typeof card> => card !== null),
    ...state.foundations.flat(),
    ...state.tableau.flat(),
  ],
  canPickUp: fcCanPickUp,
  canMove: fcCanMove,
  foundationFor: fcFoundationFor,
  layout,
  slots: () => [
    ...FC_CELLS.map((pile) => ({ pile, art: 'slotWaste' as const, placeholder: 'sol-slot-ph cell' })),
    ...FC_FOUNDATIONS.map((pile) => ({ pile, art: 'slotFoundation' as const, placeholder: 'sol-slot-ph home' })),
    ...FC_TABLEAU.map((pile) => ({ pile, art: 'slotTableau' as const, placeholder: 'sol-slot-ph' })),
  ],
  // FreeCell has no stock: nothing is laid out here, so there is nothing to tap.
  stock: 'stock',
  foundations: FC_FOUNDATIONS,
  columns: FC_TABLEAU,
  dropTargets: [...FC_FOUNDATIONS, ...FC_CELLS, ...FC_TABLEAU],
  tapMove: fcTapMove,
  blockedPickUp: fcBlockedPickUp,
  tapFeedback: true,
}
