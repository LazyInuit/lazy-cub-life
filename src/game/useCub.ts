import { useCallback, useEffect, useRef, useState } from 'react'
import { setClosedEyes, setNeedLooks, showMeatMouth, showWashGear, showYellMouth } from './cubTraits'
import { playSlurp } from './crunchAudio'
import { playRoar } from './roarAudio'
import { playLevelSound } from './levelAudio'
import { playSplash } from './splashAudio'
import { startLullaby, stopLullaby } from './sleepAudio'
import { startSnore, stopSnore } from './snoreAudio'
import {
  applyAbsence,
  applyCare,
  applyPet,
  applyReward,
  barIsFull,
  clampNeed,
  decaySave,
  isNeedy,
  levelFromXp,
  levelProgress,
  PLAY_ENERGY_COST,
  rewardMultiplier,
} from './progress'
import { BONUS_COIN_AMOUNTS, DAILY_TASKS, bonusReady, dailyView, type BonusTrait, type DailyGame } from './dailyTasks'
import { DRINKS, type DrinkId } from './drinks'
import { submitLeaderboardScore } from './leaderboard'
import { readSave, writeSave } from './storage'
import { reconcileCloudSave, scheduleCloudSave, flushCloudSave, flushCloudSaveNow, cloudBaseVisit, signInAccount, signOutAccount, signUpAccount, takeAdoptedSave, lockedCubCash, noteLockedCash, noteEarnedCash, ethFromUser, usernameFromUser, loadDisplayedUsername, loadUsernameChangedAt, updateAccountSettings, normalizeEthAddress } from './account'
import { supabase } from './supabase'
import { addDailyScore, applyWallet, buyDrinkOnServer, claimDailyTask, grantGameCoins, payoutGap, payoutParts, purchaseTraitOnServer, rollDailyBonus as rollServerBonus, touchDailyBoard, walletActive, type GameCoinSource } from './wallet'
import { isTraitUnlocked, sanitizeOwnedOutfits, traitKey, traitPrice, traitXpBonus } from './traitShop'
import type { CareAction, CubOutfits, CubPose, CubSave, NeedKey } from './types'
import type { TraitCategory } from './cubTraits'
import type { CharacterAge } from './homeScene'

const POSE_MS: Record<Exclude<CareAction, 'sleep'>, number> = {
  feed: 1700,
  clean: 1700,
}

const POSE_FOR: Record<Exclude<CareAction, 'sleep'>, CubPose> = {
  feed: 'eat',
  clean: 'wash',
}

const LEVEL_UP_MS = 1500
const XP_FILL_MS = 450

