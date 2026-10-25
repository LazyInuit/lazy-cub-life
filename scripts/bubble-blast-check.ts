// Rule checks for the Bubble Blast engine. Run: npm run check:bubble
import {
  BUBBLE_D,
  MEGA_FILL,
  POINTS_BOARD_CLEAR,
  POINTS_DROP,
  POINTS_GOLDEN,
  POINTS_POP,
} from '../src/game/bubbleBlast/config'
import {
  beginAim,
  clearBonus,
  createGame,
  dropCeiling,
  missLimit,
  resolveMega,
  resolveShot,
  shootAndSettle,
  stepGame,
  takeEvents,
  toggleMega,
} from '../src/game/bubbleBlast/engine'
import { DANGER_ROW, cellX, cellY, countBubbles, emptyRow, occupied, rowCols } from '../src/game/bubbleBlast/grid'
import type { BubbleKind, BubbleState } from '../src/game/bubbleBlast/types'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`ok   ${name}`)
  else {
    failures += 1
    console.log(`FAIL ${name} ${detail}`)
  }
}

function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const K: Record<string, BubbleKind | null> = { B: 'blue', R: 'red', G: 'green', P: 'purple', Y: 'yellow', '*': 'gold', '.': null }

/** Rows as strings, one character per cell. Row 0 has 8 cells, row 1 has 7, and so on. */
function board(rows: string[], seed = 1): BubbleState {
  const state = createGame(seeded(seed))
  state.parity = 0
  state.grid = rows.map((text, row) => {
    const cells = emptyRow(row, 0)
    if (text.length !== cells.length) throw new Error(`row ${row} needs ${cells.length} cells`)
    return cells.map((_, col) => {
      const kind = K[text[col]]
      return kind ? { kind } : null
    })
  })
  takeEvents(state)
  return state
}

/** Settle a bubble exactly on a cell. */
function landAt(state: BubbleState, row: number, col: number, kind: 'blue' | 'red' | 'green' | 'purple') {
  return resolveShot(state, cellX(row, col, state.parity), cellY(row), kind)
}

function noOverlaps(state: BubbleState) {
  const spots = occupied(state.grid).map((pos) => ({ x: cellX(pos.row, pos.col, state.parity), y: cellY(pos.row) }))
  for (let i = 0; i < spots.length; i += 1) {
    for (let j = i + 1; j < spots.length; j += 1) {
      if (Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y) < BUBBLE_D - 0.01) return false
    }
  }
  return true
}

{
  const s = board(['BB....RR'])
  const r = landAt(s, 1, 0, 'blue')
  check('exactly three pop', r.popped === 3 && r.points === 3 * POINTS_POP, JSON.stringify(r))
  check('anchors left after three pop', countBubbles(s.grid) === 2)
}
{
  const s = board(['BR.....R'])
  const r = landAt(s, 1, 0, 'blue')
  check('two stay attached', r.popped === 0 && countBubbles(s.grid) === 4 && s.misses === 1, JSON.stringify(r))
}
{
  const s = board(['BBBB...R'])
  const r = landAt(s, 1, 0, 'blue')
  check('four plus fired pop as five', r.popped === 5 && r.points === 5 * POINTS_POP, JSON.stringify(r))
}
{
  // Greens hang only from the blues. Popping the blues drops all three greens.
  const s = board(['BB.....R', 'G......', 'GG......'])
  const r = landAt(s, 0, 2, 'blue')
  check('unsupported cluster falls', r.popped === 3 && r.dropped === 3, JSON.stringify(r))
  check(
    'drop scoring and 6+ bonus',
    r.points === Math.round(3 * POINTS_POP + 3 * POINTS_DROP) + clearBonus(6) && clearBonus(6) > 0,
    `points ${r.points}`,
  )
  check('only the anchor remains', countBubbles(s.grid) === 1)
}
{
  const s = board(['BB......'])
  const before = s.score
  const r = landAt(s, 0, 2, 'blue')
  check(
    'board clear bonus and refill',
    r.boardCleared && s.score === before + 3 * POINTS_POP + POINTS_BOARD_CLEAR && countBubbles(s.grid) > 20,
    JSON.stringify(r),
  )
}
{
  const s = board(['BB*....R'])
  const r = landAt(s, 1, 0, 'blue')
  check('golden paw beside a match pays its points', r.golden === 1 && r.points === 3 * POINTS_POP + POINTS_GOLDEN, JSON.stringify(r))
}
{
  const s = board(['BB.RR..G'])
  const a = landAt(s, 1, 0, 'blue')
  const b = landAt(s, 1, 3, 'red')
  check(
    'combo multiplier on second success',
    a.multiplier === 1 && b.multiplier === 1.5 && b.points === Math.round(3 * POINTS_POP * 1.5),
    `${a.multiplier} ${b.multiplier} ${b.points}`,
  )
  landAt(s, 1, 6, 'purple')
  check('a miss resets the combo', s.combo === 0)
}
{
  // No purple on the board, and the purples land apart, so every one is a miss.
  const s = board(['BRGBRGBR'])
  const limit = missLimit()
  const before = occupied(s.grid).map((pos) => ({ x: cellX(pos.row, pos.col, s.parity), y: cellY(pos.row) }))
  for (let i = 0; i < limit - 1; i += 1) landAt(s, 1, i * 2, 'purple')
  const rowsBefore = s.grid.length
  check('misses count up', s.misses === limit - 1, `misses ${s.misses}`)
  const r = landAt(s, 2, 0, 'purple')
  check('next shot waits for the ceiling slide', s.phase === 'settling' && s.settle >= s.ceilingDrop && s.ceilingDrop > 0)
  check('last allowed miss drops the ceiling', r.ceilingDropped && s.misses === 0 && s.grid.length >= rowsBefore, JSON.stringify(r))
  const after = before.map((spot) => ({ x: spot.x, y: spot.y + (cellY(1) - cellY(0)) }))
  const moved = after.every((spot) =>
    occupied(s.grid).some((pos) => Math.abs(cellX(pos.row, pos.col, s.parity) - spot.x) < 0.01 && Math.abs(cellY(pos.row) - spot.y) < 0.01),
  )
  check('old bubbles move straight down one row', moved)
  check('no overlaps after ceiling drop', noOverlaps(s))
}
{
  const s = board(['BRGPBRGP'])
  for (let i = 0; i < 30; i += 1) dropCeiling(s)
  const hanging = occupied(s.grid).length
  check('ceiling rows keep every bubble attached', hanging === countBubbles(s.grid) && noOverlaps(s))
  check('row widths stay valid', s.grid.every((cells, row) => cells.length === rowCols(row, s.parity)))
}
check('ceiling always drops after 3 misses', missLimit() === 3)
{
  const s = createGame(seeded(3))
  check('cannot aim while the gum bubble is still being blown', !beginAim(s, 180, 200))
  stepGame(s, 1)
  check('can aim once the gum bubble is out', beginAim(s, 180, 200))
}

