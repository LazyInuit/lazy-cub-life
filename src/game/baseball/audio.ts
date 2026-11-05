import bgmUrl from '../../assets/baseball/bgm-surf-rock-sluggers.wav'
import type { Quality } from './config'
import type { HitKind } from './flight'
import type { PitchType } from './pitch'

type Rig = { ac: AudioContext; out: AudioNode; room: AudioNode; noise: AudioBuffer }

let rig: Rig | null = null
let lastSwing = 0

function impulse(ac: AudioContext, seconds: number, decay: number) {
  const length = Math.floor(ac.sampleRate * seconds)
  const buffer = ac.createBuffer(2, length, ac.sampleRate)
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay
  }
  return buffer
}

function getRig(): Rig {
  if (rig) return rig
  const ac = new AudioContext()
  const out = ac.createDynamicsCompressor()
  out.threshold.value = -12
  out.ratio.value = 4
  out.attack.value = 0.002
  out.release.value = 0.2
  out.connect(ac.destination)
  /** Stadium echo for the bat crack and the crowd. */
  const room = ac.createConvolver()
  room.buffer = impulse(ac, 1.6, 3)
  const wet = ac.createGain()
  wet.gain.value = 0.4
  room.connect(wet)
  wet.connect(out)
  const noise = ac.createBuffer(1, ac.sampleRate * 5, ac.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  rig = { ac, out, room, noise }
  return rig
}

/** Call from a tap or click: browsers only start audio after a user gesture. */
export function resumeBaseballAudio() {
  const { ac } = getRig()
  if (ac.state === 'suspended') void ac.resume()
}

/** Background music volume, as a share of the track's full level. */
const BGM_GAIN = 0.1

const bgm: { buffer?: AudioBuffer; source?: AudioBufferSourceNode; gain?: GainNode; wanted: boolean } = { wanted: false }

/** Loops the music; carries on if it is already playing. */
export function startBaseballBgm() {
  bgm.wanted = true
  if (bgm.source) return
  const r = getRig()
  resumeBaseballAudio()
  void (async () => {
    try {
      if (!bgm.buffer) {
        const res = await fetch(bgmUrl)
        bgm.buffer = await r.ac.decodeAudioData(await res.arrayBuffer())
      }
      if (!bgm.wanted || bgm.source) return
      const gain = r.ac.createGain()
      gain.gain.value = BGM_GAIN
      gain.connect(r.ac.destination)
      const source = r.ac.createBufferSource()
      source.buffer = bgm.buffer
      source.loop = true
      source.connect(gain)
      source.start()
      bgm.source = source
      bgm.gain = gain
    } catch {
      /* decode or autoplay failure: play on without music */
    }
  })()
}

/** Fades the music out. */
export function stopBaseballBgm() {
  bgm.wanted = false
  const { source, gain } = bgm
  if (!source || !gain || !rig) return
  const at = rig.ac.currentTime
  gain.gain.setTargetAtTime(0, at, 0.15)
  source.stop(at + 0.7)
  bgm.source = undefined
  bgm.gain = undefined
}

/** Silences everything while the game is in the background. */
export function setBaseballAudioHidden(hidden: boolean) {
  if (!rig) return
  if (hidden && rig.ac.state === 'running') void rig.ac.suspend()
  else if (!hidden && rig.ac.state === 'suspended') void rig.ac.resume()
}

function envelope(r: Rig, at: number, seconds: number, peak: number, attack: number, wet: number) {
  const gain = r.ac.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
  gain.connect(r.out)
  if (wet > 0) {
    const send = r.ac.createGain()
    send.gain.value = wet
    gain.connect(send)
    send.connect(r.room)
  }
  return gain
}

/** Random start in the shared noise so repeated sounds differ, leaving `seconds` of it to play. */
const offset = (r: Rig, seconds: number) => Math.random() * Math.max(0, r.noise.duration - seconds - 0.1)

type Burst = {
  filter: BiquadFilterType
  from: number
  to?: number
  q?: number
  seconds: number
  peak: number
  attack?: number
  wet?: number
  delay?: number
}

/** Filtered noise: cracks, pops, air and crowd. */
function burst(r: Rig, b: Burst) {
  const at = r.ac.currentTime + (b.delay ?? 0)
  const source = r.ac.createBufferSource()
  source.buffer = r.noise
  const filter = r.ac.createBiquadFilter()
  filter.type = b.filter
  filter.Q.value = b.q ?? 0.8
  filter.frequency.setValueAtTime(b.from, at)
  if (b.to) filter.frequency.exponentialRampToValueAtTime(b.to, at + b.seconds)
  const gain = envelope(r, at, b.seconds, b.peak, b.attack ?? 0.002, b.wet ?? 0)
  source.connect(filter)
  filter.connect(gain)
  source.start(at, offset(r, b.seconds))
  source.stop(at + b.seconds + 0.05)
  return { source, gain }
}

type Tone = {
  type?: OscillatorType
  from: number
  to?: number
  seconds: number
  peak: number
  attack?: number
  wet?: number
  delay?: number
}

function tone(r: Rig, t: Tone) {
  const at = r.ac.currentTime + (t.delay ?? 0)
  const osc = r.ac.createOscillator()
  osc.type = t.type ?? 'sine'
  osc.frequency.setValueAtTime(t.from, at)
  if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, at + t.seconds)
  osc.connect(envelope(r, at, t.seconds, t.peak, t.attack ?? 0.004, t.wet ?? 0))
  osc.start(at)
  osc.stop(at + t.seconds + 0.05)
}

