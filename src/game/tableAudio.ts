let audio: AudioContext | null = null

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

/** A short knock on wood. Plays when the table top is tapped. */
export function playTableKnock() {
  const current = context()
  if (current.state === 'suspended') void current.resume()
  const when = current.currentTime

  const length = Math.max(1, Math.floor(current.sampleRate * 0.07))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const t = i / length
    data[i] = (Math.random() * 2 - 1) * (1 - t) ** 3
  }
  const noise = current.createBufferSource()
  noise.buffer = buffer
  const thump = current.createBiquadFilter()
  thump.type = 'lowpass'
  thump.frequency.setValueAtTime(480, when)
  const thumpGain = current.createGain()
  thumpGain.gain.setValueAtTime(0.16, when)
  thumpGain.gain.exponentialRampToValueAtTime(0.001, when + 0.07)
  noise.connect(thump)
  thump.connect(thumpGain)
  thumpGain.connect(current.destination)
  noise.start(when)
  noise.stop(when + 0.08)

  const wood = current.createOscillator()
  wood.type = 'sine'
  wood.frequency.setValueAtTime(210, when)
  wood.frequency.exponentialRampToValueAtTime(90, when + 0.09)
  const woodGain = current.createGain()
  woodGain.gain.setValueAtTime(0.001, when)
  woodGain.gain.exponentialRampToValueAtTime(0.08, when + 0.008)
  woodGain.gain.exponentialRampToValueAtTime(0.001, when + 0.1)
  wood.connect(woodGain)
  woodGain.connect(current.destination)
  wood.start(when)
  wood.stop(when + 0.12)
}
