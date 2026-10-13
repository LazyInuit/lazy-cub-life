import { isStandalone, pageHeightForWidth } from './homeFrame'

/**
 * Letterbox the installed app around Safari's page.
 * The game keeps that page's width and height. Black bands sit outside it.
 */
function updateSafariFrame() {
  const root = document.documentElement
  const width = window.innerWidth
  const available = window.innerHeight
  const pageH = pageHeightForWidth(width)
  if (!isStandalone() || width >= 520 || pageH < 1 || pageH >= available - 1) {
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
