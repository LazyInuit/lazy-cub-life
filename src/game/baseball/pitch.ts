import {
  ART,
  CHANGE_UP_AFTER_FAST,
  MIN_FLIGHT,
  MOUND_PITCHES,
  SLOW_ARC,
  BALL,
  CONTACT_Z,
  DIFFICULTY,
  FIELD,
  MACHINE,
  MACHINE_SPOTS,
  PITCH,
  SPOT_BANDS,
  SPOT_TIME_SHARE,
  STRIKE_ZONE,
  WINDOWS,
  type Difficulty,
  type MachineSpot,
  type Vec3,
} from './config'
import { calibrate, groundZAtRow, projectArt } from './layout'

export type MachineFrame = {
  width: number
  height: number
  /** Where the base touches the ground. */
  base: Vec3
  centre: Vec3
  chute: Vec3
  /** Radius of the ball painted in the machine picture, in metres. */
  ballRadius: number
}

let moundZ: number | null = null

/** World z of the painted mound centre. */
export function moundCentreZ() {
  moundZ ??= groundZAtRow(calibrate(), ART.moundY)
  return moundZ
}

/**
 * Ground point for a spot, placed so it appears at the spot's share across the picture.
 * Spots are laid out for a right-hander; for a left-hander they are mirrored, away from the bat.
 */
export function spotBase(spot: MachineSpot, mirrored = false): Vec3 {
  const cam = calibrate()
  const z = moundCentreZ() + spot.dz
  const depth = projectArt(cam, { x: 0, y: FIELD.groundY, z }).depth
  const across = mirrored ? 1 - spot.x : spot.x
  return { x: ((across - 0.5) * cam.aspect * depth) / cam.focal, y: FIELD.groundY, z }
}

export const MOUND_SPOT = MACHINE_SPOTS[0]

/** Machine picture placed with its base at `base` (the painted mound centre by default). */
export function machineFrame(base: Vec3 = spotBase(MOUND_SPOT)): MachineFrame {
  const width = MACHINE.width
  const height = width * MACHINE.aspect
  const bottom = base.y - (1 - MACHINE.baseFrac) * height
  return {
    width,
    height,
    base,
    centre: { x: base.x, y: bottom + height / 2, z: base.z },
    chute: {
      x: base.x + (MACHINE.ball.x - 0.5) * width,
      y: bottom + (1 - MACHINE.ball.y) * height,
      z: base.z + 0.05,
    },
    ballRadius: (MACHINE.ball.diameterFrac * width) / 2,
  }
}

export function difficultyFor(score: number): Difficulty {
  let row = DIFFICULTY[0]
  for (const entry of DIFFICULTY) if (score >= entry.score) row = entry
  return row
}

/** Perfect, Good and Weak timing windows at this score: they narrow at the top levels. */
export function timingWindows(score: number) {
  const scale = difficultyFor(score).windowScale ?? 1
  return { perfect: WINDOWS.perfect * scale, good: WINDOWS.good * scale, weak: WINDOWS.weak * scale }
}

/** Weighted by the score band, never the same spot twice running when there is another choice. */
export function pickSpot(score: number, previousId: string, rng: () => number = Math.random): MachineSpot {
  const band = SPOT_BANDS.find((entry) => score < entry.maxScore) ?? SPOT_BANDS[SPOT_BANDS.length - 1]
  const eligible = MACHINE_SPOTS.filter((spot) => (band.weights[spot.tier] ?? 0) > 0)
  const varied = eligible.filter((spot) => spot.id !== previousId)
  const choices = varied.length > 0 ? varied : eligible.length > 0 ? eligible : [MOUND_SPOT]
  let total = 0
  for (const spot of choices) total += band.weights[spot.tier] ?? 0
  let roll = rng() * total
  for (const spot of choices) {
    roll -= band.weights[spot.tier] ?? 0
    if (roll <= 0) return spot
  }
  return choices[choices.length - 1]
}

/** Spot for the game's `index`-th pitch (0-based): the mound to start, then a new spot every time. */
export function spotForPitch(index: number, score: number, previousId: string, rng: () => number = Math.random): MachineSpot {
  return index < MOUND_PITCHES ? MOUND_SPOT : pickSpot(score, previousId, rng)
}

