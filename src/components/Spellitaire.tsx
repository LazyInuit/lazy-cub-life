import { useCallback, useEffect, useRef, useState } from 'react'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import { newSeed } from '../game/cards/deck'
import { PLAY_ENERGY_COST, PLAY_NEED_COST, moodFromScore } from '../game/progress'
import { createPayOnce, type KlondikeRewards } from '../game/solitaire/klondike'
import {
  boardKey,
  COMING_SOON_MODES,
  ENGINES,
  isSpellMode,
  modeInfo,
  SPELL_MODES,
  type Difficulty,
  type SpellGame,
  type SpellitaireKey,
  type SpellMode,
} from '../game/solitaire/modes'
import { startSpellitaireBgm, stopSpellitaireBgm } from '../game/solitaire/music'
import type { PileId, TableHint } from '../game/solitaire/table'
import { SOLITAIRE_ASSETS, SOLITAIRE_LAYOUT, solitaireAsset, type SolitaireAssetName } from '../game/solitaire/theme'
import { useSolitaireLandscape } from '../game/solitaire/orientation'
import type { NeedKey } from '../game/types'
import type { RunBonus } from '../game/useCub'
import { LowEnergyNote, RunEnergy } from './EnergyBar'
import { GamesButton, HomeButton } from './HomeButton'
import { LeaderboardOpenButton } from './LeaderboardOpenButton'
import { PowerBonusNote } from './PowerBonusNote'
import { CardTable } from './solitaire/CardTable'
import { ModeRules } from './solitaire/ModeRules'
import { ModeThumb } from './solitaire/ModeThumb'
import { SpellitaireBoard } from './solitaire/SpellitaireBoard'
import { hasSolAsset, SolAsset } from './solitaire/SolAsset'

type Phase = 'start' | 'play' | 'won' | 'over'
/** The start screen: pick a mode, then a difficulty (with that mode's rules one tap away), or open the leaderboard. */
type StartStep = 'modes' | 'level' | 'rules' | 'board'

type Props = {
  /** Best score for each mode and difficulty. */
  bests: Record<SpellitaireKey, number>
  /** Best score this leaderboard week for each mode and difficulty. */
  weekBests: Record<SpellitaireKey, number>
  onBest: (score: number, key: SpellitaireKey) => void
  onDailyStart: () => boolean
  /** A game is over: its score, whether it was won, and the leaderboard key of its mode and difficulty. */
  onDaily: (score: number, game: { won: boolean; key: SpellitaireKey }) => void
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
  /** Open on this mode's Play screen at this difficulty, as a challenge does, instead of the mode tiles. */
  startMode?: SpellMode
  startDifficulty?: Difficulty
}

/** A game together with the mode whose rules it follows. */
type Table = { mode: SpellMode; game: SpellGame }

type Summary = KlondikeRewards & {
  best: number
  neuBest: boolean
  /** Such as "Flipflop Hard". */
  label: string
  /** The leaderboard key the game was scored under. */
  key: SpellitaireKey
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
const MODE_KEY = 'lazy-cub-spellitaire-mode'

function readStored(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private browsing: the choice just isn't remembered.
  }
}

/** The last difficulty chosen on this phone, Easy unless Hard was picked. */
const readDifficulty = (): Difficulty => (readStored(DIFFICULTY_KEY) === 'hard' ? 'hard' : 'easy')

/** The last mode played on this phone, Classic until another is picked. */
function readMode(): SpellMode {
  const stored = readStored(MODE_KEY)
  return isSpellMode(stored) ? stored : 'classic'
}

const levelName = (difficulty: Difficulty) => (difficulty === 'hard' ? 'Hard' : 'Easy')

function dealTable(mode: SpellMode, seed: number, difficulty: Difficulty): Table {
  return { mode, game: ENGINES[mode].deal(seed, difficulty) }
}

