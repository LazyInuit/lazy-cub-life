/**
 * On tablets the whole app is drawn larger, keeping its phone layout: the phone frame keeps its
 * width and is scaled up evenly until it fills the screen's height, with bars on the sides.
 * Phones and desktop browsers are left exactly as they were.
 *
 * Inside a scaled frame, getBoundingClientRect and pointer clientX/clientY are in screen pixels,
 * while CSS sizes and canvas drawing are in the frame's own pixels. Code that mixes the two goes
 * through the helpers below.
 */

/** The frame's width in its own pixels, as on the largest phones. */
const FRAME_WIDTH = 430
/** The height the frame is laid out at before scaling, if the screen's shape allows. */
const FRAME_HEIGHT = 920
/** Smaller gains than this are not worth scaling for. */
const MIN_SCALE = 1.05

let scale = 1

/** How much the app is scaled up on this screen. 1 on phones and desktops. */
export function frameScale(): number {
  return scale
}

/** An element's size in the app's own pixels, as its CSS sees it. */
export function layoutSize(element: Element): { width: number; height: number } {
  const rect = element.getBoundingClientRect()
  return { width: rect.width / scale, height: rect.height / scale }
}

/** A pointer position relative to an element, in the app's own pixels. */
export function layoutPoint(element: Element, clientX: number, clientY: number): { x: number; y: number } {
  const rect = element.getBoundingClientRect()
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
}

/** Canvas pixels per app pixel: the screen's pixel ratio, raised by the frame scale so enlarged art stays sharp. */
export function canvasRatio(cap = 2): number {
  return Math.min(window.devicePixelRatio || 1, cap) * scale
}

function updateFrameScale() {
  const root = document.documentElement
  const width = window.innerWidth
  const height = window.innerHeight
  // Touch-first screens only: tablets. A desktop browser window keeps its usual frame.
  const touch = window.matchMedia('(pointer: coarse)').matches
  const fit = Math.min(width / FRAME_WIDTH, height / FRAME_HEIGHT)
  if (!touch || fit < MIN_SCALE) {
    scale = 1
    root.classList.remove('frame-scaled')
    root.style.removeProperty('--frame-scale')
    root.style.removeProperty('--app-w')
    root.style.removeProperty('--app-h')
    return
  }
  scale = fit
  root.classList.add('frame-scaled')
  root.style.setProperty('--frame-scale', String(fit))
  root.style.setProperty('--app-w', `${FRAME_WIDTH}px`)
  // Always the full screen height once scaled, even when the width is what limits the scale.
  root.style.setProperty('--app-h', `${height / fit}px`)
}

export function applyFrameScale() {
  updateFrameScale()
  window.addEventListener('resize', updateFrameScale)
  window.addEventListener('orientationchange', updateFrameScale)
}