{
  const s = board(['R......R'])
  s.current = 'blue'
  shootAndSettle(s, (160 * Math.PI) / 180)
  const events = takeEvents(s)
  check('wall bounce shot', events.some((e) => e.type === 'bounce'), JSON.stringify(events))
  check('bounced shot settles without overlap', noOverlaps(s) && countBubbles(s.grid) === 3)
}
{
  const s = board(['R......R'])
  s.current = 'blue'
  shootAndSettle(s, (11 * Math.PI) / 180)
  const bounces = takeEvents(s).filter((e) => e.type === 'bounce').length
  check('multiple wall bounces', bounces >= 2, `bounces ${bounces}`)
  check('multi-bounce shot settles without overlap', noOverlaps(s))
}
{
  // A full board: a straight shot must stop under the bottom row, never inside it.
  const s = board(['RRRRRRRR', 'GGGGGGG', 'RRRRRRRR', 'GGGGGGG', 'RRRRRRRR', 'GGGGGGG'])
  s.current = 'blue'
  s.phase = 'flying'
  s.phase = 'ready'
  shootAndSettle(s, Math.PI / 2)
  const blue = occupied(s.grid).find((pos) => s.grid[pos.row][pos.col]?.kind === 'blue')
  check('fast shot stops at first contact', blue?.row === 6, JSON.stringify(blue))
  check('no overlap after a straight shot', noOverlaps(s))
}
{
  const s = board(['RRRRRRRR', 'GGGGGGG', 'RRRRRRRR'])
  s.megaMeter = MEGA_FILL
  s.current = 'blue'
  check('mega arms when full', toggleMega(s) && s.megaArmed)
  shootAndSettle(s, Math.PI / 2)
  const left = countBubbles(s.grid)
  check('mega meter resets after firing', s.megaMeter === 0 && !s.megaArmed)
  check('mega clears a wide area', left <= 23 - 7, `left ${left}`)
  check('mega bubble does not stick', !occupied(s.grid).some((p) => s.grid[p.row][p.col]?.kind === 'blue'))
}
{
  const s = board(['RRRRRRRR', 'RRRRRRR', 'RRRRRRRR'])
  const r = resolveMega(s, cellX(1, 3, 0), cellY(1))
  check(
    'mega points have no multiplier or bonus',
    r.points === Math.round(r.popped * POINTS_POP + r.dropped * POINTS_DROP) + r.golden * POINTS_GOLDEN && Number.isInteger(r.points),
    JSON.stringify(r),
  )
}
{
  const rows = Array.from({ length: DANGER_ROW }, (_, row) => (row % 2 === 0 ? 'RGRGRGRG' : 'GRGRGRG'))
  const s = board(rows)
  check('board above the line is still playing', s.phase !== 'over')
  landAt(s, DANGER_ROW, 0, 'purple')
  check('reaching the danger line ends the game', (s.phase as string) === 'over')
}
{
  const s = createGame(seeded(7))
  let guard = 0
  while (s.phase !== 'over' && guard < 400) {
    if (s.phase === 'ready') shootAndSettle(s, ((25 + ((guard * 37) % 130)) * Math.PI) / 180)
    else stepGame(s, 0.05)
    guard += 1
  }
  check('random play never overlaps', noOverlaps(s))
  check('random play ends or keeps going cleanly', guard > 10, `steps ${guard}`)
  console.log(`     random run: score ${s.score}, shots ${s.shots}, successful ${s.successfulShots}, phase ${s.phase}`)
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll Bubble Blast checks passed')
