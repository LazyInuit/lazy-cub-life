// Rule checks for Spellitaire (Klondike, draw 1). Run: npm run check:solitaire
import { cardArtId, cardId, makeSuitDeck, type Card, type Rank, type Suit } from '../src/game/cards/deck'
import {
  dealFlipflop,
  ffCanPickUp,
  ffCanPlace,
  ffDeal,
  ffFindHint,
  ffFoundationFor,
  ffHasUsefulMove,
  ffMove,
  ffPileCards,
  ffRewardsFor,
  ffUndo,
  type FlipflopDifficulty,
  type FlipflopState,
} from '../src/game/solitaire/flipflop'
import {
  dealFreecell,
  fcCanMove,
  fcCanPickUp,
  fcFindHint,
  fcHasUsefulMove,
  fcLiveScore,
  fcMaxRun,
  fcMove,
  fcRewardsFor,
  fcTapMove,
  fcUndo,
  freecellSolve,
  freshFreecell,
  type FreecellDifficulty,
  type FreecellState,
} from '../src/game/solitaire/freecell'
import { FREECELL_DEALS } from '../src/game/solitaire/freecellDeals'
import {
  dealGolf,
  freshGolf,
  golfCanMove,
  golfCanPickUp,
  golfCardPoints,
  golfCovered,
  golfDraw,
  golfFindHint,
  golfFits,
  golfHasUsefulMove,
  golfLiveScore,
  golfMove,
  golfRewardsFor,
  golfSolve,
  golfUndo,
  type GolfDifficulty,
  type GolfState,
} from '../src/game/solitaire/golf'
import { GOLF_DEALS } from '../src/game/solitaire/golfDeals'
import { boardKey } from '../src/game/solitaire/keys'
import {
  dealPyramid,
  PY_DISCARD,
  PYRAMID_PILES,
  PYRAMID_SETTINGS,
  pyCanMove,
  pyCanPickUp,
  pyCanRecycle,
  pyCovered,
  pyDraw,
  pyFindHint,
  pyHasUsefulMove,
  pyLiveScore,
  pyMove,
  pyPileCards,
  pyramidWinnable,
  pyRewardsFor,
  pyTapMove,
  pyUndo,
  type PyramidDifficulty,
  type PyramidState,
} from '../src/game/solitaire/pyramid'
import { PYRAMID_DEALS } from '../src/game/solitaire/pyramidDeals'
import {
  dealSpider,
  spCanDeal,
  spCanMove,
  spCanPickUp,
  spDeal,
  spDealBlocked,
  spFindHint,
  spHasUsefulMove,
  spLiveScore,
  spMove,
  spRewardsFor,
  spTapMove,
  spUndo,
  type SpiderDifficulty,
  type SpiderState,
} from '../src/game/solitaire/spider'
import {
  autoStep,
  bonusCoins,
  canAutoComplete,
  canMove,
  canPickUp,
  canPlace,
  createPayOnce,
  deal,
  draw,
  finalScore,
  findHint,
  foundationFor,
  hasUsefulMove,
  liveScore,
  move,
  pileCards,
  rewardsFor,
  undo,
  takeHint,
  type KlondikeState,
  type PileId,
} from '../src/game/solitaire/klondike'
import { GOLF_SCORING, KLONDIKE_SCORING, PYRAMID_SCORING, SOLITAIRE_REWARDS, SPIDER_SCORING } from '../src/game/solitaire/scoring'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`ok   ${name}`)
  else {
    failures += 1
    console.log(`FAIL ${name} ${detail}`)
  }
}

function card(rank: Rank, suit: Suit, faceUp = true): Card {
  return { id: cardId(rank, suit), suit, rank, faceUp }
}

/** A hand-built position: empty piles unless given. */
function position(parts: Partial<Pick<KlondikeState, 'stock' | 'waste' | 'foundations' | 'tableau'>>): KlondikeState {
  return {
    ...deal(1),
    stock: parts.stock ?? [],
    waste: parts.waste ?? [],
    foundations: parts.foundations ?? [[], [], [], []],
    tableau: parts.tableau ?? [[], [], [], [], [], [], []],
    history: [],
  }
}

function allCards(state: KlondikeState) {
  return [...state.stock, ...state.waste, ...state.foundations.flat(), ...state.tableau.flat()]
}

// Dealing
const dealt = deal(12345)
check('7 tableau columns of 1 to 7 cards', dealt.tableau.map((pile) => pile.length).join(',') === '1,2,3,4,5,6,7')
check('only the top card of each column is face up', dealt.tableau.every((pile) => pile.every((c, i) => c.faceUp === (i === pile.length - 1))))
check('24 face-down cards in the stock', dealt.stock.length === 24 && dealt.stock.every((c) => !c.faceUp))
check('waste and foundations start empty', dealt.waste.length === 0 && dealt.foundations.every((pile) => pile.length === 0))
check('52 different cards', new Set(allCards(dealt).map((c) => c.id)).size === 52 && allCards(dealt).length === 52)
check('same seed gives the same deal', JSON.stringify(deal(777).tableau) === JSON.stringify(deal(777).tableau))
check('different seeds give different deals', JSON.stringify(deal(777).tableau) !== JSON.stringify(deal(778).tableau))

// Foundations
const f = position({})
check('Ace onto an empty foundation', canPlace(f, [card(1, 'hearts')], 'f0'))
check('2 onto an empty foundation is refused', !canPlace(f, [card(2, 'hearts')], 'f0'))
const f2 = position({ foundations: [[card(1, 'hearts')], [], [], []] })
check('2 of the same suit onto its Ace', canPlace(f2, [card(2, 'hearts')], 'f0'))
check('2 of another suit is refused', !canPlace(f2, [card(2, 'spades')], 'f0'))
check('3 onto an Ace is refused', !canPlace(f2, [card(3, 'hearts')], 'f0'))
check('two cards at once onto a foundation are refused', !canPlace(f, [card(1, 'hearts'), card(2, 'hearts')], 'f0'))

// Tableau
const t = position({ tableau: [[card(10, 'spades')], [], [card(10, 'hearts')], [], [], [], []] })
check('red 9 onto black 10', canPlace(t, [card(9, 'hearts')], 't0'))
check('black 9 onto black 10 is refused', !canPlace(t, [card(9, 'clubs')], 't0'))
check('red 9 onto red 10 is refused', !canPlace(t, [card(9, 'diamonds')], 't2'))
check('red 8 onto black 10 is refused', !canPlace(t, [card(8, 'hearts')], 't0'))
check('King onto an empty column', canPlace(t, [card(13, 'clubs')], 't1'))
check('Queen onto an empty column is refused', !canPlace(t, [card(12, 'clubs')], 't1'))
check('King-led run onto an empty column', canPlace(t, [card(13, 'clubs'), card(12, 'hearts')], 't1'))
check('nothing goes onto the stock or waste', !canPlace(t, [card(13, 'clubs')], 'stock') && !canPlace(t, [card(13, 'clubs')], 'waste'))

// Picking up runs
const run = position({
  tableau: [[card(5, 'spades', false), card(9, 'clubs'), card(8, 'hearts'), card(7, 'spades')], [card(10, 'diamonds')], [card(9, 'hearts'), card(7, 'clubs')], [], [], [], []],
})
check('a valid face-up run can be picked up', canPickUp(run, 't0', 1) && canPickUp(run, 't0', 2) && canPickUp(run, 't0', 3))
check('a face-down card cannot be picked up', !canPickUp(run, 't0', 0))
check('a broken run cannot be picked up', !canPickUp(run, 't2', 0))
const moved = move(run, 't0', 1, 't1')
check('a 3-card run moves onto a red 10', moved !== null && pileCards(moved, 't1').map((c) => c.id).join(',') === '10D,9C,8H,7S')
check('moving uncovers and turns over the card below', moved !== null && pileCards(moved, 't0')[0].faceUp)
check(
  'stacking a run and turning a card over both score',
  moved !== null && moved.points === KLONDIKE_SCORING.revealCard + KLONDIKE_SCORING.stackCard,
)
check('a refused move returns null', move(run, 't0', 2, 't1') === null)
const king = position({ tableau: [[card(3, 'clubs', false), card(13, 'hearts'), card(12, 'spades')], [], [], [], [], [], []] })
const kingMoved = move(king, 't0', 1, 't1')
check('King and its run move to an empty column', kingMoved !== null && pileCards(kingMoved, 't1').length === 2)

// Stock and waste
let s: KlondikeState | null = position({ stock: [card(2, 'clubs', false), card(7, 'hearts', false), card(4, 'spades', false)] })
s = draw(s)
check('draw turns the top stock card onto the waste', s !== null && s.waste.length === 1 && s.waste[0].id === '4S' && s.waste[0].faceUp)
s = draw(draw(s!)!)
check('drawing empties the stock', s !== null && s.stock.length === 0 && s.waste.length === 3)
const beforeRecycle = s!.points
s = draw(s!)
check('drawing from an empty stock turns the waste back over', s !== null && s.stock.length === 3 && s.waste.length === 0 && s.stock.every((c) => !c.faceUp))
check('going through the deck again costs no points', s !== null && s.points === beforeRecycle && s.recycles === 1)
s = draw(s!)
check('after recycling, cards come round in the same order', s !== null && s.waste[0].id === '4S')
check('no draw with an empty stock and waste', draw(position({})) === null)
const fromWaste = move(position({ waste: [card(9, 'hearts')], tableau: [[card(10, 'spades')], [], [], [], [], [], []] }), 'waste', 0, 't0')
check('stacking a stock card in a column scores', fromWaste !== null && fromWaste.points === KLONDIKE_SCORING.stackCard)
const shuffle1 = move(position({ tableau: [[card(10, 'spades')], [card(10, 'clubs')], [card(9, 'hearts')], [], [], [], []] }), 't2', 0, 't0')!
const shuffle2 = move(shuffle1, 't0', 1, 't1')!
check(
  'a card earns its stacking points only once',
  shuffle1.points === KLONDIKE_SCORING.stackCard && shuffle2.points === KLONDIKE_SCORING.stackCard && shuffle2.stacked.length === 1,
)
check('undo takes back the stacking points', undo(shuffle1)!.points === 0 && undo(shuffle1)!.stacked.length === 0)

