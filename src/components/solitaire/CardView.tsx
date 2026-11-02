import { useState, type CSSProperties } from 'react'
import { cardArtId, isRed, rankLabel, SUIT_SYMBOLS, type Card, type Suit } from '../../game/cards/deck'
import { cardFaceAsset, SOLITAIRE_LAYOUT, type SolitaireAssetName } from '../../game/solitaire/theme'
import { hasSolAsset, SolAsset } from './SolAsset'

const SUIT_ASSET: Record<Suit, SolitaireAssetName> = {
  spades: 'suitSpades',
  hearts: 'suitHearts',
  diamonds: 'suitDiamonds',
  clubs: 'suitClubs',
}

function SuitMark({ suit, className }: { suit: Suit; className: string }) {
  return (
    <SolAsset
      name={SUIT_ASSET[suit]}
      className={`${className} sol-suit-img`}
      fallback={<span className={className}>{SUIT_SYMBOLS[suit]}</span>}
    />
  )
}

const FACE_ART = hasSolAsset('cardFace')
const FACE_ART_STYLE = {
  '--sol-corner-x': `${SOLITAIRE_LAYOUT.faceArt.cornerX * 100}%`,
  '--sol-corner-y': `${SOLITAIRE_LAYOUT.faceArt.cornerY * 100}%`,
  '--sol-rank-size': SOLITAIRE_LAYOUT.faceArt.rankSize,
  '--sol-suit-size': SOLITAIRE_LAYOUT.faceArt.suitSize,
  '--sol-pip-size': SOLITAIRE_LAYOUT.faceArt.pipSize,
  '--sol-pip-y': `${SOLITAIRE_LAYOUT.faceArt.pipY * 100}%`,
} as CSSProperties

/** The drawn card front: rank and suits, on the card-face artwork when it has been added. */
function DrawnFace({ card }: { card: Card }) {
  const label = rankLabel(card.rank)
  const classes = ['sol-face']
  if (isRed(card.suit)) classes.push('red')
  if (FACE_ART) classes.push('art')
  return (
    <span className={classes.join(' ')} style={FACE_ART ? FACE_ART_STYLE : undefined}>
      <SolAsset name="cardFace" className="sol-face-bg" fallback={null} />
      <span className="sol-corner">
        <span className="sol-rank">{label}</span>
        <SuitMark suit={card.suit} className="sol-corner-suit" />
      </span>
      <SuitMark suit={card.suit} className="sol-pip" />
      <span className="sol-corner sol-corner-low" aria-hidden="true">
        <span className="sol-rank">{label}</span>
        <SuitMark suit={card.suit} className="sol-corner-suit" />
      </span>
    </span>
  )
}

/** One playing card, face up or face down. Shared by every solitaire variant. */
export function CardFace({ card }: { card: Card }) {
  const faceUrl = card.faceUp ? cardFaceAsset(cardArtId(card)) : null
  const [broken, setBroken] = useState(false)
  if (!card.faceUp) {
    return <SolAsset name="cardBack" className="sol-card-img" fallback={<span className="sol-back" />} />
  }
  if (faceUrl && !broken) {
    return <img className="sol-card-img" src={faceUrl} alt="" draggable={false} onError={() => setBroken(true)} />
  }
  return <DrawnFace card={card} />
}
