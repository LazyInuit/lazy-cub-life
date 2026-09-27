import {
  DIFFICULTY_SCORE,
  LIVES,
  MIN_PULL,
  MOVE_AXIS_SCORE,
  MOVE_FREE_SCORE,
  RING_BLUE,
  RING_GOLD,
  RING_RED,
  RING_WHITE,
  ROUND_SECONDS,
  TIME_BLUE,
  TIME_GOLD,
  TIME_RED,
  TIME_WHITE,
} from './config'
import { headAim } from './layout'
import type { ArcherRound, ArcherTarget } from './types'

export type AimOrigin = { x: number; y: number }

export function aimOrigin(w: number, h: number): AimOrigin {
  return headAim(w, h)
}

export function maxPull(w: number, h: number) {
  return Math.min(w, h) * 0.28
}

function fieldUnit(w: number, h: number) {
  return Math.min(w, h)
}

export function shotFromPull(w: number, h: number, dx: number, dy: number) {
  const dist = Math.hypot(dx, dy)
  const power = Math.min(1, Math.max(0, dist - MIN_PULL) / maxPull(w, h))
  const unit = fieldUnit(w, h)
  const speed = unit * (1.05 + power * 1.55)
  return {
    dist,
    power,
    vx: dist > 0 ? (-dx / dist) * speed : speed,
    vy: dist > 0 ? (-dy / dist) * speed : 0,
    gravity: unit * 2.55,
  }
}

/** Arrow spawn offset along flight direction, and tip length used for hits. */
export const ARROW_NOSE = 24
export const ARROW_TIP = 16
const AIM_DT = 1 / 60

function tipOf(x: number, y: number, vx: number, vy: number) {
  const speed = Math.hypot(vx, vy) || 1
  return {
    x: x + (vx / speed) * ARROW_TIP,
    y: y + (vy / speed) * ARROW_TIP,
  }
}

function spawnFromShot(ox: number, oy: number, vx: number, vy: number) {
  const speed = Math.hypot(vx, vy) || 1
  return {
    x: ox + (vx / speed) * ARROW_NOSE,
    y: oy + (vy / speed) * ARROW_NOSE,
    vx,
    vy,
  }
}

/**
 * Aim dots follow the tip path.
 * Length matches target distance: short for close targets, long for far ones.
 * Last hit-dot is the tip's closest approach — the same point the arrow flies to.
 */
export function aimDots(round: ArcherRound): { x: number; y: number }[] {
  if (!round.aiming) return []
  const origin = aimOrigin(round.w, round.h)
  const dx = round.pullX - origin.x
  const dy = round.pullY - origin.y
  const dist = Math.hypot(dx, dy)
  if (dist < 4) return []

  const target = round.target
  const toTarget = Math.hypot(target.x - origin.x, target.y - origin.y)
  const unit = Math.min(round.w, round.h)
  const near = unit * 0.32
  const far = unit * 0.95
  const rangeT = Math.max(0, Math.min(1, (toTarget - near) / Math.max(1, far - near)))
  const maxDots = Math.round(5 + rangeT * 11)
  const missBudget = toTarget * (0.92 + rangeT * 0.1)

  const pred = predictTipPath(round, origin.x, origin.y, dx, dy)
  const samples = pred.samples
  if (samples.length === 0) return []

  const spaced: { x: number; y: number }[] = []
  if (pred.hit && pred.bestTip && pred.bestIndex >= 0) {
    const end = { x: pred.bestTip.x, y: pred.bestTip.y }
    const before = samples.slice(0, pred.bestIndex + 1)
    const step = Math.max(1, Math.floor(before.length / Math.max(2, maxDots - 1)))
    for (let i = 0; i < before.length; i += step) {
      const p = before[i]
      if (Math.hypot(p.x - end.x, p.y - end.y) > 4) spaced.push(p)
    }
    spaced.push(end)
  } else {
    let run = 0
    let cut = samples.length
    for (let i = 1; i < samples.length; i++) {
      run += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y)
      if (run >= missBudget) {
        cut = i + 1
        break
      }
    }
    const slice = samples.slice(0, cut)
    const step = Math.max(1, Math.floor(slice.length / Math.max(1, maxDots)))
    for (let i = step - 1; i < slice.length; i += step) spaced.push(slice[i])
    if (spaced.length && spaced[spaced.length - 1] !== slice[slice.length - 1]) {
      spaced.push(slice[slice.length - 1])
    }
  }
  return spaced.slice(-maxDots)
}

type TipPredict = {
  samples: { x: number; y: number }[]
  bestDist: number
  bestTip: { x: number; y: number } | null
  bestIndex: number
  hit: boolean
}

