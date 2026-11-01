import { useCallback, useEffect, useRef, useState } from 'react'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import { newSeed } from '../game/cards/deck'
import { PLAY_ENERGY_COST, PLAY_NEED_COST, moodFromScore } from '../game/progress'
import {
  canUndo,
  createPayOnce,
  deal,
  draw,
  hasUsefulMove,
  liveScore,
  move,
  rewardsFor,
  undo,
  takeHint,
  type DrawCount,
  type Hint,
  type KlondikeRewards,
  type KlondikeState,
  type PileId,
} from '../game/solitaire/klondike'
import { startSpellitaireBgm, stopSpellitaireBgm } from '../game/solitaire/music'
import { KLONDIKE_SCORING, SOLITAIRE_REWARDS } from '../game/solitaire/scoring'
import { SOLITAIRE_ASSETS, SOLITAIRE_LAYOUT, solitaireAsset, type SolitaireAssetName } from '../game/solitaire/theme'
import type { NeedKey } from '../game/types'
import type { RunBonus } from '../game/useCub'
import { RunEnergy } from './EnergyBar'
import { GamesButton, HomeButton } from './HomeButton'
import { PowerBonusNote } from './PowerBonusNote'
import { KlondikeBoard } from './solitaire/KlondikeBoard'
import { hasSolAsset, SolAsset } from './solitaire/SolAsset'

type Mode = 'start' | 'play' | 'won' | 'over'

type Props = {
  /** Best scores kept apart for each difficulty. */
  bests: { easy: number; hard: number }
  onBest: (score: number, hard: boolean) => void
  onDailyStart: () => boolean
  /** A game is over: its score, whether it was won, and whether it was played on Hard. */
  onDaily: (score: number, game: { won: boolean; hard: boolean }) => void
  onReward: (baseXp: number, needs: Partial<Record<NeedKey, number>>) => { xpGained: number }
  onCoins: (amount: number) => void
  onExit: () => void
  onGames: () => void
  energy: number
  onShop: () => void
  /** Cub Power bonus added to this game. */
  powerBonus?: RunBonus
  /** Deal this exact game first (for a shared daily deal or testing). Later games are random. */
  seed?: number
}

type Summary = KlondikeRewards & {
  best: number
  neuBest: boolean
  hard: boolean
  seconds: number
  moves: number
  hints: number
  undos: number
  xpGained: number
}

/** How long the win celebration plays before the results. */
const CELEBRATE_MS = 2200
/** How long a hint stays lit. */
const HINT_MS = 2600
/** Pause after the last possible move before saying there are no more moves. */
const STUCK_MS = 900
function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const DIFFICULTY_KEY = 'lazy-cub-spellitaire-difficulty'

/** The last difficulty chosen on this phone: Easy (draw 1) unless Hard (draw 3) was picked. */
function readDifficulty(): DrawCount {
  try {
    return window.localStorage.getItem(DIFFICULTY_KEY) === 'hard' ? 3 : 1
  } catch {
    return 1
  }
}

function writeDifficulty(drawCount: DrawCount) {
  try {
    window.localStorage.setItem(DIFFICULTY_KEY, drawCount === 3 ? 'hard' : 'easy')
  } catch {
    // Private browsing: the choice just isn't remembered.
  }
}

function DifficultyPicker({ value, onChange }: { value: DrawCount; onChange: (next: DrawCount) => void }) {
  const option = (drawCount: DrawCount, label: string, detail: string) => (
    <button
      type="button"
      className={value === drawCount ? 'sol-difficulty-option on' : 'sol-difficulty-option'}
      aria-pressed={value === drawCount}
      onClick={() => onChange(drawCount)}
    >
      <strong>{label}</strong>
      <span>{detail}</span>
    </button>
  )
  return (
    <div className="sol-difficulty" role="group" aria-label="Difficulty">
      {option(1, 'Easy', 'Draw 1')}
      {option(3, 'Hard', 'Draw 3')}
    </div>
  )
}

function ControlButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: SolitaireAssetName
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button type="button" className="sol-control" onClick={onClick} disabled={disabled}>
      <SolAsset name="button" className="sol-control-bg" fallback={null} />
      <SolAsset name={icon} className="sol-control-icon" fallback={<span className={`sol-control-ph ${icon}`} aria-hidden="true" />} />
      <span className="sol-control-label">{label}</span>
    </button>
  )
}

/** Spellitaire: Klondike, draw 1. Placeholder looks for any artwork not yet added. */
export function Spellitaire({ bests, onBest, onDailyStart, onDaily, onReward, onCoins, onExit, onGames, energy, onShop, powerBonus, seed }: Props) {
  const [mode, setMode] = useState<Mode>('start')
  const [drawCount, setDrawCount] = useState<DrawCount>(readDifficulty)
  const [game, setGame] = useState<KlondikeState>(() => deal(seed ?? newSeed(), drawCount))
  const firstSeed = useRef<number | null>(seed ?? null)
  const [seconds, setSeconds] = useState(0)
  const [hint, setHint] = useState<Hint | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [lowEnergy, setLowEnergy] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  /** The game ended because nothing useful could be played. */
  const [stuck, setStuck] = useState(false)
  const gameRef = useRef(game)
  const secondsRef = useRef(0)
  const modeRef = useRef(mode)
  const payOnce = useRef(createPayOnce())
  const bestRef = useRef<Record<DrawCount, number>>({ 1: bests.easy, 3: bests.hard })
  const callbacks = useRef({ onBest, onDaily, onReward, onCoins })
  gameRef.current = game
  modeRef.current = mode
  bestRef.current = { 1: Math.max(bestRef.current[1], bests.easy), 3: Math.max(bestRef.current[3], bests.hard) }
  callbacks.current = { onBest, onDaily, onReward, onCoins }

  /** Pays this game's rewards once: best, daily score and leaderboard, XP, and Cub Cash for a win. */
  const finish = useCallback((state: KlondikeState, played: number, show: boolean) => {
    if (state.moves === 0 && !state.won) return
    payOnce.current.pay(() => {
      const rewards = rewardsFor(state, played)
      const neuBest = rewards.score > bestRef.current[state.drawCount]
      if (neuBest) {
        bestRef.current = { ...bestRef.current, [state.drawCount]: rewards.score }
        callbacks.current.onBest(rewards.score, state.drawCount === 3)
      }
      callbacks.current.onDaily(rewards.score, { won: state.won, hard: state.drawCount === 3 })
      const result = callbacks.current.onReward(rewards.xp, { ...moodFromScore(rewards.score), ...PLAY_NEED_COST })
      if (rewards.coins > 0) callbacks.current.onCoins(rewards.coins)
      if (show) {
        setSummary({
          ...rewards,
          best: bestRef.current[state.drawCount],
          neuBest,
          hard: state.drawCount === 3,
          seconds: played,
          moves: state.moves,
          hints: state.hints,
          undos: state.undos,
          xpGained: result.xpGained,
        })
      }
    })
  }, [])

  const started = game.moves > 0

  // The clock runs from the first move until the game ends, and pauses while the page is hidden.
  useEffect(() => {
    if (mode !== 'play' || !started) return
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      if (document.visibilityState === 'visible') {
        secondsRef.current += (now - last) / 1000
        setSeconds(secondsRef.current)
      }
      last = now
    }
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [mode, started])

  // A won game: celebrate, pay, then show the results.
  useEffect(() => {
    if (!game.won || modeRef.current !== 'play') return
    setMode('won')
    finish(game, secondsRef.current, true)
    const timer = window.setTimeout(() => setMode('over'), CELEBRATE_MS)
    return () => window.clearTimeout(timer)
  }, [game, finish])

  // No useful move left: after a moment to see the last move, the game ends and shows the results.
  useEffect(() => {
    if (mode !== 'play' || game.won || hasUsefulMove(game)) return
    const timer = window.setTimeout(() => {
      setConfirmEnd(false)
      setHint(null)
      setStuck(true)
      setMode('over')
      finish(gameRef.current, secondsRef.current, true)
    }, STUCK_MS)
    return () => window.clearTimeout(timer)
  }, [game, mode, finish])

  // A lit hint fades after a moment.
  useEffect(() => {
    if (!hint) return
    const timer = window.setTimeout(() => setHint(null), HINT_MS)
    return () => window.clearTimeout(timer)
  }, [hint])

  // Load the win banner early so it is ready the moment a game is won.
  useEffect(() => {
    const url = solitaireAsset(SOLITAIRE_ASSETS.winBanner.file)
    if (url) new Image().src = url
  }, [])

  // Leaving mid-game still counts the game, like the other games.
  useEffect(
    () => () => {
      stopSpellitaireBgm()
      if (modeRef.current === 'play') finish(gameRef.current, secondsRef.current, false)
    },
    [finish],
  )

  const apply = (next: KlondikeState | null) => {
    if (!next) return false
    setHint(null)
    setGame(next)
    return true
  }

  const begin = (seed: number) => {
    if (!onDailyStart()) {
      setLowEnergy(true)
      setMode((current) => (current === 'play' ? 'over' : current))
      return
    }
    setLowEnergy(false)
    payOnce.current = createPayOnce()
    secondsRef.current = 0
    setSeconds(0)
    setHint(null)
    setConfirmEnd(false)
    setSummary(null)
    setStuck(false)
    setShowRules(false)
    setGame(deal(seed, drawCount))
    setMode('play')
    startSpellitaireBgm()
  }

  const chooseDifficulty = (next: DrawCount) => {
    setDrawCount(next)
    writeDifficulty(next)
  }

  /** Ends the game now and shows the results, like running out of moves. */
  const endGame = () => {
    setConfirmEnd(false)
    setHint(null)
    setStuck(false)
    setMode('over')
    finish(gameRef.current, secondsRef.current, true)
  }

  const leave = (go: () => void) => {
    stopSpellitaireBgm()
    if (modeRef.current === 'play') finish(gameRef.current, secondsRef.current, false)
    modeRef.current = 'start'
    go()
  }

  const showHint = () => {
    const used = takeHint(gameRef.current)
    if (used.hint.kind === 'none') return
    setGame(used.state)
    setHint(used.hint)
  }

  const playing = mode === 'play'
  const score = liveScore(game)

  const bg = SOLITAIRE_LAYOUT.background
  const art = hasSolAsset('background')
  const barStats = art && bg.hasScoreBar
  const artValue = (at: { x: number; y: number }, value: string, label: string) => (
    <span
      className="sol-art-value"
      style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
      aria-label={`${label} ${value}`}
    >
      {value}
    </span>
  )

  return (
    <section
      className={art ? 'game-screen sol-screen art' : 'game-screen sol-screen'}
      style={{
        ['--sol-bg-aspect' as string]: String(bg.aspect),
        ['--sol-table-top' as string]: String(bg.tableTop),
        ['--sol-value-size' as string]: String(bg.valueSize),
      }}
    >
      {art ? (
        <div className="sol-art">
          <SolAsset name="background" className="sol-art-img" fallback={null} />
          {barStats ? (
            <>
              {artValue(bg.scoreAt, score.toLocaleString('en-US'), 'Score')}
              {artValue(bg.timeAt, clock(seconds), 'Time')}
              {artValue(bg.movesAt, String(game.moves), 'Moves')}
            </>
          ) : null}
        </div>
      ) : (
        <span className="sol-bg-ph" />
      )}
      <header className="sol-top">
        <div className="sol-nav">
          <HomeButton className="game-home" onClick={() => leave(onExit)} />
          <GamesButton className="game-home game-games" onClick={() => leave(onGames)} />
        </div>
        <div className={barStats ? 'sol-stats hidden' : 'sol-stats'}>
          <div className="sol-stat">
            <SolAsset name="panelScore" className="sol-stat-bg" fallback={null} />
            <span className="sol-stat-label">Score</span>
            <strong>{score.toLocaleString('en-US')}</strong>
          </div>
          <div className="sol-stat">
            <SolAsset name="panelTimer" className="sol-stat-bg" fallback={null} />
            <span className="sol-stat-label">Time</span>
            <strong>{clock(seconds)}</strong>
          </div>
          <div className="sol-stat">
            <SolAsset name="panelMoves" className="sol-stat-bg" fallback={null} />
            <span className="sol-stat-label">Moves</span>
            <strong>{game.moves}</strong>
          </div>
        </div>
      </header>

      <KlondikeBoard
        state={game}
        hint={hint}
        locked={!playing}
        onMove={(from: PileId, index: number, to: PileId) => apply(move(gameRef.current, from, index, to))}
        onDraw={() => {
          apply(draw(gameRef.current))
        }}
      />

      <nav className="sol-controls" aria-label="Spellitaire controls">
        <ControlButton icon="iconEnd" label="End Game" onClick={() => setConfirmEnd(true)} disabled={!playing} />
        <ControlButton
          icon="iconUndo"
          label="Undo"
          onClick={() => apply(undo(gameRef.current))}
          disabled={!playing || !canUndo(game)}
        />
        <ControlButton icon="iconHint" label="Hint" onClick={showHint} disabled={!playing} />
      </nav>

      {mode === 'start' ? (
        <div className="sol-overlay">
          {!showRules ? (
            <div className="sol-panel">
              <div className="sol-panel-head">
                <button type="button" className="sol-btn sol-btn-light sol-panel-back" onClick={() => leave(onGames)}>
                  ‹ Back
                </button>
                <h2>Spellitaire</h2>
              </div>
              <DifficultyPicker value={drawCount} onChange={chooseDifficulty} />
              <p className="sol-best">
                {drawCount === 3 ? 'Hard' : 'Easy'} Best Score {bestRef.current[drawCount].toLocaleString('en-US')}
              </p>
              {lowEnergy ? <p className="energy-note">Sleep or visit the shop to recover energy.</p> : null}
              <button
                type="button"
                className="sol-btn"
                onClick={() => {
                  const first = firstSeed.current
                  firstSeed.current = null
                  begin(first ?? newSeed())
                }}
              >
                Play
              </button>
              <button type="button" className="sol-btn sol-btn-light" onClick={() => setShowRules(true)}>
                Rules
              </button>
            </div>
          ) : (
            <div className="sol-panel sol-rules">
              <div className="sol-panel-head">
                <button type="button" className="sol-btn sol-btn-light sol-panel-back" onClick={() => setShowRules(false)}>
                  ‹ Back
                </button>
                <h2>Rules</h2>
              </div>
              <ul>
                <li>
                  <strong>Goal:</strong> move every card onto the four foundations, from Ace up to King, one suit on each.
                </li>
                <li>
                  <strong>Columns:</strong> build down in alternating colours, like a red 9 on a black 10. Move a whole run of
                  face-up cards together. Only a King, or a run led by a King, goes into an empty column.
                </li>
                <li>
                  <strong>Stock:</strong> tap it to turn over one card at a time. When it runs out, tap again to turn the pile back
                  over and go through it again, as often as you like.
                </li>
                <li>
                  <strong>Hard:</strong> the stock turns over three cards at a time, and only the top one can be played. Play it
                  to reach the card under it.
                </li>
                <li>
                  <strong>Moving:</strong> drag cards, or tap a card then tap where it should go. Double-tap a card to send it to a
                  foundation.
                </li>
                <li>
                  <strong>Points:</strong> +{KLONDIKE_SCORING.toFoundation} for each card on a foundation, +
                  {KLONDIKE_SCORING.revealCard} for each card turned over and +{KLONDIKE_SCORING.stackCard} for each card you stack
                  in a column (once per card). Hints cost {Math.abs(KLONDIKE_SCORING.hint)} and undos {Math.abs(KLONDIKE_SCORING.undo)}.
                </li>
                <li>
                  <strong>XP:</strong> {SOLITAIRE_REWARDS.xpPerStack} for each card you stack and {SOLITAIRE_REWARDS.xpPerHome} for
                  each card you get onto a foundation, plus {SOLITAIRE_REWARDS.winXp} for a win.
                </li>
                <li>
                  <strong>Winning:</strong> finish the game for a {KLONDIKE_SCORING.winBonus.toLocaleString('en-US')} point bonus,
                  a speed bonus and {SOLITAIRE_REWARDS.winCoins} Cub Cash ({SOLITAIRE_REWARDS.hardWinCoins} on Hard). Your best
                  Easy and best Hard scores add together on the Spellitaire leaderboard.
                </li>
                <li>
                  <strong>Cub Cash:</strong> {SOLITAIRE_REWARDS.faceStackCoins} for each Queen you put on a King and each Jack you
                  put on a Queen, and {SOLITAIRE_REWARDS.aceCoins} for each Ace you put home. Each card earns its coin once, and
                  you keep these even if you don't win.
                </li>
                <li>
                  <strong>Ending:</strong> the game ends by itself when no moves are left, or tap End Game to stop. Your points
                  still count.
                </li>
              </ul>
            </div>
          )}
        </div>
      ) : null}

      {confirmEnd ? (
        <div className="sol-overlay" role="presentation" onClick={() => setConfirmEnd(false)}>
          <div className="sol-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>End this game?</h2>
            <p className="sol-note">
              {game.moves > 0
                ? `It ends now and keeps its ${score.toLocaleString('en-US')} points.`
                : 'This deal has not been played yet.'}
            </p>
            <button type="button" className="sol-btn" onClick={endGame}>
              End game
            </button>
            <button type="button" className="sol-btn sol-btn-light" onClick={() => setConfirmEnd(false)}>
              Keep playing
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'won' ? (
        <div className="sol-celebrate" aria-live="polite">
          <SolAsset
            name="winBanner"
            className="sol-win-img"
            fallback={
              <span className="sol-win-ph">
                <span className="sol-win-title">You won!</span>
              </span>
            }
          />
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className="sol-confetti" style={{ ['--i' as string]: i }}>
              <SolAsset name="sparkle" className="sol-sparkle-img" fallback={<span className="sol-sparkle-ph" />} />
            </span>
          ))}
        </div>
      ) : null}

      {mode === 'over' ? (
        <div className="sol-overlay">
          <div className="sol-panel">
            {summary?.won && hasSolAsset('winBanner') ? (
              <SolAsset name="winBanner" className="sol-result-banner" alt="You won!" fallback={<h2>You won!</h2>} />
            ) : (
              <h2>{summary?.won ? 'You won!' : stuck ? 'No more moves' : 'Game over'}</h2>
            )}
            {stuck ? <p className="sol-note">No cards can be played from this deal. Your points still count.</p> : null}
            {summary?.neuBest ? <p className="sol-new">New best!</p> : null}
            {summary ? (
              <dl className="sol-results">
                <div>
                  <dt>Final score</dt>
                  <dd>{summary.score.toLocaleString('en-US')}</dd>
                </div>
                <div>
                  <dt>{summary.hard ? 'Hard' : 'Easy'} best</dt>
                  <dd>{summary.best.toLocaleString('en-US')}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>{clock(summary.seconds)}</dd>
                </div>
                <div>
                  <dt>Moves</dt>
                  <dd>{summary.moves}</dd>
                </div>
                <div>
                  <dt>Hints / undos</dt>
                  <dd>
                    {summary.hints} / {summary.undos}
                  </dd>
                </div>
              </dl>
            ) : null}
            {summary ? (
              <p className="sol-gains">
                <span className="sol-xp">+{summary.xpGained} XP</span>
                <span className="sol-coins">
                  <img src={coinUrl} alt="" />+{summary.coins}
                </span>
              </p>
            ) : null}
            <PowerBonusNote bonus={powerBonus} />
            {lowEnergy ? <p className="energy-note">Sleep or visit the shop to recover energy.</p> : null}
            <RunEnergy energy={energy} onShop={onShop} />
            <DifficultyPicker value={drawCount} onChange={chooseDifficulty} />
            <button type="button" className="sol-btn" onClick={() => begin(newSeed())} disabled={energy < PLAY_ENERGY_COST}>
              Play again
            </button>
            <button type="button" className="sol-btn sol-btn-light" onClick={() => leave(onGames)}>
              Return to games
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
