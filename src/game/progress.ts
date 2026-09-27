import {
  DEFAULT_OUTFIT,
  GUEST_APPEARANCE,
  NEED_KEYS,
  type CareAction,
  type CubAppearance,
  type CubOutfits,
  type CubSave,
  type CubTraits,
  type NeedKey,
  type OutfitTraits,
  type TraitSlot,
} from './types'
import { sanitizeOwnedOutfits, starterUnlockedKeys } from './traitShop'

const DECAY_PER_MIN: Record<Exclude<NeedKey, 'energy'>, number> = {
  hunger: 1.35,
  happiness: 1.05,
  cleanliness: 0.6,
}

const ENERGY_REGEN = 10
const ENERGY_REGEN_MS = 10_000

/** Playing one round of a mini-game. High is good, so these are costs. */
export const PLAY_NEED_COST: Partial<Record<NeedKey, number>> = {
  hunger: -5,
  energy: -5,
  cleanliness: -5,
}

/** Longest drop from one absence, so a day away leaves the cub needy rather than empty. */
const MAX_AWAY_DROP: Record<NeedKey, number> = {
  hunger: 58,
  happiness: 50,
  energy: 42,
  cleanliness: 38,
}

const TRAIT_SLOTS: TraitSlot[] = [
  'Age',
  'Body',
  'Bodygear',
  'Earring',
  'Eyes',
  'Headgear',
  'Mane',
  'Mouth',
]

const OUTFIT_SLOTS: (keyof OutfitTraits)[] = [
  'Body',
  'Bodygear',
  'Earring',
  'Eyes',
  'Headgear',
  'Mane',
  'Mouth',
]

