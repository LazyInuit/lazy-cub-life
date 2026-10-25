import { useEffect, useRef, useState } from 'react'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import homeCubUrl from '../assets/bubble-blast/home-cub.png'
import lionPawUrl from '../assets/lion-paw-ui.png'
import { playBubbleEvent, resumeBubbleAudio, startBubbleBgm, stopBubbleBgm } from '../game/bubbleBlast/audio'
import {
  BUBBLE_R,
  BUBBLE_XP_PER_SCORE,
  CASH_PER_COIN_BUBBLE,
  COMBO_MULTIPLIERS,
  GUM_SCALE,
  LAUNCH_X,
  LAUNCH_Y,
  MATCH_MIN,
} from '../game/bubbleBlast/config'
import { drawBubbleFrame, drawBubbleIdle, fitField, signNav } from '../game/bubbleBlast/draw'
import {
  beginAim,
  cancelAim,
  createGame,
  megaButtonHit,
  missLimit,
  moveAim,
  releaseAim,
  stepGame,
  takeEvents,
  toggleMega,
} from '../game/bubbleBlast/engine'
import type { BubbleState } from '../game/bubbleBlast/types'
import { PLAY_ENERGY_COST, PLAY_NEED_COST, moodFromScore } from '../game/progress'
import type { NeedKey } from '../game/types'
import { RunEnergy } from './EnergyBar'
import { GamesButton, HomeButton } from './HomeButton'

type Mode = 'start' | 'play' | 'over'

type Props = {
  best: number
  onBest: (score: number) => void
  onDailyStart: () => boolean
  onDaily: (score: number) => void
  onReward: (
    baseXp: number,
    needs: Partial<Record<NeedKey, number>>,
  ) => { xpGained: number }
  onCoins: (amount: number) => void
  onExit: () => void
  onGames: () => void
  energy: number
  onShop: () => void
}

type Summary = {
  score: number
  best: number
  neuBest: boolean
  popped: number
  maxCombo: number
  xp: number
  coins: number
}

/** Time to look at the final board before the results panel opens. */
const OVER_PANEL_MS = 900

type NavPlace = ReturnType<typeof signNav>

/** The paw image's height in CSS pixels, plus a small gap under the gum bubble. */
const HINT_PAW_PX = 46

/** The paw hint shows until the first bubble of a run is fired, and hides while aiming. */
function showsDragHint(game: BubbleState) {
  return game.shots === 0 && game.phase !== 'aiming' && game.phase !== 'over'
}

