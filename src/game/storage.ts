import { DEMO_CASH, isDemo } from './demo'
import { applyAbsence, defaultSave, sanitizeSave } from './progress'
import type { CubSave } from './types'

const SAVE_KEY = 'lazy-lion-cub-save-v1'
/** The demo cub is kept apart so it never mixes with a real account's cub. */
const DEMO_SAVE_KEY = 'lazy-lion-cub-demo-v1'

function saveKey(demo = isDemo()) {
  return demo ? DEMO_SAVE_KEY : SAVE_KEY
}

export function readSave(now = Date.now(), demo = isDemo()): CubSave {
  try {
    const raw = localStorage.getItem(saveKey(demo))
    if (!raw) return demo ? { ...defaultSave(now), cubCash: DEMO_CASH } : defaultSave(now)
    const parsed = JSON.parse(raw) as { cubCash?: unknown }
    const save = sanitizeSave(parsed, now)
    // sanitizeSave resets old test balances such as 10,000. The demo balance is meant to be that.
    if (demo && typeof parsed.cubCash === 'number' && Number.isFinite(parsed.cubCash)) {
      return { ...save, cubCash: Math.max(0, Math.floor(parsed.cubCash)) }
    }
    return save
  } catch {
    return demo ? { ...defaultSave(now), cubCash: DEMO_CASH } : defaultSave(now)
  }
}

/** Pass demo when the caller knows which cub it holds, so a late save never lands in the wrong slot. */
export function writeSave(save: CubSave, demo = isDemo()): void {
  localStorage.setItem(saveKey(demo), JSON.stringify(save))
}

/** Apply away-time energy, then leave the stored cub awake. */
export function wakeStoredCub() {
  if (!localStorage.getItem(saveKey())) return
  writeSave({ ...applyAbsence(readSave()).save, asleep: false })
}

/** Start or resume the demo cub with a full coin bank. */
export function openDemoCub() {
  writeSave({ ...applyAbsence(readSave()).save, asleep: false, cubCash: DEMO_CASH })
}
