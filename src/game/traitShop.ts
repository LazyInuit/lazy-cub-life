import { STARTER_OUTFIT, TRAIT_CATEGORIES, type TraitCategory } from './cubTraits'
import type { CharacterAge } from './homeScene'
import type { CubOutfits, CubSave, OutfitTraits } from './types'

/** Stable id for a purchasable wardrobe style. */
export function traitKey(age: CharacterAge, category: TraitCategory, name: string) {
  return `${age}:${category}:${name}`
}

/**
 * Coin cost to unlock. `null` means free (always unlocked).
 * Starter looks stay free. Every other style costs 100 Cub Cash.
 */
export function traitPrice(_age: CharacterAge, category: TraitCategory, name: string): number | null {
  if (STARTER_OUTFIT[category] === name) return null
  return 100
}

export function isTraitFree(age: CharacterAge, category: TraitCategory, name: string) {
  if (STARTER_OUTFIT[category] === name) return true
  return traitPrice(age, category, name) === null
}

export function isTraitUnlocked(
  save: CubSave,
  age: CharacterAge,
  category: TraitCategory,
  name: string,
) {
  if (isTraitFree(age, category, name)) return true
  const key = traitKey(age, category, name)
  return save.unlockedTraits.includes(key)
}

/** Drop any locked styles so home never wears an unpurchased trait. */
export function sanitizeOwnedOutfit(save: CubSave, age: CharacterAge, outfit: OutfitTraits): OutfitTraits {
  const next = { ...outfit }
  for (const category of TRAIT_CATEGORIES) {
    if (!isTraitUnlocked(save, age, category, next[category])) {
      next[category] = STARTER_OUTFIT[category]
    }
  }
  return next
}

export function sanitizeOwnedOutfits(save: CubSave, outfits: CubOutfits): CubOutfits {
  return {
    old: sanitizeOwnedOutfit(save, 'old', outfits.old),
    young: sanitizeOwnedOutfit(save, 'young', outfits.young),
  }
}

export function starterUnlockedKeys(): string[] {
  const keys: string[] = []
  for (const age of ['old', 'young'] as const) {
    for (const category of Object.keys(STARTER_OUTFIT) as TraitCategory[]) {
      keys.push(traitKey(age, category, STARTER_OUTFIT[category]))
    }
  }
  return keys
}
