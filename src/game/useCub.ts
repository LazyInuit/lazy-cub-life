import { useCallback, useEffect, useRef, useState } from 'react'
import { setClosedEyes, setNeedLooks, showAngryEyes, showMeatMouth, showWashGear, showYellMouth } from './cubTraits'
import { playSlurp } from './crunchAudio'
import { playRoar } from './roarAudio'
import { playLevelSound } from './levelAudio'
import { playSplash } from './splashAudio'
import { startLullaby, stopLullaby } from './sleepAudio'
import { startSnore, stopSnore } from './snoreAudio'
import { applyAbsence, applyCare, applyPet, applyReward, clampNeed, decaySave, isNeedy, levelFromXp, rewardMultiplier } from './progress'
import { readSave, writeSave } from './storage'
import type { CareAction, CubPose, CubSave, NeedKey } from './types'

const POSE_MS: Record<Exclude<CareAction, 'sleep'>, number> = {
  feed: 1700,
  clean: 1700,
}

const POSE_FOR: Record<Exclude<CareAction, 'sleep'>, CubPose> = {
  feed: 'eat',
  clean: 'wash',
}

export function useCub() {
  const [save, setSave] = useState<CubSave | null>(null)
  const saveRef = useRef<CubSave | null>(null)
  const [pose, setPose] = useState<CubPose>('idle')
  const [toast, setToast] = useState<string | null>(null)
  const [levelUp, setLevelUp] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [asleep, setAsleep] = useState(false)
  const busyRef = useRef(false)
  const asleepRef = useRef(false)
  const poseTimer = useRef<number | null>(null)
  const levelTimer = useRef<number | null>(null)
  const energyClock = useRef(0)
  const sleepEnergyClock = useRef(0)

  const commit = useCallback((next: CubSave) => {
    saveRef.current = next
    setNeedLooks(next.energy, next.hunger)
    setSave(next)
    writeSave(next)
  }, [])

  const noteLevel = useCallback((beforeXp: number, afterXp: number) => {
    const before = levelFromXp(beforeXp)
    const after = levelFromXp(afterXp)
    if (after <= before) return
    playLevelSound()
    setLevelUp(after)
    if (levelTimer.current !== null) window.clearTimeout(levelTimer.current)
    levelTimer.current = window.setTimeout(() => {
      levelTimer.current = null
      setLevelUp(null)
    }, 1500)
  }, [])

  useEffect(() => {
    const loaded = readSave()
    commit(applyAbsence(loaded).save)
  }, [commit])

  useEffect(() => {
    const id = window.setInterval(() => {
      const current = saveRef.current
      if (!current || busyRef.current) return
      const next = decaySave(current, 1000, false)
      if (asleepRef.current) {
        sleepEnergyClock.current += 1000
        if (sleepEnergyClock.current >= 3000) {
          const steps = Math.floor(sleepEnergyClock.current / 3000)
          sleepEnergyClock.current %= 3000
          next.energy = clampNeed(next.energy + steps * 10)
        }
      } else {
        energyClock.current += 1000
        if (energyClock.current >= 10000) {
          const steps = Math.floor(energyClock.current / 10000)
          energyClock.current %= 10000
          next.energy = clampNeed(next.energy + steps * 10)
        }
      }
      next.lastVisit = Date.now()
      commit(next)
    }, 1000)
    return () => window.clearInterval(id)
  }, [commit])

  useEffect(() => {
    return () => {
      if (poseTimer.current !== null) window.clearTimeout(poseTimer.current)
      if (levelTimer.current !== null) window.clearTimeout(levelTimer.current)
      stopLullaby()
      stopSnore()
      setClosedEyes(false)
    }
  }, [])

  const holdPose = useCallback((nextPose: CubPose, ms: number) => {
    setPose(nextPose)
    if (poseTimer.current !== null) window.clearTimeout(poseTimer.current)
    poseTimer.current = window.setTimeout(() => {
      poseTimer.current = null
      busyRef.current = false
      setBusy(false)
      setToast(null)
      if (asleepRef.current) {
        setPose('sleep')
        return
      }
      const current = saveRef.current
      setPose(current && isNeedy(current) ? 'sad' : 'idle')
    }, ms)
  }, [])

  const care = useCallback(
    (action: Exclude<CareAction, 'sleep'>) => {
      const current = saveRef.current
      if (!current || busyRef.current || asleepRef.current) return
      const next = applyCare(current, action)
      if (!next) return
      busyRef.current = true
      setBusy(true)
      noteLevel(current.xp, next.xp)
      commit(next)
      if (action === 'feed') {
        playSlurp()
        showMeatMouth(2000)
      }
      if (action === 'clean') {
        playSplash()
        showWashGear(POSE_MS.clean)
      }
      holdPose(POSE_FOR[action], POSE_MS[action])
    },
    [commit, holdPose, noteLevel],
  )

  const toggleSleep = useCallback(() => {
    const current = saveRef.current
    if (!current || busyRef.current) return
    if (asleepRef.current) {
      asleepRef.current = false
      setAsleep(false)
      setClosedEyes(false)
      setToast(null)
      setPose(isNeedy(current) ? 'sad' : 'idle')
      stopLullaby()
      stopSnore()
      sleepEnergyClock.current = 0
      return
    }
    const next = applyCare(current, 'sleep')
    if (next) {
      noteLevel(current.xp, next.xp)
      commit(next)
    }
    sleepEnergyClock.current = 0
    asleepRef.current = true
    setAsleep(true)
    setClosedEyes(true)
    setPose('sleep')
    startLullaby()
    startSnore()
  }, [commit, noteLevel])

  const pet = useCallback(() => {
    const current = saveRef.current
    if (!current || busyRef.current || asleepRef.current) return
    playRoar()
    showYellMouth(700)
    showAngryEyes(700)
    const next = applyPet(current)
    if (next) {
      noteLevel(current.xp, next.xp)
      commit(next)
    }
    busyRef.current = true
    setBusy(true)
    holdPose('react', 700)
  }, [commit, holdPose, noteLevel])

  const recordFlightBest = useCallback((score: number) => {
    const current = saveRef.current
    if (!current) return
    const nextBest = Math.max(0, Math.floor(score))
    if (nextBest <= current.flightBest) return
    commit({ ...current, flightBest: nextBest })
  }, [commit])

  const recordMatchBest = useCallback((score: number) => {
    const current = saveRef.current
    if (!current) return
    const nextBest = Math.max(0, Math.floor(score))
    if (nextBest <= current.matchBest) return
    commit({ ...current, matchBest: nextBest })
  }, [commit])

  const recordDojoBest = useCallback((score: number) => {
    const current = saveRef.current
    if (!current) return
    const nextBest = Math.max(0, Math.floor(score))
    if (nextBest <= current.dojoBest) return
    commit({ ...current, dojoBest: nextBest })
  }, [commit])

  const reward = useCallback(
    (baseXp: number, needs: Partial<Record<NeedKey, number>>) => {
      const current = saveRef.current
      if (!current) return { xpGained: 0 }
      const xpGained = Math.round(baseXp * rewardMultiplier(levelFromXp(current.xp)))
      const next = applyReward(current, xpGained, needs)
      noteLevel(current.xp, next.xp)
      commit(next)
      return { xpGained }
    },
    [commit, noteLevel],
  )

  const displayPose: CubPose = asleep
    ? 'sleep'
    : pose === 'idle' && save && isNeedy(save)
      ? 'sad'
      : pose

  return {
    save,
    pose: displayPose,
    toast,
    levelUp,
    busy,
    asleep,
    care,
    toggleSleep,
    pet,
    reward,
    recordFlightBest,
    recordMatchBest,
    recordDojoBest,
  }
}

export type CubController = ReturnType<typeof useCub>
