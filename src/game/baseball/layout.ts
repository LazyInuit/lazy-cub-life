import { ART, FIELD, FIT, type Vec3 } from './config'

export type ArtBox = {
  x: number
  y: number
  w: number
  h: number
  /** True when the picture is narrower than the screen and the sides need the blurred fill. */
  sideFill: boolean
}

/**
 * Places the stadium picture without distorting it. Fills the width and crops rows outside the
 * hard band; if the hard band still does not fit, shrinks the picture and leaves side gaps.
 */
export function fitArt(viewW: number, viewH: number, aspect = ART.aspect, fit = FIT): ArtBox {
  if (viewW <= 0 || viewH <= 0) return { x: 0, y: 0, w: 0, h: 0, sideFill: false }
  let w = viewW
  let h = w / aspect
  if (h < viewH) {
    h = viewH
    w = h * aspect
    return { x: (viewW - w) / 2, y: 0, w, h, sideFill: false }
  }
  const hardShare = fit.hardBottom - fit.hardTop
  if (hardShare * h > viewH) {
    h = viewH / hardShare
    w = h * aspect
    return { x: (viewW - w) / 2, y: -fit.hardTop * h, w, h, sideFill: w < viewW - 0.5 }
  }
  const ideal = ((fit.softTop + fit.softBottom) / 2) * h - viewH / 2
  let top = Math.min(fit.hardTop * h, Math.max(fit.hardBottom * h - viewH, ideal))
  top = Math.min(h - viewH, Math.max(0, top))
  return { x: 0, y: -top, w, h, sideFill: false }
}

export type Calibration = {
  /** Camera position is (0, height, distance), looking toward -z and pitched down. */
  height: number
  distance: number
  pitch: number
  /** Focal length in picture heights. */
  focal: number
  /** Picture row of the lens centre. */
  centreY: number
  aspect: number
  /** Vertical field of view, degrees, of a picture centred on the lens. For display only. */
  fov: number
}

/** Distance-scaled height (camera height / ground distance) for a ground point whose row is `q` focal lengths below the lens centre line. */
function groundRatio(q: number, t: number) {
  return (t - q) / (1 + q * t)
}

/**
 * Solves a pinhole camera for the painted perspective: horizon, plate front edge (z = 0) and
 * pitcher's rubber rows, with the plate's painted width fixing the focal length.
 */
export function calibrate(aspect = ART.aspect, art = ART, field = FIELD): Calibration {
  const cy = art.opticalY
  const run = Math.abs(field.rubberZ)
  let focal = 1
  let height = 1.2
  let distance = 2.5
  let t = 0
  for (let i = 0; i < 40; i += 1) {
    t = (cy - art.horizonY) / focal
    const rp = groundRatio((cy - art.plateFrontY) / focal, t)
    const rr = groundRatio((cy - art.rubberY) / focal, t)
    distance = (run * rr) / Math.max(1e-6, rp - rr)
    height = rp * distance
    const pitch = Math.atan(t)
    const depth = distance * Math.cos(pitch) + height * Math.sin(pitch)
    const next = ((art.plateWidthFrac / 2) * aspect * depth) / (field.plateWidth / 2)
    const done = Math.abs(next - focal) < 1e-10
    focal = next
    if (done) break
  }
  t = (cy - art.horizonY) / focal
  return {
    height,
    distance,
    pitch: Math.atan(t),
    focal,
    centreY: cy,
    aspect,
    fov: (2 * Math.atan(1 / (2 * focal)) * 180) / Math.PI,
  }
}

/** World z of the ground point painted at picture row `row`, straight ahead of the camera. */
export function groundZAtRow(cam: Calibration, row: number) {
  const ratio = groundRatio((cam.centreY - row) / cam.focal, Math.tan(cam.pitch))
  return cam.distance - cam.height / Math.max(1e-6, ratio)
}

export type ArtPoint = { x: number; y: number; depth: number }

/** World point to picture fractions (0..1 across and down the art box). */
export function projectArt(cam: Calibration, p: Vec3): ArtPoint {
  const vy = p.y - cam.height
  const vz = p.z - cam.distance
  const cos = Math.cos(cam.pitch)
  const sin = Math.sin(cam.pitch)
  const yc = vy * cos - vz * sin
  const depth = -vy * sin - vz * cos
  const d = Math.max(1e-4, depth)
  return {
    x: 0.5 + ((p.x / d) * cam.focal) / cam.aspect,
    y: cam.centreY - (yc / d) * cam.focal,
    depth,
  }
}
