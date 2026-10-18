import pawUrl from '../assets/player-profile/pictures/paw.png'
import archerBronzeUrl from '../assets/player-profile/badges/archer-bronze.png'
import archerGoldUrl from '../assets/player-profile/badges/archer-gold.png'
import archerPlatinumUrl from '../assets/player-profile/badges/archer-platinum.png'
import archerSilverUrl from '../assets/player-profile/badges/archer-silver.png'
import ballerBronzeUrl from '../assets/player-profile/badges/baller-bronze.png'
import ballerGoldUrl from '../assets/player-profile/badges/baller-gold.png'
import ballerPlatinumUrl from '../assets/player-profile/badges/baller-platinum.png'
import ballerSilverUrl from '../assets/player-profile/badges/baller-silver.png'
import ninjaBronzeUrl from '../assets/player-profile/badges/ninja-bronze.png'
import ninjaGoldUrl from '../assets/player-profile/badges/ninja-gold.png'
import ninjaPlatinumUrl from '../assets/player-profile/badges/ninja-platinum.png'
import ninjaSilverUrl from '../assets/player-profile/badges/ninja-silver.png'
import prideBronzeUrl from '../assets/player-profile/badges/pride-bronze.png'
import prideGoldUrl from '../assets/player-profile/badges/pride-gold.png'
import pridePlatinumUrl from '../assets/player-profile/badges/pride-platinum.png'
import prideSilverUrl from '../assets/player-profile/badges/pride-silver.png'
import spaceBronzeUrl from '../assets/player-profile/badges/space-bronze.png'
import spaceGoldUrl from '../assets/player-profile/badges/space-gold.png'
import spacePlatinumUrl from '../assets/player-profile/badges/space-platinum.png'
import spaceSilverUrl from '../assets/player-profile/badges/space-silver.png'
import type { DailyGame } from './dailyTasks'

/** Profile pictures a player can show. Add a picture here, then point a look at its id. */
export const PROFILE_PICTURES = {
  paw: { src: pawUrl, label: 'Paw' },
} as const

type Badge = { src: string; name: string; tier: string; game: string; label: string }

function badge(src: string, name: string, tier: string, game: string): Badge {
  return { src, name, tier, game, label: `${name} ${tier}` }
}

/** Every badge that can appear on a profile card. */
export const BADGES = {
  'space-bronze': badge(spaceBronzeUrl, 'Space Badge', 'Bronze', "Kovu's Space Dash"),
  'space-silver': badge(spaceSilverUrl, 'Space Badge', 'Silver', "Kovu's Space Dash"),
  'space-gold': badge(spaceGoldUrl, 'Space Badge', 'Gold', "Kovu's Space Dash"),
  'space-platinum': badge(spacePlatinumUrl, 'Space Badge', 'Platinum', "Kovu's Space Dash"),
  'pride-bronze': badge(prideBronzeUrl, 'Pride Badge', 'Bronze', 'Pride Pairs'),
  'pride-silver': badge(prideSilverUrl, 'Pride Badge', 'Silver', 'Pride Pairs'),
  'pride-gold': badge(prideGoldUrl, 'Pride Badge', 'Gold', 'Pride Pairs'),
  'pride-platinum': badge(pridePlatinumUrl, 'Pride Badge', 'Platinum', 'Pride Pairs'),
  'ninja-bronze': badge(ninjaBronzeUrl, 'Ninja Badge', 'Bronze', 'Ninja Cub Dojo'),
  'ninja-silver': badge(ninjaSilverUrl, 'Ninja Badge', 'Silver', 'Ninja Cub Dojo'),
  'ninja-gold': badge(ninjaGoldUrl, 'Ninja Badge', 'Gold', 'Ninja Cub Dojo'),
  'ninja-platinum': badge(ninjaPlatinumUrl, 'Ninja Badge', 'Platinum', 'Ninja Cub Dojo'),
  'archer-bronze': badge(archerBronzeUrl, 'Archer Badge', 'Bronze', 'Cupid Archery'),
  'archer-silver': badge(archerSilverUrl, 'Archer Badge', 'Silver', 'Cupid Archery'),
  'archer-gold': badge(archerGoldUrl, 'Archer Badge', 'Gold', 'Cupid Archery'),
  'archer-platinum': badge(archerPlatinumUrl, 'Archer Badge', 'Platinum', 'Cupid Archery'),
  'baller-bronze': badge(ballerBronzeUrl, 'Baller Badge', 'Bronze', 'Lazy Hoops'),
  'baller-silver': badge(ballerSilverUrl, 'Baller Badge', 'Silver', 'Lazy Hoops'),
  'baller-gold': badge(ballerGoldUrl, 'Baller Badge', 'Gold', 'Lazy Hoops'),
  'baller-platinum': badge(ballerPlatinumUrl, 'Baller Badge', 'Platinum', 'Lazy Hoops'),
} satisfies Record<string, Badge>

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
  {
    game: 'match',
    tiers: [
      { badge: 'pride-bronze', at: 130 },
      { badge: 'pride-silver', at: 150 },
      { badge: 'pride-gold', at: 180 },
      { badge: 'pride-platinum', at: 200 },
    ],
  },
  {
    game: 'archer',
    tiers: [
      { badge: 'archer-bronze', at: 2500 },
      { badge: 'archer-silver', at: 5000 },
      { badge: 'archer-gold', at: 15000 },
      { badge: 'archer-platinum', at: 30000 },
    ],
  },
  {
    game: 'dojo',
    tiers: [
      { badge: 'ninja-bronze', at: 5000 },
      { badge: 'ninja-silver', at: 10000 },
      { badge: 'ninja-gold', at: 25000 },
      { badge: 'ninja-platinum', at: 50000 },
    ],
  },
  {
    game: 'hoops',
    tiers: [
      { badge: 'baller-bronze', at: 5000 },
      { badge: 'baller-silver', at: 15000 },
      { badge: 'baller-gold', at: 40000 },
      { badge: 'baller-platinum', at: 80000 },
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

/**
 * Profiles and badges are only switched on for these accounts for now. This one check
 * decides both whose leaderboard name opens a card and who sees a badge pop up after a run.
 * Remove it to switch both on for everyone.
 */
const PROFILE_PREVIEW_NAMES = ['lazycublife']

export function hasProfileCard(username: string | null | undefined) {
  return PROFILE_PREVIEW_NAMES.includes((username ?? '').trim().toLowerCase())
}

export function profileLookFor(bests: GameBests): ProfileLook {
  return { picture: 'paw', badges: earnedBadges(bests) }
}
