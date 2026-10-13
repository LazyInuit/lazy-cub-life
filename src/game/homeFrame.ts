/**
 * Safari's visible page, measured on the reference screenshots (472×1024).
 * The game starts under the address bar (y=124) and stops above the bottom
 * toolbar (y=932). That is one frame for the room, the cub, and the buttons.
 * The installed app uses this same frame and leaves the spare screen black.
 */
export const HOME_FRAME = { width: 472, height: 808 }

export function pageHeightForWidth(width: number) {
  return Math.round((width * HOME_FRAME.height) / HOME_FRAME.width)
}

export function isStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}
