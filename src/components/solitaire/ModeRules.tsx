import type { SpellMode } from '../../game/solitaire/keys'
import { PYRAMID_SETTINGS } from '../../game/solitaire/pyramid'
import { GOLF_SCORING, KLONDIKE_SCORING, PYRAMID_SCORING, SOLITAIRE_REWARDS, SPIDER_SCORING } from '../../game/solitaire/scoring'
import { SPIDER_SETTINGS } from '../../game/solitaire/spider'

function ClassicRules() {
  return (
    <>
      <li>
        <strong>Goal:</strong> move every card onto the four foundations, from Ace up to King, one suit on each.
      </li>
      <li>
        <strong>Columns:</strong> build down in alternating colours, like a red 9 on a black 10. Move a whole run of face-up
        cards together. Only a King, or a run led by a King, goes into an empty column.
      </li>
      <li>
        <strong>Stock:</strong> tap it to turn over one card at a time. When it runs out, tap again to turn the pile back over
        and go through it again, as often as you like.
      </li>
      <li>
        <strong>Hard:</strong> the stock turns over three cards at a time, and only the top one can be played. Play it to
        reach the card under it.
      </li>
    </>
  )
}

function FlipflopRules() {
  return (
    <>
      <li>
        <strong>Goal:</strong> move every card onto the four foundations, from Ace up to King. Each foundation takes one suit.
      </li>
      <li>
        <strong>Columns:</strong> put a card on one that is one higher or one lower, in any suit, like a 7 on an 8 or on a 6.
        You can switch between up and down as you go. Kings and Aces don't wrap round.
      </li>
      <li>
        <strong>Runs:</strong> several cards move together only when they are the same suit and go one way, like 9♠ 8♠ 7♠.
        Any card or run can go into an empty column.
      </li>
      <li>
        <strong>Stock:</strong> tap it to deal one card onto every column. On the last deal the two cards left go to the
        reserve spots beside it, where you can play them at any time. The stock can't be turned over again.
      </li>
      <li>
        <strong>Easy and Hard:</strong> Easy uses one suit (four of each spade), Hard uses two (spades and hearts).
      </li>
    </>
  )
}

function PyramidRules() {
  const { easy, hard } = PYRAMID_SETTINGS.difficulty
  return (
    <>
      <li>
        <strong>Goal:</strong> clear all 28 cards from the pyramid. Cards left in the stock don't matter.
      </li>
      <li>
        <strong>Pairs:</strong> remove two cards that add up to 13, in any suit: Ace + Queen, 2 + Jack, 3 + 10, 4 + 9, 5 + 8 or
        6 + 7. Kings count 13 and go on their own.
      </li>
      <li>
        <strong>Free cards:</strong> a pyramid card can only be used once both cards resting on it are gone. Covered cards are
        dimmed. The top card of the waste is free too.
      </li>
      <li>
        <strong>Stock:</strong> tap it to turn over the next card onto the waste. On Easy you can go through the stock{' '}
        {easy.passes} times; on Hard only {hard.passes === 1 ? 'once' : `${hard.passes} times`}.
      </li>
      <li>
        <strong>Every deal can be won</strong>, so look ahead before you pair.
      </li>
      <li>
        <strong>Playing:</strong> tap a card, then tap the card that makes 13 with it, or drag one onto the other. Tap a free
        King to remove it.
      </li>
      <li>
        <strong>Points:</strong> +{PYRAMID_SCORING.clearPyramidCard} for each pyramid card removed, +{PYRAMID_SCORING.uncoverCard}{' '}
        for each card freed and +{PYRAMID_SCORING.clearStockCard} for each stock card used. Hints cost{' '}
        {Math.abs(KLONDIKE_SCORING.hint)} and undos {Math.abs(KLONDIKE_SCORING.undo)}.
      </li>
      <li>
        <strong>XP:</strong> {SOLITAIRE_REWARDS.xpPerHome} for each card removed, plus {SOLITAIRE_REWARDS.winXp} for a win.
      </li>
      <li>
        <strong>Cub Cash:</strong> {PYRAMID_SCORING.rowCoins} for every row of the pyramid you clear, and you keep these even if
        you don't win.
      </li>
    </>
  )
}

