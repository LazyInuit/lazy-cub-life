import {
  BONUS,
  BOMB,
  COMBO,
  DIFFICULTY,
  FRUIT,
  FRUIT_LARGE,
  FRUIT_MEDIUM,
  FRUIT_SIZE_RAMP,
  FRUIT_SMALL,
  LIVES,
  PHYSICS,
  type FruitDef,
  type FruitId,
} from './config'
import { segmentHitsCircle } from './swipe'
import type { Body, EngineState, Half } from './types'

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function fruitById(id: FruitId): FruitDef {
  return FRUIT.find((f) => f.id === id) ?? FRUIT[0]
}

function pickFrom(ids: FruitId[]): FruitDef {
  return fruitById(ids[Math.floor(Math.random() * ids.length)])
}

/** Early game: big fruit only. Later: mix medium, then small. */
function pickFruit(score: number): FruitDef {
  const s = Math.max(0, score)
  const { mediumAt, smallAt, mediumWeightMax, smallWeightStart, smallWeightMax, smallPerScore } =
    FRUIT_SIZE_RAMP

  if (s < mediumAt) return pickFrom(FRUIT_LARGE)

  let smallW = 0
  let mediumW = 0
  if (s < smallAt) {
    const t = (s - mediumAt) / Math.max(1, smallAt - mediumAt)
    mediumW = mediumWeightMax * t
  } else {
    mediumW = mediumWeightMax
    smallW = Math.min(smallWeightMax, smallWeightStart + (s - smallAt) * smallPerScore)
  }

  const roll = Math.random()
  if (roll < smallW) return pickFrom(FRUIT_SMALL)
  if (roll < smallW + mediumW) return pickFrom(FRUIT_MEDIUM)
  return pickFrom(FRUIT_LARGE)
}

function speedForScore(score: number) {
  const s = Math.max(0, score)
  const breaks = DIFFICULTY.speedBreaks
  let prev = 0
  let next = breaks[0] ?? 200

  for (let i = 0; i < breaks.length; i += 1) {
    if (s < breaks[i]) {
      next = breaks[i]
      prev = i === 0 ? 0 : breaks[i - 1]
      break
    }
    if (i === breaks.length - 1) {
      const span = breaks[i] - (i > 0 ? breaks[i - 1] : 0)
      const past = s - breaks[i]
      const cycle = Math.floor(past / Math.max(1, span))
      prev = breaks[i] + cycle * span
      next = prev + span
    }
  }

  const t = Math.min(1, Math.max(0, (s - prev) / Math.max(1, next - prev)))
  return DIFFICULTY.startSpeed + (DIFFICULTY.maxSpeed - DIFFICULTY.startSpeed) * t
}

function intervalForScore(score: number) {
  const s = Math.max(0, score)
  if (s < DIFFICULTY.multiAt3) {
    return Math.max(
      DIFFICULTY.minIntervalPre3,
      DIFFICULTY.startInterval - s * DIFFICULTY.intervalPerScore,
    )
  }
  const past = s - DIFFICULTY.multiAt3
  return Math.max(
    DIFFICULTY.minIntervalAt3,
    DIFFICULTY.startIntervalAt3 - past * DIFFICULTY.intervalPerScoreAt3,
  )
}

function difficultyAt(score: number) {
  const s = Math.max(0, score)
  const interval = intervalForScore(s)
  const speed = speedForScore(s)
  let multi = 1
  if (s >= DIFFICULTY.multiAt3) multi = 3
  else if (s >= DIFFICULTY.multiAt2) multi = 2
  multi = Math.min(DIFFICULTY.maxMulti, multi)
  const bombChance = Math.min(
    DIFFICULTY.bombChanceMax,
    DIFFICULTY.bombChanceStart + s * DIFFICULTY.bombPerScore,
  )
  const bonusChance = Math.min(
    DIFFICULTY.bonusChanceMax,
    DIFFICULTY.bonusChanceStart + s * DIFFICULTY.bonusPerScore,
  )
  return { interval, speed, multi, bombChance, bonusChance }
}

export function createEngine(width: number, height: number): EngineState {
  return {
    phase: 'playing',
    endReason: null,
    score: 0,
    lives: LIVES,
    elapsed: 0,
    nextSpawn: 1.4,
    bodies: [],
    halves: [],
    particles: [],
    floats: [],
    trail: [],
    comboFlash: null,
    swipeSlices: 0,
    width,
    height,
    nextId: 1,
  }
}