// Cub Cash earned in play
const royals = position({
  tableau: [[card(13, 'spades')], [card(13, 'clubs')], [card(12, 'hearts')], [card(11, 'spades')], [], [], []],
})
const queenOnKing = move(royals, 't2', 0, 't0')!
check('a Queen put on a King earns a coin', bonusCoins(queenOnKing) === SOLITAIRE_REWARDS.faceStackCoins)
const jackOnQueen = move(queenOnKing, 't3', 0, 't0')!
check('a Jack put on that Queen earns another', bonusCoins(jackOnQueen) === 2 * SOLITAIRE_REWARDS.faceStackCoins)
const pairMoved = move(jackOnQueen, 't0', 1, 't1')!
check('moving the pair onto another King earns nothing more', bonusCoins(pairMoved) === 2 * SOLITAIRE_REWARDS.faceStackCoins)
const jackFirst = move(position({ tableau: [[card(13, 'spades')], [card(12, 'hearts')], [card(11, 'spades')], [], [], [], []] }), 't2', 0, 't1')!
const pairOntoKing = move(jackFirst, 't1', 0, 't0')!
check('a Jack on a Queen, then the pair onto a King, earns 2 coins', bonusCoins(jackFirst) === 1 && bonusCoins(pairOntoKing) === 2)
check('undo takes a coin back', bonusCoins(undo(queenOnKing)!) === 0)
check(
  'a non-face card on a face card earns no coin',
  bonusCoins(move(position({ tableau: [[card(11, 'spades')], [card(10, 'hearts')], [], [], [], [], []] }), 't1', 0, 't0')!) === 0,
)
const aceHome = move(position({ waste: [card(1, 'clubs')] }), 'waste', 0, 'f0')!
check('an Ace put home earns a coin', bonusCoins(aceHome) === SOLITAIRE_REWARDS.aceCoins)
check(
  'coins earned in play are paid even without a win',
  rewardsFor({ ...pairOntoKing, coinCards: [...pairOntoKing.coinCards, ...aceHome.coinCards] }, 100).coins === 3,
)
check('only the top waste card can be moved', !canPickUp(position({ waste: [card(9, 'hearts'), card(3, 'clubs')] }), 'waste', 0))

// No point farming
const farm = position({ tableau: [[card(1, 'hearts')], [card(2, 'spades')], [], [], [], [], []] })
const home = move(farm, 't0', 0, 'f0')!
const back = move(position({ foundations: [[card(1, 'hearts')], [], [], []], tableau: [[], [card(2, 'spades')], [], [], [], [], []] }), 'f0', 0, 't1')
check('to foundation scores', home.points === KLONDIKE_SCORING.toFoundation)
check('taking a card back costs more than putting it home earned', back !== null && back.points + KLONDIKE_SCORING.toFoundation < 0)

// Undo
const u0 = deal(42)
const u1 = draw(u0)!
const u2 = undo(u1)!
check('undo restores the piles', JSON.stringify(u2.stock) === JSON.stringify(u0.stock) && u2.waste.length === 0)
check('undo counts and keeps its penalty', u2.undos === 1 && u2.penalty === KLONDIKE_SCORING.undo)
const flipped = move(run, 't0', 1, 't1')!
const unflipped = undo(flipped)!
check('undo takes back the points of the move', unflipped.points === 0 && !pileCards(unflipped, 't0')[0].faceUp)
check('nothing to undo at the start', undo(deal(5)) === null)
let cycle = move(run, 't0', 1, 't1')!
for (let i = 0; i < 5; i += 1) cycle = move(undo(cycle)!, 't0', 1, 't1')!
check('repeating a move with undo never gains points', liveScore(cycle) <= KLONDIKE_SCORING.revealCard)

// Hints
const h = findHint(position({ waste: [card(1, 'clubs')] }))
check('hint suggests an Ace going home', h.kind === 'move' && h.from === 'waste')
check('hint suggests drawing when nothing moves', findHint(position({ stock: [card(5, 'clubs', false)] })).kind === 'draw')
check('hint suggests recycling an empty stock', findHint(position({ waste: [card(5, 'clubs')], tableau: [[card(5, 'spades')], [], [], [], [], [], []] })).kind === 'recycle')
const hinted = takeHint(position({ waste: [card(1, 'clubs')] }))
check('a hint costs points and is counted', hinted.state.hints === 1 && hinted.state.penalty === KLONDIKE_SCORING.hint)
check('double-tap finds the foundation for a card', foundationFor(position({ waste: [card(1, 'clubs')] }), 'waste', 0) === 'f0')

// Auto-complete and winning
const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
const nearlyDone = position({
  stock: [card(13, 'clubs', false)],
  // Missing from the foundations: J-Q-K of clubs, K of spades, Q-K of hearts, K of diamonds. All are below.
  foundations: suits.map((suit) =>
    Array.from({ length: suit === 'clubs' ? 10 : suit === 'hearts' ? 11 : 12 }, (_, i) => card((i + 1) as Rank, suit)),
  ),
  tableau: [[card(13, 'spades'), card(12, 'hearts'), card(11, 'clubs')], [card(13, 'hearts')], [card(13, 'diamonds'), card(12, 'clubs')], [], [], [], []],
})
check('auto-complete is offered when every tableau card is face up', canAutoComplete(nearlyDone))
check('auto-complete is not offered with face-down cards', !canAutoComplete(deal(9)))
let auto: KlondikeState | null = nearlyDone
let steps = 0
while (auto && !auto.won && steps < 200) {
  auto = autoStep(auto)
  steps += 1
}
check('auto-complete finishes the game', auto !== null && auto.won)
check('auto-complete recycling is free', auto !== null && auto.points >= nearlyDone.points)
check('a won game takes no more moves', auto !== null && draw(auto) === null && undo(auto) === null)

