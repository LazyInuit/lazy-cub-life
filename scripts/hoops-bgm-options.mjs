/**
 * 10 Lazy Hoops BGM options in the Ninja Cub Dojo lounge vein.
 * Built from (and variations of) bgm-easy-bonus-lounge.wav.
 * Run: node scripts/hoops-bgm-options.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcWav = path.join(__dirname, '..', 'src', 'assets', 'lazy-dojo', 'audio', 'bgm-easy-bonus-lounge.wav')
const outDir = path.join(__dirname, '..', 'lazy-hoops', 'bgm-options')

const OPTIONS = [
  { id: '01-dojo-lounge-classic', name: 'Dojo Lounge Classic', rate: 1, gain: 1, bright: 0 },
  { id: '02-slower-evening', name: 'Slower Evening', rate: 0.92, gain: 1.02, bright: -0.15 },
  { id: '03-brighter-bounce', name: 'Brighter Bounce', rate: 1.06, gain: 0.98, bright: 0.2 },
  { id: '04-deeper-den', name: 'Deeper Den', rate: 0.88, gain: 1.05, bright: -0.25 },
  { id: '05-cafe-lift', name: 'Cafe Lift', rate: 1.1, gain: 0.95, bright: 0.12 },
  { id: '06-soft-focus', name: 'Soft Focus', rate: 0.97, gain: 1, bright: -0.35 },
  { id: '07-double-lounge', name: 'Double Lounge', rate: 1, gain: 0.85, bright: 0, detune: 1.007 },
  { id: '08-low-end-sway', name: 'Low-End Sway', rate: 0.95, gain: 1.08, bright: -0.2, bassBoost: 1.35 },
  { id: '09-sparkle-room', name: 'Sparkle Room', rate: 1.03, gain: 0.9, bright: 0.28, sparkle: true },
  { id: '10-dream-tempo', name: 'Dream Tempo', rate: 0.84, gain: 1.02, bright: -0.1 },
]

function readWavMono(filePath) {
  const buf = fs.readFileSync(filePath)
  const sr = buf.readUInt32LE(24)
  const ch = buf.readUInt16LE(22)
  const bits = buf.readUInt16LE(34)
  let off = 12
  let dataOff = 44
  let dataSize = buf.length - 44
  while (off + 8 < buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'data') {
      dataOff = off + 8
      dataSize = size
      break
    }
    off += 8 + size
  }
  const samples = new Float32Array(Math.floor(dataSize / 2 / ch))
  for (let i = 0; i < samples.length; i += 1) {
    let sum = 0
    for (let c = 0; c < ch; c += 1) {
      sum += buf.readInt16LE(dataOff + (i * ch + c) * 2) / 32768
    }
    samples[i] = sum / ch
  }
  return { sr, samples }
}

function writeWav(filePath, samples, sr) {
  const dataSize = samples.length * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sr, 24)
  buf.writeUInt32LE(sr * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2)
  }
  fs.writeFileSync(filePath, buf)
}

function resample(src, rate) {
  if (Math.abs(rate - 1) < 0.001) return Float32Array.from(src)
  const outLen = Math.max(1, Math.floor(src.length / rate))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i += 1) {
    const x = i * rate
    const i0 = Math.floor(x)
    const i1 = Math.min(src.length - 1, i0 + 1)
    const t = x - i0
    out[i] = src[i0] * (1 - t) + src[i1] * t
  }
  return out
}

function tone(samples, t0, dur, freq, peak, sr) {
  const n0 = Math.floor(t0 * sr)
  const n1 = Math.min(samples.length, Math.floor((t0 + dur) * sr))
  for (let i = n0; i < n1; i += 1) {
    const u = (i - n0) / Math.max(1, n1 - n0)
    const env = Math.min(1, u / 0.1) * Math.min(1, (1 - u) / 0.2)
    samples[i] += Math.sin((2 * Math.PI * freq * (i - n0)) / sr) * peak * env
  }
}

function vary(base, opt, sr) {
  let samples = resample(base, opt.rate)

  // Simple one-pole tilt for bright/dark
  if (opt.bright) {
    const out = new Float32Array(samples.length)
    let prev = 0
    const soft = opt.bright < 0 ? 0.15 + Math.abs(opt.bright) * 0.5 : 0.08
    for (let i = 0; i < samples.length; i += 1) {
      prev = prev * (1 - soft) + samples[i] * soft
      if (opt.bright < 0) out[i] = prev
      else out[i] = samples[i] + (samples[i] - prev) * opt.bright
    }
    samples = out
  }

  if (opt.bassBoost) {
    const out = new Float32Array(samples.length)
    let lp = 0
    for (let i = 0; i < samples.length; i += 1) {
      lp = lp * 0.97 + samples[i] * 0.03
      out[i] = samples[i] + lp * (opt.bassBoost - 1)
    }
    samples = out
  }

  if (opt.detune) {
    const twin = resample(base, opt.rate * opt.detune)
    const out = new Float32Array(samples.length)
    for (let i = 0; i < samples.length; i += 1) {
      const j = Math.min(twin.length - 1, i)
      out[i] = samples[i] * 0.62 + twin[j] * 0.38
    }
    samples = out
  }

  if (opt.sparkle) {
    // Soft high shimmer on top of lounge bed
    const out = Float32Array.from(samples)
    for (let k = 0; k < 6; k += 1) {
      tone(out, 0.4 + k * 1.1, 0.55, 660 + k * 40, 0.025, sr)
    }
    samples = out
  }

  const g = opt.gain ?? 1
  let peak = 0
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] *= g
    peak = Math.max(peak, Math.abs(samples[i]))
  }
  if (peak > 0.95) {
    const s = 0.95 / peak
    for (let i = 0; i < samples.length; i += 1) samples[i] *= s
  }

  // Loop-friendly fades
  const fade = Math.floor(sr * 0.04)
  for (let i = 0; i < fade; i += 1) {
    const a = i / fade
    samples[i] *= a
    samples[samples.length - 1 - i] *= a
  }
  return samples
}

const { sr, samples: base } = readWavMono(srcWav)
fs.mkdirSync(outDir, { recursive: true })

const lines = [
  '# Lazy Hoops BGM options — Ninja Cub lounge family',
  '',
  'Built from the Dojo `bgm-easy-bonus-lounge` vibe (tempo / warmth / sparkle variants).',
  'Pick a number/name to wire into Lazy Hoops.',
  '',
]

for (const opt of OPTIONS) {
  const out = vary(base, opt, sr)
  const file = `${opt.id}.wav`
  writeWav(path.join(outDir, file), out, sr)
  lines.push(`- **${opt.name}** — \`${file}\``)
  console.log('wrote', file)
}

fs.writeFileSync(path.join(outDir, 'README.md'), `${lines.join('\n')}\n`)
console.log('done →', outDir)
