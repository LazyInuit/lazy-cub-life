/** Safari on iPhone 15 / iOS 26 keeps a 94px tab bar under the page. */
const SAFARI_BOTTOM_BAR = 94

function isHomeScreenApp() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

function safeTop() {
  const probe = document.createElement('div')
  probe.style.position = 'fixed'
  probe.style.visibility = 'hidden'
  probe.style.paddingTop = 'env(safe-area-inset-top)'
  document.body.appendChild(probe)
  const top = parseFloat(getComputedStyle(probe).paddingTop) || 0
  probe.remove()
  return top
}

/**
 * The home-screen app is the full phone. Shrink the page to Safari's visible
 * area so every screen is cropped the same way as the browser.
 */
function updateSafariFrame() {
  const root = document.documentElement
  const width = window.innerWidth
  const top = safeTop()
  const screenH = window.screen?.height || window.innerHeight
  const pageH = Math.round(screenH - top - SAFARI_BOTTOM_BAR)
  if (!isHomeScreenApp() || width >= 520 || pageH >= window.innerHeight - 1) {
    root.classList.remove('safari-frame')
    return
  }
  root.classList.add('safari-frame')
  root.style.setProperty('--safari-page-top', `${top}px`)
  root.style.setProperty('--safari-page-h', `${pageH}px`)
}

export function applySafariFrame() {
  updateSafariFrame()
  window.addEventListener('resize', updateSafariFrame)
  window.addEventListener('orientationchange', updateSafariFrame)
}
