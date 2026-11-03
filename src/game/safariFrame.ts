import { isStandalone, pageHeightForWidth } from './homeFrame'

/** Share of the spare height that goes above the page; the rest makes a thicker band below it. */
const TOP_SHARE = 0.4

/** The status bar / notch inset, read from CSS since only `env()` knows it. */
function safeTopInset() {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top, 0px)'
  document.body.appendChild(probe)
  const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0
  probe.remove()
  return inset
}

/**
 * Letterbox the installed app around Safari's page.
 * The game keeps that page's width and height. Black bands sit outside it, the lower one a bit thicker,
 * but never so thin above that the page slips under the status bar.
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
  const spare = available - pageH
  const top = Math.round(Math.min(spare / 2, Math.max(spare * TOP_SHARE, safeTopInset())))
  root.classList.add('safari-frame')
  root.style.setProperty('--safari-page-top', `${top}px`)
  root.style.setProperty('--safari-page-h', `${pageH}px`)
}

export function applySafariFrame() {
  updateSafariFrame()
  window.addEventListener('resize', updateSafariFrame)
  window.addEventListener('orientationchange', updateSafariFrame)
}