function DifficultyPicker({
  mode,
  value,
  onChange,
}: {
  mode: SpellMode
  value: Difficulty
  onChange: (next: Difficulty) => void
}) {
  const levels = modeInfo(mode).levels
  const option = (difficulty: Difficulty) => (
    <button
      type="button"
      className={value === difficulty ? 'sol-difficulty-option on' : 'sol-difficulty-option'}
      aria-pressed={value === difficulty}
      onClick={() => onChange(difficulty)}
    >
      <strong>{levelName(difficulty)}</strong>
      <span>{levels[difficulty]}</span>
    </button>
  )
  return (
    <div className="sol-difficulty" role="group" aria-label="Difficulty">
      {option('easy')}
      {option('hard')}
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

/** Spellitaire: a choice of solitaire modes, each with Easy and Hard. Placeholder looks for any artwork not yet added. */
export function Spellitaire({ bests, weekBests, onBest, onDailyStart, onDaily, onReward, onCoins, onExit, onGames, energy, onShop, powerBonus, seed, startMode, startDifficulty }: Props) {
  const [phase, setPhase] = useState<Phase>('start')
  const landscape = useSolitaireLandscape()
  const [step, setStep] = useState<StartStep>(startMode ? 'level' : 'modes')
  const [difficulty, setDifficulty] = useState<Difficulty>(() => startDifficulty ?? readDifficulty())
  const [table, setTable] = useState<Table>(() => dealTable(startMode ?? readMode(), seed ?? newSeed(), difficulty))
  const firstSeed = useRef<number | null>(seed ?? null)
  const [seconds, setSeconds] = useState(0)
  const [hint, setHint] = useState<TableHint | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [lowEnergy, setLowEnergy] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  /** The game ended because nothing useful could be played. */
  const [stuck, setStuck] = useState(false)
  /** A short message on the table, such as why the stock can't be dealt. */
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null)
  const toastKey = useRef(0)
  const showToast = (text: string) => {
    toastKey.current += 1
    setToast({ text, key: toastKey.current })
  }
  const tableRef = useRef(table)
  const secondsRef = useRef(0)
  const phaseRef = useRef(phase)
  const payOnce = useRef(createPayOnce())
  const bestRef = useRef<Record<SpellitaireKey, number>>({ ...bests })
  const callbacks = useRef({ onBest, onDaily, onReward, onCoins })
  tableRef.current = table
  phaseRef.current = phase
  for (const key of Object.keys(bests) as SpellitaireKey[]) {
    if (bests[key] > (bestRef.current[key] ?? 0)) bestRef.current = { ...bestRef.current, [key]: bests[key] }
  }
  callbacks.current = { onBest, onDaily, onReward, onCoins }

  const { mode, game } = table
  const engine = ENGINES[mode]
  const info = modeInfo(mode)

  const setGame = (next: SpellGame) => setTable((current) => ({ ...current, game: next }))

  /** Pays this game's rewards once: best, daily score and leaderboard, XP, and Cub Cash. */
  const finish = useCallback((played: Table, playedSeconds: number, show: boolean) => {
    const { game: state } = played
    if (state.moves === 0 && !state.won) return
    payOnce.current.pay(() => {
      const rules = ENGINES[played.mode]
      const level = rules.difficulty(state)
      const key = boardKey(played.mode, level)
      const rewards = rules.rewardsFor(state, playedSeconds)
      const neuBest = rewards.score > (bestRef.current[key] ?? 0)
      if (neuBest) {
        bestRef.current = { ...bestRef.current, [key]: rewards.score }
        callbacks.current.onBest(rewards.score, key)
      }
      callbacks.current.onDaily(rewards.score, { won: state.won, key })
      const result = callbacks.current.onReward(rewards.xp, { ...moodFromScore(rewards.score), ...PLAY_NEED_COST })
      if (rewards.coins > 0) callbacks.current.onCoins(rewards.coins)
      if (show) {
        setSummary({
          ...rewards,
          best: bestRef.current[key] ?? 0,
          neuBest,
          label: `${modeInfo(played.mode).name} ${levelName(level)}`,
          key,
          seconds: playedSeconds,
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
    if (phase !== 'play' || !started) return
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
  }, [phase, started])

  // A won game: celebrate, pay, then show the results.
  useEffect(() => {
    if (!table.game.won || phaseRef.current !== 'play') return
    setPhase('won')
    finish(table, secondsRef.current, true)
    const timer = window.setTimeout(() => setPhase('over'), CELEBRATE_MS)
    return () => window.clearTimeout(timer)
  }, [table, finish])

  // No useful move left: after a moment to see the last move, the game ends and shows the results.
  useEffect(() => {
    if (phase !== 'play' || table.game.won || ENGINES[table.mode].hasUsefulMove(table.game)) return
    const timer = window.setTimeout(() => {
      setConfirmEnd(false)
      setHint(null)
      setStuck(true)
      setPhase('over')
      finish(tableRef.current, secondsRef.current, true)
    }, STUCK_MS)
    return () => window.clearTimeout(timer)
  }, [table, phase, finish])

  // A lit hint fades after a moment.
  useEffect(() => {
    if (!hint) return
    const timer = window.setTimeout(() => setHint(null), HINT_MS)
    return () => window.clearTimeout(timer)
  }, [hint])

  // Load the win banner early so it is ready the moment a game is won.
  useEffect(() => {
    // Both backgrounds too, so turning the phone shows the other one straight away.
    for (const name of ['winBanner', 'background', 'backgroundLandscape'] as const) {
      const url = solitaireAsset(SOLITAIRE_ASSETS[name].file)
      if (url) new Image().src = url
    }
  }, [])

  // Leaving mid-game still counts the game, like the other games.
  useEffect(
    () => () => {
      stopSpellitaireBgm()
      if (phaseRef.current === 'play') finish(tableRef.current, secondsRef.current, false)
    },
    [finish],
  )

  const apply = (next: SpellGame | null) => {
    if (!next) return false
    setHint(null)
    setGame(next)
    return true
  }

  const begin = (dealSeed: number) => {
    if (!onDailyStart()) {
      setLowEnergy(true)
      setPhase((current) => (current === 'play' ? 'over' : current))
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
    setTable(dealTable(mode, dealSeed, difficulty))
    setPhase('play')
    startSpellitaireBgm()
  }

  const chooseDifficulty = (next: Difficulty) => {
    setDifficulty(next)
    writeStored(DIFFICULTY_KEY, next)
  }

  const chooseMode = (next: SpellMode) => {
    writeStored(MODE_KEY, next)
    if (next !== mode) setTable(dealTable(next, newSeed(), difficulty))
    setStep('level')
  }

  /** Back to the mode tiles from the results. */
  const chooseAnother = () => {
    setSummary(null)
    setStuck(false)
    setLowEnergy(false)
    setStep('modes')
    setPhase('start')
  }

  /** Ends the game now and shows the results, like running out of moves. */
  const endGame = () => {
    setConfirmEnd(false)
    setHint(null)
    setStuck(false)
    setPhase('over')
    finish(tableRef.current, secondsRef.current, true)
  }

  const leave = (go: () => void) => {
    stopSpellitaireBgm()
    if (phaseRef.current === 'play') finish(tableRef.current, secondsRef.current, false)
    phaseRef.current = 'start'
    go()
  }

  const showHint = () => {
    const current = tableRef.current
    const used = ENGINES[current.mode].takeHint(current.game)
    if (used.hint.kind === 'none') return
    setGame(used.state)
    setHint(used.hint)
  }

  const playing = phase === 'play'
  const score = engine.liveScore(game)
  const levelBest = bestRef.current[boardKey(mode, difficulty)] ?? 0

  // Turning the phone only swaps the picture and the layout around the same game; nothing here remounts.
  const wide = landscape && hasSolAsset('backgroundLandscape')
  const bgName = wide ? 'backgroundLandscape' : 'background'
  const bg = wide ? SOLITAIRE_LAYOUT.backgroundLandscape : SOLITAIRE_LAYOUT.background
  const art = hasSolAsset(bgName)
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

  const backHead = (title: string, onBack: () => void) => (
    <div className="sol-panel-head">
      <button type="button" className="sol-btn sol-btn-light sol-panel-back" onClick={onBack}>
        ‹ Back
      </button>
      <h2>{title}</h2>
    </div>
  )

  return (
    <section
      className={`game-screen sol-screen${art ? ' art' : ''}${landscape ? ' landscape' : ''}`}
      style={{
        ['--sol-bg-aspect' as string]: String(bg.aspect),
        ['--sol-table-top' as string]: String(bg.tableTop),
        ['--sol-value-size' as string]: String(bg.valueSize),
      }}
    >
      {art ? (
        <div className="sol-art">
          <SolAsset name={bgName} className="sol-art-img" fallback={null} />
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

      <CardTable
        key={mode}
        state={game}
        rules={engine.table}
        hint={hint}
        locked={!playing}
        onMove={(from: PileId, index: number, to: PileId) => {
          const current = tableRef.current
          return apply(ENGINES[current.mode].move(current.game, from, index, to))
        }}
        onDraw={() => {
          const current = tableRef.current
          const rules = ENGINES[current.mode]
          if (apply(rules.draw(current.game))) return
          const why = rules.drawBlocked?.(current.game)
          if (why) showToast(why)
        }}
        onNotice={showToast}
      />

      {toast ? (
        <div key={toast.key} className="sol-toast" role="status" onAnimationEnd={() => setToast(null)}>
          {toast.text}
        </div>
      ) : null}

      <nav className="sol-controls" aria-label="Spellitaire controls">
        <ControlButton icon="iconEnd" label="End Game" onClick={() => setConfirmEnd(true)} disabled={!playing} />
        <ControlButton
          icon="iconUndo"
          label="Undo"
          onClick={() => {
            const current = tableRef.current
            apply(ENGINES[current.mode].undo(current.game))
          }}
          disabled={!playing || !engine.canUndo(game)}
        />
        <ControlButton icon="iconHint" label="Hint" onClick={showHint} disabled={!playing} />
      </nav>

      {phase === 'start' ? (
        <div className="sol-overlay">
          {step === 'modes' ? (
            <div className="sol-panel">
              {backHead('Spellitaire', () => leave(onGames))}
              <LeaderboardOpenButton
                className="sol-lb-open"
                sub="Every card game • Weekly & All-Time"
                onOpen={() => setStep('board')}
              />
              <p className="sol-pick-label">Choose a game</p>
              <div className="sol-modes">
                {SPELL_MODES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={option.id === mode ? 'sol-mode last' : 'sol-mode'}
                    onClick={() => chooseMode(option.id)}
                    title={option.blurb}
                  >
                    <ModeThumb mode={option.id} />
                    <strong>{option.name}</strong>
                  </button>
                ))}
                {Array.from({ length: COMING_SOON_MODES }, (_, i) => (
                  <button key={`soon-${i}`} type="button" className="sol-mode soon" disabled>
                    <span className="sol-mode-thumb" aria-hidden="true" />
                    <strong>Coming soon</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : step === 'board' ? (
            <div className="sol-panel">
              {backHead('Leaderboard', () => setStep('modes'))}
              <SpellitaireBoard mode={mode} difficulty={difficulty} />
            </div>
          ) : step === 'level' ? (
            <div className="sol-panel">
              {backHead(info.name, () => setStep('modes'))}
              <DifficultyPicker mode={mode} value={difficulty} onChange={chooseDifficulty} />
              <p className="sol-best">
                {levelName(difficulty)} Best Score {levelBest.toLocaleString('en-US')}
              </p>
              <p className="sol-best week-best">Weekly Best {(weekBests[boardKey(mode, difficulty)] ?? 0).toLocaleString('en-US')}</p>
              {lowEnergy ? <LowEnergyNote onShop={onShop} /> : null}
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
              <button type="button" className="sol-btn sol-btn-light" onClick={() => setStep('rules')}>
                How to Play
              </button>
            </div>
          ) : (
            <div className="sol-panel sol-rules">
              {backHead(info.name, () => setStep('level'))}
              <ModeRules mode={mode} />
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

      {phase === 'won' ? (
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

      {phase === 'over' ? (
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
                  <dt>{summary.label} best</dt>
                  <dd>{summary.best.toLocaleString('en-US')}</dd>
                </div>
                <div>
                  <dt>Weekly best</dt>
                  <dd>{Math.max(weekBests[summary.key] ?? 0, summary.score).toLocaleString('en-US')}</dd>
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
            <RunEnergy energy={energy} onShop={onShop} />
            <DifficultyPicker mode={mode} value={difficulty} onChange={chooseDifficulty} />
            <button type="button" className="sol-btn" onClick={() => begin(newSeed())} disabled={energy < PLAY_ENERGY_COST}>
              Play again
            </button>
            <button type="button" className="sol-btn sol-btn-light" onClick={chooseAnother}>
              Choose another game
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
