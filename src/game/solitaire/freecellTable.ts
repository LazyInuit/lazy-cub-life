/** FreeCell on the shared table: four free cells and four foundations across the top, eight columns below. */
import {
  FC_CELLS,
  FC_FOUNDATIONS,
  FC_TABLEAU,
  fcCanMove,
  fcCanPickUp,
  fcFoundationFor,
  fcPileCards,
  fcTapMove,
  type FreecellState,
} from './freecell'
import { fanColumn, tableCardWidth, type TableLayout, type TableRules, type TableSpot } from './table'
import { SOLITAIRE_LAYOUT as L } from './theme'

const PAD = 4
const TOP_ROW = [...FC_CELLS, ...FC_FOUNDATIONS] as const

function layout(state: FreecellState, boxW: number, boxH: number): TableLayout {
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
  tapFeedback: true,
}
