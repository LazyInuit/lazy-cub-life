import type { TraitCategory } from './cubTraits'

/**
 * How many Lazy Lions wear each wardrobe trait.
 * Snapshot of https://lazylionsnft.com/v1/agent?path=traits&collection=lions on 2026-10-10.
 * Nine signature lions are separate one-of-ones, so each category covers 9,991 lions.
 * Young and old in the game share these counts. Sponge is only on cubs, so it is not listed here.
 */
export const LION_TRAIT_COUNTS: Record<TraitCategory, Record<string, number>> = {
  "Body": {
    "Black": 686,
    "Brown": 720,
    "Galaxy": 320,
    "Grey": 689,
    "Lizard Blue": 497,
    "Pink": 300,
    "Red": 496,
    "Scratched Up": 184,
    "Spotted Leopard": 482,
    "Standard": 2860,
    "Tan": 696,
    "White": 377,
    "Zebra": 476,
    "Zombie": 700
  },
  "Mane": {
    "Black": 603,
    "Black And Gold": 176,
    "Black and Gold": 176,
    "Bloody": 194,
    "Blue": 208,
    "Brown": 752,
    "Double Tied Up + Top Knot - Black": 385,
    "Double Tied Up + Top Knot - Brown": 499,
    "Double Tied Up - Blue": 206,
    "Double Tied Up - Emerald": 213,
    "Double Tied Up - Fire": 180,
    "Double Tied Up - Ice": 184,
    "Double Tied Up - Orange": 216,
    "Double Tied Up - Purple": 190,
    "Double Tied Up - Rainbow": 200,
    "Double Tied Up - Red": 205,
    "Double Tied Up - White": 220,
    "Emerald": 206,
    "Fire": 213,
    "Ice": 207,
    "Orange": 323,
    "Purple": 288,
    "Rainbow": 281,
    "Red": 417,
    "Teal": 212,
    "Top Knot - Black": 477,
    "Top Knot - Blue": 182,
    "Top Knot - Brown": 584,
    "Top Knot - Fire": 208,
    "Top Knot - Green": 195,
    "Top Knot - Ice": 189,
    "Top Knot - Orange": 199,
    "Top Knot - Purple": 189,
    "Top Knot - Rainbow": 307,
    "Top Knot - Red": 274,
    "Top Knot - White": 217,
    "White": 192
  },
  "Eyes": {
    "3D Glasses": 307,
    "Angry": 1019,
    "Anime - Blue": 404,
    "Anime - Brown": 481,
    "BTC Eyes": 265,
    "Closed": 413,
    "Concerned": 483,
    "Dork Glasses": 396,
    "Evil": 97,
    "Eye Mask": 280,
    "Fake Glasses": 301,
    "Goofy Eyes": 312,
    "Money Eyes": 438,
    "Monocle": 311,
    "Raised Eyebrow": 353,
    "Sad": 489,
    "Shades": 608,
    "Sleepy": 985,
    "Stoner": 510,
    "Surprised": 774,
    "Water Goggles": 472,
    "Winking": 293
  },
  "Mouth": {
    "Big Smile": 808,
    "Biting Lip": 400,
    "Bloody Mouth": 303,
    "Bubble Gum": 407,
    "Cigar": 217,
    "Gargling": 294,
    "Gold Smile": 310,
    "Grin": 546,
    "Grin + Ciggy": 389,
    "Grin + J": 314,
    "Licking Nose": 304,
    "Meat": 179,
    "Money Mouth": 209,
    "Party Horn": 272,
    "Pipe": 316,
    "Roaring": 460,
    "Sad": 185,
    "Smirk": 330,
    "Smirk + J": 291,
    "Standard": 1500,
    "Surprised": 378,
    "Tongue Out": 337,
    "Tongue Out + Saliva": 304,
    "Whistle": 255,
    "Yawning": 298,
    "Yelling": 385
  },
  "Headgear": {
    "Black Cap": 368,
    "Bucket Hat": 493,
    "Bunny Ears": 388,
    "Crown": 106,
    "Halo": 501,
    "Horns": 498,
    "LAZY Hat": 252,
    "Nothing": 4164,
    "Party Hat": 102,
    "Pirate Hat": 397,
    "Police Hat": 394,
    "Safari Hat": 273,
    "Santa Hat": 193,
    "Sea Captain Hat": 308,
    "Sheriff Hat": 374,
    "Spinner Hat": 373,
    "Straw Beach Hat": 305,
    "Top Hat": 305,
    "Wizard Hat": 197
  },
  "Bodygear": {
    "Black Hoodie": 92,
    "Business Shirt": 509,
    "Chef Uniform": 487,
    "Coconut Bra": 302,
    "Ethereum Business Shirt": 496,
    "Ethereum Shirt": 508,
    "Floaties": 505,
    "Football Jersey - Blue": 516,
    "Football Jersey - Red": 478,
    "Gladiator Armour": 343,
    "Gold Chain": 501,
    "Hawaiian Shirt": 511,
    "Lab Coat": 507,
    "Lederhosen": 96,
    "Leopard Fur Coat": 95,
    "Lion Shirt": 443,
    "Nothing": 557,
    "Police Uniform": 497,
    "Purple Fur Coat": 517,
    "Ranger Shirt": 495,
    "Referee Shirt": 471,
    "Ripped Shirt - Black": 474,
    "Ripped Shirt - White": 490,
    "Space Suit": 101
  },
  "Earring": {
    "Dagger": 176,
    "Diamond Stud": 491,
    "Ethereum": 273,
    "Green Ball": 509,
    "Lion Head": 308,
    "Nothing": 7583,
    "Small Gold Hoop": 651
  }
}

