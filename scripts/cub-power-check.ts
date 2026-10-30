// Formula checks for Cub Power. Run: npm run check:power
// The database runs the same formulas; supabase/cub-power-tests.sql checks those.
import { readFileSync } from 'node:fs'
import {
  addBonusHundredths,
  badgePower,
  benefitPercent,
  discountedPrice,
  levelPower,
  powerAfterStreak,
  powerNoticesFor,
  powerToNextTier,
  streakMultiplier,
  totalPower,
  weeklyBoost,
  type CubPower,
} from '../src/game/cubPower'
import { achievementLadder } from '../src/game/profileArt'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  if (Object.is(actual, expected)) console.log(`ok   ${name}`)
  else {
    failures += 1
    console.log(`FAIL ${name}: got ${String(actual)}, expected ${String(expected)}`)
  }
}

// Badge Power
check('7 games, 400 points', badgePower(400, 7), 400)
check('8 games, 400 points', badgePower(400, 8), 350)
check('10 games, 400 points', badgePower(400, 10), 280)
check('15 games, 400 points', badgePower(400, 15), 186)
check('20 games, 400 points', badgePower(400, 20), 140)
check('7 Diamonds across 7 games', badgePower(700, 7), 700)
check('20 Diamonds across 20 games', badgePower(2000, 20), 700)
check('no released games', badgePower(400, 0), 0)
check('a new 8th game lowers 400 points', badgePower(400, 8) < badgePower(400, 7), true)

// Only the highest tier in a game counts: a Platinum best scores 75, not 10 + 25 + 50 + 75.
const ladder = achievementLadder({ hoops: 80000 })
const hoops = ladder.find((game) => game.game === 'hoops')
const tierPoints = [10, 25, 50, 75, 100]
const highest = hoops ? hoops.tiers.reduce((top, tier, index) => (tier.earned ? tierPoints[index] : top), 0) : -1
check('Lazy Hoops Platinum scores 75', highest, 75)

// Level Power
for (const [level, power] of [
  [0, 0],
  [-3, 0],
  [10, 50],
  [20, 100],
  [22, 110],
  [25, 125],
  [30, 140],
  [50, 200],
  [80, 260],
  [100, 300],
  [150, 350],
] as const) {
  check(`level ${level}`, levelPower(level), power)
}

// Streak
check('no streak', streakMultiplier(0), 100)
check('day 1', streakMultiplier(1), 105)
check('day 7', streakMultiplier(7), 135)
check('day 30 stays at x1.35', streakMultiplier(30), 135)
check('510 base, 7-day streak', powerAfterStreak(510, 7), 688)

// Weekly boost
check('1st', weeklyBoost(1), 100)
check('2nd', weeklyBoost(2), 75)
check('3rd', weeklyBoost(3), 50)
check('4th', weeklyBoost(4), 25)
check('10th', weeklyBoost(10), 25)
check('11th', weeklyBoost(11), 0)
check('no place', weeklyBoost(null), 0)

// The spec's example account: 400 badge points over 7 games, level 22, 7-day streak, 1st last week.
check(
  'example account',
  totalPower({ rawBadgePoints: 400, activeGames: 7, level: 22, streakDays: 7, boostPlace: 1 }),
  788,
)
check(
  'boost is not multiplied by the streak',
  totalPower({ rawBadgePoints: 0, activeGames: 7, level: 0, streakDays: 7, boostPlace: 1 }),
  100,
)

// Benefits
for (const [power, percent] of [
  [0, 0],
  [99, 0],
  [100, 1],
  [688, 6],
  [788, 7],
  [999, 9],
  [1000, 10],
  [1500, 10],
] as const) {
  check(`${power} Power`, benefitPercent(power), percent)
}
check('688 needs 12 more for 7%', powerToNextTier(688), 12)
check('1,000 is the top tier', powerToNextTier(1000), null)

