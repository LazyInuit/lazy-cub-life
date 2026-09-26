let audio: AudioContext | null = null

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

/** A short knock on glass. Plays when the window is tapped. */
export function playWindowTap() {
  const current = context()
  if (current.state === 'suspended') void current.resume()
  const when = current.currentTime

  const length = Math.max(1, Math.floor(current.sampleRate * 0.05))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const t = i / length
    data[i] = (Math.random() * 2 - 1) * (1 - t) ** 2
  }
  const noise = current.createBufferSource()
  noise.buffer = buffer
  const click = current.createBiquadFilter()
  click.type = 'highpass'
  click.frequency.setValueAtTime(1800, when)
  const clickGain = current.createGain()
  clickGain.gain.setValueAtTime(0.12, when)
  clickGain.gain.exponentialRampToValueAtTime(0.001, when + 0.045)
  noise.connect(click)
  click.connect(clickGain)
  clickGain.connect(current.destination)
  noise.start(when)
  noise.stop(when + 0.06)

  const ping = current.createOscillator()
  ping.type = 'sine'
  ping.frequency.setValueAtTime(1860, when)
  ping.frequency.exponentialRampToValueAtTime(980, when + 0.12)
  const pingGain = current.createGain()
  pingGain.gain.setValueAtTime(0.001, when)
  pingGain.gain.exponentialRampToValueAtTime(0.07, when + 0.008)
  pingGain.gain.exponentialRampToValueAtTime(0.001, when + 0.14)
  ping.connect(pingGain)
  pingGain.connect(current.destination)
  ping.start(when)
  ping.stop(when + 0.16)
}
