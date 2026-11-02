/**
 * Standard playing cards, shared by every solitaire variant. Nothing here knows any game's rules.
 */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13

export type Card = {
  /** Stable id such as "QH", used as a React key and for asset file names. */
  id: string
  suit: Suit
  rank: Rank
  faceUp: boolean
}

export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

const RANK_CODES: Record<Rank, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
}

const SUIT_CODES: Record<Suit, string> = { spades: 'S', hearts: 'H', diamonds: 'D', clubs: 'C' }

export const SUIT_SYMBOLS: Record<Suit, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }

export function rankLabel(rank: Rank) {
  return RANK_CODES[rank]
}

export function cardId(rank: Rank, suit: Suit) {
  return `${RANK_CODES[rank]}${SUIT_CODES[suit]}`
}

/** The artwork name for a card ("QH"), the same for every copy when a deck holds duplicates. */
export function cardArtId(card: Pick<Card, 'rank' | 'suit'>) {
  return cardId(card.rank, card.suit)
}

/**
 * 52 cards using only some suits, repeated so every rank still appears four times. Copies get ids
 * like "QH~2" so each card stays unique on the table.
 */
export function makeSuitDeck(suits: readonly Suit[]): Card[] {
  return makeCopies(suits, Math.max(1, Math.round(SUITS.length / suits.length)))
}

/** `copies` of every rank in each suit given, such as 8 sets of spades for one-suit Spider. Ids stay unique. */
export function makeCopies(suits: readonly Suit[], copies: number): Card[] {
  const deck: Card[] = []
  for (let copy = 0; copy < copies; copy += 1) {
    for (const suit of suits) {
      for (const rank of RANKS) {
        const id = copy === 0 ? cardId(rank, suit) : `${cardId(rank, suit)}~${copy + 1}`
        deck.push({ id, suit, rank, faceUp: false })
      }
    }
  }
  return deck
}

export function isRed(suit: Suit) {
  return suit === 'hearts' || suit === 'diamonds'
}

export function cardName(card: Card) {
  const names: Record<number, string> = { 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' }
  return `${names[card.rank] ?? card.rank} of ${card.suit}`
}

/** All 52 cards, face down, in suit and rank order. */
export function makeDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ id: cardId(rank, suit), suit, rank, faceUp: false })
  }
  return deck
}

/** A small seeded random generator, so a deal can be replayed exactly with Restart. */
export function seededRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function newSeed() {
  return Math.floor(Math.random() * 0x7fffffff)
}