/** Lions that have a trait in that category. */
export const LION_TRAIT_TOTALS: Record<TraitCategory, number> = {
  "Body": 9991,
  "Mane": 9991,
  "Eyes": 9991,
  "Mouth": 9991,
  "Headgear": 9991,
  "Bodygear": 9991,
  "Earring": 9991
}

/** Traits worn by at least this share of lions stay at 100 Cub Cash. */
export const COMMON_TRAIT_SHARE = 0.05

/** Set prices that sit above the rarity scale. */
const FIXED_COIN_PRICE: Partial<Record<TraitCategory, Record<string, number>>> = {
  Body: {
    Black: 150,
    Red: 150,
    'Lizard Blue': 200,
    Sponge: 200,
    'Spotted Leopard': 250,
    Zebra: 250,
    Zombie: 250,
    'Scratched Up': 350,
    Galaxy: 600,
  },
  Eyes: {
    '3D Glasses': 400,
    'BTC Eyes': 400,
    Evil: 600,
    'Money Eyes': 300,
    Shades: 300,
  },
  Headgear: {
    'Top Hat': 200,
    'Bucket Hat': 250,
    'Sheriff Hat': 300,
    'Straw Beach Hat': 300,
    Crown: 850,
    'LAZY Hat': 1000,
  },
  Bodygear: {
    'Hawaiian Shirt': 250,
    'Ranger Shirt': 250,
    'Coconut Bra': 250,
    'Football Jersey - Blue': 300,
    'Football Jersey - Red': 300,
    'Gold Chain': 300,
    'Gladiator Armour': 400,
  },
}

/** Rarer than 5% costs more, in steps of 50, scaled by how much rarer it is. */
export function rarityCoinPrice(category: TraitCategory, name: string): number {
  const fixed = FIXED_COIN_PRICE[category]?.[name]
  if (fixed != null) return fixed
  const count = LION_TRAIT_COUNTS[category]?.[name]
  const total = LION_TRAIT_TOTALS[category]
  let price = 100
  if (count && total) {
    const share = count / total
    if (share < COMMON_TRAIT_SHARE) {
      const scaled = 100 * (COMMON_TRAIT_SHARE / share)
      price = Math.max(100, Math.round(scaled / 50) * 50)
    }
  }
  if (category === 'Bodygear' && price === 100) return 150
  return price
}
