import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import { boardLabel, type ChallengeNotice } from '../game/challenges'
import { formatCubCash } from '../game/formatCubCash'

type Props = {
  notice: ChallengeNotice
  onClose: () => void
  /** Opens the Challenges screen. */
  onOpen: () => void
}

function copy(notice: ChallengeNotice): { kicker: string; title: string; main: string; note?: string } {
  const who = notice.username
  const game = boardLabel(notice.board)
  const cash = `${formatCubCash(notice.amount)} Cub Cash`
  switch (notice.kind) {
    case 'received':
      return {
        kicker: 'New challenge',
        title: `${who} challenged you!`,
        main: `${game} for ${cash}`,
        note: `Winner takes ${formatCubCash(notice.amount * 2)}. You have 24 hours to accept.`,
      }
    case 'accepted':
      return { kicker: 'Challenge accepted', title: `${who} accepted!`, main: game, note: 'You both have 24 hours. Best score wins.' }
    case 'declined':
      return { kicker: 'Challenge declined', title: `${who} said no`, main: game, note: `Your ${cash} is back in your wallet.` }
    case 'cancelled':
      return { kicker: 'Challenge cancelled', title: `${who} cancelled`, main: game }
    case 'expired':
      return notice.amount > 0
        ? { kicker: 'Challenge expired', title: `${who} didn't answer`, main: game, note: `Your ${cash} is back in your wallet.` }
        : { kicker: 'Challenge expired', title: `${who}'s challenge ran out`, main: game }
    case 'won':
      return { kicker: 'Challenge won', title: `You beat ${who}!`, main: `+${cash}`, note: game }
    case 'lost':
      return { kicker: 'Challenge over', title: `${who} won this one`, main: game, note: 'Better luck next time!' }
    case 'draw':
      return { kicker: 'Challenge over', title: `A draw with ${who}!`, main: game, note: `Your ${cash} wager is refunded.` }
    case 'no_scores':
      return { kicker: 'Challenge over', title: 'Nobody played', main: game, note: `Your ${cash} wager is refunded.` }
  }
}

/** One piece of challenge news over the home screen. */
export function ChallengeNoticePop({ notice, onClose, onOpen }: Props) {
  const text = copy(notice)
  return (
    <div className="power-pop challenge-notice" role="presentation" onClick={onClose}>
      <div className="power-pop-card" role="dialog" aria-modal="true" aria-label={text.kicker}>
        <div className="power-pop-face">
          <span className="challenge-notice-icon" aria-hidden="true">
            {notice.kind === 'won' ? <img src={coinUrl} alt="" /> : '⚔'}
          </span>
          <p className="power-pop-kicker">{text.kicker}</p>
          <h2>{text.title}</h2>
          <p className="power-pop-main">{text.main}</p>
          {text.note ? <p className="power-pop-note">{text.note}</p> : null}
          <button
            type="button"
            className="challenge-main challenge-notice-open"
            onClick={(event) => {
              event.stopPropagation()
              onOpen()
            }}
          >
            {notice.kind === 'received' ? 'See challenge' : 'Open challenges'}
          </button>
          <p className="power-pop-tap">Tap to continue</p>
        </div>
      </div>
    </div>
  )
}
