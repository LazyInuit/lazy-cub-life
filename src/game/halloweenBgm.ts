import trackUrl from '../assets/home/halloween-bgm.wav'
import { pumpkinLit } from './halloween'

/** Quiet room level. iPhone ignores audio.volume, so this goes through a gain node. */
const LEVEL = 0.035

let track: HTMLAudioElement | null = null
let context: AudioContext | null = null
let gain: GainNode | null = null
let wired = false
let silenced = false

function element() {
  if (!track) {
    track = new Audio(trackUrl)
    track.loop = true
    track.preload = 'auto'
    track.setAttribute('playsinline', 'true')
  }
  return track
}

function output(audio: HTMLAudioElement) {
  const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) {
    audio.volume = LEVEL
    return
  }
  if (!context) context = new Ctx()
  if (!wired) {
    gain = context.createGain()
    gain.gain.value = LEVEL
    context.createMediaElementSource(audio).connect(gain)
    gain.connect(context.destination)
    wired = true
  }
  const now = context.currentTime
  gain?.gain.cancelScheduledValues(now)
  gain?.gain.setValueAtTime(LEVEL, now)
  audio.loop = true
  audio.muted = false
  if (context.state === 'suspended') void context.resume()
}

/** Night Watch. Plays on the home screen while the pumpkin is lit. */
export function startHalloweenBgm() {
  if (!pumpkinLit()) return
  silenced = false
  const audio = element()
  output(audio)
  if (!audio.paused) return
  void audio.play().then(() => {
    if (silenced) {
      audio.pause()
      audio.muted = true
    }
  }).catch(() => {
    // The phone may still block sound until the screen is touched.
  })
}

export function stopHalloweenBgm() {
  silenced = true
  if (context && gain) {
    const now = context.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(0, now)
  }
  if (!track) return
  track.loop = false
  track.muted = true
  track.pause()
  try {
    track.currentTime = 0
  } catch {
    // A phone can reject the seek until the file has loaded.
  }
}
