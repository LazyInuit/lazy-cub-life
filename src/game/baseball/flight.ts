import { BALL, FIELD, FLIGHT, SCORE, type Quality, type Vec3 } from './config'

export type Flight = {
  pos: Vec3
  vel: Vec3
  t: number
  /** Ground distance from the plate where the ball first came down, once it has. */
  landedAt: number | null
  homeRun: boolean
  hitWall: boolean
  rolling: boolean
  done: boolean
}

export function startFlight(pos: Vec3, vel: Vec3): Flight {
  return {
    pos: { ...pos },
    vel: { ...vel },
    t: 0,
    landedAt: null,
    homeRun: false,
    hitWall: false,
    rolling: false,
    done: false,
  }
}

const STEP = 1 / 120

function substep(f: Flight, dt: number) {
  const r = BALL.radius
  const fence = Math.abs(FIELD.fenceZ)
  if (f.rolling) {
    const speed = Math.hypot(f.vel.x, f.vel.z)
    const next = Math.max(0, speed - FLIGHT.rollFriction * dt)
    const scale = speed > 0 ? next / speed : 0
    f.vel.x *= scale
    f.vel.z *= scale
    f.vel.y = 0
    f.pos.x += f.vel.x * dt
    f.pos.z += f.vel.z * dt
    f.pos.y = r
    if (next < 0.4) f.done = true
    return
  }
  const speed = Math.hypot(f.vel.x, f.vel.y, f.vel.z)
  const drag = FLIGHT.drag * speed
  f.vel.x -= f.vel.x * drag * dt
  f.vel.z -= f.vel.z * drag * dt
  f.vel.y -= (FLIGHT.gravity * (1 - FLIGHT.lift) + f.vel.y * drag) * dt
  const before = Math.hypot(f.pos.x, f.pos.z)
  f.pos.x += f.vel.x * dt
  f.pos.y += f.vel.y * dt
  f.pos.z += f.vel.z * dt
  const after = Math.hypot(f.pos.x, f.pos.z)
  if (!f.homeRun && !f.hitWall && before < fence && after >= fence) {
    if (f.pos.y > FIELD.fenceHeight) {
      f.homeRun = true
      f.landedAt ??= after
    } else {
      f.hitWall = true
      f.landedAt ??= after
      f.vel.x *= -0.3
      f.vel.z *= -0.3
    }
  }
  if (f.pos.y <= r && f.vel.y < 0) {
    if (f.landedAt === null) f.landedAt = after
    f.pos.y = r
    f.vel.y = -f.vel.y * FLIGHT.bounce
    f.vel.x *= 0.62
    f.vel.z *= 0.62
    if (f.vel.y < 1.2) f.rolling = true
  }
}

export function stepFlight(f: Flight, dt: number) {
  if (f.done) return
  let left = dt
  while (left > 1e-6 && !f.done) {
    const h = Math.min(STEP, left)
    substep(f, h)
    f.t += h
    left -= h
  }
  if (f.t >= FLIGHT.maxTime || (f.homeRun && f.t >= FLIGHT.homeRunTime)) f.done = true
}

export type HitKind = 'ground' | 'short' | 'deep' | 'homeRun'

export function hitKind(f: Flight): HitKind {
  if (f.homeRun) return 'homeRun'
  const d = f.landedAt ?? Math.hypot(f.pos.x, f.pos.z)
  if (d >= SCORE.deepFrom) return 'deep'
  if (d >= SCORE.shortFrom) return 'short'
  return 'ground'
}

/**
 * How far the hit carried: where it first came down, or for a home run, where it would land past
 * the fence (the flight stops being simulated once it is gone).
 */
export function carryDistance(f: Flight) {
  if (!f.homeRun) return f.landedAt ?? Math.hypot(f.pos.x, f.pos.z)
  const pos = { ...f.pos }
  const vel = { ...f.vel }
  for (let t = 0; t < 12 && (pos.y > BALL.radius || vel.y > 0); t += STEP) {
    const speed = Math.hypot(vel.x, vel.y, vel.z)
    const drag = FLIGHT.drag * speed
    vel.x -= vel.x * drag * STEP
    vel.z -= vel.z * drag * STEP
    vel.y -= (FLIGHT.gravity * (1 - FLIGHT.lift) + vel.y * drag) * STEP
    pos.x += vel.x * STEP
    pos.y += vel.y * STEP
    pos.z += vel.z * STEP
  }
  return Math.hypot(pos.x, pos.z)
}

export function hitPoints(kind: HitKind, quality: Quality, distance: number) {
  if (kind === 'homeRun') return quality === 'perfect' ? SCORE.perfectHomeRun : SCORE.homeRun
  if (kind === 'deep') return distance >= SCORE.deepFarFrom ? SCORE.deepFar : SCORE.deep
  if (kind === 'short') return SCORE.short
  return SCORE.ground
}

/** Runs a whole flight without rendering; used by checks. */
export function simulateFlight(pos: Vec3, vel: Vec3) {
  const f = startFlight(pos, vel)
  while (!f.done) stepFlight(f, 1 / 60)
  return f
}
