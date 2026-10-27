/** The texture key of an obstacle in the KINDS list in rows.ts. */
export type ObstacleKind = string;

export interface ObstacleSpawn {
  kind: ObstacleKind;
  x: number;
  y: number;
  hw: number;
  hh: number;
  moving: boolean;
  spanL: number;
  spanR: number;
  freq: number;
  phase: number;
  /** Radians a second; 0 for obstacles that do not turn. */
  spin: number;
  /** Width the art is drawn at. */
  drawW: number;
  /** Vertical anchor of the art on the hit box, 0 top to 1 bottom. */
  originY: number;
  /** Draw the art mirrored. */
  flip: boolean;
  /** Art offset from the hit box centre, for bank trees whose roots lie on the grass. */
  artDX: number;
}

export interface GemSpawn {
  x: number;
  y: number;
  kind: 'gold' | 'silver';
}

export type PadKind = 'forward' | 'back';

export interface PadSpawn {
  x: number;
  y: number;
  kind: PadKind;
}

export interface RapidsSpawn {
  x: number;
  y: number;
}

export interface WhirlSpawn {
  x: number;
  y: number;
  /** 1 turns clockwise on screen, -1 anticlockwise. */
  dir: 1 | -1;
}

/** A finished run. Score is the distance in metres plus every coin and gem picked up. */
export interface RunResult {
  score: number;
  distance: number;
  /** Gold Kovu coins, each worth Cub Cash. */
  coins: number;
  /** Coins and silver gems together. */
  collectibles: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
