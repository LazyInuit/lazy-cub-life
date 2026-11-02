import type { CSSProperties } from 'react'
import { cardId, type Card, type Rank, type Suit } from '../../game/cards/deck'
import type { SpellMode } from '../../game/solitaire/keys'
import type { SolitaireAssetName } from '../../game/solitaire/theme'
import { CardFace } from './CardView'
import { SolAsset } from './SolAsset'

const ART: Record<SpellMode, SolitaireAssetName> = {
  classic: 'modeClassic',
  flipflop: 'modeFlipflop',
  pyramid: 'modePyramid',
  freecell: 'modeFreecell',
  spider: 'modeSpider',
  golf: 'modeGolf',
}

const S: Suit = 'spades'
const H: Suit = 'hearts'
const D: Suit = 'diamonds'
const C: Suit = 'clubs'

/** One card in a preview: where it sits (percent of the tile's width and height), and what shows. */
type Spot = { x: number; y: number; show: [Rank, Suit] | 'back' | 'slot' }

type Preview = { cardW: number; spots: Spot[] }

/** A column fanned down from y: face-down cards first, then face-up ones. */
function column(x: number, y: number, downs: number, ups: [Rank, Suit][], downStep = 6, upStep = 12): Spot[] {
  const spots: Spot[] = []
  for (let i = 0; i < downs; i += 1) spots.push({ x, y: y + i * downStep, show: 'back' })
  ups.forEach((card, i) => spots.push({ x, y: y + downs * downStep + i * upStep, show: card }))
  return spots
}

/** A small, recognisable picture of each mode's table, until its own artwork is added. */
const PREVIEWS: Record<SpellMode, Preview> = {
  classic: {
    cardW: 17,
    spots: [
      { x: 6, y: 6, show: 'back' },
      { x: 29, y: 6, show: [7, H] },
      { x: 75, y: 6, show: [1, S] },
      ...column(6, 46, 0, [[13, S]]),
      ...column(29, 46, 1, [[12, H]]),
      ...column(52, 46, 2, [[11, C]]),
      ...column(75, 46, 3, [[10, D]]),
    ],
  },
  flipflop: {
    cardW: 17,
    spots: [
      ...column(6, 8, 2, [[7, S], [8, H]], 6, 13),
      ...column(29, 8, 1, [[5, S], [6, S], [7, S]], 6, 13),
      ...column(52, 8, 3, [[12, H]], 6, 13),
      ...column(75, 8, 1, [[10, S], [11, H], [10, S]], 6, 13),
    ],
  },
  pyramid: {
    cardW: 15,
    spots: [
      { x: 42.5, y: 4, show: [13, S] },
      { x: 34.25, y: 19, show: [12, H] },
      { x: 50.75, y: 19, show: [1, S] },
      { x: 26, y: 34, show: [7, H] },
      { x: 42.5, y: 34, show: [6, S] },
      { x: 59, y: 34, show: [11, D] },
      { x: 17.75, y: 49, show: [2, C] },
      { x: 34.25, y: 49, show: [5, H] },
      { x: 50.75, y: 49, show: [8, S] },
      { x: 67.25, y: 49, show: [10, D] },
    ],
  },
  freecell: {
    cardW: 15,
    spots: [
      { x: 4, y: 5, show: [11, H] },
      { x: 20.2, y: 5, show: 'slot' },
      { x: 64.8, y: 5, show: [1, S] },
      { x: 81, y: 5, show: [2, H] },
      ...column(4, 45, 0, [[9, C], [8, H], [7, S]], 6, 10),
      ...column(20.2, 45, 0, [[13, D], [12, S]], 6, 10),
      ...column(36.4, 45, 0, [[6, H], [5, C], [4, D]], 6, 10),
      ...column(52.6, 45, 0, [[10, S], [9, H]], 6, 10),
      ...column(68.8, 45, 0, [[3, C], [12, H], [11, C]], 6, 10),
      ...column(85, 45, 0, [[7, D], [6, S]], 6, 10),
    ],
  },
  spider: {
    cardW: 15,
    spots: [
      { x: 4, y: 5, show: 'back' },
      { x: 81, y: 5, show: [13, S] },
      ...column(4, 40, 2, [[13, S], [12, S]], 5, 10),
      ...column(20.2, 40, 3, [[9, S]], 5, 10),
      ...column(36.4, 40, 1, [[11, S], [10, S], [9, S]], 5, 10),
      ...column(52.6, 40, 2, [[6, H], [5, H]], 5, 10),
      ...column(68.8, 40, 3, [[1, S]], 5, 10),
      ...column(85, 40, 1, [[8, H], [7, H], [6, H]], 5, 10),
    ],
  },
  golf: {
    cardW: 15,
    spots: [
      ...column(4, 5, 0, [[9, C], [13, H], [4, S]], 6, 11),
      ...column(20.2, 5, 0, [[2, D], [11, S], [7, H]], 6, 11),
      ...column(36.4, 5, 0, [[12, C], [5, H], [10, S]], 6, 11),
      ...column(52.6, 5, 0, [[3, S], [8, D], [1, H]], 6, 11),
      ...column(68.8, 5, 0, [[6, C], [12, H], [9, D]], 6, 11),
      ...column(85, 5, 0, [[4, H], [10, C], [5, S]], 6, 11),
      { x: 28, y: 62, show: 'back' },
      { x: 52, y: 62, show: [6, H] },
    ],
  },
}

function previewCard([rank, suit]: [Rank, Suit]): Card {
  return { id: cardId(rank, suit), rank, suit, faceUp: true }
}

/** A mode's picture on the choose-a-game screen: its artwork once added, else a preview of its table. */
export function ModeThumb({ mode }: { mode: SpellMode }) {
  const preview = PREVIEWS[mode]
  return (
    <span className="sol-mode-thumb" aria-hidden="true">
      <SolAsset
        name={ART[mode]}
        className="sol-mode-art"
        fallback={
          <span className="sol-mode-preview">
            {preview.spots.map((spot, i) => {
              const style = { left: `${spot.x}%`, top: `${spot.y}%`, width: `${preview.cardW}%`, zIndex: i } as CSSProperties
              if (spot.show === 'slot') return <span key={i} className="sol-mode-mini slot" style={style} />
              return (
                <span key={i} className="sol-mode-mini" style={style}>
                  <CardFace card={spot.show === 'back' ? { id: `back-${i}`, rank: 1, suit: S, faceUp: false } : previewCard(spot.show)} />
                </span>
              )
            })}
          </span>
        }
      />
    </span>
  )
}
