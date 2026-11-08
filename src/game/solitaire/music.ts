/**
 * Spellitaire background music: the Arcane Puzzle loop.
 */
import bgmUrl from '../../assets/solitaire/bgm-arcane-puzzle.wav'
import { gameAudio, gameOut } from '../audioBus'

/** Background music at 20% volume. */
const BGM_GAIN = 0.2

let audio: AudioContext | null = null
let bgmBuffer: AudioBuffer | null = null
let bgmSource: AudioBufferSourceNode | null = null
let bgmGain: GainNode | null = null
/** Bumped on every start and stop, so a slow load never starts music that was already stopped. */
let bgmTicket = 0

function ctx(): AudioContext | null {
  try {
    if (!audio) audio = gameAudio()
    return audio
  } catch {
    return null
  }
}

export function stopSpellitaireBgm() {
  bgmTicket += 1
  try {
    bgmSource?.stop()
  } catch {
    // Already stopped.
  }
  bgmSource?.disconnect()
  bgmGain?.disconnect()
  bgmSource = null
  bgmGain = null
}

// A hot reload in development would otherwise leave the old copy playing under the new one.
import.meta.hot?.dispose(() => stopSpellitaireBgm())

/** Starts the looping music, or leaves it playing if it already is. Stays silent if the file cannot play. */
export function startSpellitaireBgm() {
  const current = ctx()
  if (!current) return
  if (current.state === 'suspended') void current.resume()
  if (bgmSource) return
  bgmTicket += 1
  const ticket = bgmTicket
  void (async () => {
    try {
      if (!bgmBuffer) {
        const res = await fetch(bgmUrl)
        bgmBuffer = await current.decodeAudioData(await res.arrayBuffer())
      }
      if (ticket !== bgmTicket || bgmSource) return
      const gain = current.createGain()
      gain.gain.value = BGM_GAIN
      const source = current.createBufferSource()
      source.buffer = bgmBuffer
      source.loop = true
      source.connect(gain)
      gain.connect(gameOut())
      source.start()
      bgmSource = source
      bgmGain = gain
    } catch {
      // No music if the file fails to load or decode; the game still plays.
    }
  })()
}
