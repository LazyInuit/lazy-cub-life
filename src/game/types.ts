export type NeedKey = 'hunger' | 'happiness' | 'energy' | 'cleanliness'

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
  hunger: number
  happiness: number
  energy: number
  cleanliness: number
  xp: number
  level: number
  lastVisit: number
  flightBest: number
  matchBest: number
  dojoBest: number
}

export const NEED_KEYS: NeedKey[] = ['hunger', 'happiness', 'energy', 'cleanliness']

export const GUEST_APPEARANCE: CubAppearance = {
  source: 'guest',
  traits: { Age: 'Young', Body: 'Gold' },
}
