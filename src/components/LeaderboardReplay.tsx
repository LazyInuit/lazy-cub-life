import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LeaderboardGame } from '../game/leaderboard'
import { loadLeaderboardClips, type LeaderboardClip } from '../game/replay/leaderboardClips'

/**
 * The top 3's replays for one board, by username. A row shows its clip only when the row's score is the
 * clip's (so a weekly board shows it only for the same run). Null `board` means the board has none.
 */
export function useLeaderboardClips(board: LeaderboardGame | null) {
  const [clips, setClips] = useState<Map<string, LeaderboardClip>>(new Map())
  useEffect(() => {
    let cancel = false
    setClips(new Map())
    if (!board) return
    void loadLeaderboardClips(board).then((next) => {
      if (!cancel) setClips(next)
    })
    return () => {
      cancel = true
    }
  }, [board])
  return (row: { username: string; score: number; rank: number }) => {
    const clip = clips.get(row.username)
    return clip && row.rank <= 3 && clip.score === row.score ? clip : null
  }
}

/** A leaderboard replay, playing over the whole game frame. */
export function LeaderboardReplayPop({ clip, onClose }: { clip: LeaderboardClip; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pop = (
    <div className="share-pop" role="presentation" onClick={onClose}>
      <div className="share-card share-scroll" role="dialog" aria-modal="true" aria-label={`${clip.username}'s replay`} onClick={(event) => event.stopPropagation()}>
        <h2>{clip.username}</h2>
        <p className="lb-replay-score">{clip.score.toLocaleString('en-US')}</p>
        <div className="share-replay">
          <video className="share-replay-video" src={clip.url} poster={clip.poster ?? undefined} playsInline controls autoPlay preload="auto" />
        </div>
        <button type="button" className="share-btn share-btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
  const frame = document.querySelector('.phone')
  return frame ? createPortal(pop, frame) : pop
}

/** The right-hand side of a top-3 row with a replay: a red REPLAY tag over the score. */
export function ReplayScoreButton({ score, username, className, onWatch }: { score: number; username: string; className?: string; onWatch: () => void }) {
  return (
    <button type="button" className={`lb-replay-btn${className ? ` ${className}` : ''}`} aria-label={`Watch ${username}'s replay`} onClick={onWatch}>
      <span className="lb-replay-tag" aria-hidden="true">
        <span className="lb-replay-tri" />
        REPLAY
      </span>
      <span className="lb-replay-score-text">{score.toLocaleString('en-US')}</span>
    </button>
  )
}