export function useCub() {
  const [save, setSave] = useState<CubSave | null>(null)
  const saveRef = useRef<CubSave | null>(null)
  const [pose, setPose] = useState<CubPose>('idle')
  const [toast, setToast] = useState<string | null>(null)
  const [levelUp, setLevelUp] = useState<number | null>(null)
  const [presentedXp, setPresentedXp] = useState(0)
  const [busy, setBusy] = useState(false)
  const [asleep, setAsleep] = useState(false)
  const [accountName, setAccountName] = useState<string | null>(null)
  const [accountEth, setAccountEth] = useState<string | null>(null)
  const [usernameChangedAt, setUsernameChangedAt] = useState<string | null>(null)
  const busyRef = useRef(false)
  const asleepRef = useRef(false)
  const poseTimer = useRef<number | null>(null)
  const presentedXpRef = useRef(0)
  const levelUiVisibleRef = useRef(false)
  const revealBusyRef = useRef(false)
  const revealGenRef = useRef(0)
  const sleepEnergyClock = useRef(0)
  const cloudSettled = useRef(false)
  const cashQueue = useRef(Promise.resolve())

  const commit = useCallback((next: CubSave) => {
    const locked = lockedCubCash()
    const safe = locked == null ? next : { ...next, cubCash: locked }
    saveRef.current = safe
    setNeedLooks(safe.energy, safe.hunger, safe.cleanliness)
    setSave(safe)
    writeSave(safe)
    scheduleCloudSave(safe)
  }, [])

  const tuckIn = useCallback(() => {
    const current = saveRef.current
    if (!current || current.asleep || barIsFull(current.energy)) return
    commit({ ...current, asleep: true, lastVisit: Date.now() })
    flushCloudSave()
  }, [commit])

  const setPresented = useCallback((xp: number) => {
    presentedXpRef.current = xp
    setPresentedXp(xp)
  }, [])

  const runReveal = useCallback(async () => {
    if (revealBusyRef.current) return
    if (!levelUiVisibleRef.current) return
    const target = saveRef.current?.xp ?? 0
    if (presentedXpRef.current >= target) return

    revealBusyRef.current = true
    const gen = ++revealGenRef.current

    const cancelled = () => gen !== revealGenRef.current || !levelUiVisibleRef.current

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms)
      })

    const animateTo = (to: number, ms: number) =>
      new Promise<void>((resolve) => {
        const from = presentedXpRef.current
        if (from === to || ms <= 0) {
          setPresented(to)
          resolve()
          return
        }
        const t0 = performance.now()
        const step = (now: number) => {
          if (cancelled()) {
            resolve()
            return
          }
          const t = Math.min(1, (now - t0) / ms)
          const eased = t * (2 - t)
          setPresented(Math.round(from + (to - from) * eased))
          if (t < 1) {
            requestAnimationFrame(step)
            return
          }
          setPresented(to)
          resolve()
        }
        requestAnimationFrame(step)
      })

    try {
      while (!cancelled()) {
        const goal = saveRef.current?.xp ?? 0
        const cur = presentedXpRef.current
        if (cur >= goal) break

        const { level, into, next } = levelProgress(cur)
        const toLevelUp = next - into
        const room = goal - cur

        if (room >= toLevelUp && level < 99) {
          await animateTo(cur + toLevelUp, XP_FILL_MS)
          if (cancelled()) break
          playLevelSound()
          setLevelUp(level + 1)
          await sleep(LEVEL_UP_MS)
          if (gen !== revealGenRef.current) break
          setLevelUp(null)
        } else {
          await animateTo(goal, XP_FILL_MS)
        }
      }
    } finally {
      if (gen === revealGenRef.current) revealBusyRef.current = false
    }
  }, [setPresented])

  const noteLevel = useCallback(() => {
    if (!levelUiVisibleRef.current) return
    void runReveal()
  }, [runReveal])

  const setLevelUiVisible = useCallback(
    (visible: boolean) => {
      levelUiVisibleRef.current = visible
      if (!visible) {
        revealGenRef.current += 1
        revealBusyRef.current = false
        setLevelUp(null)
        return
      }
      void runReveal()
    },
    [runReveal],
  )

  const showAsleep = useCallback((sleeping: boolean) => {
    if (sleeping) {
      if (asleepRef.current) return
      asleepRef.current = true
      setAsleep(true)
      setClosedEyes(true)
      setPose('sleep')
      startLullaby()
      startSnore()
      sleepEnergyClock.current = 0
      return
    }
    if (!asleepRef.current) return
    asleepRef.current = false
    setAsleep(false)
    setClosedEyes(false)
    stopLullaby()
    stopSnore()
    sleepEnergyClock.current = 0
    const current = saveRef.current
    setPose(current && isNeedy(current) ? 'sad' : 'idle')
  }, [])

  useEffect(() => {
    const stored = readSave()
    const storedVisit = stored.lastVisit
    const awake = { ...stored, asleep: false }
    if (new URLSearchParams(window.location.search).has('lvl1')) awake.xp = 0
    commit(awake)
    showAsleep(false)
    presentedXpRef.current = awake.xp
    setPresentedXp(awake.xp)
    void reconcileCloudSave(awake, storedVisit).then((remote) => {
      const base = remote ?? saveRef.current ?? stored
      const next = { ...applyAbsence(base).save, asleep: false }
      if (new URLSearchParams(window.location.search).has('lvl1')) next.xp = 0
      commit(next)
      showAsleep(false)
      presentedXpRef.current = next.xp
      setPresentedXp(next.xp)
      cloudSettled.current = true
    })
  }, [commit, showAsleep])
  useEffect(() => {
    const catchUp = () => {
      const current = saveRef.current
      if (!current) return
      const storedVisit = cloudBaseVisit() || current.lastVisit
      const caught = { ...applyAbsence(current).save, asleep: false }
      void reconcileCloudSave(caught, storedVisit).then((remote) => {
        const latest = saveRef.current
        if (!latest) return
        const next = remote ? { ...applyAbsence(remote).save, asleep: false } : { ...applyAbsence(latest).save, asleep: false }
        commit(next)
        sleepEnergyClock.current = 0
        showAsleep(false)
      })
    }
    const onVisible = () => {
      if (!cloudSettled.current) return
      if (document.visibilityState === 'hidden') {
        tuckIn()
        const current = saveRef.current
        if (current) void flushCloudSaveNow(current)
      }
      if (document.visibilityState === 'visible') catchUp()
    }
    const onHide = () => {
      if (!cloudSettled.current) return
      tuckIn()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', onHide, true)
    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden' || !cloudSettled.current) return
      const current = saveRef.current
      if (!current || busyRef.current) return
      const next = decaySave(current, 1000, false)
      if (asleepRef.current) {
        sleepEnergyClock.current += 1000
        if (sleepEnergyClock.current >= 60_000) {
          const steps = Math.floor(sleepEnergyClock.current / 60_000)
          sleepEnergyClock.current %= 60_000
          next.energy = clampNeed(next.energy + steps)
        }
        if (barIsFull(next.energy)) next.asleep = false
      }
      next.lastVisit = Date.now()
      commit(next)
      if (asleepRef.current && !next.asleep) showAsleep(false)
    }, 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', onHide, true)
      window.clearInterval(id)
    }
  }, [commit, showAsleep, tuckIn])

  useEffect(() => {
    return () => {
      if (poseTimer.current !== null) window.clearTimeout(poseTimer.current)
      revealGenRef.current += 1
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
      commit(next)
      noteLevel()
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
      commit({ ...current, asleep: false })
      showAsleep(false)
      return
    }
    if (barIsFull(current.energy)) return
    commit({ ...current, asleep: true })
    showAsleep(true)
  }, [commit, showAsleep])

  const pet = useCallback(() => {
    const current = saveRef.current
    if (!current || busyRef.current || asleepRef.current) return
    playRoar()
    showYellMouth(700)
    const next = applyPet(current)
    if (next) {
      commit(next)
      noteLevel()
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

  const recordArcherBest = useCallback((score: number) => {
    const current = saveRef.current
    if (!current) return
    const nextBest = Math.max(0, Math.floor(score))
    if (nextBest <= current.archerBest) return
    commit({ ...current, archerBest: nextBest })
  }, [commit])

  const recordHoopsBest = useCallback((score: number) => {
    const current = saveRef.current
    if (!current) return
    const nextBest = Math.max(0, Math.floor(score))
    if (nextBest <= current.hoopsBest) return
    commit({ ...current, hoopsBest: nextBest })
  }, [commit])

  const setOutfits = useCallback((outfits: CubOutfits) => {
    const current = saveRef.current
    if (!current) return
    const safe = sanitizeOwnedOutfits(current, {
      old: { ...outfits.old },
      young: { ...outfits.young },
    })
    commit({
      ...current,
      outfits: safe,
    })
  }, [commit])

  const startDaily = useCallback(() => {
    const current = saveRef.current
    if (!current || current.energy < PLAY_ENERGY_COST) return false
    const next: CubSave = { ...current, energy: current.energy - PLAY_ENERGY_COST }
    const daily = dailyView(next.daily)
    if (daily.startedAt == null) {
      next.daily = { ...daily, startedAt: Date.now() }
      commit(next)
      void flushCloudSaveNow(next)
      void touchDailyBoard().then((patch) => {
        const latest = saveRef.current
        if (!patch || !latest) return
        const cash = noteEarnedCash(patch.cubCash)
        commit(applyWallet(latest, { ...patch, cubCash: cash }))
      })
      return true
    }
    commit(next)
    void flushCloudSaveNow(next)
    return true
  }, [commit])

  const noteDaily = useCallback((game: DailyGame, score: number) => {
    const current = saveRef.current
    if (!current) return
    const gained = Math.max(0, Math.floor(score))
    if (gained > 0) void submitLeaderboardScore(game, gained)
    if (gained === 0) return
    const daily = dailyView(current.daily)
    commit({
      ...current,
      daily: {
        ...daily,
        startedAt: daily.startedAt ?? Date.now(),
        scores: { ...daily.scores, [game]: (daily.scores[game] ?? 0) + gained },
      },
    })
    void addDailyScore(game, gained).then((patch) => {
      const latest = saveRef.current
      if (!patch || !latest) return
      const cash = noteEarnedCash(patch.cubCash)
      commit(applyWallet(latest, { ...patch, cubCash: cash }))
    })
  }, [commit])

  const claimDaily = useCallback(async (taskId: string) => {
    const current = saveRef.current
    if (!current) return false
    if (await walletActive()) {
      const result = await claimDailyTask(taskId)
      if (result.mode === 'local') {
        // The account database is not installed yet, so this claim stays on the device.
      } else {
        const latest = saveRef.current
        if (!result.patch || !latest || !(result.patch.granted && result.patch.granted > 0)) return false
        const cash = noteEarnedCash(result.patch.cubCash)
        commit(applyWallet(latest, { ...result.patch, cubCash: cash }))
        return true
      }
    }
    const task = DAILY_TASKS.find((item) => item.id === taskId)
    if (!task) return false
    const daily = dailyView(current.daily)
    if (daily.claimed.includes(task.id)) return false
    if ((daily.scores[task.game] ?? 0) < task.goal) return false
    commit({
      ...current,
      cubCash: current.cubCash + task.reward,
      daily: { ...daily, claimed: [...daily.claimed, task.id] },
    })
    return true
  }, [commit])

  const claimDailyBonus = useCallback((prize: { trait: BonusTrait | null; coins: number }) => {
    const current = saveRef.current
    if (!current) return false
    const daily = dailyView(current.daily)
    if (!bonusReady(daily)) return false
    if (lockedCubCash() != null) return false
    const trait = prize.trait
    const coins = trait || !(BONUS_COIN_AMOUNTS as readonly number[]).includes(prize.coins) ? 0 : prize.coins
    const unlockedTraits =
      trait && !isTraitUnlocked(current, trait.age, trait.category, trait.name)
        ? [...new Set([...current.unlockedTraits, traitKey(trait.age, trait.category, trait.name)])]
        : current.unlockedTraits
    commit({
      ...current,
      cubCash: current.cubCash + coins,
      unlockedTraits,
      daily: { ...daily, bonusClaimed: true, bonusTrait: trait, bonusCoins: coins },
    })
    return true
  }, [commit])

  const rollDailyBonus = useCallback(async () => {
    const current = saveRef.current
    if (!current) return null
    const spun = await rollServerBonus()
    const latest = saveRef.current
    if (spun.mode === 'local' || !latest) return null
    if (spun.mode !== 'server') return false
    const cash = noteEarnedCash(spun.patch.cubCash)
    commit(applyWallet(latest, { ...spun.patch, cubCash: cash }))
    return { trait: spun.trait, coins: spun.coins }
  }, [commit])

  const addCubCash = useCallback((amount: number, source: GameCoinSource) => {
    const gain = Math.floor(amount)
    if (gain <= 0) return
    cashQueue.current = cashQueue.current.then(async () => {
      if (await walletActive()) {
        const parts = payoutParts(source, gain)
        const waitGap = () => new Promise((resolve) => window.setTimeout(resolve, payoutGap(source) + 400))
        for (let index = 0; index < parts.length; index += 1) {
          if (index > 0) await waitGap()
          let result = await grantGameCoins(source, parts[index])
          if (result.mode !== 'server') {
            const latest = saveRef.current
            if (!latest) return
            const rest = parts.slice(index).reduce((sum, part) => sum + part, 0)
            commit({ ...latest, cubCash: Math.max(0, latest.cubCash + rest) })
            return
          }
          for (
            let attempt = 0;
            attempt < 4 && (!result.patch || !(result.patch.granted && result.patch.granted > 0));
            attempt += 1
          ) {
            await waitGap()
            result = await grantGameCoins(source, parts[index])
            if (result.mode !== 'server') break
          }
          if (result.mode !== 'server') {
            const latest = saveRef.current
            if (!latest) return
            const rest = parts.slice(index).reduce((sum, part) => sum + part, 0)
            commit({ ...latest, cubCash: Math.max(0, latest.cubCash + rest) })
            return
          }
          const latest = saveRef.current
          if (!result.patch || !latest || !(result.patch.granted && result.patch.granted > 0)) continue
          const cash = noteEarnedCash(result.patch.cubCash)
          commit({ ...latest, cubCash: cash })
        }
        return
      }
      const latest = saveRef.current
      if (!latest) return
      commit({ ...latest, cubCash: Math.max(0, latest.cubCash + gain) })
    }).catch(() => undefined)
  }, [commit])

  const purchaseTrait = useCallback(async (age: CharacterAge, category: TraitCategory, name: string) => {
    const current = saveRef.current
    if (!current) return { ok: false as const, reason: 'missing' as const }
    if (isTraitUnlocked(current, age, category, name)) {
      return { ok: true as const, alreadyOwned: true as const }
    }
    const price = traitPrice(age, category, name)
    if (price === null) {
      return { ok: true as const, alreadyOwned: true as const }
    }
    if (await walletActive()) {
      const result = await purchaseTraitOnServer(age, category, name)
      if (result.mode === 'local') {
        // Fall through to the device purchase until the account database is installed.
      } else {
        const latest = saveRef.current
        if (!latest || !result.ok) {
          return { ok: false as const, reason: result.mode === 'server' && !result.ok ? result.reason : 'missing' }
        }
        const xp = result.patch.xpGained ?? 0
        if (xp === 0) return { ok: true as const, alreadyOwned: true as const }
        noteLockedCash(result.patch.cubCash)
        const rewarded = applyReward(latest, xp, {})
        commit(applyWallet(rewarded, result.patch))
        noteLevel()
        return { ok: true as const, alreadyOwned: false as const, xp }
      }
    }
    if (current.cubCash < price) {
      return { ok: false as const, reason: 'broke' as const }
    }
    const key = traitKey(age, category, name)
    const xp = traitXpBonus(price)
    const rewarded = applyReward(current, xp, {})
    commit({
      ...rewarded,
      cubCash: rewarded.cubCash - price,
      unlockedTraits: [...new Set([...current.unlockedTraits, key])],
    })
    noteLevel()
    return { ok: true as const, alreadyOwned: false as const, xp }
  }, [commit, noteLevel])

  const reward = useCallback(
    (baseXp: number, needs: Partial<Record<NeedKey, number>>, options?: { flat?: boolean }) => {
      const current = saveRef.current
      if (!current) return { xpGained: 0 }
      const scaled = options?.flat ? baseXp : baseXp * rewardMultiplier(levelFromXp(current.xp))
      const xpGained = options?.flat ? Math.max(0, scaled) : Math.max(0, Math.round(scaled))
      const next = applyReward(current, xpGained, needs)
      commit(next)
      noteLevel()
      return { xpGained }
    },
    [commit, noteLevel],
  )

  useEffect(() => {
    if (!supabase) return
    let activeId: string | null = null
    const applySession = (user: Parameters<typeof usernameFromUser>[0] & { id?: string } | null | undefined) => {
      const userId = user?.id ?? null
      activeId = userId
      setAccountName(usernameFromUser(user))
      setAccountEth(ethFromUser(user))
      if (!userId) {
        setUsernameChangedAt(null)
        return
      }
      void loadDisplayedUsername(userId).then((name) => {
        if (activeId === userId && name) setAccountName(name)
      })
      void loadUsernameChangedAt(userId).then((changedAt) => {
        if (activeId === userId) setUsernameChangedAt(changedAt)
      })
    }
    void supabase.auth.getSession().then(({ data }) => applySession(data.session?.user))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const error = await signInAccount(username, password)
    if (error) return error
    const local = saveRef.current
    if (!local) return null
    const remote = await reconcileCloudSave(local)
    if (remote) {
      commit(remote)
      presentedXpRef.current = remote.xp
      setPresentedXp(remote.xp)
    }
    return null
  }, [commit])

  const signUp = useCallback(async (username: string, password: string, ethAddress = '') => {
    const local = saveRef.current
    if (!local) return 'Your cub is still waking up.'
    const error = await signUpAccount(username, password, local, ethAddress)
    if (error) return error
    const adopted = takeAdoptedSave()
    if (adopted) {
      commit(adopted)
      presentedXpRef.current = adopted.xp
      setPresentedXp(adopted.xp)
    }
    return null
  }, [commit])

  const signOut = useCallback(async () => {
    tuckIn()
    await signOutAccount()
  }, [tuckIn])

  const updateAccount = useCallback(async (username: string, eth: string, password: string) => {
    const error = await updateAccountSettings(username, eth, password)
    if (error) return error
    const nextName = username.trim()
    if (nextName !== accountName) setUsernameChangedAt(new Date().toISOString())
    setAccountName(nextName)
    setAccountEth(normalizeEthAddress(eth))
    return null
  }, [accountName])

  const buyDrink = useCallback(async (drink: DrinkId) => {
    const spec = DRINKS[drink]
    const opened = saveRef.current
    if (!opened) return { ok: false as const, reason: 'missing' as const }
    if (barIsFull(opened.energy)) return { ok: false as const, reason: 'full' as const }
    if (await walletActive()) {
      // The shop checks the saved energy. Upload the bar on the phone first,
      // or a drink is refused while that bar still has room.
      await flushCloudSaveNow(saveRef.current ?? opened)
      const fresh = saveRef.current
      if (!fresh) return { ok: false as const, reason: 'missing' as const }
      if (barIsFull(fresh.energy)) return { ok: false as const, reason: 'full' as const }
      const result = await buyDrinkOnServer(drink)
      if (result.mode !== 'local') {
        const latest = saveRef.current
        if (!result.ok || !latest) {
          const reason = result.mode === 'server' && !result.ok ? result.reason : ('missing' as const)
          if (reason === 'full' && latest && !barIsFull(latest.energy)) {
            return { ok: false as const, reason: 'missing' as const }
          }
          return { ok: false as const, reason }
        }
        noteLockedCash(result.patch.cubCash)
        const energy = result.patch.energy ?? clampNeed(latest.energy + spec.energy)
        commit(applyWallet({ ...latest, energy, asleep: energy >= 100 ? false : latest.asleep }, result.patch))
        if (energy >= 100) showAsleep(false)
        return { ok: true as const }
      }
    }
    const current = saveRef.current
    if (!current) return { ok: false as const, reason: 'missing' as const }
    if (barIsFull(current.energy)) return { ok: false as const, reason: 'full' as const }
    if (current.cubCash < spec.price) return { ok: false as const, reason: 'broke' as const }
    const energy = clampNeed(current.energy + spec.energy)
    commit({ ...current, cubCash: current.cubCash - spec.price, energy, asleep: energy >= 100 ? false : current.asleep })
    if (energy >= 100) showAsleep(false)
    return { ok: true as const }
  }, [commit, showAsleep])

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
    presentedXp,
    busy,
    asleep,
    care,
    toggleSleep,
    pet,
    reward,
    recordFlightBest,
    recordMatchBest,
    recordDojoBest,
    recordArcherBest,
    recordHoopsBest,
    startDaily,
    noteDaily,
    claimDaily,
    claimDailyBonus,
    rollDailyBonus,
    setOutfits,
    addCubCash,
    purchaseTrait,
    buyDrink,
    setLevelUiVisible,
    accountName,
    accountEth,
    usernameChangedAt,
    signIn,
    signUp,
    signOut,
    updateAccount,
  }
}

export type CubController = ReturnType<typeof useCub>
