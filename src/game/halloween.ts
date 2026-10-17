/**
 * Seasonal home theme. Set this to false to hide the pumpkin and use the
 * original day and night backgrounds again.
 */
export const HALLOWEEN_THEME = true

const LIT_KEY = 'lazy-lion-halloween-pumpkin'

function readLit() {
  try {
    return localStorage.getItem(LIT_KEY) === 'on'
  } catch {
    return false
  }
}

let lit = HALLOWEEN_THEME && readLit()

export function pumpkinLit() {
  return HALLOWEEN_THEME && lit
}

/** Remember a lit or unlit pumpkin for this visit and the next one on this phone. */
export function setPumpkinLit(on: boolean) {
  if (!HALLOWEEN_THEME) return
  if (lit === on) return
  lit = on
  try {
    if (lit) localStorage.setItem(LIT_KEY, 'on')
    else localStorage.removeItem(LIT_KEY)
  } catch {
    // The choice still applies for this visit.
  }
}

let visitLit: boolean | null = null

/** While visiting another home, draw that player's pumpkin instead of this one. Null puts this one back. */
export function setVisitHalloween(on: boolean | null) {
  visitLit = on
}

/** The pumpkin state for the room on screen: the visited home's, or this player's own. */
export function roomPumpkinLit() {
  if (!HALLOWEEN_THEME) return false
  return visitLit ?? lit
}

/** Light the pumpkin, or put it out if it is already lit. */
export function togglePumpkin() {
  setPumpkinLit(!lit)
}

/** About a quarter of the screen wide, sitting farther forward on the right of the table. */
export function pumpkinPlacement(stageW: number, tableEdge: number, imageW: number, imageH: number) {
  const w = stageW * 0.243
  const h = imageW > 0 ? w * (imageH / imageW) : w
  const x = stageW - w - stageW * 0.04
  const y = tableEdge - h * 0.78
  return { x, y, w, h }
}
