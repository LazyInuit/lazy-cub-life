/** Opaque bounds of the cub PNG (skips empty top padding). */
export const CUB_SRC = { x: 66, y: 167, w: 1210, h: 1233 }

/** Drawn height as a fraction of the playfield. */
export const CUB_HEIGHT_FRAC = 0.39

/** Soft edge tucked slightly under the bottom of the screen. */
export const CUB_BOTTOM_OVERLAP = 0.012

/** Head center inside the drawn cub box (0–1). */
export const CUB_HEAD = { x: 0.5, y: 0.3 }

export type CubRect = { x: number; y: number; w: number; h: number }

export function cubRect(w: number, h: number): CubRect {
  const cubH = h * CUB_HEIGHT_FRAC
  const cubW = cubH * (CUB_SRC.w / CUB_SRC.h)
  return {
    x: (w - cubW) / 2,
    y: h - cubH + Math.max(2, h * CUB_BOTTOM_OVERLAP),
    w: cubW,
    h: cubH,
  }
}

export function headAim(w: number, h: number) {
  const cub = cubRect(w, h)
  return {
    x: cub.x + cub.w * CUB_HEAD.x,
    y: cub.y + cub.h * CUB_HEAD.y,
  }
}
