// Run with npm run check:landscape. Checks every Spellitaire landscape layout fits common phones, long columns included.
import './vite-glob-stub'
import type { Card } from '../src/game/cards/deck'
import { ENGINES, type SpellGame } from '../src/game/solitaire/modes'
import { SPELL_MODE_IDS, type SpellMode } from '../src/game/solitaire/keys'
import { PYRAMID_PILES } from '../src/game/solitaire/pyramid'
import { wideTable } from '../src/game/solitaire/table'

const ASPECT = 1024 / 575
const TABLE_TOP = 0.225
const RAIL = 76
const LEFT_EDGE = 8

/** Board box for a landscape viewport, matching the CSS: the controls rail on the right, the art's top band above. */
function box(vw: number, vh: number) {
  const artW = Math.max(vw, vh * ASPECT)
  const artH = artW / ASPECT
  return { w: vw - RAIL - LEFT_EDGE, h: Math.floor(vh - artH * TABLE_TOP - 4 - 6) }
}

const VIEWPORTS: [string, number, number][] = [
  ['SE1 568x320', 568, 320],
  ['SE 667x375', 667, 375],
  ['Android 740x360', 740, 360],
  ['iPhone 812x375', 812, 375],
  ['iPhone Safari 844x340', 844, 340],
  ['iPhone 844x390', 844, 390],
  ['Pixel 915x412', 915, 412],
  ['Pro Max 932x430', 932, 430],
]

type AnyState = SpellGame & Record<string, unknown>

function up(cards: Card[], faceUp: boolean) {
  return cards.map((card) => ({ ...card, faceUp }))
}

/** The same deal with one very long column, the hardest case for fitting. */
function longColumn(mode: SpellMode, state: AnyState): AnyState | null {
  const all = ENGINES[mode].table.allCards(state as never) as Card[]
  if (mode === 'classic') {
    const t = (state.tableau as Card[][]).map(() => [] as Card[])
    t[6] = [...up(all.slice(0, 6), false), ...up(all.slice(6, 19), true)]
    return { ...state, tableau: t, stock: all.slice(19), waste: [] }
  }
  if (mode === 'freecell') {
    const t = (state.tableau as Card[][]).map(() => [] as Card[])
    t[0] = up(all.slice(0, 20), true)
    t[1] = up(all.slice(20, 52), true)
    return { ...state, tableau: t }
  }
  if (mode === 'flipflop') {
    const t = (state.tableau as Card[][]).map(() => [] as Card[])
    t[0] = [...up(all.slice(0, 4), false), ...up(all.slice(4, 25), true)]
    return { ...state, tableau: t, stock: all.slice(25) }
  }
  if (mode === 'spider') {
    const t = (state.tableau as Card[][]).map(() => [] as Card[])
    t[0] = [...up(all.slice(0, 5), false), ...up(all.slice(5, 25), true)]
    return { ...state, tableau: t, stock: all.slice(25) }
  }
  return null
}

const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5

let failures = 0
const sizes: string[] = []
for (const mode of SPELL_MODE_IDS) {
  for (const difficulty of ['easy', 'hard'] as const) {
    const dealt = ENGINES[mode].deal(1234, difficulty) as AnyState
    const cases: [string, AnyState][] = [['deal', dealt]]
    const long = longColumn(mode, dealt)
    if (long) cases.push(['long column', long])
    if (mode === 'pyramid') {
      // Bottom rows cleared: the rest of the pyramid grows and moves down.
      const pyramid = (dealt as unknown as { pyramid: (Card | null)[] }).pyramid
      for (const cleared of [1, 2, 3]) {
        const keep = [21, 15, 10][cleared - 1]
        cases.push([`${cleared} rows cleared`, { ...dealt, pyramid: pyramid.map((card, i) => (i < keep ? card : null)) }])
      }
    }
    for (const [label, state] of cases) {
      for (const [name, vw, vh] of VIEWPORTS) {
        const b = box(vw, vh)
        if (!wideTable(b.w, b.h)) {
          console.log(`FAIL ${mode} ${name}: box ${b.w}x${b.h} is not treated as landscape`)
          failures++
          continue
        }
        const layout = ENGINES[mode].table.layout(state as never, b.w, b.h, vw / 2 - LEFT_EDGE)
        const problems: string[] = []
        for (const [id, spot] of layout.spots) {
          if (spot.x < -0.5 || spot.x + layout.cardW > b.w + 0.5) problems.push(`${id} off the side (${Math.round(spot.x)})`)
          if (spot.y < -0.5 || spot.y + layout.cardH > b.h + 0.5) problems.push(`${id} below the table by ${Math.round(spot.y + layout.cardH - b.h)}`)
        }
        const piles = Object.entries(layout.piles)
        for (let i = 0; i < piles.length; i++) {
          for (let j = i + 1; j < piles.length; j++) {
            const [pa, ra] = piles[i]
            const [pb, rb] = piles[j]
            const inPyramid = (pile: string) => (PYRAMID_PILES as readonly string[]).includes(pile)
            if (mode === 'pyramid' && inPyramid(pa) && inPyramid(pb)) continue
            if (overlap(ra, rb)) problems.push(`${pa} overlaps ${pb}`)
          }
        }
        const apex = layout.piles[PYRAMID_PILES[0]]
        if (mode === 'pyramid' && apex && Math.abs(apex.x + layout.cardW / 2 - (vw / 2 - LEFT_EDGE)) > 0.5) {
          problems.push(`top card ${Math.round(apex.x + layout.cardW / 2 + LEFT_EDGE - vw / 2)}px off the scoreboard's centre`)
        }
        if (layout.note && (layout.note.x < -0.5 || layout.note.x + layout.note.w > b.w + 0.5)) problems.push('note off the side')
        if ((label === 'deal' || label.endsWith('cleared')) && difficulty === 'easy' && name === 'iPhone 844x390') {
          sizes.push(`${mode.padEnd(9)} ${label.padEnd(16)} ${name.padEnd(22)} card ${Math.round(layout.cardW)}px`)
        } else if (label === 'deal' && difficulty === 'easy') {
          sizes.push(`${mode.padEnd(9)} ${label.padEnd(16)} ${name.padEnd(22)} card ${Math.round(layout.cardW)}px`)
        }
        if (problems.length > 0) {
          failures++
          console.log(`FAIL ${mode} ${difficulty} ${label} ${name} (${b.w}x${b.h}): ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? ` (+${problems.length - 3} more)` : ''}`)
        }
      }
    }
  }
}

console.log(sizes.join('\n'))
console.log(failures === 0 ? '\nAll landscape layouts fit.' : `\n${failures} layout problems.`)
process.exit(failures === 0 ? 0 : 1)
