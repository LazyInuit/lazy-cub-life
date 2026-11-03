import { useState, type CSSProperties } from 'react'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import {
  CHALLENGE_GAMES,
  MAX_OPEN_CHALLENGES,
  boardLabel,
  openChallengeCount,
  sendChallenge,
  STARTER_CASH,
  wagerableCash,
  WAGERS,
  type ChallengeGame,
} from '../game/challenges'
import type { DailyGame } from '../game/dailyTasks'
import { formatCubCash } from '../game/formatCubCash'
import { LEADERBOARD_BOARDS } from '../game/leaderboard'
import { SPELL_MODE_IDS, type Difficulty, type SpellMode } from '../game/solitaire/keys'
import { modeInfo } from '../game/solitaire/modes'
import type { CubController } from '../game/useCub'
import { GameThumb } from './GameThumb'
import { ModeThumb } from './solitaire/ModeThumb'

type Props = {
  cub: CubController
  opponent: string
  onClose: () => void
  onSent: () => void
}

/** Every game with a board, in leaderboard order. Spellitaire is one tile here, then its own modes. */
const GAME_TILES = LEADERBOARD_BOARDS.flatMap((item) => (item.id === 'overall' ? [] : [{ game: item.id as DailyGame, label: item.label }]))

/** Pick a game, its mode and difficulty, and a wager, then send. */
export function ChallengeCreate({ cub, opponent, onClose, onSent }: Props) {
  const [game, setGame] = useState<DailyGame | null>(null)
  const [mode, setMode] = useState<SpellMode>('classic')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [chosenWager, setWager] = useState<number>(WAGERS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const cash = cub.save?.cubCash ?? 0
  const full = openChallengeCount(cub.challenges) >= MAX_OPEN_CHALLENGES
  const lowest = WAGERS[0]
  const highest = WAGERS[WAGERS.length - 1]
  const step = WAGERS[1] - WAGERS[0]
  /** The most this player can put in: 500, or less if their earned Cub Cash (above the starting 100) is lower. */
  const spendable = wagerableCash(cash)
  const affordable = Math.min(highest, Math.floor(spendable / step) * step)
  const canWager = affordable >= lowest
  const wager = canWager ? Math.min(chosenWager, affordable) : null

  const picked: ChallengeGame | null =
    game === null
      ? null
      : (CHALLENGE_GAMES.find((item) =>
          game === 'solitaire' ? item.mode === mode && item.difficulty === difficulty : item.board === game,
        ) ?? null)

  const send = async () => {
    if (!picked || wager === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await sendChallenge(opponent, picked.board, wager)
      cub.applyServerCash(result.cubCash)
      setSent(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send the challenge.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="challenge-pop" role="presentation" onClick={busy ? undefined : sent ? onSent : onClose}>
      <div
        className="challenge-card"
        role="dialog"
        aria-modal="true"
        aria-label={`Challenge ${opponent}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="challenge-card-face">
          <button type="button" className="profile-close" onClick={sent ? onSent : onClose} aria-label="Close" disabled={busy}>
            ×
          </button>
          {sent && picked && wager !== null ? (
            <div className="challenge-sent">
              <p className="challenge-kicker">Challenge sent!</p>
              <h2>{opponent}</h2>
              <p>
                {boardLabel(picked.board)} for <strong>{formatCubCash(wager)}</strong> Cub Cash.
              </p>
              <p>
                Your wager is held safely. {opponent} has 24 hours to accept. If they don't, you get it all back.
              </p>
              <button type="button" className="challenge-main" onClick={onSent}>
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="challenge-kicker">New challenge</p>
              <h2>Challenge {opponent}</h2>

              <p className="challenge-step">1. Pick a game</p>
              <div className="challenge-games">
                {GAME_TILES.map((tile) => (
                  <button
                    key={tile.game}
                    type="button"
                    className={game === tile.game ? 'challenge-game on' : 'challenge-game'}
                    aria-pressed={game === tile.game}
                    onClick={() => setGame(tile.game)}
                  >
                    <span className="challenge-game-pic">
                      <GameThumb game={tile.game} />
                    </span>
                    <span>{tile.label}</span>
                  </button>
                ))}
              </div>

              {game === 'solitaire' ? (
                <>
                  <p className="challenge-step">Which Spellitaire game?</p>
                  <div className="challenge-modes">
                    {SPELL_MODE_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={mode === id ? 'challenge-mode on' : 'challenge-mode'}
                        aria-pressed={mode === id}
                        onClick={() => setMode(id)}
                      >
                        <ModeThumb mode={id} />
                        <span>{modeInfo(id).name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="challenge-level" role="group" aria-label="Difficulty">
                    {(['easy', 'hard'] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        className={difficulty === level ? 'on' : ''}
                        aria-pressed={difficulty === level}
                        onClick={() => setDifficulty(level)}
                      >
                        {level === 'easy' ? 'Easy' : 'Hard'}
                        <small>{modeInfo(mode).levels[level]}</small>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              <p className="challenge-step">2. Choose your wager</p>
              <div className="challenge-slider">
                <p className="challenge-slider-value">
                  <img src={coinUrl} alt="" />
                  <strong>{formatCubCash(wager ?? lowest)}</strong>
                  <span>Cub Cash</span>
                </p>
                <input
                  type="range"
                  min={lowest}
                  max={highest}
                  step={step}
                  value={wager ?? lowest}
                  disabled={!canWager}
                  aria-label="Wager in Cub Cash"
                  style={
                    {
                      '--fill': `${(((wager ?? lowest) - lowest) / (highest - lowest)) * 100}%`,
                      '--cap': `${((Math.max(affordable, lowest) - lowest) / (highest - lowest)) * 100}%`,
                    } as CSSProperties
                  }
                  onChange={(event) => setWager(Math.min(Number(event.target.value), affordable))}
                />
                <div className="challenge-slider-ends" aria-hidden="true">
                  <span>{lowest}</span>
                  <span>{highest}</span>
                </div>
              </div>
              <p className="challenge-balance">
                <img src={coinUrl} alt="" /> You can wager {formatCubCash(Math.min(spendable, highest))} of your {formatCubCash(cash)} Cub Cash
              </p>
              <p className="challenge-small">Your first {STARTER_CASH} Cub Cash always stays in your wallet. Only Cub Cash you earn can be wagered.</p>

              {picked && wager !== null ? (
                <div className="challenge-summary">
                  <p>
                    {boardLabel(picked.board)}: you and {opponent} each put in <strong>{formatCubCash(wager)}</strong>.
                  </p>
                  <p className="challenge-prize">
                    <img src={coinUrl} alt="" /> Winner takes <strong>{formatCubCash(wager * 2)}</strong>
                  </p>
                </div>
              ) : null}

              <div className="challenge-rules">
                <p className="challenge-rules-title">How it works</p>
                <ol>
                  <li>
                    Your wager is taken now and held safely. <strong>{opponent} has 24 hours to accept</strong>. If they don't,
                    you get it all back.
                  </li>
                  <li>
                    Once accepted, <strong>you both have 24 hours to play</strong>.
                  </li>
                  <li>
                    <strong>Play as many times as you like</strong>. Only your highest score counts.
                  </li>
                  <li>
                    <strong>Highest score wins both wagers</strong>. A draw gives both wagers back.
                  </li>
                </ol>
              </div>
              {!canWager ? (
                <p className="challenge-error">
                  You need at least {formatCubCash(STARTER_CASH + lowest)} Cub Cash to challenge. Earn more by playing games!
                </p>
              ) : null}
              {full ? (
                <p className="challenge-error">
                  You already have {MAX_OPEN_CHALLENGES} challenges going (sent and active). Wait for one to finish first.
                </p>
              ) : null}
              {error ? <p className="challenge-error">{error}</p> : null}
              <button type="button" className="challenge-main" disabled={!picked || wager === null || busy || full} onClick={() => void send()}>
                {busy ? 'Sending...' : 'Send challenge'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
