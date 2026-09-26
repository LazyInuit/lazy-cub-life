import { defaultSave, sanitizeSave } from './progress'
import type { CubSave } from './types'

const SAVE_KEY = 'lazy-lion-cub-save-v1'

export function readSave(now = Date.now()): CubSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return defaultSave(now)
    return sanitizeSave(JSON.parse(raw), now)
  } catch {
    return defaultSave(now)
  }
}

export function writeSave(save: CubSave): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save))
}
