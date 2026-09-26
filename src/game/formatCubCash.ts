/** Format Cub Cash with thousand separators, e.g. 100000 → "100,000". */
export function formatCubCash(amount: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0))
  return safe.toLocaleString('en-US')
}
