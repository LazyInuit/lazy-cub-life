import {
  AIM_FLOOR,
  BIG_CLEAR,
  BUBBLE_R,
  CASH_PER_COIN_BUBBLE,
  CEILING_DROP_SECONDS,
  CLEAR_BONUSES,
  CLUSTER_CHANCE,
  COLOURS,
  COMBO_MULTIPLIERS,
  DANGER_Y,
  FIELD_H,
  FIELD_W,
  GOLDEN_ROW_CHANCE,
  GUM_BLOW_SECONDS,
  HIT_DIST,
  LAUNCH_X,
  LAUNCH_Y,
  MATCH_MIN,
  MAX_GOLDEN,
  MEGA_BUTTON_R,
  MEGA_FILL,
  MEGA_RADIUS,
  MEGA_X,
  MEGA_Y,
  MIN_AIM_DEG,
  MISS_LIMITS,
  POINTS_BOARD_CLEAR,
  POINTS_DROP,
  POINTS_GOLDEN,
  POINTS_POP,
  ROW_DENSITY_MAX,
  ROW_DENSITY_PER_SUCCESS,
  ROW_DENSITY_START,
  ROW_H,
  SETTLE_SECONDS,
  SHOT_SPEED,
  SHOT_STEP,
  START_GOLDEN,
  START_ROWS,
} from './config'
import {
  DANGER_ROW,
  cellAt,
  cellX,
  cellY,
  colourGroup,
  countBubbles,
  emptyRow,
  lowestRow,
  nearestCell,
  neighbours,
  rowCols,
  trimGrid,
  unsupported,
  type Grid,
} from './grid'
import type { BubbleColour, BubbleKind, BubbleState, GridPos, ShotResult } from './types'

const MIN_AIM = (MIN_AIM_DEG * Math.PI) / 180
const DOT_GAP = 17
const TRACE_LENGTH = 1500
const TRACE_BOUNCES = 4

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
}

/** Misses in a row allowed before the ceiling drops, for a run this far along. */
export function missLimit(successfulShots: number) {
  return MISS_LIMITS.find((step) => successfulShots >= step.from)?.limit ?? MISS_LIMITS[MISS_LIMITS.length - 1].limit
}

export function comboMultiplier(combo: number) {
  if (combo <= 0) return 1
  return COMBO_MULTIPLIERS[Math.min(combo, COMBO_MULTIPLIERS.length) - 1]
}

export function clearBonus(cleared: number) {
  return CLEAR_BONUSES.find((step) => cleared >= step.at)?.bonus ?? 0
}

export function megaReady(state: BubbleState) {
  return state.megaMeter >= MEGA_FILL
}

function goldenCount(grid: Grid) {
  let total = 0
  for (const cells of grid) for (const cell of cells) if (cell?.kind === 'gold') total += 1
  return total
}

/** A colour for the queue, any of the five, whatever is left on the board. */
function queueColour(state: BubbleState): BubbleColour {
  return pick(COLOURS, state.rng)
}

/** Copy a nearby colour some of the time so the board forms clusters instead of lone bubbles. */
function clusteredColour(state: BubbleState, near: (BubbleKind | undefined)[]): BubbleColour {
  const options = near.filter((kind): kind is BubbleColour => !!kind && kind !== 'gold')
  if (options.length > 0 && state.rng() < CLUSTER_CHANCE) return pick(options, state.rng)
  return pick(COLOURS, state.rng)
}

/** Give most lone bubbles in these rows a neighbour's colour. */
function softenLoners(state: BubbleState, rows: number[]) {
  for (const row of rows) {
    state.grid[row]?.forEach((cell, col) => {
      if (!cell || cell.kind === 'gold') return
      const around = neighbours(row, col, state.parity)
        .map((pos) => cellAt(state.grid, pos.row, pos.col)?.kind)
        .filter((kind): kind is BubbleColour => !!kind && kind !== 'gold')
      if (around.length === 0 || around.includes(cell.kind as BubbleColour)) return
      if (state.rng() < 0.5) cell.kind = pick(around, state.rng)
    })
  }
}

