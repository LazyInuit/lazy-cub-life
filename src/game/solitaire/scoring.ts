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

export const SOLITAIRE_REWARDS = {
  /** XP for each card stacked in a column, once per card. */
  xpPerStack: 1,
  /** XP for each card that reaches a foundation, once per card. */
  xpPerHome: 1,
  /** Extra XP for a completed game. A typical win gives about 100 XP; a good unfinished game about 50. */
  winXp: 10,
  /** Cub Cash for a completed Easy (draw 1) game, on top of the coins earned in play. */
  winCoins: 30,
  /** Cub Cash for a completed Hard (draw 3) game, which is won far less often. */
  hardWinCoins: 60,
  /** Cub Cash for a Queen put on a King or a Jack put on a Queen, once per card (8 a game at most). */
  faceStackCoins: 1,
  /** Cub Cash for each Ace put on a foundation, once per Ace. */
  aceCoins: 1,
  /** Highest score the server accepts for one game. */
  maxScore: 20000,
} as const
