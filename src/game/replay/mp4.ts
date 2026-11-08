/**
 * Writes a replay's encoded video and recorded sound into an MP4 in memory. Loaded only when a replay
 * is made, so the game itself never downloads the MP4 writer.
 */
import { AudioSample, AudioSampleSource, BufferTarget, canEncodeAudio, EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output } from 'mediabunny'
import type { AudioBlock } from './audioTap'

export type VideoChunk = { data: Uint8Array; key: boolean; timestamp: number; duration: number }
export type TimedBlock = AudioBlock & { timestamp: number }

export type Mp4Parts = {
  chunks: VideoChunk[]
  decoderConfig: VideoDecoderConfig | undefined
  frameRate: number
  /** Where the video starts, on the recording clock; everything is moved to start at 0. */
  start: number
  /** Where the sound stops: the end of the gameplay, before the end card. */
  soundEnd: number
  blocks: TimedBlock[]
  sampleRate: number
}

const AUDIO_BITRATE = 128_000

let fallbackAac: Promise<void> | null = null

/**
 * True once this browser can make AAC sound. Older iPhones have no built-in AAC encoder, so they get
 * Mediabunny's own (about 1 MB, downloaded only on those phones and only once).
 */
async function aacReady(sampleRate: number): Promise<'built-in' | 'added' | false> {
  const config = { numberOfChannels: 2, sampleRate, bitrate: AUDIO_BITRATE }
  if (await canEncodeAudio('aac', config)) return 'built-in'
  try {
    if (!fallbackAac) fallbackAac = import('@mediabunny/aac-encoder').then(({ registerAacEncoder }) => registerAacEncoder())
    await fallbackAac
  } catch {
    fallbackAac = null
    return false
  }
  return (await canEncodeAudio('aac', config)) ? 'added' : false
}

export type Mp4Result = { video: Blob; sound: string }

export async function writeMp4(parts: Mp4Parts): Promise<Mp4Result | null> {
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
  const video = new EncodedVideoPacketSource('avc')
  output.addVideoTrack(video, { frameRate: parts.frameRate })
  const last = parts.chunks[parts.chunks.length - 1]
  const videoEnd = last ? last.timestamp + last.duration : parts.soundEnd
  const pcm = soundBetween(parts.blocks, parts.start, parts.soundEnd, Math.max(parts.soundEnd, videoEnd), parts.sampleRate)
  let audio: AudioSampleSource | null = null
  let sound = pcm ? `no AAC encoder (${pcm.level})` : 'nothing heard'
  // Where no AAC encoder can be had the replay is saved without sound.
  const aac = pcm ? await aacReady(parts.sampleRate) : false
  if (pcm && aac) {
    audio = new AudioSampleSource({ codec: 'aac', bitrate: AUDIO_BITRATE })
    output.addAudioTrack(audio)
    sound = `AAC (${aac}), ${pcm.level}`
  }
  await output.start()
  let first = true
  for (const chunk of parts.chunks) {
    const packet = new EncodedPacket(chunk.data, chunk.key ? 'key' : 'delta', chunk.timestamp - parts.start, chunk.duration)
    await video.add(packet, first ? { decoderConfig: parts.decoderConfig } : undefined)
    first = false
  }
  if (audio && pcm) {
    const sample = new AudioSample({ data: pcm.samples, format: 'f32-planar', numberOfChannels: 2, sampleRate: parts.sampleRate, timestamp: 0 })
    await audio.add(sample)
    sample.close()
  }
  await output.finalize()
  const buffer = output.target.buffer
  return buffer ? { video: new Blob([buffer], { type: 'video/mp4' }), sound } : null
}

/** The replay plays at the game's own volume, only turned down if its loudest moment would distort. */
const PEAK = 0.89
const MAX_BOOST = 1

/**
 * The recorded sound from `start` to `end` as planar stereo, then silence on to `total` so the sound
 * lasts as long as the video (some players, Photos among them, drop a sound track that ends early).
 * Gaps are silent, and it fades in and out at the gameplay's ends.
 */
function soundBetween(
  blocks: TimedBlock[],
  start: number,
  end: number,
  total: number,
  sampleRate: number,
): { samples: Float32Array; level: string } | null {
  if (blocks.length === 0 || end <= start) return null
  const length = Math.round((total - start) * sampleRate)
  const heard = Math.min(length, Math.round((end - start) * sampleRate))
  const out = new Float32Array(length * 2)
  let peak = 0
  for (const block of blocks) {
    const at = Math.round((block.timestamp - start) * sampleRate)
    for (let i = 0; i < block.left.length; i += 1) {
      const j = at + i
      if (j < 0 || j >= heard) continue
      out[j] = block.left[i]
      out[length + j] = block.right[i]
      peak = Math.max(peak, Math.abs(block.left[i]), Math.abs(block.right[i]))
    }
  }
  const boost = peak > 0.001 ? Math.min(MAX_BOOST, PEAK / peak) : 1
  const fadeIn = Math.min(heard, Math.round(0.05 * sampleRate))
  const fadeOut = Math.min(heard, Math.round(0.3 * sampleRate))
  for (let j = 0; j < heard; j += 1) {
    let gain = boost
    if (j < fadeIn) gain *= j / fadeIn
    if (j >= heard - fadeOut) gain *= (heard - 1 - j) / fadeOut
    out[j] *= gain
    out[length + j] *= gain
  }
  return { samples: out, level: `peak ${peak.toFixed(2)}, boosted ${boost.toFixed(1)}x` }
}
