import { useEffect, useRef, useState, type CSSProperties } from 'react'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import homeCubLeftUrl from '../assets/baseball/home-cub-left.png'
import homeCubRightUrl from '../assets/baseball/home-cub-right.png'
import stadiumUrl from '../assets/baseball/stadium.jpg'
import {
  ART,
  BALL,
  BASEBALL_XP_PER_SCORE,
  BAT,
  CONTACT_Z,
  FIELD,
  FLICK,
  FLIGHT,
  MACHINE,
  MOUND_PITCHES,
  PERFECTS_PER_CASH,
  PITCH,
  RESULT_PAUSE,
  SCORE,
  STRIKE_ZONE,
  STRIKES,
  type Quality,
  type Vec3,
} from '../game/baseball/config'
import {
  playCash,
  playContact,
  playHomeRun,
  playLanding,
  playLaunch,
  playMachineHops,
  playOutcome,
  playPitchWhizz,
  playStrike,
  playSwing,
  playWall,
  resumeBaseballAudio,
  setBaseballAudioHidden,
  startBaseballBgm,
  stopBaseballBgm,
} from '../game/baseball/audio'
import { batThumbnails } from '../game/baseball/batModel'
import { BAT_DESIGNS, DEFAULT_BAT, batBarrelRadius, batById, loadBatChoice, loadLeftHanded, saveBatChoice, saveLeftHanded } from '../game/baseball/bats'
import { judgeTiming, launchFor } from '../game/baseball/contact'
import { carryDistance, hitKind, hitPoints, startFlight, stepFlight, type Flight, type HitKind } from '../game/baseball/flight'
import { calibrate, fitArt, projectArt, type ArtBox, type Calibration } from '../game/baseball/layout'
import {
  MOUND_SPOT,
  arrivalTime,
  difficultyFor,
  machineFrame,
  makePitch,
  pitchBallRadius,
  pitchPassed,
  pitchPosition,
  spotBase,
  spotForPitch,
  timingWindows,
  type Pitch,
  type PitchType,
} from '../game/baseball/pitch'
import { createBaseballScene, type BaseballScene } from '../game/baseball/scene'
import { aimBat, batRig, createMotionTracker, slerpDir, sweptThrough, type Flick } from '../game/baseball/swing'
import { layoutPoint, layoutSize } from '../game/frameScale'
import { PLAY_ENERGY_COST, PLAY_NEED_COST, moodFromScore } from '../game/progress'
import type { NeedKey } from '../game/types'
import type { RunBonus } from '../game/useCub'
import { RunEnergy } from './EnergyBar'
import { GamesButton, HomeButton } from './HomeButton'
import { PowerBonusNote } from './PowerBonusNote'

type Phase = 'home' | 'ready' | 'pitch' | 'hit' | 'result' | 'over'

type Hud = { score: number; strikes: number; cash: number; homeRuns: number; longest: number }

const EMPTY_HUD: Hud = { score: 0, strikes: 0, cash: 0, homeRuns: 0, longest: 0 }

type Callout = { id: number; title: string; sub?: string; tone: Quality | 'strike' | 'homeRun' }

const QUALITY_TITLE: Record<Exclude<Quality, 'miss'>, string> = {
  perfect: 'Perfect!',
  good: 'Good Hit',
  weak: 'Weak Hit',
}

const KIND_TITLE: Record<HitKind, string> = {
  ground: 'Ground Ball',
  short: 'Base Hit',
  deep: 'Deep Hit!',
  homeRun: 'Home Run!',
}

/** The scoreboard's score is sized to fit this many digits; longer scores shrink to the same width. */
const SCORE_DIGITS = 5

const CAL: Calibration = calibrate()
/** Every bat shares one shape, so the player's choice only changes its look. */
const BAT_LENGTH = DEFAULT_BAT.length
const BARREL_R = batBarrelRadius(DEFAULT_BAT)

const along = (hands: Vec3, dir: Vec3, s: number): Vec3 => ({
  x: hands.x + dir.x * s,
  y: hands.y + dir.y * s,
  z: hands.z + dir.z * s,
})

type Props = {
  best: number
  /** Best score this leaderboard week. */
  weekBest: number
  onBest: (score: number) => void
  onDailyStart: () => boolean
  onDaily: (score: number) => void
  onReward: (baseXp: number, needs: Partial<Record<NeedKey, number>>) => { xpGained: number }
  onCoins: (amount: number) => void
  onExit: () => void
  onGames: () => void
  energy: number
  onShop: () => void
  /** Cub Power bonus added to this run. */
  powerBonus?: RunBonus
}

