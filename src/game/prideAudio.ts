import softDrumsUrl from '../assets/pride-soft-drums.wav'
import softFailUrl from '../assets/pride-soft-fail.wav'

let audio: AudioContext | null = null
let bed: PrideBed | null = null
let loading: Promise<void> | null = null
let buffer: AudioBuffer | null = null
let failLoading: Promise<void> | null = null
let failBuffer: AudioBuffer | null = null

type PrideBed = {
  master: GainNode
  source: AudioBufferSourceNode
}

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

export function resumePrideAudio(): void {
  const current = context()
  if (current.state === 'suspended') void current.resume()
}

async function decodeUrl(url: string): Promise<AudioBuffer> {
  const current = context()
  const response = await fetch(url)
  const raw = await response.arrayBuffer()
  return current.decodeAudioData(raw.slice(0))
}

async function ensureBuffer(): Promise<AudioBuffer> {
  if (buffer) return buffer
  if (!loading) {
    loading = (async () => {
      buffer = await decodeUrl(softDrumsUrl)
    })()
  }
  await loading
  if (!buffer) throw new Error('Pride music failed to load')
  return buffer
}

async function ensureFailBuffer(): Promise<AudioBuffer> {
  if (failBuffer) return failBuffer
  if (!failLoading) {
    failLoading = (async () => {
      failBuffer = await decodeUrl(softFailUrl)
    })()
  }
  await failLoading
  if (!failBuffer) throw new Error('Pride fail sound failed to load')
  return failBuffer
}

export async function startPrideAmbience(): Promise<void> {
  if (bed) return
  resumePrideAudio()
  const current = context()
  const track = await ensureBuffer()
  if (bed) return

  const now = current.currentTime
  const master = current.createGain()
  master.gain.setValueAtTime(0, now)
  master.gain.linearRampToValueAtTime(0.48, now + 0.9)
  master.connect(current.destination)

  const source = current.createBufferSource()
  source.buffer = track
  source.loop = true
  source.playbackRate.value = 1
  source.connect(master)
  source.start()

  bed = { master, source }
}

/** 0 = calm start tempo, 1 = almost out of time. */
export function setPrideUrgency(amount: number): void {
  if (!bed || !audio) return
  const urgency = Math.max(0, Math.min(1, amount))
  const rate = 1 + urgency * urgency * 0.55
  const now = audio.currentTime
  bed.source.playbackRate.cancelScheduledValues(now)
  bed.source.playbackRate.setTargetAtTime(rate, now, 0.25)
}

export function stopPrideAmbience(): void {
  if (!bed || !audio) return
  const current = bed
  bed = null
  const when = audio.currentTime + 0.05
  current.master.gain.cancelScheduledValues(audio.currentTime)
  current.master.gain.setValueAtTime(current.master.gain.value, audio.currentTime)
  current.master.gain.linearRampToValueAtTime(0, when)
  try {
    current.source.stop(when + 0.02)
  } catch {
    // Already stopped.
  }
}

export async function playPrideFail(): Promise<void> {
  resumePrideAudio()
  const current = context()
  const track = await ensureFailBuffer()
  const now = current.currentTime
  const source = current.createBufferSource()
  source.buffer = track
  const gain = current.createGain()
  gain.gain.value = 0.7
  source.connect(gain)
  gain.connect(current.destination)
  source.start(now)
}
