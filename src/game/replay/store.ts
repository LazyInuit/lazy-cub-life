import { useSyncExternalStore } from 'react'

/**
 * The one replay that exists at a time. `recording` during a run, `making` while the MP4 is written,
 * `ready` once it can be watched, `off` where this browser or run has no replay.
 */
export type ReplayState =
  | { status: 'idle' }
  | { status: 'recording' }
  | { status: 'making' }
  | { status: 'off'; reason?: string }
  /** `poster` is the first frame, shown on the player before it plays. */
  | { status: 'ready'; blob: Blob; url: string; poster?: string; stats?: string }

let state: ReplayState = { status: 'idle' }
const listeners = new Set<() => void>()

export function setReplayState(next: ReplayState) {
  if (state.status === 'ready' && state.url !== (next.status === 'ready' ? next.url : null)) {
    URL.revokeObjectURL(state.url)
    if (state.poster) URL.revokeObjectURL(state.poster)
  }
  state = next
  listeners.forEach((listener) => listener())
}

export function replayState() {
  return state
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useReplayState(): ReplayState {
  return useSyncExternalStore(subscribe, replayState)
}
