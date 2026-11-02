/**
 * Spellitaire's game modes. Each mode has its own rules engine and table layout; the screen, artwork,
 * scoring and rewards are shared. Every mode has Easy and Hard, and each pair keeps its own best score
 * and leaderboard key; the Spellitaire board adds them all together.
 */
import {
  canUndo,
  deal,
  draw,
  hasUsefulMove,
  liveScore,
  move,
  rewardsFor,
  takeHint,
  undo,
  type KlondikeRewards,
  type KlondikeState,
  type PileId as KlondikePile,
} from './klondike'
import {
  dealFlipflop,
  ffCanUndo,
  ffDeal,
  ffHasUsefulMove,
  ffLiveScore,
  ffMove,
  ffRewardsFor,
  ffTakeHint,
  ffUndo,
  type FlipflopState,
} from './flipflop'
import { FLIPFLOP_TABLE } from './flipflopTable'
import {
  dealGolf,
  golfCanUndo,
  golfDraw,
  golfHasUsefulMove,
  golfLiveScore,
  golfMove,
  golfRewardsFor,
  golfTakeHint,
  golfUndo,
  type GolfState,
} from './golf'
import { GOLF_TABLE } from './golfTable'
import {
  dealFreecell,
  fcCanUndo,
  fcHasUsefulMove,
  fcLiveScore,
  fcMove,
  fcRewardsFor,
  fcTakeHint,
  fcUndo,
  type FreecellState,
} from './freecell'
import { FREECELL_TABLE } from './freecellTable'
import {
  dealPyramid,
  pyCanUndo,
  pyDraw,
  pyHasUsefulMove,
  pyLiveScore,
  pyMove,
  pyRewardsFor,
  pyTakeHint,
  pyUndo,
  type PyramidState,
} from './pyramid'
import { PYRAMID_TABLE } from './pyramidTable'
import {
  dealSpider,
  spCanUndo,
  spDeal,
  spDealBlocked,
  spHasUsefulMove,
  spLiveScore,
  spMove,
  spRewardsFor,
  spTakeHint,
  spUndo,
  type SpiderState,
} from './spider'
import { SPIDER_TABLE } from './spiderTable'
import type { Difficulty, SpellMode } from './keys'
import { KLONDIKE_TABLE } from './klondikeTable'
import type { PileId, TableHint, TableRules, TableState } from './table'

export { boardKey, isSpellMode, SPELLITAIRE_KEYS, type Difficulty, type SpellitaireKey, type SpellMode } from './keys'

/** What the screen reads from any mode's game. */
export type SpellGame = TableState & { moves: number; hints: number; undos: number; won: boolean }

/** One mode's rules as the screen uses them. Method syntax so each mode can keep its own state type. */
export interface SolitaireEngine<S extends SpellGame> {
  deal(seed: number, difficulty: Difficulty): S
  difficulty(state: S): Difficulty
  /** Tap on the stock: draw, recycle or deal, depending on the mode. */
  draw(state: S): S | null
  /** Why a tap on the stock did nothing, when the player should be told. */
  drawBlocked?(state: S): string | null
  move(state: S, from: PileId, index: number, to: PileId): S | null
  undo(state: S): S | null
  canUndo(state: S): boolean
  takeHint(state: S): { state: S; hint: TableHint }
  hasUsefulMove(state: S): boolean
  liveScore(state: S): number
  rewardsFor(state: S, seconds: number): KlondikeRewards
  readonly table: TableRules<S>
}

const CLASSIC: SolitaireEngine<KlondikeState> = {
  deal: (seed, difficulty) => deal(seed, difficulty === 'hard' ? 3 : 1),
  difficulty: (state) => (state.drawCount === 3 ? 'hard' : 'easy'),
  draw: (state) => draw(state),
  move: (state, from, index, to) => move(state, from as KlondikePile, index, to as KlondikePile),
  undo,
  canUndo,
  takeHint,
  hasUsefulMove,
  liveScore,
  rewardsFor,
  table: KLONDIKE_TABLE,
}

