import type { BonusId, FruitId, HazardId } from './config'

export type BodyKind = 'fruit' | 'bonus' | 'bomb'

export type Body = {
  id: number
  kind: BodyKind
  fruitId?: FruitId
  bonusId?: BonusId
  hazardId?: HazardId
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  spin: number
  radius: number
  points: number
  color: string
  accent: string
  scale: number
  alive: boolean
  costsLife: boolean
}

export type Half = {
  id: number
  fruitId?: FruitId
  bonusId?: BonusId
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  spin: number
  radius: number
  color: string
  accent: string
  side: 'left' | 'right'
  life: number
}

export type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  size: number
}

export type FloatText = {
  x: number
  y: number
  text: string
  life: number
  max: number
  color: string
}

export type TrailPoint = { x: number; y: number; life: number }

export type ComboFlash = { label: string; life: number }

export type RunPhase = 'playing' | 'ended'

export type EngineState = {
  phase: RunPhase
  endReason: 'lives' | 'bomb' | null
  score: number
  lives: number
  elapsed: number
  nextSpawn: number
  bodies: Body[]
  halves: Half[]
  particles: Particle[]
  floats: FloatText[]
  trail: TrailPoint[]
  comboFlash: ComboFlash | null
  swipeSlices: number
  width: number
  height: number
  nextId: number
}