/** Shared tip simulation for aim preview and release targeting. */
function predictTipPath(
  round: ArcherRound,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
): TipPredict {
  const shot = shotFromPull(round.w, round.h, dx, dy)
  let { x, y, vx, vy } = spawnFromShot(ox, oy, shot.vx, shot.vy)
  const g = shot.gravity
  const samples: { x: number; y: number }[] = []
  let bestDist = Number.POSITIVE_INFINITY
  let bestTip: { x: number; y: number } | null = null
  let bestIndex = -1
  let prevDist = Number.POSITIVE_INFINITY

  for (let i = 0; i < 280; i++) {
    vy += g * AIM_DT
    x += vx * AIM_DT
    y += vy * AIM_DT
    const tip = tipOf(x, y, vx, vy)
    samples.push(tip)

    const d = Math.hypot(tip.x - round.target.x, tip.y - round.target.y)
    if (round.respawn <= 0 && d < bestDist) {
      bestDist = d
      bestTip = tip
      bestIndex = samples.length - 1
    }
    if (i > 2 && d > prevDist + 0.2) break
    prevDist = d

    if (tip.x > round.w + 40 || tip.y > round.h + 40 || tip.x < -60 || tip.y < -80) break
  }

  return {
    samples,
    bestDist,
    bestTip,
    bestIndex,
    hit: round.respawn <= 0 && !!bestTip && bestDist <= round.target.r,
  }
}

/** Playfield box the target may spawn in and bounce within. */
function targetBounds(round: ArcherRound) {
  const free = round.score >= MOVE_FREE_SCORE
  const t = Math.min(1, round.score / DIFFICULTY_SCORE)
  let left: number
  let right: number
  let top: number
  let bottom: number
  if (free) {
    left = round.w * 0.28
    right = round.w * 0.98
    top = round.h * 0.14
    bottom = round.h * 0.52
  } else {
    left = round.w * (0.48 + t * 0.02)
    right = round.w * (0.94 + t * 0.02)
    top = round.h * (0.2 + t * 0.03)
    bottom = round.h * (0.46 + t * 0.08)
  }
  // Extend 30% of current width further left.
  left -= (right - left) * 0.3
  // Extend 15% of current height further down.
  bottom += (bottom - top) * 0.15
  return { left, right, top, bottom }
}

function placeTarget(round: ArcherRound) {
  // Size/speed ramp with score; movement mode unlocks in stages.
  const t = Math.min(1, round.score / DIFFICULTY_SCORE)
  const base = Math.min(round.w, round.h)
  const r = Math.max(18, base * (0.11 - t * 0.045))
  const box = targetBounds(round)
  const xMin = box.left + r
  const xMax = box.right - r
  const yMin = box.top + r
  const yMax = box.bottom - r
  let x = xMin + Math.random() * Math.max(8, xMax - xMin)
  let y = yMin + Math.random() * Math.max(8, yMax - yMin)
  const prev = round.target
  if (prev && Math.hypot(x - prev.x, y - prev.y) < r * 1.4) {
    y = y < (yMin + yMax) / 2 ? yMax : yMin
  }

  const speed = 28 + t * 70
  let vx = 0
  let vy = 0
  if (round.score < MOVE_AXIS_SCORE) {
    // Stage 1: stationary
  } else if (round.score < MOVE_FREE_SCORE) {
    // Stage 2: left-right OR up-down only
    if (Math.random() < 0.5) {
      vx = (Math.random() < 0.5 ? -1 : 1) * speed
    } else {
      vy = (Math.random() < 0.5 ? -1 : 1) * speed
    }
  } else {
    // Stage 3: free roam — both axes, any direction
    const ang = Math.random() * Math.PI * 2
    const freeSpeed = speed * (1.05 + Math.random() * 0.25)
    vx = Math.cos(ang) * freeSpeed
    vy = Math.sin(ang) * freeSpeed
    // Avoid near-axis-only free motion so it feels distinct from stage 2
    if (Math.abs(vx) < freeSpeed * 0.28) vx = (vx < 0 ? -1 : 1) * freeSpeed * 0.35
    if (Math.abs(vy) < freeSpeed * 0.28) vy = (vy < 0 ? -1 : 1) * freeSpeed * 0.35
  }
  round.target = { x, y, r, vx, vy }
}

export function createRound(w: number, h: number): ArcherRound {
  const round: ArcherRound = {
    w,
    h,
    elapsed: 0,
    timeLeft: ROUND_SECONDS,
    lives: LIVES,
    score: 0,
    combo: 0,
    hits: 0,
    shots: 0,
    bullseyes: 0,
    target: { x: w * 0.7, y: h * 0.38, r: 48, vx: 0, vy: 0 },
    arrow: null,
    aiming: false,
    pullX: 0,
    pullY: 0,
    pops: [],
    bursts: [],
    flash: 0,
    bullFlash: 0,
    respawn: 0,
  }
  placeTarget(round)
  return round
}

