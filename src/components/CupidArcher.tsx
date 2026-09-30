import { useEffect, useRef, useState } from 'react'
import backgroundUrl from '../assets/cupid-archer/background-2.png'
import cubUrl from '../assets/cupid-archer/cub.png'
import lionPawUrl from '../assets/lion-paw-ui.png'
import { ARCHER_XP_PER_SCORE, LIVES, ROUND_SECONDS } from '../game/cupidArcher/config'
import {
  playBullseye,
  playDraw,
  playHit,
  playOver,
  playRelease,
  playWarn,
  resumeArcherAudio,
  startArcherBgm,
  stopArcherBgm,
} from '../game/cupidArcher/audio'
import { drawArcherFrame } from '../game/cupidArcher/draw'
import {
  aimOrigin,
  beginAim,
  cancelAim,
  createRound,
  moveAim,
  releaseAim,
  resizeRound,
  stepRound,
} from '../game/cupidArcher/engine'
import type { ArcherRound } from '../game/cupidArcher/types'
import { PLAY_NEED_COST, moodFromScore } from '../game/progress'
import type { NeedKey } from '../game/types'
import { GamesButton, HomeButton } from './HomeButton'

type Mode = 'start' | 'play' | 'over'

type Props = {
  best: number
  onBest: (score: number) => void
  onReward: (
    baseXp: number,
    needs: Partial<Record<NeedKey, number>>,
    options?: { flat?: boolean },
  ) => { xpGained: number }
  onExit: () => void
  onGames: () => void
}

type Summary = {
  score: number
  best: number
  neuBest: boolean
  bullseyes: number
  accuracy: number
  xp: number
}

function loadImage(src: string) {
  const image = new Image()
  image.src = src
  return image
}