function notes(r: Rig, freqs: number[], gap: number, seconds: number, peak: number, delay = 0) {
  freqs.forEach((from, i) =>
    tone(r, { type: 'triangle', from, seconds: i === freqs.length - 1 ? seconds * 1.8 : seconds, peak, delay: delay + i * gap, wet: 0.2 }),
  )
}

/** Pneumatic thump as the machine fires: a hard pop for a fastball, a soft puff for a change-up. */
export function playLaunch(type: PitchType) {
  const r = getRig()
  if (type === 'fast') {
    tone(r, { from: 170, to: 45, seconds: 0.2, peak: 0.3 })
    burst(r, { filter: 'lowpass', from: 2600, to: 300, seconds: 0.14, peak: 0.28 })
    burst(r, { filter: 'highpass', from: 3200, seconds: 0.07, peak: 0.08 })
  } else if (type === 'slow') {
    tone(r, { from: 110, to: 55, seconds: 0.28, peak: 0.12, attack: 0.015 })
    burst(r, { filter: 'lowpass', from: 650, to: 150, seconds: 0.32, peak: 0.12, attack: 0.025 })
  } else {
    tone(r, { from: 140, to: 48, seconds: 0.22, peak: 0.22 })
    burst(r, { filter: 'lowpass', from: 1000, to: 200, seconds: 0.18, peak: 0.2 })
    burst(r, { filter: 'bandpass', from: 1800, to: 900, q: 1, seconds: 0.12, peak: 0.05 })
  }
}

/** Air rushing past, building to the moment the ball reaches the bat. Returns a stop for when it is hit. */
export function playPitchWhizz(flightTime: number, type: PitchType) {
  const r = getRig()
  const now = r.ac.currentTime
  const top = type === 'fast' ? 2400 : type === 'slow' ? 1100 : 1700
  const peak = type === 'fast' ? 0.09 : type === 'slow' ? 0.03 : 0.055
  const arrive = now + Math.max(0.1, flightTime)
  const source = r.ac.createBufferSource()
  source.buffer = r.noise
  const filter = r.ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.4
  filter.frequency.setValueAtTime(top * 0.3, now)
  filter.frequency.exponentialRampToValueAtTime(top, arrive)
  filter.frequency.exponentialRampToValueAtTime(top * 0.45, arrive + 0.18)
  const gain = r.ac.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(peak, arrive)
  gain.gain.exponentialRampToValueAtTime(0.0001, arrive + 0.18)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(r.out)
  source.start(now, offset(r, arrive + 0.25 - now))
  source.stop(arrive + 0.25)
  return () => {
    const at = r.ac.currentTime
    gain.gain.cancelScheduledValues(at)
    gain.gain.setTargetAtTime(0, at, 0.015)
    try {
      source.stop(at + 0.08)
    } catch {
      /* already stopped */
    }
  }
}

/** The machine bouncing to a new spot: a springy boing on each take-off, a light thud on each landing. */
export function playMachineHops(hops: number, seconds: number) {
  const r = getRig()
  const each = seconds / hops
  for (let i = 0; i < hops; i += 1) {
    const up = i * each
    const fade = 1 - i * 0.18
    tone(r, { from: 210, to: 520, seconds: 0.1, peak: 0.07 * fade, delay: up })
    tone(r, { type: 'triangle', from: 420, to: 760, seconds: 0.08, peak: 0.025 * fade, delay: up + 0.01 })
    tone(r, { from: 120, to: 60, seconds: 0.08, peak: 0.12 * fade, delay: up + each - 0.01 })
    burst(r, { filter: 'lowpass', from: 600, to: 150, seconds: 0.06, peak: 0.07 * fade, delay: up + each - 0.01 })
  }
}

/** Bat cutting the air; `power` is 0 for a gentle swing up to 1 for the hardest. */
export function playSwing(power: number) {
  const nowMs = performance.now()
  if (nowMs - lastSwing < 300) return
  lastSwing = nowMs
  const r = getRig()
  burst(r, { filter: 'bandpass', from: 500, to: 2400, q: 0.9, seconds: 0.2, peak: 0.04 + 0.08 * power, attack: 0.03 })
}

