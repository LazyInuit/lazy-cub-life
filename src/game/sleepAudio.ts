let audio: AudioContext | null = null
let master: GainNode | null = null
let nodes: OscillatorNode[] = []
let timer: number | null = null
let generation = 0
let looping = false

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

function note(current: AudioContext, when: number, frequency: number, seconds: number, peak: number) {
  if (!master) return
  const osc = current.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(frequency, when)
  const gain = current.createGain()
  const attack = Math.min(0.18, seconds * 0.4)
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(peak, when + attack)
  gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)
  osc.connect(gain)
  gain.connect(master)
  osc.start(when)
  osc.stop(when + seconds + 0.02)
  nodes.push(osc)
}

function phrase(when: number): number {
  const current = context()
  const chords = [
    [261.63, 329.63, 392],
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [261.63, 329.63, 392],
  ]
  chords.forEach((voices, index) => {
    voices.forEach((frequency) => note(current, when + index * 1.8, frequency, 2.3, 0.035))
  })
  return 7.2
}

export function startLullaby() {
  stopLullaby()
  generation += 1
  const gen = generation
  looping = true
  const current = context()
  if (current.state === 'suspended') void current.resume()
  const now = current.currentTime
  master = current.createGain()
  master.gain.setValueAtTime(0.001, now)
  master.gain.exponentialRampToValueAtTime(1, now + 0.45)
  master.connect(current.destination)

  const step = () => {
    if (gen !== generation) return
    const duration = phrase(current.currentTime + 0.05)
    timer = window.setTimeout(() => {
      if (gen !== generation) return
      if (looping) step()
      else stopLullaby()
    }, Math.max(0.2, duration - 0.25) * 1000)
  }
  step()
}

export function stopLullaby() {
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
    master.gain.exponentialRampToValueAtTime(0.001, when + 0.6)
  }
  const stopAt = (audio?.currentTime ?? 0) + 0.65
  for (const osc of nodes) {
    try {
      osc.stop(stopAt)
    } catch {
      // Already finished.
    }
  }
  nodes = []
  master = null
}