function formatClock(seconds: number) {
  const whole = Math.max(0, Math.ceil(seconds))
  const mins = Math.floor(whole / 60)
  const secs = whole % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function LivesHud({ lives }: { lives: number }) {
  return (
    <div className="dojo-lives" aria-label={`${lives} lives`}>
      {Array.from({ length: LIVES }, (_, i) => (
        <span key={i} className={`dojo-life${i < lives ? ' on' : ''}`} aria-hidden>
          <svg className="dojo-heart" viewBox="0 0 32 30" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id={`archerHeartFill${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ff6b6b" />
                <stop offset="45%" stopColor="#e03131" />
                <stop offset="100%" stopColor="#c92a2a" />
              </linearGradient>
              <linearGradient id={`archerHeartGold${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fff3bf" />
                <stop offset="40%" stopColor="#ffd43b" />
                <stop offset="100%" stopColor="#e67700" />
              </linearGradient>
            </defs>
            <path
              className="dojo-heart-body"
              d="M16 27.2C16 27.2 3.2 19.4 3.2 10.6 3.2 6.4 6.4 3.5 10.2 3.5c2.4 0 4.5 1.2 5.8 3.1C17.3 4.7 19.4 3.5 21.8 3.5c3.8 0 7 2.9 7 7.1 0 8.8-12.8 16.6-12.8 16.6z"
              fill={`url(#archerHeartFill${i})`}
              stroke={`url(#archerHeartGold${i})`}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <path
              className="dojo-heart-shine"
              d="M9.2 8.2c1.4-1.5 3.4-1.7 4.2-.6"
              fill="none"
              stroke="#ffe3e3"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.85"
            />
          </svg>
        </span>
      ))}
    </div>
  )
}

export function CupidArcher({ best, onBest, onReward, onExit, onGames }: Props) {
  const [mode, setMode] = useState<Mode>('start')
  const [hud, setHud] = useState({ lives: LIVES, score: 0, time: ROUND_SECONDS, shots: 0, aiming: false })
  const [pullHint, setPullHint] = useState({ x: 0, y: 0 })
  const [summary, setSummary] = useState<Summary | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const roundRef = useRef<ArcherRound | null>(null)
  const bgRef = useRef<HTMLImageElement | null>(null)
  const cubRef = useRef<HTMLImageElement | null>(null)
  const modeRef = useRef(mode)
  const rewarded = useRef(false)
  const bestRef = useRef(best)
  const onBestRef = useRef(onBest)
  const onRewardRef = useRef(onReward)
  const hudLivesRef = useRef(LIVES)
  const hudTimeRef = useRef(ROUND_SECONDS)
  const hudShotsRef = useRef(0)
  const hudAimingRef = useRef(false)
  modeRef.current = mode
  bestRef.current = Math.max(bestRef.current, best)
  onBestRef.current = onBest
  onRewardRef.current = onReward

  useEffect(() => {
    bgRef.current = loadImage(backgroundUrl)
    cubRef.current = loadImage(cubUrl)
  }, [])

  useEffect(() => () => stopArcherBgm(), [])

  const finish = (round: ArcherRound) => {
    if (rewarded.current) return
    rewarded.current = true
    playOver()
    const score = round.score
    const neuBest = score > bestRef.current
    if (neuBest) {
      bestRef.current = score
      onBestRef.current(score)
    }
    const result = onRewardRef.current(
      Math.round(score * ARCHER_XP_PER_SCORE),
      { ...moodFromScore(score), ...PLAY_NEED_COST },
      { flat: true },
    )
    const accuracy = round.shots > 0 ? Math.round((round.hits / round.shots) * 100) : 0
    setSummary({
      score,
      best: bestRef.current,
      neuBest,
      bullseyes: round.bullseyes,
      accuracy,
      xp: result.xpGained,
    })
    setMode('over')
  }

  const finishRef = useRef(finish)
  finishRef.current = finish

  const paint = () => {
    const canvas = canvasRef.current
    const round = roundRef.current
    if (!canvas || !round) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawArcherFrame(ctx, round, bgRef.current, cubRef.current)
  }

  useEffect(() => {
    if (mode !== 'play') return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!roundRef.current) roundRef.current = createRound(rect.width, rect.height)
      else resizeRound(roundRef.current, rect.width, rect.height)
      const origin = aimOrigin(rect.width, rect.height)
      setPullHint({ x: origin.x + rect.width * 0.05, y: origin.y })
      paint()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    let frame = 0
    let last = performance.now()
    hudLivesRef.current = roundRef.current?.lives ?? LIVES
    hudTimeRef.current = Math.ceil(roundRef.current?.timeLeft ?? ROUND_SECONDS)
    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      const round = roundRef.current
      if (round && modeRef.current === 'play') {
        const shot = stepRound(round, dt)
        if (shot.missed) playWarn()
        if (shot.bull) playBullseye()
        else if (shot.base > 0) playHit()
        const seconds = Math.ceil(round.timeLeft)
        if (
          round.lives !== hudLivesRef.current ||
          seconds !== hudTimeRef.current ||
          round.shots !== hudShotsRef.current ||
          round.aiming !== hudAimingRef.current ||
          shot.base > 0 ||
          shot.missed
        ) {
          hudLivesRef.current = round.lives
          hudTimeRef.current = seconds
          hudShotsRef.current = round.shots
          hudAimingRef.current = round.aiming
          setHud({
            lives: round.lives,
            score: round.score,
            time: seconds,
            shots: round.shots,
            aiming: round.aiming,
          })
        }
        paint()
        if (shot.ended) finishRef.current(round)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [mode])

  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (modeRef.current !== 'play' || !roundRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointFrom(event)
    if (beginAim(roundRef.current, point.x, point.y)) playDraw()
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!roundRef.current?.aiming) return
    event.preventDefault()
    const point = pointFrom(event)
    moveAim(roundRef.current, point.x, point.y)
    playDraw()
  }

  const onPointerUp = () => {
    if (!roundRef.current) return
    const fired = releaseAim(roundRef.current)
    if (fired === 'shot') playRelease()
  }

  const startRound = () => {
    resumeArcherAudio()
    startArcherBgm()
    const wrap = wrapRef.current
    const rect = wrap?.getBoundingClientRect()
    const w = rect?.width || 390
    const h = rect?.height || 700
    roundRef.current = createRound(w, h)
    rewarded.current = false
    setSummary(null)
    hudLivesRef.current = LIVES
    hudTimeRef.current = ROUND_SECONDS
    hudShotsRef.current = 0
    hudAimingRef.current = false
    setHud({ lives: LIVES, score: 0, time: ROUND_SECONDS, shots: 0, aiming: false })
    const origin = aimOrigin(w, h)
    setPullHint({ x: origin.x + w * 0.05, y: origin.y })
    setMode('play')
  }

  const leave = (go: () => void) => {
    const round = roundRef.current
    if (modeRef.current === 'play' && round && !rewarded.current) finish(round)
    stopArcherBgm()
    go()
  }

  return (
    <section className="game-screen archer-screen">
      <header className="archer-top">
        <div className="archer-nav">
          <HomeButton className="game-home" onClick={() => leave(onExit)} />
          <GamesButton className="game-home game-games" onClick={() => leave(onGames)} />
        </div>
        {mode === 'play' ? (
          <div className="archer-hud">
            <LivesHud lives={hud.lives} />
            <p className="archer-score">
              <span>Score</span>
              <strong>{hud.score}</strong>
            </p>
            <p className={hud.time <= 10 ? 'archer-time urgent' : 'archer-time'}>{formatClock(hud.time)}</p>
          </div>
        ) : (
          <h1>Cupid Archer</h1>
        )}
      </header>
      <div className="archer-stage" ref={wrapRef} style={{ backgroundImage: `url(${backgroundUrl})` }}>
        <canvas
          ref={canvasRef}
          className="archer-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => roundRef.current && cancelAim(roundRef.current)}
        />
        {mode === 'play' && hud.shots === 0 && !hud.aiming ? (
          <div
            className="archer-pull-hint"
            style={{ left: pullHint.x, top: pullHint.y }}
            aria-hidden
          >
            <svg className="archer-pull-arrow" viewBox="0 0 24 48" aria-hidden>
              <path
                d="M12 2v34M5 28l7 12 7-12"
                fill="none"
                stroke="rgba(255, 250, 236, 0.95)"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <img className="archer-pull-paw" src={lionPawUrl} alt="" />
          </div>
        ) : null}
        {mode === 'start' ? (
          <div className="archer-home">
            <div className="archer-home-cub-wrap" aria-hidden>
              <img className="archer-home-cub" src={cubUrl} alt="" />
            </div>
            <div className="archer-panel">
              <h2>Cupid Archer</h2>
              <p>Drag back from the cub, then let go to shoot. 3 Lives - 60 second timer. Hit the bullseye to add time and lives.</p>
              <p className="archer-best">Best Score {bestRef.current}</p>
              <button type="button" className="archer-btn" onClick={startRound}>
                Play
              </button>
            </div>
          </div>
        ) : null}
        {mode === 'over' && summary ? (
          <div className="archer-panel">
            <h2>Game Over</h2>
            {summary.neuBest ? <p className="archer-new">New best</p> : null}
            <p>
              Final score <strong>{summary.score}</strong>
            </p>
            <p>
              Best score <strong>{summary.best}</strong>
            </p>
            <p>
              Bullseyes <strong>{summary.bullseyes}</strong>
            </p>
            <p>
              Accuracy <strong>{summary.accuracy}%</strong>
            </p>
            <p className="archer-xp">+{summary.xp} XP</p>
            <button type="button" className="archer-btn" onClick={startRound}>
              Play again
            </button>
            <button type="button" className="archer-btn archer-btn-ghost" onClick={onGames}>
              Back to games
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}
