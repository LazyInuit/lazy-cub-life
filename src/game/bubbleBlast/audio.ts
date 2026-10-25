/**
 * Bubble Blast sound: the Tiki Lounge background loop, plus placeholder synth effects
 * until real effect files exist.
 */
import bgmUrl from '../../assets/bubble-blast/bgm-tiki-lounge.wav'
import type { BubbleEvent } from './types'

let audio: AudioContext | null = null

/** Background music at 10% volume. */
const BGM_GAIN = 0.1

let bgmBuffer: AudioBuffer | null = null
let bgmSource: AudioBufferSourceNode | null = null
let bgmGain: GainNode | null = null
/** Bumped on every start and stop, so a slow load never starts music that was already stopped. */
let bgmTicket = 0

function ctx(): AudioContext | null {
  try {
    if (!audio) audio = new AudioContext()
    return audio
  } catch {
    return null
  }
}

export function resumeBubbleAudio() {
  const current = ctx()
  if (current && current.state === 'suspended') void current.resume()
}

export function stopBubbleBgm() {
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
export function startBubbleBgm() {
  stopBubbleBgm()
  const ticket = bgmTicket
  const current = ctx()
  if (!current) return
  resumeBubbleAudio()
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

type Tone = { freq: number; dur: number; type?: OscillatorType; gain?: number; slide?: number; delay?: number }

function tone({ freq, dur, type = 'sine', gain = 0.12, slide, delay = 0 }: Tone) {
  const ac = ctx()
  if (!ac) return
  const start = ac.currentTime + delay
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), start + dur)
  amp.gain.setValueAtTime(0.0001, start)
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.012)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(amp).connect(ac.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

export function playBubbleEvent(event: BubbleEvent) {
  switch (event.type) {
    case 'fire':
      tone({ freq: event.mega ? 180 : 320, dur: 0.14, type: 'triangle', gain: 0.1, slide: event.mega ? 520 : 760 })
      break
    case 'bounce':
      tone({ freq: 880, dur: 0.045, type: 'square', gain: 0.04 })
      break
    case 'pop':
      for (let i = 0; i < Math.min(5, event.count); i += 1) {
        tone({ freq: 700 + i * 90, dur: 0.07, gain: 0.1, slide: 380 + i * 60, delay: i * 0.035 })
      }
      break
    case 'bigClear':
      ;[523, 659, 784, 1047].forEach((freq, i) => tone({ freq, dur: 0.16, type: 'triangle', gain: 0.09, delay: 0.08 + i * 0.07 }))
      break
    case 'mega':
      tone({ freq: 140, dur: 0.45, type: 'sawtooth', gain: 0.12, slide: 38 })
      tone({ freq: 900, dur: 0.25, type: 'triangle', gain: 0.06, slide: 200, delay: 0.02 })
      break
    case 'ceiling':
      tone({ freq: 110, dur: 0.22, type: 'square', gain: 0.07, slide: 70 })
      tone({ freq: 90, dur: 0.22, type: 'square', gain: 0.06, slide: 55, delay: 0.14 })
      break
    case 'boardClear':
      ;[523, 659, 784, 1047, 1319].forEach((freq, i) => tone({ freq, dur: 0.2, type: 'triangle', gain: 0.09, delay: i * 0.09 }))
      break
    case 'over':
      ;[440, 349, 262].forEach((freq, i) => tone({ freq, dur: 0.32, type: 'triangle', gain: 0.1, delay: i * 0.22 }))
      break
  }
}
