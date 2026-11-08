/**
 * Copies everything the game plays (the audio bus's master) into blocks of raw stereo samples for the
 * replay, without changing what the player hears.
 */
import { gameAudio, gameOut } from '../audioBus'

/** Samples per block posted from the audio thread: about 43 ms at 48 kHz. */
const BLOCK = 2048

const WORKLET = `
class ReplayTap extends AudioWorkletProcessor {
  constructor() {
    super()
    this.left = new Float32Array(${BLOCK})
    this.right = new Float32Array(${BLOCK})
    this.filled = 0
  }
  process(inputs) {
    const input = inputs[0]
    const a = input && input[0]
    const b = input && (input[1] || input[0])
    const frames = a ? a.length : 128
    let read = 0
    while (read < frames) {
      const take = Math.min(frames - read, ${BLOCK} - this.filled)
      if (a) {
        this.left.set(a.subarray(read, read + take), this.filled)
        this.right.set(b.subarray(read, read + take), this.filled)
      } else {
        this.left.fill(0, this.filled, this.filled + take)
        this.right.fill(0, this.filled, this.filled + take)
      }
      this.filled += take
      read += take
      if (this.filled === ${BLOCK}) {
        this.port.postMessage({ left: this.left, right: this.right }, [this.left.buffer, this.right.buffer])
        this.left = new Float32Array(${BLOCK})
        this.right = new Float32Array(${BLOCK})
        this.filled = 0
      }
    }
    return true
  }
}
registerProcessor('replay-tap', ReplayTap)
`

export type AudioBlock = { left: Float32Array; right: Float32Array }

let loading: Promise<boolean> | null = null

function loadWorklet(ctx: AudioContext): Promise<boolean> {
  if (!loading) {
    loading = (async () => {
      if (!ctx.audioWorklet) return false
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))
      try {
        await ctx.audioWorklet.addModule(url)
        return true
      } finally {
        URL.revokeObjectURL(url)
      }
    })().catch(() => false)
  }
  return loading
}

/** A running tap. `stop()` disconnects it; blocks stop arriving straight away. */
export type AudioTap = { sampleRate: number; kind: 'worklet' | 'processor'; stop: () => void }

/** Starts copying game sound into `onBlock`. Resolves null where the browser cannot tap audio at all. */
export async function startAudioTap(onBlock: (block: AudioBlock) => void): Promise<AudioTap | null> {
  let ctx: AudioContext
  try {
    ctx = gameAudio()
  } catch {
    return null
  }
  // AudioWorklet only exists on https pages (and localhost); elsewhere the older ScriptProcessor does the job.
  if (!(await loadWorklet(ctx))) return startProcessorTap(ctx, onBlock)
  try {
    const node = new AudioWorkletNode(ctx, 'replay-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] })
    // The tap has to reach the speakers to be run, so it goes through a silent gain.
    const mute = ctx.createGain()
    mute.gain.value = 0
    gameOut().connect(node)
    node.connect(mute)
    mute.connect(ctx.destination)
    node.port.onmessage = (event: MessageEvent<AudioBlock>) => onBlock(event.data)
    return {
      sampleRate: ctx.sampleRate,
      kind: 'worklet',
      stop: () => {
        node.port.onmessage = null
        try {
          gameOut().disconnect(node)
        } catch {
          // Already disconnected.
        }
        node.disconnect()
        mute.disconnect()
      },
    }
  } catch {
    return startProcessorTap(ctx, onBlock)
  }
}

/** The same tap on a ScriptProcessorNode: older and run on the main thread, but available everywhere. */
function startProcessorTap(ctx: AudioContext, onBlock: (block: AudioBlock) => void): AudioTap | null {
  try {
    const node = ctx.createScriptProcessor(4096, 2, 2)
    const mute = ctx.createGain()
    mute.gain.value = 0
    node.onaudioprocess = (event) => {
      const input = event.inputBuffer
      const left = new Float32Array(input.getChannelData(0))
      const right = input.numberOfChannels > 1 ? new Float32Array(input.getChannelData(1)) : left.slice()
      onBlock({ left, right })
    }
    gameOut().connect(node)
    node.connect(mute)
    mute.connect(ctx.destination)
    return {
      sampleRate: ctx.sampleRate,
      kind: 'processor',
      stop: () => {
        node.onaudioprocess = null
        try {
          gameOut().disconnect(node)
        } catch {
          // Already disconnected.
        }
        node.disconnect()
        mute.disconnect()
      },
    }
  } catch {
    return null
  }
}
