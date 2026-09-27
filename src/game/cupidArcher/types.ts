export type PopText = {
  x: number
  y: number
  text: string
  life: number
  bull: boolean
}

export type BullBurst = {
  x: number
  y: number
  life: number
  maxLife: number
}

export type ArcherTarget = {
  x: number
  y: number
  r: number
  vx: number
  vy: number
}

export type ArcherArrow = {
  x: number
  y: number
  vx: number
  vy: number
  hit: boolean
  /** Tip point the aim line ended on — arrow scores when the tip reaches this. */
  aimX: number
  aimY: number
  /** Closest tip-to-aim distance seen so far. */
  aimDist: number
  passedAim: boolean
}

export type ArcherRound = {
  w: number
  h: number
  /** Seconds played — used alongside score for pacing helpers. */
  elapsed: number
  /** Countdown; round ends at 0. */
  timeLeft: number
  lives: number
  score: number
  combo: number
  hits: number
  shots: number
  bullseyes: number
  target: ArcherTarget
  arrow: ArcherArrow | null
  aiming: boolean
  pullX: number
  pullY: number
  pops: PopText[]
  bursts: BullBurst[]
  flash: number
  /** Stronger red-gold screen flash for perfect center hits. */
  bullFlash: number
  respawn: number
}
