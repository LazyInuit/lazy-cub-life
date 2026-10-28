/**
 * Demo mode: play without an account. The demo cub lives in its own save on this phone,
 * starts with DEMO_CASH, and never earns coins, saves scores, or touches the cloud.
 */
import { countDemo, noteDemoTried } from './demoStats'

export const DEMO_CASH = 10_000

const DEMO_KEY = 'lazy-cub-demo'
const SIGN_UP_EVENT = 'lazy-cub-sign-up'

export function isDemo() {
  try {
    return sessionStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export function startDemo() {
  try {
    sessionStorage.setItem(DEMO_KEY, '1')
  } catch {
    // Without session storage the demo still runs until the page reloads.
  }
  noteDemoTried()
  countDemo('start')
}

export function endDemo() {
  try {
    sessionStorage.removeItem(DEMO_KEY)
  } catch {
    // Nothing to clear.
  }
}

/** Ask the app to leave the demo and open Create account. Any button can call this. */
export function requestSignUp() {
  window.dispatchEvent(new Event(SIGN_UP_EVENT))
}

export function onSignUpRequest(listener: () => void) {
  window.addEventListener(SIGN_UP_EVENT, listener)
  return () => window.removeEventListener(SIGN_UP_EVENT, listener)
}
