import { useEffect, useRef, useState } from 'react'
import lionPawUrl from '../assets/lion-paw-clear.png'
import { PLAY_NEED_COST, moodFromScore } from '../game/progress'
import { traitSlug } from '../game/cubTraits'
import { playPrideFail, resumePrideAudio, setPrideUrgency, startPrideAmbience, stopPrideAmbience } from '../game/prideAudio'
import type { NeedKey } from '../game/types'
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

export function TraitMatch({ best, onBest, onReward, onExit, onGames }: Props) {
  const [pairs, setPairs] = useState(2)
  const [cards, setCards] = useState<Card[]>(() => deal(2))
  const [left, setLeft] = useState(() => secondsForPairs(2))
  const [timerStarted, setTimerStarted] = useState(false)
  const [cleared, setCleared] = useState(0)
  const [score, setScore] = useState(0)
  const [locked, setLocked] = useState(false)
  const [summary, setSummary] = useState<{
    cleared: number
    xpGained: number
    reason: string
    won: boolean
    level: number
  } | null>(null)
  const clearedRef = useRef(0)
  const scoreRef = useRef(0)
  const bestRef = useRef(best)
  const scoredPairs = useRef(new Set<string>())
  const rewarded = useRef(false)
  const resolving = useRef(false)
  const onRewardRef = useRef(onReward)
  const onBestRef = useRef(onBest)
  const lockTimer = useRef<number | null>(null)
  const musicStarted = useRef(false)
  onRewardRef.current = onReward
  onBestRef.current = onBest
  bestRef.current = Math.max(bestRef.current, best)

  useEffect(() => {
    return () => stopPrideAmbience()
  }, [])

  const finish = (done: number, reason: string) => {
    if (rewarded.current) return
    rewarded.current = true
    if (lockTimer.current !== null) window.clearTimeout(lockTimer.current)
    setLocked(false)
    setPrideUrgency(0)
    stopPrideAmbience()
    const won = reason === 'You cleared every board.'
    if (!won) void playPrideFail()
    const result = onRewardRef.current(
      prideBoardXp(done),
      {
        ...moodFromScore(scoreRef.current),
    setSummary({
      cleared: done,
      xpGained: result.xpGained,
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
  }

  useEffect(() => {
    setLeft(secondsForPairs(pairs))
    setTimerStarted(false)
    setPrideUrgency(0)
  }, [pairs])

  useEffect(() => {
    if (summary || !timerStarted) {
      setPrideUrgency(0)
      return
    }
    const total = secondsForPairs(pairs)
    const ends = Date.now() + total * 1000
    setLeft(total)
    const id = window.setInterval(() => {
      const remain = Math.max(0, (ends - Date.now()) / 1000)
      setLeft(Math.ceil(remain))
      // Climb only in the final 10 seconds of any board.
      const urgency = remain >= 10 ? 0 : 1 - remain / 10
      setPrideUrgency(urgency)
      if (remain <= 0) finish(clearedRef.current, 'Time is up.')
    }, 200)
    return () => window.clearInterval(id)
  }, [pairs, summary, timerStarted])

  useEffect(() => {
    return () => {
      if (lockTimer.current !== null) window.clearTimeout(lockTimer.current)
    }
  }, [])

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
    if (!timerStarted) setTimerStarted(true)
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
        const nextScore = scoreRef.current + 1
        scoreRef.current = nextScore
        setScore(nextScore)
        if (nextScore > bestRef.current) {
          bestRef.current = nextScore
          onBestRef.current(nextScore)
        }
      }
      const matched = cards.map((item) =>
        item.id === first.id ? { ...item, matched: true, up: true } : item,
      )
      setCards(matched)
      if (!matched.every((item) => item.matched)) {
        resolving.current = false
        return
      }
      const nextCleared = clearedRef.current + 1
      clearedRef.current = nextCleared
      setCleared(nextCleared)
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

  const back = () => {
    if (summary) {
      onExit()
      return
    }
    if (clearedRef.current > 0) {
      finish(clearedRef.current, 'Round stopped.')
      return
    }
    if (!rewarded.current) {
      rewarded.current = true
      onRewardRef.current(0, { happiness: 10, ...PLAY_NEED_COST })
    }
    onExit()
  }
      onRewardRef.current(0, { ...moodFromScore(scoreRef.current), ...PLAY_NEED_COST }, { flat: true })
    }
    onExit()
  }

  const toGames = () => {
    if (summary) {
      onGames()
      return
    }
    if (clearedRef.current > 0) {
      if (!rewarded.current) {
        rewarded.current = true
        if (lockTimer.current !== null) window.clearTimeout(lockTimer.current)
        setPrideUrgency(0)
        stopPrideAmbience()
        void playPrideFail()
        onRewardRef.current(
          prideBoardXp(clearedRef.current),
          {
            ...moodFromScore(scoreRef.current),
            ...PLAY_NEED_COST,
          },
          { flat: true },
        )
      }
      onGames()
      return
    }
    if (!rewarded.current) {
      rewarded.current = true
      onRewardRef.current(0, { ...moodFromScore(scoreRef.current), ...PLAY_NEED_COST }, { flat: true })
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
        <p className="timer">{summary ? 'Done' : `${left}s`}</p>
      </div>
      <p className="game-help">
        {summary
          ? summary.reason
          : `Find matching cubs. ${cards.length} cards · ${cleared} board${cleared === 1 ? '' : 's'} cleared`}
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
      {summary ? (
        <div className={`results pride-results${summary.won ? ' won' : ' lost'}`}>
          <p className="pride-results-kicker">{summary.won ? 'Trail complete' : 'Trail ended'}</p>
          <p className="pride-results-boards">
            {summary.won
              ? `All ${summary.cleared} boards cleared`
              : `Failed on level ${summary.level} · ${summary.cleared} cleared`}
          </p>
          <p className="results-xp">+{summary.xpGained} XP</p>
          <div className="pride-results-actions">
            {!summary.won ? (
              <button type="button" className="pride-results-btn pride-results-retry" onClick={retry}>
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