/** Ball off the bat: a ringing crack for a Perfect, a solid crack for a Good, a jammed tock for a Weak hit. */
export function playContact(quality: Exclude<Quality, 'miss'>) {
  const r = getRig()
  if (quality === 'perfect') {
    burst(r, { filter: 'bandpass', from: 2600, q: 0.9, seconds: 0.035, peak: 0.55, wet: 0.7 })
    tone(r, { type: 'triangle', from: 1260, to: 1160, seconds: 0.14, peak: 0.12, wet: 0.4 })
    tone(r, { from: 640, to: 580, seconds: 0.2, peak: 0.14, wet: 0.3 })
    tone(r, { from: 190, to: 80, seconds: 0.09, peak: 0.26 })
    notes(r, [784, 1175, 1568], 0.07, 0.2, 0.065, 0.08)
  } else if (quality === 'good') {
    burst(r, { filter: 'bandpass', from: 2100, q: 1, seconds: 0.04, peak: 0.4, wet: 0.45 })
    tone(r, { from: 560, to: 520, seconds: 0.13, peak: 0.1, wet: 0.2 })
    tone(r, { from: 160, to: 70, seconds: 0.08, peak: 0.2 })
  } else {
    burst(r, { filter: 'bandpass', from: 900, q: 1.4, seconds: 0.06, peak: 0.24, wet: 0.15 })
    tone(r, { from: 300, to: 210, seconds: 0.09, peak: 0.12 })
    tone(r, { type: 'square', from: 95, to: 80, seconds: 0.14, peak: 0.025 })
  }
}

/** Ball smacking into the backstop; a sad three notes on strike three. */
export function playStrike(out: boolean) {
  const r = getRig()
  burst(r, { filter: 'bandpass', from: 1500, to: 700, q: 1.2, seconds: 0.07, peak: 0.3, wet: 0.2 })
  tone(r, { from: 130, to: 60, seconds: 0.11, peak: 0.2 })
  if (out) notes(r, [392, 330, 262], 0.2, 0.22, 0.07, 0.25)
  else tone(r, { type: 'triangle', from: 220, to: 165, seconds: 0.28, peak: 0.05, delay: 0.15 })
}

const far = (distance: number) => Math.min(1, 1.4 / (1 + distance / 22))

/** First bounce on the grass, quieter the further out it lands. */
export function playLanding(distance: number) {
  const r = getRig()
  const s = far(distance)
  burst(r, { filter: 'lowpass', from: 520, to: 120, seconds: 0.12, peak: 0.16 * s })
  tone(r, { from: 95, to: 50, seconds: 0.1, peak: 0.14 * s })
}

/** Ball thudding into the padded outfield wall. */
export function playWall(distance: number) {
  const r = getRig()
  const s = far(distance) * 1.6
  burst(r, { filter: 'lowpass', from: 800, to: 160, seconds: 0.14, peak: 0.2 * s, wet: 0.3 })
  tone(r, { from: 140, to: 65, seconds: 0.14, peak: 0.16 * s })
}

/**
 * Cheering: voice-range bands, each fluttering at its own rate like many people shouting, so it reads as a
 * crowd rather than a smooth whoosh.
 */
function crowd(r: Rig, seconds: number, peak: number) {
  const at = r.ac.currentTime
  const voices = [
    { freq: 420, q: 2.2, share: 1, rate: 5.3 },
    { freq: 760, q: 2.6, share: 0.8, rate: 7.1 },
    { freq: 1150, q: 3, share: 0.5, rate: 6.2 },
  ]
  for (const voice of voices) {
    const source = r.ac.createBufferSource()
    source.buffer = r.noise
    const filter = r.ac.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = voice.freq
    filter.Q.value = voice.q
    const flutter = r.ac.createGain()
    flutter.gain.value = 0.65
    const lfo = r.ac.createOscillator()
    lfo.frequency.value = voice.rate
    const depth = r.ac.createGain()
    depth.gain.value = 0.35
    lfo.connect(depth)
    depth.connect(flutter.gain)
    const gain = envelope(r, at, seconds, peak * voice.share, 0.12, 0.35)
    source.connect(filter)
    filter.connect(flutter)
    flutter.connect(gain)
    source.start(at, offset(r, seconds))
    source.stop(at + seconds + 0.05)
    lfo.start(at)
    lfo.stop(at + seconds + 0.05)
  }
}

/** The ball clearing the fence: crowd cheer and a fanfare. */
export function playHomeRun() {
  const r = getRig()
  crowd(r, 1.5, 0.16)
  notes(r, [523, 659, 784, 1047], 0.11, 0.18, 0.08, 0.05)
  notes(r, [659, 784, 988, 1319], 0.11, 0.18, 0.05, 0.05)
}

/** A short sting once the hit has landed; home runs already had theirs. */
export function playOutcome(kind: HitKind) {
  const r = getRig()
  if (kind === 'ground') notes(r, [587], 0, 0.18, 0.045)
  else if (kind === 'short') notes(r, [587, 784], 0.09, 0.18, 0.05)
  else if (kind === 'deep') notes(r, [587, 784, 988], 0.09, 0.18, 0.055)
}

export function playCash() {
  const r = getRig()
  tone(r, { type: 'triangle', from: 1319, seconds: 0.08, peak: 0.07, delay: 0.25 })
  tone(r, { type: 'triangle', from: 1760, seconds: 0.3, peak: 0.07, delay: 0.33 })
  tone(r, { from: 3520, seconds: 0.2, peak: 0.02, delay: 0.33 })
}
