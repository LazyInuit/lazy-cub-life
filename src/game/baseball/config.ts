/** World units are metres. Origin is the front (pitcher-side) edge of home plate on the ground; -z points at the mound. */
export type Vec3 = { x: number; y: number; z: number }

/** Picture fractions, measured on the stadium art (any resolution of the same picture). */
export const ART = {
  aspect: 1290 / 2150,
  /**
   * Row the lens points through. The picture is the top 77% of a taller painting whose middle was
   * the lens centre, so it sits below this picture's middle.
   */
  opticalY: 0.651,
  horizonY: 0.566,
  rubberY: 0.617,
  moundY: 0.629,
  moundX: 0.5,
  /** The plate itself is below the picture's bottom edge; these rows come from the full painting. */
  plateFrontY: 1.042,
  plateWidthFrac: 0.328,
  plateBackY: 1.172,
  /** The blank blue panel inside the painted scoreboard. */
  board: { left: 0.165, top: 0.19, right: 0.835, bottom: 0.286 },
}

/** Picture rows that must stay on screen, and rows we would rather keep. */
export const FIT = {
  hardTop: 0.035,
  hardBottom: 0.95,
  softTop: 0,
  softBottom: 1,
}

/** Real-world measures the camera is solved against. */
export const FIELD = {
  plateWidth: 0.432,
  plateDepth: 0.432,
  /** 60 ft 6 in to the back point of the plate, less the plate's depth. */
  rubberZ: -18.01,
  fenceZ: -108,
  fenceHeight: 3,
  groundY: 0,
}

export const MACHINE = {
  /** Cartoon size so it reads clearly on the small painted mound. */
  width: 1.75,
  aspect: 293 / 300,
  /** Fraction down the picture where the base touches the ground. */
  baseFrac: 0.95,
  ball: { x: 0.5, y: 0.3, diameterFrac: 0.153 },
  recoil: 0.22,
  reload: 0.35,
  /** Seconds to drive between firing spots. */
  moveTime: 0.7,
  /** Height of the little bounces while driving, metres, and how many there are. */
  moveHop: 0.12,
  moveHops: 3,
}

export type MachineSpot = {
  id: string
  tier: 1 | 2 | 3 | 4
  /** Where the machine appears across the picture (0 left edge, 1 right edge). */
  x: number
  /** Metres from the painted mound centre toward the plate (negative is further away). */
  dz: number
}

/** Mostly left of centre: the resting bat covers the right of the field. */
export const MACHINE_SPOTS: MachineSpot[] = [
  { id: 'mound', tier: 1, x: 0.5, dz: 0 },
  { id: 'mound-left', tier: 2, x: 0.3, dz: 0.5 },
  { id: 'mound-right', tier: 2, x: 0.6, dz: 0.5 },
  { id: 'deep', tier: 2, x: 0.5, dz: -5 },
  { id: 'left', tier: 3, x: 0.18, dz: 2 },
  { id: 'deep-right', tier: 3, x: 0.6, dz: -6 },
  { id: 'close', tier: 3, x: 0.5, dz: 5 },
  { id: 'deep-left', tier: 4, x: 0.2, dz: -4 },
  { id: 'close-left', tier: 4, x: 0.28, dz: 6 },
  { id: 'close-right', tier: 4, x: 0.56, dz: 6 },
]

/** The first pitches of a game all come from the mound. */
export const MOUND_PITCHES = 3

/** After the opening pitches, a score below `maxScore` uses these spot-tier weights (relative; 0 means never). */
export const SPOT_BANDS: { maxScore: number; weights: Record<number, number> }[] = [
  { maxScore: 400, weights: { 1: 30, 2: 70, 3: 0, 4: 0 } },
  { maxScore: 1200, weights: { 1: 20, 2: 50, 3: 30, 4: 0 } },
  { maxScore: 2500, weights: { 1: 10, 2: 35, 3: 35, 4: 20 } },
  { maxScore: Infinity, weights: { 1: 10, 2: 25, 3: 35, 4: 30 } },
]

/** Flight time scales with distance this much (0 = same everywhere, 1 = same ball speed everywhere). */
export const SPOT_TIME_SHARE = 0.45

export const BALL = {
  radius: 0.1,
  /** Ball grows from its machine size to `radius` over this share of the pitch, hiding the swap. */
  sizeBlend: 0.25,
  spinPitch: 18,
  /** A hit ball never looks smaller than this share of its distance from the camera, so it stays trackable. */
  minApparent: 0.009,
}

/** Lower than a real zone so, from this low camera, the ball visibly drops toward the plate. */
export const STRIKE_ZONE = {
  centreY: 0.55,
  halfHeight: 0.25,
  halfWidth: 0.24,
}

/** The ball is judged as it crosses this plane. */
export const CONTACT_Z = -0.1

export type Difficulty = {
  /** Applies from this score up. */
  score: number
  /** Seconds from the chute to the contact plane for a normal pitch from the mound. */
  flightTime: number
  speedJitter: number
  /** Metres either side of the plate centre the pitch may end. */
  spread: number
  heightSpread: number
  curveChance: number
  /** Curve strength range, metres of sideways bend at the control point. */
  curve: [number, number]
  /** Fastball: chance and flight-time multiplier. */
  fastChance: number
  fastScale: number
  /** Change-up (slow, floaty): chance and flight-time multiplier. */
  slowChance: number
  slowScale: number
  gap: number
}

