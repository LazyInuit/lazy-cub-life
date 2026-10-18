import { useEffect, useRef, useState } from 'react'
import { loadPlayerProfile, type PlayerProfile } from '../game/leaderboard'
import { BADGES, PROFILE_PICTURES, profileLookFor, type BadgeId } from '../game/profileArt'
import { removeProfilePhoto, uploadProfilePhoto } from '../game/profilePhoto'
import { levelFromXp } from '../game/progress'
import { BadgeShowcase } from './BadgeShowcase'
import { PhotoCropper } from './PhotoCropper'

type Props = {
  username: string
  mine: boolean
  onClose: () => void
  /** Leave out to hide the Visit button. Your own card never shows it. */
  onVisit?: (profile: PlayerProfile) => void
  /** Let the player change or remove their own photo. */
  editable?: boolean
}

export function PlayerProfileCard({ username, mine, onClose, onVisit, editable = false }: Props) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shownBadge, setShownBadge] = useState<BadgeId | null>(null)
  const [reload, setReload] = useState(0)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const look = profileLookFor(profile?.bests ?? {})
  const picture = PROFILE_PICTURES[look.picture]

  useEffect(() => {
    let cancel = false
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
  }, [username, reload])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (photoFile) {
        if (!photoBusy) setPhotoFile(null)
      } else if (shownBadge) setShownBadge(null)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, shownBadge, photoFile, photoBusy])

  const name = profile?.username ?? username
  const waiting = !profile && !error

  const savePhoto = async (photo: Blob) => {
    setPhotoBusy(true)
    setPhotoError(null)
    try {
      await uploadProfilePhoto(photo)
      setPhotoFile(null)
      setReload((value) => value + 1)
    } catch (reason) {
      setPhotoError(reason instanceof Error ? reason.message : 'Could not save the photo. Try again.')
    } finally {
      setPhotoBusy(false)
    }
  }

  const clearPhoto = async () => {
    setPhotoBusy(true)
    setPhotoError(null)
    try {
      await removeProfilePhoto()
      setReload((value) => value + 1)
    } catch (reason) {
      setPhotoError(reason instanceof Error ? reason.message : 'Could not remove the photo. Try again.')
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <div className="profile-pop" role="presentation" onClick={photoFile ? undefined : onClose}>
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
            {profile?.photoUrl ? (
              <img className="profile-photo" src={profile.photoUrl} alt={`${name}'s photo`} />
            ) : (
              <img src={picture.src} alt={picture.label} />
            )}
            {editable ? (
              <button
                type="button"
                className="profile-photo-edit"
                disabled={!profile || photoBusy}
                onClick={() => fileRef.current?.click()}
                aria-label={profile?.photoUrl ? 'Change your photo' : 'Add a photo'}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 8.5h3l1.6-2.3h6.8L17 8.5h3v10H4z" />
                  <circle cx="12" cy="13.2" r="3.4" />
                </svg>
              </button>
            ) : null}
          </div>
          {editable ? (
            <input
              ref={fileRef}
              className="profile-photo-input"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                setPhotoError(null)
                setPhotoFile(file)
              }}
            />
          ) : null}
          <div className="profile-name-line">
            <h2>{name}</h2>
            {mine ? <span className="leaderboard-you">You</span> : null}
          </div>
          {editable && profile ? (
            <div className="profile-photo-links">
              <button type="button" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
                {profile.photoUrl ? 'Change photo' : 'Add a photo'}
              </button>
              {profile.photoUrl ? (
                <button type="button" disabled={photoBusy} onClick={() => void clearPhoto()}>
                  Remove photo
                </button>
              ) : null}
            </div>
          ) : null}
          {photoError && !photoFile ? <p className="profile-error">{photoError}</p> : null}
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
      {photoFile ? (
        <PhotoCropper
          file={photoFile}
          busy={photoBusy}
          error={photoError}
          onCancel={() => {
            setPhotoFile(null)
            setPhotoError(null)
          }}
          onSave={(photo) => void savePhoto(photo)}
        />
      ) : null}
    </div>
  )
}
