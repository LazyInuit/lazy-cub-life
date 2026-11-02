/** Pyramid on the shared table: seven overlapping rows, with the stock, waste and removed cards below. */
import {
  PY_DISCARD,
  PYRAMID_PILES,
  PYRAMID_SETTINGS,
  pyCanMove,
  pyCanPickUp,
  pyCanRecycle,
  pyCovered,
  pyPileCards,
  pyramidSpot,
  pyTapMove,
  type PyramidState,
} from './pyramid'
import { tableCardWidth, type TableLayout, type TableRules, type TableSpot } from './table'
import { SOLITAIRE_LAYOUT as L } from './theme'

const PAD = 4
const ROWS = PYRAMID_SETTINGS.rows
/** Each row sits this far below the one above, as a share of card height, squeezed on short screens. */
const ROW_STEP = 0.5
const MIN_ROW_STEP = 0.32
/** Bottom row spots, in pyramid-row columns. */
const STOCK_COL = 0
const WASTE_COL = 1
const DISCARD_COL = ROWS - 1

function layout(state: PyramidState, boxW: number, boxH: number): TableLayout {
  const width = Math.min(boxW, L.maxBoardWidth)
  const cardW = tableCardWidth(width, ROWS, PAD, L.columnGap)
  const cardH = cardW * L.cardAspect
  const pitch = cardW * (1 + L.columnGap)
  const left = (boxW - width) / 2 + PAD
  const gapBelow = cardW * 0.28
  const fit = (boxH - 2 * cardH - gapBelow) / (ROWS - 1)
  const step = Math.max(cardH * MIN_ROW_STEP, Math.min(cardH * ROW_STEP, fit))
  const spots = new Map<string, TableSpot>()
  const piles = {} as TableLayout['piles']

  PYRAMID_PILES.forEach((pile, i) => {
    const { row, col } = pyramidSpot(i)
    const x = left + ((ROWS - 1 - row) * pitch) / 2 + col * pitch
    const y = row * step
    piles[pile] = { x, y, w: cardW, h: cardH, dropY: y }
    const card = state.pyramid[i]
    if (card) spots.set(card.id, { x, y, z: 10 + row * 10 + col, pile, index: 0 })
  })

  const bottomY = (ROWS - 1) * step + cardH + gapBelow
  const place = (pile: string, col: number, zBase: number) => {
    const x = left + col * pitch
    piles[pile] = { x, y: bottomY, w: cardW, h: cardH, dropY: bottomY }
    pyPileCards(state, pile).forEach((card, index) => spots.set(card.id, { x, y: bottomY, z: zBase + index, pile, index }))
  }
  place('stock', STOCK_COL, 100)
  place('waste', WASTE_COL, 150)
  // Removed cards fly over everything to land here.
  place(PY_DISCARD, DISCARD_COL, 300)

  return { width, cardW, cardH, spots, piles }
}

export const PYRAMID_TABLE: TableRules<PyramidState> = {
  pileCards: pyPileCards,
  allCards: (state) => [
    ...state.pyramid.filter((card): card is NonNullable<typeof card> => card !== null),
    ...state.stock,
    ...state.waste,
    ...state.foundations.flat(),
  ],
  canPickUp: pyCanPickUp,
  canMove: pyCanMove,
  foundationFor: () => null,
  layout,
  slots: (state) => [
    {
      pile: 'stock',
      art: pyCanRecycle(state) ? 'slotStock' : 'slotStockEmpty',
      placeholder: pyCanRecycle(state) ? 'sol-slot-ph recycle' : 'sol-slot-ph',
    },
    { pile: 'waste', art: 'slotWaste', placeholder: 'sol-slot-ph' },
    { pile: PY_DISCARD, art: 'slotWaste', placeholder: 'sol-slot-ph' },
  ],
  stock: 'stock',
  foundations: [PY_DISCARD],
  columns: [],
  dropTargets: [...PYRAMID_PILES, 'waste', PY_DISCARD],
  tapMove: pyTapMove,
  dimmed: (state, pile) => pyCovered(state, pile),
  // The cards without a number on them, so pairs to 13 are easier to spot.
  cardValue: (card) => (card.rank === 1 || card.rank >= 11 ? String(card.rank) : null),
  tapFeedback: true,
}