export type PitchType = 'normal' | 'fast' | 'slow'

export type Pitch = {
  firedAt: number
  flightTime: number
  type: PitchType
  start: Vec3
  end: Vec3
  /** Sideways Bezier control point; equals the straight-line midpoint when there is no curve. */
  controlX: number
  arc: number
  /** Painted ball size at the chute, which the 3D ball starts from. */
  startRadius: number
}

export type PitchContext = {
  /** Where the machine's base is. */
  base?: Vec3
  /** The last pitch's type, so a change-up can follow a fastball. */
  previous?: PitchType
  /** Close-in spot: a change-up becomes likelier. */
  close?: boolean
}

export function makePitch(score: number, firedAt: number, rng: () => number = Math.random, context: PitchContext = {}): Pitch {
  const level = difficultyFor(score)
  const base = context.base ?? spotBase(MOUND_SPOT)
  const frame = machineFrame(base)
  const start = frame.chute
  const spread = (value: number) => value * (rng() * 2 - 1)
  const end: Vec3 = {
    x: spread(Math.min(level.spread, STRIKE_ZONE.halfWidth)),
    y: STRIKE_ZONE.centreY + spread(Math.min(level.heightSpread, STRIKE_ZONE.halfHeight)),
    z: CONTACT_Z,
  }
  const slowChance = level.slowChance * (context.previous === 'fast' || context.close ? CHANGE_UP_AFTER_FAST : 1)
  const roll = rng()
  const type: PitchType = roll < slowChance ? 'slow' : roll < slowChance + level.fastChance ? 'fast' : 'normal'
  const typeScale = type === 'slow' ? level.slowScale : type === 'fast' ? level.fastScale : 1
  const curving = level.curve[1] > 0 && rng() < level.curveChance
  const [minCurve, maxCurve] = level.curve
  const bend = curving ? (rng() < 0.5 ? -1 : 1) * (minCurve + (maxCurve - minCurve) * rng()) : 0
  const home = machineFrame().chute
  const distance = Math.hypot(start.x - end.x, start.z - end.z) / Math.hypot(home.x - end.x, home.z - end.z)
  const spotScale = 1 - SPOT_TIME_SHARE + SPOT_TIME_SHARE * distance
  return {
    firedAt,
    flightTime: Math.max(MIN_FLIGHT, level.flightTime * spotScale * typeScale * (1 + spread(level.speedJitter))),
    type,
    start,
    end,
    controlX: (start.x + end.x) / 2 + bend,
    arc: PITCH.arc * (type === 'slow' ? SLOW_ARC : 1),
    startRadius: frame.ballRadius,
  }
}
/** Game-clock time the ball crosses the contact plane. */
export function arrivalTime(pitch: Pitch) {
  return pitch.firedAt + pitch.flightTime
}

/** `t` is seconds since firing. Past the plane the ball carries on along its final direction. */
export function pitchPosition(pitch: Pitch, t: number): Vec3 {
  const u = t / pitch.flightTime
  const { start: a, end: b, controlX: c, arc } = pitch
  if (u <= 1) {
    const s = Math.max(0, u)
    const inv = 1 - s
    return {
      x: inv * inv * a.x + 2 * s * inv * c + s * s * b.x,
      y: a.y + (b.y - a.y) * s + arc * 4 * s * inv,
      z: a.z + (b.z - a.z) * s,
    }
  }
  const over = u - 1
  return {
    x: b.x + 2 * (b.x - c) * over,
    y: b.y + (b.y - a.y - 4 * arc) * over,
    z: b.z + (b.z - a.z) * over,
  }
}

/** Starts at the painted ball's size so the hand-off from the picture is seamless. */
export function pitchBallRadius(pitch: Pitch, t: number) {
  const s = Math.min(1, Math.max(0, t / pitch.flightTime / BALL.sizeBlend))
  const eased = s * s * (3 - 2 * s)
  return pitch.startRadius + (BALL.radius - pitch.startRadius) * eased
}

export function pitchPassed(pitch: Pitch, t: number) {
  return pitchPosition(pitch, t).z >= PITCH.passZ
}
