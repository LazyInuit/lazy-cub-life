let audio: AudioContext | null = null

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

/** A short button click. Must be called from the tap itself. */
export function playClick() {
  const current = context()
  if (current.state === 'suspended') void current.resume()
  const when = current.currentTime

  const length = Math.max(1, Math.floor(current.sampleRate * 0.04))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const t = i / length
    data[i] = (Math.random() * 2 - 1) * (1 - t) ** 2
  }
  const noise = current.createBufferSource()
  noise.buffer = buffer
  const tick = current.createBiquadFilter()
  tick.type = 'highpass'
  tick.frequency.setValueAtTime(1400, when)
  const tickGain = current.createGain()
  tickGain.gain.setValueAtTime(0.1, when)
  tickGain.gain.exponentialRampToValueAtTime(0.001, when + 0.04)
  noise.connect(tick)
  tick.connect(tickGain)
  tickGain.connect(current.destination)
  noise.start(when)
  noise.stop(when + 0.05)

  const pop = current.createOscillator()
  pop.type = 'triangle'
  pop.frequency.setValueAtTime(720, when)
  pop.frequency.exponentialRampToValueAtTime(280, when + 0.06)
  const popGain = current.createGain()
  popGain.gain.setValueAtTime(0.001, when)
  popGain.gain.exponentialRampToValueAtTime(0.08, when + 0.006)
  popGain.gain.exponentialRampToValueAtTime(0.001, when + 0.07)
  pop.connect(popGain)
  popGain.connect(current.destination)
  pop.start(when)
  pop.stop(when + 0.08)
}
