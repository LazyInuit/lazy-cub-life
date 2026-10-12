/**
 * Safari's visible page on the phone, measured from the browser screenshot.
 * The page sits under the address bar and above the bottom toolbar: 77% of the screen.
 * The installed app is letterboxed to this height. It is not scaled.
 */
const SAFARI_PAGE = 0.77

function isHomeScreenApp() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

function fullScreenHeight() {
  const visible = window.innerHeight || 0
  let screenH = window.screen?.height || visible
  if (screenH > visible * 1.5) screenH = visible
  return Math.max(screenH, visible)
}

/**
 * In the home-screen app, keep the game at Safari's page size and center it.
 * The space above and below stays outside the game.
 */
function updateSafariFrame() {
  const root = document.documentElement
  const width = window.innerWidth
  const fullH = fullScreenHeight()
  const available = window.innerHeight || fullH
  const pageH = Math.round(fullH * SAFARI_PAGE)
  if (!isHomeScreenApp() || width >= 520 || pageH >= available - 1) {
    root.classList.remove('safari-frame')
    root.style.removeProperty('--safari-page-top')
    root.style.removeProperty('--safari-page-h')
    return
  }
  const top = Math.round((available - pageH) / 2)
  root.classList.add('safari-frame')
  root.style.setProperty('--safari-page-top', `${top}px`)
  root.style.setProperty('--safari-page-h', `${pageH}px`)
}

export function applySafariFrame() {
  updateSafariFrame()
  window.addEventListener('resize', updateSafariFrame)
  window.addEventListener('orientationchange', updateSafariFrame)
}
