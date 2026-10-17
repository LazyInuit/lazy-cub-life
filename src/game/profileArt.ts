import pawUrl from '../assets/player-profile/pictures/paw.png'
import archerBronzeUrl from '../assets/player-profile/badges/archer-bronze.png'
import ballerBronzeUrl from '../assets/player-profile/badges/baller-bronze.png'
import ninjaBronzeUrl from '../assets/player-profile/badges/ninja-bronze.png'
import prideBronzeUrl from '../assets/player-profile/badges/pride-bronze.png'
import spaceBronzeUrl from '../assets/player-profile/badges/space-bronze.png'

/** Profile pictures a player can show. Add a picture here, then point a look at its id. */
export const PROFILE_PICTURES = {
  paw: { src: pawUrl, label: 'Paw' },
} as const

/** Every badge that can appear on a profile card. */
export const BADGES = {
  'space-bronze': { src: spaceBronzeUrl, label: "Kovu's Space Dash Bronze" },
  'pride-bronze': { src: prideBronzeUrl, label: 'Pride Pairs Bronze' },
  'ninja-bronze': { src: ninjaBronzeUrl, label: 'Ninja Cub Dojo Bronze' },
  'archer-bronze': { src: archerBronzeUrl, label: 'Cupid Archery Bronze' },
  'baller-bronze': { src: ballerBronzeUrl, label: 'Lazy Hoops Bronze' },
} as const

export type ProfilePictureId = keyof typeof PROFILE_PICTURES
export type BadgeId = keyof typeof BADGES

export type ProfileLook = {
  picture: ProfilePictureId
  badges: BadgeId[]
}

/** Only these leaderboard names open a profile card for now. */
const PROFILE_PREVIEW_NAMES = ['lazycublife']

export function hasProfileCard(username: string) {
  return PROFILE_PREVIEW_NAMES.includes(username.trim().toLowerCase())
}

/** Mockup: every player shows all badges until the earning rules are added. */
const MOCKUP_LOOK: ProfileLook = {
  picture: 'paw',
  badges: ['space-bronze', 'pride-bronze', 'ninja-bronze', 'archer-bronze', 'baller-bronze'],
}

export function profileLookFor(_username: string): ProfileLook {
  return MOCKUP_LOOK
}
