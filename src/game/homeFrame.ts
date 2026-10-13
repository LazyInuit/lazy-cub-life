/**
 * Safari's visible page, read from the phone: 393 wide by 641 tall.
 * The installed app uses this same frame and leaves the spare screen black.
 */
export const HOME_FRAME = { width: 393, height: 641 }

export function pageHeightForWidth(width: number) {
  return Math.round((width * HOME_FRAME.height) / HOME_FRAME.width)
}

export function isStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}
