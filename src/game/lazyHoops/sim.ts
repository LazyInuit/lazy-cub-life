import {
  AIM_METERS,
  BALL_RADIUS,
  BOARD_BOUNCE,
  BACKBOARD_CENTER_Y,
  BACKBOARD_H,
  BACKBOARD_W,
  BACKBOARD_Z,
  FLIGHT_BASE,
  FLIGHT_PER_M,
  FLOOR_BOUNCE,
  FLOOR_FRICTION,
  GRAVITY,
  OPENING,
  RIM_BOUNCE,
  RIM_RADIUS,
  RIM_TUBE,
  RIM_Z,
  MISS_REST,
  RIM_Y,
  SHOT_TIMEOUT,
  SWIPE_LEN_REF,
  SWIPE_SPEED_REF,
  aimAssist,
} from './config'

export type Vec3 = { x: number; y: number; z: number }

export type Swipe = {
  /** Screen pixels, right is positive. */
  dx: number
  /** Screen pixels, up is positive. */
  dy: number
  /** Pixels per second along the swipe. */
  speed: number
}

export type Shot = {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  rimHit: boolean
  /** Set for one physics frame when the ball bounces off the rim. */
  rimPing: boolean
  boardHit: boolean
  /** Set for one physics frame when the ball strikes the backboard. */
  boardPing: boolean
  scored: boolean
  perfect: boolean
  announced: boolean
  age: number
  settled: number
}

export type ShotTick = {
  made: 'normal' | 'perfect' | null
  finished: boolean
  rim: boolean
  board: boolean
}

const BOARD_FACE_Z = BACKBOARD_Z + 0.02

export function createShot(pos: Vec3): Shot {
  return {
    x: pos.x,
    y: pos.y,
    z: pos.z,
    vx: 0,
    vy: 0,
    vz: 0,
    rimHit: false,
    rimPing: false,
    boardHit: false,
    boardPing: false,
    scored: false,
    perfect: false,
    announced: false,
    age: 0,
    settled: 0,
  }
}

export function launchVelocity(from: Vec3, swipe: Swipe, score: number): Vec3 {
  const assist = aimAssist(score)
  const aim = clamp(swipe.dx / Math.max(swipe.dy, 36), -1.15, 1.15) * (1 - assist)
  const len = Math.hypot(swipe.dx, swipe.dy)
  const speedNorm = swipe.speed / SWIPE_SPEED_REF
  const power = clamp((len / SWIPE_LEN_REF) * 0.62 + speedNorm * 0.38, 0.62, 1.42)

  const hx = -from.x
  const hz = RIM_Z - from.z
  const hl = Math.hypot(hx, hz) || 1
  const forwardX = hx / hl
  const forwardZ = hz / hl
  const rightX = forwardZ
  const rightZ = -forwardX

  const reach = clamp(1.02 + (power - 1) * 0.55, 0.64, 1.26)
  const side = aim * AIM_METERS
  const tx = from.x + forwardX * hl * reach + rightX * side
  const tz = from.z + forwardZ * hl * reach + rightZ * side
  const ty = RIM_Y + Math.max(0, reach - 1.1) * 2.2
  const t = (FLIGHT_BASE + hl * FLIGHT_PER_M) / clamp(power ** 0.55, 0.8, 1.22)

  return {
    x: (tx - from.x) / t,
    y: (ty - from.y + 0.5 * GRAVITY * t * t) / t,
    z: (tz - from.z) / t,
  }
}

export function stepShot(shot: Shot, dt: number): ShotTick {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
  const h = dt / steps
  let made: ShotTick['made'] = null
  for (let i = 0; i < steps; i += 1) integrate(shot, h)
  shot.age += dt
  if (shot.scored && !shot.announced) {
    shot.announced = true
    made = shot.perfect ? 'perfect' : 'normal'
  }
  if (!shot.scored && shot.y <= BALL_RADIUS + 0.04 && shot.settled <= 0) shot.settled = 1e-4
  if (!shot.scored && shot.settled > 0) shot.settled += dt
  const finished = shot.scored
    ? shot.age > 1.25 && (shot.y < BALL_RADIUS + 0.35 || shot.age > 2.35)
    : shot.settled > MISS_REST || shot.age > SHOT_TIMEOUT
  const rim = shot.rimPing
  const board = shot.boardPing
  shot.rimPing = false
  shot.boardPing = false
  return { made, finished, rim, board }
}

