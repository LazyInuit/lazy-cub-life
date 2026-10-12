/**
 * Safari's visible page on the iPhone, from the side-by-side screenshots.
 * 472px wide and 777px tall between the address bar and the bottom toolbar.
 * The installed app uses this same shape at full width. Height is not a
 * percentage of the screen, so the taller PWA screen cannot stretch the game.
 */
const SAFARI_ASPECT = 472 / 777

function isHomeScreenApp() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

/**
 * Letterbox the home-screen app around Safari's page.
 * The game keeps Safari's width and height. Black bands sit outside that box.
 */
function updateSafariFrame() {
  const root = document.documentElement
  const width = window.innerWidth
  const available = window.innerHeight
  const pageH = Math.round(width / SAFARI_ASPECT)
  if (!isHomeScreenApp() || width >= 520 || pageH < 1 || pageH >= available - 1) {
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
