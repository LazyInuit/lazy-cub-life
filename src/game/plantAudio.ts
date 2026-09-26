let audio: AudioContext | null = null

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

function rustle(current: AudioContext, when: number, seconds: number, peak: number, hz: number) {
  const length = Math.max(1, Math.floor(current.sampleRate * seconds))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const t = i / length
    data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t)
  }
  const source = current.createBufferSource()
  source.buffer = buffer
  const filter = current.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(hz, when)
  filter.Q.setValueAtTime(0.8, when)
  const gain = current.createGain()
  gain.gain.setValueAtTime(peak, when)
  gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(current.destination)
  source.start(when)
  source.stop(when + seconds + 0.02)
}

/** A soft leaf rustle. Plays when the plant is tapped. */
export function playPlantRuffle() {
  const current = context()
  if (current.state === 'suspended') void current.resume()
  const when = current.currentTime
  rustle(current, when, 0.12, 0.09, 1400)
  rustle(current, when + 0.06, 0.1, 0.07, 2200)
  rustle(current, when + 0.13, 0.14, 0.06, 900)
  rustle(current, when + 0.2, 0.09, 0.04, 1800)
}
