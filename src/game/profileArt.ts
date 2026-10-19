import pawUrl from '../assets/player-profile/pictures/paw.png'
import archerBronzeUrl from '../assets/player-profile/badges/archer-bronze.png'
import archerGoldUrl from '../assets/player-profile/badges/archer-gold.png'
import archerDiamondUrl from '../assets/player-profile/badges/archer-diamond.png'
import archerPlatinumUrl from '../assets/player-profile/badges/archer-platinum.png'
import archerSilverUrl from '../assets/player-profile/badges/archer-silver.png'
import ballerBronzeUrl from '../assets/player-profile/badges/baller-bronze.png'
import ballerGoldUrl from '../assets/player-profile/badges/baller-gold.png'
import ballerDiamondUrl from '../assets/player-profile/badges/baller-diamond.png'
import ballerPlatinumUrl from '../assets/player-profile/badges/baller-platinum.png'
import ballerSilverUrl from '../assets/player-profile/badges/baller-silver.png'
import ninjaBronzeUrl from '../assets/player-profile/badges/ninja-bronze.png'
import ninjaGoldUrl from '../assets/player-profile/badges/ninja-gold.png'
import ninjaDiamondUrl from '../assets/player-profile/badges/ninja-diamond.png'
import ninjaPlatinumUrl from '../assets/player-profile/badges/ninja-platinum.png'
import ninjaSilverUrl from '../assets/player-profile/badges/ninja-silver.png'
import prideBronzeUrl from '../assets/player-profile/badges/pride-bronze.png'
import prideGoldUrl from '../assets/player-profile/badges/pride-gold.png'
import prideDiamondUrl from '../assets/player-profile/badges/pride-diamond.png'
import pridePlatinumUrl from '../assets/player-profile/badges/pride-platinum.png'
import prideSilverUrl from '../assets/player-profile/badges/pride-silver.png'
import spaceBronzeUrl from '../assets/player-profile/badges/space-bronze.png'
import spaceGoldUrl from '../assets/player-profile/badges/space-gold.png'
import spaceDiamondUrl from '../assets/player-profile/badges/space-diamond.png'
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
  'space-diamond': badge(spaceDiamondUrl, 'Space Badge', 'Diamond', "Kovu's Space Dash"),
  'pride-bronze': badge(prideBronzeUrl, 'Pride Badge', 'Bronze', 'Pride Pairs'),
  'pride-silver': badge(prideSilverUrl, 'Pride Badge', 'Silver', 'Pride Pairs'),
  'pride-gold': badge(prideGoldUrl, 'Pride Badge', 'Gold', 'Pride Pairs'),
  'pride-platinum': badge(pridePlatinumUrl, 'Pride Badge', 'Platinum', 'Pride Pairs'),
  'pride-diamond': badge(prideDiamondUrl, 'Pride Badge', 'Diamond', 'Pride Pairs'),
  'ninja-bronze': badge(ninjaBronzeUrl, 'Ninja Badge', 'Bronze', 'Ninja Cub Dojo'),
  'ninja-silver': badge(ninjaSilverUrl, 'Ninja Badge', 'Silver', 'Ninja Cub Dojo'),
  'ninja-gold': badge(ninjaGoldUrl, 'Ninja Badge', 'Gold', 'Ninja Cub Dojo'),
  'ninja-platinum': badge(ninjaPlatinumUrl, 'Ninja Badge', 'Platinum', 'Ninja Cub Dojo'),
  'ninja-diamond': badge(ninjaDiamondUrl, 'Ninja Badge', 'Diamond', 'Ninja Cub Dojo'),
  'archer-bronze': badge(archerBronzeUrl, 'Archer Badge', 'Bronze', 'Cupid Archery'),
  'archer-silver': badge(archerSilverUrl, 'Archer Badge', 'Silver', 'Cupid Archery'),
  'archer-gold': badge(archerGoldUrl, 'Archer Badge', 'Gold', 'Cupid Archery'),
  'archer-platinum': badge(archerPlatinumUrl, 'Archer Badge', 'Platinum', 'Cupid Archery'),
  'archer-diamond': badge(archerDiamondUrl, 'Archer Badge', 'Diamond', 'Cupid Archery'),
  'baller-bronze': badge(ballerBronzeUrl, 'Baller Badge', 'Bronze', 'Lazy Hoops'),
  'baller-silver': badge(ballerSilverUrl, 'Baller Badge', 'Silver', 'Lazy Hoops'),
  'baller-gold': badge(ballerGoldUrl, 'Baller Badge', 'Gold', 'Lazy Hoops'),
  'baller-platinum': badge(ballerPlatinumUrl, 'Baller Badge', 'Platinum', 'Lazy Hoops'),
  'baller-diamond': badge(ballerDiamondUrl, 'Baller Badge', 'Diamond', 'Lazy Hoops'),
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
      { badge: 'space-diamond', at: 250 },
    ],
  },
  {
    game: 'match',
    tiers: [
      { badge: 'pride-bronze', at: 130 },
      { badge: 'pride-silver', at: 150 },
      { badge: 'pride-gold', at: 180 },
      { badge: 'pride-platinum', at: 200 },
      { badge: 'pride-diamond', at: 220 },
    ],
  },
  {
    game: 'archer',
    tiers: [
      { badge: 'archer-bronze', at: 2500 },
      { badge: 'archer-silver', at: 5000 },
      { badge: 'archer-gold', at: 15000 },
      { badge: 'archer-platinum', at: 30000 },
      { badge: 'archer-diamond', at: 60000 },
    ],
  },
  {
    game: 'dojo',
    tiers: [
      { badge: 'ninja-bronze', at: 5000 },
      { badge: 'ninja-silver', at: 10000 },
      { badge: 'ninja-gold', at: 25000 },
      { badge: 'ninja-platinum', at: 50000 },
      { badge: 'ninja-diamond', at: 100000 },
    ],
  },
  {
    game: 'hoops',
    tiers: [
      { badge: 'baller-bronze', at: 5000 },
      { badge: 'baller-silver', at: 15000 },
      { badge: 'baller-gold', at: 40000 },
      { badge: 'baller-platinum', at: 80000 },
      { badge: 'baller-diamond', at: 120000 },
    ],
  },
]

