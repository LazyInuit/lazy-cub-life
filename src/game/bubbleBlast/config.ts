/**
 * Bubble Blast tuning. Everything runs in one fixed logical field that is scaled
 * to the screen, so the grid and the physics are the same on every phone.
 */

/**
 * The background picture fills the screen. Its glowing red line is the danger line and
 * the bottom of its sign is the ceiling, so the play area comes from the picture.
 * Positions are shares of the picture: width over height, then heights from the top.
 */
export const ART_ASPECT = 853 / 1847
export const ART_SIGN_BOTTOM = 262 / 1847
export const ART_RED_LINE = 1201 / 1847
/** Top of the sign, which sits flush with the top of the screen. The sky above it is cut off. */
export const ART_SIGN_TOP = 80 / 1847

/** Logical field width. The picture is drawn exactly this wide. */
export const FIELD_W = 360
/** Picture height in field units. */
export const ART_H = FIELD_W / ART_ASPECT
/** Field units of picture above the ceiling: sky, then the sign. */
export const ART_ABOVE = ART_SIGN_BOTTOM * ART_H
/** The field runs from the ceiling to the bottom of the picture. */
export const FIELD_H = ART_H - ART_ABOVE
/** Screen pixels left as a border down each side of the field. */
export const SIDE_BORDER = 0

/** Bubbles in an unshifted row. Shifted rows hold one fewer. */
export const COLS = 8
export const BUBBLE_D = FIELD_W / COLS
export const BUBBLE_R = BUBBLE_D / 2
/** Vertical distance between hex rows. */
export const ROW_H = (BUBBLE_D * Math.sqrt(3)) / 2

/** A settled bubble whose bottom edge reaches this line ends the game. Leaves 10 rows of play. */
export const DANGER_Y = (ART_RED_LINE - ART_SIGN_BOTTOM) * ART_H
/** The cub stands on the deck under the danger line, so it never covers the board. */
export const CUB_TOP = DANGER_Y + 8
export const CUB_H = 150
/** Picture width over height, and where its mouth is as a share of the picture. */
export const CUB_ASPECT = 978 / 1371
export const CUB_MOUTH_FX = 0.7566
export const CUB_MOUTH_FY = 0.3487

/** Where the shot leaves: a bubble-gum bubble on the cub's lips, out in front of its face. */
export const LAUNCH_X = FIELD_W / 2
export const LAUNCH_Y = Math.round(CUB_TOP + CUB_H * CUB_MOUTH_FY - CUB_H * 0.075)
/** The cub's mouth. The gum bubble's neck joins here. */
export const MOUTH_X = LAUNCH_X - CUB_H * 0.175
export const MOUTH_Y = LAUNCH_Y + CUB_H * 0.075
/** The gum bubble's neck starts this far from the mouth point toward the bubble, on the lips. */
export const GUM_LIP_OFFSET = CUB_H * 0.046
/** The waiting bubble is drawn this much smaller, then grows to full size as it is blown. */
export const GUM_SCALE = 0.69
/** Time for the cub to blow the next gum bubble out. The next shot waits for it. */
export const GUM_BLOW_SECONDS = 0.32

/** Mega button, on the right of the deck beside the cub. */
export const MEGA_X = 270
export const MEGA_Y = DANGER_Y + 70
export const MEGA_BUTTON_R = 28
/** The lowest point that must stay on screen: the gum bubble and the Mega button with its label. */
export const MIN_VISIBLE_BOTTOM = Math.max(LAUNCH_Y + 24, MEGA_Y + MEGA_BUTTON_R + 14)
/** Logical units per second. Kept steady as the game gets harder. */
export const SHOT_SPEED = 1050
/** Largest move in one physics step, well under a bubble radius so shots cannot pass through. */
export const SHOT_STEP = 4
/** Centre distance that counts as touching. A little under one diameter so shots can thread gaps. */
export const HIT_DIST = BUBBLE_D * 0.86
/** Shots must leave at least this far above horizontal (degrees). */
export const MIN_AIM_DEG = 10
/** The aim never treats the finger as lower than this far above the mouth. */
export const AIM_FLOOR = 36
/** Pause after a shot resolves before the next one can fire. */
export const SETTLE_SECONDS = 0.12

/** Rows on the board at the start, and after a board clear. */
export const START_ROWS = 3
export const START_GOLDEN = 1
export const MAX_GOLDEN = 2
/** Chance a new ceiling row carries a coin bubble. */
export const GOLDEN_ROW_CHANCE = 0.12
/** Chance a new bubble copies a neighbour's colour, which builds clusters instead of lone bubbles. */
export const CLUSTER_CHANCE = 0.5

export const COLOURS = ['blue', 'red', 'green', 'purple', 'yellow'] as const

/** New ceiling rows start part full and fill up as the player improves. */
export const ROW_DENSITY_START = 0.7
export const ROW_DENSITY_MAX = 1
export const ROW_DENSITY_PER_SUCCESS = 0.003

/**
 * Misses in a row before the ceiling drops a row. It tightens as the run goes on,
 * counted in successful shots: 3 at the start, then 2, then every miss drops it.
 */
export const MISS_LIMITS = [
  { from: 40, limit: 1 },
  { from: 15, limit: 2 },
  { from: 0, limit: 3 },
] as const
/** How long the board takes to slide down one row. The next shot waits for it. */
export const CEILING_DROP_SECONDS = 0.45

export const MATCH_MIN = 3
export const POINTS_POP = 5
/** Half points are allowed here: each shot's total is rounded to whole points. */
export const POINTS_DROP = 7.5
export const POINTS_GOLDEN = 50
export const POINTS_BOARD_CLEAR = 250
/** Flat bonus for the largest clear reached in one shot. */
export const CLEAR_BONUSES = [
  { at: 15, bonus: 150 },
  { at: 10, bonus: 75 },
  { at: 6, bonus: 25 },
] as const
/** Multiplier for the 1st, 2nd, 3rd, 4th and 5th+ successful shot in a row. */
export const COMBO_MULTIPLIERS = [1, 1.5, 2, 2.5, 3] as const
/** Clears this large get the big effect and sound. */
export const BIG_CLEAR = 10

/** Bubbles removed to fill the Mega meter. */
export const MEGA_FILL = 30
/** A Mega Bubble clears every bubble with any part this close to the impact. */
export const MEGA_RADIUS = BUBBLE_D * 2

/** Flat XP: 100 points award 0.5 XP, like Ninja Cub Dojo. */
export const BUBBLE_XP_PER_SCORE = 0.005
/** Cub Cash for each coin bubble cleared. Points never pay Cub Cash. */
export const CASH_PER_COIN_BUBBLE = 1