// Scoring and rewards
const unfinished = { ...deal(3), points: 120, penalty: -20 }
check('unfinished games get no win or time bonus', finalScore(unfinished, 100) === 100)
check('an unfinished game that earned no coins pays no Cub Cash', rewardsFor(unfinished, 100).coins === 0)
const wonGame = { ...auto!, points: 600, penalty: -30 }
const wonScore = finalScore(wonGame, 200)
check('a win adds the win bonus and time bonus', wonScore === 570 + KLONDIKE_SCORING.winBonus + KLONDIKE_SCORING.timeBonusMax - 200 * KLONDIKE_SCORING.timeBonusPerSecond)
check('the time bonus never goes below 0', finalScore(wonGame, 100000) === 570 + KLONDIKE_SCORING.winBonus)
check('a win pays its Cub Cash on top of coins earned in play', rewardsFor(wonGame, 200).coins === bonusCoins(wonGame) + SOLITAIRE_REWARDS.winCoins)
check(
  'a Hard win pays the bigger win bonus',
  rewardsFor({ ...wonGame, drawCount: 3 }, 200).coins === bonusCoins(wonGame) + SOLITAIRE_REWARDS.hardWinCoins,
)
check(
  'a win pays XP for its cards plus the win XP',
  rewardsFor(wonGame, 200).xp === wonGame.stacked.length + wonGame.homed.length + SOLITAIRE_REWARDS.winXp,
)
const ids = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`)
check(
  'an unfinished game pays XP for every card stacked and every card home',
  rewardsFor({ ...deal(3), stacked: ids(30, 's'), homed: ids(20, 'h') }, 400).xp === 50,
)
check('score never goes below 0', liveScore({ ...deal(3), points: -50, penalty: -200 }) === 0)

// Paying once
const payer = createPayOnce()
let paidTimes = 0
payer.pay(() => (paidTimes += 1))
payer.pay(() => (paidTimes += 1))
payer.pay(() => (paidTimes += 1))
check('rewards are paid only once per game', paidTimes === 1 && payer.paid)

// Spotting when no useful moves are left
const stuck = position({
  tableau: [[card(9, 'spades')], [card(4, 'hearts', false), card(9, 'clubs')], [], [], [], [], []],
  stock: [card(5, 'diamonds', false), card(2, 'clubs', false)],
})
check('a board with nothing left to play is spotted', !hasUsefulMove(stuck))
check('a stock card that fits somewhere still counts', hasUsefulMove({ ...stuck, stock: [...stuck.stock, card(8, 'hearts', false)] }))
check(
  'a column move that turns a card over still counts',
  hasUsefulMove(position({ tableau: [[card(9, 'spades')], [card(4, 'hearts', false), card(8, 'hearts')], [], [], [], [], []] })),
)
check(
  'moving a lone King between empty columns does not count',
  !hasUsefulMove(
    position({
      tableau: [[card(13, 'spades')], [], [card(4, 'hearts', false), card(9, 'clubs')], [], [], [], []],
      stock: [card(5, 'diamonds', false)],
    }),
  ),
)
check(
  'uncovering a card that can go home counts',
  hasUsefulMove(
    position({
      tableau: [[card(10, 'hearts')], [card(3, 'hearts', false), card(2, 'hearts'), card(9, 'spades')], [], [], [], [], []],
      foundations: [[card(1, 'hearts')], [], [], []],
    }),
  ),
)

// Hard: drawing three
const three = draw({ ...position({ stock: [card(2, 'clubs', false), card(7, 'hearts', false), card(4, 'spades', false), card(9, 'diamonds', false)] }), drawCount: 3 })!
check(
  'Hard turns over three cards, the last one on top',
  three.waste.map((c) => c.id).join(',') === '9D,4S,7H' && three.stock.length === 1 && three.waste.every((c) => c.faceUp),
)
check('Hard draws what is left when fewer than three remain', draw(three)!.waste.length === 4 && draw(three)!.stock.length === 0)
check('only the top card of a Hard draw can be played', !canPickUp(three, 'waste', 1) && canPickUp(three, 'waste', 2))
check('a Hard deal remembers its draw count', deal(7, 3).drawCount === 3 && deal(7).drawCount === 1)
const buried = position({
  tableau: [[card(10, 'spades')], [card(4, 'diamonds', false), card(8, 'clubs')], [], [], [], [], []],
  stock: [card(5, 'clubs', false), card(9, 'hearts', false), card(6, 'clubs', false)],
})
check('Hard spots a playable card it can never reach as no more moves', !hasUsefulMove({ ...buried, drawCount: 3 }))
check('the same card counts on Easy, where every card comes up', hasUsefulMove(buried))

// Play many deals with hints and check nothing is ever lost or duplicated
let wins = 0
let broken = 0
let falseStuck = 0
for (let seed = 1; seed <= 300; seed += 1) {
  let game = deal(seed)
  let saidStuck = false
  for (let turn = 0; turn < 600 && !game.won; turn += 1) {
    if (!hasUsefulMove(game)) saidStuck = true
    if (canAutoComplete(game)) {
      game = autoStep(game) ?? game
      continue
    }
    const hint = findHint(game)
    let next: KlondikeState | null = null
    if (hint.kind === 'move') next = move(game, hint.from, hint.index, hint.to as PileId)
    else if ((hint.kind === 'draw' || hint.kind === 'recycle') && game.recycles < 3) next = draw(game)
    if (!next) break
    game = next
    const cards = allCards(game)
    if (cards.length !== 52 || new Set(cards.map((c) => c.id)).size !== 52) broken += 1
  }
  if (game.won) wins += 1
  if (game.won && saidStuck) falseStuck += 1
}
check('300 played deals never lose or duplicate a card', broken === 0, `${broken} broken`)
check('a deal that goes on to be won is never called stuck', falseStuck === 0, `${falseStuck} wrongly stuck`)
check('the hint-following player wins some deals', wins > 0, `${wins} wins`)
console.log(`     (hint-following player won ${wins} of 300 deals)`)

// ---------------------------------------------------------------- Flipflop

function ffPosition(parts: Partial<Pick<FlipflopState, 'stock' | 'reserves' | 'foundations' | 'tableau'>>, difficulty: FlipflopDifficulty = 'hard'): FlipflopState {
  return {
    ...dealFlipflop(1, difficulty),
    stock: parts.stock ?? [],
    reserves: parts.reserves ?? [[], []],
    foundations: parts.foundations ?? [[], [], [], []],
    tableau: parts.tableau ?? [[], [], [], [], []],
    history: [],
  }
}

function ffAllCards(state: FlipflopState) {
  return [...state.stock, ...state.reserves.flat(), ...state.foundations.flat(), ...state.tableau.flat()]
}

for (const level of ['easy', 'hard'] as const) {
  const d = dealFlipflop(12345, level)
  const cards = ffAllCards(d)
  check(`Flipflop ${level}: 5 columns of 5 cards`, d.tableau.length === 5 && d.tableau.every((pile) => pile.length === 5))
  check(`Flipflop ${level}: 4 face down and 1 face up in each column`, d.tableau.every((pile) => pile.every((c, i) => c.faceUp === (i === 4))))
  check(`Flipflop ${level}: 27 face-down cards in the stock`, d.stock.length === 27 && d.stock.every((c) => !c.faceUp))
  check(`Flipflop ${level}: 52 cards, every id different`, cards.length === 52 && new Set(cards.map((c) => c.id)).size === 52)
  check(
    `Flipflop ${level}: every rank appears 4 times`,
    ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as Rank[]).every((r) => cards.filter((c) => c.rank === r).length === 4),
  )
}
check('Flipflop Easy uses only spades', ffAllCards(dealFlipflop(9, 'easy')).every((c) => c.suit === 'spades'))
check(
  'Flipflop Hard uses spades and hearts, 26 each',
  ffAllCards(dealFlipflop(9, 'hard')).filter((c) => c.suit === 'spades').length === 26 &&
    ffAllCards(dealFlipflop(9, 'hard')).filter((c) => c.suit === 'hearts').length === 26,
)
check('Flipflop: same seed gives the same deal', JSON.stringify(dealFlipflop(77, 'hard').tableau) === JSON.stringify(dealFlipflop(77, 'hard').tableau))
check('Flipflop: copies share their artwork name', cardArtId({ rank: 13, suit: 'spades' }) === 'KS' && makeSuitDeck(['spades']).filter((c) => cardArtId(c) === 'KS').length === 4)

// Building
const ffT = ffPosition({ tableau: [[card(8, 'spades')], [], [card(13, 'hearts')], [card(1, 'spades')], []] })
check('Flipflop: a 7 goes on an 8', ffCanPlace(ffT, [card(7, 'hearts')], 't0'))
check('Flipflop: a 9 goes on an 8', ffCanPlace(ffT, [card(9, 'spades')], 't0'))
check('Flipflop: any suit builds', ffCanPlace(ffT, [card(9, 'hearts')], 't0') && ffCanPlace(ffT, [card(7, 'spades')], 't0'))
check('Flipflop: a 6 on an 8 is refused', !ffCanPlace(ffT, [card(6, 'spades')], 't0'))
check('Flipflop: an 8 on an 8 is refused', !ffCanPlace(ffT, [card(8, 'hearts')], 't0'))
check('Flipflop: no Ace on a King', !ffCanPlace(ffT, [card(1, 'hearts')], 't2'))
check('Flipflop: no King on an Ace', !ffCanPlace(ffT, [card(13, 'spades')], 't3'))
check('Flipflop: a Queen on a King, and a 2 on an Ace', ffCanPlace(ffT, [card(12, 'spades')], 't2') && ffCanPlace(ffT, [card(2, 'hearts')], 't3'))
check('Flipflop: any card goes into an empty column', ffCanPlace(ffT, [card(5, 'hearts')], 't1') && ffCanPlace(ffT, [card(12, 'spades')], 't4'))

// Picking up runs
const runs = ffPosition({
  tableau: [
    [card(3, 'hearts', false), card(9, 'spades'), card(8, 'spades'), card(7, 'spades')],
    [card(5, 'spades'), card(6, 'spades'), card(7, 'spades')],
    [card(9, 'spades'), card(8, 'hearts'), card(7, 'spades')],
    [card(9, 'spades'), card(8, 'spades'), card(9, 'spades')],
    [card(10, 'hearts')],
  ],
})
check('Flipflop: a same-suit run going down moves together', ffCanPickUp(runs, 't0', 1) && ffCanPickUp(runs, 't0', 2))
check('Flipflop: a same-suit run going up moves together', ffCanPickUp(runs, 't1', 0))
check('Flipflop: a mixed-suit run cannot move together', !ffCanPickUp(runs, 't2', 0) && !ffCanPickUp(runs, 't2', 1))
check('Flipflop: a run that changes direction cannot move together', !ffCanPickUp(runs, 't3', 0))
check('Flipflop: the single top card always moves', ffCanPickUp(runs, 't2', 2) && ffCanPickUp(runs, 't3', 2))
check('Flipflop: a face-down card cannot be picked up', !ffCanPickUp(runs, 't0', 0))
const ffMoved = ffMove(runs, 't0', 1, 't4')
check(
  'Flipflop: a run moves onto a card one away from its lead',
  ffMoved !== null && ffPileCards(ffMoved, 't4').map((c) => c.rank).join(',') === '10,9,8,7',
)
check('Flipflop: moving uncovers and turns over the card below', ffMoved !== null && ffPileCards(ffMoved, 't0')[0].faceUp)
check(
  'Flipflop: stacking and turning over score like Classic',
  ffMoved !== null && ffMoved.points === KLONDIKE_SCORING.stackCard + KLONDIKE_SCORING.revealCard,
)
check('Flipflop: a refused move returns null', ffMove(runs, 't2', 0, 't4') === null)

// Foundations
const ffF = ffPosition({ foundations: [[card(1, 'hearts')], [], [], []] })
check('Flipflop: an Ace starts a foundation', ffCanPlace(ffF, [card(1, 'spades')], 'f1'))
check('Flipflop: a 2 of the same suit goes on its Ace', ffCanPlace(ffF, [card(2, 'hearts')], 'f0'))
check('Flipflop: a 2 of another suit is refused', !ffCanPlace(ffF, [card(2, 'spades')], 'f0'))
check('Flipflop: two cards at once onto a foundation are refused', !ffCanPlace(ffF, [card(2, 'hearts'), card(3, 'hearts')], 'f0'))
const ffBack = ffMove(ffPosition({ foundations: [[card(1, 'hearts')], [], [], []], tableau: [[card(2, 'spades')], [], [], [], []] }), 'f0', 0, 't0')
check('Flipflop: taking a card back off a foundation costs points', ffBack !== null && ffBack.points === KLONDIKE_SCORING.foundationToTableau)

// Dealing from the stock and the reserves
let dealing: FlipflopState | null = dealFlipflop(4, 'hard')
const firstDeal = ffDeal(dealing)!
check('Flipflop: a deal puts one face-up card on every column', firstDeal.tableau.every((pile) => pile.length === 6 && pile[5].faceUp))
check('Flipflop: a deal takes 5 cards from the stock', firstDeal.stock.length === 22)
for (let i = 0; i < 4; i += 1) dealing = ffDeal(dealing!)
const lastDeal = ffDeal(dealing!)
check('Flipflop: the fifth deal empties the stock', dealing !== null && dealing.stock.length === 7 && lastDeal !== null && lastDeal.stock.length === 0)
check('Flipflop: the last 2 cards go face up to the reserves', lastDeal !== null && lastDeal.reserves.every((pile) => pile.length === 1 && pile[0].faceUp))
check('Flipflop: no more deals once the stock is empty', lastDeal !== null && ffDeal(lastDeal) === null)
check('Flipflop: dealing into an empty column is allowed', ffDeal({ ...firstDeal, tableau: [[], ...firstDeal.tableau.slice(1)] }) !== null)
const reserveGame = ffPosition({ reserves: [[card(7, 'hearts')], [card(2, 'spades')]], tableau: [[card(8, 'spades')], [], [], [], []] })
check('Flipflop: a reserve card plays onto a column', ffMove(reserveGame, 'r0', 0, 't0') !== null)
check('Flipflop: nothing goes onto a reserve', !ffCanPlace(reserveGame, [card(3, 'spades')], 'r1'))
check('Flipflop: nothing goes onto the stock', !ffCanPlace(reserveGame, [card(3, 'spades')], 'stock'))

// Coins, undo, hints
const ffRoyal = ffPosition({ tableau: [[card(12, 'spades')], [card(13, 'hearts')], [card(11, 'spades')], [], []] })
const kingOnQueen = ffMove(ffRoyal, 't1', 0, 't0')!
check('Flipflop: a King on a Queen earns a coin (building up counts)', bonusCoins(kingOnQueen) === SOLITAIRE_REWARDS.faceStackCoins)
check('Flipflop: undo takes the coin and points back', bonusCoins(ffUndo(kingOnQueen)!) === 0 && ffUndo(kingOnQueen)!.points === 0)
check('Flipflop: undo keeps its penalty', ffUndo(kingOnQueen)!.penalty === KLONDIKE_SCORING.undo)
const ffAce = ffMove(ffPosition({ reserves: [[card(1, 'spades')], []] }), 'r0', 0, 'f0')!
check('Flipflop: an Ace put home earns a coin', bonusCoins(ffAce) === SOLITAIRE_REWARDS.aceCoins)
check('Flipflop: hint sends an Ace home first', (() => {
  const h = ffFindHint(ffPosition({ reserves: [[card(1, 'spades')], []], stock: [card(4, 'clubs', false)] }))
  return h.kind === 'move' && h.from === 'r0' && h.to.startsWith('f')
})())
check('Flipflop: hint deals when nothing else helps', ffFindHint(ffPosition({ stock: [card(4, 'spades', false)], tableau: [[card(9, 'spades')], [], [], [], []] })).kind === 'draw')
check('Flipflop: double-tap finds the foundation', ffFoundationFor(ffPosition({ tableau: [[card(1, 'hearts')], [], [], [], []] }), 't0', 0) === 'f0')
const ffWinRewards = ffRewardsFor({ ...ffPosition({}, 'hard'), won: true, points: 500 }, 100)
check(
  'Flipflop: a Hard win pays the Hard win coins and bonuses',
  ffWinRewards.coins === SOLITAIRE_REWARDS.hardWinCoins &&
    ffWinRewards.score === 500 + KLONDIKE_SCORING.winBonus + KLONDIKE_SCORING.timeBonusMax - 100 * KLONDIKE_SCORING.timeBonusPerSecond,
)
check('Flipflop: an Easy win pays the Easy win coins', ffRewardsFor({ ...ffPosition({}, 'easy'), won: true }, 100).coins === SOLITAIRE_REWARDS.winCoins)

// Stuck detection
const ffStuck = ffPosition({ tableau: [[card(3, 'spades', false), card(9, 'spades')], [card(5, 'hearts')], [card(12, 'hearts')], [card(2, 'hearts', false), card(7, 'spades')], [card(10, 'spades', false), card(1, 'hearts', false), card(2, 'spades')]] })
check('Flipflop: a board with nothing left to play is spotted', !ffHasUsefulMove(ffStuck))
check('Flipflop: cards left in the stock always count', ffHasUsefulMove({ ...ffStuck, stock: [card(4, 'hearts', false)] }))
check('Flipflop: a reserve card that fits counts', ffHasUsefulMove({ ...ffStuck, reserves: [[card(8, 'hearts')], []] }))
check(
  'Flipflop: a column move that turns a card over counts',
  ffHasUsefulMove({ ...ffStuck, tableau: [[card(3, 'spades', false), card(6, 'spades')], ...ffStuck.tableau.slice(1)] }),
)

// Many played deals with the hint-following player
for (const level of ['easy', 'hard'] as const) {
  let ffWins = 0
  let ffBroken = 0
  let ffFalseStuck = 0
  for (let seed = 1; seed <= 300; seed += 1) {
    let game = dealFlipflop(seed, level)
    let saidStuck = false
    for (let turn = 0; turn < 800 && !game.won; turn += 1) {
      if (!ffHasUsefulMove(game)) saidStuck = true
      const hint = ffFindHint(game)
      const next = hint.kind === 'move' ? ffMove(game, hint.from, hint.index, hint.to) : hint.kind === 'draw' ? ffDeal(game) : null
      if (!next) break
      game = next
      const all = ffAllCards(game)
      if (all.length !== 52 || new Set(all.map((c) => c.id)).size !== 52) ffBroken += 1
    }
    if (game.won) ffWins += 1
    if (game.won && saidStuck) ffFalseStuck += 1
  }
  check(`Flipflop ${level}: 300 played deals never lose or duplicate a card`, ffBroken === 0, `${ffBroken} broken`)
  check(`Flipflop ${level}: a deal that goes on to be won is never called stuck`, ffFalseStuck === 0, `${ffFalseStuck} wrongly stuck`)
  console.log(`     (Flipflop ${level}: hint-following player won ${ffWins} of 300 deals)`)
}

// ---------------------------------------------------------------- Pyramid

/** A pyramid built from ranks (0 = already removed), bottom row last. */
function pyPosition(ranks: number[], parts: Partial<Pick<PyramidState, 'stock' | 'waste'>> = {}, difficulty: PyramidDifficulty = 'easy'): PyramidState {
  const suitsCycle: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
  return {
    ...dealPyramid(1, difficulty),
    pyramid: ranks.map((rank, i) => (rank === 0 ? null : { ...card(rank as Rank, suitsCycle[i % 4]), id: `${cardId(rank as Rank, suitsCycle[i % 4])}#${i}` })),
    stock: parts.stock ?? [],
    waste: parts.waste ?? [],
    foundations: [[]],
    passes: 1,
    history: [],
  }
}
/** n removed positions from the top, to be followed by the ranks of the rest. */
const cleared = (n: number): number[] => Array(n).fill(0)
const pyAll = (s: PyramidState) => [...s.pyramid.filter((c) => c !== null), ...s.stock, ...s.waste, ...s.foundations.flat()]

