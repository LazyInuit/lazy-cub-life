import { lerp, smoothstep } from '../math';

/** 0 at the start, approaching 1 forever. Never steps between levels. */
export function curve(distance: number): number {
  return 1 - Math.exp(-distance / 1700);
}

export function riverSpeed(t: number): number {
  return lerp(138, 430, t);
}

export function rowSpacing(t: number): number {
  return lerp(360, 206, t);
}

export function gapWidth(t: number): number {
  return lerp(196, 114, t);
}

export function movingChance(t: number): number {
  return smoothstep(0.28, 0.88, t) * 0.62;
}

export function hazardChance(t: number): number {
  return smoothstep(0.2, 0.82, t);
}
