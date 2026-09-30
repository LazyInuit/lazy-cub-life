import bgmDoubleLounge from '../../assets/lazy-hoops/audio/bgm-double-lounge.wav'

let audio: AudioContext | null = null
let lastRim = 0

/** Quiet bed under SFX — full-scale wav * this gain. */
const BGM_GAIN = 0.015

type HoopsBgmSlot = {
  source?: AudioBufferSourceNode
  gain?: GainNode
  buffer?: AudioBuffer
}

function bgmSlot(): HoopsBgmSlot {
  const w = window as Window & { __hoopsBgm?: HoopsBgmSlot }
  if (!w.__hoopsBgm) w.__hoopsBgm = {}
  return w.__hoopsBgm
}

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

export function resumeHoopsAudio() {
  const current = context()
  if (current.state === 'suspended') void current.resume()
}

export function stopHoopsBgm() {
  const slot = bgmSlot()
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

async function loadBgmBuffer(): Promise<AudioBuffer> {
  const slot = bgmSlot()
  if (slot.buffer) return slot.buffer
  const res = await fetch(bgmDoubleLounge)
  const raw = await res.arrayBuffer()
  const buffer = await context().decodeAudioData(raw.slice(0))
  slot.buffer = buffer
  return buffer
}

export function startHoopsBgm() {
  stopHoopsBgm()
  resumeHoopsAudio()
  void (async () => {
    try {
      const buffer = await loadBgmBuffer()
      const current = context()
      resumeHoopsAudio()
      stopHoopsBgm()
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

function noise(current: AudioContext, seconds: number) {
  const length = Math.max(1, Math.floor(current.sampleRate * seconds))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
  const source = current.createBufferSource()
  source.buffer = buffer
  return source
}

/** Air leaving the hand as the ball is released. */
export function playHoopsSwipe() {
  const current = context()
  resumeHoopsAudio()
  const now = current.currentTime
  const seconds = 0.16
  const source = noise(current, seconds)
  const filter = current.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.7
  filter.frequency.setValueAtTime(700, now)
  filter.frequency.exponentialRampToValueAtTime(2400, now + seconds)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, now)
  gain.gain.exponentialRampToValueAtTime(0.11, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, now + seconds)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(current.destination)
  source.start(now)
  source.stop(now + seconds + 0.02)
}

/** Metal tick when the ball bounces off the rim. */
export function playHoopsRim() {
  const nowMs = performance.now()
  if (nowMs - lastRim < 90) return
  lastRim = nowMs
  const current = context()
  resumeHoopsAudio()
  const now = current.currentTime

  const click = noise(current, 0.05)
  const clickFilter = current.createBiquadFilter()
  clickFilter.type = 'highpass'
  clickFilter.frequency.value = 1800
  const clickGain = current.createGain()
  clickGain.gain.setValueAtTime(0.09, now)
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045)
  click.connect(clickFilter)
  clickFilter.connect(clickGain)
  clickGain.connect(current.destination)
  click.start(now)
  click.stop(now + 0.06)

  const ping = current.createOscillator()
  ping.type = 'triangle'
  ping.frequency.setValueAtTime(1680, now)
  ping.frequency.exponentialRampToValueAtTime(720, now + 0.09)
  const pingGain = current.createGain()
  pingGain.gain.setValueAtTime(0.001, now)
  pingGain.gain.exponentialRampToValueAtTime(0.07, now + 0.006)
  pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
  ping.connect(pingGain)
  pingGain.connect(current.destination)
  ping.start(now)
  ping.stop(now + 0.12)
}

function swish(current: AudioContext, now: number) {
  const seconds = 0.28
  const source = noise(current, seconds)
  const filter = current.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.9
  filter.frequency.setValueAtTime(3200, now)
  filter.frequency.exponentialRampToValueAtTime(900, now + seconds)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, now)
  gain.gain.exponentialRampToValueAtTime(0.13, now + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.001, now + seconds)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(current.destination)
  source.start(now)
  source.stop(now + seconds + 0.02)
}

function chime(current: AudioContext, when: number, freq: number, seconds: number, peak: number) {
  const osc = current.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, when)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)
  osc.connect(gain)
  gain.connect(current.destination)
  osc.start(when)
  osc.stop(when + seconds + 0.02)
}

/** Hard thud when the ball hits the backboard. */
export function playHoopsBoard() {
  const current = context()
  resumeHoopsAudio()
  const now = current.currentTime

  const slap = noise(current, 0.07)
  const slapFilter = current.createBiquadFilter()
  slapFilter.type = 'lowpass'
  slapFilter.frequency.setValueAtTime(1400, now)
  slapFilter.frequency.exponentialRampToValueAtTime(280, now + 0.07)
  const slapGain = current.createGain()
  slapGain.gain.setValueAtTime(0.16, now)
  slapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
  slap.connect(slapFilter)
  slapFilter.connect(slapGain)
  slapGain.connect(current.destination)
  slap.start(now)
  slap.stop(now + 0.08)

  const thud = current.createOscillator()
  thud.type = 'sine'
  thud.frequency.setValueAtTime(220, now)
  thud.frequency.exponentialRampToValueAtTime(70, now + 0.1)
  const thudGain = current.createGain()
  thudGain.gain.setValueAtTime(0.001, now)
  thudGain.gain.exponentialRampToValueAtTime(0.14, now + 0.008)
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
  thud.connect(thudGain)
  thudGain.connect(current.destination)
  thud.start(now)
  thud.stop(now + 0.14)
}

/** Nylon swish as the ball drops through the net. */
export function playHoopsNet() {
  const current = context()
  resumeHoopsAudio()
  swish(current, current.currentTime)
}

/** Swish plus a rising sting. Nothing else in the game uses this phrase. */
export function playHoopsPerfect() {
  const current = context()
  resumeHoopsAudio()
  const now = current.currentTime
  swish(current, now)
  const notes = [784, 988, 1318, 1568]
  notes.forEach((freq, i) => chime(current, now + 0.06 + i * 0.08, freq, 0.26, i === notes.length - 1 ? 0.09 : 0.065))
}
