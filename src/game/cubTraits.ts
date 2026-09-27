import oldBody from '../assets/cub-layers/old/body.png'
import oldBodygear from '../assets/cub-layers/old/bodygear.png'
import oldMouth from '../assets/cub-layers/old/mouth.png'
import oldMouthMeat from '../assets/cub-layers/old/mouth-meat.png'
import oldMouthYell from '../assets/cub-layers/old/mouth-yelling.png'
import oldEyes from '../assets/cub-layers/old/eyes.png'
import oldEyesClosed from '../assets/cub-layers/old/eyes-closed.png'
import oldEyesGoggles from '../assets/cub-layers/old/eyes-goggles.png'
import oldFloaties from '../assets/cub-layers/old/bodygear-floaties.png'
import oldMane from '../assets/cub-layers/old/mane.png'
import oldEarring from '../assets/cub-layers/old/earring.png'
import oldHeadgear from '../assets/cub-layers/old/headgear.png'
import oldDirty from '../assets/cub-layers/old/mud2.png'
import youngBody from '../assets/cub-layers/young/body.png'
import youngBodygear from '../assets/cub-layers/young/bodygear.png'
import youngMouth from '../assets/cub-layers/young/mouth.png'
import youngMouthMeat from '../assets/cub-layers/young/mouth-meat.png'
import youngMouthYell from '../assets/cub-layers/young/mouth-yelling.png'
import youngEyes from '../assets/cub-layers/young/eyes.png'
import youngEyesClosed from '../assets/cub-layers/young/eyes-closed.png'
import youngEyesGoggles from '../assets/cub-layers/young/eyes-goggles.png'
import youngFloaties from '../assets/cub-layers/young/bodygear-floaties.png'
import youngMane from '../assets/cub-layers/young/mane.png'
import youngEarring from '../assets/cub-layers/young/earring.png'
import youngHeadgear from '../assets/cub-layers/young/headgear.png'
import youngDirty from '../assets/cub-layers/young/mud2.png'
import { homeScene } from './homeScene'
import { DEFAULT_OUTFIT } from './types'

/**
 * Back to front, matching the current bust: fur, clothes, face, hair, then
 * anything that hangs off the ear or sits on the head.
 */
const ORDER = ['body', 'bodygear', 'mouth', 'eyes', 'mane', 'earring', 'headgear'] as const

export const TRAIT_CATEGORIES = ['Body', 'Mane', 'Eyes', 'Mouth', 'Headgear', 'Bodygear', 'Earring'] as const
export type TraitCategory = (typeof TRAIT_CATEGORIES)[number]
export type TraitSlot = (typeof ORDER)[number]
export type TryOn = Partial<Record<TraitSlot, string>>

const SLOT_FOR: Record<TraitCategory, TraitSlot> = {
  Body: 'body',
  Bodygear: 'bodygear',
  Earring: 'earring',
  Eyes: 'eyes',
  Headgear: 'headgear',
  Mane: 'mane',
  Mouth: 'mouth',
}

/** Same slug the trait files were saved with. */
export function traitSlug(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'trait'
}

export function traitThumb(age: 'old' | 'young', category: TraitCategory, name: string) {
  return `/traits/thumbs/${age}/${SLOT_FOR[category]}/${traitSlug(name)}.png`
}

export const STARTER_OUTFIT: Record<TraitCategory, string> = { ...DEFAULT_OUTFIT }

export function tryOnFromPicks(picks: Record<TraitCategory, string>): TryOn {
  return {
    body: picks.Body,
    bodygear: picks.Bodygear,
    earring: picks.Earring,
    eyes: picks.Eyes,
    headgear: picks.Headgear,
    mane: picks.Mane,
    mouth: picks.Mouth,
  }
}

const SOURCES = {
  old: [oldBody, oldBodygear, oldMouth, oldEyes, oldMane, oldEarring, oldHeadgear],
  young: [youngBody, youngBodygear, youngMouth, youngEyes, youngMane, youngEarring, youngHeadgear],
}

const MEAT = { old: oldMouthMeat, young: youngMouthMeat }
const YELL = { old: oldMouthYell, young: youngMouthYell }
const CLOSED = { old: oldEyesClosed, young: youngEyesClosed }
const GOGGLES = { old: oldEyesGoggles, young: youngEyesGoggles }
const FLOATIES = { old: oldFloaties, young: youngFloaties }
const DIRTY = { old: oldDirty, young: youngDirty }

const images = new Map<string, HTMLImageElement>()

function load(id: string, src: string) {
  const image = new Image()
  image.src = src
  images.set(id, image)
}

for (const age of ['old', 'young'] as const) {
  SOURCES[age].forEach((src, index) => load(`${age}-${ORDER[index]}`, src))
  load(`${age}-mouth-meat`, MEAT[age])
  load(`${age}-mouth-yell`, YELL[age])
  load(`${age}-eyes-closed`, CLOSED[age])
  load(`${age}-eyes-goggles`, GOGGLES[age])
  load(`${age}-bodygear-floaties`, FLOATIES[age])
  load(`${age}-dirty`, DIRTY[age])
}

