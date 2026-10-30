import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { showYellMouth, tryOnFromPicks } from '../game/cubTraits'
import { setVisitHalloween } from '../game/halloween'
import { getHomeCharacterAge, previewHomeCharacter, type CharacterAge } from '../game/homeScene'
import type { CubPower } from '../game/cubPower'
import { loadPlayerCubPower, type PlayerProfile } from '../game/leaderboard'
import { BADGES, earnedBadges, type BadgeId } from '../game/profileArt'
import { levelProgress } from '../game/progress'
import { playRoar } from '../game/roarAudio'
import { sanitizeOwnedOutfit } from '../game/traitShop'
import type { CubPose } from '../game/types'
import { BadgeShowcase } from './BadgeShowcase'
import { CubPowerPanel, multiplierText } from './CubPowerPanel'
import { CubStage } from './CubStage'
import { PowerPlate } from './PowerPlate'

type Props = {
  profile: PlayerProfile
  onReturn: () => void
}

const PET_MS = 700
const CABINET_SLOTS = 10
/** Nameplate text longer than this shrinks to fit. */
const PLATE_CHARS = 28

/** Another player's home: their cubs, level and name only. Nothing here changes either save. */
export function VisitHome({ profile, onReturn }: Props) {
  const room = profile.room
  const [age, setAge] = useState<CharacterAge>('old')
  const [pose, setPose] = useState<CubPose>('idle')
  const [shownBadge, setShownBadge] = useState<BadgeId | null>(null)
  const [power, setPower] = useState<CubPower | null>(null)
  const [powerOpen, setPowerOpen] = useState(false)
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

  useEffect(() => {
    let cancel = false
    void loadPlayerCubPower(profile.username).then((found) => {
      if (!cancel) setPower(found)
    })
    return () => {
      cancel = true
    }
  }, [profile.username])

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
  const badges = earnedBadges(profile.bests)
  const slots = Array.from({ length: CABINET_SLOTS }, (_, index) => badges[index] ?? null)
  const plate = `${profile.username}'s Badge Collection`
  const plateScale = Math.min(1, PLATE_CHARS / plate.length)

  return (
    <section className="home-room visit-room">
      <CubStage
        appearance={room.appearance}
        pose={pose}
        mode="visit"
        onPet={pet}
        tryOn={tryOnFromPicks(sanitizeOwnedOutfit(room, age, room.outfits[age]))}
      />
      <div className="badge-cabinet" aria-label={plate}>
        <p className="badge-cabinet-plate" style={{ '--plate-scale': plateScale } as CSSProperties}>
          {plate}
        </p>
        <ul className="badge-cabinet-slots">
          {slots.map((id, index) => (
            <li key={index}>
              {id ? (
                <button type="button" onClick={() => setShownBadge(id)} aria-label={`Show ${BADGES[id].label}`}>
                  <img src={BADGES[id].src} alt="" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
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
        {power ? (
          <PowerPlate
            className="visit-power"
            value={power.total.toLocaleString('en-US')}
            multiplier={power.streakMultiplier}
            label={`${profile.username}'s Cub Power ${power.total}, login streak ${multiplierText(power.streakMultiplier)}. Show breakdown`}
            onClick={() => setPowerOpen(true)}
          />
        ) : null}
        {powerOpen && power ? (
          <CubPowerPanel power={power} ownerName={profile.username} onClose={() => setPowerOpen(false)} />
        ) : null}
      </div>
      {shownBadge ? (
        <div className="badge-earned-pop" role="dialog" aria-modal="true" aria-label={BADGES[shownBadge].label}>
          <div className="badge-earned-card">
            <BadgeShowcase id={shownBadge} onClose={() => setShownBadge(null)} />
          </div>
        </div>
      ) : null}
    </section>
  )
}
