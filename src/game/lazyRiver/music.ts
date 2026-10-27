/**
 * Lazy River background music: the Deep Water chase loop.
 */
import bgmUrl from '../../assets/lazy-river/bgm-deep-water.wav'

/** Background music at 20% volume. */
const BGM_GAIN = 0.2

let audio: AudioContext | null = null
let bgmBuffer: AudioBuffer | null = null
let bgmSource: AudioBufferSourceNode | null = null
let bgmGain: GainNode | null = null
/** Bumped on every start and stop, so a slow load never starts music that was already stopped. */
let bgmTicket = 0

function ctx(): AudioContext | null {
  try {
    if (!audio) {
      audio = new AudioContext()
      // Quiet while the app is in the background, back on return.
      document.addEventListener('visibilitychange', () => {
        if (!audio) return
        if (document.hidden) void audio.suspend()
        else if (bgmSource) void audio.resume()
      })
    }
    return audio
  } catch {
    return null
  }
}

export function stopRiverBgm() {
  bgmTicket += 1
  try {
    bgmSource?.stop()
  } catch {
    // Already stopped.
  }
  bgmSource?.disconnect()
  bgmGain?.disconnect()
  bgmSource = null
  bgmGain = null
}

/** Starts the looping background music from the top. Stays silent if the file cannot play. */
export function startRiverBgm() {
  stopRiverBgm()
  const ticket = bgmTicket
  const current = ctx()
  if (!current) return
  if (current.state === 'suspended') void current.resume()
  void (async () => {
    try {
      if (!bgmBuffer) {
        const res = await fetch(bgmUrl)
        bgmBuffer = await current.decodeAudioData(await res.arrayBuffer())
      }
      if (ticket !== bgmTicket) return
      const gain = current.createGain()
      gain.gain.value = BGM_GAIN
      const source = current.createBufferSource()
      source.buffer = bgmBuffer
      source.loop = true
      source.connect(gain)
      gain.connect(current.destination)
      source.start()
      bgmSource = source
      bgmGain = gain
    } catch {
      // No music if the file fails to load or decode; the game still plays.
    }
  })()
}
