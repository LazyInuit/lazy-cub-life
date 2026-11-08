import { useEffect, useRef, useState } from 'react'
import { loadSpellitaireBoard, type LeaderboardPage, type LeaderboardPeriod } from '../../game/leaderboard'
import { boardKey, SPELL_MODES, type Difficulty, type SpellitaireKey, type SpellMode } from '../../game/solitaire/modes'
import type { LeaderboardClip } from '../../game/replay/leaderboardClips'
import { LeaderboardReplayPop, ReplayScoreButton, useLeaderboardClips } from '../LeaderboardReplay'

/** How many places the board shows. */
const TOP = 10

/** One game, or every game added together. */
type BoardGame = SpellMode | 'overall'
/** One difficulty, or Easy and Hard added together. */
type BoardLevel = Difficulty | 'total'

/** The score keys a board adds up for each player. */
function boardKeys(game: BoardGame, level: BoardLevel): SpellitaireKey[] {
  const modes = game === 'overall' ? SPELL_MODES.map((info) => info.id) : [game]
  const levels: Difficulty[] = level === 'total' ? ['easy', 'hard'] : [level]
  return modes.flatMap((mode) => levels.map((difficulty) => boardKey(mode, difficulty)))
}

type Props = {
  /** The mode and difficulty shown first: the ones last played. */
  mode: SpellMode
  difficulty: Difficulty
}

/**
 * Top Spellitaire scores: one game or all of them (Overall), Easy, Hard or both (Total), this week or
 * all time.
 */
export function SpellitaireBoard({ mode: startMode, difficulty: startDifficulty }: Props) {
  const [game, setGame] = useState<BoardGame>(startMode)
  const [level, setLevel] = useState<BoardLevel>(startDifficulty)
  const [period, setPeriod] = useState<LeaderboardPeriod>('week')
  const cacheKey = `${game}:${level}:${period}`
  const pages = useRef(new Map<string, LeaderboardPage>())
  const [page, setPage] = useState<LeaderboardPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [watching, setWatching] = useState<LeaderboardClip | null>(null)
  // Only one mode at one difficulty is a single board with replays; Overall and Total add boards up.
  const clipFor = useLeaderboardClips(game !== 'overall' && level !== 'total' ? boardKey(game, level) : null)

  useEffect(() => {
    let cancel = false
    setError(null)
    setPage(pages.current.get(cacheKey) ?? null)
    loadSpellitaireBoard(boardKeys(game, level), period, TOP)
      .then((next) => {
        pages.current.set(cacheKey, next)
        if (!cancel) setPage(next)
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : 'Could not load scores.')
      })
    return () => {
      cancel = true
    }
  }, [cacheKey, game, level, period])

  const mineShown = page?.rows.some((row) => row.mine) ?? false
  const toggle = <T extends string>(value: T, current: T, label: string, set: (next: T) => void, className = '') => (
    <button
      key={value}
      type="button"
      className={`${className}${value === current ? ' on' : ''}`.trim()}
      aria-pressed={value === current}
      onClick={() => set(value)}
    >
      {label}
    </button>
  )

  return (
    <section className="sol-lb" aria-label="Spellitaire leaderboard">
      <div className="sol-lb-modes" role="group" aria-label="Game">
        {toggle<BoardGame>('overall', game, 'Overall', setGame, 'wide')}
        {SPELL_MODES.map((info) => toggle<BoardGame>(info.id, game, info.name, setGame))}
      </div>
      <div className="sol-lb-toggles">
        <div role="group" aria-label="Difficulty">
          {toggle<BoardLevel>('easy', level, 'Easy', setLevel)}
          {toggle<BoardLevel>('hard', level, 'Hard', setLevel)}
          {toggle<BoardLevel>('total', level, 'Total', setLevel)}
        </div>
        <div role="group" aria-label="Period">
          {toggle<LeaderboardPeriod>('week', period, 'This week', setPeriod)}
          {toggle<LeaderboardPeriod>('all', period, 'All time', setPeriod)}
        </div>
      </div>
      {error ? (
        <p className="sol-lb-note">{error}</p>
      ) : !page ? (
        <p className="sol-lb-note">Loading…</p>
      ) : page.rows.length === 0 ? (
        <p className="sol-lb-note">No scores yet. Be the first!</p>
      ) : (
        <ol className="sol-lb-list">
          {page.rows.map((row) => {
            const clip = clipFor(row)
            return (
              <li key={`${row.rank}-${row.username}`} className={row.mine ? 'mine' : undefined}>
                <span className="sol-lb-rank">{row.rank}</span>
                <span className="sol-lb-name">{row.username}</span>
                {clip ? (
                  <ReplayScoreButton className="sol-lb-replay" score={row.score} username={row.username} onWatch={() => setWatching(clip)} />
                ) : (
                  <span className="sol-lb-score">{row.score.toLocaleString('en-US')}</span>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {page?.mine && !mineShown ? (
        <p className="sol-lb-mine">
          You: #{page.mine.rank} · {page.mine.score.toLocaleString('en-US')}
        </p>
      ) : null}
      {watching ? <LeaderboardReplayPop clip={watching} onClose={() => setWatching(null)} /> : null}
    </section>
  )
}
