import { DOJO_ASSETS } from './assets'

let audio: AudioContext | null = null

/** Quiet bed under SFX — full-scale wav * this gain. */
const BGM_GAIN = 0.0125

type DojoBgmSlot = {
  el?: HTMLAudioElement
  source?: AudioBufferSourceNode
  gain?: GainNode
  buffer?: AudioBuffer
}

function bgmSlot(): DojoBgmSlot {
  const w = window as Window & { __dojoBgm?: DojoBgmSlot }
  if (!w.__dojoBgm) w.__dojoBgm = {}
  return w.__dojoBgm
}

function ctx(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

export function resumeDojoAudio() {
  const current = ctx()
  if (current.state === 'suspended') void current.resume()
}

export function stopDojoBgm() {
  const slot = bgmSlot()
  if (slot.el) {
    try {
      slot.el.pause()
      slot.el.volume = 0
      slot.el.removeAttribute('src')
      slot.el.load()
    } catch {
      /* ignore */
    }
    slot.el = undefined
  }
  if (slot.source) {
    try {
      slot.source.onended = null
      slot.source.stop()
    } catch {
      /* already stopped */
    }
    try {
      slot.source.disconnect()
    } catch {
      /* ignore */
    }
    slot.source = undefined
  }
  if (slot.gain) {
    try {
      slot.gain.disconnect()
    } catch {
      /* ignore */
    }
    slot.gain = undefined
  }
}

/** Apply current BGM_GAIN to a live bed without restarting. */
function applyBgmGain() {
  const slot = bgmSlot()
  if (slot.gain) slot.gain.gain.value = BGM_GAIN
}

applyBgmGain()

async function loadBgmBuffer(): Promise<AudioBuffer> {
  const slot = bgmSlot()
  if (slot.buffer) return slot.buffer
  const res = await fetch(DOJO_ASSETS.audio.bgm)
  const raw = await res.arrayBuffer()
  const buffer = await ctx().decodeAudioData(raw.slice(0))
  slot.buffer = buffer
  return buffer
}

export function startDojoBgm() {
  // Always kill any prior bed (including HMR orphans) before starting quiet loop.
  stopDojoBgm()
  resumeDojoAudio()
  void (async () => {
    try {
      const buffer = await loadBgmBuffer()
      const current = ctx()
      resumeDojoAudio()
      // Drop any HTMLAudio leftovers again in case something raced.
      stopDojoBgm()
      const slot = bgmSlot()
      slot.buffer = buffer
      const gain = current.createGain()
      gain.gain.value = BGM_GAIN
      const source = current.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.connect(gain)
      gain.connect(current.destination)
      source.start(0)
      slot.source = source
      slot.gain = gain
    } catch {
      /* decode / autoplay failure — stay silent */
    }
  })()
}

function beep(freq: number, seconds: number, peak: number, type: OscillatorType = 'sine') {
  const current = ctx()
  resumeDojoAudio()
  const now = current.currentTime
  const osc = current.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, now)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, now)
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, now + seconds)
  osc.connect(gain)
  gain.connect(current.destination)
  osc.start(now)
  osc.stop(now + seconds + 0.02)
}

/** Squish-bubble splat on fruit cut (option 5). */
export function playSlash() {
  const current = ctx()
  resumeDojoAudio()
  const now = current.currentTime
  const seconds = 0.3
  const length = Math.max(1, Math.floor(current.sampleRate * seconds))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const t = i / current.sampleRate
    const attack = 0.005
    const hold = 0.04
    const release = 0.2
    let e = 0
    if (t < attack) e = t / attack
    else if (t < attack + hold) e = 1
    else if (t < seconds) e = Math.max(0, 1 - (t - attack - hold) / release)
    const freq = Math.max(40, 140 - t * 180)
    const sq = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 10)
    const bub = Math.sin(2 * Math.PI * (400 + t * 600) * t) * 0.35 * Math.exp(-t * 12)
    const wet = (Math.random() * 2 - 1) * Math.exp(-t * 8) * 0.5
    data[i] = (sq * 0.7 + bub + wet) * e
  }
  let peak = 0.0001
  for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs(data[i]))
  for (let i = 0; i < length; i += 1) data[i] = (data[i] / peak) * 0.55

  const src = current.createBufferSource()
  src.buffer = buffer
  const filter = current.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(2800, now)
  filter.frequency.exponentialRampToValueAtTime(900, now + seconds)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, now)
  gain.gain.exponentialRampToValueAtTime(0.7, now + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.001, now + seconds)
  src.connect(filter)
  filter.connect(gain)
  gain.connect(current.destination)
  src.start(now)
  src.stop(now + seconds)
}

/** Soft whoosh for finger swipe trail (option 1). */
export function playSwipe() {
  playSoftWhoosh(0.14)
}

function playSoftWhoosh(peak: number) {
  const current = ctx()
  resumeDojoAudio()
  const now = current.currentTime
  const seconds = 0.28
  const length = Math.max(1, Math.floor(current.sampleRate * seconds))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const t = i / length
    const fade = Math.exp(-t * 6)
    const flutter = 0.55 + 0.45 * Math.sin(t * 40 * Math.PI * 2)
    data[i] = (Math.random() * 2 - 1) * fade * flutter
  }
  const noise = current.createBufferSource()
  noise.buffer = buffer
  const filter = current.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.85
  filter.frequency.setValueAtTime(1600, now)
  filter.frequency.exponentialRampToValueAtTime(420, now + seconds)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, now)
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.001, now + seconds)
  noise.connect(filter)
  filter.connect(gain)
  gain.connect(current.destination)
  noise.start(now)
  noise.stop(now + seconds)
}

export function playCombo() {
  beep(523, 0.08, 0.07, 'triangle')
  beep(784, 0.12, 0.08, 'triangle')
}

export function playBomb() {
  beep(90, 0.35, 0.2, 'sawtooth')
  beep(55, 0.45, 0.18, 'square')
}

export function playMiss() {
  beep(180, 0.15, 0.06, 'sine')
}

export function playUi() {
  beep(440, 0.06, 0.05, 'triangle')
}
