import { useEffect, useRef, useState } from 'react'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import { CASH_PER_COIN, GOLD_POINTS, NAV_CSS, RIVER_XP_PER_SCORE, SILVER_POINTS } from '../game/lazyRiver/constants'
import type { RiverController, RunResult } from '../game/lazyRiver'
import { startRiverBgm, stopRiverBgm } from '../game/lazyRiver/music'
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

type Summary = RunResult & {
  best: number
  neuBest: boolean
  xp: number
  cash: number
}

/** Time to see the cub stop in the water before the results panel opens. */
const OVER_PANEL_MS = 500

export function LazyRiver({ best, onBest, onDailyStart, onDaily, onReward, onCoins, onExit, onGames, energy, onShop }: Props) {
  const [mode, setMode] = useState<Mode>('start')
  const [lowEnergy, setLowEnergy] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const riverRef = useRef<RiverController | null>(null)
  const overTimer = useRef<number | null>(null)
  const modeRef = useRef(mode)
  const rewarded = useRef(true)
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
  const finish = (result: RunResult) => {
    if (rewarded.current) return
    rewarded.current = true
    const score = result.score
    const neuBest = score > bestRef.current
    if (neuBest) {
      bestRef.current = score
      onBestRef.current(score)
    }
    onDailyRef.current(score)
    const reward = onRewardRef.current(
      Math.round(score * RIVER_XP_PER_SCORE),
      { ...moodFromScore(score), ...PLAY_NEED_COST },
    )
    const cash = result.coins * CASH_PER_COIN
    if (cash > 0) onCoinsRef.current(cash)
    setSummary({ ...result, best: bestRef.current, neuBest, xp: reward.xpGained, cash })
  }
  const finishRef = useRef(finish)
  finishRef.current = finish

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let river: RiverController | null = null
    const onOver = (result: RunResult) => {
      finishRef.current(result)
      if (overTimer.current !== null) window.clearTimeout(overTimer.current)
      overTimer.current = window.setTimeout(() => {
        overTimer.current = null
        setMode('over')
      }, OVER_PANEL_MS)
    }
    // Phaser only downloads when someone opens Lazy River.
    import('../game/lazyRiver')
      .then(({ createLazyRiver }) => createLazyRiver(host, onOver))
      .then((made) => {
        if (cancelled) {
          made.destroy()
          return
        }
        riverRef.current = river = made
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      stopRiverBgm()
      // Leaving mid-run still counts the run, like the other games.
      if (modeRef.current === 'play') river?.endRun()
      if (overTimer.current !== null) window.clearTimeout(overTimer.current)
      river?.destroy()
      riverRef.current = null
    }
  }, [])

  const startRun = () => {
    const river = riverRef.current
    if (!river) return
    if (!onDailyStart()) {
      setLowEnergy(true)
      return
    }
    setLowEnergy(false)
    if (overTimer.current !== null) window.clearTimeout(overTimer.current)
    overTimer.current = null
    rewarded.current = false
    setShowRules(false)
    setSummary(null)
    setMode('play')
    startRiverBgm()
    river.play()
  }

  const leave = (go: () => void) => {
    stopRiverBgm()
    if (modeRef.current === 'play' && !rewarded.current) {
      riverRef.current?.endRun()
      if (overTimer.current !== null) window.clearTimeout(overTimer.current)
      overTimer.current = null
      setMode('over')
      return
    }
    go()
  }

  const navStyle = { left: NAV_CSS.left, top: NAV_CSS.top, gap: NAV_CSS.gap }

  return (
    <section className="game-screen river-screen">
      <div className="river-stage" ref={hostRef} />
      <div className="river-nav" style={navStyle}>
        <HomeButton className="game-home" onClick={() => leave(onExit)} />
        <GamesButton className="game-home game-games" onClick={() => leave(onGames)} />
      </div>
      {mode === 'start' ? (
        <div className="river-home">
          {!showRules ? (
            <div className="river-panel">
              <h2>Lazy River</h2>
              <p className="river-best">Best Score {bestRef.current.toLocaleString('en-US')}</p>
              {lowEnergy ? <p className="energy-note">Sleep or visit the shop to recover energy.</p> : null}
              {failed ? <p className="energy-note">The river could not load. Check your connection and try again.</p> : null}
              <button type="button" className="river-btn" onClick={startRun} disabled={failed || !ready}>
                {ready || failed ? 'Play' : 'Loading…'}
              </button>
              <button type="button" className="river-btn river-btn-light" onClick={() => setShowRules(true)}>
                Rules
              </button>
            </div>
          ) : (
            <div className="river-panel">
              <div className="river-rules-head">
                <button type="button" className="river-btn river-btn-light river-rules-back" onClick={() => setShowRules(false)}>
                  ‹ Back
                </button>
                <h2>Rules</h2>
              </div>
              <ul className="river-rules">
                <li>
                  <strong>Steer:</strong> hold anywhere and drag to move the cub left and right, and a little up and down.
                </li>
                <li>
                  <strong>Avoid:</strong> obstacles in the river. One bump ends the run.
                </li>
                <li>
                  <strong>Distance:</strong> every metre you float down the river is worth 1 point.
                </li>
                <li>
                  <strong>Water streams:</strong> streams with arrows pointing up rush you forward for extra metres.
                  Streams with arrows pointing down wash you back toward the wave and cost metres.
                </li>
                <li>
                  <strong>Rapids:</strong> churning white water slows you down and knocks you about. Steer around them if you
                  can!
                </li>
                <li>
                  <strong>Whirlpools:</strong> steer clear! Get too close and you'll be sucked under, which ends your run.
                </li>
                <li>
                  <strong>Wave:</strong> a wave chases you up the river and gains on you whenever you slow down or get washed
                  back. Don't let it catch you!
                </li>
                <li>
                  <strong>Cub Cash:</strong> each Kovu coin is worth {GOLD_POINTS} points and {CASH_PER_COIN} Cub Cash.
                </li>
                <li>
                  <strong>Silver coins:</strong> each silver paw coin is worth {SILVER_POINTS} points.
                </li>
                <li>
                  <strong>Faster:</strong> the further you float, the faster the river runs and the tighter the gaps get.
                </li>
              </ul>
            </div>
          )}
        </div>
      ) : null}
      {mode === 'over' && summary ? (
        <div className="river-home river-home-over">
          <div className="river-panel">
            <h2>Game Over</h2>
            {summary.neuBest ? <p className="river-new">New best!</p> : null}
            <dl className="river-stats">
              <div>
                <dt>Final score</dt>
                <dd>{summary.score.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Best score</dt>
                <dd>{summary.best.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Distance</dt>
                <dd>{summary.distance.toLocaleString('en-US')} m</dd>
              </div>
              <div>
                <dt>Coins collected</dt>
                <dd>{summary.collectibles}</dd>
              </div>
            </dl>
            <p className="river-gains">
              <span className="river-xp">+{summary.xp} XP</span>
              <span className="river-coins">
                <img src={coinUrl} alt="" />+{summary.cash}
              </span>
            </p>
            <RunEnergy energy={energy} onShop={onShop} />
            <button type="button" className="river-btn" onClick={startRun} disabled={energy < PLAY_ENERGY_COST}>
              Play again
            </button>
            <button type="button" className="river-btn river-btn-light" onClick={onGames}>
              Return to games
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