function placeGolden(state: BubbleState, rows: number[], count: number) {
  for (let i = 0; i < count && goldenCount(state.grid) < MAX_GOLDEN; i += 1) {
    const spots: GridPos[] = []
    for (const row of rows) state.grid[row]?.forEach((cell, col) => cell && cell.kind !== 'gold' && spots.push({ row, col }))
    if (spots.length === 0) return
    const spot = pick(spots, state.rng)
    state.grid[spot.row][spot.col] = { kind: 'gold' }
  }
}

function fillStartGrid(state: BubbleState) {
  state.grid = []
  for (let row = 0; row < START_ROWS; row += 1) {
    const cells = emptyRow(row, state.parity)
    state.grid.push(cells)
    for (let col = 0; col < cells.length; col += 1) {
      const near = neighbours(row, col, state.parity)
        .filter((pos) => pos.row < row || (pos.row === row && pos.col < col))
        .map((pos) => cellAt(state.grid, pos.row, pos.col)?.kind)
      cells[col] = { kind: clusteredColour(state, near) }
    }
  }
  const rows = Array.from({ length: START_ROWS }, (_, row) => row)
  softenLoners(state, rows)
  placeGolden(state, rows.slice(1, -1), START_GOLDEN)
}

export function createGame(rng: () => number = Math.random): BubbleState {
  const state: BubbleState = {
    grid: [],
    parity: 0,
    phase: 'ready',
    settle: 0,
    aimAngle: Math.PI / 2,
    aimDots: [],
    shot: null,
    current: 'blue',
    next: 'blue',
    megaArmed: false,
    megaMeter: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    misses: 0,
    shots: 0,
    successfulShots: 0,
    bubblesPopped: 0,
    goldenPopped: 0,
    cubMood: 'idle',
    cubMoodTime: 0,
    pops: [],
    falls: [],
    texts: [],
    sparks: [],
    flash: 0,
    shake: 0,
    ceilingDrop: 0,
    gumBlow: GUM_BLOW_SECONDS,
    events: [],
    hudVersion: 0,
    rng,
  }
  fillStartGrid(state)
  state.current = queueColour(state)
  state.next = queueColour(state)
  return state
}

/** Push a new row in at the ceiling. Everything below moves down one row. */
export function dropCeiling(state: BubbleState) {
  state.parity = state.parity === 0 ? 1 : 0
  const cells = emptyRow(0, state.parity)
  state.grid.unshift(cells)
  const density = Math.min(ROW_DENSITY_MAX, ROW_DENSITY_START + state.successfulShots * ROW_DENSITY_PER_SUCCESS)
  for (let col = 0; col < cells.length; col += 1) {
    if (state.rng() >= density) continue
    const near = neighbours(0, col, state.parity)
      .filter((pos) => pos.row === 1 || pos.col < col)
      .map((pos) => cellAt(state.grid, pos.row, pos.col)?.kind)
    cells[col] = { kind: clusteredColour(state, near) }
  }
  // Every bubble that hung from the ceiling must still hang from the new row.
  state.grid[1]?.forEach((cell, col) => {
    if (!cell) return
    const above = neighbours(1, col, state.parity).filter((pos) => pos.row === 0)
    if (above.some((pos) => cellAt(state.grid, 0, pos.col))) return
    const spot = pick(above, state.rng)
    cells[spot.col] = { kind: cell.kind === 'gold' ? clusteredColour(state, []) : cell.kind }
  })
  if (!cells.some(Boolean)) cells[Math.floor(cells.length / 2)] = { kind: pick(COLOURS, state.rng) }
  softenLoners(state, [0])
  if (state.rng() < GOLDEN_ROW_CHANCE) placeGolden(state, [0], 1)
  trimGrid(state.grid)
  state.ceilingDrop = CEILING_DROP_SECONDS
  state.events.push({ type: 'ceiling' })
  state.texts.push({ x: FIELD_W / 2, y: 70, text: 'Ceiling drops!', t: 0, big: false })
}

type Mover = { x: number; y: number; dx: number; dy: number }