for (const level of ['easy', 'hard'] as const) {
  const d = dealPyramid(4242, level)
  check(`Pyramid ${level}: exactly 28 cards in the pyramid`, d.pyramid.length === 28 && d.pyramid.every((c) => c !== null && c.faceUp))
  check(`Pyramid ${level}: exactly 24 cards in the stock, face down`, d.stock.length === 24 && d.stock.every((c) => !c.faceUp) && d.waste.length === 0)
  check(`Pyramid ${level}: all 52 cards different`, pyAll(d).length === 52 && new Set(pyAll(d).map((c) => c.id)).size === 52)
  check(`Pyramid ${level}: only the bottom 7 cards start free`, PYRAMID_PILES.filter((p) => pyCanPickUp(d, p, 0)).join(',') === PYRAMID_PILES.slice(21).join(','))
  check(`Pyramid ${level}: same seed gives the same deal`, JSON.stringify(dealPyramid(99, level).pyramid) === JSON.stringify(dealPyramid(99, level).pyramid))
}

// Covering: position 15 (row 6) rests on 21 and 22 (the bottom row).
const cover = pyPosition([...cleared(15), 6, 1, 1, 1, 1, 1, 7, 2, 1, 1, 1, 1, 1])
check('Pyramid: a covered card cannot be picked up or paired', !pyCanPickUp(cover, 'p15', 0) && !pyCanMove(cover, 'p21', 0, 'p15'))
check('Pyramid: a covered card is shown dimmed', pyCovered(cover, 'p15') && !pyCovered(cover, 'p21'))
const halfOpen = pyMove(pyPosition([...cleared(15), 6, 1, 1, 1, 1, 1, 7, 2, 1, 1, 1, 1, 6]), 'p21', 0, 'p27')!
check('Pyramid: a card with one card still on it stays covered', halfOpen !== null && !pyCanPickUp(halfOpen, 'p15', 0))
const opened = pyMove(pyPosition([...cleared(15), 6, 1, 1, 1, 1, 1, 7, 6, 1, 1, 1, 1, 1]), 'p21', 0, 'p22')!
check('Pyramid: removing both cards below frees the card above', opened !== null && pyCanPickUp(opened, 'p15', 0))
check(
  'Pyramid: removing a pair scores both cards and the card freed',
  opened.points === 2 * PYRAMID_SCORING.clearPyramidCard + PYRAMID_SCORING.uncoverCard,
)

// Pairs and Kings
const pairs = pyPosition([...cleared(21), 6, 7, 5, 8, 13, 12, 1])
check('Pyramid: 6 + 7 pair', pyCanMove(pairs, 'p21', 0, 'p22'))
check('Pyramid: 5 + 8 pair', pyCanMove(pairs, 'p23', 0, 'p24'))
check('Pyramid: Queen + Ace pair', pyCanMove(pairs, 'p26', 0, 'p27'))
check('Pyramid: 6 + 5 is refused', !pyCanMove(pairs, 'p21', 0, 'p23'))
check('Pyramid: a King goes alone', pyCanMove(pairs, 'p25', 0, PY_DISCARD) && pyTapMove(pairs, 'p25', 0) === PY_DISCARD)
check('Pyramid: other cards cannot go alone', !pyCanMove(pairs, 'p26', 0, PY_DISCARD) && pyTapMove(pairs, 'p26', 0) === null)
check('Pyramid: every pair the rules allow adds to 13', (() => {
  const g = dealPyramid(7, 'easy')
  const free = [...PYRAMID_PILES, 'waste']
  return free.every((a) => free.every((b) => !pyCanMove(g, a, 0, b) || pyPileCards(g, a)[0].rank + pyPileCards(g, b)[0].rank === 13))
})())
const kingGone = pyMove(pairs, 'p25', 0, PY_DISCARD)!
check('Pyramid: a removed King lands on the discard pile', kingGone.foundations[0].length === 1 && kingGone.pyramid[25] === null)
check('Pyramid: removing cards without clearing a row earns no coins', pyRewardsFor(pyMove(kingGone, 'p26', 0, 'p27')!, 0).coins === 0)
const lastOfRow = pyPosition([1, ...cleared(20), 0, 0, 0, 0, 0, 6, 7])
const rowDone = pyMove(lastOfRow, 'p26', 0, 'p27')!
check(
  'Pyramid: clearing a row earns a coin',
  pyRewardsFor(rowDone, 0).coins === PYRAMID_SCORING.rowCoins && rowDone.coinCards.length === 1,
  `coins ${pyRewardsFor(rowDone, 0).coins}, coin cards ${rowDone.coinCards.join(' ')}`,
)
check('Pyramid: undo takes the row coin back', pyUndo(rowDone)!.coinCards.length === 0)
const twoRows = pyPosition([1, ...cleared(14), 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7])
check('Pyramid: one pair can clear two rows for two coins', pyMove(twoRows, 'p15', 0, 'p27')?.coinCards.length === 2)

