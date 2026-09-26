let audio: AudioContext | null = null

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

function noise(current: AudioContext, when: number, seconds: number, peak: number, hz: number, sweepTo: number) {
  const length = Math.max(1, Math.floor(current.sampleRate * seconds))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
  const source = current.createBufferSource()
  source.buffer = buffer
  const filter = current.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(hz, when)
  filter.frequency.exponentialRampToValueAtTime(sweepTo, when + seconds)
  filter.Q.setValueAtTime(0.7, when)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(peak, when + Math.min(0.04, seconds * 0.3))
  gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(current.destination)
  source.start(when)
  source.stop(when + seconds + 0.02)
}

function plop(current: AudioContext, when: number) {
  const osc = current.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(400, when)
  osc.frequency.exponentialRampToValueAtTime(180, when + 0.08)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(0.04, when + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.08)
  osc.connect(gain)
  gain.connect(current.destination)
  osc.start(when)
  osc.stop(when + 0.1)
}

/** A pouring stream. Plays when the cub is washed. */
export function playSplash() {
  const current = context()
  if (current.state === 'suspended') void current.resume()
  const when = current.currentTime
  noise(current, when, 1.15, 0.1, 1600, 320)
  ;[0.18, 0.46, 0.78].forEach((offset) => plop(current, when + offset))
}
