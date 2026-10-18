import { useEffect, useState } from 'react'
import type { DailyGame } from '../game/dailyTasks'
import { LEADERBOARD_BOARDS, loadScorePlace } from '../game/leaderboard'

type Props = {
  game: DailyGame
  score: number
  onClose: () => void
  onSignUp: () => void
}

/** End of a demo run: where the score would have placed, and a nudge to make an account. */
export function DemoScorePop({ game, score, onClose, onSignUp }: Props) {
  const [place, setPlace] = useState<{ week: number; all: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const title = LEADERBOARD_BOARDS.find((board) => board.id === game)?.label ?? 'this game'

  useEffect(() => {
    let cancel = false
    void loadScorePlace(game, score).then((next) => {
      if (cancel) return
      setPlace(next)
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [game, score])

  return (
    <div className="demo-score-pop" role="dialog" aria-modal="true" aria-label="Demo score">
      <div className="demo-score-card">
        <h2>Nice run!</h2>
        <p>
          Your {score.toLocaleString('en-US')} in {title}
          {place ? ' would have placed you' : loading ? ' is being checked...' : ' was not saved.'}
        </p>
        {place ? (
          <div className="demo-score-places">
            <div>
              <span>This week</span>
              <strong>#{place.week.toLocaleString('en-US')}</strong>
            </div>
            <div>
              <span>All time</span>
              <strong>#{place.all.toLocaleString('en-US')}</strong>
            </div>
          </div>
        ) : null}
        <p>Create an account to save your scores, earn Cub Cash, and climb the leaderboards.</p>
        <button type="button" className="profile-visit" onClick={onSignUp}>
          Create account
        </button>
        <button type="button" className="demo-score-keep" onClick={onClose}>
          Keep playing
        </button>
      </div>
    </div>
  )
}