// Waste
const withWaste = pyPosition([...cleared(21), 6, 1, 1, 1, 1, 1, 1], { waste: [card(5, 'clubs'), card(7, 'hearts')] })
check('Pyramid: a free card pairs with the top waste card', pyCanMove(withWaste, 'p21', 0, 'waste') && pyCanMove(withWaste, 'waste', 1, 'p21'))
check('Pyramid: the card under the top waste card is not free', !pyCanPickUp(withWaste, 'waste', 0))
const wastePair = pyMove(withWaste, 'waste', 1, 'p21')!
check('Pyramid: pairing with the waste removes both', wastePair.waste.length === 1 && wastePair.pyramid[21] === null)
check('Pyramid: a stock card used scores less than a pyramid card', wastePair.points === PYRAMID_SCORING.clearPyramidCard + PYRAMID_SCORING.clearStockCard)
check('Pyramid: a King on the waste goes alone', pyCanMove(pyPosition(Array(28).fill(1), { waste: [card(13, 'clubs')] }), 'waste', 0, PY_DISCARD))

// Stock passes
for (const level of ['easy', 'hard'] as const) {
  let g: PyramidState | null = dealPyramid(11, level)
  for (let i = 0; i < 24; i += 1) g = pyDraw(g!)
  check(`Pyramid ${level}: 24 draws empty the stock onto the waste`, g !== null && g.stock.length === 0 && g.waste.length === 24 && g.waste.every((c) => c.faceUp))
  let passes = 1
  while (g && pyCanRecycle(g)) {
    g = pyDraw(g)!
    passes += 1
    for (let i = 0; i < 24; i += 1) g = pyDraw(g!)
  }
  const allowed = PYRAMID_SETTINGS.difficulty[level].passes
  check(`Pyramid ${level}: the stock can be gone through ${allowed} time(s), no more`, passes === allowed && pyDraw(g!) === null)
}
check('Pyramid: turning the stock over is free', (() => {
  let g = dealPyramid(11, 'easy')
  for (let i = 0; i < 24; i += 1) g = pyDraw(g)!
  return pyDraw(g)!.points === g.points
})())

// Undo
const u = pyDraw(dealPyramid(5, 'easy'))!
const uPair = pyMove(pyPosition([...cleared(15), 6, 1, 1, 1, 1, 1, 7, 6, 1, 1, 1, 1, 1]), 'p21', 0, 'p22')!
check('Pyramid: undo puts a drawn card back on the stock', JSON.stringify(pyUndo(u)!.stock) === JSON.stringify(dealPyramid(5, 'easy').stock) && pyUndo(u)!.waste.length === 0)
check('Pyramid: undo restores a removed pair and its points', (() => {
  const back = pyUndo(uPair)!
  return back.pyramid[21] !== null && back.pyramid[22] !== null && back.foundations[0].length === 0 && back.points === 0 && !pyCanPickUp(back, 'p15', 0)
})())
check('Pyramid: undo keeps its penalty', pyUndo(uPair)!.penalty === KLONDIKE_SCORING.undo)
check('Pyramid: undo restores the passes used', (() => {
  let g = dealPyramid(11, 'easy')
  for (let i = 0; i < 24; i += 1) g = pyDraw(g)!
  const turned = pyDraw(g)!
  return turned.passes === 2 && pyUndo(turned)!.passes === 1
})())

// Win and loss
const lastPair = pyPosition([...cleared(27), 13], { stock: [card(4, 'clubs', false)] })
const won = pyMove(lastPair, 'p27', 0, PY_DISCARD)!
check('Pyramid: clearing the pyramid wins, even with cards left in the stock', won.won)
check('Pyramid: a won game takes no more moves', pyDraw(won) === null && pyUndo(won) === null)
check('Pyramid: not won while a pyramid card is left', !pyMove(pyPosition([...cleared(26), 13, 13]), 'p27', 0, PY_DISCARD)!.won)
const dead = pyPosition([...cleared(21), 2, 2, 3, 3, 4, 4, 5], {}, 'hard')
check('Pyramid: no pairs, no Kings and no stock is spotted as no more moves', !pyHasUsefulMove(dead))
check('Pyramid: cards left to draw still count', pyHasUsefulMove({ ...dead, stock: [card(9, 'clubs', false)] }))
check('Pyramid: a stock that can still be turned over counts', pyHasUsefulMove({ ...dead, difficulty: 'easy', waste: [card(9, 'clubs')] }))
check('Pyramid: on Hard a used-up stock does not count', !pyHasUsefulMove({ ...dead, waste: [card(6, 'clubs')] }))
check('Pyramid: a pair with the waste counts', pyHasUsefulMove({ ...dead, waste: [card(11, 'clubs')] }))
check(
  'Pyramid: a win pays the win coins and bonuses for its difficulty',
  pyRewardsFor({ ...won, difficulty: 'hard' }, 0).coins === PYRAMID_SCORING.rowCoins + SOLITAIRE_REWARDS.hardWinCoins &&
    pyRewardsFor(won, 0).coins === PYRAMID_SCORING.rowCoins + SOLITAIRE_REWARDS.winCoins &&
    pyRewardsFor(won, 100000).score === pyLiveScore(won) + KLONDIKE_SCORING.winBonus,
)
check('Pyramid: scores go to their own keys', boardKey('pyramid', 'easy') === 'solitaire-pyramid' && boardKey('pyramid', 'hard') === 'solitaire-pyramid-hard')
check(
  'Pyramid: earlier modes keep their keys',
  boardKey('classic', 'easy') === 'solitaire' && boardKey('classic', 'hard') === 'solitaire-hard' && boardKey('flipflop', 'hard') === 'solitaire-flipflop-hard',
)
for (const level of ['easy', 'hard'] as const) {
  const list = PYRAMID_DEALS[level]
  const sample = list.slice(0, 15)
  check(
    `Pyramid ${level}: checked deals can be won (${sample.length} of ${list.length} rechecked)`,
    list.length > 0 && sample.every((seed) => pyramidWinnable(dealPyramid(list.indexOf(seed), level), 50000) === 'won'),
  )
}

// Many played deals with the hint-following player
for (const level of ['easy', 'hard'] as const) {
  let pyWins = 0
  let pyBroken = 0
  let pyFalseStuck = 0
  for (let seed = 1; seed <= 200; seed += 1) {
    let game = dealPyramid(seed, level)
    let saidStuck = false
    for (let turn = 0; turn < 400 && !game.won; turn += 1) {
      if (!pyHasUsefulMove(game)) saidStuck = true
      const hint = pyFindHint(game)
      const next = hint.kind === 'move' ? pyMove(game, hint.from, hint.index, hint.to) : hint.kind === 'none' ? null : pyDraw(game)
      if (!next) break
      game = next
      const all = pyAll(game)
      if (all.length !== 52 || new Set(all.map((c) => c.id)).size !== 52) pyBroken += 1
    }
    if (game.won) pyWins += 1
    if (game.won && saidStuck) pyFalseStuck += 1
  }
  check(`Pyramid ${level}: 200 played deals never lose or duplicate a card`, pyBroken === 0, `${pyBroken} broken`)
  check(`Pyramid ${level}: a deal that goes on to be won is never called stuck`, pyFalseStuck === 0, `${pyFalseStuck} wrongly stuck`)
  console.log(`     (Pyramid ${level}: hint-following player won ${pyWins} of 200 deals)`)
}

// ---------------------------------------------------------------- FreeCell

function fcPosition(parts: Partial<Pick<FreecellState, 'cells' | 'foundations' | 'tableau'>>, difficulty: FreecellDifficulty = 'easy'): FreecellState {
  return {
    ...freshFreecell(1, difficulty),
    cells: parts.cells ?? [null, null, null, null],
    foundations: parts.foundations ?? [[], [], [], []],
    tableau: parts.tableau ?? [[], [], [], [], [], [], [], []],
    history: [],
  }
}
const fcAll = (s: FreecellState) => [...s.cells.filter((c) => c !== null), ...s.foundations.flat(), ...s.tableau.flat()]
/** A whole suit from Ace up to `to`, for building foundations. */
const suitUpTo = (suit: Suit, to: number) => Array.from({ length: to }, (_, i) => card((i + 1) as Rank, suit))
const filler = (n: number) => Array.from({ length: n }, (_, i) => [card(13, (['spades', 'hearts', 'diamonds', 'clubs'] as Suit[])[i % 4])])

for (const level of ['easy', 'hard'] as const) {
  const d = dealFreecell(31, level)
  check(`FreeCell ${level}: all 52 cards dealt exactly once`, fcAll(d).length === 52 && new Set(fcAll(d).map((c) => c.id)).size === 52)
  check(`FreeCell ${level}: columns of 7,7,7,7,6,6,6,6`, freshFreecell(d.seed, level).tableau.map((p) => p.length).join(',') === '7,7,7,7,6,6,6,6')
  check(`FreeCell ${level}: every card starts face up`, fcAll(d).every((c) => c.faceUp))
  check(
    `FreeCell ${level}: free cells and foundations start empty (no card goes home by itself)`,
    d.cells.every((c) => c === null) && d.foundations.every((p) => p.length === 0) && d.moves === 0 && d.points === 0,
  )
  check(`FreeCell ${level}: the same deal again (Restart) is identical`, JSON.stringify(dealFreecell(31, level).tableau) === JSON.stringify(d.tableau))
}

// Columns
const fcCols = fcPosition({ tableau: [[card(10, 'hearts')], [card(9, 'spades')], [card(9, 'diamonds')], [card(8, 'clubs')], [card(11, 'clubs')], [card(13, 'diamonds')], [card(12, 'spades')], [] ] })
check('FreeCell: black 9 onto red 10', fcCanMove(fcCols, 't1', 0, 't0'))
check('FreeCell: red 9 onto red 10 is refused', !fcCanMove(fcCols, 't2', 0, 't0'))
check('FreeCell: 8 onto 10 is refused', !fcCanMove(fcCols, 't3', 0, 't0'))
check('FreeCell: building up is refused (Jack onto 10)', !fcCanMove(fcCols, 't4', 0, 't0'))
check('FreeCell: black Queen onto red King', fcCanMove(fcCols, 't6', 0, 't5'))
check('FreeCell: any card into an empty column', fcCanMove(fcCols, 't3', 0, 't7'))

// Free cells
const fcCellsFull = fcPosition({ cells: [card(4, 'clubs'), null, null, null], tableau: [[card(10, 'hearts'), card(9, 'spades')], [card(2, 'hearts')], [], [], [], [], [], []] })
check('FreeCell: a card goes into an empty free cell', fcCanMove(fcCellsFull, 't1', 0, 'c1'))
check('FreeCell: a free cell holds only one card', !fcCanMove(fcCellsFull, 't1', 0, 'c0'))
check('FreeCell: a run cannot go into a free cell', !fcCanMove(fcCellsFull, 't0', 0, 'c1'))
check('FreeCell: a free-cell card can go back to a column', fcCanMove(fcCellsFull, 'c0', 0, 't2'))

