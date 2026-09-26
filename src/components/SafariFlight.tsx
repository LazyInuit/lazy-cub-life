import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import lionPawUrl from '../assets/lion-paw-ui.png'
import { drawFlightLion } from '../game/drawCub'
import { PLAY_NEED_COST } from '../game/progress'
import { playCrash, playEnd, playFlap, playIgnite, resumeFlightAudio, startSpaceAmbience, stopSpaceAmbience } from '../game/flightAudio'
import type { NeedKey } from '../game/types'
import { HomeButton, GamesButton } from './HomeButton'

type Gate = {
  x: number
  gapY: number
  scored: boolean
  kind: 'tree' | 'rock' | 'grass' | 'green' | 'orange' | 'blue' | 'pink' | 'red' | 'purple' | 'teal'
}

type Summary = { score: number; xpGained: number }

const GRAVITY = 1450
const FLAP = -430
const SPEED = 175
const GAP = 188
const GATE_W = 78
const SPACING = 250
const GROUND = 46

const KINDS: Gate['kind'][] = ['tree', 'rock', 'grass', 'green', 'orange', 'blue', 'pink', 'red', 'purple', 'teal']

type Props = {
  best: number
  onBest: (score: number) => void
  onReward: (baseXp: number, needs: Partial<Record<NeedKey, number>>) => { xpGained: number }
  onExit: () => void
  onGames: () => void
}