function FreecellRules() {
  return (
    <>
      <li>
        <strong>Goal:</strong> move every card onto the four foundations, from Ace up to King, one suit on each.
      </li>
      <li>
        <strong>Columns:</strong> build down in alternating colours, like a red 9 on a black 10. Any card or run can go into an
        empty column.
      </li>
      <li>
        <strong>Free cells:</strong> the four spots top left each hold one card while you work. Free cells and empty columns
        let you move longer runs: (free cells + 1) doubled for every empty column.
      </li>
      <li>
        <strong>Playing:</strong> tap a card to send it to the best spot it can go: home, onto a column, or a free cell. Or drag
        it where you want it. Cards that can't be needed any more go home by themselves.
      </li>
      <li>
        <strong>Easy and Hard:</strong> every deal can be won. Hard deals need much more planning.
      </li>
      <li>
        <strong>Points:</strong> +{KLONDIKE_SCORING.toFoundation} for each card on a foundation and +{KLONDIKE_SCORING.stackCard}{' '}
        for each card you stack in a column (once per card, so moving cards back and forth earns nothing). Hints cost{' '}
        {Math.abs(KLONDIKE_SCORING.hint)} and undos {Math.abs(KLONDIKE_SCORING.undo)}.
      </li>
      <li>
        <strong>XP:</strong> {SOLITAIRE_REWARDS.xpPerStack} for each card you stack and {SOLITAIRE_REWARDS.xpPerHome} for each
        card you get home, plus {SOLITAIRE_REWARDS.winXp} for a win.
      </li>
      <li>
        <strong>Cub Cash:</strong> {SOLITAIRE_REWARDS.faceStackCoins} for each face card you put on another face card, and{' '}
        {SOLITAIRE_REWARDS.aceCoins} for each Ace put home. You keep these even if you don't win.
      </li>
    </>
  )
}

function SpiderRules() {
  return (
    <>
      <li>
        <strong>Goal:</strong> build {SPIDER_SETTINGS.runs} runs from King down to Ace, each all one suit. A finished run is
        cleared from the table by itself.
      </li>
      <li>
        <strong>Columns:</strong> put a card on one that is one higher, in any suit, like a 7 on an 8. Only runs of one suit
        move together, like 9♠ 8♠ 7♠. Any card or run can go into an empty column. Face-down cards turn over as they're
        uncovered.
      </li>
      <li>
        <strong>Stock:</strong> tap it to deal one card onto every column, five times in all; the number on the stock shows
        the deals left. Every column needs at least one card before you can deal.
      </li>
      <li>
        <strong>Easy and Hard:</strong> Easy uses one suit (spades only), Hard uses two (spades and hearts).
      </li>
      <li>
        <strong>Playing:</strong> tap a card to move it, with the cards on top of it, to the best place it can go. Or drag it
        where you want it.
      </li>
      <li>
        <strong>Points:</strong> +{SPIDER_SCORING.revealCard} for each card turned over and +{SPIDER_SCORING.completeRun} for
        each run cleared. Moving cards earns nothing by itself. Hints cost {Math.abs(KLONDIKE_SCORING.hint)} and undos{' '}
        {Math.abs(KLONDIKE_SCORING.undo)}.
      </li>
      <li>
        <strong>XP:</strong> 1 for each card turned over and {SOLITAIRE_REWARDS.xpPerHome} for each card in a cleared run, plus{' '}
        {SOLITAIRE_REWARDS.winXp} for a win.
      </li>
      <li>
        <strong>Cub Cash:</strong> {SPIDER_SCORING.runCoins} for each run cleared, and you keep these even if you don't win.
      </li>
    </>
  )
}