// Supermoves: (empty cells + 1) × 2^(empty columns), one column fewer when moving into an empty one
const longRun = [card(13, 'spades'), card(12, 'hearts'), card(11, 'clubs'), card(10, 'diamonds'), card(9, 'spades'), card(8, 'hearts'), card(7, 'clubs')]
const fcSuper = fcPosition({
  cells: [card(2, 'clubs'), card(3, 'clubs'), null, null],
  tableau: [[card(5, 'hearts'), ...longRun], [], [card(13, 'clubs')], ...filler(5)],
})
check('FreeCell: 2 empty cells and 1 empty column move 6 cards', fcMaxRun(fcSuper, false) === 6)
check('FreeCell: into the empty column itself only 3', fcMaxRun(fcSuper, true) === 3)
check('FreeCell: a 7-card run is too long to pick up', !fcCanPickUp(fcSuper, 't0', 1))
check('FreeCell: a 6-card run can be picked up', fcCanPickUp(fcSuper, 't0', 2))
check('FreeCell: a 6-card run onto a card is allowed', fcCanMove(fcSuper, 't0', 2, 't2'))
check('FreeCell: a 4-card run into an empty column is refused', !fcCanMove(fcSuper, 't0', 4, 't1'))
check('FreeCell: a 3-card run into an empty column is allowed', fcCanMove(fcSuper, 't0', 5, 't1'))
check('FreeCell: a broken run cannot move together', !fcCanPickUp(fcPosition({ tableau: [[card(9, 'spades'), card(8, 'spades')], ...filler(7)] }), 't0', 0))

// Foundations
const fcF = fcPosition({ foundations: [[card(1, 'hearts')], [], [], []], tableau: [[card(2, 'hearts')], [card(2, 'spades')], [card(3, 'hearts')], [card(1, 'clubs')], ...filler(4)] })
check('FreeCell: an Ace starts any empty foundation', fcCanMove(fcF, 't3', 0, 'f1'))
check('FreeCell: a 2 of the same suit onto its Ace', fcCanMove(fcF, 't0', 0, 'f0'))
check('FreeCell: a 2 of another suit is refused', !fcCanMove(fcF, 't1', 0, 'f0'))
check('FreeCell: a 3 straight onto an Ace is refused', !fcCanMove(fcF, 't2', 0, 'f0'))
check('FreeCell: cards never come back off a foundation', !fcCanPickUp(fcF, 'f0', 0))

// Undo
const fcUndoStart = fcPosition({ cells: [null, null, null, null], tableau: [[card(10, 'hearts'), card(9, 'spades'), card(8, 'hearts')], [card(10, 'diamonds')], ...filler(6)] })
const fcRunMoved = fcMove(fcUndoStart, 't0', 1, 't1')!
check('FreeCell: a 2-card run moves as one move', fcRunMoved.moves === 1 && fcRunMoved.tableau[1].length === 3)
const fcRunBack = fcUndo(fcRunMoved)!
check(
  'FreeCell: undo puts a multi-card move back exactly',
  JSON.stringify(fcRunBack.tableau) === JSON.stringify(fcUndoStart.tableau) && fcRunBack.points === 0 && fcRunBack.penalty === KLONDIKE_SCORING.undo,
)
const fcCellMove = fcMove(fcUndoStart, 't0', 2, 'c2')!
check('FreeCell: undo empties a free cell again', fcUndo(fcCellMove)!.cells[2] === null && fcUndo(fcCellMove)!.tableau[0].length === 3)

// Every card goes home by hand
const fcFreed = fcMove(fcPosition({ tableau: [[card(1, 'spades'), card(9, 'hearts')], [card(10, 'clubs')], ...filler(6)] }), 't0', 1, 't1')!
check('FreeCell: an Ace freed by a move stays for the player to send home', fcFreed.tableau[0].length === 1 && fcFreed.foundations.every((p) => p.length === 0))
check('FreeCell: the hint points it out', (() => {
  const h = fcFindHint(fcFreed)
  return h.kind === 'move' && h.from === 't0' && h.to.startsWith('f')
})())
const fcLastCards = fcPosition({
  foundations: [suitUpTo('spades', 13), suitUpTo('hearts', 13), suitUpTo('diamonds', 12), suitUpTo('clubs', 11)],
  tableau: [[card(13, 'clubs'), card(12, 'clubs')], [card(13, 'diamonds')], ...filler(6).map(() => [])],
})
const fcOneLeft = fcMove(fcLastCards, 't0', 1, 'f3')!
check('FreeCell: the game never finishes itself, even with the last cards in order', !fcOneLeft.won && fcOneLeft.tableau[0].length === 1 && fcOneLeft.tableau[1].length === 1)
check('FreeCell: the player plays the winning card', fcMove(fcMove(fcOneLeft, 't0', 0, 'f3')!, 't1', 0, 'f2')!.won)

// Taps
const fcTapGame = fcPosition({ foundations: [[card(1, 'hearts')], [], [], []], tableau: [[card(2, 'hearts')], [card(10, 'hearts'), card(9, 'spades')], [card(4, 'clubs')], [card(5, 'hearts')], ...filler(4)] })
check('FreeCell: a tap sends a card home first', fcTapMove(fcTapGame, 't0', 0) === 'f0')
check('FreeCell: a tap puts a card onto a column next', fcTapMove(fcTapGame, 't2', 0) === 't3')
check('FreeCell: a tap never splits a run into a free cell', fcTapMove(fcTapGame, 't1', 1) === null)
check('FreeCell: a tap on a lone card with nowhere else goes to a free cell', fcTapMove(fcTapGame, 't3', 0)?.startsWith('c') === true)

// Win and scoring
const almost = fcPosition({
  foundations: [suitUpTo('spades', 13), suitUpTo('hearts', 13), suitUpTo('diamonds', 13), suitUpTo('clubs', 12)],
  cells: [card(13, 'clubs'), null, null, null],
})
check('FreeCell: not won with a card still out', !almost.won)
const fcWon = fcMove(almost, 'c0', 0, 'f3')!
check('FreeCell: won when all 52 cards are home', fcWon.won && fcWon.foundations.every((p) => p.length === 13))
let fcFarm = fcPosition({ tableau: [[card(10, 'hearts')], [card(10, 'diamonds')], [card(9, 'spades')], ...filler(5)] })
fcFarm = fcMove(fcFarm, 't2', 0, 't0')!
const fcFarmed = fcFarm.points
let fcFarmMoves = 0
for (let i = 0; i < 5; i += 1) {
  for (const [from, index, to] of [['t0', 1, 't1'], ['t1', 1, 'c0'], ['c0', 0, 't0']] as const) {
    const next = fcMove(fcFarm, from, index, to)
    if (next) {
      fcFarm = next
      fcFarmMoves += 1
    }
  }
}
check(
  'FreeCell: moving the same card around again earns nothing more',
  fcFarmMoves === 15 && fcFarm.points === fcFarmed,
  `${fcFarmMoves} moves, ${fcFarm.points} vs ${fcFarmed}`,
)
check('FreeCell: undo never gains points', fcLiveScore(fcUndo(fcMove(fcUndoStart, 't0', 1, 't1')!)!) === 0)
check(
  'FreeCell: a win pays the win bonus and coins for its difficulty',
  fcRewardsFor({ ...fcWon, difficulty: 'hard' }, 100000).score === fcLiveScore(fcWon) + KLONDIKE_SCORING.winBonus &&
    fcRewardsFor({ ...fcWon, difficulty: 'hard' }, 0).coins === bonusCoins(fcWon) + SOLITAIRE_REWARDS.hardWinCoins,
)
check('FreeCell: scores go to their own keys', boardKey('freecell', 'easy') === 'solitaire-freecell' && boardKey('freecell', 'hard') === 'solitaire-freecell-hard')

// No moves
const fcStuck = fcPosition({
  cells: [card(13, 'spades'), card(13, 'hearts'), card(13, 'diamonds'), card(13, 'clubs')],
  tableau: [[card(5, 'spades')], [card(5, 'clubs')], [card(7, 'hearts')], [card(7, 'diamonds')], [card(9, 'spades')], [card(9, 'clubs')], [card(3, 'hearts')], [card(3, 'diamonds')]],
})
check('FreeCell: full free cells and nothing to play is no more moves', !fcHasUsefulMove(fcStuck))
check('FreeCell: one free cell open is still a move', fcHasUsefulMove({ ...fcStuck, cells: [null, ...fcStuck.cells.slice(1)] }))

// Verified deals
for (const level of ['easy', 'hard'] as const) {
  const list = FREECELL_DEALS[level]
  const sample = list.slice(0, 10)
  check(`FreeCell ${level}: checked deals solve (${sample.length} of ${list.length} rechecked)`, list.length > 0 && sample.every((seed) => freecellSolve(seed, 80000) !== null))
}
const easyEffort = FREECELL_DEALS.easy.slice(0, 10).map((seed) => freecellSolve(seed, 80000) ?? 0)
const hardEffort = FREECELL_DEALS.hard.slice(0, 10).map((seed) => freecellSolve(seed, 80000) ?? 0)
check('FreeCell: Hard deals need far more working out than Easy ones', Math.min(...hardEffort) > Math.max(...easyEffort) * 5)

// Many played deals with the hint-following player
for (const level of ['easy', 'hard'] as const) {
  let fcWins = 0
  let fcBroken = 0
  const deals = level === 'easy' ? 15 : 6
  for (let seed = 0; seed < deals; seed += 1) {
    let game = dealFreecell(seed, level)
    for (let turn = 0; turn < 300 && !game.won; turn += 1) {
      const hint = fcFindHint(game)
      const next = hint.kind === 'move' ? fcMove(game, hint.from, hint.index, hint.to) : null
      if (!next) break
      game = next
      const all = fcAll(game)
      if (all.length !== 52 || new Set(all.map((c) => c.id)).size !== 52) fcBroken += 1
    }
    if (game.won) fcWins += 1
  }
  check(`FreeCell ${level}: ${deals} played deals never lose or duplicate a card`, fcBroken === 0, `${fcBroken} broken`)
  check(`FreeCell ${level}: following the hints wins most deals`, fcWins > deals / 2, `${fcWins} of ${deals}`)
  console.log(`     (FreeCell ${level}: hint-following player won ${fcWins} of ${deals} deals)`)
}