function takeId(state: EngineState) {
  const id = state.nextId
  state.nextId += 1
  return id
}

function launchBody(state: EngineState, speed: number): Body {
  const roll = Math.random()
  const { bombChance, bonusChance } = difficultyAt(state.score)
  const x = rand(state.width * 0.22, state.width * 0.78)
  const y = state.height + 16
  // Keep slow pace; trim peak height ~10% without changing horizontal speed.
  const heightBoost = Math.sqrt(0.9) * (1 + Math.min(0.08, (speed - DIFFICULTY.startSpeed) * 0.12))
  const towardCenter = (state.width * 0.5 - x) * 0.35
  const vx = rand(-48, 48) * speed + towardCenter
  const vy = rand(-780, -700) * heightBoost
  const rot = rand(0, Math.PI * 2)
  const spin = rand(-2.5, 2.5)

  if (roll < bombChance) {
    return {
      id: takeId(state),
      kind: 'bomb',
      hazardId: 'bomb',
      x,
      y,
      vx,
      vy,
      rot,
      spin,
      radius: BOMB.radius,
      points: 0,
      color: BOMB.color,
      accent: BOMB.accent,
      scale: BOMB.scale,
      alive: true,
      costsLife: false,
    }
  }

  if (roll < bombChance + bonusChance) {
    const bonus = Math.random() < 0.45 ? BONUS.lazyCoin : BONUS.golden
    return {
      id: takeId(state),
      kind: 'bonus',
      bonusId: bonus.id,
      x,
      y,
      vx,
      vy,
      rot,
      spin,
      radius: bonus.radius,
      points: bonus.points,
      color: bonus.color,
      accent: bonus.accent,
      scale: bonus.scale,
      alive: true,
      costsLife: false,
    }
  }

  const fruit = pickFruit(state.score)
  return {
    id: takeId(state),
    kind: 'fruit',
    fruitId: fruit.id,
    x,
    y,
    vx,
    vy,
    rot,
    spin,
    radius: fruit.radius * fruit.scale,
    points: fruit.points,
    color: fruit.color,
    accent: fruit.accent,
    scale: fruit.scale,
    alive: true,
    costsLife: true,
  }
}

function spawnWave(state: EngineState) {
  const { multi, speed, interval } = difficultyAt(state.score)
  const count = Math.max(1, multi)
  for (let i = 0; i < count; i += 1) {
    state.bodies.push(launchBody(state, speed))
  }
  state.nextSpawn = state.elapsed + interval
}

function burst(state: EngineState, x: number, y: number, color: string, amount = 10) {
  for (let i = 0; i < amount; i += 1) {
    const a = rand(0, Math.PI * 2)
    const sp = rand(80, 320)
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: rand(0.25, 0.55),
      max: 0.55,
      color,
      size: rand(3, 7),
    })
  }
}

function floatAt(state: EngineState, x: number, y: number, text: string, color = '#fff8e8') {
  state.floats.push({ x, y, text, life: 0.9, max: 0.9, color })
}

function splitFruit(state: EngineState, body: Body) {
  const kick = PHYSICS.halfSeparate
  const mk = (side: 'left' | 'right'): Half => ({
    id: takeId(state),
    fruitId: body.fruitId,
    bonusId: body.bonusId,
    x: body.x + (side === 'left' ? -8 : 8),
    y: body.y,
    vx: body.vx + (side === 'left' ? -kick : kick),
    vy: body.vy + rand(-80, 40),
    rot: body.rot,
    spin: body.spin + (side === 'left' ? -3 : 3),
    radius: body.radius * 0.72,
    color: body.color,
    accent: body.accent,
    side,
    life: 1.4,
  })
  state.halves.push(mk('left'), mk('right'))
  burst(state, body.x, body.y, body.accent, 14)
}

function comboLabel(count: number): { label: string; bonus: number } | null {
  if (count >= COMBO.master.min) return { label: COMBO.master.label, bonus: COMBO.master.bonus }
  if (count >= COMBO.triple.min) return { label: COMBO.triple.label, bonus: COMBO.triple.bonus }
  if (count >= COMBO.double.min) return { label: COMBO.double.label, bonus: COMBO.double.bonus }
  return null
}