export function resizeRound(round: ArcherRound, w: number, h: number) {
  const sx = w / Math.max(1, round.w)
  const sy = h / Math.max(1, round.h)
  round.target.x *= sx
  round.target.y *= sy
  round.target.r *= Math.min(sx, sy)
  round.target.vx *= sx
  round.target.vy *= sy
  if (round.arrow) {
    round.arrow.x *= sx
    round.arrow.y *= sy
  }
  round.w = w
  round.h = h
}

export type Shot = {
  base: number
  bull: boolean
  missed: boolean
  ended: boolean
}

function ringPoints(target: ArcherTarget, x: number, y: number) {
  const d = Math.hypot(x - target.x, y - target.y)
  if (d > target.r) return 0
  // Zones match drawn rings (fractions of radius) so score tiers stay the same at any size.
  const redR = Math.max(5, target.r * 0.18)
  if (d <= redR) return RING_RED
  if (d <= target.r * 0.28) return RING_GOLD
  if (d <= target.r * 0.62) return RING_BLUE
  return RING_WHITE
}

function timeBonusForHit(points: number) {
  if (points === RING_RED) return TIME_RED
  if (points === RING_GOLD) return TIME_GOLD
  if (points === RING_BLUE) return TIME_BLUE
  if (points === RING_WHITE) return TIME_WHITE
  return 0
}

function bounceTarget(round: ArcherRound, dt: number) {
  const target = round.target
  if (!target.vx && !target.vy) return

  const { left, right, top, bottom } = targetBounds(round)

  target.x += target.vx * dt
  target.y += target.vy * dt

  if (target.x < left + target.r) {
    target.x = left + target.r
    target.vx = Math.abs(target.vx)
  } else if (target.x > right - target.r) {
    target.x = right - target.r
    target.vx = -Math.abs(target.vx)
  }
  if (target.y < top + target.r) {
    target.y = top + target.r
    target.vy = Math.abs(target.vy)
  } else if (target.y > bottom - target.r) {
    target.y = bottom - target.r
    target.vy = -Math.abs(target.vy)
  }
}

export function beginAim(round: ArcherRound, x: number, y: number) {
  if (round.arrow || round.lives <= 0 || round.timeLeft <= 0 || round.respawn > 0) return false
  const origin = aimOrigin(round.w, round.h)
  const reach = Math.min(round.w, round.h) * 0.42
  if (Math.hypot(x - origin.x, y - origin.y) > reach) return false
  round.aiming = true
  round.pullX = x
  round.pullY = y
  return true
}

export function moveAim(round: ArcherRound, x: number, y: number) {
  if (!round.aiming) return
  round.pullX = x
  round.pullY = y
}

export function releaseAim(round: ArcherRound): 'shot' | 'cancel' | 'idle' {
  if (!round.aiming) return 'idle'
  const origin = aimOrigin(round.w, round.h)
  const dx = round.pullX - origin.x
  const dy = round.pullY - origin.y
  const dist = Math.hypot(dx, dy)
  // Capture the last aim-line dot before clearing aim so the arrow flies to it.
  const dots = aimDots(round)
  round.aiming = false
  if (dist < MIN_PULL || round.arrow) return 'cancel'
  const shot = shotFromPull(round.w, round.h, dx, dy)
  const spawned = spawnFromShot(origin.x, origin.y, shot.vx, shot.vy)
  const pred = predictTipPath(round, origin.x, origin.y, dx, dy)
  const aim =
    dots[dots.length - 1] ??
    pred.bestTip ??
    pred.samples[pred.samples.length - 1] ?? {
      x: spawned.x + shot.vx * 0.1,
      y: spawned.y + shot.vy * 0.1,
    }
  round.arrow = {
    x: spawned.x,
    y: spawned.y,
    vx: spawned.vx,
    vy: spawned.vy,
    hit: false,
    aimX: aim.x,
    aimY: aim.y,
    aimDist: Number.POSITIVE_INFINITY,
    passedAim: false,
  }
  round.shots += 1
  return 'shot'
}

export function cancelAim(round: ArcherRound) {
  round.aiming = false
}

