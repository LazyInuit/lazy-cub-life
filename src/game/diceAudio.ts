let audio: AudioContext | null = null

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

function noiseBurst(current: AudioContext, when: number, seconds: number, peak: number) {
  const length = Math.max(1, Math.floor(current.sampleRate * seconds))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const t = i / length
    const env = (1 - Math.exp(-12 * t)) * Math.exp(-16 * t)
    data[i] = (Math.random() * 2 - 1 - (Math.random() * 2 - 1) * 0.35) * env
  }
  const source = current.createBufferSource()
  source.buffer = buffer
  const filter = current.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(2000, when)
  filter.Q.setValueAtTime(0.8, when)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), when + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(current.destination)
  source.start(when)
  source.stop(when + seconds + 0.02)
}

function click(current: AudioContext, when: number, peak: number, hz: number) {
  const osc = current.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(hz, when)
  osc.frequency.exponentialRampToValueAtTime(Math.max(80, hz * 0.55), when + 0.04)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), when + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.045)
  osc.connect(gain)
  gain.connect(current.destination)
  osc.start(when)
  osc.stop(when + 0.06)

  const length = Math.max(1, Math.floor(current.sampleRate * 0.03))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const t = i / length
    data[i] = (Math.random() * 2 - 1) * (1 - t) ** 2
  }
  const noise = current.createBufferSource()
  noise.buffer = buffer
  const noiseGain = current.createGain()
  noiseGain.gain.setValueAtTime(peak * 0.45, when)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, when + 0.03)
  noise.connect(noiseGain)
  noiseGain.connect(current.destination)
  noise.start(when)
  noise.stop(when + 0.04)
}

/** Dice settling after a shake. Plays when the random outfit button is pressed. */
export function playDiceRattle() {
  const current = context()
  if (current.state === 'suspended') void current.resume()
  const when = current.currentTime
  const hits = [0, 0.05, 0.12, 0.22, 0.36, 0.54, 0.78]
  hits.forEach((offset, i) => {
    const peak = 0.22 * Math.exp(-0.25 * i)
    noiseBurst(current, when + offset, 0.08, peak)
    click(current, when + offset, peak * 0.7, 1000 - i * 70)
  })
}
