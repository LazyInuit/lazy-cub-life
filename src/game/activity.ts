import { supabase } from './supabase'

export const ACTIVITY_AREAS = [
  { id: 'home', label: 'Home screen' },
  { id: 'wardrobe', label: 'Wardrobe' },
  { id: 'flight', label: "Kovu's Space Dash" },
  { id: 'match', label: 'Pride Pairs' },
  { id: 'dojo', label: 'Ninja Cub Dojo' },
  { id: 'archer', label: 'Cupid Archery' },
  { id: 'hoops', label: 'Lazy Hoops' },
  { id: 'bubble', label: 'Bubble Blast' },
  { id: 'river', label: 'Lazy River' },
] as const

export type ActivityArea = (typeof ACTIVITY_AREAS)[number]['id']

const AREAS = new Set<string>(ACTIVITY_AREAS.map((area) => area.id))

let area: ActivityArea = 'home'
let mark = 0
let visible = true
let started = false
let sending = false
let disabled = false
const pending = new Map<ActivityArea, number>()

function isArea(value: string): value is ActivityArea {
  return AREAS.has(value)
}

function accrue() {
  const now = performance.now()
  if (mark === 0) {
    mark = now
    return
  }
  if (!visible) {
    mark = now
    return
  }
  const whole = Math.floor((now - mark) / 1000)
  if (whole < 1) return
  pending.set(area, (pending.get(area) ?? 0) + whole)
  mark += whole * 1000
}

async function flush() {
  accrue()
  if (sending || disabled || !supabase) return
  const next = [...pending.entries()].find(([, seconds]) => seconds >= 1)
  if (!next) return
  const [id, seconds] = next
  const chunk = Math.min(60, seconds)
  sending = true
  const { data, error } = await supabase.rpc('record_activity', { p_area: id, p_seconds: chunk })
  sending = false
  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('could not find the function') || message.includes('schema cache') || message.includes('column')) {
      disabled = true
    }
    return
  }
  const accepted = typeof data === 'number' ? data : chunk
  const left = (pending.get(id) ?? 0) - Math.max(0, accepted)
  if (left > 0) pending.set(id, left)
  else pending.delete(id)
}

function startActivity() {
  if (started || typeof window === 'undefined') return
  started = true
  mark = performance.now()
  visible = document.visibilityState !== 'hidden'
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      accrue()
      visible = false
      void flush()
      return
    }
    visible = true
    mark = performance.now()
  })
  window.addEventListener('pagehide', () => {
    accrue()
    visible = false
    void flush()
  })
  window.setInterval(() => void flush(), 30000)
}

export function activityArea() {
  return area
}

export function setActivityArea(next: ActivityArea) {
  startActivity()
  if (!isArea(next)) return
  if (next === area) return
  accrue()
  area = next
  mark = performance.now()
  void flush()
}

export function formatActivityMinutes(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 60) return seconds > 0 ? '< 1 min' : '0 min'
  return `${Math.floor(seconds / 60)} min`
}
