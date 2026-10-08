import { useEffect, useRef, useState } from 'react'
import lionPawUrl from '../assets/lion-paw-ui.png'
import homeCubUrl from '../assets/lazy-hoops/home-cub.png'
import homeCubRightUrl from '../assets/lazy-hoops/home-cub-right.png'
import {
  HOOPS_XP_BASKET,
  HOOPS_XP_PERFECT,
  LIVES,
  MATCH_SECONDS,
  MIN_SWIPE_PX,
  MOVE_SECONDS,
  NORMAL_POINTS,
  PERFECT_POINTS,
  PERFECT_TIME,
  SPOTS,
  cameraForSpot,
  easeInOut,
  holdPoint,
  lookTarget,
  pickSpot,
} from '../game/lazyHoops/config'
import {
  playHoopsBoard,
  playHoopsNet,
  playHoopsPerfect,
  playHoopsRim,
  playHoopsSwipe,
  resumeHoopsAudio,
  startHoopsBgm,
  stopHoopsBgm,
} from '../game/lazyHoops/audio'
import { createCourt, type Court } from '../game/lazyHoops/court'
import {
  createShot,
  launchVelocity,
  stepShot,
  type Shot,
  type Swipe,
  type Vec3,
} from '../game/lazyHoops/sim'
import { PLAY_NEED_COST, moodFromScore } from '../game/progress'
import type { NeedKey } from '../game/types'
import { GamesButton, HomeButton } from './HomeButton'

type Mode = 'home' | 'play' | 'over'
type Phase = 'ready' | 'flight' | 'move'

type Live = {
  phase: Phase
  playing: boolean
  paused: boolean
  over: boolean
  score: number
  lives: number
  timeLeft: number
  clock: number
  /** False until the first swipe so the clock waits on the tip-off. */
  timerOn: boolean
  timePulse: number
  baskets: number
  perfects: number
  /** Made baskets in a row. A miss clears it. */
  streak: number
  hint: boolean
  pop: number
  toastKey: number
  toast: 'ten' | 'perfect' | 'life' | 'hot' | null
  toastPoints: number
  toastLife: boolean
  toastUntil: number
  spotId: string
  cam: Vec3
  camFrom: Vec3
  camTo: Vec3
  moveT: number
  moveSeconds: number
  shot: Shot
  viewW: number
  viewH: number
  flash: number
}

type Hud = {
  score: number
  lives: number
  time: number
  timePulse: number
  hint: boolean
  pop: number
  toastKey: number
  toast: Live['toast']
  toastPoints: number
  toastLife: boolean
  paused: boolean
}

type Summary = {
  score: number
  best: number
  neuBest: boolean
  baskets: number
  perfects: number
  xp: number
}

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

type Drag = {
  id: number
  x0: number
  y0: number
  x: number
  y: number
  t0: number
  samples: { x: number; y: number; t: number }[]
}

const CLOSE = SPOTS[0]
const STREAK_BONUS = 100
const MAKE_MOVE_SECONDS = MOVE_SECONDS * 0.5

/** Optional `?spot=far-left` for reviewing stadium from shot angles. */
function reviewSpot() {
  if (typeof window === 'undefined') return null
  const id = new URLSearchParams(window.location.search).get('spot')
  if (!id) return null
  return SPOTS.find((s) => s.id === id) ?? null
}

function createMatch(): Live {
  const start = reviewSpot() ?? CLOSE
  const cam = cameraForSpot(start)
  return {
    phase: 'ready',
    playing: true,
    paused: false,
    over: false,
    score: 0,
    lives: LIVES,
    timeLeft: MATCH_SECONDS,
    clock: MATCH_SECONDS,
    timerOn: false,
    timePulse: 0,
    baskets: 0,
    perfects: 0,
    streak: 0,
    hint: true,
    pop: -1,
    toastKey: 0,
    toast: null,
    toastPoints: 0,
    toastLife: false,
    toastUntil: 0,
    spotId: start.id,
    cam,
    camFrom: cam,
    camTo: cam,
    moveT: 0,
    moveSeconds: MOVE_SECONDS,
    shot: createShot(holdPoint(cam)),
    viewW: 390,
    viewH: 700,
    flash: 0,
  }
}

function hudFrom(live: Live): Hud {
  return {
    score: live.score,
    lives: live.lives,
    time: live.clock,
    timePulse: live.timePulse,
    hint: live.hint,
    pop: live.pop,
    toastKey: live.toastKey,
    toast: live.toast,
    toastPoints: live.toastPoints,
    toastLife: live.toastLife,
    paused: live.paused,
  }
}

