/**
 * Some Android browsers and in-app browsers report 100dvh taller than the part of the page on screen,
 * which pushed the game frame down and hid its bottom under the navigation bar. innerHeight is the
 * visible page, so the frame is sized from that instead.
 */
function updateViewportHeight() {
  document.documentElement.style.setProperty('--view-h', `${window.innerHeight}px`)
}

export function applyViewportHeight() {
  updateViewportHeight()
  window.addEventListener('resize', updateViewportHeight)
  window.addEventListener('orientationchange', updateViewportHeight)
  window.visualViewport?.addEventListener('resize', updateViewportHeight)
}