// Leftover bonus: 10 coins a round at 6% pays 0, 1, 0 with 60, 20, 80 left.
let left = 0
const rounds: string[] = []
for (let round = 0; round < 3; round += 1) {
  const step = addBonusHundredths(left, 10, 6)
  left = step.remainder
  rounds.push(`${step.whole}/${step.remainder}`)
}
check('6% on 10 coins, three rounds', rounds.join(' '), '0/60 1/20 0/80')
left = 0
let paid = 0
for (let round = 0; round < 10; round += 1) {
  const step = addBonusHundredths(left, 10, 1)
  left = step.remainder
  paid += step.whole
}
check('1% on 10 coins, ten rounds pays 1', paid, 1)
check('nothing left after ten rounds', left, 0)
check('remainder kept when the bonus drops to 0%', addBonusHundredths(80, 10, 0).remainder, 80)

// Wardrobe discount, rounded up
check('100 at 6%', discountedPrice(100, 6), 94)
check('150 at 7%', discountedPrice(150, 7), 140)
check('125 at 3% rounds up', discountedPrice(125, 3), 122)
check('discount never above 10%', discountedPrice(1000, 25), 900)
check('no discount', discountedPrice(275, 0), 275)

// Home pop-ups
const base: CubPower = {
  total: 688, percent: 6, badgePoints: 400, activeGames: 7, badgePower: 400, badges: [], level: 22, levelPower: 110,
  basePower: 510, streakCount: 4, streakDays: 4, streakMultiplier: 120, streakPower: 612, lastLoginDay: '2026-10-29',
  streakResetsAt: null, boost: 0, boostPlace: null, boostEndsAt: null, coinBonusHundredths: 0,
}
const kinds = (list: { kind: string }[]) => list.map((item) => item.kind).join(',')
const first = powerNoticesFor(base, {})
check('first open: streak pop-up, no tier pop-up', kinds(first.notices), 'streak')
check('first open sets the tier baseline', first.seen.percent, 6)
check('same day again: nothing', kinds(powerNoticesFor(base, first.seen).notices), '')
const nextDay = powerNoticesFor({ ...base, lastLoginDay: '2026-10-30', streakCount: 5, total: 702, percent: 7 }, first.seen)
check('next day with a new tier: streak then tier', kinds(nextDay.notices), 'streak,tier')
const reset = powerNoticesFor({ ...base, lastLoginDay: '2026-11-02', streakCount: 1 }, { day: '2026-10-29', streak: 4, percent: 6 })
check('streak reset is flagged', reset.notices[0]?.kind === 'streak' && reset.notices[0].reset, true)
check('a lower tier is not announced', kinds(powerNoticesFor({ ...base, percent: 4 }, { ...first.seen }).notices), '')
const won = { ...base, boost: 100, boostPlace: 1, boostEndsAt: 1_800_000_000_000 }
const boostNews = powerNoticesFor(won, first.seen)
check('weekly boost announced once', kinds(boostNews.notices), 'boost')
check('weekly boost not repeated', kinds(powerNoticesFor(won, boostNews.seen).notices), '')

// The badge scores in the database must match the app's.
const sql = readFileSync('supabase/cub-power.sql', 'utf8')
const rows = [...sql.matchAll(/\('(\w+)', '[^']*(?:''[^']*)*', \d+, (\d+), (\d+), (\d+), (\d+), (\d+)\)/g)]
const app = achievementLadder({})
check('every game with badges is in power_games', rows.length, app.length)
for (const game of app) {
  const row = rows.find((match) => match[1] === game.game)
  const tiers = row ? row.slice(2, 7).map(Number).join(',') : 'missing'
  check(`${game.game} badge scores match`, tiers, game.tiers.map((tier) => tier.at).join(','))
}

if (failures > 0) {
  console.log(`\n${failures} failed`)
  process.exit(1)
}
console.log('\nAll Cub Power checks passed')