/** Hits a settled bubble or the ceiling. */
function touching(grid: Grid, parity: 0 | 1, x: number, y: number) {
  if (y <= BUBBLE_R) return true
  const row = Math.round((y - BUBBLE_R) / ROW_H)
  for (let r = Math.max(0, row - 1); r <= Math.min(grid.length - 1, row + 1); r += 1) {
    const cells = grid[r]
    for (let c = 0; c < cells.length; c += 1) {
      if (!cells[c]) continue
      const ddx = cellX(r, c, parity) - x
      const ddy = cellY(r) - y
      if (ddx * ddx + ddy * ddy < HIT_DIST * HIT_DIST) return true
    }
  }
  return false
}

/**
 * Move a shot up to distance, in small steps so it can never skip past a bubble.
 * The same steps drive the real shot and the aiming guide.
 */
function advance(grid: Grid, parity: 0 | 1, mover: Mover, distance: number, onStep?: (x: number, y: number) => void) {
  let left = distance
  let bounces = 0
  while (left > 0) {
    const step = Math.min(SHOT_STEP, left)
    left -= step
    mover.x += mover.dx * step
    mover.y += mover.dy * step
    if (mover.x < BUBBLE_R) {
      mover.x = 2 * BUBBLE_R - mover.x
      mover.dx = Math.abs(mover.dx)
      bounces += 1
    } else if (mover.x > FIELD_W - BUBBLE_R) {
      mover.x = 2 * (FIELD_W - BUBBLE_R) - mover.x
      mover.dx = -Math.abs(mover.dx)
      bounces += 1
    }
    if (mover.y <= BUBBLE_R) mover.y = BUBBLE_R
    onStep?.(mover.x, mover.y)
    if (touching(grid, parity, mover.x, mover.y)) return { stopped: true, bounces }
  }
  return { stopped: false, bounces }
}

function aimVector(angle: number) {
  return { dx: Math.cos(angle), dy: -Math.sin(angle) }
}

/** Dots along the path the shot will take, through wall bounces, until it touches something. */
export function tracePath(state: BubbleState, angle: number) {
  const mover: Mover = { x: LAUNCH_X, y: LAUNCH_Y, ...aimVector(angle) }
  const dots: { x: number; y: number }[] = []
  let travelled = 0
  let nextDot = DOT_GAP * 1.6
  let bounces = 0
  while (travelled < TRACE_LENGTH && bounces <= TRACE_BOUNCES) {
    const result = advance(state.grid, state.parity, mover, SHOT_STEP, () => undefined)
    travelled += SHOT_STEP
    bounces += result.bounces
    if (travelled >= nextDot) {
      dots.push({ x: mover.x, y: mover.y })
      nextDot += DOT_GAP
    }
    if (result.stopped) break
  }
  return dots
}

function clampAngle(angle: number) {
  return Math.max(MIN_AIM, Math.min(Math.PI - MIN_AIM, angle))
}

/** Point the shot at a spot in field units. Lower spots still steer left and right. */
export function aimToward(state: BubbleState, x: number, y: number) {
  const targetY = Math.min(y, LAUNCH_Y - AIM_FLOOR)
  state.aimAngle = clampAngle(Math.atan2(LAUNCH_Y - targetY, x - LAUNCH_X))
  state.aimDots = tracePath(state, state.aimAngle)
}

export function megaButtonHit(x: number, y: number) {
  return Math.hypot(x - MEGA_X, y - MEGA_Y) <= MEGA_BUTTON_R + 8
}

/** Arm or disarm the Mega Bubble. Only between shots, and only with a full meter. */
export function toggleMega(state: BubbleState) {
  if (state.phase !== 'ready' || !megaReady(state)) return false
  state.megaArmed = !state.megaArmed
  state.hudVersion += 1
  return true
}

export function beginAim(state: BubbleState, x: number, y: number) {
  if (state.phase !== 'ready' || state.gumBlow > 0) return false
  state.phase = 'aiming'
  aimToward(state, x, y)
  return true
}

export function moveAim(state: BubbleState, x: number, y: number) {
  if (state.phase !== 'aiming') return
  aimToward(state, x, y)
}

export function cancelAim(state: BubbleState) {
  if (state.phase !== 'aiming') return
  state.phase = 'ready'
  state.aimDots = []
}

