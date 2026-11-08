/**
 * The replay's video encoder, off the game's main thread. Turning a picture into a video frame can make
 * the browser wait for the GPU (about 10 ms on an iPhone), so that wait happens here instead of in the
 * game. Frames arrive as ImageBitmaps; encoded frames are kept in a rolling buffer that drops whole
 * seconds from the front, and are handed back when the run ends.
 */
type VideoChunk = { data: Uint8Array; key: boolean; timestamp: number; duration: number }

export type ToWorker =
  | { type: 'start'; config: VideoEncoderConfig; keepSeconds: number }
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number; duration: number; key: boolean }
  /** The end card: one picture shown for `frames` frames from `from` seconds. */
  | { type: 'still'; bitmap: ImageBitmap; from: number; frames: number; fps: number }
  | { type: 'finish' }

export type FromWorker =
  /** A frame reached the encoder. */
  | { type: 'encoded'; queue: number }
  /** The encoder finished a frame, so its queue is shorter. */
  | { type: 'queue'; queue: number }
  | { type: 'error'; message: string }
  | { type: 'done'; chunks: VideoChunk[]; decoderConfig: VideoDecoderConfig | undefined }

const scope = self as unknown as Worker
const post = (message: FromWorker, transfer: Transferable[] = []) => scope.postMessage(message, transfer)

let encoder: VideoEncoder | null = null
let decoderConfig: VideoDecoderConfig | undefined
let chunks: VideoChunk[] = []
let keepSeconds = 10
let trimming = true

function keep(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) {
  if (meta?.decoderConfig) decoderConfig = meta.decoderConfig
  const data = new Uint8Array(chunk.byteLength)
  chunk.copyTo(data)
  chunks.push({ data, key: chunk.type === 'key', timestamp: chunk.timestamp / 1e6, duration: (chunk.duration ?? 0) / 1e6 })
  post({ type: 'queue', queue: encoder?.encodeQueueSize ?? 0 })
  if (!trimming) return
  const newest = chunks[chunks.length - 1].timestamp
  for (;;) {
    const nextKey = chunks.findIndex((c, i) => i > 0 && c.key)
    if (nextKey < 0 || newest - chunks[nextKey].timestamp < keepSeconds) break
    chunks.splice(0, nextKey)
  }
}

function encode(bitmap: ImageBitmap, timestamp: number, duration: number, key: boolean, close: boolean) {
  if (!encoder) return
  const frame = new VideoFrame(bitmap, { timestamp, duration })
  try {
    encoder.encode(frame, { keyFrame: key })
  } finally {
    frame.close()
    if (close) bitmap.close()
  }
}

scope.onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data
  try {
    if (message.type === 'start') {
      keepSeconds = message.keepSeconds
      encoder = new VideoEncoder({ output: keep, error: (error) => post({ type: 'error', message: `encoder error: ${error.message}` }) })
      encoder.configure(message.config)
    } else if (message.type === 'frame') {
      encode(message.bitmap, message.timestamp, message.duration, message.key, true)
      post({ type: 'encoded', queue: encoder?.encodeQueueSize ?? 0 })
    } else if (message.type === 'still') {
      // The end card is kept whole, however long the run was.
      trimming = false
      for (let i = 0; i < message.frames; i += 1) {
        encode(message.bitmap, Math.round((message.from + i / message.fps) * 1e6), Math.round(1e6 / message.fps), i === 0, false)
      }
      message.bitmap.close()
    } else if (message.type === 'finish') {
      trimming = false
      if (encoder) {
        await encoder.flush()
        encoder.close()
        encoder = null
      }
      post({ type: 'done', chunks, decoderConfig }, chunks.map((c) => c.data.buffer))
      chunks = []
    }
  } catch (error) {
    if (message.type === 'frame') message.bitmap.close()
    post({ type: 'error', message: `${message.type} failed: ${(error as Error).message}` })
  }
}
