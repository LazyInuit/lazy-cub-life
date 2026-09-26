import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  STARTER_OUTFIT,
  TRAIT_CATEGORIES,
  tryOnFromPicks,
  type TraitCategory,
} from '../game/cubTraits'
import { playDiceRattle } from '../game/diceAudio'
import type { CharacterAge } from '../game/homeScene'
import { levelProgress } from '../game/progress'
import { formatCubCash } from '../game/formatCubCash'
import { isTraitUnlocked, traitPrice } from '../game/traitShop'
import type { CubController } from '../game/useCub'
import type { OutfitTraits } from '../game/types'
import { CubStage } from './CubStage'
import { HouseIcon } from './HomeButton'
import bodyIconUrl from '../assets/body-category.png'
import bodyYoungIconUrl from '../assets/body-category-young.png'
import bodygearIconUrl from '../assets/bodygear-jersey.png'
import earringIconUrl from '../assets/earring-lion.png'
import eyesIconUrl from '../assets/eyes-surprised.png'
import headgearIconUrl from '../assets/headgear-crown.png'
import maneIconUrl from '../assets/mane-top-knot-fire.png'
import mouthIconUrl from '../assets/mouth-big-smile.png'
import diceIconUrl from '../assets/dice-ui.png'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/lazy-coin.png'

type Manifest = Record<TraitCategory, Record<CharacterAge, string[]>>
type Outfit = Record<TraitCategory, string>

type Props = {
  cub: CubController
  age: CharacterAge
  onAge: (age: CharacterAge) => void
  onBack: () => void
}

function cloneOutfit(outfit: OutfitTraits | Outfit): Outfit {
  return {
    Body: outfit.Body,
    Bodygear: outfit.Bodygear,
    Earring: outfit.Earring,
    Eyes: outfit.Eyes,
    Headgear: outfit.Headgear,
    Mane: outfit.Mane,
    Mouth: outfit.Mouth,
  }
}

function outfitsFromSave(cub: CubController): Record<CharacterAge, Outfit> {
  const saved = cub.save?.outfits
  return {
    old: cloneOutfit(saved?.old ?? STARTER_OUTFIT),
    young: cloneOutfit(saved?.young ?? STARTER_OUTFIT),
  }
}

