import { LAUNCH, WINDOWS, type Quality, type Vec3 } from './config'
import type { Flick } from './swing'

/** `error` is bat-at-contact time minus ball-at-plane time: negative is early, positive late. */
export function judgeTiming(error: number, windows = WINDOWS): Quality {
  const off = Math.abs(error)
  if (off <= windows.perfect) return 'perfect'
  if (off <= windows.good) return 'good'
  if (off <= windows.weak) return 'weak'
  return 'miss'
}

export type Launch = {
  velocity: Vec3
  speed: number
  /** Degrees above level. */
  angle: number
  /** Degrees; negative is the left side of the field (pulled). */
  spray: number
}

const rad = (deg: number) => (deg * Math.PI) / 180

export function launchFor(
  quality: Exclude<Quality, 'miss'>,
  error: number,
  flick: Flick,
  power: number,
  rng: () => number = Math.random,
  /** A left-hander pulls early hits to the right, so the timing spray flips. */
  leftHanded = false,
): Launch {
  const base = LAUNCH[quality]
  const length = Math.hypot(flick.dx, flick.dy) || 1
  const across = flick.dx / length
  const up = -flick.dy / length
  const lateness = Math.min(1, Math.max(-1, error / WINDOWS.weak))
  let angle = base.angle + LAUNCH.flickLift * up + (rng() * 2 - 1) * 2
  if (quality === 'weak') {
    angle = error > 0 ? LAUNCH.weakLateAngle + (rng() * 2 - 1) * 6 : -6 + rng() * 8
  }
  const spray = (leftHanded ? -1 : 1) * lateness * base.spray + LAUNCH.flickSpray * across
  const speed = base.speed * power
  const flat = speed * Math.cos(rad(angle))
  return {
    velocity: {
      x: flat * Math.sin(rad(spray)),
      y: speed * Math.sin(rad(angle)),
      z: -flat * Math.cos(rad(spray)),
    },
    speed,
    angle,
    spray,
  }
}
