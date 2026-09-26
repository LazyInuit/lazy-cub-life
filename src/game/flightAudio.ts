let audio: AudioContext | null = null
let bed: SpaceBed | null = null

type SpaceBed = {
  master: GainNode
  sources: AudioScheduledSourceNode[]
}

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

export function resumeFlightAudio(): void {
  const current = context()
  if (current.state === 'suspended') void current.resume()
}

export function playFlap(): void {
  const current = context()
  resumeFlightAudio()
  const now = current.currentTime
  const seconds = 0.11
  const length = Math.max(1, Math.floor(current.sampleRate * seconds))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const t = i / length
    const env = Math.sin(Math.PI * t) * (1 - t)
    data[i] = (Math.random() * 2 - 1) * env
  }

  const noise = current.createBufferSource()
  noise.buffer = buffer
  const filter = current.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.7
  filter.frequency.setValueAtTime(1500, now)
  filter.frequency.exponentialRampToValueAtTime(260, now + seconds)
  const noiseGain = current.createGain()
  noiseGain.gain.setValueAtTime(0.001, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.21, now + 0.012)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + seconds)

  const body = current.createOscillator()
  body.type = 'sine'
  body.frequency.setValueAtTime(460, now)
  body.frequency.exponentialRampToValueAtTime(130, now + seconds)
  const bodyGain = current.createGain()
  bodyGain.gain.setValueAtTime(0.001, now)
  bodyGain.gain.exponentialRampToValueAtTime(0.08, now + 0.01)
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + seconds)

  noise.connect(filter)
  filter.connect(noiseGain)
  noiseGain.connect(current.destination)
  body.connect(bodyGain)
  bodyGain.connect(current.destination)
  noise.start(now)
  body.start(now)
  noise.stop(now + seconds)
  body.stop(now + seconds)
}

export function playIgnite(): void {
  const current = context()
  resumeFlightAudio()
  const now = current.currentTime
  const seconds = 0.07
  const length = Math.max(1, Math.floor(current.sampleRate * seconds))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const t = i / length
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 14)
  }

  const spark = current.createBufferSource()
  spark.buffer = buffer
  const sparkTone = current.createBiquadFilter()
  sparkTone.type = 'highpass'
  sparkTone.frequency.value = 1400
  const sparkGain = current.createGain()
  sparkGain.gain.setValueAtTime(0.05, now)
  sparkGain.gain.exponentialRampToValueAtTime(0.001, now + seconds)

  const rise = current.createOscillator()
  rise.type = 'sine'
  rise.frequency.setValueAtTime(280, now)
  rise.frequency.exponentialRampToValueAtTime(1600, now + 0.16)
  const riseGain = current.createGain()
  riseGain.gain.setValueAtTime(0.001, now)
  riseGain.gain.exponentialRampToValueAtTime(0.06, now + 0.05)
  riseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32)

  const bloom = current.createOscillator()
  bloom.type = 'sine'
  bloom.frequency.setValueAtTime(1320, now)
  const bloomGain = current.createGain()
  bloomGain.gain.setValueAtTime(0.001, now)
  bloomGain.gain.exponentialRampToValueAtTime(0.045, now + 0.1)
  bloomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)

  spark.connect(sparkTone)
  sparkTone.connect(sparkGain)
  sparkGain.connect(current.destination)
  rise.connect(riseGain)
  riseGain.connect(current.destination)
  bloom.connect(bloomGain)
  bloomGain.connect(current.destination)
  spark.start(now)
  rise.start(now)
  bloom.start(now)
  spark.stop(now + seconds)
  rise.stop(now + 0.32)
  bloom.stop(now + 0.4)
}

export function playCrash(): void {
  const current = context()
  resumeFlightAudio()
  const now = current.currentTime
  const seconds = 0.22
  const length = Math.max(1, Math.floor(current.sampleRate * seconds))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const t = i / length
    const spark = Math.random() < 0.28 + (1 - t) * 0.55 ? 1 : 0
    data[i] = (Math.random() * 2 - 1) * spark * Math.exp(-t * 7)
  }

  const noise = current.createBufferSource()
  noise.buffer = buffer
  const crackle = current.createBiquadFilter()
  crackle.type = 'highpass'
  crackle.frequency.value = 1600
  const noiseGain = current.createGain()
  noiseGain.gain.setValueAtTime(0.2, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + seconds)

  const zap = current.createOscillator()
  zap.type = 'square'
  zap.frequency.setValueAtTime(1800, now)
  zap.frequency.exponentialRampToValueAtTime(220, now + 0.14)
  const zapTone = current.createBiquadFilter()
  zapTone.type = 'bandpass'
  zapTone.frequency.setValueAtTime(2200, now)
  zapTone.frequency.exponentialRampToValueAtTime(500, now + 0.14)
  zapTone.Q.value = 0.7
  const zapGain = current.createGain()
  zapGain.gain.setValueAtTime(0.001, now)
  zapGain.gain.exponentialRampToValueAtTime(0.08, now + 0.01)
  zapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)

  noise.connect(crackle)
  crackle.connect(noiseGain)
  noiseGain.connect(current.destination)
  zap.connect(zapTone)
  zapTone.connect(zapGain)
  zapGain.connect(current.destination)
  noise.start(now)
  zap.start(now)
  noise.stop(now + seconds)
  zap.stop(now + 0.18)
}

function endNote(current: AudioContext, when: number, frequency: number, seconds: number, peak: number) {
  const osc = current.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(frequency, when)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)
  osc.connect(gain)
  gain.connect(current.destination)
  osc.start(when)
  osc.stop(when + seconds)
}

export function playEnd(delay = 0): void {
  const current = context()
  resumeFlightAudio()
  const now = current.currentTime + delay
  endNote(current, now, 494, 0.28, 0.1)
  endNote(current, now + 0.16, 370, 0.32, 0.085)
  endNote(current, now + 0.34, 247, 0.46, 0.07)
}

function padVoice(current: AudioContext, frequency: number, amount: number, dest: AudioNode): OscillatorNode {
  const osc = current.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = frequency
  const gain = current.createGain()
  gain.gain.value = amount
  osc.connect(gain)
  gain.connect(dest)
  osc.start()
  return osc
}

export function startSpaceAmbience(): void {
  if (bed) return
  const current = context()
  resumeFlightAudio()
  const now = current.currentTime
  const master = current.createGain()
  master.gain.setValueAtTime(0, now)
  master.gain.linearRampToValueAtTime(0.4, now + 1.6)
  master.connect(current.destination)

  const pad = current.createGain()
  pad.gain.value = 0.86
  pad.connect(master)

  const breath = current.createOscillator()
  breath.frequency.value = 0.05
  const breathDepth = current.createGain()
  breathDepth.gain.value = 0.14
  breath.connect(breathDepth)
  breathDepth.connect(pad.gain)
  breath.start()

  const voices: Array<[number, number]> = [
    [196, 0.1],
    [196 * 1.0035, 0.065],
    [293.66, 0.082],
    [293.66 * 1.0025, 0.047],
  ]
  const sources = voices.map(([frequency, amount]) => padVoice(current, frequency, amount, pad))

  bed = { master, sources: [...sources, breath] }
}

export function stopSpaceAmbience(): void {
  if (!bed || !audio) return
  const current = bed
  bed = null
  const when = audio.currentTime + 0.05
  current.master.gain.setValueAtTime(current.master.gain.value, audio.currentTime)
  current.master.gain.linearRampToValueAtTime(0, when)
  for (const source of current.sources) {
    try {
      source.stop(when)
    } catch {
      // The source was already stopped.
    }
  }
}
