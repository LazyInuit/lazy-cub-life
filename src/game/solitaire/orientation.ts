import { useSyncExternalStore } from 'react'

/**
 * Spellitaire switches to its landscape layout when a phone is on its side: wider than tall and no
 * taller than a phone. Tablets and desktop windows keep the portrait layout in the phone frame.
 */
const LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 600px)'

function landscapeNow() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia) return window.matchMedia(LANDSCAPE_QUERY).matches
  return window.innerWidth > window.innerHeight && window.innerHeight <= 600
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia?.(LANDSCAPE_QUERY)
  query?.addEventListener('change', onChange)
  // Some browsers report the rotation as a resize first, or only as one.
  window.addEventListener('resize', onChange)
  window.addEventListener('orientationchange', onChange)
  window.visualViewport?.addEventListener('resize', onChange)
  return () => {
    query?.removeEventListener('change', onChange)
    window.removeEventListener('resize', onChange)
    window.removeEventListener('orientationchange', onChange)
    window.visualViewport?.removeEventListener('resize', onChange)
  }
}

/** True while Spellitaire should use its landscape layout. Changes as the phone turns, without remounting anything. */
export function useSolitaireLandscape() {
  return useSyncExternalStore(subscribe, landscapeNow, () => false)
}
