/**
 * Records the last 10 seconds of a run on the player's device. Each captured frame is drawn into a
 * 720x1280 picture (the game, plus a strip with the logo, player and live score), encoded to H.264
 * with a keyframe every second, and kept in a rolling buffer that drops whole seconds from the front.
 * Game sound is copied from the audio bus into a rolling buffer of raw samples. When the run ends,
 * both are cut at the same point, the scorecard is added as a 2-second end card, and an MP4 is
 * written in memory. Nothing is uploaded. Any failure turns the replay off; the game never notices.
 */
import logoUrl from '../../assets/scorecard/logo-long.png'
import { drawScorecard, type ScorecardSpec } from '../scorecard'
import { startAudioTap, type AudioBlock, type AudioTap } from './audioTap'
import type { FromWorker, ToWorker } from './encoder.worker'
import type { TimedBlock, VideoChunk } from './mp4'
import { replayState, setReplayState } from './store'
import { gameAudioIfReady } from '../audioBus'

export const REPLAY_SECONDS = 10
const WIDTH = 720
const HEIGHT = 1280
const STRIP = 132
const BITRATE = 1_800_000
/** Frame rates tried in turn when the phone falls behind. The last one is kept to the end of the run. */
const FPS_STEPS = [30, 20, 15, 10]
/** Average time to draw and hand over one replay frame above which fewer frames are recorded. */
const SLOW_CAPTURE_MS = 8
/** Frames in a row the encoder can be behind before fewer frames are recorded: about a second. */
const BACKLOG_FRAMES = 30
const END_CARD_SECONDS = 2
const END_CARD_FPS = 10
/** A gap longer than this between frames is a pause or a hidden tab, and is squeezed to one frame. */
const MAX_GAP = 0.25
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif'
const CODECS = ['avc1.4d0029', 'avc1.42e029', 'avc1.4d001f', 'avc1.42001f']

export type ReplayStart = {
  /** Shown in the strip, such as "Lazy Hoops". */
  title: string
  username: string
  getScore: () => number
  /** Highest frame rate to record at. Card games redraw the page for every frame, so they ask for fewer. */
  maxFps?: number
}

let codecSupport: Promise<VideoEncoderConfig | null> | null = null

function videoConfig(codec: string, framerate: number): VideoEncoderConfig {
  return {
    codec,
    width: WIDTH,
    height: HEIGHT,
    bitrate: BITRATE,
    framerate,
    latencyMode: 'realtime',
    avc: { format: 'avc' },
  }
}

/** The first H.264 setup this browser can encode, or null (no replays here). */
function supportedConfig(): Promise<VideoEncoderConfig | null> {
  if (!codecSupport) {
    codecSupport = (async () => {
      if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null
      for (const codec of CODECS) {
        try {
          const config = videoConfig(codec, FPS_STEPS[0])
          const result = await VideoEncoder.isConfigSupported(config)
          if (result.supported) return config
        } catch {
          // Try the next profile.
        }
      }
      return null
    })()
  }
  return codecSupport
}

/** True where this browser can make replays at all. */
export function replaysSupported(): Promise<boolean> {
  return supportedConfig().then(Boolean)
}

let logo: HTMLImageElement | null = null
function logoImage() {
  if (!logo) {
    logo = new Image()
    logo.src = logoUrl
  }
  return logo
}

class Recording {
  private canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D
  private worker: Worker | null
  /** Frames on their way to the encoder or waiting in it. */
  private pending = 0
  private encoderQueue = 0
  /** Frames are posted in order: each waits for the one before. */
  private sending: Promise<void> = Promise.resolve()
  private finished: ((result: { chunks: VideoChunk[]; decoderConfig: VideoDecoderConfig | undefined } | null) => void) | null = null
  private blocks: TimedBlock[] = []
  private tap: AudioTap | null = null
  private sampleRate = 48000
  private audioCursor = -1
  private clock = 0
  private lastTick = -1
  private lastCaptureAt = 0
  private lastFrameAt = -Infinity
  private lastKeyAt = -Infinity
  private fpsStep = 0
  private captureMs = 0
  private framesAtStep = 0
  private backlog = 0
  private shownScore = Number.NaN
  private strip: HTMLCanvasElement | null = null
  private stripHasLogo = false
  stopped = false

