import { useEffect, useRef, useState } from 'react'
import diceIconUrl from '../assets/dice-ui.png'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import { STARTER_OUTFIT, TRAIT_CATEGORIES, tryOnFromPicks, type TraitCategory } from '../game/cubTraits'
import type { BonusTrait } from '../game/dailyTasks'
import { playPrizeWin } from '../game/diceAudio'
import { playCoin } from '../game/flightAudio'
import { previewHomeCharacter, setHomeCharacter, type CharacterAge } from '../game/homeScene'
import type { CubAppearance } from '../game/types'
import type { CubController } from '../game/useCub'
import { CubStage } from './CubStage'

type Manifest = Record<TraitCategory, Record<CharacterAge, string[]>>

const SPIN_MS = 3000

type Props = {
  cub: CubController
  appearance: CubAppearance
  homeAge: CharacterAge
  prize: BonusTrait | null
  coins: number
  onDone: () => void
}

export function traitsFromManifest(manifest: Manifest): BonusTrait[] {
  const traits: BonusTrait[] = []
  for (const age of ['young', 'old'] as const) {
    for (const category of TRAIT_CATEGORIES) {
      for (const name of manifest[category]?.[age] ?? []) {
        traits.push({ age, category, name })
      }
    }
  }
  return traits
}

export function ageCubLabel(age: CharacterAge) {
  return age === 'young' ? 'Young cub' : 'Old cub'
}

export function DailyTraitRoll({ cub, appearance, homeAge, prize, coins, onDone }: Props) {
  const [phase, setPhase] = useState<'roll' | 'trait' | 'coins'>('roll')
  const claimed = useRef(false)
  const claimBonus = cub.claimDailyBonus

  useEffect(() => {
    let alive = true
    const finish = () => {
      if (!alive || claimed.current) return
      claimed.current = true
      if (prize) {
        previewHomeCharacter(prize.age)
        setPhase('trait')
        playPrizeWin()
        claimBonus({ trait: prize, coins: 0 })
        return
      }
      setPhase('coins')
      playPrizeWin()
      playCoin()
      claimBonus({ trait: null, coins })
    }
    const timer = window.setTimeout(finish, SPIN_MS)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [claimBonus, coins, prize])

  useEffect(() => {
    return () => setHomeCharacter(homeAge)
  }, [homeAge])

  const look = prize ? { ...STARTER_OUTFIT, [prize.category]: prize.name } : STARTER_OUTFIT

  return (
    <div className={phase === 'trait' ? 'trait-roll trait-roll-trait' : 'trait-roll'} role="dialog" aria-label="Bonus dice">
      {phase === 'trait' && prize ? (
        <div className="trait-roll-cub">
          <div className="home-room">
            <CubStage appearance={appearance} pose="happy" mode="wardrobe" tryOn={tryOnFromPicks(look)} overPicture />
          </div>
        </div>
      ) : phase === 'coins' ? (
        <div className="trait-roll-coins">
          <span className="trait-roll-coin">
            <img src={coinUrl} alt="" />
          </span>
          <strong>+{coins}</strong>
        </div>
      ) : (
        <div className="trait-roll-dice" aria-hidden="true">
          <img className="dice shake" src={diceIconUrl} alt="" />
        </div>
      )}
      {phase === 'roll' ? null : (
        <div className="trait-slot" aria-live="polite">
          {phase === 'coins' ? (
            <>
              <p className="trait-slot-kicker">You won</p>
              <p className="trait-slot-age">Cub Cash</p>
              <h2 className="trait-slot-name">+{coins}</h2>
            </>
          ) : prize ? (
            <>
              <p className="trait-slot-kicker">You won</p>
              <p className="trait-slot-age">{ageCubLabel(prize.age)}</p>
              <p className="trait-slot-cat">{prize.category}</p>
              <h2 className="trait-slot-name">{prize.name}</h2>
            </>
          ) : null}
        </div>
      )}
      {phase === 'roll' ? null : (
        <button type="button" className="daily-claim trait-roll-done" onClick={onDone}>
          Done
        </button>
      )}
    </div>
  )
}
