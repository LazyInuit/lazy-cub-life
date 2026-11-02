/**
 * Provisional Spellitaire scoring and rewards. Every number here can be rebalanced after testing.
 * The engine and the screen read these; nothing else hard-codes them.
 */
export const KLONDIKE_SCORING = {
  /** A card stacked in a column (or a King into an empty one), the first time for each card. */
  stackCard: 5,
  /** Any card onto a foundation. */
  toFoundation: 10,
  /** A face-down tableau card turned over by a move. */
  revealCard: 5,
  /** Taking a card back off a foundation. Larger than toFoundation, so moving back and forth never pays. */
  foundationToTableau: -15,
  /** Turning the waste back into the stock. Free, so going through the deck again never costs points. */
  recycleStock: 0,
  /** Each hint used. Kept after undo. */
  hint: -10,
  /** Each undo, on top of taking back the undone move's points. Kept after undo. */
  undo: -5,
  /** Only for a completed game. */
  winBonus: 2500,
  /** Time bonus for a completed game: this much, less timeBonusPerSecond for every second played. */
  timeBonusMax: 1500,
  timeBonusPerSecond: 2,
} as const

/**
 * Pyramid points. Hints, undos and the win and speed bonuses come from KLONDIKE_SCORING. A cleared
 * pyramid earns about as many move points as a Classic or Flipflop win.
 */
export const PYRAMID_SCORING = {
  /** Each pyramid card removed. */
  clearPyramidCard: 15,
  /** Each stock card paired away. */
  clearStockCard: 5,
  /** Each pyramid card uncovered by a removal. */
  uncoverCard: 5,
  /** Cub Cash for each pyramid row cleared (7 a game at most). A win adds the usual win coins. */
  rowCoins: 1,
} as const

/**
 * Golf points. A cleared tableau earns about as many move points as a win in the other modes:
 * 35 cards with streaks, plus stock left unused. Hints, undos and the win bonus come from KLONDIKE_SCORING.
 */
export const GOLF_SCORING = {
  /** Each tableau card played onto the waste. */
  clearCard: 10,
  /** Extra for each card in a row without drawing, after the first: +2, +4, ... */
  streakStep: 2,
  /** Most extra a single card can earn from a streak. */
  streakCap: 10,
  /** At a win, for each stock card never drawn. */
  stockLeft: 10,
  /** Cub Cash for every 5 cards in a row without drawing (once per streak step). */
  streakCoinEvery: 5,
} as const

/**
 * Spider points. Moving cards earns nothing on its own; turning cards over and clearing King-to-Ace
 * runs do. A win earns about as many move points as a Classic win (44 cards turned, 8 runs). Hints,
 * undos and the win bonus come from KLONDIKE_SCORING.
 */
export const SPIDER_SCORING = {
  /** A face-down card turned over. */
  revealCard: 5,
  /** A King-to-Ace run cleared. */
  completeRun: 60,
  /** Cub Cash for each run cleared (8 a game at most). A win adds the usual win coins. */
  runCoins: 1,
  /**
   * The speed bonus drops half as fast as in the other modes, as a Spider game has twice the cards
   * and takes a lot longer.
   */
  timeBonusPerSecond: 1,
} as const

export const SOLITAIRE_REWARDS = {
  /** XP for each card stacked in a column, once per card. */
  xpPerStack: 1,
  /** XP for each card that reaches a foundation, once per card. */
  xpPerHome: 1,
  /** Extra XP for a completed game. A typical win gives about 100 XP; a good unfinished game about 50. */
  winXp: 10,
  /** Cub Cash for a completed Easy game in any mode, on top of the coins earned in play. */
  winCoins: 15,
  /** Cub Cash for a completed Hard game in any mode, which is won far less often. */
  hardWinCoins: 30,
  /** Cub Cash for a Queen put on a King or a Jack put on a Queen, once per card (8 a game at most). */
  faceStackCoins: 1,
  /** Cub Cash for each Ace put on a foundation, once per Ace. */
  aceCoins: 1,
  /** Highest score the server accepts for one game. */
  maxScore: 20000,
} as const
