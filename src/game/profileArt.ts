import pawUrl from '../assets/player-profile/pictures/paw.png'
import archerBronzeUrl from '../assets/player-profile/badges/archer-bronze.png'
import ballerBronzeUrl from '../assets/player-profile/badges/baller-bronze.png'
import ninjaBronzeUrl from '../assets/player-profile/badges/ninja-bronze.png'
import prideBronzeUrl from '../assets/player-profile/badges/pride-bronze.png'
import spaceBronzeUrl from '../assets/player-profile/badges/space-bronze.png'
import spaceGoldUrl from '../assets/player-profile/badges/space-gold.png'
import spacePlatinumUrl from '../assets/player-profile/badges/space-platinum.png'
import spaceSilverUrl from '../assets/player-profile/badges/space-silver.png'
import type { DailyGame } from './dailyTasks'

/** Profile pictures a player can show. Add a picture here, then point a look at its id. */
export const PROFILE_PICTURES = {
  paw: { src: pawUrl, label: 'Paw' },
} as const

/** Every badge that can appear on a profile card. */
export const BADGES = {
  'space-bronze': { src: spaceBronzeUrl, label: "Kovu's Space Dash Bronze" },
  'space-silver': { src: spaceSilverUrl, label: "Kovu's Space Dash Silver" },
  'space-gold': { src: spaceGoldUrl, label: "Kovu's Space Dash Gold" },
  'space-platinum': { src: spacePlatinumUrl, label: "Kovu's Space Dash Platinum" },
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

export type GameBests = Partial<Record<DailyGame, number>>

type BadgeTier = { badge: BadgeId; at: number }

/**
 * Each game shows one badge: the highest tier its best single score reaches.
 * List tiers lowest first. A game missing here shows no badge yet.
 */
const BADGE_RULES: { game: DailyGame; tiers: BadgeTier[] }[] = [
  {
    game: 'flight',
    tiers: [
      { badge: 'space-bronze', at: 20 },
      { badge: 'space-silver', at: 50 },
      { badge: 'space-gold', at: 100 },
      { badge: 'space-platinum', at: 150 },
    ],
  },
]

export function earnedBadges(bests: GameBests): BadgeId[] {
  const earned: BadgeId[] = []
  for (const rule of BADGE_RULES) {
    const best = bests[rule.game] ?? 0
    let top: BadgeId | null = null
    for (const tier of rule.tiers) {
      if (best >= tier.at) top = tier.badge
    }
    if (top) earned.push(top)
  }
  return earned
}

/** Only these leaderboard names open a profile card for now. */
const PROFILE_PREVIEW_NAMES = ['lazycublife']

export function hasProfileCard(username: string) {
  return PROFILE_PREVIEW_NAMES.includes(username.trim().toLowerCase())
}

export function profileLookFor(bests: GameBests): ProfileLook {
  return { picture: 'paw', badges: earnedBadges(bests) }
}