export function BubbleBlast({ best, onBest, onDailyStart, onDaily, onReward, onCoins, onExit, onGames, energy, onShop }: Props) {
  const [mode, setMode] = useState<Mode>('start')
  const [lowEnergy, setLowEnergy] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [nav, setNav] = useState<NavPlace | null>(null)
  const [hint, setHint] = useState({ x: 0, y: 0 })
  const [dragHint, setDragHint] = useState(false)
  const dragHintRef = useRef(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<BubbleState | null>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const pointerRef = useRef<number | null>(null)
  const overTimer = useRef<number | null>(null)
  const modeRef = useRef(mode)
  const rewarded = useRef(false)
  const bestRef = useRef(best)
  const onBestRef = useRef(onBest)
  const onDailyRef = useRef(onDaily)
  const onRewardRef = useRef(onReward)
  const onCoinsRef = useRef(onCoins)
  modeRef.current = mode
  bestRef.current = Math.max(bestRef.current, best)
  onBestRef.current = onBest
  onDailyRef.current = onDaily
  onRewardRef.current = onReward
  onCoinsRef.current = onCoins

  /** Record the run once: best, daily score and leaderboard, XP, and coins. */
  const finish = (game: BubbleState) => {
    if (rewarded.current) return
    rewarded.current = true
    const score = game.score
    const neuBest = score > bestRef.current
    if (neuBest) {
      bestRef.current = score
      onBestRef.current(score)
    }
    onDailyRef.current(score)
    const result = onRewardRef.current(
      Math.round(score * BUBBLE_XP_PER_SCORE),
      { ...moodFromScore(score), ...PLAY_NEED_COST },
    )
    const coins = game.goldenPopped * CASH_PER_COIN_BUBBLE
    if (coins > 0) onCoinsRef.current(coins)
    setSummary({
      score,
      best: bestRef.current,
      neuBest,
      popped: game.bubblesPopped,
      maxCombo: game.maxCombo,
      xp: result.xpGained,
      coins,
    })
  }
  const finishRef = useRef(finish)
  finishRef.current = finish

  useEffect(
    () => () => {
      stopBubbleBgm()
      if (overTimer.current !== null) window.clearTimeout(overTimer.current)
      const game = gameRef.current
      if (game && modeRef.current === 'play' && !rewarded.current) finishRef.current(game)
    },
    [],
  )

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const place = () => {
      const rect = wrap.getBoundingClientRect()
      setNav(signNav(rect.width, rect.height))
      const view = fitField(rect.width, rect.height)
      // The paw starts just below the gum bubble in the cub's mouth, then drags up.
      const bubbleBottom = view.y + (LAUNCH_Y + BUBBLE_R * GUM_SCALE) * view.scale
      setHint({ x: view.x + LAUNCH_X * view.scale, y: bubbleBottom + HINT_PAW_PX })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (mode !== 'start') return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    let frame = 0
    const tick = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.floor(rect.width * dpr))
      const h = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawBubbleIdle(ctx, rect.width, rect.height)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [mode])

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
      sizeRef.current = { width: rect.width, height: rect.height }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const onHidden = () => {
      if (document.visibilityState === 'hidden' && gameRef.current) {
        cancelAim(gameRef.current)
        pointerRef.current = null
      }
    }
    document.addEventListener('visibilitychange', onHidden)

    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      const game = gameRef.current
      // A hidden app is paused: nothing moves, and the first frame back uses a tiny step.
      if (game && document.visibilityState !== 'hidden') {
        stepGame(game, dt)
        for (const event of takeEvents(game)) playBubbleEvent(event)
        const hintNow = showsDragHint(game)
        if (hintNow !== dragHintRef.current) {
          dragHintRef.current = hintNow
          setDragHint(hintNow)
        }
        if (game.phase === 'over' && !rewarded.current) {
          finishRef.current(game)
          overTimer.current = window.setTimeout(() => {
            overTimer.current = null
            setMode('over')
          }, OVER_PANEL_MS)
        }
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const dpr = canvas.width / Math.max(1, sizeRef.current.width)
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          drawBubbleFrame(ctx, game, sizeRef.current.width, sizeRef.current.height, now / 1000)
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [mode])

  const fieldPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const view = fitField(rect.width, rect.height)
    return { x: (event.clientX - rect.left - view.x) / view.scale, y: (event.clientY - rect.top - view.y) / view.scale }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const game = gameRef.current
    if (modeRef.current !== 'play' || !game || pointerRef.current !== null) return
    event.preventDefault()
    resumeBubbleAudio()
    const point = fieldPoint(event)
    if (megaButtonHit(point.x, point.y)) {
      toggleMega(game)
      return
    }
    if (!beginAim(game, point.x, point.y)) return
    pointerRef.current = event.pointerId
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Capture is only a convenience; moves over the canvas still steer the aim.
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const game = gameRef.current
    if (!game || event.pointerId !== pointerRef.current) return
    event.preventDefault()
    const point = fieldPoint(event)
    moveAim(game, point.x, point.y)
  }

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const game = gameRef.current
    if (!game || event.pointerId !== pointerRef.current) return
    pointerRef.current = null
    releaseAim(game)
  }

  const onPointerCancel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerId !== pointerRef.current) return
    pointerRef.current = null
    if (gameRef.current) cancelAim(gameRef.current)
  }

  const startRun = () => {
    if (!onDailyStart()) {
      setLowEnergy(true)
      return
    }
    setLowEnergy(false)
    resumeBubbleAudio()
    startBubbleBgm()
    if (overTimer.current !== null) window.clearTimeout(overTimer.current)
    overTimer.current = null
    const game = createGame()
    gameRef.current = game
    rewarded.current = false
    pointerRef.current = null
    dragHintRef.current = showsDragHint(game)
    setDragHint(dragHintRef.current)
    setShowRules(false)
    setSummary(null)
    setMode('play')
  }

  const leave = (go: () => void) => {
    stopBubbleBgm()
    const game = gameRef.current
    if (modeRef.current === 'play' && game && !rewarded.current) {
      finish(game)
      setMode('over')
      return
    }
    go()
  }

  return (
    <section className="game-screen bubble-screen">
      <div className="bubble-stage" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="bubble-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onContextMenu={(event) => event.preventDefault()}
        />
        <div
          className="bubble-nav"
          style={nav ? { left: nav.left, top: nav.top, transform: `scale(${nav.scale})` } : { visibility: 'hidden' }}
        >
          <HomeButton className="game-home" onClick={() => leave(onExit)} />
          <GamesButton className="game-home game-games" onClick={() => leave(onGames)} />
        </div>
        {mode === 'play' && dragHint ? (
          <div className="bubble-drag-hint" style={{ left: hint.x, top: hint.y }} aria-hidden>
            <svg className="bubble-drag-arrow" viewBox="0 0 24 120" aria-hidden>
              <path
                d="M12 108V14M4 24l8-10 8 10"
                fill="none"
                stroke="rgba(255, 250, 236, 0.95)"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <img className="bubble-drag-paw" src={lionPawUrl} alt="" />
          </div>
        ) : null}
        {mode === 'start' ? (
          <div className="bubble-home">
            <img className="bubble-home-cub" src={homeCubUrl} alt="" aria-hidden />
            {!showRules ? (
              <div className="bubble-panel">
                <h2>Bubble Blast</h2>
                <p className="bubble-best">Best Score {bestRef.current.toLocaleString('en-US')}</p>
                {lowEnergy ? <p className="energy-note">Sleep or visit the shop to recover energy.</p> : null}
                <button type="button" className="bubble-btn" onClick={startRun}>
                  Play
                </button>
                <button type="button" className="bubble-btn" onClick={() => setShowRules(true)}>
                  Rules
                </button>
              </div>
            ) : (
              <div className="bubble-panel">
                <h2>Rules</h2>
                <ul className="bubble-rules">
                  <li>
                    <strong>Aim:</strong> hold anywhere and drag to aim, then let go to blow a bubble.
                  </li>
                  <li>
                    <strong>Pop:</strong> match {MATCH_MIN} or more of the same colour to pop them. Bubbles left hanging drop
                    for extra points.
                  </li>
                  <li>
                    <strong>Combo:</strong> pop bubbles on shots in a row to raise the multiplier, up to ×
                    {COMBO_MULTIPLIERS[COMBO_MULTIPLIERS.length - 1]}.
                  </li>
                  <li>
                    <strong>Cub Cash:</strong> pop or drop a coin bubble for {CASH_PER_COIN_BUBBLE} Cub Cash.
                  </li>
                  <li>
                    <strong>Mega:</strong> popping bubbles fills the Mega meter. When it is full, tap Mega to blow a Mega
                    Bubble that clears a wide area.
                  </li>
                  <li>
                    <strong>Ceiling:</strong> every {missLimit()} misses in a row, the ceiling drops a row.
                  </li>
                  <li>
                    <strong>Game over:</strong> keep the bubbles above the red line!
                  </li>
                </ul>
                <button type="button" className="bubble-btn" onClick={() => setShowRules(false)}>
                  Back
                </button>
              </div>
            )}
          </div>
        ) : null}
        {mode === 'over' && summary ? (
          <div className="bubble-panel">
            <h2>Game Over</h2>
            {summary.neuBest ? <p className="bubble-new">New best!</p> : null}
            <p>
              Final score <strong>{summary.score.toLocaleString('en-US')}</strong>
            </p>
            <p>
              Best score <strong>{summary.best.toLocaleString('en-US')}</strong>
            </p>
            <p>
              Bubbles popped <strong>{summary.popped}</strong>
            </p>
            <p>
              Largest combo <strong>{summary.maxCombo}</strong>
            </p>
            <p className="bubble-xp">+{summary.xp} XP</p>
            <p className="bubble-coins">
              <img src={coinUrl} alt="" />+{summary.coins}
            </p>
            <RunEnergy energy={energy} onShop={onShop} />
            <button type="button" className="bubble-btn" onClick={startRun} disabled={energy < PLAY_ENERGY_COST}>
              Play again
            </button>
            <button type="button" className="bubble-btn bubble-btn-ghost" onClick={onGames}>
              Return to games
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}
