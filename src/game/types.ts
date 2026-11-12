import type { DailyProgress } from './dailyTasks'
import type { SpellitaireKey } from './solitaire/keys'

export type NeedKey = 'hunger' | 'happiness' | 'energy' | 'cleanliness'

export type { DailyProgress }

export type TraitSlot =
  | 'Age'
  | 'Body'
  | 'Bodygear'
  | 'Earring'
  | 'Eyes'
  | 'Headgear'
  | 'Mane'
  | 'Mouth'

export type CubTraits = Partial<Record<TraitSlot, string>>

export type OutfitTraits = {
  Body: string
  Bodygear: string
  Earring: string
  Eyes: string
  Headgear: string
  Mane: string
  Mouth: string
}

export type CubOutfits = {
  old: OutfitTraits
  young: OutfitTraits
}

/** Whole-cub looks an admin allows for selected players. Must match special_characters in supabase/special-characters.sql. */
export const SPECIAL_CHARACTER_IDS = ['pharaoh'] as const
export type SpecialCharacterId = (typeof SPECIAL_CHARACTER_IDS)[number]

export function isSpecialCharacterId(value: unknown): value is SpecialCharacterId {
  return typeof value === 'string' && (SPECIAL_CHARACTER_IDS as readonly string[]).includes(value)
}

/** Guest cub for now. A later wallet build sets source to "nft" plus tokenId. */
export type CubAppearance = {
  source: 'guest' | 'nft'
  tokenId?: string
  portraitUrl?: string
  traits: CubTraits
}

export type CubPose = 'idle' | 'eat' | 'sleep' | 'wash' | 'happy' | 'sad' | 'react'

export type CareAction = 'feed' | 'sleep' | 'clean'

export type CubSave = {
  version: 1
  appearance: CubAppearance
  outfits: CubOutfits
  /** The special character this player chose to wear. Only drawn while the server still allows it. */
  specialCharacter: SpecialCharacterId | null
  /** In-game currency: Cub Cash. */
  cubCash: number
  /** Purchased wardrobe styles as `age:Category:Name` keys. */
  unlockedTraits: string[]
  hunger: number
  happiness: number
  energy: number
  cleanliness: number
  /** The cub stays asleep across closing the app, and energy recovers while this is true. */
  asleep: boolean
  /** Sleep time not yet worth a whole point of energy, carried so short naps still add up. */
  sleepCarryMs: number
  xp: number
  /** Cub Power bonus XP not yet worth a whole point, in hundredths (0-99). */
  xpBonusHundredths: number
  level: number
  lastVisit: number
  flightBest: number
  matchBest: number
  dojoBest: number
  archerBest: number
  hoopsBest: number
  bubbleBest: number
  riverBest: number
  baseballBest: number
  /** Spellitaire best on Easy (draw 1). */
  solitaireBest: number
  /** Spellitaire best on Hard (draw 3). The leaderboard adds every Spellitaire best together. */
  solitaireHardBest: number
  /** Spellitaire bests for the later modes, by leaderboard key such as 'solitaire-flipflop-hard'. */
  solitaireModeBests: Partial<Record<SpellitaireKey, number>>
  /** This leaderboard week's best in each game, by leaderboard key. Starts again each Monday (US Eastern). */
  weekBests: { week: string; scores: Partial<Record<string, number>> }
  /** Task scores for the current 24 hour round, which rewards have been claimed, and the board bonus. */
  daily: DailyProgress
  /** Matches DAILY_BOARD_RESET after a one-time board clear. */
  dailyBoardReset: number
  /** Matches WARDROBE_PURCHASE_RESET after a one-time purchase clear. */
  wardrobePurchaseReset: number
  /** Home Halloween theme. Stays lit across leaving and coming back. */
  halloween: boolean
}

export const NEED_KEYS: NeedKey[] = ['hunger', 'happiness', 'energy', 'cleanliness']

export const DEFAULT_OUTFIT: OutfitTraits = {
  Body: 'Standard',
  Bodygear: 'Nothing',
  Earring: 'Nothing',
  Eyes: 'Surprised',
  Headgear: 'Nothing',
  Mane: 'Brown',
  Mouth: 'Standard',
}

export const DEFAULT_OUTFITS: CubOutfits = {
  old: { ...DEFAULT_OUTFIT },
  young: { ...DEFAULT_OUTFIT },
}

export const GUEST_APPEARANCE: CubAppearance = {
  source: 'guest',
  traits: { Age: 'Young', Body: 'Gold' },
}
