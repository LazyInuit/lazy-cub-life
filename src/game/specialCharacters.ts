import { useEffect, useState } from 'react'
import pharaohBase from '../assets/cub-layers/pharaoh/base.png'
import pharaohSleep from '../assets/cub-layers/pharaoh/face-sleep.png'
import pharaohTired from '../assets/cub-layers/pharaoh/face-tired.png'
import pharaohRoar from '../assets/cub-layers/pharaoh/face-roar.png'
import { isDemo } from './demo'
import type { CharacterAge } from './homeScene'
import { supabase } from './supabase'
import { isSpecialCharacterId, type CubSave, type SpecialCharacterId } from './types'

export type SpecialFace = 'sleep' | 'tired' | 'roar'

export type SpecialCharacter = {
  id: SpecialCharacterId
  name: string
  /** Only replaces the cub of this age. */
  age: CharacterAge
  src: string
  /** Face pictures the same size as src, drawn over it. */
  faces: Record<SpecialFace, string>
  /**
   * Where the square picture sits in the 1400px trait-layer frame, so the head matches a layered cub.
   * wardrobeDrop moves it further down on the wardrobe chest only.
   */
  frame: { x: number; y: number; size: number; wardrobeDrop: number }
}

export const SPECIAL_CHARACTERS: Record<SpecialCharacterId, SpecialCharacter> = {
  pharaoh: {
    id: 'pharaoh',
    name: 'Pharaoh',
    age: 'young',
    src: pharaohBase,
    faces: { sleep: pharaohSleep, tired: pharaohTired, roar: pharaohRoar },
    frame: { x: 196.5, y: 442.8, size: 952.3, wardrobeDrop: 8 },
  },
}

const images = new Map<string, HTMLImageElement>()

/** The loaded picture for a special character's base (no face) or one of its faces, or null while it loads. */
export function specialImage(id: SpecialCharacterId, face: SpecialFace | null): HTMLImageElement | null {
  const character = SPECIAL_CHARACTERS[id]
  const src = face ? character.faces[face] : character.src
  let image = images.get(src)
  if (!image) {
    image = new Image()
    image.src = src
    images.set(src, image)
  }
  return image.complete && image.naturalWidth > 0 ? image : null
}

/** The special character to draw for this save and age, or null for the usual layered cub. */
export function wornSpecial(
  save: Pick<CubSave, 'specialCharacter'>,
  allowed: readonly SpecialCharacterId[],
  age: CharacterAge,
): SpecialCharacterId | null {
  const id = save.specialCharacter
  if (!id || !allowed.includes(id)) return null
  return SPECIAL_CHARACTERS[id].age === age ? id : null
}

const CACHE_KEY = 'lazy-cub-special-characters'

function readCache(): SpecialCharacterId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter(isSpecialCharacterId) : []
  } catch {
    return []
  }
}

let allowed: SpecialCharacterId[] = typeof localStorage === 'undefined' ? [] : readCache()
const listeners = new Set<(list: SpecialCharacterId[]) => void>()
let watching = false

function publish(list: SpecialCharacterId[]) {
  allowed = list
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list))
  } catch {
    // Private mode: the list is fetched again next time.
  }
  for (const listener of listeners) listener(list)
}

async function refreshAllowed(signedIn: boolean) {
  if (!supabase || !signedIn) {
    publish([])
    return
  }
  const { data, error } = await supabase.rpc('my_special_characters')
  // Keep the last list if the database update is missing or the network drops.
  if (error) return
  publish(Array.isArray(data) ? data.filter(isSpecialCharacterId) : [])
}

function watchAllowed() {
  if (watching) return
  watching = true
  const client = supabase
  if (!client) {
    publish([])
    return
  }
  void client.auth.getSession().then(({ data }) => refreshAllowed(Boolean(data.session)))
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') return
    void refreshAllowed(Boolean(session))
  })
}

/** Special characters the signed-in player is allowed to wear. Always empty for guests and demo players. */
export function useSpecialCharacters(): SpecialCharacterId[] {
  const [list, setList] = useState(allowed)
  useEffect(() => {
    watchAllowed()
    listeners.add(setList)
    setList(allowed)
    return () => {
      listeners.delete(setList)
    }
  }, [])
  return isDemo() ? [] : list
}
