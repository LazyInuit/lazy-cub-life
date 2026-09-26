let audio: AudioContext | null = null

const CUB = {
  seconds: 0.48,
  start: 360,
  top: 520,
  end: 240,
  growl: 28,
  voice: 0.16,
  breath: 0.14,
  mouth: 900,
}

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

/** A short cub roar. Plays when the cub is tapped. */
export function playRoar() {
  const current = context()
  if (current.state === 'suspended') void current.resume()
  const when = current.currentTime
  const roar = CUB
  const osc = current.createOscillator()
  osc.type = 'sawtooth'
  const rise = Math.min(0.09, roar.seconds * 0.2)
  osc.frequency.setValueAtTime(roar.start, when)
  osc.frequency.linearRampToValueAtTime(roar.top, when + rise)
  osc.frequency.exponentialRampToValueAtTime(roar.end, when + roar.seconds)

  const grit = current.createOscillator()
  grit.type = 'square'
  grit.frequency.setValueAtTime(roar.start * 0.5, when)
  grit.frequency.linearRampToValueAtTime(roar.top * 0.5, when + rise)
  grit.frequency.exponentialRampToValueAtTime(roar.end * 0.5, when + roar.seconds)

  const growl = current.createOscillator()
  growl.frequency.setValueAtTime(roar.growl, when)
  const shake = current.createGain()
  shake.gain.setValueAtTime(1, when)
  const depth = current.createGain()
  depth.gain.setValueAtTime(0.72, when)
  growl.connect(depth)
  depth.connect(shake.gain)

  const body = current.createBiquadFilter()
  body.type = 'lowpass'
  body.frequency.setValueAtTime(roar.mouth * 1.8, when)
  body.frequency.exponentialRampToValueAtTime(roar.mouth * 0.55, when + roar.seconds)
  body.Q.setValueAtTime(0.7, when)

  const mouth = current.createBiquadFilter()
  mouth.type = 'bandpass'
  mouth.frequency.setValueAtTime(roar.mouth, when + rise)
  mouth.frequency.exponentialRampToValueAtTime(roar.mouth * 0.62, when + roar.seconds)
  mouth.Q.setValueAtTime(2.2, when)

  const voice = current.createGain()
  voice.gain.setValueAtTime(0.001, when)
  voice.gain.exponentialRampToValueAtTime(roar.voice, when + rise)
  voice.gain.exponentialRampToValueAtTime(0.001, when + roar.seconds)

  const gritGain = current.createGain()
  gritGain.gain.value = 0.35

  osc.connect(body)
  grit.connect(gritGain)
  gritGain.connect(body)
  body.connect(mouth)
  mouth.connect(shake)
  shake.connect(voice)
  voice.connect(current.destination)

  const length = Math.max(1, Math.floor(current.sampleRate * (roar.seconds + 0.05)))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
  const noise = current.createBufferSource()
  noise.buffer = buffer
  const hiss = current.createBiquadFilter()
  hiss.type = 'bandpass'
  hiss.frequency.setValueAtTime(roar.mouth, when)
  hiss.frequency.exponentialRampToValueAtTime(roar.mouth * 0.5, when + roar.seconds)
  hiss.Q.setValueAtTime(0.6, when)
  const breath = current.createGain()
  breath.gain.setValueAtTime(0.001, when)
  breath.gain.exponentialRampToValueAtTime(roar.breath, when + rise * 0.6)
  breath.gain.exponentialRampToValueAtTime(0.001, when + roar.seconds)
  noise.connect(hiss)
  hiss.connect(shake)
  shake.connect(breath)
  breath.connect(current.destination)

  const stop = when + roar.seconds + 0.04
  osc.start(when)
  grit.start(when)
  growl.start(when)
  noise.start(when)
  osc.stop(stop)
  grit.stop(stop)
  growl.stop(stop)
  noise.stop(stop)
}