export type AchievementGame = {
  game: DailyGame
  title: string
  best: number
  tiers: { badge: BadgeId; at: number; earned: boolean }[]
}

/** Every game and every tier, marking which ones the best score has reached. */
export function achievementLadder(bests: GameBests): AchievementGame[] {
  return BADGE_RULES.map((rule) => {
    const best = bests[rule.game] ?? 0
    return {
      game: rule.game,
      title: BADGES[rule.tiers[0].badge].game,
      best,
      tiers: rule.tiers.map((tier) => ({ ...tier, earned: best >= tier.at })),
    }
  })
}

/** Higher of two sets of bests, game by game. */
export function mergeBests(a: GameBests, b: GameBests): GameBests {
  const merged: GameBests = { ...a }
  for (const [game, best] of Object.entries(b) as [keyof GameBests, number][]) {
    merged[game] = Math.max(merged[game] ?? 0, best)
  }
  return merged
}

/** Every tier reached in every game, Bronze through Platinum. */
export function allEarnedTiers(bests: GameBests): BadgeId[] {
  return achievementLadder(bests).flatMap((game) => game.tiers.filter((tier) => tier.earned).map((tier) => tier.badge))
}

const SEEN_EVENT = 'lazy-cub-badges-seen'

function seenKey(username: string) {
  return `lazy-cub-seen-badges:${username.trim().toLowerCase()}`
}

export function seenBadges(username: string): Set<string> {
  try {
    const raw = localStorage.getItem(seenKey(username))
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Remember these badges as looked at, so the new-badge dot clears. */
export function markBadgesSeen(username: string, ids: BadgeId[]) {
  const seen = seenBadges(username)
  let changed = false
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id)
      changed = true
    }
  }
  if (!changed) return
  try {
    localStorage.setItem(seenKey(username), JSON.stringify([...seen]))
  } catch {
    // The dot comes back next visit, which is harmless.
  }
  window.dispatchEvent(new Event(SEEN_EVENT))
}

export function onBadgesSeen(listener: () => void) {
  window.addEventListener(SEEN_EVENT, listener)
  return () => window.removeEventListener(SEEN_EVENT, listener)
}

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
 * Whether this name has a profile: a card on the leaderboard, My Profile and Achievements,
 * the name-pill photo, and badge pop-ups after a run. Every signed-in player has one.
 */
export function hasProfileCard(username: string | null | undefined) {
  return (username ?? '').trim() !== ''
}

export function profileLookFor(bests: GameBests): ProfileLook {
  return { picture: 'paw', badges: earnedBadges(bests) }
}