const FLIPFLOP: SolitaireEngine<FlipflopState> = {
  deal: dealFlipflop,
  difficulty: (state) => state.difficulty,
  draw: ffDeal,
  move: ffMove,
  undo: ffUndo,
  canUndo: ffCanUndo,
  takeHint: ffTakeHint,
  hasUsefulMove: ffHasUsefulMove,
  liveScore: ffLiveScore,
  rewardsFor: ffRewardsFor,
  table: FLIPFLOP_TABLE,
}

const PYRAMID: SolitaireEngine<PyramidState> = {
  deal: dealPyramid,
  difficulty: (state) => state.difficulty,
  draw: pyDraw,
  move: pyMove,
  undo: pyUndo,
  canUndo: pyCanUndo,
  takeHint: pyTakeHint,
  hasUsefulMove: pyHasUsefulMove,
  liveScore: pyLiveScore,
  rewardsFor: pyRewardsFor,
  table: PYRAMID_TABLE,
}

const FREECELL: SolitaireEngine<FreecellState> = {
  deal: dealFreecell,
  difficulty: (state) => state.difficulty,
  draw: () => null,
  move: fcMove,
  undo: fcUndo,
  canUndo: fcCanUndo,
  takeHint: fcTakeHint,
  hasUsefulMove: fcHasUsefulMove,
  liveScore: fcLiveScore,
  rewardsFor: fcRewardsFor,
  table: FREECELL_TABLE,
}

const SPIDER: SolitaireEngine<SpiderState> = {
  deal: dealSpider,
  difficulty: (state) => state.difficulty,
  draw: spDeal,
  drawBlocked: spDealBlocked,
  move: spMove,
  undo: spUndo,
  canUndo: spCanUndo,
  takeHint: spTakeHint,
  hasUsefulMove: spHasUsefulMove,
  liveScore: spLiveScore,
  rewardsFor: spRewardsFor,
  table: SPIDER_TABLE,
}

const GOLF: SolitaireEngine<GolfState> = {
  deal: dealGolf,
  difficulty: (state) => state.difficulty,
  draw: golfDraw,
  move: golfMove,
  undo: golfUndo,
  canUndo: golfCanUndo,
  takeHint: golfTakeHint,
  hasUsefulMove: golfHasUsefulMove,
  liveScore: golfLiveScore,
  rewardsFor: golfRewardsFor,
  table: GOLF_TABLE,
}

export const ENGINES: Record<SpellMode, SolitaireEngine<SpellGame>> = {
  classic: CLASSIC,
  flipflop: FLIPFLOP,
  pyramid: PYRAMID,
  freecell: FREECELL,
  spider: SPIDER,
  golf: GOLF,
}

export type ModeInfo = {
  id: SpellMode
  name: string
  /** One line on the mode tile. */
  blurb: string
  /** What Easy and Hard change, shown on the difficulty buttons. */
  levels: Record<Difficulty, string>
}

export const SPELL_MODES: readonly ModeInfo[] = [
  { id: 'classic', name: 'Classic', blurb: 'Build down, alternate colours', levels: { easy: 'Draw 1', hard: 'Draw 3' } },
  { id: 'flipflop', name: 'Flipflop', blurb: 'Build up or down, mix suits', levels: { easy: '1 suit', hard: '2 suits' } },
  { id: 'spider', name: 'Spider', blurb: 'Build King to Ace runs to clear', levels: { easy: '1 suit', hard: '2 suits' } },
  { id: 'pyramid', name: 'Pyramid', blurb: 'Pair cards that make 13', levels: { easy: '3 passes', hard: '1 pass' } },
  { id: 'freecell', name: 'FreeCell', blurb: 'Four free cells, plan ahead', levels: { easy: 'Gentle deals', hard: 'Tricky deals' } },
  { id: 'golf', name: 'Golf', blurb: 'Play one higher or lower', levels: { easy: 'King to Ace joins', hard: 'No joining' } },
]

/** Mode tiles still to come, shown as "Coming soon". */
export const COMING_SOON_MODES = 0

export function modeInfo(mode: SpellMode) {
  return SPELL_MODES.find((info) => info.id === mode) ?? SPELL_MODES[0]
}