export function stepRound(round: ArcherRound, dt: number): Shot {
  const shot: Shot = { base: 0, bull: false, missed: false, ended: false }
  if (round.lives <= 0 || round.timeLeft <= 0) {
    shot.ended = true
    return shot
  }
  round.elapsed += dt
  if (round.shots > 0) {
    round.timeLeft = Math.max(0, round.timeLeft - dt)
  }
  round.flash = Math.max(0, round.flash - dt)
  round.bullFlash = Math.max(0, round.bullFlash - dt)
  for (const pop of round.pops) pop.life -= dt
  round.pops = round.pops.filter((pop) => pop.life > 0)
  for (const burst of round.bursts) burst.life -= dt
  round.bursts = round.bursts.filter((burst) => burst.life > 0)

  if (round.respawn > 0) {
    round.respawn -= dt
    if (round.respawn <= 0) placeTarget(round)
  } else if (!round.arrow) {
    // Keep the target still while an arrow is in flight so it matches the aim end.
    bounceTarget(round, dt)
  }

  const arrow = round.arrow
  if (arrow && !arrow.hit) {
    const g = fieldUnit(round.w, round.h) * 2.55
    const steps = Math.max(1, Math.ceil(dt / AIM_DT))
    const stepDt = dt / steps
    let tipX = arrow.x
    let tipY = arrow.y
    let reachedAim = false
    for (let i = 0; i < steps; i++) {
      arrow.vy += g * stepDt
      arrow.x += arrow.vx * stepDt
      arrow.y += arrow.vy * stepDt
      const tip = tipOf(arrow.x, arrow.y, arrow.vx, arrow.vy)
      tipX = tip.x
      tipY = tip.y
      if (arrow.passedAim) continue
      const dAim = Math.hypot(tip.x - arrow.aimX, tip.y - arrow.aimY)
      if (dAim < arrow.aimDist) {
        arrow.aimDist = dAim
      } else if (arrow.aimDist < Number.POSITIVE_INFINITY && dAim > arrow.aimDist + 0.35) {
        // Past the aim end — place tip on the last aim dot and resolve the shot.
        tipX = arrow.aimX
        tipY = arrow.aimY
        arrow.passedAim = true
        reachedAim = true
        break
      }
      if (dAim <= 3.5) {
        tipX = arrow.aimX
        tipY = arrow.aimY
        arrow.passedAim = true
        reachedAim = true
        break
      }
    }
    if (reachedAim) {
      const hitBase = round.respawn <= 0 ? ringPoints(round.target, tipX, tipY) : 0
      if (hitBase > 0) {
        arrow.hit = true
        round.score += hitBase
        round.hits += 1
        const bonus = timeBonusForHit(hitBase)
        if (bonus > 0) round.timeLeft += bonus
        if (hitBase === RING_RED) {
          round.bullseyes += 1
          // Same as Dojo golden fruit — restore one life, capped at max.
          if (round.lives < LIVES) {
            round.lives += 1
            round.pops.push({
              x: tipX,
              y: tipY - 28,
              text: '+1 LIFE',
              life: 1.0,
              bull: true,
            })
          }
        }
        round.pops.push({
          x: tipX,
          y: tipY,
          text: hitBase === RING_RED ? `BULL! +${hitBase}` : `+${hitBase}`,
          life: hitBase === RING_RED ? 1.15 : 0.85,
          bull: hitBase === RING_RED,
        })
        if (bonus > 0) {
          round.pops.push({
            x: tipX + 18,
            y: tipY + 22,
            text: `+${bonus}s`,
            life: 0.9,
            bull: hitBase === RING_RED,
          })
        }
        if (hitBase === RING_RED) {
          round.bursts.push({ x: tipX, y: tipY, life: 0.85, maxLife: 0.85 })
          round.flash = 0.2
          round.bullFlash = 0.55
        } else {
          round.flash = 0.12
        }
        round.respawn = 0.45
        round.arrow = null
        shot.base = hitBase
        shot.bull = hitBase === RING_RED
      }
      // Miss aim-end: keep flying so the arrow doesn't vanish mid-air.
    } else if (arrow.x > round.w + 40 || arrow.y > round.h + 30 || arrow.x < -80 || arrow.y < -120) {
      round.arrow = null
      round.lives = Math.max(0, round.lives - 1)
      shot.missed = true
      if (round.lives <= 0) shot.ended = true
    }
  }

  if (round.lives <= 0 || round.timeLeft <= 0) shot.ended = true
  return shot
}

export function pullPower(round: ArcherRound) {
  if (!round.aiming) return null
  const origin = aimOrigin(round.w, round.h)
  const dx = round.pullX - origin.x
  const dy = round.pullY - origin.y
  const dist = Math.hypot(dx, dy)
  if (dist < 4) return null
  const shot = shotFromPull(round.w, round.h, dx, dy)
  return {
    ox: origin.x,
    oy: origin.y,
    vx: shot.vx,
    vy: shot.vy,
    power: shot.power,
    dist,
    gravity: shot.gravity,
  }
}