export function WardrobeScreen({ cub, age, onAge, onBack }: Props) {
  const [category, setCategory] = useState<TraitCategory>('Body')
  const [worn, setWorn] = useState<Record<CharacterAge, Outfit>>(() => outfitsFromSave(cub))
  const [shown, setShown] = useState<Record<CharacterAge, Outfit>>(() => outfitsFromSave(cub))
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [diceShake, setDiceShake] = useState(false)
  const [diceLook, setDiceLook] = useState<Outfit | null>(null)
  const [buyHint, setBuyHint] = useState<string | null>(null)
  const traitBoxRef = useRef<HTMLDivElement>(null)
  const skipPersist = useRef(true)
  const setOutfits = cub.setOutfits

  useEffect(() => {
    if (skipPersist.current) {
      skipPersist.current = false
      return
    }
    setOutfits({
      old: cloneOutfit(worn.old),
      young: cloneOutfit(worn.young),
    })
  }, [worn, setOutfits])

  useEffect(() => {
    let alive = true
    fetch('/traits/manifest.json')
      .then((response) => response.json())
      .then((data: Manifest) => {
        if (alive) setManifest(data)
      })
      .catch(() => {
        if (alive) setManifest(null)
      })
    return () => {
      alive = false
    }
  }, [])

  useLayoutEffect(() => {
    const box = traitBoxRef.current
    if (!manifest || !box) return

    const measure = () => {
      const width = box.getBoundingClientRect().width
      if (width <= 0) return
      const probe = box.cloneNode(true) as HTMLDivElement
      probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:0;width:${width}px;min-height:0;height:auto;`
      document.body.appendChild(probe)
      const probeName = probe.querySelector('strong span') ?? probe.querySelector('strong')
      const probeGroup = probe.querySelector('.wardrobe-group')
      const probeCost = probe.querySelector('.wardrobe-cost')
      if (!probeName) {
        probe.remove()
        return
      }
      if (probeGroup) probeGroup.textContent = 'Bodygear'
      if (probeCost) probeCost.textContent = '100'
      let tallest = 0
      for (const traitCategory of TRAIT_CATEGORIES) {
        for (const traitAge of ['old', 'young'] as const) {
          for (const styleName of manifest[traitCategory]?.[traitAge] ?? []) {
            probeName.textContent = styleName
            tallest = Math.max(tallest, probe.getBoundingClientRect().height)
          }
        }
      }
      probe.remove()
      const next = `${Math.ceil(tallest * 0.8)}px`
      if (tallest > 0 && box.style.height !== next) {
        box.style.height = next
        box.style.minHeight = next
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [manifest])

  const save = cub.save
  if (!save) return null
  const progress = levelProgress(save.xp)
  const xpPct = (progress.into / Math.max(1, progress.next)) * 100
  const ringR = 36
  const ringC = 2 * Math.PI * ringR
  const styles = manifest?.[category]?.[age] ?? []
  const label = shown[age][category]
  const price = traitPrice(age, category, label)
  const cost = price ?? 0
  const owned = isTraitUnlocked(save, age, category, label)
  const isStarter = STARTER_OUTFIT[category] === label
  const isOn = isStarter || (owned && worn[age][category] === label)

  const step = (dir: number) => {
    if (styles.length === 0) return
    const current = styles.indexOf(shown[age][category])
    const next = styles[(current < 0 ? 0 : current + dir + styles.length) % styles.length]
    setBuyHint(null)
    setDiceLook(null)
    setShown((currentShown) => ({
      ...currentShown,
      [age]: { ...currentShown[age], [category]: next },
    }))
    if (isTraitUnlocked(save, age, category, next)) {
      setWorn((currentWorn) => ({
        ...currentWorn,
        [age]: { ...currentWorn[age], [category]: next },
      }))
    }
  }

  const setPower = (nextOn: boolean) => {
    if (isStarter) return
    if (!owned) return
    if (nextOn) {
      setWorn((currentWorn) => ({
        ...currentWorn,
        [age]: { ...currentWorn[age], [category]: label },
      }))
      return
    }
    // OFF returns only this category to the starter. The screen stays on this trait.
    setWorn((currentWorn) => ({
      ...currentWorn,
      [age]: { ...currentWorn[age], [category]: STARTER_OUTFIT[category] },
    }))
  }

  const buyTrait = () => {
    if (owned || price === null) return
    const result = cub.purchaseTrait(age, category, label)
    if (!result.ok) {
      setBuyHint(result.reason === 'broke' ? 'Not enough Cub Cash' : 'Could not buy')
      return
    }
    setBuyHint(null)
    setDiceLook(null)
    setWorn((currentWorn) => ({
      ...currentWorn,
      [age]: { ...currentWorn[age], [category]: label },
    }))
  }

  const flashPress = (event: { currentTarget: HTMLElement }) => {
    const button = event.currentTarget
    button.classList.remove('press-glow')
    void button.offsetWidth
    button.classList.add('press-glow')
  }

  const clearPressGlow = (event: { currentTarget: HTMLElement }) => {
    event.currentTarget.classList.remove('press-glow')
  }

  const randomize = () => {
    if (!manifest) return
    playDiceRattle()
    setDiceShake(false)
    requestAnimationFrame(() => setDiceShake(true))
    const nextOutfit = { ...STARTER_OUTFIT }
    for (const traitCategory of TRAIT_CATEGORIES) {
      const list = manifest[traitCategory]?.[age] ?? []
      if (list.length === 0) continue
      nextOutfit[traitCategory] = list[Math.floor(Math.random() * list.length)]
    }
    setDiceLook(nextOutfit)
    setBuyHint(null)
  }

  const resetOutfit = () => {
    const home = outfitsFromSave(cub)
    setShown(home)
    setDiceLook(null)
    setBuyHint(null)
  }

  return (
    <section className="home-room wardrobe-room">
      <CubStage
        appearance={save.appearance}
        pose="idle"
        mode="wardrobe"
        tryOn={tryOnFromPicks(
          diceLook ?? (owned && !isStarter && !isOn ? { ...shown[age], [category]: worn[age][category] } : shown[age]),
        )}
      />
      <div className="room-ui">
        <div className="age-switch" role="group" aria-label="Character age">
          <button type="button" className={age === 'old' ? 'on' : ''} aria-pressed={age === 'old'} onClick={() => onAge('old')}>
            Old
          </button>
          <button
            type="button"
            className={age === 'young' ? 'on' : ''}
            aria-pressed={age === 'young'}
            onClick={() => onAge('young')}
          >
            Young
          </button>
        </div>
        <div className="top-stats">
          <div className="level-badge" aria-label={`Level ${progress.level}`}>
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
          <div className="cub-cash" aria-label={`${formatCubCash(save.cubCash)} Cub Cash`}>
            <span className="cub-cash-inner">
              <img src={coinUrl} alt="" />
              <strong>{formatCubCash(save.cubCash)}</strong>
            </span>
          </div>
        </div>
        <button
          type="button"
          className="wardrobe-home"
          aria-label="Home"
          onPointerDown={flashPress}
          onAnimationEnd={clearPressGlow}
          onClick={onBack}
        >
          <span className="wood-btn">
            <HouseIcon />
          </span>
        </button>
        <button
          type="button"
          className="wardrobe-random"
          aria-label="Random outfit"
          onPointerDown={flashPress}
          onAnimationEnd={clearPressGlow}
          onClick={randomize}
        >
          <span className="wood-btn">
            <img
              className={diceShake ? 'dice shake' : 'dice'}
              src={diceIconUrl}
              alt=""
              onAnimationEnd={(event) => {
                event.stopPropagation()
                setDiceShake(false)
              }}
            />
          </span>
        </button>
        <div className="wardrobe-rail" role="tablist" aria-label="Trait categories">
          {TRAIT_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-label={item}
              aria-selected={category === item}
              className={category === item ? 'on' : ''}
              onClick={() => {
                setCategory(item)
                setBuyHint(null)
                setDiceLook(null)
              }}
            >
              <CategoryIcon category={item} age={age} />
            </button>
          ))}
        </div>
        <div className="wardrobe-bottom">
          <button
            type="button"
            className="wardrobe-reset"
            aria-label="Reset to original look"
            onPointerDown={flashPress}
            onAnimationEnd={clearPressGlow}
            onClick={resetOutfit}
          >
            Reset
          </button>
          <div className="wardrobe-pager">
            <div className="wardrobe-name">
              <button
                type="button"
                aria-label="Previous style"
                onPointerDown={flashPress}
                onAnimationEnd={clearPressGlow}
                onClick={() => step(-1)}
              >
                ‹
              </button>
              <div className="wardrobe-trait" ref={traitBoxRef}>
                <span className="wardrobe-group">{category}</span>
                <strong className="wardrobe-trait-name">
                  <span>{label}</span>
                </strong>
                <span className="wardrobe-cost" aria-label={owned ? 'Owned' : `${formatCubCash(cost)} Cub Cash`}>
                  {owned ? null : (
                    <>
                      <img src={coinUrl} alt="" />
                      <span>{formatCubCash(cost)}</span>
                    </>
                  )}
                </span>
                {!owned ? <LockIcon /> : null}
              </div>
              <button
                type="button"
                aria-label="Next style"
                onPointerDown={flashPress}
                onAnimationEnd={clearPressGlow}
                onClick={() => step(1)}
              >
                ›
              </button>
            </div>
            {owned ? (
              <div className="wardrobe-power" role="group" aria-label="Wear this style">
                <button type="button" className={isOn ? 'on' : ''} aria-pressed={isOn} onClick={() => setPower(true)}>
                  ON
                </button>
                <button type="button" className={!isOn ? 'on' : ''} aria-pressed={!isOn} onClick={() => setPower(false)}>
                  OFF
                </button>
              </div>
            ) : (
              <div className="wardrobe-buy-wrap">
                <button
                  type="button"
                  className="wardrobe-buy"
                  disabled={save.cubCash < cost}
                  onPointerDown={flashPress}
                  onAnimationEnd={clearPressGlow}
                  onClick={buyTrait}
                >
                  <img src={coinUrl} alt="" />
                  Buy · {formatCubCash(cost)}
                </button>
                {buyHint ? <span className="wardrobe-buy-hint">{buyHint}</span> : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

const oldCategoryIcons: Partial<Record<TraitCategory, { src: string; className: string }>> = {
  Body: { src: bodyIconUrl, className: 'body' },
  Mane: { src: maneIconUrl, className: 'mane' },
  Eyes: { src: eyesIconUrl, className: 'eyes' },
  Mouth: { src: mouthIconUrl, className: 'mouth' },
  Headgear: { src: headgearIconUrl, className: 'headgear' },
  Bodygear: { src: bodygearIconUrl, className: 'bodygear' },
  Earring: { src: earringIconUrl, className: 'earring' },
}

const youngCategoryIcons: Partial<Record<TraitCategory, { src: string; className: string }>> = {
  Body: { src: bodyYoungIconUrl, className: 'body-young' },
  Mane: { src: maneIconUrl, className: 'mane' },
  Eyes: { src: eyesIconUrl, className: 'eyes' },
  Mouth: { src: mouthIconUrl, className: 'mouth' },
  Headgear: { src: headgearIconUrl, className: 'headgear' },
  Bodygear: { src: bodygearIconUrl, className: 'bodygear' },
  Earring: { src: earringIconUrl, className: 'earring' },
}

function CategoryIcon({ category, age }: { category: TraitCategory; age: CharacterAge }) {
  const icon = (age === 'old' ? oldCategoryIcons : youngCategoryIcons)[category]
  if (icon) {
    return <img className={icon.className} src={icon.src} alt="" />
  }
  const common = { viewBox: '0 0 48 48', 'aria-hidden': true as const }
  if (category === 'Eyes') {
    return (
      <svg {...common}>
        <path d="M6 24s7-10 18-10 18 10 18 10-7 10-18 10S6 24 6 24z" />
        <circle cx="24" cy="24" r="5" />
      </svg>
    )
  }
  if (category === 'Headgear') {
    return (
      <svg {...common}>
        <path d="M10 26c2-10 8-14 14-14s12 4 14 14H10z" />
        <path d="M8 26h32v4H8z" />
      </svg>
    )
  }
  if (category === 'Bodygear') {
    return (
      <svg {...common}>
        <path d="M16 12l-8 6 4 4 4-3v17h16V19l4 3 4-4-8-6-6 4h-4z" />
      </svg>
    )
  }
  if (category === 'Mane') {
    return (
      <svg {...common}>
        <path d="M24 8c-8 2-12 8-12 16 4-4 8-4 12-2 4-2 8-2 12 2 0-8-4-14-12-16z" />
        <path d="M14 28c2 8 6 12 10 12s8-4 10-12c-4 2-7 2-10 0-3 2-6 2-10 0z" />
      </svg>
    )
  }
  if (category === 'Mouth') {
    return (
      <svg {...common}>
        <path d="M12 20c4 8 20 8 24 0" />
        <path d="M16 20c2 4 14 4 16 0" />
      </svg>
    )
  }
  if (category === 'Earring') {
    return (
      <svg {...common}>
        <path d="M30 8C16 10 12 22 16 32c2 6 8 8 11 4" />
        <path d="M24 16c-3 5-2 12 3 16" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="24" cy="16" r="7" />
      <path d="M12 38c2-8 6-12 12-12s10 4 12 12" />
    </svg>
  )
}

/** Wood-style padlock (option 5 look) as a clean SVG cutout — no background plate. */
function LockIcon() {
  return (
    <svg className="wardrobe-lock" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="lock-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c98448" />
          <stop offset="55%" stopColor="#8d5224" />
          <stop offset="100%" stopColor="#5c3416" />
        </linearGradient>
        <linearGradient id="lock-key" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe7a8" />
          <stop offset="100%" stopColor="#d4a017" />
        </linearGradient>
      </defs>
      <path
        d="M8 10.2V7.1a4 4 0 0 1 8 0v3.1"
        fill="none"
        stroke="#4a2a12"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M8 10.2V7.1a4 4 0 0 1 8 0v3.1"
        fill="none"
        stroke="#c98448"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <rect x="5" y="10" width="14" height="11.5" rx="2.6" fill="url(#lock-body)" stroke="#4a2a12" strokeWidth="1.15" />
      <rect x="6.3" y="11.15" width="11.4" height="1.9" rx="0.9" fill="#f0c98a" opacity="0.32" />
      <path
        d="M12 13.15c-1.15 0-2 .88-2 2 0 .74.4 1.38.98 1.72v1.5c0 .48.42.85 1.02.85s1.02-.37 1.02-.85v-1.5c.58-.34.98-.98.98-1.72 0-1.12-.85-2-2-2z"
        fill="url(#lock-key)"
        stroke="#5a3010"
        strokeWidth="0.55"
      />
    </svg>
  )
}