export function SafariFlight({ best, onBest, onReward, onExit, onGames }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onRewardRef = useRef(onReward)
  const onBestRef = useRef(onBest)
  const bestRef = useRef(best)
  onRewardRef.current = onReward
  onBestRef.current = onBest
  bestRef.current = Math.max(bestRef.current, best)

  const phase = useRef<'ready' | 'play' | 'done'>('ready')
  const y = useRef(0)
  const vel = useRef(0)
  const gates = useRef<Gate[]>([])
  const spawned = useRef(0)
  const score = useRef(0)
  const rewarded = useRef(false)
  const ready = useRef(true)

  const [hudScore, setHudScore] = useState(0)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [started, setStarted] = useState(false)

  const settle = (ending: 'pillar' | 'bounds' | 'leave' = 'leave') => {
    if (rewarded.current) return
    rewarded.current = true
    phase.current = 'done'
    if (ending === 'pillar') {
      playCrash()
      playEnd(0.16)
    } else if (ending === 'bounds') {
      playEnd()
    }
    const passed = score.current
    if (passed > bestRef.current) {
      bestRef.current = passed
      onBestRef.current(passed)
    }
    const result = onRewardRef.current(passed * 8, {
      happiness: 10,
      ...PLAY_NEED_COST,
    })
    setSummary({ score: passed, xpGained: result.xpGained })
    setHudScore(passed)
  }

  const retry = () => {
    phase.current = 'ready'
    ready.current = true
    y.current = 0
    vel.current = 0
    gates.current = []
    spawned.current = 0
    score.current = 0
    rewarded.current = false
    setHudScore(0)
    setStarted(false)
    setSummary(null)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let frame = 0
    let last = performance.now()
    let cancelled = false
    const startedAt = performance.now()

    const paint = (now: number) => {
      if (cancelled) return
      const dt = Math.min(0.032, (now - last) / 1000)
      last = now
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(rect.width * dpr))
      const height = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const w = rect.width
      const h = rect.height
      if (y.current === 0 && ready.current) y.current = h * 0.46
      const cubX = w * 0.5

      if (phase.current === 'play') {
        vel.current += GRAVITY * dt
        y.current += vel.current * dt
        const radius = 28
        if (y.current - radius < 0 || y.current + radius > h - GROUND) settle('bounds')
        for (const gate of gates.current) {
          gate.x -= SPEED * dt
          const overlaps = cubX + radius > gate.x && cubX - radius < gate.x + GATE_W
          if (
            phase.current === 'play' &&
            overlaps &&
            (y.current - radius < gate.gapY || y.current + radius > gate.gapY + GAP)
          ) {
            settle('pillar')
          }
          if (!gate.scored && gate.x + GATE_W < cubX && phase.current === 'play') {
            gate.scored = true
            playIgnite()
            score.current += 1
            setHudScore(score.current)
            if (score.current > bestRef.current) {
              bestRef.current = score.current
              onBestRef.current(score.current)
            }
          }
        }
        gates.current = gates.current.filter((gate) => gate.x > -GATE_W - 20)
        const lastGate = gates.current[gates.current.length - 1]
        if (!lastGate || lastGate.x < w - SPACING) {
          const margin = 36
          const gapY = margin + Math.random() * Math.max(40, h - GROUND - GAP - margin * 2)
          gates.current.push({
            x: w + 10,
            gapY,
            scored: false,
            kind: KINDS[Math.floor(spawned.current / 10) % KINDS.length],
          })
          spawned.current += 1
        }
      } else if (phase.current === 'ready') {
        y.current = h * 0.46 + Math.sin((now - startedAt) / 280) * 8
      }

      const ctx = canvas.getContext('2d')
      if (ctx && w > 0 && h > 0) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawSafari(ctx, w, h, gates.current, (now - startedAt) / 1000)
        const tilt = phase.current === 'play' ? Math.max(-0.6, Math.min(0.7, vel.current / 700)) : -0.15
        drawFlightLion(ctx, cubX, y.current, tilt, Math.min(w, h) / 820)
      }
        frame = requestAnimationFrame(paint)
    }

    frame = requestAnimationFrame(paint)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    startSpaceAmbience()
    return () => stopSpaceAmbience()
  }, [])

  const flap = () => {
    resumeFlightAudio()
    if (phase.current === 'done') return
    playFlap()
    if (phase.current === 'ready') {
      phase.current = 'play'
      ready.current = false
      gates.current = []
      spawned.current = 0
      score.current = 0
      setHudScore(0)
      setStarted(true)
    }
    vel.current = FLAP
  }
  const flapRef = useRef(flap)
  flapRef.current = flap

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'ArrowUp') {
        event.preventDefault()
        flapRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    flap()
  }

  return (
    <section className="game-screen flight">
      <header className="arcade-bar">
        <div className="arcade-nav">
          <HomeButton
            className="game-home"
            onClick={() => {
              if (summary) {
                onExit()
                return
              }
              if (phase.current === 'play') {
                settle()
                return
              }
              onExit()
            }}
          />
          <GamesButton
            className="game-home game-games"
            onClick={() => {
              if (summary) {
                onGames()
                return
              }
              if (phase.current === 'play') {
                settle('leave')
                onGames()
                return
              }
              if (!rewarded.current) {
                rewarded.current = true
                onReward(0, { happiness: 10, ...PLAY_NEED_COST })
              }
              onGames()
            }}
          />
        </div>
        <h1>Kovu's Space Dash</h1>
        <div className="arcade-scores" aria-label={`Score ${hudScore}, best ${Math.max(best, hudScore)}`}>
          <p className="arcade-score">
            <span>Score</span>
            <strong>{String(hudScore).padStart(4, '0')}</strong>
          </p>
          <p className="arcade-score arcade-best">
            <span>Best</span>
            <strong>{String(Math.max(best, hudScore)).padStart(4, '0')}</strong>
          </p>
        </div>
        <p className="arcade-help">
          {summary ? 'The cub crashed!' : started ? 'Tap to flap through the gaps.' : 'Tap to fly.'}
        </p>
      </header>
      <div className="flight-stage">
        <canvas
          ref={canvasRef}
          className="stage game-stage"
          onPointerDown={pointer}
          aria-label="Tap to flap"
        />
        {!started && !summary ? (
          <div className="tap-hint" aria-hidden="true">
            <span className="tap-ring" />
            <img className="tap-paw" src={lionPawUrl} alt="" />
          </div>
        ) : null}
      </div>
      {summary ? (
        <div className="results">
          <p>{summary.score} gap{summary.score === 1 ? '' : 's'} cleared.</p>
          <p className="results-xp">+{summary.xpGained} XP</p>
          <div className="flight-results-actions">
            <button type="button" className="cabinet-key" onClick={retry}>
              Retry
            </button>
            <button type="button" className="cabinet-key" onClick={onExit}>
              Back to cub
            </button>
            <button type="button" className="cabinet-key" onClick={onGames}>
              Back to games
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function starUnit(n: number): number {
  const value = Math.sin(n * 127.1) * 43758.5453
  return value - Math.floor(value)
}

function drawSafari(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gates: Gate[],
  time: number,
) {
  const sky = ctx.createLinearGradient(0, 0, width * 0.2, height)
  sky.addColorStop(0, '#07091a')
  sky.addColorStop(0.42, '#1a2460')
  sky.addColorStop(1, '#31184a')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  const glow = ctx.createRadialGradient(width * 0.2, height * 0.3, 10, width * 0.25, height * 0.4, width * 0.7)
  glow.addColorStop(0, 'rgba(90, 70, 180, 0.35)')
  glow.addColorStop(1, 'rgba(90, 70, 180, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  for (let i = 0; i < 46; i += 1) {
    const drift = (time * (4 + starUnit(i + 3) * 10)) % width
    const x = (starUnit(i + 1) * width + drift) % width
    const y = starUnit(i + 9) * (height - GROUND - 8)
    const radius = 0.6 + starUnit(i + 21) * 1.5
    ctx.globalAlpha = 0.35 + Math.abs(Math.sin(time * 1.4 + i)) * 0.65
    ctx.fillStyle = i % 5 === 0 ? '#f6d7ff' : '#fff8ee'
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  const planetX = width * 0.78
  const planetY = height * 0.16
  ctx.fillStyle = '#e7d7c4'
  ctx.beginPath()
  ctx.arc(planetX, planetY, 30, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(120, 96, 170, 0.45)'
  ctx.beginPath()
  ctx.ellipse(planetX, planetY, 46, 12, -0.45, 0, Math.PI * 2)
  ctx.fill()

  for (const gate of gates) drawGate(ctx, gate, height, time)

  ctx.fillStyle = '#161226'
  ctx.fillRect(0, height - GROUND, width, GROUND)
  ctx.fillStyle = '#7d6cff'
  ctx.fillRect(0, height - GROUND, width, 6)
}

function gateAccent(kind: Gate['kind']): string {
  if (kind === 'rock') return '#f0c14a'
  if (kind === 'grass') return '#e38bff'
  if (kind === 'green') return '#7dff6a'
  if (kind === 'orange') return '#ff8a3d'
  if (kind === 'blue') return '#6d9bff'
  if (kind === 'pink') return '#ff5c9a'
  if (kind === 'red') return '#ff5a5a'
  if (kind === 'purple') return '#b07bff'
  if (kind === 'teal') return '#2ee6c7'
  return '#7ef0ff'
}

function drawGate(ctx: CanvasRenderingContext2D, gate: Gate, height: number, time: number) {
  const topH = gate.gapY
  const bottomY = gate.gapY + GAP
  const bottomH = height - GROUND - bottomY
  const accent = gateAccent(gate.kind)
  const pulse = 0.72 + Math.sin(time * 4 + gate.x * 0.02) * 0.28
  if (topH > 0) drawPylon(ctx, gate.x, -24, topH + 24, accent, pulse, 'down', gate.scored)
  if (bottomH > 0) drawPylon(ctx, gate.x, bottomY, bottomH + 24, accent, pulse, 'up', gate.scored)
}

function drawPylon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  accent: string,
  pulse: number,
  cap: 'up' | 'down',
  lit: boolean,
) {
  const w = GATE_W
  ctx.save()
  ctx.shadowColor = accent
  ctx.shadowBlur = 14
  const hull = ctx.createLinearGradient(x, 0, x + w, 0)
  hull.addColorStop(0, '#141222')
  hull.addColorStop(0.22, '#3c365c')
  hull.addColorStop(0.55, '#242038')
  hull.addColorStop(1, '#0c0a14')
  ctx.fillStyle = hull
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 8)
  ctx.fill()
  ctx.shadowBlur = 0

  ctx.fillStyle = accent
  ctx.globalAlpha = 0.9
  ctx.fillRect(x + 5, y, 3, h)
  ctx.fillRect(x + w - 8, y, 3, h)
  ctx.globalAlpha = 0.22
  ctx.fillRect(x + w * 0.46, y, 4, h)
  ctx.globalAlpha = 1

  ctx.strokeStyle = 'rgba(190, 214, 255, 0.22)'
  ctx.lineWidth = 1
  for (let py = y + 22; py < y + h - 18; py += 28) {
    ctx.beginPath()
    ctx.moveTo(x + 14, py)
    ctx.lineTo(x + w - 14, py)
    ctx.stroke()
    ctx.fillStyle = '#d7e6ff'
    ctx.beginPath()
    ctx.arc(x + 16, py, 1.5, 0, Math.PI * 2)
    ctx.arc(x + w - 16, py, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }

  const lip = cap === 'down' ? y + h - 8 : y
  const nodeY = cap === 'down' ? y + h - 18 : y + 10
  if (lit) {
    ctx.globalAlpha = 0.35 * pulse
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.ellipse(x + w / 2, cap === 'down' ? y + h : y, w * 0.78, 12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#f4fbff'
    ctx.fillRect(x - 7, lip, w + 14, 8)
    ctx.globalAlpha = pulse
    ctx.fillStyle = accent
    ctx.fillRect(x - 11, lip + 2, w + 22, 4)
    ctx.globalAlpha = 1
    ctx.fillStyle = accent
  } else {
    ctx.fillStyle = '#2a2640'
    ctx.fillRect(x - 7, lip, w + 14, 8)
    ctx.fillStyle = '#14111e'
    ctx.fillRect(x - 11, lip + 2, w + 22, 4)
    ctx.fillStyle = '#3a3454'
  }
  ctx.beginPath()
  ctx.arc(x + w / 2, nodeY, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
