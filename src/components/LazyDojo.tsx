import { useEffect, useRef, useState } from 'react'
import { PLAY_NEED_COST, moodFromScore } from '../game/progress'
import { DOJO_ASSETS, loadDojoSprites, type DojoSprites } from '../game/lazyDojo/assets'
import { XP_PER_SCORE } from '../game/lazyDojo/config'
import {
  applySwipeSegment,
  beginSwipe,
  createEngine,
  endSwipe,
  resizeEngine,
  stepEngine,
} from '../game/lazyDojo/engine'
import { drawDojoFrame } from '../game/lazyDojo/draw'
import { playBomb, playCombo, playMiss, playSlash, playSwipe, playUi, resumeDojoAudio, startDojoBgm, stopDojoBgm } from '../game/lazyDojo/audio'
import type { EngineState } from '../game/lazyDojo/types'
import type { NeedKey } from '../game/types'
import { GamesButton, HomeButton } from './HomeButton'

type Mode = 'start' | 'howto' | 'play' | 'pause' | 'over'

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

export function LazyDojo({ best, onBest, onReward, onExit, onGames }: Props) {
  const [mode, setMode] = useState<Mode>('start')
  const [hudScore, setHudScore] = useState(0)
  const [hudLives, setHudLives] = useState(3)
  const [summary, setSummary] = useState<{ score: number; best: number; neuBest: boolean; xp: number } | null>(
    null,
  )
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<EngineState | null>(null)
  const bgRef = useRef<HTMLImageElement | null>(null)
  const spritesRef = useRef<DojoSprites | null>(null)
  const pointerRef = useRef<{ x: number; y: number; down: boolean }>({ x: 0, y: 0, down: false })
  const swipeSoundAt = useRef(0)
  const hudScoreRef = useRef(0)
  const hudLivesRef = useRef(3)
  const rewarded = useRef(false)
  const bestRef = useRef(best)
  const onBestRef = useRef(onBest)
  const onRewardRef = useRef(onReward)
  const modeRef = useRef(mode)
  modeRef.current = mode
  bestRef.current = Math.max(bestRef.current, best)
  onBestRef.current = onBest
  onRewardRef.current = onReward

  useEffect(() => {
    const img = new Image()
    img.src = DOJO_ASSETS.backgrounds.dojo
    bgRef.current = img
    let cancelled = false
    loadDojoSprites().then((pack) => {
      if (!cancelled) spritesRef.current = pack
    })
    return () => {
      cancelled = true
    }
  }, [])

  const finishRun = (engine: EngineState) => {
    if (rewarded.current) return
    rewarded.current = true
    stopDojoBgm()
    const score = engine.score
    const neuBest = score > bestRef.current
    if (neuBest) {
      bestRef.current = score
      onBestRef.current(score)
    }
    const result = onRewardRef.current(
      Math.round(score * XP_PER_SCORE),
      {
        ...moodFromScore(score),
        ...PLAY_NEED_COST,
      },
      { flat: true },
    )
    setSummary({ score, best: bestRef.current, neuBest, xp: result.xpGained })
    setMode('over')
  }

  const finishRunRef = useRef(finishRun)
  finishRunRef.current = finishRun

  useEffect(() => {
    if (mode !== 'play' && mode !== 'pause') return
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
      if (!engineRef.current) engineRef.current = createEngine(rect.width, rect.height)
      else resizeEngine(engineRef.current, rect.width, rect.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    let frame = 0
    let last = performance.now()
    let cancelled = false
    let prevLives = engineRef.current?.lives ?? 3

    const paint = (now: number) => {
      if (cancelled) return
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      const engine = engineRef.current
      const ctx = canvas.getContext('2d')
      if (engine && ctx) {
        if (modeRef.current === 'play') {
          stepEngine(engine, dt)
          if (engine.lives < prevLives) playMiss()
          prevLives = engine.lives
          if (engine.phase === 'ended') finishRunRef.current(engine)
        }
        drawDojoFrame(ctx, engine, bgRef.current, spritesRef.current)
        if (engine.score !== hudScoreRef.current) {
          hudScoreRef.current = engine.score
          setHudScore(engine.score)
        }
        if (engine.lives !== hudLivesRef.current) {
          hudLivesRef.current = engine.lives
          setHudLives(engine.lives)
        }
      }
      frame = requestAnimationFrame(paint)
    }
    frame = requestAnimationFrame(paint)

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [mode])

  const toLocal = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'play') return
    resumeDojoAudio()
    event.currentTarget.setPointerCapture(event.pointerId)
    const p = toLocal(event.clientX, event.clientY)
    pointerRef.current = { ...p, down: true }
    const engine = engineRef.current
    if (engine) beginSwipe(engine)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'play' || !pointerRef.current.down) return
    const engine = engineRef.current
    if (!engine) return
    const next = toLocal(event.clientX, event.clientY)
    const prev = pointerRef.current
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const dist = Math.hypot(dx, dy)
    if (dist > 18) {
      const now = performance.now()
      if (now - swipeSoundAt.current > 90) {
        swipeSoundAt.current = now
        playSwipe()
      }
    }
    const result = applySwipeSegment(engine, prev.x, prev.y, next.x, next.y)
    if (result.bomb) {
      playBomb()
    } else if (result.sliced > 0) {
      playSlash()
    }
    pointerRef.current = { ...next, down: true }
  }

  const onPointerUp = () => {
    if (!pointerRef.current.down) return
    pointerRef.current.down = false
    const engine = engineRef.current
    if (!engine) return
    const result = endSwipe(engine)
    if (result.combo) playCombo()
  }

  const startTraining = () => {
    playUi()
    rewarded.current = false
    setSummary(null)
    setHudScore(0)
    setHudLives(3)
    const wrap = wrapRef.current
    const w = wrap?.clientWidth || 390
    const h = wrap?.clientHeight || 700
    engineRef.current = createEngine(w, h)
    startDojoBgm()
    setMode('play')
  }

  useEffect(() => () => stopDojoBgm(), [])

  const leaveToGames = () => {
    if (mode === 'play' && engineRef.current && !rewarded.current) {
      finishRun(engineRef.current)
    }
    onGames()
  }

  return (
    <section className="game-screen dojo-screen">
      <header className="dojo-top">
        <div className="dojo-nav">
          <HomeButton
            className="game-home"
            onClick={() => {
              if (mode === 'play' && engineRef.current && !rewarded.current) finishRun(engineRef.current)
              onExit()
            }}
          />
          <GamesButton className="game-home game-games" onClick={leaveToGames} />
        </div>
        {mode === 'play' || mode === 'pause' ? (
          <div className="dojo-hud">
            <div className="dojo-lives" aria-label={`${hudLives} lives`}>
              {Array.from({ length: 3 }, (_, i) => (
                <span key={i} className={`dojo-life${i < hudLives ? ' on' : ''}`} aria-hidden>
                  <svg className="dojo-heart" viewBox="0 0 32 30" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id={`dojoHeartFill${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#ff6b6b" />
                        <stop offset="45%" stopColor="#e03131" />
                        <stop offset="100%" stopColor="#c92a2a" />
                      </linearGradient>
                      <linearGradient id={`dojoHeartGold${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fff3bf" />
                        <stop offset="40%" stopColor="#ffd43b" />
                        <stop offset="100%" stopColor="#e67700" />
                      </linearGradient>
                    </defs>
                    <path
                      className="dojo-heart-body"
                      d="M16 27.2C16 27.2 3.2 19.4 3.2 10.6 3.2 6.4 6.4 3.5 10.2 3.5c2.4 0 4.5 1.2 5.8 3.1C17.3 4.7 19.4 3.5 21.8 3.5c3.8 0 7 2.9 7 7.1 0 8.8-12.8 16.6-12.8 16.6z"
                      fill={`url(#dojoHeartFill${i})`}
                      stroke={`url(#dojoHeartGold${i})`}
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
            <p className="dojo-score">
              <span>Score</span>
              <strong>{hudScore}</strong>
            </p>
            <a
              className="dojo-hud-logo-link"
              href="https://x.com/lazyninjacubs"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Lazy Ninja Cubs on X"
            >
              <img className="dojo-hud-logo" src={DOJO_ASSETS.ui.ninjaCubsLogo} alt="" />
            </a>
          </div>
        ) : (
          <div className="dojo-hud dojo-hud-menu">
            <h1>Ninja Cub Dojo</h1>
            {mode === 'start' || mode === 'over' ? (
              <a
                className="dojo-hud-logo-link"
                href="https://x.com/lazyninjacubs"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Lazy Ninja Cubs on X"
              >
                <img className="dojo-hud-logo" src={DOJO_ASSETS.ui.ninjaCubsLogo} alt="" />
              </a>
            ) : (
              <span className="dojo-hud-logo-spacer" aria-hidden />
            )}
          </div>
        )}
      </header>

      <div
        className="dojo-stage"
        ref={wrapRef}
        style={{ backgroundImage: `url(${DOJO_ASSETS.backgrounds.dojo})` }}
      >
        <canvas
          ref={canvasRef}
          className="dojo-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        {mode === 'start' ? (
          <div className="dojo-panel dojo-start">
            <img className="dojo-hero" src={DOJO_ASSETS.ui.ninjaCubCover} alt="" />
            <h2>NINJA CUB DOJO</h2>
            <p className="dojo-sub">Train your Cub. Master the blade.</p>
            <p className="dojo-best">Best Score {bestRef.current}</p>
            <button type="button" className="dojo-btn" onClick={startTraining}>
              START TRAINING
            </button>
            <button
              type="button"
              className="dojo-btn dojo-btn-ghost"
              onClick={() => {
                playUi()
                setMode('howto')
              }}
            >
              HOW TO PLAY
            </button>
          </div>
        ) : null}

        {mode === 'howto' ? (
          <div className="dojo-panel dojo-howto">
            <h2>HOW TO PLAY</h2>
            <ul>
              <li>
                <span className="dojo-howto-icons" aria-hidden="true">
                  <img src={DOJO_ASSETS.fruit.strawberry} alt="" />
                </span>
                <div className="dojo-howto-copy">
                  <strong>SLICE THE FRUIT</strong>
                  <span>Swipe across fruit to score points.</span>
                </div>
              </li>
              <li>
                <span className="dojo-howto-icons" aria-hidden="true">
                  <img src={DOJO_ASSETS.fruit.orange} alt="" />
                </span>
                <div className="dojo-howto-copy">
                  <strong>BUILD COMBOS</strong>
                  <span>Slice multiple fruit in one swipe for bonus points.</span>
                </div>
              </li>
              <li>
                <span className="dojo-howto-icons" aria-hidden="true">
                  <img src={DOJO_ASSETS.fruit.watermelon} alt="" />
                </span>
                <div className="dojo-howto-copy">
                  <strong>DON'T MISS</strong>
                  <span>Miss three fruit and your training is over.</span>
                </div>
              </li>
              <li>
                <span className="dojo-howto-icons" aria-hidden="true">
                  <img src={DOJO_ASSETS.hazards.bomb} alt="" />
                </span>
                <div className="dojo-howto-copy">
                  <strong>AVOID BOMBS</strong>
                  <span>Slice a bomb and you lose one life.</span>
                </div>
              </li>
              <li>
                <span className="dojo-howto-icons" aria-hidden="true">
                  <img src={DOJO_ASSETS.bonuses.golden} alt="" />
                </span>
                <div className="dojo-howto-copy">
                  <strong>GOLDEN FRUIT</strong>
                  <span>Slice a golden fruit to restore one life.</span>
                </div>
              </li>
            </ul>
            <button
              type="button"
              className="dojo-btn"
              onClick={() => {
                playUi()
                setMode('start')
              }}
            >
              BACK
            </button>
          </div>
        ) : null}

        {mode === 'pause' ? (
          <div className="dojo-panel dojo-pause">
            <h2>PAUSED</h2>
            <button type="button" className="dojo-btn" onClick={() => setMode('play')}>
              RESUME
            </button>
            <button
              type="button"
              className="dojo-btn dojo-btn-ghost"
              onClick={() => {
                playUi()
                startTraining()
              }}
            >
              RESTART
            </button>
            <button
              type="button"
              className="dojo-btn dojo-btn-ghost"
              onClick={() => {
                playUi()
                stopDojoBgm()
                if (engineRef.current && !rewarded.current) finishRun(engineRef.current)
                else setMode('start')
              }}
            >
              QUIT
            </button>
          </div>
        ) : null}

        {mode === 'over' && summary ? (
          <div className="dojo-panel dojo-over">
            <h2>TRAINING COMPLETE</h2>
            {summary.neuBest ? <p className="dojo-new-best">NEW BEST!</p> : null}
            <p className="dojo-over-score">
              Score <strong>{summary.score}</strong>
            </p>
            <p className="dojo-over-best">
              Best <strong>{summary.best}</strong>
            </p>
            <p className="dojo-over-xp">+{summary.xp} XP</p>
            <button type="button" className="dojo-btn" onClick={startTraining}>
              TRAIN AGAIN
            </button>
            <button
              type="button"
              className="dojo-btn dojo-btn-ghost"
              onClick={() => {
                playUi()
                setMode('start')
              }}
            >
              BACK TO DOJO
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}