/** Fire along the current aim. Only one shot can be in the air. */
export function releaseAim(state: BubbleState) {
  if (state.phase !== 'aiming') return false
  fire(state, state.aimAngle)
  return true
}

export function fire(state: BubbleState, angle: number) {
  const mega = state.megaArmed
  state.shot = { x: LAUNCH_X, y: LAUNCH_Y, ...aimVector(clampAngle(angle)), colour: state.current, mega }
  if (mega) {
    state.megaArmed = false
    state.megaMeter = 0
  }
  state.phase = 'flying'
  state.aimDots = []
  state.shots += 1
  state.cubMood = 'blowing'
  state.cubMoodTime = 0.3
  state.events.push({ type: 'fire', mega })
  state.hudVersion += 1
}

/** The empty cell nearest the stop point that would hang from the ceiling or another bubble. */
function snapCell(state: BubbleState, x: number, y: number): GridPos {
  const base = nearestCell(x, y, state.parity)
  const search = (rows: number[]) => {
    let best: GridPos | null = null
    let bestDist = Infinity
    for (const row of rows) {
      if (row < 0) continue
      for (let col = 0; col < rowCols(row, state.parity); col += 1) {
        if (cellAt(state.grid, row, col)) continue
        const attached = row === 0 || neighbours(row, col, state.parity).some((pos) => cellAt(state.grid, pos.row, pos.col))
        if (!attached) continue
        const dist = Math.hypot(cellX(row, col, state.parity) - x, cellY(row) - y)
        if (dist < bestDist) {
          bestDist = dist
          best = { row, col }
        }
      }
    }
    return best
  }
  return (
    search([base.row - 1, base.row, base.row + 1]) ??
    search(Array.from({ length: Math.max(base.row + 3, state.grid.length + 1) }, (_, row) => row)) ?? { row: 0, col: base.col }
  )
}

function ensureRows(state: BubbleState, row: number) {
  while (state.grid.length <= row) state.grid.push(emptyRow(state.grid.length, state.parity))
}

function removeCells(state: BubbleState, cells: GridPos[], falling: boolean) {
  const kinds: BubbleKind[] = []
  cells.forEach((pos, index) => {
    const cell = cellAt(state.grid, pos.row, pos.col)
    if (!cell) return
    kinds.push(cell.kind)
    const x = cellX(pos.row, pos.col, state.parity)
    const y = cellY(pos.row)
    if (falling) {
      state.falls.push({ x, y, vx: (state.rng() - 0.5) * 140, vy: -60 - state.rng() * 120, kind: cell.kind, t: 0 })
    } else {
      state.pops.push({ x, y, kind: cell.kind, t: -index * 0.025 })
    }
    state.grid[pos.row][pos.col] = null
  })
  return kinds
}

function finishShot(state: BubbleState, result: ShotResult, at: { x: number; y: number }) {
  state.score += result.points
  if (result.points > 0) {
    state.texts.push({ x: at.x, y: at.y, text: `+${result.points}`, t: 0, big: result.popped + result.dropped >= BIG_CLEAR })
  }
  if (result.golden > 0) {
    const cash = result.golden * CASH_PER_COIN_BUBBLE
    state.texts.push({ x: at.x, y: at.y + 26, text: `+${cash} Cub Cash`, t: 0, big: false })
  }

  if (result.successful) {
    const before = missLimit(state.successfulShots)
    state.misses = 0
    state.successfulShots += 1
    state.cubMood = 'happy'
    state.cubMoodTime = 0.9
    const after = missLimit(state.successfulShots)
    if (after < before) {
      const warning = after === 1 ? 'Every miss drops the ceiling!' : `Ceiling drops after ${after} misses!`
      state.texts.push({ x: FIELD_W / 2, y: FIELD_H * 0.5, text: warning, t: 0, big: true })
    }
  } else {
    state.misses += 1
    if (state.misses >= missLimit(state.successfulShots)) {
      dropCeiling(state)
      result.ceilingDropped = true
      state.misses = 0
    }
  }
  trimGrid(state.grid)
  if (countBubbles(state.grid) === 0) {
    state.score += POINTS_BOARD_CLEAR
    result.boardCleared = true
    state.texts.push({ x: FIELD_W / 2, y: FIELD_H * 0.42, text: `Board clear! +${POINTS_BOARD_CLEAR}`, t: 0, big: true })
    state.events.push({ type: 'boardClear' })
    state.flash = 0.45
    fillStartGrid(state)
  }

  state.current = state.next
  state.next = queueColour(state)
  state.shot = null

  if (lowestRow(state.grid) >= DANGER_ROW) {
    state.phase = 'over'
    state.cubMood = 'over'
    state.events.push({ type: 'over' })
  } else {
    state.gumBlow = GUM_BLOW_SECONDS
    state.phase = 'settling'
    state.settle = Math.max(SETTLE_SECONDS, state.ceilingDrop, state.gumBlow)
  }
  state.hudVersion += 1
  return result
}

