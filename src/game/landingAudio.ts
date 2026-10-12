const LANDING_BGM_ID = 'landing-bgm'
/** Half of 0.85, then halved three more times. iPhone ignores audio.volume, so this goes through a gain node. */
const LANDING_LEVEL = 0.052

let context: AudioContext | null = null
let wired = false

function element(): HTMLAudioElement | null {
  const found = document.getElementById(LANDING_BGM_ID)
  return found instanceof HTMLAudioElement ? found : null
}

function output(audio: HTMLAudioElement) {
  const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) {
    audio.volume = LANDING_LEVEL
    return
  }
  if (!context) context = new Ctx()
  if (!wired) {
    const gain = context.createGain()
    gain.gain.value = LANDING_LEVEL
    context.createMediaElementSource(audio).connect(gain)
    gain.connect(context.destination)
    wired = true
  }
  if (context.state === 'suspended') void context.resume()
}

/** Start Sunny Title from the door tap, quiet enough for the Play screen. */
export function startLandingBgm() {
  const audio = element()
  if (!audio) return
  output(audio)
  if (!audio.paused) return
  void audio.play().catch(() => {
    /* the phone may still block sound until the screen is touched */
  })
}

export function stopLandingBgm() {
  const audio = element()
  if (!audio) return
  audio.pause()
  audio.currentTime = 0
}
