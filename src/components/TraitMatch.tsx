import { useEffect, useRef, useState } from 'react'
import lionPawUrl from '../assets/lion-paw-clear.png'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import { PLAY_NEED_COST, moodFromScore, playEnergyCost } from '../game/progress'
import { traitSlug } from '../game/cubTraits'
import { playCoin } from '../game/flightAudio'
import { playPrideFail, resumePrideAudio, setPrideUrgency, startPrideAmbience, stopPrideAmbience } from '../game/prideAudio'
import type { NeedKey } from '../game/types'
import { RunEnergy } from './EnergyBar'
import { HomeButton, GamesButton } from './HomeButton'

type BodyTrait = { id: string; label: string }

type Card = BodyTrait & { key: string; up: boolean; matched: boolean }

/** Older cub Body traits from /traits/layers/old/body */
const BODY_LABELS = [
  'Black',
  'Brown',
  'Galaxy',
  'Grey',
  'Lizard Blue',
  'Pink',
  'Red',
  'Scratched Up',
  'Sponge',
  'Spotted Leopard',
  'Standard',
  'Tan',
  'White',
  'Zebra',
  'Zombie',
] as const

const BODY_TRAITS: BodyTrait[] = BODY_LABELS.map((label) => ({
  id: traitSlug(label),
  label,
}))

const FIXED_LAYERS = [
  { part: 'mouth', name: 'Smirk' },
  { part: 'eyes', name: 'Surprised' },
  { part: 'mane', name: 'Black' },
] as const

const MAX_PAIRS = Math.min(8, BODY_TRAITS.length)

/** XP for boards cleared. Index is the board count. No level multiplier. */
const PRIDE_BOARD_XP = [0, 1, 5, 10, 15, 20, 25, 35, 50]

function prideBoardXp(boards: number) {
  const count = Math.max(0, Math.floor(boards))
  return PRIDE_BOARD_XP[Math.min(count, PRIDE_BOARD_XP.length - 1)] ?? 0
}

/** Levels 1 and 2 pay nothing. Level 3 pays 1, then one more each board. */
function coinsForLevel(level: number) {
  return Math.max(0, Math.floor(level) - 2)
}

function coinsForBoards(boards: number) {
  const paid = coinsForLevel(boards)
  return (paid * (paid + 1)) / 2
}

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

function layerUrl(part: string, name: string) {
  return `/traits/layers/old/${part}/${traitSlug(name)}.png`
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = next[i]
    next[i] = next[j]
    next[j] = swap
  }
  return next
}

function secondsForPairs(pairs: number): number {
  return 14 + pairs * 4
}