function emptyResult(): ShotResult {
  return {
    placed: null,
    popped: 0,
    dropped: 0,
    golden: 0,
    points: 0,
    successful: false,
    multiplier: 1,
    boardCleared: false,
    ceilingDropped: false,
  }
}

/** Settle a normal bubble where it stopped, then pop matches and drop anything left hanging. */
export function resolveShot(state: BubbleState, x: number, y: number, colour: BubbleColour): ShotResult {
  const result = emptyResult()
  const spot = snapCell(state, x, y)
  ensureRows(state, spot.row)
  state.grid[spot.row][spot.col] = { kind: colour }
  result.placed = spot

  const group = colourGroup(state.grid, spot, state.parity)
  if (group.length >= MATCH_MIN) {
    const goldenNear = new Map<string, GridPos>()
    for (const pos of group) {
      for (const next of neighbours(pos.row, pos.col, state.parity)) {
        if (cellAt(state.grid, next.row, next.col)?.kind === 'gold') goldenNear.set(`${next.row},${next.col}`, next)
      }
    }
    removeCells(state, group, false)
    const goldPopped = removeCells(state, [...goldenNear.values()], false).length
    const hanging = removeCells(state, unsupported(state.grid, state.parity), true)
    const droppedGold = hanging.filter((kind) => kind === 'gold').length
    const dropped = hanging.length - droppedGold

    state.combo += 1
    state.maxCombo = Math.max(state.maxCombo, state.combo)
    const multiplier = comboMultiplier(state.combo)
    const cleared = group.length + goldPopped + hanging.length
    result.popped = group.length
    result.dropped = dropped
    result.golden = goldPopped + droppedGold
    result.successful = true
    result.multiplier = multiplier
    result.points =
      Math.round((group.length * POINTS_POP + dropped * POINTS_DROP) * multiplier) +
      clearBonus(cleared) +
      result.golden * POINTS_GOLDEN

    state.bubblesPopped += cleared
    state.goldenPopped += result.golden
    state.megaMeter = Math.min(MEGA_FILL, state.megaMeter + cleared)
    state.events.push({ type: 'pop', count: cleared })
    if (state.combo >= 2) {
      state.texts.push({ x: x, y: y - 34, text: `Combo ×${multiplier}`, t: 0, big: false })
    }
    if (cleared >= BIG_CLEAR) {
      state.events.push({ type: 'bigClear' })
      state.flash = 0.35
      state.shake = 0.3
    }
  } else {
    state.combo = 0
  }
  return finishShot(state, result, { x: cellX(spot.row, spot.col, state.parity), y: cellY(spot.row) })
}

