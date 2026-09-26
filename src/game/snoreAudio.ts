let audio: AudioContext | null = null
let master: GainNode | null = null
let nodes: AudioScheduledSourceNode[] = []
let timer: number | null = null
let generation = 0
let looping = false

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

function breath(current: AudioContext, when: number, seconds: number, peak: number, hz: number) {
  if (!master) return
  const length = Math.max(1, Math.floor(current.sampleRate * seconds))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1

  const source = current.createBufferSource()
  source.buffer = buffer
  const filter = current.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(hz * 0.55, when)
  filter.frequency.linearRampToValueAtTime(hz, when + seconds * 0.4)
  filter.frequency.linearRampToValueAtTime(hz * 0.4, when + seconds)
  filter.Q.setValueAtTime(0.9, when)

  const flutter = current.createGain()
  flutter.gain.setValueAtTime(1, when)
  const lfo = current.createOscillator()
  lfo.frequency.setValueAtTime(5, when)
  const depth = current.createGain()
  depth.gain.setValueAtTime(0.2, when)
  lfo.connect(depth)
  depth.connect(flutter.gain)

  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(peak, when + seconds * 0.45)
  gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)

  source.connect(filter)
  filter.connect(flutter)
  flutter.connect(gain)
  gain.connect(master)
  source.start(when)
  lfo.start(when)
  source.stop(when + seconds + 0.02)
  lfo.stop(when + seconds + 0.02)
  nodes.push(source, lfo)
}

function whistle(current: AudioContext, when: number, seconds: number) {
  if (!master) return
  const osc = current.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(820, when)
  osc.frequency.exponentialRampToValueAtTime(460, when + seconds)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(0.045, when + seconds * 0.25)
  gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)
  osc.connect(gain)
  gain.connect(master)
  osc.start(when)
  osc.stop(when + seconds + 0.02)
  nodes.push(osc)
}

function cycle(when: number): number {
  const current = context()
  breath(current, when, 0.7, 0.05, 500)
  whistle(current, when + 0.75, 1.05)
  return 3.3
}

export function startSnore() {
  stopSnore()
  generation += 1
  const gen = generation
  looping = true
  const current = context()
  if (current.state === 'suspended') void current.resume()
  const now = current.currentTime
  master = current.createGain()
  master.gain.setValueAtTime(0.001, now)
  master.gain.exponentialRampToValueAtTime(1, now + 0.2)
  master.connect(current.destination)

  const step = () => {
    if (gen !== generation) return
    const duration = cycle(current.currentTime + 0.05)
    timer = window.setTimeout(() => {
      if (gen !== generation) return
      if (looping) step()
      else stopSnore()
    }, duration * 1000)
  }
  step()
}

export function stopSnore() {
  generation += 1
  looping = false
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
  if (master && audio) {
    const when = audio.currentTime
    master.gain.cancelScheduledValues(when)
    master.gain.setValueAtTime(Math.max(0.001, master.gain.value), when)
    master.gain.exponentialRampToValueAtTime(0.001, when + 0.25)
  }
  const stopAt = (audio?.currentTime ?? 0) + 0.3
  for (const source of nodes) {
    try {
      source.stop(stopAt)
    } catch {
      // Already finished.
    }
  }
  nodes = []
  master = null
}
