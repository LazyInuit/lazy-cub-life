let audio: AudioContext | null = null

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

function tone(
  current: AudioContext,
  when: number,
  frequency: number,
  seconds: number,
  peak: number,
) {
  const osc = current.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(frequency, when)
  const gain = current.createGain()
  gain.gain.setValueAtTime(0.001, when)
  gain.gain.exponentialRampToValueAtTime(peak, when + Math.min(0.03, seconds * 0.3))
  gain.gain.exponentialRampToValueAtTime(0.001, when + seconds)
  osc.connect(gain)
  gain.connect(current.destination)
  osc.start(when)
  osc.stop(when + seconds + 0.02)
}

/** Rising chime that rings out on a high chord. Plays when the cub levels up. */
export function playLevelSound() {
  const current = context()
  if (current.state === 'suspended') void current.resume()
  const now = current.currentTime
  const climb = [392, 494, 587, 659, 784, 988, 1175]
  climb.forEach((frequency, index) => {
    tone(current, now + index * 0.11, frequency, 0.42, 0.07)
  })
  const land = now + 0.84
  ;[784, 988, 1175, 1568].forEach((frequency) => {
    tone(current, land, frequency, 0.7, 0.06)
  })
}
