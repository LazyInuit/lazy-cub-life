import { BAT, FLICK, type Vec3 } from './config'
import type { Calibration } from './layout'

/** The finger's motion at the moment the bat meets the ball. */
export type Flick = {
  dx: number
  dy: number
  /** Layout pixels per second. */
  speed: number
  power: number
  /** Seconds, same clock as the samples. */
  at: number
}

type Sample = { x: number; y: number; t: number }

/** Finger velocity over the last few samples. */
export function createMotionTracker(window = FLICK.window) {
  let samples: Sample[] = []
  return {
    reset(x: number, y: number, t: number) {
      samples = [{ x, y, t }]
    },
    push(x: number, y: number, t: number) {
      samples.push({ x, y, t })
      while (samples.length > 2 && t - samples[0].t > window) samples.shift()
    },
    motion(): Flick {
      const last = samples[samples.length - 1] ?? { x: 0, y: 0, t: 0 }
      const first = samples[0] ?? last
      const elapsed = last.t - first.t
      const dx = last.x - first.x
      const dy = last.y - first.y
      const speed = elapsed > 1 / 500 ? Math.hypot(dx, dy) / elapsed : 0
      return { dx, dy, speed, power: swipePower(speed), at: last.t }
    },
  }
}

export function swipePower(speed: number, settings = FLICK) {
  return Math.min(settings.maxPower, Math.max(settings.minPower, speed / settings.speedRef))
}

function normalise(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

export const REST_DIR = normalise(BAT.rest)

/** Fixed handle point and resting direction; a left-hander's bat is the mirror image, in the bottom-left. */
export function batRig(leftHanded: boolean): { hands: Vec3; rest: Vec3 } {
  if (!leftHanded) return { hands: BAT.hands, rest: REST_DIR }
  return {
    hands: { ...BAT.hands, x: -BAT.hands.x },
    rest: { ...REST_DIR, x: -REST_DIR.x },
  }
}

/** Unit ray from the camera through picture fractions (fx, fy). */
function viewRay(cam: Calibration, fx: number, fy: number): Vec3 {
  const sin = Math.sin(cam.pitch)
  const cos = Math.cos(cam.pitch)
  const right = ((fx - 0.5) * cam.aspect) / cam.focal
  const upward = (cam.centreY - fy) / cam.focal
  return normalise({ x: right, y: upward * cos - sin, z: -upward * sin - cos })
}

/**
 * Barrel direction that keeps the point `grab` metres up the bat under the finger, turning about
 * the fixed handle. Takes the solution reaching away from the camera, toward the pitch.
 */
export function aimBat(cam: Calibration, fx: number, fy: number, grab: number, hands: Vec3 = BAT.hands): Vec3 {
  const d = viewRay(cam, fx, fy)
  const m = { x: -hands.x, y: cam.height - hands.y, z: cam.distance - hands.z }
  const b = m.x * d.x + m.y * d.y + m.z * d.z
  const c = m.x * m.x + m.y * m.y + m.z * m.z - grab * grab
  const disc = b * b - c
  const s = disc >= 0 ? -b + Math.sqrt(disc) : -b
  const point = { x: d.x * s, y: cam.height + d.y * s, z: cam.distance + d.z * s }
  const dir = normalise({ x: point.x - hands.x, y: point.y - hands.y, z: point.z - hands.z })
  if (dir.y < BAT.minLift) return normalise({ x: dir.x, y: BAT.minLift, z: dir.z })
  return dir
}

type Pt = { x: number; y: number }

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * Screen-space test: did the bat, turning about `pivot` from tip `from` to tip `to`, pass over the
 * ball circle? Catches fast swipes that jump right over the ball between samples.
 */
export function sweptThrough(pivot: Pt, from: Pt, to: Pt, ball: Pt, radius: number) {
  const onSegment = (tip: Pt) => {
    const dx = tip.x - pivot.x
    const dy = tip.y - pivot.y
    const s = Math.min(1, Math.max(0, ((ball.x - pivot.x) * dx + (ball.y - pivot.y) * dy) / Math.max(1e-6, dx * dx + dy * dy)))
    return Math.hypot(ball.x - (pivot.x + dx * s), ball.y - (pivot.y + dy * s)) <= radius
  }
  if (onSegment(to)) return true
  const reach = Math.max(Math.hypot(from.x - pivot.x, from.y - pivot.y), Math.hypot(to.x - pivot.x, to.y - pivot.y))
  const dist = Math.hypot(ball.x - pivot.x, ball.y - pivot.y)
  if (dist > reach + radius || dist < reach * 0.15) return false
  const a = Math.atan2(from.y - pivot.y, from.x - pivot.x)
  const sweep = wrap(Math.atan2(to.y - pivot.y, to.x - pivot.x) - a)
  const toBall = wrap(Math.atan2(ball.y - pivot.y, ball.x - pivot.x) - a)
  return sweep !== 0 && Math.sign(toBall) === Math.sign(sweep) && Math.abs(toBall) <= Math.abs(sweep)
}

/** Turns `from` toward `to` by share `s` (0..1) along the great circle. */
export function slerpDir(from: Vec3, to: Vec3, s: number): Vec3 {
  const dot = Math.min(1, Math.max(-1, from.x * to.x + from.y * to.y + from.z * to.z))
  const angle = Math.acos(dot)
  if (angle < 1e-4) return to
  const sin = Math.sin(angle)
  const wa = Math.sin((1 - s) * angle) / sin
  const wb = Math.sin(s * angle) / sin
  return normalise({ x: from.x * wa + to.x * wb, y: from.y * wa + to.y * wb, z: from.z * wa + to.z * wb })
}
