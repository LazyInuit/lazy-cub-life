import archerCub from '../assets/scorecard/archer-cub.png'
import bubbleCub from '../assets/scorecard/bubble-cub.png'
import dojoCub from '../assets/scorecard/dojo-cub.png'
import flightCub from '../assets/scorecard/flight-cub.png'
import hoopsCub from '../assets/scorecard/hoops-cub.png'
import matchCub from '../assets/scorecard/match-cub.png'
import riverCub from '../assets/scorecard/river-cub.png'
import solitaireCub from '../assets/scorecard/solitaire-cub.png'
import archerBg from '../assets/scorecard/archer-gameplay.jpg'
import baseballBg from '../assets/scorecard/baseball-gameplay.jpg'
import bubbleBg from '../assets/scorecard/bubble-gameplay.jpg'
import dojoBg from '../assets/scorecard/dojo-gameplay.jpg'
import flightBg from '../assets/scorecard/flight-gameplay.jpg'
import hoopsBg from '../assets/scorecard/hoops-gameplay.jpg'
import matchBg from '../assets/scorecard/match-gameplay.jpg'
import riverBg from '../assets/scorecard/river-gameplay.jpg'
import solitaireBg from '../assets/scorecard/solitaire-gameplay.jpg'
import solitaireFlipflopBg from '../assets/scorecard/solitaire-flipflop-gameplay.jpg'
import solitaireFreecellBg from '../assets/scorecard/solitaire-freecell-gameplay.jpg'
import solitaireGolfBg from '../assets/scorecard/solitaire-golf-gameplay.jpg'
import solitairePyramidBg from '../assets/scorecard/solitaire-pyramid-gameplay.jpg'
import solitaireSpiderBg from '../assets/scorecard/solitaire-spider-gameplay.jpg'
import baseballCub from '../assets/scorecard/baseball-cub.png'
import baseballBronze from '../assets/scorecard/badges/baseball-bronze.png'
import baseballDiamond from '../assets/scorecard/badges/baseball-diamond.png'
import baseballGold from '../assets/scorecard/badges/baseball-gold.png'
import baseballPlatinum from '../assets/scorecard/badges/baseball-platinum.png'
import baseballSilver from '../assets/scorecard/badges/baseball-silver.png'
import type { DailyGame } from './dailyTasks'
import { BADGES, badgeForScore, firstBadgeAt, type BadgeId } from './profileArt'
import type { BadgeTier, ScorecardSpec } from './scorecard'

type ScorecardGame = {
  title: string
  emoji: string
  /** A real gameplay frame, square, with the action kept clear of the header and the results panel. */
  background: string
  /** A gameplay frame for each version of the game, by version id, used in place of `background`. */
  versionBackgrounds?: Partial<Record<string, string>>
  /** A cub for the bottom-left corner: the whole square trait-layer frame (not trimmed), transparent PNG. */
  character?: string
  /** Large badge art for the 1200px card, by tier; the profile-sized badge is used for any tier missing here. */
  badges?: Partial<Record<BadgeTier, string>>
}

/** Games with a shareable scorecard. A new game needs its entry here and its badges in profileArt. */
export const SCORECARD_GAMES: Partial<Record<DailyGame, ScorecardGame>> = {
  baseball: {
    title: 'Baseball Blitz',
    emoji: '⚾',
    background: baseballBg,
    character: baseballCub,
    badges: { Bronze: baseballBronze, Silver: baseballSilver, Gold: baseballGold, Platinum: baseballPlatinum, Diamond: baseballDiamond },
  },
  flight: { title: "Kovu's Space Dash", emoji: '🚀', background: flightBg, character: flightCub },
  hoops: { title: 'Lazy Hoops', emoji: '🏀', background: hoopsBg, character: hoopsCub },
  archer: { title: 'Cupid Archery', emoji: '🏹', background: archerBg, character: archerCub },
  dojo: { title: 'Ninja Cub Dojo', emoji: '🥷', background: dojoBg, character: dojoCub },
  match: { title: 'Pride Pairs', emoji: '🦁', background: matchBg, character: matchCub },
  bubble: { title: 'Bubble Blast', emoji: '🫧', background: bubbleBg, character: bubbleCub },
  river: { title: 'Lazy River', emoji: '🛟', background: riverBg, character: riverCub },
  solitaire: {
    title: 'Spellitaire',
    emoji: '🔮',
    background: solitaireBg,
    versionBackgrounds: {
      classic: solitaireBg,
      flipflop: solitaireFlipflopBg,
      spider: solitaireSpiderBg,
      pyramid: solitairePyramidBg,
      freecell: solitaireFreecellBg,
      golf: solitaireGolfBg,
    },
    character: solitaireCub,
  },
}

export function hasScorecard(game: DailyGame) {
  return Boolean(SCORECARD_GAMES[game])
}

type ScorecardOptions = {
  /** Score the badge goes by: the run's own score except in Spellitaire, whose badge goes by every board's best added together. */
  badgeScore?: number
  /** The version played, such as a Spellitaire mode: its name follows the title. */
  version?: { id: string; name: string }
  /** The difficulty played, such as "Hard". */
  level?: string
}

/** The scorecard for one finished run, with the badge for `badgeScore`. Null for a game without one. */
export function scorecardFor(game: DailyGame, username: string | null, score: number, options: ScorecardOptions = {}): ScorecardSpec | null {
  const entry = SCORECARD_GAMES[game]
  if (!entry) return null
  const id: BadgeId | null = badgeForScore(game, options.badgeScore ?? score)
  const art = id ? BADGES[id] : null
  const tier = art ? (art.tier as BadgeTier) : null
  const version = options.version
  return {
    game,
    title: version ? `${entry.title} ${version.name}` : entry.title,
    level: options.level,
    emoji: entry.emoji,
    background: (version && entry.versionBackgrounds?.[version.id]) ?? entry.background,
    username: username?.trim() || 'Lazy Cub Player',
    score: Math.max(0, Math.floor(score)),
    badge: art && tier ? { src: entry.badges?.[tier] ?? art.src, tier, name: art.name } : null,
    firstBadgeAt: firstBadgeAt(game),
    character: entry.character,
  }
}
