let audio: AudioContext | null = null
const live: AudioScheduledSourceNode[] = []

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

function stopLive() {
  for (const source of live) {
    try {
      source.stop()
    } catch {
      // Already finished.
    }
  }
  live.length = 0
}

function keep(source: AudioScheduledSourceNode) {
  live.push(source)
  source.onended = () => {
    const index = live.indexOf(source)
    if (index >= 0) live.splice(index, 1)
  }
}

function noise(
  current: AudioContext,
  when: number,
  seconds: number,
  peak: number,
  fromHz: number,
  toHz: number,
  type: BiquadFilterType,
) {
  const length = Math.max(1, Math.floor(current.sampleRate * seconds))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const t = i / length
    const crackle = Math.random() < 0.04 ? 1.8 : 1
    data[i] = (Math.random() * 2 - 1) * crackle * (1 - t * 0.35)
  }
  const source = current.createBufferSource()
  source.buffer = buffer
  const filter = current.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(Math.max(40, fromHz), when)
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, toHz), when + seconds)
  filter.Q.setValueAtTime(0.7, when)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(peak, when + Math.min(0.05, seconds * 0.18))
  gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(current.destination)
  source.start(when)
  source.stop(when + seconds + 0.02)
  keep(source)
}

function bloom(current: AudioContext, when: number, fromHz: number, toHz: number, seconds: number, peak: number) {
  const osc = current.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(fromHz, when)
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, toHz), when + seconds)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(peak, when + seconds * 0.2)
  gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)
  osc.connect(gain)
  gain.connect(current.destination)
  osc.start(when)
  osc.stop(when + seconds + 0.02)
  keep(osc)
}

function begin() {
  const current = context()
  if (current.state === 'suspended') void current.resume()
  stopLive()
  return current
}

/** A flame catching. Plays when the pumpkin is lit. */
export function playPumpkinLight() {
  const current = begin()
  const when = current.currentTime
  noise(current, when, 0.55, 0.08, 280, 1900, 'lowpass')
  noise(current, when + 0.02, 0.18, 0.035, 2400, 900, 'highpass')
  bloom(current, when, 80, 170, 0.4, 0.025)
}

/** A flame going out. Plays when the pumpkin is put out. */
export function playPumpkinOut() {
  const current = begin()
  const when = current.currentTime
  noise(current, when, 0.6, 0.07, 1400, 160, 'lowpass')
  noise(current, when, 0.16, 0.025, 700, 180, 'bandpass')
  bloom(current, when, 150, 55, 0.45, 0.02)
}