// ---------------------------------------------------------------- Spider

function spPosition(parts: Partial<Pick<SpiderState, 'stock' | 'tableau' | 'completed'>>, difficulty: SpiderDifficulty = 'hard'): SpiderState {
  return {
    ...dealSpider(1, difficulty),
    stock: parts.stock ?? [],
    foundations: [[]],
    tableau: parts.tableau ?? Array.from({ length: 10 }, () => [card(13, 'spades')]),
    completed: parts.completed ?? 0,
    history: [],
  }
}
const spAll = (s: SpiderState) => [...s.stock, ...s.foundations.flat(), ...s.tableau.flat()]
/** King down to `low` in one suit, face up. */
const suitRun = (suit: Suit, low: number, high = 13) => Array.from({ length: high - low + 1 }, (_, i) => card((high - i) as Rank, suit))
const kings = (n: number) => Array.from({ length: n }, () => [card(13, 'hearts')])

for (const level of ['easy', 'hard'] as const) {
  const d = dealSpider(2024, level)
  check(`Spider ${level}: exactly 104 cards, every id different`, spAll(d).length === 104 && new Set(spAll(d).map((c) => c.id)).size === 104)
  check(`Spider ${level}: 54 cards in the columns and 50 in the stock`, d.tableau.flat().length === 54 && d.stock.length === 50)
  check(`Spider ${level}: columns 1-4 have 6 cards and 5-10 have 5`, d.tableau.map((p) => p.length).join(',') === '6,6,6,6,5,5,5,5,5,5')
  check(`Spider ${level}: only the top card of each column is face up`, d.tableau.every((p) => p.every((c, i) => c.faceUp === (i === p.length - 1))))
  check(`Spider ${level}: the same deal again (Restart) is identical`, JSON.stringify(dealSpider(2024, level).tableau) === JSON.stringify(d.tableau))
  let g: SpiderState | null = d
  const sizes: number[] = []
  for (let i = 0; i < 5; i += 1) {
    const before = g!.stock.length
    g = spDeal(g!)
    sizes.push(before - (g?.stock.length ?? before))
  }
  check(`Spider ${level}: five deals of exactly 10 cards, then no more`, sizes.join(',') === '10,10,10,10,10' && g !== null && g.stock.length === 0 && spDeal(g) === null)
  check(`Spider ${level}: dealt cards land face up, one on each column`, g !== null && g.tableau.every((p) => p.length >= 5 && p[p.length - 1].faceUp))
}
const spEasy = spAll(dealSpider(5, 'easy'))
const spHard = spAll(dealSpider(5, 'hard'))
check('Spider Easy: one suit, eight of every rank', spEasy.every((c) => c.suit === 'spades') && ([1, 7, 13] as Rank[]).every((r) => spEasy.filter((c) => c.rank === r).length === 8))
check('Spider Hard: spades and hearts, 52 each', spHard.filter((c) => c.suit === 'spades').length === 52 && spHard.filter((c) => c.suit === 'hearts').length === 52)

// Dealing with an empty column
const spGap = spPosition({ stock: Array.from({ length: 10 }, () => card(4, 'spades', false)), tableau: [[], ...kings(9)] })
check('Spider: no deal while a column is empty', spDeal(spGap) === null && !spCanDeal(spGap))
check('Spider: the player is told why', spDealBlocked(spGap) === 'Fill all empty columns before dealing new cards.')
check('Spider: dealing works once every column has a card', spDeal(spPosition({ stock: spGap.stock, tableau: kings(10) })) !== null)

// Building and runs
const spBuild = spPosition({
  tableau: [[card(10, 'hearts')], [card(9, 'spades')], [card(11, 'spades')], [card(9, 'spades'), card(8, 'hearts'), card(7, 'hearts')], [card(8, 'spades'), card(7, 'spades')], [], ...kings(4)],
})
check('Spider: a 9 onto a 10 of any suit', spCanMove(spBuild, 't1', 0, 't0'))
check('Spider: building up is refused (10 onto 9)', !spCanMove(spBuild, 't0', 0, 't1'))
check('Spider: a Jack onto a 10 is refused', !spCanMove(spBuild, 't2', 0, 't0'))
check('Spider Hard: a mixed-suit run cannot move together', !spCanPickUp(spBuild, 't3', 0))
check('Spider Hard: its same-suit end (8♥ 7♥) can', spCanPickUp(spBuild, 't3', 1) && spCanMove(spBuild, 't3', 1, 't1'))
check('Spider: a same-suit run moves together', spCanMove(spBuild, 't4', 0, 't1'))
check('Spider: any card or run into an empty column', spCanMove(spBuild, 't3', 1, 't5') && spCanMove(spBuild, 't0', 0, 't5'))
const spFlip = spMove(spPosition({ tableau: [[card(3, 'hearts', false), card(9, 'spades')], [card(10, 'hearts')], ...kings(8)] }), 't0', 1, 't1')!
check('Spider: moving the last face-up card turns over the one below', spFlip.tableau[0][0].faceUp && spFlip.revealed === 1)
check('Spider: turning a card over scores', spFlip.points === SPIDER_SCORING.revealCard)
check('Spider: a face-down card cannot be picked up', !spCanPickUp(spPosition({ tableau: [[card(3, 'hearts', false), card(9, 'spades')], ...kings(9)] }), 't0', 0))

// Finishing runs
const spAlmost = spPosition({ tableau: [[card(6, 'hearts', false), ...suitRun('spades', 2)], [card(1, 'spades')], ...kings(8)] })
const spCleared = spMove(spAlmost, 't1', 0, 't0')!
check('Spider: a finished King-to-Ace run of one suit is cleared at once', spCleared.completed === 1 && spCleared.foundations[0].length === 13 && spCleared.tableau[0].length === 1)
check('Spider: the card under a cleared run turns over', spCleared.tableau[0][0].faceUp)
check('Spider: clearing a run scores and earns a coin', spCleared.points === SPIDER_SCORING.completeRun + SPIDER_SCORING.revealCard && spRewardsFor(spCleared, 0).coins === SPIDER_SCORING.runCoins)
const spMixed = spMove(spPosition({ tableau: [[...suitRun('spades', 3), card(2, 'hearts')], [card(1, 'spades')], ...kings(8)] }), 't1', 0, 't0')!
check('Spider: a King-to-Ace run of mixed suits stays', spMixed.completed === 0 && spMixed.tableau[0].length === 13)
const spUndone = spUndo(spCleared)!
check(
  'Spider: undo brings a cleared run back, face-down card and all',
  spUndone.completed === 0 && spUndone.tableau[0].length === 13 && !spUndone.tableau[0][0].faceUp && spUndone.tableau[1].length === 1 && spUndone.points === 0,
)
check('Spider: undo keeps its penalty', spUndone.penalty === KLONDIKE_SCORING.undo)
const spDealt = spDeal(dealSpider(9, 'easy'))!
check('Spider: undo takes back a whole deal as one step', JSON.stringify(spUndo(spDealt)!.tableau) === JSON.stringify(dealSpider(9, 'easy').tableau) && spUndo(spDealt)!.stock.length === 50)

// Winning
const spLast = spMove(spPosition({ tableau: [suitRun('hearts', 2), [card(1, 'hearts')], ...kings(8)], completed: 7 }), 't1', 0, 't0')!
check('Spider: the eighth run cleared wins', spLast.won && spLast.completed === 8)
check('Spider: not won with fewer than eight', !spCleared.won)
check(
  'Spider: a win pays the win bonus and coins for its difficulty',
  spRewardsFor(spLast, 100000).score === spLiveScore(spLast) + KLONDIKE_SCORING.winBonus &&
    spRewardsFor(spLast, 0).coins === SPIDER_SCORING.runCoins + SOLITAIRE_REWARDS.hardWinCoins,
)
check('Spider: scores go to their own keys', boardKey('spider', 'easy') === 'solitaire-spider' && boardKey('spider', 'hard') === 'solitaire-spider-hard')

// No farming
let spFarm = spMove(spPosition({ tableau: [[card(8, 'hearts')], [card(8, 'spades')], [card(7, 'spades')], ...kings(7)] }), 't2', 0, 't0')!
let spFarmMoves = 0
for (let i = 0; i < 10; i += 1) {
  const from = spFarm.tableau[0].length > 1 ? 't0' : 't1'
  const next = spMove(spFarm, from, 1, from === 't0' ? 't1' : 't0')
  if (next) {
    spFarm = next
    spFarmMoves += 1
  }
}
check('Spider: moving the same card back and forth earns nothing', spFarmMoves === 10 && spFarm.points === 0, `${spFarmMoves} moves, ${spFarm.points} points`)

// Taps, blocked games, hints
const spTap = spPosition({ tableau: [[card(8, 'hearts')], [card(8, 'spades')], [card(7, 'spades')], ...kings(7)] })
check('Spider: a tap prefers the same suit', spTapMove(spTap, 't2', 0) === 't1')
check('Spider: a tap on a card with nowhere to go does nothing', spTapMove(spTap, 't3', 0) === null)
const spDead = spPosition({ tableau: [[card(5, 'spades')], [card(5, 'hearts')], [card(9, 'spades')], [card(2, 'hearts')], [card(11, 'spades')], [card(5, 'spades')], [card(13, 'spades')], [card(7, 'spades')], [card(13, 'spades')], [card(13, 'hearts')]] })
check('Spider: no moves and no stock is a blocked game', !spHasUsefulMove(spDead))
check('Spider: an unused deal still counts, even with nothing to move', spHasUsefulMove({ ...spDead, stock: Array.from({ length: 10 }, () => card(4, 'spades', false)) }))
check('Spider: a used-up stock alone never ends the game', spHasUsefulMove(spTap))

