/** Format Cub Cash with thousand separators, e.g. 100000 → "100,000". */
export function formatCubCash(amount: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0))
  return safe.toLocaleString('en-US')
}

/** Characters that fit the Cub Cash pill at full size: "999,999". */
const PILL_FIT_CHARS = 7

/** Text size for an amount in the Cub Cash pill: full size up to six figures, then shrunk to fit. */
export function cubCashPillSize(text: string): { fontSize: string } | undefined {
  if (text.length <= PILL_FIT_CHARS) return undefined
  return { fontSize: `${((0.9 * PILL_FIT_CHARS) / text.length).toFixed(3)}rem` }
}
