// Rule checks for Spellitaire (Klondike, draw 1). Run: npm run check:solitaire
import { cardId, type Card, type Rank, type Suit } from '../src/game/cards/deck'
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
import { KLONDIKE_SCORING, SOLITAIRE_REWARDS } from '../src/game/solitaire/scoring'

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

if (failures > 0) {
  console.log(`\n${failures} failed`)
  process.exit(1)
}
console.log('\nAll Spellitaire checks passed')