for (const level of ['easy', 'hard'] as const) {
  let spWins = 0
  let spRuns = 0
  let spBroken = 0
  for (let seed = 1; seed <= 40; seed += 1) {
    let game = dealSpider(seed, level)
    for (let turn = 0; turn < 1500 && !game.won; turn += 1) {
      const hint = spFindHint(game)
      const next = hint.kind === 'move' ? spMove(game, hint.from, hint.index, hint.to) : hint.kind === 'draw' ? spDeal(game) : null
      if (!next) break
      game = next
      const all = spAll(game)
      if (all.length !== 104 || new Set(all.map((c) => c.id)).size !== 104) spBroken += 1
    }
    if (game.won) spWins += 1
    spRuns += game.completed
  }
  check(`Spider ${level}: 40 played deals never lose or duplicate a card`, spBroken === 0, `${spBroken} broken`)
  console.log(`     (Spider ${level}: hint-following player won ${spWins} of 40 deals, clearing ${spRuns} runs)`)
}

// ---------------------------------------------------------------- Golf

function golfPosition(parts: Partial<Pick<GolfState, 'tableau' | 'stock' | 'waste'>>, difficulty: GolfDifficulty = 'hard'): GolfState {
  return {
    ...freshGolf(1, difficulty),
    tableau: parts.tableau ?? Array.from({ length: 7 }, () => []),
    stock: parts.stock ?? [],
    waste: parts.waste ?? [card(7, 'clubs')],
    history: [],
  }
}
const golfTop = (cards: Card[]) => cards[cards.length - 1]
const golfAll = (s: GolfState) => [...s.tableau.flat(), ...s.stock, ...s.waste]

for (const level of ['easy', 'hard'] as const) {
  const d = dealGolf(77, level)
  check(`Golf ${level}: 52 cards, every one different`, golfAll(d).length === 52 && new Set(golfAll(d).map((c) => c.id)).size === 52)
  check(`Golf ${level}: seven columns of five, all face up`, d.tableau.length === 7 && d.tableau.every((p) => p.length === 5 && p.every((c) => c.faceUp)))
  check(`Golf ${level}: 16 face-down cards in the stock and one face up on the waste`, d.stock.length === 16 && d.stock.every((c) => !c.faceUp) && d.waste.length === 1 && d.waste[0].faceUp)
  check(`Golf ${level}: the same deal again (Restart) is identical`, JSON.stringify(dealGolf(77, level)) === JSON.stringify(d))
}

// Playing cards
const golfCols = golfPosition({
  tableau: [[card(2, 'hearts'), card(6, 'spades')], [card(8, 'hearts')], [card(9, 'diamonds')], [card(6, 'diamonds')], [], [], []],
})
check('Golf: only the bottom card of a column can be played', golfCanPickUp(golfCols, 't0', 1) && !golfCanPickUp(golfCols, 't0', 0))
check('Golf: the cards above are dimmed', golfCovered(golfCols, 't0', 0) && !golfCovered(golfCols, 't0', 1))
check('Golf: one lower onto the waste (6 on 7)', golfCanMove(golfCols, 't0', 1, 'waste'))
check('Golf: one higher onto the waste (8 on 7)', golfCanMove(golfCols, 't1', 0, 'waste'))
check('Golf: suit and colour don\u2019t matter', golfCanMove(golfCols, 't3', 0, 'waste') && golfCanMove(golfCols, 't0', 1, 'waste'))
check('Golf: two apart is refused (9 on 7)', !golfCanMove(golfCols, 't2', 0, 'waste'))
check('Golf: a covered card cannot be played', !golfCanMove(golfCols, 't0', 0, 'waste'))
const golfPlayed = golfMove(golfCols, 't0', 1, 'waste')!
check('Golf: a played card becomes the waste card and frees the one above', golfTop(golfPlayed.waste).rank === 6 && golfCanPickUp(golfPlayed, 't0', 0))
check('Golf: empty columns stay empty (nothing goes into them)', !golfCanMove(golfCols, 't1', 0, 't4'))
check('Golf Easy: King and Ace join both ways', golfFits(13, 1, true) && golfFits(1, 13, true))
check('Golf Hard: King and Ace don\u2019t join', !golfFits(13, 1, false) && !golfFits(1, 13, false) && golfFits(12, 13, false) && golfFits(2, 1, false))
const kingWaste = (level: GolfDifficulty) => golfPosition({ tableau: [[card(1, 'spades')], [], [], [], [], [], []], waste: [card(13, 'hearts')] }, level)
check('Golf Easy: an Ace plays on a King', golfCanMove(kingWaste('easy'), 't0', 0, 'waste'))
check('Golf Hard: an Ace does not play on a King', !golfCanMove(kingWaste('hard'), 't0', 0, 'waste'))

// Stock
let golfStock: GolfState | null = dealGolf(5, 'easy')
const nextStock = golfTop(golfStock.stock)
golfStock = golfDraw(golfStock)!
check('Golf: drawing turns the next stock card face up onto the waste', golfTop(golfStock.waste).id === nextStock.id && golfTop(golfStock.waste).faceUp && golfStock.stock.length === 15)
for (let i = 0; i < 15; i += 1) golfStock = golfDraw(golfStock!)
check('Golf: 16 draws use every stock card once, then no more', golfStock !== null && golfStock.stock.length === 0 && golfDraw(golfStock) === null && golfStock.waste.length === 17)
const golfRunColsForDraw = golfPosition({ tableau: [[card(6, 'spades')], [], [], [], [], [], []], stock: [card(9, 'clubs', false)] })
check('Golf: drawing is allowed even with a card to play', golfCanMove(golfRunColsForDraw, 't0', 0, 'waste') && golfDraw(golfRunColsForDraw) !== null)

// Streaks
const golfRunCols = golfPosition({
  tableau: [[card(6, 'spades')], [card(5, 'hearts')], [card(4, 'clubs')], [card(3, 'diamonds')], [card(2, 'spades')], [card(1, 'hearts')], []],
  stock: [card(9, 'clubs', false), card(10, 'hearts', false)],
})
let golfRun = golfRunCols
const golfGains: number[] = []
for (let c = 0; c < 6; c += 1) {
  const before = golfRun.points
  golfRun = golfMove(golfRun, `t${c}`, 0, 'waste')!
  golfGains.push(golfRun.points - before)
}
check('Golf: each card in a row earns a little more', golfGains.slice(0, 5).join(',') === '10,12,14,16,18', golfGains.join(','))
check('Golf: clearing the table wins and adds the unused stock bonus', golfRun.won && golfGains[5] === 20 + 2 * GOLF_SCORING.stockLeft)
check('Golf: the streak bonus is capped', golfCardPoints(40) === GOLF_SCORING.clearCard + GOLF_SCORING.streakCap)
check('Golf: five in a row earns a coin', golfRun.coinCards.length === 1)
const golfAfterDraw = golfDraw(golfMove(golfRunCols, 't0', 0, 'waste')!)!
check('Golf: drawing ends the streak', golfAfterDraw.streak === 0)
const golfFresh = golfMove(golfPosition({ tableau: [[card(9, 'spades')], [], [], [], [], [], []], waste: [card(10, 'hearts')] }), 't0', 0, 'waste')!
check('Golf: after a draw the next card earns the base points again', golfFresh.points === GOLF_SCORING.clearCard)

// Undo
const golfTwo = golfMove(golfMove(golfRunCols, 't0', 0, 'waste')!, 't1', 0, 'waste')!
const golfBack = golfUndo(golfTwo)!
check(
  'Golf: undo restores the card, waste, points, moves and streak',
  golfBack.tableau[1].length === 1 && golfTop(golfBack.waste).rank === 6 && golfBack.points === 10 && golfBack.moves === 1 && golfBack.streak === 1,
)
check('Golf: undo of a draw puts the card back on the stock', (() => {
  const drawn = golfDraw(golfRunCols)!
  const undone = golfUndo(drawn)!
  return undone.stock.length === 2 && undone.waste.length === 1 && undone.streak === golfRunCols.streak
})())
check('Golf: undo never gains points', golfLiveScore(golfUndo(golfMove(golfRunCols, 't0', 0, 'waste')!)!) === 0)

// Ending
const golfDead = golfPosition({ tableau: [[card(12, 'spades')], [card(3, 'hearts')], [], [], [], [], []] })
check('Golf: no card to play and no stock is the end', !golfHasUsefulMove(golfDead))
check('Golf: cards left in the stock always keep the game going', golfHasUsefulMove({ ...golfDead, stock: [card(2, 'clubs', false)] }))
check('Golf: not won while a column has a card', !golfMove(golfPosition({ tableau: [[card(6, 'spades')], [card(12, 'hearts')], [], [], [], [], []] }), 't0', 0, 'waste')!.won)
check(
  'Golf: a win pays the win bonus and coins for its difficulty',
  golfRewardsFor(golfRun, 100000).score === golfLiveScore(golfRun) + KLONDIKE_SCORING.winBonus &&
    golfRewardsFor(golfRun, 0).coins === 1 + SOLITAIRE_REWARDS.hardWinCoins,
)
check('Golf: scores go to their own keys', boardKey('golf', 'easy') === 'solitaire-golf' && boardKey('golf', 'hard') === 'solitaire-golf-hard')

// Checked deals, hints and balance
for (const level of ['easy', 'hard'] as const) {
  const list = GOLF_DEALS[level]
  check(`Golf ${level}: checked deals can be cleared (10 of ${list.length} rechecked)`, list.length > 0 && list.slice(0, 10).every((seed, i) => golfSolve(dealGolf(i, level), 400000) !== null))
  let wins = 0
  let winPoints = 0
  let broken = 0
  for (let seed = 0; seed < 20; seed += 1) {
    let game = dealGolf(seed, level)
    for (let turn = 0; turn < 120 && !game.won; turn += 1) {
      const hint = golfFindHint(game)
      const next = hint.kind === 'move' ? golfMove(game, hint.from, hint.index, hint.to) : hint.kind === 'draw' ? golfDraw(game) : null
      if (!next) break
      game = next
      if (golfAll(game).length !== 52 || new Set(golfAll(game).map((c) => c.id)).size !== 52) broken += 1
    }
    if (game.won) {
      wins += 1
      winPoints += game.points
    }
  }
  check(`Golf ${level}: 20 played deals never lose or duplicate a card`, broken === 0)
  check(`Golf ${level}: following the hints clears most checked deals`, wins >= 15, `${wins} of 20`)
  console.log(`     (Golf ${level}: hint-following player cleared ${wins} of 20, averaging ${Math.round(winPoints / Math.max(1, wins))} points before bonuses)`)
}

if (failures > 0) {
  console.log(`\n${failures} failed`)
  process.exit(1)
}
console.log('\nAll Spellitaire checks passed')
