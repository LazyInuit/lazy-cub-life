/**
 * Sound hooks for Cupid Archer.
 * Set a path when a file exists. Missing paths fall back to a short synth tone
 * and never throw, so the game still runs with no audio assets.
 */
import bgmUrl from '../../assets/cupid-archer/audio/bgm-glassy-piano.wav'

export const ARCHER_SFX = {
  draw: null as string | null,
  release: null as string | null,
  hit: null as string | null,
  bullseye: null as string | null,
  warn: null as string | null,
  over: null as string | null,
}

type Tone = { freq: number; dur: number; type?: OscillatorType; gain?: number; slide?: number }

let audio: AudioContext | null = null
const BGM_GAIN = 0.11

type ArcherBgmSlot = {
  source?: AudioBufferSourceNode
  gain?: GainNode
  buffer?: AudioBuffer
}

function bgmSlot(): ArcherBgmSlot {
  const w = window as Window & { __archerBgm?: ArcherBgmSlot }
  if (!w.__archerBgm) w.__archerBgm = {}
  return w.__archerBgm
}

function ctx(): AudioContext | null {
  try {
    if (!audio) audio = new AudioContext()
    return audio
  } catch {
    return null
  }
}

export function resumeArcherAudio() {
  const current = ctx()
  if (current && current.state === 'suspended') void current.resume()
}

export function stopArcherBgm() {
  const slot = bgmSlot()
  try {
    slot.source?.stop()
  } catch {
    /* already stopped */
  }
  try {
    slot.source?.disconnect()
  } catch {
    /* */
  }
  try {
    slot.gain?.disconnect()
  } catch {
    /* */
  }
  slot.source = undefined
  slot.gain = undefined
}

async function loadBgmBuffer(): Promise<AudioBuffer> {
  const slot = bgmSlot()
  if (slot.buffer) return slot.buffer
  const current = ctx()
  if (!current) throw new Error('no audio')
  const res = await fetch(bgmUrl)
  const raw = await res.arrayBuffer()
  const buffer = await current.decodeAudioData(raw.slice(0))
  slot.buffer = buffer
  return buffer
}

export function startArcherBgm() {
  stopArcherBgm()
  resumeArcherAudio()
  void (async () => {
    try {
      const buffer = await loadBgmBuffer()
      const current = ctx()
      if (!current) return
      resumeArcherAudio()
      stopArcherBgm()
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
      /* stay silent if decode/autoplay fails */
    }
  })()
}

function tone(spec: Tone) {
  const current = ctx()
  if (!current) return
  const osc = current.createOscillator()
  const gain = current.createGain()
  osc.type = spec.type ?? 'triangle'
  osc.frequency.setValueAtTime(spec.freq, current.currentTime)
  if (spec.slide) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, spec.slide), current.currentTime + spec.dur)
  }
  const peak = spec.gain ?? 0.08
  gain.gain.setValueAtTime(0.0001, current.currentTime)
  gain.gain.exponentialRampToValueAtTime(peak, current.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, current.currentTime + spec.dur)
  osc.connect(gain)
  gain.connect(current.destination)
  osc.start()
  osc.stop(current.currentTime + spec.dur + 0.02)
}

function play(slot: keyof typeof ARCHER_SFX, fallback: Tone) {
  const src = ARCHER_SFX[slot]
  if (src) {
    try {
      const el = new Audio(src)
      el.volume = 0.45
      void el.play().catch(() => tone(fallback))
      return
    } catch {
      /* fall through */
    }
  }
  tone(fallback)
}

let drawAt = 0

export function playDraw() {
  const now = performance.now()
  if (now - drawAt < 140) return
  drawAt = now
  play('draw', { freq: 180, slide: 90, dur: 0.12, type: 'sawtooth', gain: 0.03 })
}

export function playRelease() {
  play('release', { freq: 520, slide: 180, dur: 0.12, type: 'triangle', gain: 0.07 })
}

export function playHit() {
  play('hit', { freq: 320, slide: 140, dur: 0.14, type: 'sine', gain: 0.08 })
}

export function playBullseye() {
  // Bright fanfare — layered so a red-center hit feels special even without assets.
  play('bullseye', { freq: 880, slide: 1400, dur: 0.2, type: 'triangle', gain: 0.12 })
  window.setTimeout(() => tone({ freq: 1100, dur: 0.16, type: 'sine', gain: 0.08 }), 45)
  window.setTimeout(() => tone({ freq: 1320, slide: 1760, dur: 0.32, type: 'triangle', gain: 0.1 }), 95)
  window.setTimeout(() => tone({ freq: 660, slide: 990, dur: 0.28, type: 'sine', gain: 0.06 }), 150)
  window.setTimeout(() => tone({ freq: 1760, dur: 0.12, type: 'square', gain: 0.035 }), 210)
}

export function playWarn() {
  play('warn', { freq: 440, dur: 0.16, type: 'square', gain: 0.04 })
}

export function playOver() {
  play('over', { freq: 360, slide: 160, dur: 0.35, type: 'sine', gain: 0.07 })
}
