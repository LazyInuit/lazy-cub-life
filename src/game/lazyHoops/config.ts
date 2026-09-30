import type { Vec3 } from './sim'

/** Flat XP. A normal basket is 0.5, a perfect basket is 1.5. */
export const HOOPS_XP_BASKET = 0.5
export const HOOPS_XP_PERFECT = 1.5

export const LIVES = 3
export const NORMAL_POINTS = 100
export const PERFECT_POINTS = 300
export const MATCH_SECONDS = 60
export const PERFECT_TIME = 5

/** World scale is metres. Values are arcade-forgiving, not regulation. */
export const GRAVITY = 11.2
export const BALL_RADIUS = 0.12
export const RIM_Y = 3.05
export const RIM_RADIUS = 0.8132 * 0.6
export const RIM_TUBE = 0.058 * 0.6
export const BACKBOARD_Z = -0.55 - 7.6 * 0.41
/** Rim centre. Closer to the board so the smaller ring still meets it. */
export const RIM_Z = BACKBOARD_Z + RIM_RADIUS + 0.0984
export const BACKBOARD_W = 1.83
export const BACKBOARD_H = 1.07
export const BACKBOARD_CENTER_Y = 3.58
export const FLOOR_BOUNCE = 0.62
export const FLOOR_FRICTION = 3.4
export const RIM_BOUNCE = 0.48
export const BOARD_BOUNCE = 0.58

/** Centre of the ball may be this far from the hoop centre and still count. */
export const OPENING = RIM_RADIUS - BALL_RADIUS * 0.42

export const SHOT_TIMEOUT = 4.2
/** Real seconds after a miss hits the floor before the camera moves on. */
export const MISS_REST = 1.2
export const MOVE_SECONDS = 0.9
export const HOLD_DISTANCE = 2.15
export const HOLD_Y = 1.58

/** Where the camera looks. Kept below the rim so the hoop sits high and the ball stays in frame. */
export function lookTarget(cam: Vec3): Vec3 {
  const dx = -cam.x
  const dz = RIM_Z - cam.z
  const len = Math.hypot(dx, dz) || 1
  const along = Math.min(len * 0.48, 2.6)
  return {
    x: cam.x + (dx / len) * along,
    y: 2.05,
    z: cam.z + (dz / len) * along,
  }
}

/** Pixels. A straight flick about this long, at SWIPE_SPEED_REF, is a make. */
export const SWIPE_LEN_REF = 168
export const SWIPE_SPEED_REF = 920
export const MIN_SWIPE_PX = 36
/** Full sideways aim, in metres at the hoop, before assist pulls it back. */
export const AIM_METERS = 0.95
export const FLIGHT_BASE = 0.7
export const FLIGHT_PER_M = 0.088

export type ShotSpot = {
  id: string
  tier: 1 | 2 | 3 | 4 | 5
  /** Ground distance from the hoop. */
  distance: number
  /** Radians. 0 is straight in front of the backboard. */
  angle: number
  height: number
}

export const SPOTS: ShotSpot[] = [
  { id: 'close', tier: 1, distance: 7.6, angle: 0, height: 2.35 },
  { id: 'medium', tier: 2, distance: 8.4, angle: 0, height: 2.4 },
  { id: 'long', tier: 3, distance: 9.8, angle: 0, height: 2.48 },
  { id: 'slight-left', tier: 2, distance: 7.8, angle: -0.28, height: 2.35 },
  { id: 'slight-right', tier: 2, distance: 7.8, angle: 0.28, height: 2.35 },
  { id: 'far-left', tier: 4, distance: 8.5, angle: -0.68, height: 2.2 },
  { id: 'far-right', tier: 4, distance: 8.5, angle: 0.68, height: 2.2 },
  { id: 'baseline-left', tier: 4, distance: 5.5, angle: -1.2, height: 2.05 },
  { id: 'baseline-right', tier: 4, distance: 5.5, angle: 1.2, height: 2.05 },
  { id: 'long-left', tier: 5, distance: 11, angle: -0.5, height: 2.35 },
  { id: 'long-right', tier: 5, distance: 11, angle: 0.5, height: 2.35 },
]

/** Score is below maxScore. Weights are relative and can be 0. */
export const DIFFICULTY_BANDS: { maxScore: number; weights: Record<number, number> }[] = [
  { maxScore: 2000, weights: { 1: 84, 2: 16, 3: 0, 4: 0, 5: 0 } },
  { maxScore: 4500, weights: { 1: 46, 2: 42, 3: 12, 4: 0, 5: 0 } },
  { maxScore: 7500, weights: { 1: 24, 2: 36, 3: 24, 4: 14, 5: 2 } },
  { maxScore: 11000, weights: { 1: 14, 2: 24, 3: 26, 4: 26, 5: 10 } },
  { maxScore: Infinity, weights: { 1: 8, 2: 14, 3: 20, 4: 32, 5: 26 } },
]

export function cameraForSpot(spot: ShotSpot): Vec3 {
  return {
    x: Math.sin(spot.angle) * spot.distance,
    y: spot.height,
    // Distances are from the rim, not world origin (hoop was shifted back).
    z: RIM_Z + Math.cos(spot.angle) * spot.distance,
  }
}

export function holdPoint(cam: Vec3): Vec3 {
  const gx = -cam.x
  const gz = RIM_Z - cam.z
  const gl = Math.hypot(gx, gz) || 1
  const dist = Math.min(HOLD_DISTANCE, gl * 0.46)
  return {
    x: cam.x + (gx / gl) * dist,
    y: HOLD_Y,
    z: cam.z + (gz / gl) * dist,
  }
}

/** 0 = raw aim, 1 = pulled fully toward the hoop. */
export function aimAssist(score: number) {
  if (score < 2000) return 0.5
  if (score < 4500) return 0.4
  if (score < 7500) return 0.28
  if (score < 11000) return 0.16
  return 0.08
}

export function pickSpot(score: number, previousId: string, rng: () => number = Math.random): ShotSpot {
  const band = DIFFICULTY_BANDS.find((entry) => score < entry.maxScore) ?? DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1]
  const eligible = SPOTS.filter((spot) => (band.weights[spot.tier] ?? 0) > 0)
  const varied = eligible.filter((spot) => spot.id !== previousId)
  const keptClose = varied.some((spot) => spot.tier === 1)
  const pool = keptClose || (band.weights[1] ?? 0) === 0 ? varied : eligible
  const list = pool.length > 0 ? pool : eligible
  const choices = list.length > 0 ? list : SPOTS
  let total = 0
  for (const spot of choices) total += band.weights[spot.tier] ?? 1
  let roll = rng() * total
  for (const spot of choices) {
    roll -= band.weights[spot.tier] ?? 1
    if (roll <= 0) return spot
  }
  return choices[0]
}

export function easeInOut(t: number) {
  const u = Math.min(1, Math.max(0, t))
  return u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2
}
