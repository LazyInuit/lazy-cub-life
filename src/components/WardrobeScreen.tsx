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
import type { CubController } from '../game/useCub'
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

type Manifest = Record<TraitCategory, Record<CharacterAge, string[]>>
type Outfit = Record<TraitCategory, string>
type Flags = Record<TraitCategory, boolean>

type Props = {
  cub: CubController
  age: CharacterAge
  onAge: (age: CharacterAge) => void
  onBack: () => void
}

const blankFlags = (): Flags =>
  TRAIT_CATEGORIES.reduce((flags, category) => {
    flags[category] = true
    return flags
  }, {} as Flags)

export function WardrobeScreen({ cub, age, onAge, onBack }: Props) {
  const [category, setCategory] = useState<TraitCategory>('Eyes')
  const [worn, setWorn] = useState<Record<CharacterAge, Outfit>>({
    old: { ...STARTER_OUTFIT },
    young: { ...STARTER_OUTFIT },
  })
  const [shown, setShown] = useState<Record<CharacterAge, Outfit>>({
    old: { ...STARTER_OUTFIT },
    young: { ...STARTER_OUTFIT },
  })
  const [equipped, setEquipped] = useState<Record<CharacterAge, Flags>>({
    old: blankFlags(),
    young: blankFlags(),
  })
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [diceShake, setDiceShake] = useState(false)
  const traitBoxRef = useRef<HTMLDivElement>(null)

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
      const probeName = probe.querySelector('strong')
      const probeGroup = probe.querySelector('.wardrobe-group')
      if (!probeName) {
        probe.remove()
        return
      }
      if (probeGroup) probeGroup.textContent = 'Bodygear'
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
      const next = `${Math.ceil(tallest)}px`
      if (tallest > 0 && box.style.minHeight !== next) box.style.minHeight = next
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
  const isOn = equipped[age][category]

  const step = (dir: number) => {
    if (styles.length === 0) return
    const current = styles.indexOf(shown[age][category])
    const next = styles[(current < 0 ? 0 : current + dir + styles.length) % styles.length]
    setShown((currentShown) => ({
      ...currentShown,
      [age]: { ...currentShown[age], [category]: next },
    }))
    if (equipped[age][category]) {
      setWorn((currentWorn) => ({
        ...currentWorn,
        [age]: { ...currentWorn[age], [category]: next },
      }))
    }
  }

  const setPower = (nextOn: boolean) => {
    setEquipped((current) => ({
      ...current,
      [age]: { ...current[age], [category]: nextOn },
    }))
    setWorn((currentWorn) => ({
      ...currentWorn,
      [age]: {
        ...currentWorn[age],
        [category]: nextOn ? shown[age][category] : STARTER_OUTFIT[category],
      },
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
    const nextFlags = blankFlags()
    for (const traitCategory of TRAIT_CATEGORIES) {
      const list = manifest[traitCategory]?.[age] ?? []
      if (list.length === 0) continue
      nextOutfit[traitCategory] = list[Math.floor(Math.random() * list.length)]
      nextFlags[traitCategory] = true
    }
    setShown((current) => ({ ...current, [age]: nextOutfit }))
    setWorn((current) => ({ ...current, [age]: nextOutfit }))
    setEquipped((current) => ({ ...current, [age]: nextFlags }))
  }

  return (
    <section className="home-room wardrobe-room">
      <CubStage appearance={save.appearance} pose="idle" mode="wardrobe" tryOn={tryOnFromPicks(worn[age])} />
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
              onClick={() => setCategory(item)}
            >
              <CategoryIcon category={item} age={age} />
            </button>
          ))}
        </div>
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
              <strong>{label}</strong>
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
          <div className="wardrobe-power" role="group" aria-label="Wear this style">
            <button type="button" className={isOn ? 'on' : ''} aria-pressed={isOn} onClick={() => setPower(true)}>
              ON
            </button>
            <button type="button" className={!isOn ? 'on' : ''} aria-pressed={!isOn} onClick={() => setPower(false)}>
              OFF
            </button>
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

