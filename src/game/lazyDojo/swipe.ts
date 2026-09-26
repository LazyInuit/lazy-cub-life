/** Segment–circle collision for swipe slicing. */

export function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/** Closest distance from point to segment AB. */
export function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax
  const aby = by - ay
  const len2 = abx * abx + aby * aby
  if (len2 < 0.0001) return Math.sqrt(dist2(px, py, ax, ay))
  let t = ((px - ax) * abx + (py - ay) * aby) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + abx * t
  const cy = ay + aby * t
  return Math.sqrt(dist2(px, py, cx, cy))
}

export function segmentHitsCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  return pointSegmentDistance(cx, cy, ax, ay, bx, by) <= radius
}