/** First row applies from 0. Starts slow, straight and dead centre; every column gets harder with score. */
export const DIFFICULTY: Difficulty[] = [
  { score: 0, flightTime: 1.55, speedJitter: 0.03, spread: 0, heightSpread: 0.04, curveChance: 0, curve: [0, 0], fastChance: 0, fastScale: 1, slowChance: 0, slowScale: 1, gap: 0.6 },
  { score: 250, flightTime: 1.42, speedJitter: 0.05, spread: 0.05, heightSpread: 0.08, curveChance: 0.1, curve: [0.15, 0.3], fastChance: 0.1, fastScale: 0.86, slowChance: 0.06, slowScale: 1.3, gap: 0.56 },
  { score: 700, flightTime: 1.3, speedJitter: 0.06, spread: 0.09, heightSpread: 0.12, curveChance: 0.2, curve: [0.2, 0.45], fastChance: 0.15, fastScale: 0.83, slowChance: 0.1, slowScale: 1.35, gap: 0.53 },
  { score: 1400, flightTime: 1.18, speedJitter: 0.07, spread: 0.12, heightSpread: 0.15, curveChance: 0.3, curve: [0.25, 0.6], fastChance: 0.2, fastScale: 0.8, slowChance: 0.13, slowScale: 1.4, gap: 0.5 },
  { score: 2500, flightTime: 1.06, speedJitter: 0.08, spread: 0.15, heightSpread: 0.18, curveChance: 0.4, curve: [0.3, 0.75], fastChance: 0.24, fastScale: 0.78, slowChance: 0.16, slowScale: 1.45, gap: 0.47 },
  { score: 4000, flightTime: 0.96, speedJitter: 0.09, spread: 0.18, heightSpread: 0.2, curveChance: 0.5, curve: [0.35, 0.9], fastChance: 0.28, fastScale: 0.76, slowChance: 0.18, slowScale: 1.5, gap: 0.44 },
  { score: 6500, flightTime: 0.88, speedJitter: 0.1, spread: 0.2, heightSpread: 0.22, curveChance: 0.6, curve: [0.4, 1], fastChance: 0.3, fastScale: 0.75, slowChance: 0.2, slowScale: 1.5, gap: 0.42 },
]

/** A change-up is this many times likelier right after a fastball or a close-in throw. */
export const CHANGE_UP_AFTER_FAST = 2.5
/** Change-ups float: their arc is multiplied by this. */
export const SLOW_ARC = 1.7
/** No pitch, however fast or close, arrives quicker than this. */
export const MIN_FLIGHT = 0.62

export const PITCH = {
  firstDelay: 1.3,
  /** Peak height added to the straight line, metres. */
  arc: 0.28,
  /** After the contact plane, a missed ball keeps going until it is this far behind the plate. */
  passZ: 2,
}

/** The handle end stays fixed low in the right foreground; the barrel turns about it. */
export const BAT = {
  hands: { x: 0.35, y: 0.495, z: 0.6 } as Vec3,
  /** Barrel direction when nobody is holding the bat. */
  rest: { x: -0.09, y: 0.63, z: -0.77 } as Vec3,
  /** Lowest the barrel may point (direction y), so it never dives into the ground. */
  minLift: -0.15,
  /** A grab closer to the handle than this share of the bat is treated as this far up it. */
  minGrab: 0.35,
  /** Seconds for the bat to swing back to rest after it is let go. */
  returnTime: 0.25,
}

/** Layout pixels and seconds. */
export const FLICK = {
  /** A touch must start within this many layout pixels of the bat to grab it. */
  grabRadius: 34,
  /** The bat only connects when the finger is moving at least this fast. */
  minSpeed: 600,
  /** Finger speed is measured over this many seconds of samples. */
  window: 0.06,
  speedRef: 1400,
  minPower: 0.8,
  maxPower: 1.25,
  /** A fast swipe this close to the ball's arrival without a hit counts as a swing and a miss. */
  swingMemory: 0.35,
  /** Extra layout pixels of forgiveness when testing whether the bat crossed the ball. */
  hitPad: 10,
}

export type Quality = 'perfect' | 'good' | 'weak' | 'miss'

/** Seconds either side of the ball reaching the contact plane. */
export const WINDOWS = { perfect: 0.045, good: 0.095, weak: 0.16 }

export const LAUNCH = {
  perfect: { speed: 43, angle: 27, spray: 10 },
  good: { speed: 35, angle: 20, spray: 22 },
  weak: { speed: 21, angle: 6, spray: 34 },
  /** A late weak hit pops up instead of rolling. */
  weakLateAngle: 58,
  /** Degrees added for a flick going straight up, removed for one going straight down. */
  flickLift: 8,
  /** Degrees of sideways aim from the flick's left/right direction. */
  flickSpray: 6,
}

export const FLIGHT = {
  gravity: 9.8,
  drag: 0.0032,
  /** Upward pull from backspin, as a share of gravity. */
  lift: 0.12,
  bounce: 0.34,
  rollFriction: 2.6,
  maxTime: 4.2,
  homeRunTime: 2.8,
  /** A hit plays this much faster than real time; the path is unchanged. */
  timeScale: 2.2,
  /** Seconds after the ball first lands (or hits the wall), or clears the fence, before the result shows. */
  settleLanded: 0.35,
  settleHomeRun: 0.4,
}

export const SCORE = {
  ground: 10,
  short: 25,
  deep: 50,
  deepFar: 75,
  homeRun: 100,
  perfectHomeRun: 150,
  /** Landing distance from the plate, metres. */
  shortFrom: 24,
  deepFrom: 62,
  deepFarFrom: 86,
}

/**
 * The perfect hit that makes this many in a row earns 1 Cub Cash, and so does every perfect after it.
 * Any lesser hit or a strike ends the run.
 */
export const PERFECTS_PER_CASH = 3

export const STRIKES = 3

/** XP for each point scored: a 1,000-point game is worth 20 XP. */
export const BASEBALL_XP_PER_SCORE = 0.02
export const RESULT_PAUSE = 0.75
export const CANVAS_RATIO = 1.75
