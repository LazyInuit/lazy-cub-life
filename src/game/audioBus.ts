/**
 * The one audio engine every game plays through. All game sound goes into `gameOut()`, a master gain
 * that feeds the speakers, so a replay can record exactly what the player hears and music can be
 * turned down while a replay plays. Home screen sounds keep their own engines: they are never recorded.
 */
let shared: AudioContext | null = null
let master: GainNode | null = null

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext }

/** The shared engine, made on first use. Throws where the browser has no Web Audio. */
export function gameAudio(): AudioContext {
  if (shared) return shared
  const Ctx = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
  if (!Ctx) throw new Error('No Web Audio')
  const ctx = new Ctx()
  shared = ctx
  master = ctx.createGain()
  master.connect(ctx.destination)
  // Quiet while the app is in the background, back on return if it was playing.
  let pausedByHide = false
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (ctx.state !== 'running') return
      pausedByHide = true
      void ctx.suspend()
    } else if (pausedByHide) {
      pausedByHide = false
      void ctx.resume()
    }
  })
  return ctx
}

/** Where game sounds connect instead of `destination`. */
export function gameOut(): GainNode {
  gameAudio()
  return master as GainNode
}

/** The engine if it already exists; never makes one. */
export function gameAudioIfReady(): AudioContext | null {
  return shared
}

/**
 * Turns all game sound down while a replay plays, and back up after. Only turned down, never paused:
 * pausing the engine silenced the replay's own sound on iPhones.
 */
export function duckGameAudio(ducked: boolean) {
  if (!shared || !master) return
  const now = shared.currentTime
  master.gain.cancelScheduledValues(now)
  master.gain.setTargetAtTime(ducked ? 0.08 : 1, now, 0.08)
}