type Summary = { best: number; newBest: boolean; xp: number }

export function BaseballBlitz({ best, weekBest, onBest, onDailyStart, onDaily, onReward, onCoins, onExit, onGames, energy, onShop, powerBonus }: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const debugRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRef = useRef<BaseballScene | null>(null)
  const [box, setBox] = useState<ArtBox>({ x: 0, y: 0, w: 0, h: 0, sideFill: false })
  const boxRef = useRef(box)
  const [phase, setPhase] = useState<Phase>('home')
  const [hud, setHud] = useState<Hud>(EMPTY_HUD)
  const [callout, setCallout] = useState<Callout | null>(null)
  /** Bumps each time Cub Cash is earned, replaying the coin flash. */
  const [coinPop, setCoinPop] = useState<number | null>(null)
  const [lowEnergy, setLowEnergy] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  /** True once the current run's score, XP and Cub Cash have been recorded. */
  const rewarded = useRef(true)
  const bestRef = useRef(best)
  bestRef.current = Math.max(bestRef.current, best)
  const reportRef = useRef({ onBest, onDaily, onReward, onCoins })
  reportRef.current = { onBest, onDaily, onReward, onCoins }
  const [debug] = useState(() => new URLSearchParams(window.location.search).has('bbdebug'))
  const [batId, setBatId] = useState(() => loadBatChoice().id)
  const [picker, setPicker] = useState<Map<string, string> | null>(null)
  const [leftHanded, setLeftHanded] = useState(loadLeftHanded)
  const [rulesOpen, setRulesOpen] = useState(false)

  const live = useRef({
    phase: 'home' as Phase,
    clock: 0,
    realMark: 0,
    phaseAt: 0,
    readyDelay: PITCH.firstDelay,
    pitch: null as Pitch | null,
    pitchResolved: false,
    /** Cuts the incoming ball's whizz short when it is hit. */
    stopWhizz: null as (() => void) | null,
    flight: null as Flight | null,
    /** Game clock when the current hit's result shows, once it is known. */
    settleAt: null as number | null,
    hitQuality: 'miss' as Quality,
    hits: 0,
    score: 0,
    strikes: 0,
    /** Perfect hits in a row after the warm-up pitches; from the third on, each one pays Cub Cash. Anything less resets it. */
    perfectRun: 0,
    cash: 0,
    homeRuns: 0,
    longest: 0,
    calloutId: 0,
    /** Barrel direction; the handle end never moves. */
    leftHanded,
    rig: batRig(leftHanded),
    batDir: batRig(leftHanded).rest as Vec3,
    held: false,
    /** Metres up the bat from the handle where the finger is holding it. */
    grab: BAT_LENGTH * 0.7,
    returnFrom: null as Vec3 | null,
    returnAt: 0,
    /** Game clock of the last fast swipe during the current pitch. */
    lastSwipeAt: -Infinity,
    /** Firing spot, and where the machine is now (it drives between spots). */
    spot: MOUND_SPOT,
    /** Pitches thrown this game, and the last one's type. */
    pitchCount: 0,
    lastType: 'normal' as PitchType,
    machineAt: spotBase(MOUND_SPOT),
    moveFrom: null as Vec3 | null,
    moveTo: spotBase(MOUND_SPOT),
    moveAt: 0,
    /** `?bbdebug` only: holds the game still for alignment checks. */
    frozen: false,
  })

  /** Records the run once: best, daily score and leaderboard, XP, and the Cub Cash earned. */
  const finish = () => {
    if (rewarded.current) return
    rewarded.current = true
    const { score, cash } = live.current
    const report = reportRef.current
    const newBest = score > bestRef.current
    if (newBest) {
      bestRef.current = score
      report.onBest(score)
    }
    report.onDaily(score)
    const reward = report.onReward(Math.round(score * BASEBALL_XP_PER_SCORE), { ...moodFromScore(score), ...PLAY_NEED_COST })
    if (cash > 0) report.onCoins(cash)
    setSummary({ best: bestRef.current, newBest, xp: reward.xpGained })
  }
  const finishRef = useRef(finish)
  finishRef.current = finish

  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return
    const scene = createBaseballScene(canvas, CAL, loadBatChoice())
    sceneRef.current = scene
    const state = live.current
    scene.setBat(state.rig.rest, state.rig.hands)
    if (debug) (window as unknown as { __bb?: typeof state }).__bb = state
    const tracker = createMotionTracker()
    let activePointer: number | null = null
    let raf = 0

    const measure = () => {
      const size = layoutSize(stage)
      setBox(fitArt(size.width, size.height))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)

    const enter = (next: Phase) => {
      state.phase = next
      state.phaseAt = state.clock
      setPhase(next)
    }
    const publish = () => {
      setHud({ score: state.score, strikes: state.strikes, cash: state.cash, homeRuns: state.homeRuns, longest: state.longest })
    }
    const say = (title: string, tone: Callout['tone'], sub?: string) => {
      state.calloutId += 1
      setCallout({ id: state.calloutId, title, sub, tone })
    }
    const strike = (title: string) => {
      state.strikes += 1
      state.perfectRun = 0
      state.pitchResolved = true
      playStrike(state.strikes >= STRIKES)
      say(title, 'strike', `Strike ${state.strikes}`)
      publish()
    }

    const hit = (pitch: Pitch, at: number, motion: Flick) => {
      const error = at - arrivalTime(pitch)
      const quality = judgeTiming(error, timingWindows(state.score))
      if (quality === 'miss') return
      state.pitchResolved = true
      const pos = pitchPosition(pitch, at - pitch.firedAt)
      const launch = launchFor(quality, error, motion, motion.power, Math.random, state.leftHanded)
      state.flight = startFlight(pos, launch.velocity)
      state.settleAt = null
      stepFlight(state.flight, Math.max(0, state.clock - at) * FLIGHT.timeScale)
      state.stopWhizz?.()
      state.stopWhizz = null
      playContact(quality)
      state.hitQuality = quality
      state.hits += 1
      scene.flash(pos, quality === 'perfect' ? 1.25 : quality === 'good' ? 0.95 : 0.65)
      say(QUALITY_TITLE[quality], quality)
      enter('hit')
    }

    /** Did the barrel, turning from `from` to `to` at game time `at`, pass over the pitched ball? */
    const tryHit = (from: Vec3, to: Vec3, motion: Flick, at: number) => {
      const pitch = state.pitch
      if (state.phase !== 'pitch' || !pitch || state.pitchResolved) return
      state.lastSwipeAt = at
      if (Math.abs(at - arrivalTime(pitch)) > timingWindows(state.score).weak) return
      const art = boxRef.current
      const px = (p: Vec3) => {
        const a = projectArt(CAL, p)
        return { x: a.x * art.w, y: a.y * art.h, depth: a.depth }
      }
      const ballPos = pitchPosition(pitch, at - pitch.firedAt)
      const ball = px(ballPos)
      const mid = px(along(state.rig.hands, to, BAT_LENGTH / 2))
      const ballRadius = ((pitchBallRadius(pitch, at - pitch.firedAt) * CAL.focal) / Math.max(0.1, ball.depth)) * art.h
      const batHalf = ((BARREL_R * CAL.focal) / Math.max(0.1, mid.depth)) * art.h
      if (sweptThrough(px(state.rig.hands), px(along(state.rig.hands, from, BAT_LENGTH)), px(along(state.rig.hands, to, BAT_LENGTH)), ball, ballRadius + batHalf + FLICK.hitPad)) {
        hit(pitch, at, motion)
      }
    }

    /** Moves a hit ball on; the result is due shortly after it first comes down or clears the fence. */
    const advanceFlight = (f: Flight, dt: number) => {
      const was = { landed: f.landedAt !== null, wall: f.hitWall, homeRun: f.homeRun }
      stepFlight(f, dt * FLIGHT.timeScale)
      if (f.homeRun && !was.homeRun && !was.landed) {
        playHomeRun()
        state.settleAt ??= state.clock + FLIGHT.settleHomeRun
      } else if (f.hitWall && !was.wall) playWall(f.landedAt ?? 0)
      else if (f.landedAt !== null && !was.landed) playLanding(f.landedAt)
      if (f.landedAt !== null && !was.landed) state.settleAt ??= state.clock + FLIGHT.settleLanded
      const away = Math.hypot(f.pos.x, f.pos.y - CAL.height, f.pos.z - CAL.distance)
      scene.setBall(f.pos, Math.max(BALL.radius, away * BALL.minApparent), !f.homeRun || f.t < 2.4, f.rolling ? 0 : 30 * dt)
    }

    const step = (dt: number) => {
      state.clock += dt
      const now = state.clock
      if (!state.held && state.returnFrom) {
        const s = Math.min(1, (now - state.returnAt) / BAT.returnTime)
        state.batDir = slerpDir(state.returnFrom, state.rig.rest, 1 - (1 - s) * (1 - s))
        if (s >= 1) state.returnFrom = null
      }
      scene.setBat(state.batDir, state.rig.hands)

      if (state.moveFrom) {
        const s = Math.min(1, (now - state.moveAt) / MACHINE.moveTime)
        const e = s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2
        const from = state.moveFrom
        const to = state.moveTo
        state.machineAt = {
          x: from.x + (to.x - from.x) * e,
          y: to.y + MACHINE.moveHop * Math.abs(Math.sin(Math.PI * s * MACHINE.moveHops)) * (1 - s * 0.5),
          z: from.z + (to.z - from.z) * e,
        }
        if (s >= 1) {
          state.machineAt = { ...to }
          state.moveFrom = null
        }
        scene.setMachineBase(state.machineAt)
      }

      if (state.phase === 'ready' && !state.moveFrom && now - state.phaseAt >= state.readyDelay) {
        state.pitch = makePitch(state.score, now, Math.random, { base: state.machineAt, previous: state.lastType, close: state.spot.dz >= 5 })
        state.lastType = state.pitch.type
        state.pitchCount += 1
        state.pitchResolved = false
        state.flight = null
        state.lastSwipeAt = -Infinity
        playLaunch(state.pitch.type)
        state.stopWhizz = playPitchWhizz(state.pitch.flightTime, state.pitch.type)
        scene.fire()
        enter('pitch')
      }

      if (state.phase === 'pitch' && state.pitch) {
        const t = now - state.pitch.firedAt
        scene.setBall(pitchPosition(state.pitch, t), pitchBallRadius(state.pitch, t), true, BALL.spinPitch * dt)
        if (pitchPassed(state.pitch, t)) {
          if (!state.pitchResolved) {
            strike(state.lastSwipeAt >= arrivalTime(state.pitch) - FLICK.swingMemory ? 'Miss!' : 'Strike!')
          }
          scene.setBall(pitchPosition(state.pitch, t), 0, false, 0)
          enter('result')
        }
      } else if (state.phase === 'hit' && state.flight) {
        const f = state.flight
        advanceFlight(f, dt)
        if (f.done || (state.settleAt !== null && now >= state.settleAt)) {
          const kind = hitKind(f)
          const distance = carryDistance(f)
          const points = hitPoints(kind, state.hitQuality, distance)
          state.score += points
          if (kind === 'homeRun') state.homeRuns += 1
          state.longest = Math.max(state.longest, Math.round(distance))
          const warmUp = state.pitchCount <= MOUND_PITCHES
          state.perfectRun = state.hitQuality === 'perfect' && !warmUp ? state.perfectRun + 1 : 0
          const paid = state.perfectRun >= PERFECTS_PER_CASH
          if (paid) state.cash += 1
          if (kind !== 'homeRun') playOutcome(kind)
          if (paid) {
            playCash()
            setCoinPop(state.cash)
          }
          say(KIND_TITLE[kind], kind === 'homeRun' ? 'homeRun' : state.hitQuality, `+${points} · ${Math.round(distance)}m${paid ? ' · +1 Cub Cash' : ''}`)
          publish()
          enter('result')
        }
      } else if (state.phase === 'result' && now - state.phaseAt < RESULT_PAUSE) {
        if (state.flight && !state.flight.done) advanceFlight(state.flight, dt)
      } else if (state.phase === 'result') {
        scene.setBall(FIELD_ORIGIN, 0, false, 0)
        if (state.strikes >= STRIKES) {
          stopBaseballBgm()
          finishRef.current()
          enter('over')
        } else {
          scene.setMachineLoaded(true)
          state.readyDelay = difficultyFor(state.score).gap
          const next = spotForPitch(state.pitchCount, state.score, state.spot.id)
          if (next.id !== state.spot.id) {
            state.spot = next
            state.moveFrom = { ...state.machineAt }
            state.moveTo = spotBase(next, state.leftHanded)
            state.moveAt = now
            playMachineHops(MACHINE.moveHops, MACHINE.moveTime)
            state.readyDelay = Math.max(state.readyDelay, MACHINE.moveTime + 0.25)
          }
          enter('ready')
        }
      }
    }

    const frame = (real: number) => {
      const dt = Math.min(0.033, Math.max(0, (real - state.realMark) / 1000))
      state.realMark = real
      if (!state.frozen) step(dt)
      scene.render()
      raf = requestAnimationFrame(frame)
    }
    const start = () => {
      cancelAnimationFrame(raf)
      state.realMark = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const onVisibility = () => {
      setBaseballAudioHidden(document.hidden)
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else start()
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)

    const playing = () => state.phase !== 'home' && state.phase !== 'over'
    /** Event time (ms, performance clock) on the game clock. */
    const gameTime = (timeStamp: number) =>
      Math.min(state.clock + 0.03, Math.max(state.clock - 0.05, state.clock + (timeStamp - state.realMark) / 1000))
    const artFrac = (x: number, y: number) => {
      const art = boxRef.current
      return { fx: (x - art.x) / art.w, fy: (y - art.y) / art.h }
    }
    /** Metres up the bat nearest the touch, or null when the touch is not on the bat. */
    const grabPoint = (x: number, y: number) => {
      const art = boxRef.current
      let best = { dist: Infinity, s: 0 }
      for (let i = 0; i <= 40; i += 1) {
        const s = (BAT_LENGTH * i) / 40
        const p = projectArt(CAL, along(state.rig.hands, state.batDir, s))
        const dist = Math.hypot(p.x * art.w + art.x - x, p.y * art.h + art.y - y)
        if (dist < best.dist) best = { dist, s }
      }
      const { halfWidth } = scene.batOnScreen()
      if (best.dist > FLICK.grabRadius + halfWidth) return null
      return Math.max(BAT_LENGTH * BAT.minGrab, best.s)
    }
    const release = () => {
      state.held = false
      state.returnFrom = state.batDir
      state.returnAt = state.clock
      scene.setBatHeld(false)
    }
    const onDown = (event: PointerEvent) => {
      resumeBaseballAudio()
      if (!playing()) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (activePointer !== null) return
      if (event.target instanceof Element && event.target.closest('button')) return
      event.preventDefault()
      const p = layoutPoint(stage, event.clientX, event.clientY)
      const grab = grabPoint(p.x, p.y)
      if (grab === null) return
      activePointer = event.pointerId
      try {
        stage.setPointerCapture(event.pointerId)
      } catch {
        // Synthetic or already-ended pointers cannot be captured; moves still reach the stage.
      }
      tracker.reset(p.x, p.y, event.timeStamp / 1000)
      state.grab = grab
      state.held = true
      state.returnFrom = null
      scene.setBatHeld(true)
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointer) return
      event.preventDefault()
      const events = event.getCoalescedEvents?.() ?? []
      for (const item of events.length > 0 ? events : [event]) {
        const p = layoutPoint(stage, item.clientX, item.clientY)
        const { fx, fy } = artFrac(p.x, p.y)
        const from = state.batDir
        const to = aimBat(CAL, fx, fy, state.grab, state.rig.hands)
        state.batDir = to
        tracker.push(p.x, p.y, item.timeStamp / 1000)
        const motion = tracker.motion()
        if (motion.speed >= FLICK.minSpeed) {
          playSwing((motion.power - FLICK.minPower) / (FLICK.maxPower - FLICK.minPower))
          tryHit(from, to, motion, gameTime(item.timeStamp))
        }
      }
    }
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== activePointer) return
      activePointer = null
      release()
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId)
    }
    const blockTouch = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.bb-scroll')) return
      event.preventDefault()
    }
    stage.addEventListener('pointerdown', onDown, { passive: false })
    stage.addEventListener('pointermove', onMove, { passive: false })
    stage.addEventListener('pointerup', onUp)
    stage.addEventListener('pointercancel', onUp)
    stage.addEventListener('touchmove', blockTouch, { passive: false })
    stage.addEventListener('gesturestart', blockTouch, { passive: false })
    stage.addEventListener('dblclick', blockTouch)

    return () => {
      cancelAnimationFrame(raf)
      stopBaseballBgm()
      // Leaving mid-run still counts the run, like the other games.
      finishRef.current()
      state.stopWhizz?.()
      state.stopWhizz = null
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      stage.removeEventListener('pointerdown', onDown)
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerup', onUp)
      stage.removeEventListener('pointercancel', onUp)
      stage.removeEventListener('touchmove', blockTouch)
      stage.removeEventListener('gesturestart', blockTouch)
      stage.removeEventListener('dblclick', blockTouch)
      scene.dispose()
      sceneRef.current = null
      if (debug) delete (window as unknown as { __bb?: typeof state }).__bb
    }
  }, [debug])

  useEffect(() => {
    sceneRef.current?.setBatDesign(batById(batId))
  }, [batId])

  const chooseBat = (id: string) => {
    saveBatChoice(id)
    setBatId(id)
  }

  const chooseHand = (left: boolean) => {
    saveLeftHanded(left)
    setLeftHanded(left)
    const state = live.current
    state.leftHanded = left
    state.rig = batRig(left)
    state.batDir = state.rig.rest
    state.returnFrom = null
    sceneRef.current?.setBat(state.rig.rest, state.rig.hands)
  }

  useEffect(() => {
    boxRef.current = box
    if (box.w > 0) sceneRef.current?.resize(box.w, box.h)
    if (debug && debugRef.current && box.w > 0) drawDebug(debugRef.current, box)
  }, [box, debug])

  /** Fresh game state; `next` is 'ready' to start pitching or 'home' for the game menu. */
  const reset = (next: 'ready' | 'home') => {
    const state = live.current
    if (next === 'home') stopBaseballBgm()
    state.hits = 0
    state.score = 0
    state.strikes = 0
    state.perfectRun = 0
    state.cash = 0
    state.homeRuns = 0
    state.longest = 0
    state.pitch = null
    state.flight = null
    state.pitchResolved = false
    state.stopWhizz?.()
    state.stopWhizz = null
    state.readyDelay = PITCH.firstDelay
    state.spot = MOUND_SPOT
    state.pitchCount = 0
    state.lastType = 'normal'
    state.machineAt = spotBase(MOUND_SPOT)
    state.moveFrom = null
    sceneRef.current?.setMachineBase(state.machineAt)
    state.phase = next
    state.phaseAt = state.clock
    sceneRef.current?.setMachineLoaded(true)
    sceneRef.current?.setBall(FIELD_ORIGIN, 0, false, 0)
    setHud(EMPTY_HUD)
    setCallout(null)
    setCoinPop(null)
    setPhase(next)
  }
  const play = () => {
    resumeBaseballAudio()
    if (!onDailyStart()) {
      setLowEnergy(true)
      return
    }
    setLowEnergy(false)
    rewarded.current = false
    setSummary(null)
    reset('ready')
    startBaseballBgm()
  }

  /** Home or Games mid-run ends the run and shows its results first, like Lazy River. */
  const leave = (go: () => void) => {
    const state = live.current
    if (state.phase === 'home' || state.phase === 'over' || rewarded.current) {
      go()
      return
    }
    state.stopWhizz?.()
    state.stopWhizz = null
    state.phase = 'over'
    state.phaseAt = state.clock
    sceneRef.current?.setBall(FIELD_ORIGIN, 0, false, 0)
    stopBaseballBgm()
    finish()
    setPhase('over')
  }

  const artStyle = {
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    '--bb-u': `${box.w / 100}px`,
  } as CSSProperties
  const board = ART.board
  const boardStyle: CSSProperties = {
    left: `${board.left * 100}%`,
    top: `${board.top * 100}%`,
    width: `${(board.right - board.left) * 100}%`,
    height: `${(board.bottom - board.top) * 100}%`,
  }
  const showHint = (phase === 'ready' || phase === 'pitch') && hud.score === 0 && hud.strikes === 0

  return (
    <section className="game-screen bb-screen">
      <div className="bb-stage" ref={stageRef}>
        {box.sideFill ? <div className="bb-fill" style={{ backgroundImage: `url("${stadiumUrl}")` }} aria-hidden /> : null}
        <div className="bb-art" style={artStyle}>
          <img className="bb-bg" src={stadiumUrl} alt="" draggable={false} />
          <canvas ref={canvasRef} className="bb-canvas" />
          {debug ? <canvas ref={debugRef} className="bb-debug" /> : null}
          <div className="bb-board" style={boardStyle} aria-live="polite">
            <p className="bb-cell bb-cell-score">
              <span>Score</span>
              <strong style={{ '--bb-fit': Math.min(1, SCORE_DIGITS / String(hud.score).length) } as CSSProperties}>{hud.score}</strong>
            </p>
            <p className="bb-cell">
              <span>Strikes</span>
              <span className="bb-strikes" aria-label={`${hud.strikes} of ${STRIKES} strikes`}>
                {Array.from({ length: STRIKES }, (_, i) => (
                  <i key={i} className={i < hud.strikes ? 'on' : ''} />
                ))}
              </span>
            </p>
            <p className="bb-cell bb-cell-cash">
              <span>Cub Cash</span>
              <strong key={`count-${coinPop ?? 0}`} className={coinPop ? 'bb-bump' : undefined}>
                {hud.cash}
              </strong>
              {coinPop ? (
                <span key={`coin-${coinPop}`} className="bb-coin-pop" onAnimationEnd={(event) => event.target === event.currentTarget && setCoinPop(null)} aria-hidden>
                  <img src={coinUrl} alt="" draggable={false} />
                  <b>+1</b>
                </span>
              ) : null}
            </p>
          </div>
          {callout ? (
            <div key={callout.id} className={`bb-callout bb-callout-${callout.tone}`}>
              <strong>{callout.title}</strong>
              {callout.sub ? <span>{callout.sub}</span> : null}
            </div>
          ) : null}
        </div>
        {showHint ? <p className="bb-hint">Hold the bat and swing it through the ball</p> : null}
        <div className="bb-nav">
          <HomeButton className="game-home" onClick={() => leave(onExit)} />
          <GamesButton className="game-home game-games" onClick={() => leave(onGames)} />
        </div>
        {phase === 'home' && !picker && !rulesOpen ? (
          <div className="bb-panel bb-panel-home">
            <img className="bb-home-cub bb-home-cub-left" src={homeCubLeftUrl} alt="" />
            <img className="bb-home-cub bb-home-cub-right" src={homeCubRightUrl} alt="" />
            <h2>Baseball Blitz</h2>
            <p className="bb-best">
              Best Score {bestRef.current.toLocaleString('en-US')} · Weekly Best {weekBest.toLocaleString('en-US')}
            </p>
            {lowEnergy ? <p className="energy-note">Sleep or visit the shop to recover energy.</p> : null}
            <button type="button" className="bb-btn" onClick={play}>
              Play
            </button>
            <button type="button" className="bb-btn bb-btn-ghost" onClick={() => setPicker(batThumbnails(BAT_DESIGNS))}>
              Bat Selection
            </button>
            <button type="button" className="bb-btn bb-btn-ghost" onClick={() => setRulesOpen(true)}>
              How to Play
            </button>
          </div>
        ) : null}
        {phase === 'home' && rulesOpen ? (
          <div className="bb-panel bb-scroll">
            <h2>How to Play</h2>
            <ul className="bb-rules">
              <li>
                <strong>Swing:</strong> Hold the bat with your finger and swing it through the ball as it reaches you. The handle stays put
                and the bat follows your finger.
              </li>
              <li>
                <strong>Timing:</strong> Meet the ball right as it arrives for a Perfect hit. A little early or late gives a Good or Weak hit.
                Swipe faster for more power.
              </li>
              <li>
                <strong>Points:</strong> Ground ball {SCORE.ground}, base hit {SCORE.short}, deep hit {SCORE.deep} to {SCORE.deepFar}, home
                run {SCORE.homeRun}, perfect home run {SCORE.perfectHomeRun}.
              </li>
              <li>
                <strong>Cub Cash:</strong> Hit {PERFECTS_PER_CASH} perfect shots in a row to earn 1 Cub Cash, then 1 more for every perfect
                shot after that. A hit that isn't perfect, or a strike, ends the run. The first {MOUND_PITCHES} pitches are a warm-up and
                don't count towards Cub Cash.
              </li>
              <li>
                <strong>Three Strikes:</strong> Miss the ball or let it go past and it's a strike. Three strikes and you're out.
              </li>
              <li>
                <strong>Getting Harder:</strong> After the first {MOUND_PITCHES} pitches the machine moves around the field. The higher
                your score, the faster the pitches and the more they curve, with the odd slow one to catch you out. At big scores your
                timing has to be sharper too.
              </li>
              <li>
                <strong>Left-Handed?</strong> Switch sides in Bat Selection.
              </li>
            </ul>
            <button type="button" className="bb-btn bb-btn-ghost" onClick={() => setRulesOpen(false)}>
              Back
            </button>
          </div>
        ) : null}
        {phase === 'home' && picker ? (
          <div className="bb-panel bb-scroll">
            <h2>Bat Selection</h2>
            <div className="bb-bats">
              {BAT_DESIGNS.map((design) => (
                <button
                  key={design.id}
                  type="button"
                  className={`bb-bat${design.id === batId ? ' on' : ''}`}
                  aria-pressed={design.id === batId}
                  onClick={() => chooseBat(design.id)}
                >
                  <img src={picker.get(design.id)} alt="" draggable={false} />
                  <span>{design.name}</span>
                </button>
              ))}
            </div>
            <div className="bb-hand" role="group" aria-label="Batting hand">
              <button type="button" className={leftHanded ? 'on' : ''} aria-pressed={leftHanded} onClick={() => chooseHand(true)}>
                Left-handed
              </button>
              <button type="button" className={leftHanded ? '' : 'on'} aria-pressed={!leftHanded} onClick={() => chooseHand(false)}>
                Right-handed
              </button>
            </div>
            <button type="button" className="bb-btn" onClick={() => setPicker(null)}>
              Done
            </button>
          </div>
        ) : null}
        {phase === 'over' ? (
          <div className="bb-panel bb-scroll">
            <h2>Game Over</h2>
            {summary?.newBest ? <p className="bb-new-best">New best!</p> : null}
            <p className="bb-final">{hud.score.toLocaleString('en-US')}</p>
            <dl className="bb-stats">
              <div>
                <dt>Best score</dt>
                <dd>{(summary?.best ?? bestRef.current).toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Weekly best</dt>
                <dd>{Math.max(weekBest, hud.score).toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Home runs</dt>
                <dd>{hud.homeRuns}</dd>
              </div>
              <div>
                <dt>Longest hit</dt>
                <dd>{hud.longest > 0 ? `${hud.longest}m` : '-'}</dd>
              </div>
            </dl>
            <p className="bb-gains">
              <span>+{summary?.xp ?? 0} XP</span>
              <span>
                <img src={coinUrl} alt="" />+{hud.cash}
              </span>
            </p>
            <PowerBonusNote bonus={powerBonus} />
            <RunEnergy energy={energy} onShop={onShop} />
            {lowEnergy ? <p className="energy-note">Sleep or visit the shop to recover energy.</p> : null}
            <button type="button" className="bb-btn" onClick={play} disabled={energy < PLAY_ENERGY_COST}>
              Play Again
            </button>
            <button type="button" className="bb-btn bb-btn-ghost" onClick={() => reset('home')}>
              Game Menu
            </button>
            <button type="button" className="bb-btn bb-btn-ghost" onClick={onGames}>
              Choose a Different Game
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

const FIELD_ORIGIN = { x: 0, y: 0, z: 0 }

/** `?bbdebug`: the calibrated camera's view of key field marks, drawn over the painting. */
function drawDebug(canvas: HTMLCanvasElement, box: ArtBox) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(box.w * ratio)
  canvas.height = Math.round(box.h * ratio)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, box.w, box.h)
  const pt = (x: number, y: number, z: number) => {
    const p = projectArt(CAL, { x, y, z })
    return [p.x * box.w, p.y * box.h] as const
  }
  const line = (a: readonly [number, number], b: readonly [number, number]) => {
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.stroke()
  }
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(0,255,255,0.45)'
  for (let z = 0; z >= -40; z -= 5) line(pt(-8, 0, z), pt(8, 0, z))
  for (let x = -8; x <= 8; x += 2) line(pt(x, 0, 0.5), pt(x, 0, -40))
  ctx.strokeStyle = 'rgba(255,0,255,0.9)'
  ctx.lineWidth = 2
  const hw = FIELD.plateWidth / 2
  const plate = [pt(-hw, 0, 0), pt(hw, 0, 0), pt(hw, 0, FIELD.plateDepth / 2), pt(0, 0, FIELD.plateDepth), pt(-hw, 0, FIELD.plateDepth / 2)]
  plate.forEach((p, i) => line(p, plate[(i + 1) % plate.length]))
  line(pt(-0.3, 0, FIELD.rubberZ), pt(0.3, 0, FIELD.rubberZ))
  ctx.strokeStyle = 'rgba(255,255,0,0.95)'
  const mz = machineFrame().centre.z
  line(pt(-1.5, 0, mz), pt(1.5, 0, mz))
  ctx.strokeStyle = 'rgba(255,80,80,0.95)'
  const zy = STRIKE_ZONE.centreY
  const zh = STRIKE_ZONE.halfHeight
  const zw = STRIKE_ZONE.halfWidth
  const zone = [pt(-zw, zy - zh, CONTACT_Z), pt(zw, zy - zh, CONTACT_Z), pt(zw, zy + zh, CONTACT_Z), pt(-zw, zy + zh, CONTACT_Z)]
  zone.forEach((p, i) => line(p, zone[(i + 1) % zone.length]))
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.moveTo(0, ART.horizonY * box.h)
  ctx.lineTo(box.w, ART.horizonY * box.h)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(4, box.h - 22, box.w - 8, 18)
  ctx.fillStyle = '#fff'
  ctx.font = '11px monospace'
  ctx.fillText(`cam h ${CAL.height.toFixed(2)} d ${CAL.distance.toFixed(2)} fov ${CAL.fov.toFixed(1)} pitch ${((CAL.pitch * 180) / Math.PI).toFixed(1)}`, 8, box.h - 9)
}