function GolfRules() {
  return (
    <>
      <li>
        <strong>Goal:</strong> clear all 35 cards from the seven columns. Cards left in the stock don't matter.
      </li>
      <li>
        <strong>Playing:</strong> tap the bottom card of a column to play it onto the waste when it is one higher or one lower
        than the waste card, in any suit, like a 6 or an 8 on a 7. Cards higher up are dimmed until the ones below them are
        gone.
      </li>
      <li>
        <strong>Stock:</strong> tap it to turn the next card onto the waste, any time. Each stock card comes up once, and
        the stock isn't turned over again.
      </li>
      <li>
        <strong>Easy and Hard:</strong> on Easy, King and Ace join up both ways (Queen, King, Ace, 2...). On Hard they don't.
        Every deal can be cleared.
      </li>
      <li>
        <strong>Points:</strong> +{GOLF_SCORING.clearCard} for each card played, plus a streak bonus for cards played in a row
        without drawing (+{GOLF_SCORING.streakStep} more each card, up to +{GOLF_SCORING.streakCap}). Clearing the table adds
        +{GOLF_SCORING.stockLeft} for every stock card you never needed. Hints cost {Math.abs(KLONDIKE_SCORING.hint)} and
        undos {Math.abs(KLONDIKE_SCORING.undo)}.
      </li>
      <li>
        <strong>XP:</strong> {SOLITAIRE_REWARDS.xpPerHome} for each card played, plus {SOLITAIRE_REWARDS.winXp} for a win.
      </li>
      <li>
        <strong>Cub Cash:</strong> 1 for every {GOLF_SCORING.streakCoinEvery} cards in a row without drawing, and you keep these
        even if you don't win.
      </li>
    </>
  )
}

/** Moving, points, XP and coins for the modes that build on foundations (Classic and Flipflop). */
function BuildingRules() {
  return (
    <>
      <li>
        <strong>Moving:</strong> drag cards, or tap a card then tap where it should go. Double-tap a card to send it to a
        foundation.
      </li>
      <li>
        <strong>Points:</strong> +{KLONDIKE_SCORING.toFoundation} for each card on a foundation, +{KLONDIKE_SCORING.revealCard}{' '}
        for each card turned over and +{KLONDIKE_SCORING.stackCard} for each card you stack in a column (once per card). Hints
        cost {Math.abs(KLONDIKE_SCORING.hint)} and undos {Math.abs(KLONDIKE_SCORING.undo)}.
      </li>
      <li>
        <strong>XP:</strong> {SOLITAIRE_REWARDS.xpPerStack} for each card you stack and {SOLITAIRE_REWARDS.xpPerHome} for each
        card you get onto a foundation, plus {SOLITAIRE_REWARDS.winXp} for a win.
      </li>
      <li>
        <strong>Cub Cash:</strong> {SOLITAIRE_REWARDS.faceStackCoins} for each face card you put on another face card, and{' '}
        {SOLITAIRE_REWARDS.aceCoins} for each Ace you put home. Each card earns its coin once, and you keep these even if you
        don't win.
      </li>
    </>
  )
}

/** How to play one Spellitaire mode: its own rules, then what every mode shares. */
export function ModeRules({ mode }: { mode: SpellMode }) {
  return (
    <ul>
      {mode === 'pyramid' ? (
        <PyramidRules />
      ) : mode === 'freecell' ? (
        <FreecellRules />
      ) : mode === 'spider' ? (
        <SpiderRules />
      ) : mode === 'golf' ? (
        <GolfRules />
      ) : (
        <>
          {mode === 'flipflop' ? <FlipflopRules /> : <ClassicRules />}
          <BuildingRules />
        </>
      )}
      <li>
        <strong>Winning:</strong> finish the game for a {KLONDIKE_SCORING.winBonus.toLocaleString('en-US')} point bonus, a speed
        bonus and {SOLITAIRE_REWARDS.winCoins} Cub Cash ({SOLITAIRE_REWARDS.hardWinCoins} on Hard). Your best score in every mode
        and difficulty adds together on the Spellitaire leaderboard.
      </li>
      <li>
        <strong>Ending:</strong> the game ends by itself when no moves are left, or tap End Game to stop. Your points still
        count.
      </li>
    </ul>
  )
}
