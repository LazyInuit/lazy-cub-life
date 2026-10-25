import type { COLOURS } from './config'

export type BubbleColour = (typeof COLOURS)[number]
/** Golden Paw is never matched by colour. It goes when a match beside it pops, or when it falls. */
export type BubbleKind = BubbleColour | 'gold'

export type Cell = { kind: BubbleKind }

export type GridPos = { row: number; col: number }

export type Phase = 'ready' | 'aiming' | 'flying' | 'settling' | 'over'

export type CubMood = 'idle' | 'aiming' | 'blowing' | 'happy' | 'worried' | 'over'

export type Shot = {
  x: number
  y: number
  dx: number
  dy: number
  colour: BubbleColour
  mega: boolean
}

export type PopFx = { x: number; y: number; kind: BubbleKind; t: number }
export type FallFx = { x: number; y: number; vx: number; vy: number; kind: BubbleKind; t: number }
export type TextFx = { x: number; y: number; text: string; t: number; big: boolean }
/** Glitter left behind a flying Mega Bubble. */
export type SparkFx = { x: number; y: number; t: number; size: number }

/** Sound and HUD cues raised by the engine. The screen drains them each frame. */
export type BubbleEvent =
  | { type: 'fire'; mega: boolean }
  | { type: 'bounce' }
  | { type: 'pop'; count: number }
  | { type: 'bigClear' }
  | { type: 'mega' }
  | { type: 'ceiling' }
  | { type: 'boardClear' }
  | { type: 'over' }

export type BubbleState = {
  /** Rows from the ceiling down. Row r holds COLS or COLS - 1 cells, see rowShifted. */
  grid: (Cell | null)[][]
  /** Flips each time a row is pushed in at the top, so existing rows keep their x positions. */
  parity: 0 | 1
  phase: Phase
  settle: number
  aimAngle: number
  aimDots: { x: number; y: number }[]
  shot: Shot | null
  current: BubbleColour
  next: BubbleColour
  megaArmed: boolean
  megaMeter: number

  score: number
  combo: number
  maxCombo: number
  misses: number
  shots: number
  successfulShots: number
  bubblesPopped: number
  goldenPopped: number
  cubMood: CubMood
  cubMoodTime: number

  pops: PopFx[]
  falls: FallFx[]
  texts: TextFx[]
  sparks: SparkFx[]
  flash: number
  shake: number
  /** Seconds left in the slide after the ceiling drops. The grid is already in its new rows. */
  ceilingDrop: number
  /** Seconds left while the cub blows the next gum bubble out of its mouth. */
  gumBlow: number

  events: BubbleEvent[]
  /** Bumped whenever a HUD number changes, so the screen re-renders only then. */
  hudVersion: number
  rng: () => number
}

/** What one shot did, for the screen and for tests. */
export type ShotResult = {
  placed: GridPos | null
  popped: number
  dropped: number
  golden: number
  points: number
  successful: boolean
  multiplier: number
  boardCleared: boolean
  ceilingDropped: boolean
}