export type SliceResult = {
  sliced: number
  bomb: boolean
  points: number
  combo: string | null
}

export function beginSwipe(state: EngineState) {
  state.swipeSlices = 0
}

export function endSwipe(state: EngineState): SliceResult {
  const combo = comboLabel(state.swipeSlices)
  let points = 0
  if (combo) {
    points = combo.bonus
    state.score += combo.bonus
    state.comboFlash = { label: combo.label, life: 1.1 }
    floatAt(state, state.width * 0.5, state.height * 0.28, `+${combo.bonus}`, '#ffe066')
  }
  const sliced = state.swipeSlices
  state.swipeSlices = 0
  return { sliced, bomb: false, points, combo: combo?.label ?? null }
}

export function applySwipeSegment(
  state: EngineState,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): SliceResult {
  if (state.phase !== 'playing') return { sliced: 0, bomb: false, points: 0, combo: null }

  state.trail.push({ x: bx, y: by, life: 0.28 })
  let gained = 0
  let bomb = false
  let hits = 0

  for (const body of state.bodies) {
    if (!body.alive) continue
    if (!segmentHitsCircle(ax, ay, bx, by, body.x, body.y, body.radius * 1.05)) continue
    body.alive = false
    hits += 1

    if (body.kind === 'bomb') {
      bomb = true
      burst(state, body.x, body.y, '#fa5252', 28)
      burst(state, body.x, body.y, '#212529', 18)
      state.lives = Math.max(0, state.lives - 1)
      floatAt(state, body.x, body.y - 20, '-1 LIFE', '#ff6b6b')
      if (state.lives <= 0) {
        state.phase = 'ended'
        state.endReason = 'bomb'
      }
      break
    }

    state.swipeSlices += 1
    state.score += body.points
    gained += body.points
    floatAt(state, body.x, body.y - 20, `+${body.points}`)
    if (body.kind === 'bonus' && body.bonusId === 'golden' && state.lives < LIVES) {
      state.lives += 1
      floatAt(state, body.x, body.y - 44, '+1 LIFE', '#ffe066')
    }
    if (body.kind === 'fruit') splitFruit(state, body)
    else burst(state, body.x, body.y, body.color, 18)
  }

  return { sliced: hits, bomb, points: gained, combo: null }
}

export function stepEngine(state: EngineState, dt: number) {
  if (state.phase !== 'playing') {
    // Still animate leftovers briefly
  }

  state.elapsed += dt
  if (state.phase === 'playing' && state.elapsed >= state.nextSpawn) {
    spawnWave(state)
  }

  const g = PHYSICS.gravity
  const bottom = state.height + 80

  for (const body of state.bodies) {
    if (!body.alive) continue
    body.vy += g * dt
    body.x += body.vx * dt
    body.y += body.vy * dt
    body.rot += body.spin * dt
    if (body.y > bottom) {
      body.alive = false
      if (state.phase === 'playing' && body.costsLife) {
        state.lives -= 1
        if (state.lives <= 0) {
          state.lives = 0
          state.phase = 'ended'
          state.endReason = 'lives'
        }
      }
    }
  }

  state.bodies = state.bodies.filter((b) => b.alive || b.y < bottom + 40)

  for (const half of state.halves) {
    half.vy += g * dt
    half.x += half.vx * dt
    half.y += half.vy * dt
    half.rot += half.spin * dt
    half.life -= dt
  }
  state.halves = state.halves.filter((h) => h.life > 0 && h.y < bottom)

  for (const p of state.particles) {
    p.vy += g * 0.35 * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.life -= dt
  }
  state.particles = state.particles.filter((p) => p.life > 0)

  for (const f of state.floats) {
    f.y -= 40 * dt
    f.life -= dt
  }
  state.floats = state.floats.filter((f) => f.life > 0)

  for (const t of state.trail) t.life -= dt
  state.trail = state.trail.filter((t) => t.life > 0)

  if (state.comboFlash) {
    state.comboFlash.life -= dt
    if (state.comboFlash.life <= 0) state.comboFlash = null
  }
}

export function resizeEngine(state: EngineState, width: number, height: number) {
  state.width = width
  state.height = height
}