  constructor(private readonly options: ReplayStart, config: VideoEncoderConfig) {
    const cap = options.maxFps ?? FPS_STEPS[0]
    this.fpsStep = Math.max(0, FPS_STEPS.findIndex((fps) => fps <= cap))
    this.canvas.width = WIDTH
    this.canvas.height = HEIGHT
    const ctx = this.canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('No 2D canvas')
    this.ctx = ctx
    const worker = new Worker(new URL('./encoder.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    worker.onmessage = (event: MessageEvent<FromWorker>) => this.heard(event.data)
    worker.onerror = () => this.fail('the encoder could not start')
    this.send({ type: 'start', config, keepSeconds: REPLAY_SECONDS })
    void startAudioTap((block) => this.hear(block)).then((tap) => {
      this.tapState = tap ? `on (${tap.kind})` : 'unavailable'
      if (this.stopped) tap?.stop()
      else if (tap) {
        this.tap = tap
        this.sampleRate = tap.sampleRate
      }
    })
  }

  private tapState = 'starting'
  private blocksHeard = 0

  private get fps() {
    return FPS_STEPS[this.fpsStep]
  }

  /** Advances the replay's own clock, which skips pauses so the replay only holds real play. */
  private tick(now: number) {
    if (this.lastTick >= 0) {
      const gap = (now - this.lastTick) / 1000
      this.clock += gap > MAX_GAP ? 1 / this.fps : gap
    }
    this.lastTick = now
    this.lastCaptureAt = now
  }

  private send(message: ToWorker, transfer: Transferable[] = []) {
    this.worker?.postMessage(message, transfer)
  }

  private heard(message: FromWorker) {
    if (message.type === 'encoded') {
      this.pending = Math.max(0, this.pending - 1)
      this.encoderQueue = message.queue
    } else if (message.type === 'queue') this.encoderQueue = message.queue
    else if (message.type === 'error') this.fail(message.message)
    else if (message.type === 'done') this.finished?.({ chunks: message.chunks, decoderConfig: message.decoderConfig })
  }

  /** True when the next capture would be recorded: lets games that must redraw for the replay skip the rest. */
  due() {
    if (this.stopped || !this.worker) return false
    return performance.now() - this.lastFrameWall >= 1000 / this.fps - 6
  }

  private lastFrameWall = -Infinity

  capture(source: CanvasImageSource & { width: number; height: number }, background?: CanvasImageSource | null) {
    if (this.stopped || !this.worker) return
    const now = performance.now()
    this.tick(now)
    if (this.clock - this.lastFrameAt < 1 / this.fps - 0.004) return
    if (this.pending + this.encoderQueue > 4) {
      // The encoder is behind: skip this frame, and record fewer frames if it stays behind.
      this.framesSkipped += 1
      this.backlog += 1
      if (this.backlog >= BACKLOG_FRAMES) this.slowDown()
      return
    }
    this.backlog = 0
    this.lastFrameWall = now
    const began = performance.now()
    this.compose(source, background)
    const key = this.clock - this.lastKeyAt >= 1
    const timestamp = Math.round(this.clock * 1e6)
    const duration = Math.round(1e6 / this.fps)
    // The snapshot is taken now but finished in the background, so the game never waits for the GPU here.
    const shot = createImageBitmap(this.canvas)
    this.pending += 1
    this.framesSent += 1
    this.sending = this.sending
      .then(() => shot)
      .then((bitmap) => {
        if (!this.worker) {
          bitmap.close()
          return
        }
        this.send({ type: 'frame', bitmap, timestamp, duration, key }, [bitmap])
      })
      .catch(() => {
        this.pending = Math.max(0, this.pending - 1)
      })
    if (key) this.lastKeyAt = this.clock
    this.lastFrameAt = this.clock
    // Gameplay comes first: if replay frames keep costing too much, record fewer of them.
    const spent = performance.now() - began
    this.captureMs = this.framesAtStep === 0 ? spent : this.captureMs * 0.9 + spent * 0.1
    this.framesAtStep += 1
    // A card game's redraw for the replay counts too.
    const cost = this.captureMs + Math.max(0, this.paintMs)
    if (this.framesAtStep >= 30 && cost > SLOW_CAPTURE_MS) this.slowDown()
  }

  private slowDown() {
    this.backlog = 0
    if (this.fpsStep >= FPS_STEPS.length - 1) return
    this.fpsStep += 1
    this.framesAtStep = 0
  }

  private framesSent = 0
  private framesSkipped = 0
  private paintMs = -1

  notePaint(ms: number) {
    this.paintMs = this.paintMs < 0 ? ms : this.paintMs * 0.9 + ms * 0.1
  }

  /** How the recording went, for the test server's replay notes. */
  stats() {
    const rate = gameAudioIfReady()?.sampleRate
    const paint = this.paintMs >= 0 ? ` + ${this.paintMs.toFixed(1)} ms redrawing` : ''
    return `${this.fps} fps, ${this.captureMs.toFixed(1)} ms a frame${paint}, ${this.framesSent} frames, ${this.framesSkipped} skipped; audio tap ${this.tapState}, ${this.blocksHeard} blocks${rate ? ` at ${rate} Hz` : ''}`
  }

  private compose(source: CanvasImageSource & { width: number; height: number }, background?: CanvasImageSource | null) {
    const ctx = this.ctx
    const areaH = HEIGHT - STRIP
    ctx.fillStyle = '#0b1530'
    ctx.fillRect(0, 0, WIDTH, areaH)
    const sw = source.width || 1
    const sh = source.height || 1
    const scale = Math.min(WIDTH / sw, areaH / sh)
    const w = sw * scale
    const h = sh * scale
    const x = (WIDTH - w) / 2
    const y = (areaH - h) / 2
    if (background) ctx.drawImage(background, x, y, w, h)
    ctx.drawImage(source, x, y, w, h)
    this.drawStrip()
  }

  /** The strip under the game: logo, game and player, and the live score. Redrawn only when the score changes. */
  private drawStrip() {
    const score = Math.max(0, Math.floor(this.options.getScore() || 0))
    const art = logoImage()
    const logoReady = art.complete && art.naturalWidth > 0
    if (!this.strip || score !== this.shownScore || (logoReady && !this.stripHasLogo)) {
      this.shownScore = score
      this.stripHasLogo = logoReady
      const strip = this.strip ?? document.createElement('canvas')
      strip.width = WIDTH
      strip.height = STRIP
      const s = strip.getContext('2d')
      if (s) {
        const fill = s.createLinearGradient(0, 0, 0, STRIP)
        fill.addColorStop(0, '#1c4b8a')
        fill.addColorStop(1, '#0a1c3c')
        s.fillStyle = fill
        s.fillRect(0, 0, WIDTH, STRIP)
        let textX = 24
        if (logoReady) {
          // The sign's chains start at the very top, so it hangs from the gold line drawn over it.
          const lh = 112
          const lw = (art.naturalWidth / art.naturalHeight) * lh
          s.drawImage(art, 16, 0, lw, lh)
          textX = 16 + lw + 16
        }
        s.fillStyle = '#ffd060'
        s.fillRect(0, 0, WIDTH, 4)
        s.textBaseline = 'middle'
        s.textAlign = 'left'
        s.fillStyle = '#fff4cc'
        s.font = `900 30px ${FONT}`
        s.fillText(this.options.title, textX, STRIP / 2 - 18, WIDTH - textX - 210)
        s.fillStyle = '#c9dcff'
        s.font = `800 26px ${FONT}`
        s.fillText(this.options.username, textX, STRIP / 2 + 22, WIDTH - textX - 210)
        s.textAlign = 'right'
        s.fillStyle = '#ffd060'
        s.font = `900 54px ${FONT}`
        s.fillText(score.toLocaleString('en-US'), WIDTH - 24, STRIP / 2 + 4, 190)
      }
      this.strip = strip
    }
    this.ctx.drawImage(this.strip, 0, HEIGHT - STRIP)
  }

  private hear(block: AudioBlock) {
    if (this.stopped) return
    this.blocksHeard += 1
    // Only keep sound while frames are arriving, so pauses drop out of the sound as well as the picture.
    if (performance.now() - this.lastCaptureAt > MAX_GAP * 1000) return
    const seconds = block.left.length / this.sampleRate
    const expected = this.clock - seconds
    if (this.audioCursor < 0 || Math.abs(this.audioCursor - expected) > 0.12) this.audioCursor = expected
    this.blocks.push({ ...block, timestamp: this.audioCursor })
    this.audioCursor += seconds
    const oldest = this.audioCursor - REPLAY_SECONDS - 2
    while (this.blocks.length && this.blocks[0].timestamp < oldest) this.blocks.shift()
  }

  failReason: string | null = null

  fail(reason: string) {
    if (import.meta.env.DEV) console.warn('Replay off:', reason)
    this.failReason = reason
    this.cancel()
    setReplayState({ status: 'off', reason })
  }

  cancel() {
    this.stopped = true
    this.tap?.stop()
    this.tap = null
    this.worker?.terminate()
    this.worker = null
    this.finished?.(null)
    this.finished = null
    this.blocks = []
  }

  /** Ends the recording and writes the MP4, with the scorecard as an end card. Null if nothing was recorded. */
  async finish(endCard: ScorecardSpec | null): Promise<{ video: Blob; poster: Blob | null; sound: string } | null> {
    if (this.stopped || !this.worker || this.lastFrameAt < 0) {
      if (import.meta.env.DEV) console.warn('Replay off: nothing recorded', { stopped: this.stopped, lastFrameAt: this.lastFrameAt })
      this.cancel()
      return null
    }
    this.stopped = true
    this.tap?.stop()
    this.tap = null
    const end = this.lastFrameAt + 1 / this.fps
    await this.sending
    if (endCard) await this.sendEndCard(endCard, end)
    const result = await new Promise<{ chunks: VideoChunk[]; decoderConfig: VideoDecoderConfig | undefined } | null>((resolve) => {
      this.finished = resolve
      this.send({ type: 'finish' })
    })
    this.finished = null
    this.worker?.terminate()
    this.worker = null
    if (!result || result.chunks.length === 0) return null
    const poster = await firstFrame(result.chunks[0], result.decoderConfig).catch(() => null)
    const { writeMp4 } = await loadMp4()
    const written = await writeMp4({
      chunks: result.chunks,
      decoderConfig: result.decoderConfig,
      frameRate: FPS_STEPS[0],
      start: result.chunks[0].timestamp,
      soundEnd: end,
      blocks: this.blocks,
      sampleRate: this.sampleRate,
    })
    this.blocks = []
    return written ? { video: written.video, poster, sound: written.sound } : null
  }

  private async sendEndCard(spec: ScorecardSpec, from: number) {
    try {
      const card = document.createElement('canvas')
      await drawScorecard(card, spec)
      const ctx = this.ctx
      ctx.fillStyle = '#0b1530'
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
      const size = WIDTH
      ctx.drawImage(card, 0, (HEIGHT - STRIP - size) / 2, size, size)
      this.drawStrip()
      const bitmap = await createImageBitmap(this.canvas)
      this.send({ type: 'still', bitmap, from, frames: END_CARD_SECONDS * END_CARD_FPS, fps: END_CARD_FPS }, [bitmap])
    } catch {
      // No end card; the gameplay part is still saved.
    }
  }
}

/**
 * The replay's first frame as a JPEG, shown on the player before it plays: an iPhone shows a black
 * box until a video is played, because it loads nothing before then.
 */
async function firstFrame(chunk: VideoChunk, config: VideoDecoderConfig | undefined): Promise<Blob | null> {
  if (!config || !chunk.key || typeof VideoDecoder === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  let drawn = false
  const decoder = new VideoDecoder({
    output: (frame) => {
      ctx.drawImage(frame, 0, 0, WIDTH, HEIGHT)
      frame.close()
      drawn = true
    },
    error: () => undefined,
  })
  try {
    decoder.configure(config)
    decoder.decode(new EncodedVideoChunk({ type: 'key', timestamp: 0, data: chunk.data }))
    await decoder.flush()
  } finally {
    if (decoder.state !== 'closed') decoder.close()
  }
  if (!drawn) return null
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
}

/** The MP4 writer, fetched the first time a run starts recording rather than when it ends. */
let mp4Module: Promise<typeof import('./mp4')> | null = null
function loadMp4() {
  if (!mp4Module) mp4Module = import('./mp4')
  return mp4Module
}

let current: Recording | null = null
let startTicket = 0

let runNumber = 0

/** Which run the replay belongs to; it changes each time a run starts recording. */
export function replayRun() {
  return runNumber
}

/** Starts recording a new run, throwing away any previous replay. */
export function startReplay(options: ReplayStart) {
  discardReplay()
  runNumber += 1
  logoImage()
  void loadMp4().catch(() => {
    mp4Module = null
  })
  const ticket = startTicket
  setReplayState({ status: 'recording' })
  void supportedConfig().then((config) => {
    if (ticket !== startTicket) return
    if (!config) {
      setReplayState({ status: 'off', reason: 'this browser cannot make H.264 video' })
      return
    }
    try {
      current = new Recording(options, config)
    } catch (error) {
      setReplayState({ status: 'off', reason: `could not start: ${(error as Error).message}` })
    }
  })
}

/** Call right after the game draws a frame. Cheap when not recording, and never throws. */
export function captureReplay(source: (CanvasImageSource & { width: number; height: number }) | null | undefined, background?: CanvasImageSource | null) {
  if (!current || !source) return
  try {
    current.capture(source, background)
  } catch (error) {
    current.fail(`capture failed: ${(error as Error).message}`)
    current = null
  }
}

/** True when a frame handed to captureReplay now would be recorded. */
export function replayFrameDue() {
  return current?.due() ?? false
}

/** Time a page-element game spent redrawing itself for the replay, shown in the test server's notes. */
export function notePaintMs(ms: number) {
  current?.notePaint(ms)
}

/** Ends the run's recording and makes the replay, with `endCard` as its last 2 seconds. */
export function finishReplay(endCard: ScorecardSpec | null) {
  const recording = current
  current = null
  if (!recording) {
    // The run ended before recording got going (or it already stopped): stop a late start, and say so.
    if (replayState().status === 'recording') {
      startTicket += 1
      setReplayState({ status: 'off', reason: 'the run ended before recording started' })
    }
    return
  }
  const ticket = startTicket
  const stats = recording.stats()
  setReplayState({ status: 'making' })
  recording
    .finish(endCard)
    .then((made) => {
      if (ticket !== startTicket) return
      if (!made) {
        setReplayState({ status: 'off', reason: recording.failReason ?? 'nothing was recorded' })
        return
      }
      setReplayState({
        status: 'ready',
        blob: made.video,
        url: URL.createObjectURL(made.video),
        poster: made.poster ? URL.createObjectURL(made.poster) : undefined,
        stats: `${stats}; sound ${made.sound}`,
      })
    })
    .catch((error) => {
      if (import.meta.env.DEV) console.warn('Replay off: could not write the video', error)
      if (ticket === startTicket) setReplayState({ status: 'off', reason: `could not write the video: ${(error as Error).message}` })
    })
}

/** Throws away the recording and any finished replay, freeing their memory. */
export function discardReplay() {
  if (!current && replayState().status === 'idle') return
  startTicket += 1
  current?.cancel()
  current = null
  setReplayState({ status: 'idle' })
}
