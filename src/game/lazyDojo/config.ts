/** Tunable Lazy Dojo gameplay values — edit here, not in the engine. */

export type FruitId =
  | 'watermelon'
  | 'pineapple'
  | 'orange'
  | 'apple'
  | 'banana'
  | 'strawberry'
  | 'coconut'

export type BonusId = 'golden' | 'lazyCoin'
export type HazardId = 'bomb'

export type FruitDef = {
  id: FruitId
  label: string
  points: number
  radius: number
  scale: number
  color: string
  accent: string
}

export const FRUIT: FruitDef[] = [
  { id: 'watermelon', label: 'Watermelon', points: 20, radius: 38, scale: 1.15, color: '#2f9e44', accent: '#d9480f' },
  { id: 'pineapple', label: 'Pineapple', points: 20, radius: 51, scale: 1.05, color: '#f4a261', accent: '#2a9d8f' },
  { id: 'orange', label: 'Orange', points: 10, radius: 42, scale: 0.95, color: '#f76707', accent: '#fff3bf' },
  { id: 'apple', label: 'Apple', points: 10, radius: 40.5, scale: 0.92, color: '#e03131', accent: '#2b8a3e' },
  { id: 'banana', label: 'Banana', points: 10, radius: 52, scale: 0.9, color: '#fcc419', accent: '#e67700' },
  { id: 'strawberry', label: 'Strawberry', points: 10, radius: 44, scale: 0.82, color: '#c92a2a', accent: '#fff' },
  { id: 'coconut', label: 'Coconut', points: 15, radius: 45, scale: 1, color: '#795548', accent: '#efebe9' },
]

/** Size tiers for spawn ramp — big early, then mix in medium/small. */
export const FRUIT_LARGE: FruitId[] = ['watermelon', 'pineapple', 'coconut']
export const FRUIT_MEDIUM: FruitId[] = ['orange', 'apple', 'banana']
export const FRUIT_SMALL: FruitId[] = ['strawberry']

/**
 * Score thresholds for fruit size mix.
 * Before mediumAt → large only. After smallAt → full mix with rising small share.
 */
export const FRUIT_SIZE_RAMP = {
  mediumAt: 70,
  smallAt: 180,
  /** Chance weight for medium once unlocked (ramps toward this by smallAt). */
  mediumWeightMax: 0.45,
  /** Chance weight for small once unlocked (grows slowly after smallAt). */
  smallWeightStart: 0.12,
  smallWeightMax: 0.32,
  smallPerScore: 0.0004,
}

export const BONUS = {
  golden: { id: 'golden' as const, label: 'Golden Fruit', points: 50, radius: 30, scale: 1, color: '#ffe066', accent: '#fab005' },
  lazyCoin: { id: 'lazyCoin' as const, label: '$LAZY', points: 100, radius: 26, scale: 0.95, color: '#ffd43b', accent: '#e8590c' },
}

export const BOMB = {
  id: 'bomb' as const,
  label: 'Dojo Bomb',
  radius: 28,
  scale: 1,
  color: '#212529',
  accent: '#fa5252',
}

export const COMBO = {
  double: { min: 2, label: 'DOUBLE SLASH', bonus: 15 },
  triple: { min: 3, label: 'TRIPLE SLASH', bonus: 40 },
  master: { min: 4, label: 'MASTER SLASH', bonus: 80 },
}

export const LIVES = 3

export const PHYSICS = {
  gravity: 490,
  halfSeparate: 110,
}

/** Difficulty ramps with score — calm start, then faster as points climb. */
export const DIFFICULTY = {
  startInterval: 2.5,
  minInterval: 0.95,
  /** Seconds shaved off spawn wait per score point (before 3-fruit). */
  intervalPerScore: 0.00075,
  /** Floor while still on 1–2 fruit waves. */
  minIntervalPre3: 1.2,
  /** When 3-fruit unlocks, spawn pace resets then ramps slowly. */
  startIntervalAt3: 2.6,
  intervalPerScoreAt3: 0.00028,
  minIntervalAt3: 1.05,
  startSpeed: 0.21,
  maxSpeed: 0.65,
  /**
   * Speed sawtooth: ramp start→max within each band, then reset.
   * Bands: 0→200, 200→2000, 2000→6000, then repeat last span.
   */
  speedBreaks: [200, 2000, 6000],
  /** Wave size by score thresholds. */
  multiAt2: 200,
  multiAt3: 2000,
  maxMulti: 3,
  bombChanceStart: 0.008,
  bombChanceMax: 0.14,
  bombPerScore: 0.0003,
  bonusChanceStart: 0.025,
  bonusChanceMax: 0.12,
  bonusPerScore: 0.00025,
}

export const XP_PER_SCORE = 0.005
