import { useEffect, useRef, useState } from 'react'
import { showYellMouth, tryOnFromPicks } from '../game/cubTraits'
import { setVisitHalloween } from '../game/halloween'
import { getHomeCharacterAge, previewHomeCharacter, type CharacterAge } from '../game/homeScene'
import type { PlayerProfile } from '../game/leaderboard'
import { levelProgress } from '../game/progress'
import { playRoar } from '../game/roarAudio'
import { sanitizeOwnedOutfit } from '../game/traitShop'
import type { CubPose } from '../game/types'
import { CubStage } from './CubStage'

type Props = {
  profile: PlayerProfile
  onReturn: () => void
}

const PET_MS = 700

/** Another player's home: their cubs, level and name only. Nothing here changes either save. */
export function VisitHome({ profile, onReturn }: Props) {
  const room = profile.room
  const [age, setAge] = useState<CharacterAge>('old')
  const [pose, setPose] = useState<CubPose>('idle')
  const petTimer = useRef<number | null>(null)

  useEffect(() => {
    const ownAge = getHomeCharacterAge()
    // Visits always show the plain room, with no seasonal theme.
    setVisitHalloween(false)
    return () => {
      if (petTimer.current !== null) window.clearTimeout(petTimer.current)
      setVisitHalloween(null)
      previewHomeCharacter(ownAge)
    }
  }, [])

  useEffect(() => {
    previewHomeCharacter(age)
  }, [age])

  const pet = () => {
    if (petTimer.current !== null) return
    playRoar()
    showYellMouth(PET_MS)
    setPose('react')
    petTimer.current = window.setTimeout(() => {
      petTimer.current = null
      setPose('idle')
    }, PET_MS)
  }

  const progress = levelProgress(profile.xp)
  const xpPct = (progress.into / Math.max(1, progress.next)) * 100
  const ringR = 36
  const ringC = 2 * Math.PI * ringR

  return (
    <section className="home-room visit-room">
      <CubStage
        appearance={room.appearance}
        pose={pose}
        mode="visit"
        onPet={pet}
        tryOn={tryOnFromPicks(sanitizeOwnedOutfit(room, age, room.outfits[age]))}
      />
      <div className="room-ui">
        <button type="button" className="visit-return" onClick={onReturn} aria-label="Return to the leaderboard">
          <span className="wood-btn">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14.5 6 8.5 12l6 6" />
            </svg>
          </span>
          <span className="visit-return-label">Return</span>
        </button>
        <div className="visit-name" aria-label={`Visiting ${profile.username}`}>
          <span className="visit-name-kicker">Visiting</span>
          <strong>{profile.username}</strong>
        </div>
        <div className="age-switch" role="group" aria-label="Character age">
          <button type="button" className={age === 'young' ? 'on' : ''} aria-pressed={age === 'young'} onClick={() => setAge('young')}>
            Young
          </button>
          <button type="button" className={age === 'old' ? 'on' : ''} aria-pressed={age === 'old'} onClick={() => setAge('old')}>
            Old
          </button>
        </div>
        <div
          className="level-badge visit-level"
          aria-label={`Level ${progress.level}, ${progress.into} of ${progress.next} experience`}
        >
          <svg className="xp-ring" viewBox="0 0 84 84" aria-hidden="true">
            <circle className="xp-ring-track" cx="42" cy="42" r={ringR} />
            {xpPct > 0 ? (
              <circle
                className="xp-ring-fill"
                cx="42"
                cy="42"
                r={ringR}
                strokeDasharray={`${(xpPct / 100) * ringC} ${ringC}`}
              />
            ) : null}
          </svg>
          <span className="lvl-face">
            <span className="lvl-kicker">LVL</span>
            <strong>{progress.level}</strong>
          </span>
        </div>
      </div>
    </section>
  )
}