/** Whole seconds still on the clock, matching the timer the player sees. */
function secondsLeft(endsAt: number | null, now = Date.now()) {
  if (endsAt == null) return 0
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

function deal(pairs: number): Card[] {
  const picked = shuffle(BODY_TRAITS).slice(0, pairs)
  const cards = picked.flatMap((trait) => [
    { ...trait, key: `${trait.id}-a-${Math.random()}`, up: false, matched: false },
    { ...trait, key: `${trait.id}-b-${Math.random()}`, up: false, matched: false },
  ])
  return shuffle(cards)
}

function columnsFor(count: number): number {
  if (count <= 4) return 2
  if (count <= 6) return 3
  return 4
}

function MatchBust({ body }: { body: string }) {
  return (
    <>
      <img src={layerUrl('body', body)} alt="" />
      {FIXED_LAYERS.map((layer) => (
        <img key={layer.part} src={layerUrl(layer.part, layer.name)} alt="" />
      ))}
    </>
  )
}

export function TraitMatch({ best, onBest, onDailyStart, onDaily, onReward, onCoins, onExit, onGames, energy, onShop }: Props) {
  const [pairs, setPairs] = useState(2)
  const [cards, setCards] = useState<Card[]>(() => deal(2))
  const [left, setLeft] = useState(() => secondsForPairs(2))
  const [timerStarted, setTimerStarted] = useState(false)
  const [cleared, setCleared] = useState(0)
  const [score, setScore] = useState(0)
  const [locked, setLocked] = useState(false)
  const [lowEnergy, setLowEnergy] = useState(false)
  const [summary, setSummary] = useState<{
    cleared: number
    xpGained: number
    coins: number
    reason: string
    won: boolean
    level: number
  } | null>(null)
  const [coinBurst, setCoinBurst] = useState<{ id: number; count: number } | null>(null)
  const [timePop, setTimePop] = useState<{ id: number; amount: number } | null>(null)
  const clearedRef = useRef(0)
  const scoreRef = useRef(0)
  const endsAtRef = useRef<number | null>(null)
  const bestRef = useRef(best)
  const scoredPairs = useRef(new Set<string>())
  const rewarded = useRef(false)
  const resolving = useRef(false)
  const onRewardRef = useRef(onReward)
  const onCoinsRef = useRef(onCoins)
  const onBestRef = useRef(onBest)
  const onDailyStartRef = useRef(onDailyStart)
  const onDailyRef = useRef(onDaily)
  const coinSeq = useRef(0)
  const lockTimer = useRef<number | null>(null)
  const musicStarted = useRef(false)
  const startedRef = useRef(false)
  onRewardRef.current = onReward
  onCoinsRef.current = onCoins
  onBestRef.current = onBest
  onDailyStartRef.current = onDailyStart
  onDailyRef.current = onDaily
  bestRef.current = Math.max(bestRef.current, best)

  useEffect(() => {
    return () => stopPrideAmbience()
  }, [])

  const finish = (done: number, reason: string) => {
    if (rewarded.current) return
    rewarded.current = true
    onDailyRef.current(scoreRef.current)
    if (lockTimer.current !== null) window.clearTimeout(lockTimer.current)
    setLocked(false)
    setPrideUrgency(0)
    stopPrideAmbience()
    const won = reason === 'You cleared every board.'
    const stopped = reason === 'You stopped early.'
    if (!won && !stopped) void playPrideFail()
    const coins = coinsForBoards(done)
    if (coins > 0) onCoinsRef.current(coins)
    const result = onRewardRef.current(
      prideBoardXp(done),
      {
        ...moodFromScore(scoreRef.current),
        ...PLAY_NEED_COST,
      },
    )
    setSummary({
      cleared: done,
      xpGained: result.xpGained,
      coins,
      reason,
      won,
      level: won ? done : done + 1,
    })
  }

  const retry = () => {
    if (lockTimer.current !== null) window.clearTimeout(lockTimer.current)
    rewarded.current = false
    musicStarted.current = false
    clearedRef.current = 0
    scoreRef.current = 0
    scoredPairs.current = new Set()
    resolving.current = false
    setPrideUrgency(0)
    stopPrideAmbience()
    setSummary(null)
    setPairs(2)
    setCards(deal(2))
    setLeft(secondsForPairs(2))
    setTimerStarted(false)
    setCleared(0)
    setScore(0)
    setLocked(false)
    setCoinBurst(null)
    setTimePop(null)
  }

  useEffect(() => {
    setLeft(secondsForPairs(pairs))
    setPrideUrgency(0)
  }, [pairs])

  useEffect(() => {
    if (summary || !timerStarted) {
      endsAtRef.current = null
      setPrideUrgency(0)
      return
    }
    const total = secondsForPairs(pairs)
    let ends = Date.now() + total * 1000
    endsAtRef.current = ends
    setLeft(total)
    let hiddenAt: number | null = null
    let lastTick = Date.now()
    const onClock = () => {
      const now = Date.now()
      if (document.visibilityState === 'hidden') {
        if (hiddenAt == null) hiddenAt = now
        lastTick = now
        return
      }
      if (hiddenAt != null) {
        ends += now - hiddenAt
        hiddenAt = null
        endsAtRef.current = ends
        lastTick = now
      }
      const gap = now - lastTick
      lastTick = now
      // The home-screen app freezes the clock. A frozen tick must not expire the board.
      if (gap > 1000) {
        ends += gap
        endsAtRef.current = ends
      }
      const remain = Math.max(0, (ends - now) / 1000)
      setLeft(Math.ceil(remain))
      // Climb only in the final 10 seconds of any board.
      const urgency = remain >= 10 ? 0 : 1 - remain / 10
      setPrideUrgency(urgency)
      if (remain <= 0) finish(clearedRef.current, 'Time is up.')
    }
    document.addEventListener('visibilitychange', onClock)
    const id = window.setInterval(onClock, 200)
    return () => {
      document.removeEventListener('visibilitychange', onClock)
      window.clearInterval(id)
    }
  }, [pairs, summary, timerStarted])

  useEffect(() => {
    return () => {
      if (lockTimer.current !== null) window.clearTimeout(lockTimer.current)
    }
  }, [])

  const bankPoints = (points: number) => {
    if (points <= 0) return
    const nextScore = scoreRef.current + points
    scoreRef.current = nextScore
    setScore(nextScore)
    if (nextScore > bestRef.current) {
      bestRef.current = nextScore
      onBestRef.current(nextScore)
    }
  }

  const flip = (key: string) => {
    if (summary || locked || resolving.current) return
    const open = cards.filter((item) => item.up && !item.matched).length
    const card = cards.find((item) => item.key === key)
    if (open >= 2 || !card || card.up || card.matched) return
    if (!musicStarted.current) {
      musicStarted.current = true
      void startPrideAmbience()
    } else {
      resumePrideAudio()
    }
    if (!timerStarted) {
      if (!onDailyStartRef.current()) {
        setLowEnergy(true)
        return
      }
      setLowEnergy(false)
      startedRef.current = true
      setTimerStarted(true)
    }
    setCards((current) => current.map((item) => (item.key === key ? { ...item, up: true } : item)))
  }

  useEffect(() => {
    if (summary || resolving.current) return
    const shown = cards.filter((item) => item.up && !item.matched)
    if (shown.length < 2) return
    const [first, second] = shown
    resolving.current = true
    if (first.id === second.id) {
      const pairKey = `${clearedRef.current}:${first.id}`
      if (!scoredPairs.current.has(pairKey)) {
        scoredPairs.current.add(pairKey)
        bankPoints(1)
      }
      const matched = cards.map((item) =>
        item.id === first.id ? { ...item, matched: true, up: true } : item,
      )
      setCards(matched)
      if (!matched.every((item) => item.matched)) {
        resolving.current = false
        return
      }
      const bonus = secondsLeft(endsAtRef.current)
      if (bonus > 0) {
        bankPoints(bonus)
        const popId = coinSeq.current
        coinSeq.current += 1
        setTimePop({ id: popId, amount: bonus })
      }
      const nextCleared = clearedRef.current + 1
      clearedRef.current = nextCleared
      setCleared(nextCleared)
      const earned = coinsForLevel(nextCleared)
      if (earned > 0) {
        playCoin()
        const burstId = coinSeq.current
        coinSeq.current += 1
        setCoinBurst({ id: burstId, count: earned })
      }
      setLocked(true)
      lockTimer.current = window.setTimeout(() => {
        resolving.current = false
        setLocked(false)
        if (rewarded.current) return
        if (pairs >= MAX_PAIRS) {
          finish(nextCleared, 'You cleared every board.')
          return
        }
        const nextPairs = pairs + 1
        setPairs(nextPairs)
        setCards(deal(nextPairs))
      }, 450)
      return
    }
    setLocked(true)
    lockTimer.current = window.setTimeout(() => {
      setCards((current) => current.map((item) => (item.matched ? item : { ...item, up: false })))
      resolving.current = false
      setLocked(false)
    }, 900)
  }, [cards, pairs, summary])

  const bankMatch = () => {
    if (rewarded.current) return
    rewarded.current = true
    if (lockTimer.current !== null) window.clearTimeout(lockTimer.current)
    setPrideUrgency(0)
    stopPrideAmbience()
    const score = scoreRef.current
    if (score > bestRef.current) {
      bestRef.current = score
      onBestRef.current(score)
    }
    onDailyRef.current(score)
    const coins = coinsForBoards(clearedRef.current)
    if (coins > 0) onCoinsRef.current(coins)
    onRewardRef.current(
      prideBoardXp(clearedRef.current),
      {
        ...moodFromScore(score),
        ...PLAY_NEED_COST,
      },
    )
  }
  const bankMatchRef = useRef(bankMatch)
  bankMatchRef.current = bankMatch

  useEffect(() => {
    return () => {
      if (!startedRef.current) return
      bankMatchRef.current()
    }
  }, [])

  const back = () => {
    if (summary) {
      onExit()
      return
    }
    if (startedRef.current) {
      finish(clearedRef.current, 'You stopped early.')
      return
    }
    onExit()
  }

  const toGames = () => {
    if (summary) {
      onGames()
      return
    }
    if (startedRef.current) {
      finish(clearedRef.current, 'You stopped early.')
      return
    }
    onGames()
  }

  return (
    <section className="game-screen match-screen">
      <header className="match-top">
        <div className="match-nav">
          <HomeButton className="game-home" onClick={back} />
          <GamesButton className="game-home game-games" onClick={toGames} />
        </div>
        <h1>Pride Pairs</h1>
      </header>
      <div className="match-stats" aria-label={`Score ${score}, best ${Math.max(best, score)}, timer ${summary ? 'done' : `${left}s`}`}>
        <p className="flight-score">
          <span>Score</span>
          <strong>{score}</strong>
        </p>
        <p className="flight-score">
          <span>Best</span>
          <strong>{Math.max(best, score)}</strong>
        </p>
        <p className="timer">
          {summary ? 'Done' : `${left}s`}
          {timePop ? (
            <span key={timePop.id} className="match-time-bonus" onAnimationEnd={() => setTimePop((current) => (current?.id === timePop.id ? null : current))}>
              +{timePop.amount}
            </span>
          ) : null}
        </p>
      </div>
      <p className="game-help">
        {summary
          ? summary.reason
          : lowEnergy
            ? 'Sleep or visit the shop to recover energy.'
            : `Match pairs. Time left is added when the board clears. ${cards.length} cards · ${cleared} cleared`}
      </p>
      <div className="timer-track" aria-hidden="true">
        <div
          className="timer-fill"
          style={{ width: summary ? '0%' : `${(left / secondsForPairs(pairs)) * 100}%` }}
        />
      </div>
      <div className="memory-grid" style={{ gridTemplateColumns: `repeat(${columnsFor(cards.length)}, 1fr)` }}>
        {cards.map((card) => {
          const show = card.up || card.matched
          return (
            <button
              key={card.key}
              type="button"
              className={`memory-card${show ? ' up' : ''}${card.matched ? ' matched' : ''}`}
              onClick={() => flip(card.key)}
              disabled={Boolean(summary) || card.matched || locked}
              data-trait={card.id}
              aria-label={show ? `Body ${card.label}` : 'Hidden body'}
            >
              <span className="match-bust" aria-hidden="true">
                {show ? (
                  <MatchBust body={card.label} />
                ) : (
                  <span className="trait-back" aria-hidden="true">
                    <img className="paw-mark" src={lionPawUrl} alt="" />
                  </span>
                )}
              </span>
              <span className={`trait-name${show ? '' : ' trait-name-hidden'}`}>{card.label}</span>
            </button>
          )
        })}
      </div>
      {coinBurst ? (
        <div key={coinBurst.id} className="pride-coin-layer" aria-hidden="true">
          <p className="pride-coin-tag">+{coinBurst.count}</p>
          {Array.from({ length: coinBurst.count }, (_, index) => (
            <img
              key={index}
              className="pride-coin"
              src={coinUrl}
              alt=""
              style={{
                marginLeft: (index - (coinBurst.count - 1) / 2) * 36 - 22,
                animationDelay: `${index * 70}ms`,
              }}
              onAnimationEnd={
                index === coinBurst.count - 1
                  ? () => setCoinBurst((current) => (current?.id === coinBurst.id ? null : current))
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
      {summary ? (
        <div className={`results pride-results${summary.won ? ' won' : summary.reason === 'You stopped early.' ? ' stopped' : ' lost'}`}>
          <p className="pride-results-kicker">
            {summary.won ? 'Trail complete' : summary.reason === 'You stopped early.' ? 'Trail stopped' : 'Trail ended'}
          </p>
          <p className="pride-results-boards">
            {summary.won
              ? `All ${summary.cleared} boards cleared`
              : summary.reason === 'You stopped early.'
                ? `${summary.cleared} board${summary.cleared === 1 ? '' : 's'} cleared`
                : `Failed on level ${summary.level} · ${summary.cleared} cleared`}
          </p>
          <p className="results-xp">+{summary.xpGained} XP</p>
          <p className="pride-results-coins">
            <img src={coinUrl} alt="" />+{summary.coins}
          </p>
          <RunEnergy energy={energy} onShop={onShop} cost={playEnergyCost('match')} />
          <div className="pride-results-actions">
            {!summary.won ? (
              <button type="button" className="pride-results-btn pride-results-retry" onClick={retry} disabled={energy < playEnergyCost('match')}>
                Retry
              </button>
            ) : null}
            <button type="button" className="pride-results-btn" onClick={onExit}>
              Back to cub
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