/** A Mega Bubble does not stick: it clears everything near the impact, then anything left hanging. */
export function resolveMega(state: BubbleState, x: number, y: number): ShotResult {
  const result = emptyResult()
  const blast: GridPos[] = []
  state.grid.forEach((cells, row) =>
    cells.forEach((cell, col) => {
      if (cell && Math.hypot(cellX(row, col, state.parity) - x, cellY(row) - y) <= MEGA_RADIUS + BUBBLE_R) blast.push({ row, col })
    }),
  )
  const blasted = removeCells(state, blast, false)
  const hanging = removeCells(state, unsupported(state.grid, state.parity), true)
  const golden = [...blasted, ...hanging].filter((kind) => kind === 'gold').length
  const popped = blasted.length - blasted.filter((kind) => kind === 'gold').length
  const dropped = hanging.length - hanging.filter((kind) => kind === 'gold').length
  result.popped = popped
  result.dropped = dropped
  result.golden = golden
  result.successful = blasted.length + hanging.length > 0
  result.points = Math.round(popped * POINTS_POP + dropped * POINTS_DROP) + golden * POINTS_GOLDEN
  state.bubblesPopped += blasted.length + hanging.length
  state.goldenPopped += golden
  state.events.push({ type: 'mega' })
  state.flash = 0.4
  state.shake = 0.35
  state.texts.push({ x, y: y + 26, text: 'MEGA!', t: 0, big: true })
  return finishShot(state, result, { x, y })
}

function stepEffects(state: BubbleState, dt: number) {
  for (const pop of state.pops) pop.t += dt
  state.pops = state.pops.filter((pop) => pop.t < 0.32)
  for (const fall of state.falls) {
    fall.t += dt
    fall.vy += 1900 * dt
    fall.x += fall.vx * dt
    fall.y += fall.vy * dt
  }
  state.falls = state.falls.filter((fall) => fall.y < FIELD_H + BUBBLE_R * 2)
  for (const text of state.texts) {
    text.t += dt
    text.y -= 34 * dt
  }
  state.texts = state.texts.filter((text) => text.t < (text.big ? 1.5 : 1))
  for (const spark of state.sparks) spark.t += dt
  state.sparks = state.sparks.filter((spark) => spark.t < 0.45)
  state.flash = Math.max(0, state.flash - dt)
  state.shake = Math.max(0, state.shake - dt)
  state.ceilingDrop = Math.max(0, state.ceilingDrop - dt)
  state.gumBlow = Math.max(0, state.gumBlow - dt)
}

function stepMood(state: BubbleState, dt: number) {
  if (state.phase === 'over') {
    state.cubMood = 'over'
    return
  }
  if (state.cubMoodTime > 0) {
    state.cubMoodTime -= dt
    if (state.cubMoodTime > 0) return
  }
  const limit = missLimit(state.successfulShots)
  const low = lowestRow(state.grid)
  const danger = cellY(Math.max(0, low)) + BUBBLE_R >= DANGER_Y - ROW_H * 3
  if (state.phase === 'aiming') state.cubMood = 'aiming'
  else if (danger || (limit > 1 && state.misses >= limit - 1)) state.cubMood = 'worried'
  else state.cubMood = 'idle'
}

export function stepGame(state: BubbleState, dt: number) {
  stepEffects(state, dt)
  stepMood(state, dt)
  if (state.phase === 'settling') {
    state.settle -= dt
    if (state.settle <= 0) state.phase = 'ready'
    return
  }
  if (state.phase !== 'flying' || !state.shot) return
  const shot = state.shot
  const mover: Mover = { x: shot.x, y: shot.y, dx: shot.dx, dy: shot.dy }
  const moved = advance(state.grid, state.parity, mover, SHOT_SPEED * dt)
  shot.x = mover.x
  shot.y = mover.y
  shot.dx = mover.dx
  shot.dy = mover.dy
  if (shot.mega) {
    state.sparks.push({
      x: shot.x + (state.rng() - 0.5) * BUBBLE_R,
      y: shot.y + (state.rng() - 0.5) * BUBBLE_R,
      t: 0,
      size: 3 + state.rng() * 4,
    })
  }
  for (let i = 0; i < moved.bounces; i += 1) state.events.push({ type: 'bounce' })
  if (!moved.stopped) return
  if (shot.mega) resolveMega(state, shot.x, shot.y)
  else resolveShot(state, shot.x, shot.y, shot.colour)
}

/** Fire and run the physics until the shot settles. For tests. */
export function shootAndSettle(state: BubbleState, angle: number) {
  fire(state, angle)
  let guard = 0
  while (state.phase === 'flying' && guard < 2000) {
    stepGame(state, 1 / 120)
    guard += 1
  }
}

export function takeEvents(state: BubbleState) {
  const events = state.events
  state.events = []
  return events
}
