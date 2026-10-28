import type { DailyGame } from './dailyTasks'
import { supabase } from './supabase'

/**
 * Anonymous daily counts for the demo: a device that started it, a game a demo player tried,
 * and a demo player who went on to make an account. Nothing about the player is sent, and each
 * device sends each count at most once a day.
 */
export type DemoEvent = 'start' | 'signup' | `play:${DailyGame}`

const COUNTED_KEY = 'lazy-cub-demo-counted'
/** Set for the rest of the session once the demo has been tried, so a later sign-up counts. */
const TRIED_KEY = 'lazy-cub-demo-tried'

function today() {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

/** Counts once per device per day. Never throws and never holds the game up. */
export function countDemo(event: DemoEvent) {
  try {
    const day = today()
    const raw = localStorage.getItem(COUNTED_KEY)
    const stored = raw ? (JSON.parse(raw) as { day?: string; events?: string[] }) : null
    const events = stored?.day === day && Array.isArray(stored.events) ? stored.events : []
    if (events.includes(event)) return
    localStorage.setItem(COUNTED_KEY, JSON.stringify({ day, events: [...events, event] }))
  } catch {
    // Without storage the count may repeat; it is only a rough guide.
  }
  if (!supabase) return
  void supabase.rpc('count_demo', { p_event: event }).then(
    () => undefined,
    () => undefined,
  )
}

export function noteDemoTried() {
  try {
    sessionStorage.setItem(TRIED_KEY, '1')
  } catch {
    // No session storage: a later sign-up simply is not counted.
  }
}

/** After an account is made: counts it as a demo sign-up if the demo was tried this session. */
export function countDemoSignup() {
  try {
    if (sessionStorage.getItem(TRIED_KEY) !== '1') return
    sessionStorage.removeItem(TRIED_KEY)
  } catch {
    return
  }
  countDemo('signup')
}