export function LazyHoops({ best, onBest, onReward, onExit, onGames }: Props) {
  const [mode, setMode] = useState<Mode>('home')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [shootHint, setShootHint] = useState({ x: 0, y: 0 })
  const [hud, setHud] = useState<Hud>(() => hudFrom(createMatch()))
  const [summary, setSummary] = useState<Summary | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<Live>(null as unknown as Live)
  if (!liveRef.current) {
    const opening = createMatch()
    opening.playing = false
    liveRef.current = opening
  }
  const courtRef = useRef<Court | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const rewarded = useRef(false)
  const bestRef = useRef(best)
  const onBestRef = useRef(onBest)
  const onRewardRef = useRef(onReward)
  const modeRef = useRef(mode)
  const startRef = useRef<() => void>(() => {})
  bestRef.current = Math.max(bestRef.current, best)
  onBestRef.current = onBest
  onRewardRef.current = onReward
  modeRef.current = mode

  const publish = (live: Live) => {
    setHud((prev) => {
      const next = hudFrom(live)
      if (
        prev.score === next.score &&
        prev.lives === next.lives &&
        prev.time === next.time &&
        prev.timePulse === next.timePulse &&
        prev.hint === next.hint &&
        prev.pop === next.pop &&
        prev.toastKey === next.toastKey &&
        prev.toast === next.toast &&
        prev.toastPoints === next.toastPoints &&
        prev.toastLife === next.toastLife &&
        prev.paused === next.paused
      ) {
        return prev
      }
      return next
    })
  }

  const endGame = (live: Live) => {
    if (rewarded.current) return
    rewarded.current = true
    live.over = true
    live.paused = false
    stopHoopsBgm()
    const score = live.score
    const neuBest = score > bestRef.current
    if (neuBest) {
      bestRef.current = score
      onBestRef.current(score)
    }
    const regulars = Math.max(0, live.baskets - live.perfects)
    const result = onRewardRef.current(
      regulars * HOOPS_XP_BASKET + live.perfects * HOOPS_XP_PERFECT,
      { ...moodFromScore(score), ...PLAY_NEED_COST },
      { flat: true },
    )
    setSummary({
      score,
      best: bestRef.current,
      neuBest,
      baskets: live.baskets,
      perfects: live.perfects,
      xp: result.xpGained,
    })
    setMode('over')
    publish(live)
  }
  const endRef = useRef(endGame)
  endRef.current = endGame

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const court = createCourt(canvas)
    courtRef.current = court
    const live = liveRef.current

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      live.viewW = width
      live.viewH = height
      court.resize(width, height)
      if (live.playing) court.setCamera(live.cam)
      else {
        const review = reviewSpot()
        if (review) {
          const pos = cameraForSpot(review)
          court.setCamera(pos, lookTarget(pos))
          const homeHold = holdPoint(pos)
          live.shot = createShot(homeHold)
        } else {
          // Home framing: keep ball in view, slight stadium context behind hoop
          court.setCamera({ x: 0, y: 1.95, z: 7.4 }, { x: 0, y: 2.45, z: -0.2 })
          const homeHold = holdPoint({ x: 0, y: 1.95, z: 7.4 })
          live.shot = createShot(homeHold)
        }
        court.setBall(live.shot, { x: 0, y: 0, z: 0 }, false)
      }
      court.render()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(wrap)

    const placeBall = () => {
      if (live.phase === 'ready') live.shot = createShot(holdPoint(live.cam))
    }

    const syncScene = () => {
      court.setCamera(live.cam)
      const moving = live.phase === 'move'
      const vel = { x: live.shot.vx, y: live.shot.vy, z: live.shot.vz }
      court.setBall(live.shot, vel, !moving)
    }

    const beginMove = (seconds: number) => {
      const next = pickSpot(live.score, live.spotId)
      live.spotId = next.id
      live.camFrom = { ...live.cam }
      live.camTo = cameraForSpot(next)
      live.moveT = 0
      live.moveSeconds = seconds
      live.phase = 'move'
    }

    const update = (dt: number) => {
      if (live.phase === 'ready') {
        placeBall()
        if (live.hint && live.viewW > 0) {
          const at = court.project(live.shot, live.viewW, live.viewH)
          setShootHint((prev) =>
            Math.hypot(prev.x - at.x, prev.y - at.y) > 1.5 ? { x: at.x, y: at.y } : prev,
          )
        }
        if (live.toast && performance.now() > live.toastUntil) {
          live.toast = null
          publish(live)
        }
        return
      }
      if (live.phase === 'flight') {
        const tick = stepShot(live.shot, dt)
        if (tick.board) playHoopsBoard()
        if (tick.rim) playHoopsRim()
        if (tick.made) {
          if (tick.made === 'perfect') playHoopsPerfect()
          else playHoopsNet()
          live.streak += 1
          const hot = live.streak >= 3
          const bonus = hot ? STREAK_BONUS : 0
          const awarded = (tick.made === 'perfect' ? PERFECT_POINTS : NORMAL_POINTS) + bonus
          live.toastPoints = awarded
          live.toastLife = false
          live.toastKey += 1
          if (tick.made === 'perfect') {
            live.score += awarded
            live.timeLeft += PERFECT_TIME
            live.clock = Math.ceil(live.timeLeft)
            live.timePulse += 1
            live.baskets += 1
            live.perfects += 1
            if (live.lives < LIVES) {
              live.lives += 1
              live.pop = live.lives - 1
              live.toastLife = true
              live.toast = hot ? 'hot' : 'life'
            } else {
              live.toast = hot ? 'hot' : 'perfect'
            }
            court.setFlash('perfect')
          } else {
            live.score += awarded
            live.baskets += 1
            live.toast = hot ? 'hot' : 'ten'
            court.setFlash('normal')
          }
          court.setHeat(live.streak >= 2)
          live.flash = 28
          live.toastUntil = performance.now() + 1100
          publish(live)
        }
        if (live.toast && performance.now() > live.toastUntil) {
          live.toast = null
          publish(live)
        }
        if (tick.finished) {
          if (!live.shot.scored) {
            live.lives = Math.max(0, live.lives - 1)
            live.streak = 0
            court.setHeat(false)
            publish(live)
          }
          if (live.lives <= 0) {
            endRef.current(live)
            return
          }
          beginMove(live.shot.scored ? MAKE_MOVE_SECONDS : MOVE_SECONDS)
        }
        return
      }
      live.moveT += dt
      const u = Math.min(1, live.moveT / live.moveSeconds)
      const e = easeInOut(u)
      live.cam = {
        x: live.camFrom.x + (live.camTo.x - live.camFrom.x) * e,
        y: live.camFrom.y + (live.camTo.y - live.camFrom.y) * e,
        z: live.camFrom.z + (live.camTo.z - live.camFrom.z) * e,
      }
      if (live.toast && performance.now() > live.toastUntil) {
        live.toast = null
        publish(live)
      }
      if (u >= 1) {
        live.cam = { ...live.camTo }
        live.phase = 'ready'
        live.pop = -1
        placeBall()
        publish(live)
      }
    }

    let raf = 0
    let running = false
    let last = 0
    const frame = (now: number) => {
      if (!running) return
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      if (live.paused || live.over) {
        running = false
        cancelAnimationFrame(raf)
        return
      }
      update(dt)
      if (!live.over && live.timerOn) {
        live.timeLeft -= dt
        if (live.timeLeft <= 0) {
          live.timeLeft = 0
          live.clock = 0
          endRef.current(live)
        } else {
          const shown = Math.ceil(live.timeLeft)
          if (shown !== live.clock) {
            live.clock = shown
            publish(live)
          }
        }
      }
      syncScene()
      court.render()
      if (live.paused || live.over) {
        running = false
        cancelAnimationFrame(raf)
      }
    }
    const start = () => {
      if (running || live.over || live.paused) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    startRef.current = start

    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    const onDown = (event: PointerEvent) => {
      if (!live.playing || live.phase !== 'ready' || live.paused || live.over) return
      resumeHoopsAudio()
      const at = point(event)
      const ball = court.project(live.shot, live.viewW, live.viewH)
      const reach = Math.max(108, Math.min(live.viewW, live.viewH) * 0.22)
      if (Math.hypot(at.x - ball.x, at.y - ball.y) > reach) return
      event.preventDefault()
      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {
        // A lost pointer should still allow the swipe to finish.
      }
      dragRef.current = {
        id: event.pointerId,
        x0: at.x,
        y0: at.y,
        x: at.x,
        y: at.y,
        t0: event.timeStamp,
        samples: [{ x: at.x, y: at.y, t: event.timeStamp }],
      }
    }

    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.id !== event.pointerId) return
      event.preventDefault()
      const at = point(event)
      drag.x = at.x
      drag.y = at.y
      drag.samples.push({ x: at.x, y: at.y, t: event.timeStamp })
      if (drag.samples.length > 6) drag.samples.shift()
    }

    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.id !== event.pointerId) return
      dragRef.current = null
      if (live.phase !== 'ready' || live.paused || live.over) return
      const at = point(event)
      drag.x = at.x
      drag.y = at.y
      const swipe = swipeFrom(drag)
      if (!swipe) return
      const vel = launchVelocity(live.shot, swipe, live.score)
      live.shot.vx = vel.x
      live.shot.vy = vel.y
      live.shot.vz = vel.z
      live.phase = 'flight'
      live.timerOn = true
      playHoopsSwipe()
      live.hint = false
      live.toast = null
      publish(live)
    }

    const blockScroll = (event: TouchEvent) => event.preventDefault()
    canvas.addEventListener('pointerdown', onDown, { passive: false })
    canvas.addEventListener('pointermove', onMove, { passive: false })
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    wrap.addEventListener('touchmove', blockScroll, { passive: false })
    syncScene()
    court.render()

    return () => {
      running = false
      cancelAnimationFrame(raf)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      wrap.removeEventListener('touchmove', blockScroll)
      court.dispose()
      courtRef.current = null
      startRef.current = () => {}
    }
  }, [])

  useEffect(() => () => stopHoopsBgm(), [])

  const playAgain = () => {
    const court = courtRef.current
    const live = liveRef.current
    const width = live.viewW
    const height = live.viewH
    rewarded.current = false
    Object.assign(live, createMatch())
    live.viewW = width
    live.viewH = height
    setSummary(null)
    setMode('play')
    publish(live)
    if (court) {
      court.setCamera(live.cam)
      court.setFlash(null)
      court.setHeat(false)
      court.setBall(live.shot, { x: 0, y: 0, z: 0 }, true)
      court.render()
    }
    startHoopsBgm()
    startRef.current()
  }

  const leave = (go: () => void) => {
    const live = liveRef.current
    if (modeRef.current === 'play' && live && !rewarded.current) endRef.current(live)
    stopHoopsBgm()
    go()
  }

  const shownBest = Math.max(bestRef.current, hud.score)

  return (
    <section className="game-screen hoops-screen">
      <header className="hoops-top">
        <div className="hoops-nav">
          <HomeButton className="game-home" onClick={() => leave(onExit)} />
          <GamesButton className="game-home game-games" onClick={() => leave(onGames)} />
        </div>
        {mode === 'home' ? (
          <h1>Lazy Hoops</h1>
        ) : (
          <div className="hoops-hud">
            <p className="hoops-stat">
              <span>Score</span>
              <strong>{hud.score}</strong>
            </p>
            <p className={`hoops-stat hoops-time${hud.time <= 10 ? ' low' : ''}`}>
              <span>Time</span>
              <strong key={hud.timePulse}>{formatClock(hud.time)}</strong>
            </p>
            <p className="hoops-stat">
              <span>Best Score</span>
              <strong>{shownBest}</strong>
            </p>
            <LivesHud lives={hud.lives} pop={hud.pop} />
          </div>
        )}
      </header>
      <div className="hoops-stage" ref={wrapRef}>
        <canvas ref={canvasRef} className="hoops-canvas" />
        {mode === 'home' && !rulesOpen ? (
          <div className="hoops-panel hoops-home">
            <img className="hoops-home-cub hoops-home-cub-left" src={homeCubUrl} alt="" />
            <img className="hoops-home-cub hoops-home-cub-right" src={homeCubRightUrl} alt="" />
            <p className="hoops-lead">Ready to shoot some hoops? You have 60 seconds. Swipe up on the ball and aim for the basket!</p>
            <p className="hoops-best">Best Score {bestRef.current}</p>
            <button type="button" className="hoops-btn" onClick={playAgain}>
              Play
            </button>
            <button type="button" className="hoops-btn hoops-btn-ghost" onClick={() => setRulesOpen(true)}>
              How to Play
            </button>
          </div>
        ) : null}
        {mode === 'home' && rulesOpen ? (
          <div className="hoops-panel hoops-home">
            <h2>How to Play</h2>
            <div className="hoops-rules-scroll">
              <ul className="hoops-rules">
                <li>
                  <strong>Score Points:</strong> Every basket earns you 100 points.
                </li>
                <li>
                  <strong>60 Seconds:</strong> The game ends when the clock hits zero.
                </li>
                <li>
                  <strong>Perfect Shot:</strong> Score a clean swish without touching the rim or backboard for 300 points and 5 extra seconds!
                </li>
                <li>
                  <strong>3 Lives:</strong> You start with 3 lives. Every missed shot costs you one.
                </li>
                <li>
                  <strong>Extra Life:</strong> A perfect shot restores 1 life if you're below 3.
                </li>
                <li>
                  <strong>Increasing Difficulty:</strong> As your score grows, you'll shoot from different distances and angles.
                </li>
              </ul>
            </div>
            <button type="button" className="hoops-btn hoops-btn-ghost" onClick={() => setRulesOpen(false)}>
              Back
            </button>
          </div>
        ) : null}
        {mode === 'play' && hud.hint ? (
          <div className="hoops-shoot-hint" style={{ left: shootHint.x, top: shootHint.y }} aria-hidden>
            <svg className="hoops-shoot-arrow" viewBox="0 0 24 48" aria-hidden>
              <path
                d="M12 46V12M5 20l7-12 7 12"
                fill="none"
                stroke="rgba(255, 250, 236, 0.95)"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <img className="hoops-shoot-paw" src={lionPawUrl} alt="" />
          </div>
        ) : null}
        {mode === 'play' && hud.toast ? (
          <ShotToast key={hud.toastKey} kind={hud.toast} points={hud.toastPoints} life={hud.toastLife} />
        ) : null}
        {mode === 'over' && summary ? (
          <div className="hoops-panel">
            <h2>Game Over</h2>
            {summary.neuBest ? <p className="hoops-new">New best</p> : null}
            <p>
              Final score <strong>{summary.score}</strong>
            </p>
            <p>
              Best score <strong>{summary.best}</strong>
            </p>
            <p>
              Baskets <strong>{summary.baskets}</strong>
            </p>
            <p>
              Perfect baskets <strong>{summary.perfects}</strong>
            </p>
            <p className="hoops-xp">+{summary.xp} XP</p>
            <button type="button" className="hoops-btn" onClick={playAgain}>
              Play Again
            </button>
            <button type="button" className="hoops-btn hoops-btn-ghost" onClick={onGames}>
              Return to Games
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function formatClock(seconds: number) {
  const whole = Math.max(0, Math.ceil(seconds))
  const mins = Math.floor(whole / 60)
  const secs = whole % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function swipeFrom(drag: Drag): Swipe | null {
  const dx = drag.x - drag.x0
  const dy = drag.y0 - drag.y
  if (dy < MIN_SWIPE_PX) return null
  const recent = drag.samples[0]
  const dt = Math.max(16, drag.samples[drag.samples.length - 1].t - recent.t) / 1000
  const speed = Math.hypot(drag.x - recent.x, drag.y - recent.y) / dt
  return { dx, dy, speed }
}

function ShotToast({
  kind,
  points,
  life,
}: {
  kind: NonNullable<Live['toast']>
  points: number
  life: boolean
}) {
  if (kind === 'hot') {
    return (
      <p className="hoops-toast perfect">
        HOT!
        <span>+{points}</span>
        {points >= PERFECT_POINTS + STREAK_BONUS ? <span>+{PERFECT_TIME}s</span> : null}
        {life ? <span>+1 LIFE</span> : null}
      </p>
    )
  }
  if (kind === 'ten') return <p className="hoops-toast">+{NORMAL_POINTS}</p>
  return (
    <p className="hoops-toast perfect">
      PERFECT SHOT!
      <span>+{PERFECT_POINTS}</span>
      <span>+{PERFECT_TIME}s</span>
      {kind === 'life' ? <span>+1 LIFE</span> : null}
    </p>
  )
}

function LivesHud({ lives, pop }: { lives: number; pop: number }) {
  return (
    <div className="hoops-lives" aria-label={`${lives} lives`}>
      {Array.from({ length: LIVES }, (_, i) => (
        <span key={i} className={`hoops-life${i < lives ? ' on' : ''}${i === pop ? ' pop' : ''}`} aria-hidden>
          <svg className="hoops-heart" viewBox="0 0 32 30" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M16 27.2C16 27.2 3.2 19.4 3.2 10.6 3.2 6.4 6.4 3.5 10.2 3.5c2.4 0 4.5 1.2 5.8 3.1C17.3 4.7 19.4 3.5 21.8 3.5c3.8 0 7 2.9 7 7.1 0 8.8-12.8 16.6-12.8 16.6z"
              fill={i < lives ? '#e03131' : '#5c4030'}
              stroke="#ffd43b"
              strokeWidth="2"
            />
          </svg>
        </span>
      ))}
    </div>
  )
}
