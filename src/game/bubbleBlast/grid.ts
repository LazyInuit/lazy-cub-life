import { BUBBLE_D, BUBBLE_R, COLS, DANGER_Y, ROW_H } from './config'
import type { BubbleKind, Cell, GridPos } from './types'

export type Grid = (Cell | null)[][]

/** Shifted rows sit half a bubble to the right and hold one fewer bubble. */
export function rowShifted(row: number, parity: 0 | 1) {
  return (row + parity) % 2 === 1
}

export function rowCols(row: number, parity: 0 | 1) {
  return rowShifted(row, parity) ? COLS - 1 : COLS
}

export function cellX(row: number, col: number, parity: 0 | 1) {
  return BUBBLE_R + col * BUBBLE_D + (rowShifted(row, parity) ? BUBBLE_R : 0)
}

export function cellY(row: number) {
  return BUBBLE_R + row * ROW_H
}

/** First row whose bubbles would touch the danger line. */
export const DANGER_ROW = Math.ceil((DANGER_Y - BUBBLE_D) / ROW_H)

export function emptyRow(row: number, parity: 0 | 1): (Cell | null)[] {
  return Array.from({ length: rowCols(row, parity) }, () => null)
}

export function cellAt(grid: Grid, row: number, col: number): Cell | null {
  return grid[row]?.[col] ?? null
}

export function inGrid(grid: Grid, row: number, col: number, parity: 0 | 1) {
  return row >= 0 && col >= 0 && col < rowCols(row, parity) && row < grid.length
}

/** The six hex neighbours that exist on the board's width (rows may not exist yet). */
export function neighbours(row: number, col: number, parity: 0 | 1): GridPos[] {
  const shifted = rowShifted(row, parity)
  const across = shifted ? [col, col + 1] : [col - 1, col]
  const out: GridPos[] = [
    { row, col: col - 1 },
    { row, col: col + 1 },
  ]
  for (const r of [row - 1, row + 1]) {
    if (r < 0) continue
    for (const c of across) out.push({ row: r, col: c })
  }
  return out.filter((pos) => pos.col >= 0 && pos.col < rowCols(pos.row, parity))
}

export function occupied(grid: Grid): GridPos[] {
  const out: GridPos[] = []
  grid.forEach((cells, row) => cells.forEach((cell, col) => cell && out.push({ row, col })))
  return out
}

export function countBubbles(grid: Grid) {
  let total = 0
  for (const cells of grid) for (const cell of cells) if (cell) total += 1
  return total
}

/** Colours still on the board, Golden Paws excluded. */
export function coloursOnBoard(grid: Grid): Set<BubbleKind> {
  const found = new Set<BubbleKind>()
  for (const cells of grid) for (const cell of cells) if (cell && cell.kind !== 'gold') found.add(cell.kind)
  return found
}

const key = (pos: GridPos) => `${pos.row},${pos.col}`

/** Every same-colour bubble joined to start through hex neighbours. */
export function colourGroup(grid: Grid, start: GridPos, parity: 0 | 1): GridPos[] {
  const first = cellAt(grid, start.row, start.col)
  if (!first || first.kind === 'gold') return []
  const seen = new Set([key(start)])
  const stack = [start]
  const group: GridPos[] = []
  while (stack.length > 0) {
    const pos = stack.pop() as GridPos
    group.push(pos)
    for (const next of neighbours(pos.row, pos.col, parity)) {
      const k = key(next)
      if (seen.has(k)) continue
      const cell = cellAt(grid, next.row, next.col)
      if (!cell || cell.kind !== first.kind) continue
      seen.add(k)
      stack.push(next)
    }
  }
  return group
}

/** Bubbles with no path of neighbours up to the ceiling row. */
export function unsupported(grid: Grid, parity: 0 | 1): GridPos[] {
  const seen = new Set<string>()
  const stack: GridPos[] = []
  grid[0]?.forEach((cell, col) => {
    if (!cell) return
    seen.add(key({ row: 0, col }))
    stack.push({ row: 0, col })
  })
  while (stack.length > 0) {
    const pos = stack.pop() as GridPos
    for (const next of neighbours(pos.row, pos.col, parity)) {
      const k = key(next)
      if (seen.has(k) || !cellAt(grid, next.row, next.col)) continue
      seen.add(k)
      stack.push(next)
    }
  }
  return occupied(grid).filter((pos) => !seen.has(key(pos)))
}

/** Drop empty rows from the bottom so the grid only spans live bubbles. */
export function trimGrid(grid: Grid) {
  while (grid.length > 0 && grid[grid.length - 1].every((cell) => !cell)) grid.pop()
}

export function lowestRow(grid: Grid) {
  for (let row = grid.length - 1; row >= 0; row -= 1) if (grid[row].some(Boolean)) return row
  return -1
}

/** Board space a point is in, clamped to the field. */
export function nearestCell(x: number, y: number, parity: 0 | 1): GridPos {
  const row = Math.max(0, Math.round((y - BUBBLE_R) / ROW_H))
  const shift = rowShifted(row, parity) ? BUBBLE_R : 0
  const col = Math.round((x - BUBBLE_R - shift) / BUBBLE_D)
  return { row, col: Math.max(0, Math.min(rowCols(row, parity) - 1, col)) }
}
