/** Bat looks. Radii are metres (cartoon-thick), positions along the bat are shares of its length from the knob. */

export type BatPaint = {
  base: string
  /** Darker streaks along the length, like wood grain. */
  grain?: boolean
  /** Colour from this share to the end, for two-tone bats. */
  barrel?: { from: number; color: string }
  bands?: { at: number; width: number; color: string }[]
  /** Spiral stripes over the whole bat. */
  stripes?: { color: string; count: number }
  knob?: string
  cap?: string
}

export type BatDesign = {
  id: string
  name: string
  length: number
  /** [radius, share] pairs from knob (share 0) to end cap (share 1). */
  profile: [number, number][]
  paint: BatPaint
  finish: { roughness: number; metalness: number; emissive: string; emissiveIntensity: number }
  /** Tape over the handle, between two shares. */
  grip: { color: string; from: number; to: number } | null
}

type Turn = {
  knob: number
  handle: number
  barrel: number
  /** Share where the handle starts to swell into the barrel. */
  taperFrom: number
  /** Share where the barrel reaches full width. */
  barrelFrom: number
  /** How rounded the end cap is (share of length). */
  cap?: number
}

/** A classic turned bat: knob, slim handle, smooth taper, barrel, rounded end. */
function turned({ knob, handle, barrel, taperFrom, barrelFrom, cap = 0.03 }: Turn): [number, number][] {
  const out: [number, number][] = [
    [0, 0],
    [knob, 0],
    [knob * 1.06, 0.012],
    [handle * 1.3, 0.032],
    [handle, 0.06],
    [handle, taperFrom],
  ]
  for (let i = 1; i < 8; i += 1) {
    const s = i / 8
    const e = s * s * (3 - 2 * s)
    out.push([handle + (barrel - handle) * e, taperFrom + (barrelFrom - taperFrom) * s])
  }
  out.push([barrel, barrelFrom], [barrel, 1 - cap], [barrel * 0.86, 1 - cap * 0.4], [barrel * 0.5, 1 - cap * 0.08], [0, 1])
  return out
}

const WOOD = { roughness: 0.42, metalness: 0.02, emissive: '#3a2210', emissiveIntensity: 0.22 }
const GLOSS = { roughness: 0.2, metalness: 0.1, emissive: '#101018', emissiveIntensity: 0.3 }

/** Every bat shares the classic turned shape. */
const LENGTH = 0.91
const SHAPE = turned({ knob: 0.031, handle: 0.016, barrel: 0.04, taperFrom: 0.34, barrelFrom: 0.72 })
const GRIP = { from: 0.04, to: 0.28 }

const scheme = (id: string, name: string, paint: BatPaint, grip: string, finish = WOOD): BatDesign => ({
  id,
  name,
  length: LENGTH,
  profile: SHAPE,
  paint,
  finish,
  grip: { color: grip, ...GRIP },
})

/** Ids are saved on the player's device; do not rename them. */
export const BAT_DESIGNS: BatDesign[] = [
  scheme('classic-ash', 'Classic Ash', { base: '#d29455', grain: true, bands: [{ at: 0.9, width: 0.03, color: '#1b1b24' }] }, '#2a2f4a'),
  scheme(
    'midnight-gold',
    'Midnight Gold',
    { base: '#1d1d25', bands: [{ at: 0.86, width: 0.025, color: '#e6b84a' }], knob: '#e6b84a', cap: '#e6b84a' },
    '#3a3a46',
    GLOSS,
  ),
  scheme(
    'silver-bolt',
    'Silver Bolt',
    {
      base: '#c9d1da',
      bands: [
        { at: 0.6, width: 0.025, color: '#d32f2f' },
        { at: 0.66, width: 0.012, color: '#d32f2f' },
      ],
      cap: '#30343c',
      knob: '#30343c',
    },
    '#1c1d22',
    { roughness: 0.22, metalness: 0.55, emissive: '#2a3038', emissiveIntensity: 0.35 },
  ),
  scheme(
    'sunset',
    'Sunset',
    {
      base: '#e2b47a',
      grain: true,
      barrel: { from: 0.5, color: '#e8731c' },
      bands: [
        { at: 0.8, width: 0.02, color: '#ffd23a' },
        { at: 0.86, width: 0.02, color: '#ffd23a' },
      ],
      cap: '#a83f0a',
    },
    '#5a2a10',
  ),
  scheme(
    'ocean-blue',
    'Ocean Blue',
    {
      base: '#1f5fc4',
      bands: [
        { at: 0.8, width: 0.02, color: '#ffffff' },
        { at: 0.86, width: 0.02, color: '#ffffff' },
      ],
      knob: '#ffffff',
      cap: '#ffffff',
    },
    '#f4f1ea',
    { ...GLOSS, emissive: '#0a1a40' },
  ),
  scheme(
    'bubblegum',
    'Bubblegum',
    { base: '#ff8cc6', bands: [{ at: 0.85, width: 0.03, color: '#ffffff' }], knob: '#8a3cc8', cap: '#8a3cc8' },
    '#8a3cc8',
    { roughness: 0.3, metalness: 0.02, emissive: '#401028', emissiveIntensity: 0.2 },
  ),
]

export const DEFAULT_BAT = BAT_DESIGNS[0]

export function batById(id: string | null | undefined) {
  return BAT_DESIGNS.find((design) => design.id === id) ?? DEFAULT_BAT
}

const BAT_KEY = 'lazy-cub-baseball-bat'

export function loadBatChoice() {
  try {
    return batById(localStorage.getItem(BAT_KEY))
  } catch {
    return DEFAULT_BAT
  }
}

export function saveBatChoice(id: string) {
  try {
    localStorage.setItem(BAT_KEY, id)
  } catch {
    // Private mode or storage full: the choice lasts for this visit only.
  }
}

const HAND_KEY = 'lazy-cub-baseball-hand'

export function loadLeftHanded() {
  try {
    return localStorage.getItem(HAND_KEY) === 'left'
  } catch {
    return false
  }
}

export function saveLeftHanded(left: boolean) {
  try {
    localStorage.setItem(HAND_KEY, left ? 'left' : 'right')
  } catch {
    // Private mode or storage full: the choice lasts for this visit only.
  }
}

/** Radius at a share of the bat's length. */
export function batRadiusAt(design: BatDesign, share: number) {
  const p = design.profile
  for (let i = 1; i < p.length; i += 1) {
    if (share <= p[i][1]) {
      const [r0, s0] = p[i - 1]
      const [r1, s1] = p[i]
      return s1 > s0 ? r0 + ((r1 - r0) * (share - s0)) / (s1 - s0) : r1
    }
  }
  return 0
}

export function batBarrelRadius(design: BatDesign) {
  return Math.max(...design.profile.map(([r]) => r))
}