let meatMouthUntil = 0
let yellMouthUntil = 0
let angryEyesUntil = 0
let washUntil = 0
let eyesClosed = false

for (const age of ['old', 'young'] as const) {
  for (const file of ['eyes/angry.png', 'eyes/sleepy.png', 'mouth/sad.png']) {
    const image = new Image()
    image.src = `/traits/layers/${age}/${file}`
    const part = file.startsWith('eyes') ? 'eyes' : 'mouth'
    const name = file.endsWith('angry.png') ? 'angry' : file.endsWith('sleepy.png') ? 'sleepy' : 'sad'
    images.set(`${age}-${part}-${name}`, image)
  }
}

let needEnergy = 100
let needHunger = 100
let needCleanliness = 100

/** Home cub face/dirt follow need meters. Temporary care poses still win. */
export function setNeedLooks(energy: number, hunger: number, cleanliness = 100) {
  needEnergy = energy
  needHunger = hunger
  needCleanliness = cleanliness
}

/** Swap the mouth to Meat, then back to the cub's usual mouth. */
export function showMeatMouth(ms = 2000) {
  meatMouthUntil = performance.now() + ms
}

/** Yelling mouth for a tap, then the usual mouth. */
export function showYellMouth(ms = 700) {
  yellMouthUntil = performance.now() + ms
}

/** Angry eyes for a tap, then the usual eyes. */
export function showAngryEyes(ms = 700) {
  angryEyesUntil = performance.now() + ms
}

/** Closed eyes while the cub is asleep. Surprised eyes return on wake. */
export function setClosedEyes(closed: boolean) {
  eyesClosed = closed
}

/** Water goggles, floaties, no headgear, and a surprised mouth for the wash. */
export function showWashGear(ms = 1700) {
  washUntil = performance.now() + ms
}

export function characterLayers(
  now = performance.now(),
  tryOn?: TryOn | null,
  opts?: { preview?: boolean },
): HTMLImageElement[] {
  const age = homeScene.character.includes('young') ? 'young' : 'old'
  const preview = Boolean(opts?.preview)
  const meat = !preview && now < meatMouthUntil
  const yelling = !preview && now < yellMouthUntil
  const washing = !preview && now < washUntil
  const layers: HTMLImageElement[] = []
  for (const part of ORDER) {
    // Dirt after face layers, under mane so hair/crown stay clean.
    if (part === 'mane' && !preview && !washing && needCleanliness < 30) {
      const dirty = images.get(`${age}-dirty`)
      if (dirty?.complete && dirty.naturalWidth > 0) layers.push(dirty)
    }

    if (washing && part === 'headgear') {
      const bare = tryLayer(age, 'headgear', 'Nothing')
      if (bare) layers.push(bare)
      continue
    }

    let image: HTMLImageElement | null | undefined
    if (washing && part === 'mouth') {
      image = tryLayer(age, 'mouth', 'Surprised')
    }
    if (!image && !preview && eyesClosed && part === 'mouth') {
      image = tryLayer(age, 'mouth', 'Standard')
    }
    if (!image && meat && part === 'mouth') image = images.get(`${age}-mouth-meat`)
    if (!image && yelling && part === 'mouth') image = images.get(`${age}-mouth-yell`)
    if (!image && !preview && needHunger < 30 && part === 'mouth') {
      const sad = images.get(`${age}-mouth-sad`)
      if (sad?.complete && sad.naturalWidth > 0) image = sad
    }
    if (!image && washing && part === 'bodygear') image = images.get(`${age}-bodygear-floaties`)
    if (!image && !preview && eyesClosed && part === 'eyes') image = images.get(`${age}-eyes-closed`)
    if (!image && !preview && now < angryEyesUntil && part === 'eyes') {
      const angry = images.get(`${age}-eyes-angry`)
      if (angry?.complete && angry.naturalWidth > 0) image = angry
    }
    if (!image && washing && part === 'eyes') image = images.get(`${age}-eyes-goggles`)
    if (!image && !preview && needEnergy < 30 && part === 'eyes') {
      const sleepy = images.get(`${age}-eyes-sleepy`)
      if (sleepy?.complete && sleepy.naturalWidth > 0) image = sleepy
    }
    if (!image && tryOn?.[part]) image = tryLayer(age, part, tryOn[part]!)
    if (!image) image = images.get(`${age}-${part}`)
    if (image?.complete && image.naturalWidth > 0) layers.push(image)
  }

  return layers
}

function tryLayer(age: 'old' | 'young', part: TraitSlot, name: string) {
  const id = `try-${age}-${part}-${traitSlug(name)}`
  let image = images.get(id)
  if (!image) {
    image = new Image()
    image.src = `/traits/layers/${age}/${part}/${traitSlug(name)}.png`
    images.set(id, image)
  }
  return image.complete && image.naturalWidth > 0 ? image : null
}
