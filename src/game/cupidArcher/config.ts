/** Flat XP. 100 score points award 2 XP. No level multiplier. */
export const ARCHER_XP_PER_SCORE = 0.02

/** Same as Lazy Dojo — three misses and the round ends. */
export const LIVES = 3

/** Countdown — round also ends when this hits zero. */
export const ROUND_SECONDS = 60

/** Score at which target difficulty reaches its max (free roam). */
export const DIFFICULTY_SCORE = 1000
/** Below this: stationary targets only. */
export const MOVE_AXIS_SCORE = 250
/** At/above this: free 2D roam. Between AXIS and FREE: left-right or up-down only. */
export const MOVE_FREE_SCORE = 650

export const RING_RED = 100
export const RING_GOLD = 40
export const RING_BLUE = 20
export const RING_WHITE = 10

/** Bonus seconds added to the countdown on a hit. */
export const TIME_RED = 5
export const TIME_GOLD = 0
export const TIME_BLUE = 0
export const TIME_WHITE = 0

export const MIN_PULL = 18