function integrate(shot: Shot, h: number) {
  const prevX = shot.x
  const prevY = shot.y
  const prevZ = shot.z
  const drag = Math.exp(-0.025 * h)
  shot.vx *= drag
  shot.vy = shot.vy * drag - GRAVITY * h
  shot.vz *= drag
  shot.x += shot.vx * h
  shot.y += shot.vy * h
  shot.z += shot.vz * h

  if (shot.y < BALL_RADIUS) {
    shot.y = BALL_RADIUS
    if (shot.vy < 0) shot.vy = -shot.vy * FLOOR_BOUNCE
    const friction = Math.exp(-FLOOR_FRICTION * h)
    shot.vx *= friction
    shot.vz *= friction
  }

  if (!shot.scored) collideBackboard(shot)
  if (!(shot.scored && shot.y < RIM_Y - 0.04)) collideRim(shot)

  if (!shot.scored && prevY > RIM_Y && shot.y <= RIM_Y && shot.vy < 0) {
    const span = prevY - shot.y
    const u = span > 1e-6 ? (prevY - RIM_Y) / span : 1
    const cx = prevX + (shot.x - prevX) * u
    const cz = prevZ + (shot.z - prevZ) * u
    if (Math.hypot(cx, cz - RIM_Z) <= OPENING) {
      shot.scored = true
      shot.perfect = !shot.rimHit && !shot.boardHit
    }
  }
}

function collideBackboard(shot: Shot) {
  const front = BOARD_FACE_Z
  if (shot.z - BALL_RADIUS > front || shot.z < front - 0.45) return
  const halfW = BACKBOARD_W / 2
  const halfH = BACKBOARD_H / 2
  if (Math.abs(shot.x) > halfW + BALL_RADIUS * 0.2) return
  if (shot.y < BACKBOARD_CENTER_Y - halfH - BALL_RADIUS * 0.15) return
  if (shot.y > BACKBOARD_CENTER_Y + halfH + BALL_RADIUS * 0.15) return
  if (shot.vz >= 0) return
  shot.boardHit = true
  shot.boardPing = true
  shot.z = front + BALL_RADIUS
  shot.vz = -shot.vz * BOARD_BOUNCE
  shot.vx *= 0.92
  shot.vy *= 0.92
}

function collideRim(shot: Shot) {
  const dz0 = shot.z - RIM_Z
  const horiz = Math.hypot(shot.x, dz0)
  const hx = horiz < 1e-5 ? 1 : shot.x / horiz
  const hz = horiz < 1e-5 ? 0 : dz0 / horiz
  const cx = hx * RIM_RADIUS
  const cy = RIM_Y
  const cz = RIM_Z + hz * RIM_RADIUS
  const dx = shot.x - cx
  const dy = shot.y - cy
  const dz = shot.z - cz
  const dist = Math.hypot(dx, dy, dz)
  const min = BALL_RADIUS + RIM_TUBE
  if (dist >= min || dist < 1e-6) return
  const nx = dx / dist
  const ny = dy / dist
  const nz = dz / dist
  const pen = min - dist
  shot.x += nx * pen
  shot.y += ny * pen
  shot.z += nz * pen
  const vn = shot.vx * nx + shot.vy * ny + shot.vz * nz
  if (vn < 0) {
    const bounce = 1 + RIM_BOUNCE
    shot.vx -= bounce * vn * nx
    shot.vy -= bounce * vn * ny
    shot.vz -= bounce * vn * nz
    if (!shot.scored && vn < -0.6) shot.rimPing = true
  }
  if (!shot.scored) shot.rimHit = true
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
