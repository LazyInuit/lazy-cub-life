import kovuUrl from '../assets/space-dash/crown-cub.png'
import blinkyUrl from '../assets/space-dash/blinky.png'
import pinkyUrl from '../assets/space-dash/pinky.png'
import speedUrl from '../assets/space-dash/speed.png'

/**
 * Who flies in Kovu's Space Dash. Every sprite shares one shape and pose and the same hit box, so they all fly alike.
 * `size` shrinks a sprite whose character fills more of its picture than Kovu does, so all look the same size.
 * `pickup` is what sits in every 10th gap: only the picture differs, it pays the same Cub Cash.
 */
export const FLIGHT_CHARACTERS = [
  { id: 'kovu', name: 'Kovu', src: kovuUrl, size: 1, pickup: 'coin' },
  { id: 'blinky', name: 'Blinky', src: blinkyUrl, size: 0.83, pickup: 'egg' },
  { id: 'pinky', name: 'Pinky', src: pinkyUrl, size: 0.86, pickup: 'egg' },
  { id: 'speed', name: 'Speed', src: speedUrl, size: 0.86, pickup: 'egg' },
] as const

export type FlightCharacter = (typeof FLIGHT_CHARACTERS)[number]
export type FlightCharacterId = FlightCharacter['id']

const KEY = 'lazy-cub-flight-character'

export function flightCharacter(id: string | null | undefined): FlightCharacter {
  // Blinky was briefly saved as "binky".
  const wanted = id === 'binky' ? 'blinky' : id
  return FLIGHT_CHARACTERS.find((character) => character.id === wanted) ?? FLIGHT_CHARACTERS[0]
}

/** The flyer this device picked last, or Kovu. */
export function savedFlightCharacter(): FlightCharacter {
  try {
    return flightCharacter(localStorage.getItem(KEY))
  } catch {
    return FLIGHT_CHARACTERS[0]
  }
}

export function saveFlightCharacter(id: FlightCharacterId) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Without storage the pick lasts until the game is closed.
  }
}
