import { useEffect, useState } from 'react'
import { loadPlayerProfile } from '../game/leaderboard'
import { BADGES, achievementLadder, type BadgeId, type GameBests } from '../game/profileArt'
import { BadgeShowcase } from './BadgeShowcase'

type Props = {
  username: string
  onClose: () => void
}

/** Every badge from Bronze to Platinum for each game, with the score still needed for the rest. */
export function AchievementsPanel({ username, onClose }: Props) {
  const [bests, setBests] = useState<GameBests | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shownBadge, setShownBadge] = useState<BadgeId | null>(null)

  useEffect(() => {
    let cancel = false
    void loadPlayerProfile(username)
      .then((profile) => {
        if (!cancel) setBests(profile.bests)
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : 'Could not load your achievements.')
      })
    return () => {
      cancel = true
    }
  }, [username])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (shownBadge) setShownBadge(null)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, shownBadge])

  const games = bests ? achievementLadder(bests) : []
  const earnedCount = games.reduce((sum, game) => sum + game.tiers.filter((tier) => tier.earned).length, 0)
  const totalCount = games.reduce((sum, game) => sum + game.tiers.length, 0)

  return (
    <div className="profile-pop" role="presentation" onClick={onClose}>
      <div
        className="profile-card achievements-card"
        role="dialog"
        aria-modal="true"
        aria-label="Achievements"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="profile-close" onClick={onClose} aria-label="Close achievements">
          ×
        </button>
        <div className="profile-card-face achievements-face">
          <h2 className="achievements-title">Achievements</h2>
          {bests ? (
            <p className="achievements-count">
              {earnedCount} of {totalCount} badges earned
            </p>
          ) : null}
          {error ? <p className="profile-error">{error}</p> : null}
          {!bests && !error ? <p className="profile-empty">Loading...</p> : null}
          {games.map((game) => (
            <section key={game.game} className="achievements-game">
              <header>
                <h3>{game.title}</h3>
                <span>Best {game.best.toLocaleString('en-US')}</span>
              </header>
              <ul>
                {game.tiers.map((tier) => {
                  const badge = BADGES[tier.badge]
                  return (
                    <li key={tier.badge} className={tier.earned ? 'earned' : 'locked'}>
                      <button
                        type="button"
                        className="achievements-badge"
                        onClick={() => setShownBadge(tier.badge)}
                        aria-label={
                          tier.earned
                            ? `${badge.label}, earned`
                            : `${badge.label}, score ${tier.at.toLocaleString('en-US')} to earn`
                        }
                      >
                        <img src={badge.src} alt="" />
                      </button>
                      <span className="achievements-tier">{badge.tier}</span>
                      <span className="achievements-need">
                        {tier.earned ? 'Earned' : `Score ${tier.at.toLocaleString('en-US')}`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
        {shownBadge ? <BadgeShowcase id={shownBadge} onClose={() => setShownBadge(null)} /> : null}
      </div>
    </div>
  )
}
