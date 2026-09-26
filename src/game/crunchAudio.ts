let audio: AudioContext | null = null

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

function resume(): void {
  const current = context()
  if (current.state === 'suspended') void current.resume()
}

function slurp(current: AudioContext, when: number, peak: number) {
  const seconds = 0.32
  const length = Math.max(1, Math.floor(current.sampleRate * seconds))
  const buffer = current.createBuffer(1, length, current.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const t = i / length
    const wet = Math.sin(t * Math.PI) ** 1.4
    data[i] = (Math.random() * 2 - 1) * wet
  }
  const source = current.createBufferSource()
  source.buffer = buffer
  const filter = current.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.setValueAtTime(4, when)
  filter.frequency.setValueAtTime(1400, when)
  filter.frequency.exponentialRampToValueAtTime(420, when + seconds)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.04)
  gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(current.destination)
  source.start(when)
  source.stop(when + seconds + 0.02)

  const gulp = current.createOscillator()
  gulp.type = 'sine'
  gulp.frequency.setValueAtTime(280, when)
  gulp.frequency.exponentialRampToValueAtTime(110, when + 0.22)
  const gulpGain = current.createGain()
  gulpGain.gain.setValueAtTime(0.001, when)
  gulpGain.gain.exponentialRampToValueAtTime(peak * 0.55, when + 0.03)
  gulpGain.gain.exponentialRampToValueAtTime(0.001, when + 0.24)
  gulp.connect(gulpGain)
  gulpGain.connect(current.destination)
  gulp.start(when)
  gulp.stop(when + 0.26)
}

/** Two drink slurps. Plays when the cub is fed. */
export function playSlurp() {
  const current = context()
  resume()
  const now = current.currentTime
  slurp(current, now, 0.16)
  slurp(current, now + 0.72, 0.12)
}