export function clampNeed(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function xpForNextLevel(level: number): number {
  return 60 + (level - 1) * 30
}

export function levelProgress(xp: number): { level: number; into: number; next: number } {
  let level = 1
  let spent = 0
  let next = xpForNextLevel(level)
  const safeXp = Math.max(0, Math.floor(xp))
  while (safeXp >= spent + next && level < 99) {
    spent += next
    level += 1
    next = xpForNextLevel(level)
  }
  return { level, into: safeXp - spent, next }
}

export function levelFromXp(xp: number): number {
  return levelProgress(xp).level
}

/** Each level slightly slows how fast needs fall, up to a 40% reduction. */
export function decayMultiplier(level: number): number {
  return 1 - Math.min(0.4, Math.max(0, level - 1) * 0.02)
}

/** Each level slightly raises mini-game XP. */
export function rewardMultiplier(level: number): number {
  return 1 + Math.max(0, level - 1) * 0.08
}

function withLevel(save: CubSave): CubSave {
  return { ...save, level: levelFromXp(save.xp) }
}

export function decaySave(save: CubSave, elapsedMs: number, capDrops: boolean): CubSave {
  const minutes = Math.max(0, elapsedMs) / 60000
  const mult = decayMultiplier(levelFromXp(save.xp))
  const next: CubSave = { ...save }
  for (const key of NEED_KEYS) {
    if (key === 'energy') continue
    const drop = DECAY_PER_MIN[key] * minutes * mult
    const applied = capDrops ? Math.min(drop, MAX_AWAY_DROP[key]) : drop
    next[key] = clampNeed(save[key] - applied)
  }
  return withLevel(next)
}

export function regenEnergy(save: CubSave, elapsedMs: number): CubSave {
  const steps = Math.floor(Math.max(0, elapsedMs) / ENERGY_REGEN_MS)
  if (steps <= 0) return save
  return { ...save, energy: clampNeed(save.energy + steps * ENERGY_REGEN) }
}

export function applyAbsence(save: CubSave, now = Date.now()): { save: CubSave; awayMs: number } {
  const awayMs = Math.max(0, now - save.lastVisit)
  const caught = regenEnergy(decaySave(save, awayMs, true), awayMs)
  return { save: { ...caught, lastVisit: now }, awayMs }
}

/** Pet XP still follows how much of the happiness bar the tap fills. */
export function xpForFilled(points: number): number {
  if (points <= 0) return 0
  return Math.round(points * 0.25)
}

/** Flat care XP. No player-level multiplier. Sleep pays nothing. */
const CARE_XP: Record<CareAction, number> = {
  feed: 1,
  sleep: 0,
  clean: 1,
}

const CARE_SPECS: Record<
  CareAction,
  { stat: NeedKey; amount: number; needs: Partial<Record<NeedKey, number>>; blockWhenFull: boolean }
> = {
  feed: { stat: 'hunger', amount: 20, blockWhenFull: true, needs: { hunger: 20, cleanliness: -4 } },
  sleep: { stat: 'energy', amount: 36, blockWhenFull: false, needs: { energy: 36, hunger: -8 } },
  clean: { stat: 'cleanliness', amount: 100, blockWhenFull: true, needs: { cleanliness: 100 } },
}

export function barIsFull(value: number): boolean {
  return Math.round(value) >= 100
}

export function filledBy(save: CubSave, action: CareAction): number {
  const spec = CARE_SPECS[action]
  if (barIsFull(save[spec.stat])) return 0
  return Math.max(0, Math.min(spec.amount, 100 - save[spec.stat]))
}

export function applyCare(save: CubSave, action: CareAction, now = Date.now()): CubSave | null {
  const spec = CARE_SPECS[action]
  const filled = filledBy(save, action)
  if (filled <= 0) return spec.blockWhenFull ? null : save
  const next: CubSave = { ...save, xp: save.xp + CARE_XP[action], lastVisit: now }
  for (const key of NEED_KEYS) {
    const delta = spec.needs[key] ?? 0
    next[key] = clampNeed(save[key] + delta)
  }
  return withLevel(next)
}

export const PET_MOOD_GAIN = 10

/** Mood from a finished mini-game. A score of 0 pays nothing. */
export function moodFromScore(score: number): Partial<Record<NeedKey, number>> {
  return score >= 1 ? { happiness: PET_MOOD_GAIN } : {}
}

export function applyPet(save: CubSave, now = Date.now()): CubSave | null {
  if (barIsFull(save.happiness)) return null
  const room = 100 - save.happiness
  if (room <= 0) return null
  return withLevel({
    ...save,
    happiness: clampNeed(save.happiness + PET_MOOD_GAIN),
    xp: save.xp + Math.max(1, xpForFilled(Math.min(1, room))),
    lastVisit: now,
  })
}

export function applyReward(
  save: CubSave,
  xpGained: number,
  needs: Partial<Record<NeedKey, number>>,
  now = Date.now(),
): CubSave {
  const next: CubSave = { ...save, xp: save.xp + Math.max(0, Math.round(xpGained)), lastVisit: now }
  for (const key of NEED_KEYS) {
    next[key] = clampNeed(save[key] + (needs[key] ?? 0))
  }
  return withLevel(next)
}

export function isNeedy(save: CubSave): boolean {
  return NEED_KEYS.some((key) => save[key] < 25)
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function sanitizeOutfit(value: unknown): OutfitTraits {
  const next = { ...DEFAULT_OUTFIT }
  if (!value || typeof value !== 'object') return next
  const raw = value as Partial<Record<string, unknown>>
  for (const slot of OUTFIT_SLOTS) {
    const trait = raw[slot]
    if (typeof trait === 'string' && trait.trim()) next[slot] = trait.trim()
  }
  return next
}

function sanitizeOutfits(value: unknown): CubOutfits {
  if (!value || typeof value !== 'object') return { old: { ...DEFAULT_OUTFIT }, young: { ...DEFAULT_OUTFIT } }
  const raw = value as Partial<CubOutfits>
  return {
    old: sanitizeOutfit(raw.old),
    young: sanitizeOutfit(raw.young),
  }
}

function sanitizeUnlockedTraits(value: unknown): string[] {
  const base = starterUnlockedKeys()
  if (!Array.isArray(value)) return base
  const extra = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return [...new Set([...base, ...extra])]
}

function sanitizeAppearance(value: unknown): CubAppearance {
  if (!value || typeof value !== 'object') return GUEST_APPEARANCE
  const raw = value as Partial<CubAppearance>
  const traits: CubTraits = {}
  if (raw.traits && typeof raw.traits === 'object') {
    for (const slot of TRAIT_SLOTS) {
      const trait = raw.traits[slot]
      if (typeof trait === 'string' && trait.trim()) traits[slot] = trait
    }
  }
  const source = raw.source === 'nft' ? 'nft' : 'guest'
  return {
    source,
    tokenId: typeof raw.tokenId === 'string' ? raw.tokenId : undefined,
    portraitUrl: typeof raw.portraitUrl === 'string' ? raw.portraitUrl : undefined,
    traits: Object.keys(traits).length > 0 ? traits : GUEST_APPEARANCE.traits,
  }
}

export function defaultSave(now = Date.now()): CubSave {
  return {
    version: 1,
    appearance: GUEST_APPEARANCE,
    outfits: {
      old: { ...DEFAULT_OUTFIT },
      young: { ...DEFAULT_OUTFIT },
    },
    /** Starter balance for testing wardrobe unlocks before earn loops exist. */
    cubCash: 10_000,
    unlockedTraits: starterUnlockedKeys(),
    hunger: 72,
    happiness: 68,
    energy: 70,
    cleanliness: 74,
    xp: 0,
    level: 1,
    lastVisit: now,
    flightBest: 0,
    matchBest: 0,
    dojoBest: 0,
    archerBest: 0,
  }
}

export function sanitizeSave(value: unknown, now = Date.now()): CubSave {
  if (!value || typeof value !== 'object') return defaultSave(now)
  const raw = value as Partial<CubSave>
  if (raw.version !== 1) return defaultSave(now)
  const base = defaultSave(now)
  const xp = Math.max(0, Math.floor(num(raw.xp, 0)))
  const hasCash = typeof raw.cubCash === 'number' && Number.isFinite(raw.cubCash)
  const unlockedTraits = sanitizeUnlockedTraits(raw.unlockedTraits)
  // Move earlier test seeds, including leftover 800 or 10,000,000 after purchases, onto the starter balance.
  const rawCash = hasCash ? Math.floor(raw.cubCash as number) : base.cubCash
  const starterSeeds = new Set([0, 100, 150, 200, 300, 400, 500, 600, 700, 800, 100_000, 10_000_000])
  const fromTestFortune = rawCash >= 1_000_000
  const cubCash = Math.max(0, starterSeeds.has(rawCash) || fromTestFortune ? base.cubCash : rawCash)
  const draft: CubSave = withLevel({
    version: 1,
    appearance: sanitizeAppearance(raw.appearance),
    outfits: sanitizeOutfits(raw.outfits),
    cubCash,
    unlockedTraits,
    hunger: clampNeed(num(raw.hunger, base.hunger)),
    happiness: clampNeed(num(raw.happiness, base.happiness)),
    energy: clampNeed(num(raw.energy, base.energy)),
    cleanliness: clampNeed(num(raw.cleanliness, base.cleanliness)),
    xp,
    level: 1,
    lastVisit: num(raw.lastVisit, now),
    flightBest: Math.max(0, Math.floor(num(raw.flightBest, 0))),
    matchBest: Math.max(0, Math.floor(num(raw.matchBest, 0))),
    dojoBest: Math.max(0, Math.floor(num(raw.dojoBest, 0))),
    archerBest: Math.max(0, Math.floor(num(raw.archerBest, 0))),
  })
  return { ...draft, outfits: sanitizeOwnedOutfits(draft, draft.outfits) }
}
