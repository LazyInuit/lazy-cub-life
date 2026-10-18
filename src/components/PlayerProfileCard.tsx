import { useEffect, useState } from 'react'
import { loadPlayerProfile, type PlayerProfile } from '../game/leaderboard'
import { BADGES, PROFILE_PICTURES, profileLookFor, type BadgeId } from '../game/profileArt'
import { levelFromXp } from '../game/progress'
import { BadgeShowcase } from './BadgeShowcase'

type Props = {
  username: string
  mine: boolean
  onClose: () => void
  /** Leave out to hide the Visit button. Your own card never shows it. */
  onVisit?: (profile: PlayerProfile) => void
}

export function PlayerProfileCard({ username, mine, onClose, onVisit }: Props) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shownBadge, setShownBadge] = useState<BadgeId | null>(null)
  const look = profileLookFor(profile?.bests ?? {})
  const picture = PROFILE_PICTURES[look.picture]

  useEffect(() => {
    let cancel = false
    setProfile(null)
    setError(null)
    void loadPlayerProfile(username)
      .then((next) => {
        if (!cancel) setProfile(next)
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : 'Could not load this player.')
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

  const name = profile?.username ?? username
  const waiting = !profile && !error

  return (
    <div className="profile-pop" role="presentation" onClick={onClose}>
      <div
        className="profile-card"
        role="dialog"
        aria-modal="true"
        aria-label={`${name} profile`}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="profile-close" onClick={onClose} aria-label="Close profile">
          ×
        </button>
        <div className="profile-card-face">
          <div className="profile-picture">
            <img src={picture.src} alt={picture.label} />
          </div>
          <div className="profile-name-line">
            <h2>{name}</h2>
            {mine ? <span className="leaderboard-you">You</span> : null}
          </div>
          <div className="profile-stats">
            <div className="profile-stat">
              <span className="profile-stat-label">Level</span>
              <strong>{profile ? levelFromXp(profile.xp) : waiting ? '…' : '—'}</strong>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-label">All-time best overall</span>
              <strong>{profile ? profile.overall.toLocaleString('en-US') : waiting ? '…' : '—'}</strong>
              {profile?.rank ? <span className="profile-rank">#{profile.rank} all time</span> : null}
            </div>
          </div>
          {error ? <p className="profile-error">{error}</p> : null}
          <div className="profile-badges">
            <span className="profile-section-label">Badges</span>
            {waiting ? (
              <p className="profile-empty">Loading...</p>
            ) : look.badges.length > 0 ? (
              <ul>
                {look.badges.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      className="profile-badge-btn"
                      onClick={() => setShownBadge(id)}
                      aria-label={`Show ${BADGES[id].label}`}
                    >
                      <img src={BADGES[id].src} alt="" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="profile-empty">No badges yet</p>
            )}
          </div>
          {!mine && onVisit ? (
            <button
              type="button"
              className="profile-visit"
              disabled={!profile}
              onClick={() => {
                if (profile) onVisit(profile)
              }}
            >
              {waiting ? 'Loading...' : 'Visit'}
            </button>
          ) : null}
        </div>
        {shownBadge ? <BadgeShowcase id={shownBadge} onClose={() => setShownBadge(null)} /> : null}
      </div>
    </div>
  )
}
