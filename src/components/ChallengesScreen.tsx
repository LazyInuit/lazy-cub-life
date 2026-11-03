import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import {
  boardLabel,
  cancelChallenge,
  challengeGame,
  findPlayers,
  loadCommunityResults,
  MAX_OPEN_CHALLENGES,
  openChallengeCount,
  respondChallenge,
  STARTER_CASH,
  wagerableCash,
  timeLeft,
  type Challenge,
  type ChallengePlayer,
  type CommunityResult,
} from '../game/challenges'
import { formatCubCash } from '../game/formatCubCash'
import type { LeaderboardGame, PlayerProfile } from '../game/leaderboard'
import { PROFILE_PICTURES, profileLookFor } from '../game/profileArt'
import type { CubController } from '../game/useCub'
import { GameThumb } from './GameThumb'
import { GamesButton, HomeButton } from './HomeButton'
import { PlayerProfileCard } from './PlayerProfileCard'

type Props = {
  cub: CubController
  onHome: () => void
  onGames: () => void
  onPlay: (board: LeaderboardGame) => void
  onChallenge: (username: string) => void
  onVisit: (profile: PlayerProfile) => void
}

type Tab = 'active' | 'received' | 'sent' | 'history'

const TABS: { id: Tab; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'received', label: 'Received' },
  { id: 'sent', label: 'Sent' },
  { id: 'history', label: 'Results' },
]

const DEFAULT_PICTURE = PROFILE_PICTURES[profileLookFor({}).picture]

function Avatar({ photoUrl, name }: { photoUrl: string | null; name: string }) {
  return (
    <span className="chal-avatar">
      {photoUrl ? <img src={photoUrl} alt={`${name}'s photo`} /> : <img src={DEFAULT_PICTURE.src} alt="" />}
    </span>
  )
}

function inTab(challenge: Challenge, tab: Tab) {
  if (tab === 'active') return challenge.status === 'active'
  if (tab === 'received') return challenge.status === 'pending' && challenge.role === 'opponent'
  if (tab === 'sent') return challenge.status === 'pending' && challenge.role === 'challenger'
  // Results are challenges that were played out; cancelled, declined and expired ones aren't listed.
  return challenge.status === 'completed'
}

function score(value: number | null) {
  return value === null ? '—' : value.toLocaleString('en-US')
}

/** How a finished challenge ended for this player, and the Cub Cash it made or cost them. */
function result(challenge: Challenge): { label: string; tone: 'win' | 'loss' | 'even'; net: number } {
  const net = challenge.paid - challenge.staked
  if (challenge.won) return { label: 'Won', tone: 'win', net }
  if (challenge.lost) return { label: 'Lost', tone: 'loss', net }
  if (challenge.outcome === 'draw') return { label: 'Draw, wagers refunded', tone: 'even', net }
  return { label: 'Nobody played, wagers refunded', tone: 'even', net }
}

/** Active, received, sent and finished challenges, and the list of players to challenge. */
export function ChallengesScreen({ cub, onHome, onGames, onPlay, onChallenge, onVisit }: Props) {
  const list = cub.challenges
  const [tab, setTab] = useState<Tab | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [finding, setFinding] = useState(false)
  /** A received challenge waiting for the player to confirm the wager. */
  const [confirming, setConfirming] = useState<Challenge | null>(null)
  const [resultsView, setResultsView] = useState<'mine' | 'community'>('mine')
  const [resultsQuery, setResultsQuery] = useState('')
  const [loaded, setLoaded] = useState(list !== null)
  const refresh = cub.refreshChallenges

  useEffect(() => {
    void refresh().then(() => setLoaded(true))
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [refresh])

  const challenges = list?.challenges ?? []
  const clock = now + (list?.clockOffset ?? 0)
  const counts: Record<Tab, number> = {
    active: challenges.filter((c) => inTab(c, 'active')).length,
    received: challenges.filter((c) => inTab(c, 'received')).length,
    sent: challenges.filter((c) => inTab(c, 'sent')).length,
    history: challenges.filter((c) => inTab(c, 'history')).length,
  }
  const shownTab: Tab = tab ?? (counts.received > 0 ? 'received' : counts.active > 0 || counts.sent === 0 ? 'active' : 'sent')
  const shown = challenges.filter((c) => inTab(c, shownTab))
  const cash = cub.save?.cubCash ?? 0
  const going = openChallengeCount(list)
  const full = going >= MAX_OPEN_CHALLENGES

  const act = async (id: string, run: () => Promise<{ status: string; cubCash: number | null }>, expected: string) => {
    if (busy) return
    setBusy(id)
    setMessage(null)
    try {
      const outcome = await run()
      cub.applyServerCash(outcome.cubCash)
      if (outcome.status !== expected) {
        setMessage(
          outcome.status === 'expired'
            ? 'That challenge had already expired.'
            : outcome.status === 'active'
              ? 'That challenge has already been accepted, so it can no longer be cancelled.'
              : outcome.status === 'cancelled'
                ? 'That challenge was cancelled.'
                : 'That challenge has changed. Here is where it stands now.',
        )
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.')
    } finally {
      await refresh()
      setBusy(null)
    }
  }

  if (finding) {
    return (
      <FindPlayers
        onBack={() => setFinding(false)}
        onChallenge={onChallenge}
        onVisit={onVisit}
      />
    )
  }

  return (
    <section className="game-screen game-picks-screen daily-screen challenges-screen">
      <header className="top chal-top">
        <div className="chal-nav">
          <HomeButton className="game-home" onClick={onHome} />
          <GamesButton className="game-home" onClick={onGames} />
        </div>
        <h1>Challenges</h1>
        <button type="button" className="chal-find" onClick={() => setFinding(true)}>
          Find players
        </button>
      </header>
      <div className="chal-tabs" role="tablist" aria-label="Challenges">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={shownTab === item.id}
            className={shownTab === item.id ? 'on' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id !== 'history' && counts[item.id] > 0 ? (
              <span className={item.id === 'received' ? 'chal-count alert' : 'chal-count'}>{counts[item.id]}</span>
            ) : null}
          </button>
        ))}
      </div>
      <p className={full ? 'chal-going full' : 'chal-going'}>
        {going} of {MAX_OPEN_CHALLENGES} challenges going
        {full ? ' · wait for one to finish to send or accept more' : ''}
      </p>
      <div className="daily-list chal-list">
        {message ? <p className="chal-message">{message}</p> : null}
        {shownTab === 'history' ? (
          <div className="chal-results-switch" role="group" aria-label="Whose results">
            <button type="button" className={resultsView === 'mine' ? 'on' : ''} aria-pressed={resultsView === 'mine'} onClick={() => setResultsView('mine')}>
              My results
            </button>
            <button
              type="button"
              className={resultsView === 'community' ? 'on' : ''}
              aria-pressed={resultsView === 'community'}
              onClick={() => setResultsView('community')}
            >
              Community
            </button>
          </div>
        ) : null}
        {shownTab === 'history' && resultsView === 'community' ? (
          <div className="chal-search chal-results-search">
            <input
              type="search"
              value={resultsQuery}
              placeholder="Search a player"
              aria-label="Search results by player name"
              onChange={(event) => setResultsQuery(event.target.value)}
            />
          </div>
        ) : null}
        {shownTab === 'history' && resultsView === 'community' ? (
          <CommunityResults query={resultsQuery} onVisit={onVisit} onChallenge={onChallenge} />
        ) : (
          <>
        {!loaded && list === null ? <p className="chal-empty">Loading challenges...</p> : null}
        {loaded && shown.length === 0 ? (
          <div className="chal-empty">
            <p>
              {shownTab === 'active'
                ? 'No challenges running right now.'
                : shownTab === 'received'
                  ? 'No challenges waiting for you.'
                  : shownTab === 'sent'
                    ? 'You have no challenges waiting for an answer.'
                    : 'Your finished challenges show here.'}
            </p>
            {shownTab !== 'history' ? (
              <button type="button" className="chal-btn" onClick={() => setFinding(true)}>
                Find someone to challenge
              </button>
            ) : null}
          </div>
        ) : null}
        {shown.map((challenge) => (
          <ChallengeCard
            key={challenge.id}
            challenge={challenge}
            clock={clock}
            cash={cash}
            full={full}
            busy={busy === challenge.id}
            onPlay={() => onPlay(challenge.board)}
            onAccept={() => setConfirming(challenge)}
            onDecline={() => void act(challenge.id, () => respondChallenge(challenge.id, false), 'declined')}
            onCancel={() => void act(challenge.id, () => cancelChallenge(challenge.id), 'cancelled')}
            onRematch={() => onChallenge(challenge.opponent.username)}
          />
        ))}
          </>
        )}
      </div>
      {confirming ? (
        <AcceptConfirm
          challenge={confirming}
          cash={cash}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const id = confirming.id
            setConfirming(null)
            void act(id, () => respondChallenge(id, true), 'active')
          }}
        />
      ) : null}
    </section>
  )
}

/** Accepting takes Cub Cash straight away, so the player confirms they understand first. */
function AcceptConfirm({
  challenge,
  cash,
  onCancel,
  onConfirm,
}: {
  challenge: Challenge
  cash: number
  onCancel: () => void
  onConfirm: () => void
}) {
  const name = challenge.opponent.username
  const wager = formatCubCash(challenge.wager)
  return createPortal(
    <div className="challenge-pop" role="presentation" onClick={onCancel}>
      <div
        className="challenge-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="accept-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="challenge-card-face challenge-confirm">
          <p className="challenge-kicker">Wager Cub Cash?</p>
          <h2 id="accept-confirm-title">Accept {name}'s challenge</h2>
          <p className="challenge-confirm-game">{boardLabel(challenge.board)}</p>
          <ul className="challenge-confirm-points">
            <li>
              <strong>{wager} Cub Cash</strong> is taken from your balance now ({formatCubCash(cash)} → {formatCubCash(cash - challenge.wager)}).
            </li>
            <li>You both get 24 hours to play, as many times as you like. Your highest score counts.</li>
            <li>The highest score wins {formatCubCash(challenge.wager * 2)}. If you lose, your wager is gone.</li>
            <li>Once you accept, the challenge can't be cancelled.</li>
          </ul>
          <div className="challenge-confirm-actions">
            <button type="button" className="challenge-main" onClick={onConfirm}>
              Yes, wager {wager}
            </button>
            <button type="button" className="chal-btn chal-light" onClick={onCancel}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.querySelector('.phone') ?? document.body,
  )
}

function ChallengeCard({
  challenge,
  clock,
  cash,
  full,
  busy,
  onPlay,
  onAccept,
  onDecline,
  onCancel,
  onRematch,
}: {
  challenge: Challenge
  clock: number
  cash: number
  /** Already at the most challenges going, so this one can't be accepted yet. */
  full: boolean
  busy: boolean
  onPlay: () => void
  onAccept: () => void
  onDecline: () => void
  onCancel: () => void
  onRematch: () => void
}) {
  const game = challengeGame(challenge.board)
  const name = challenge.opponent.username
  const prize = challenge.wager * 2
  const closed = challenge.status !== 'pending' && challenge.status !== 'active'
  const ending = challenge.status === 'active' ? challenge.endsAt : challenge.acceptBy
  const overdue = !closed && ending !== null && ending <= clock
  const end = closed ? result(challenge) : null

  return (
    <article className={`daily-task chal-card chal-${challenge.status}${end ? ` chal-${end.tone}` : ''}`}>
      <div className="chal-head">
        <Avatar photoUrl={challenge.opponent.photoUrl} name={name} />
        <div className="chal-who">
          <span className="chal-vs">{challenge.role === 'challenger' ? 'You challenged' : 'Challenge from'}</span>
          <strong>{name}</strong>
          <span className="chal-game">{boardLabel(challenge.board)}</span>
        </div>
        {game ? (
          <span className="chal-thumb">
            <GameThumb game={game.game} />
          </span>
        ) : null}
      </div>

      <div className="chal-money">
        <span>
          <img src={coinUrl} alt="" /> Wager {formatCubCash(challenge.wager)}
        </span>
        <span className="chal-prize">
          <img src={coinUrl} alt="" /> Prize {formatCubCash(prize)}
        </span>
      </div>

      {challenge.status === 'active' || challenge.status === 'completed' ? (
        <div className="chal-scores">
          <div className={challenge.myBest !== null && (challenge.theirBest === null || challenge.myBest > challenge.theirBest) ? 'lead' : ''}>
            <span>You</span>
            <strong>{score(challenge.myBest)}</strong>
          </div>
          <div className={challenge.theirBest !== null && (challenge.myBest === null || challenge.theirBest > challenge.myBest) ? 'lead' : ''}>
            <span>{name}</span>
            <strong>{score(challenge.theirBest)}</strong>
          </div>
        </div>
      ) : null}

      {!closed ? (
        <p className="chal-time">
          {overdue
            ? 'Finishing up...'
            : challenge.status === 'active'
              ? `${timeLeft(challenge.endsAt, clock)} left to play`
              : `${timeLeft(challenge.acceptBy, clock)} left to accept`}
        </p>
      ) : null}

      {end ? (
        <p className={`chal-result ${end.tone}`}>
          <strong>{end.label}</strong>
          {end.net !== 0 ? (
            <span>
              {end.net > 0 ? '+' : '−'}
              {formatCubCash(Math.abs(end.net))} Cub Cash
            </span>
          ) : null}
          {challenge.closedAt ? <small>{new Date(challenge.closedAt).toLocaleDateString()}</small> : null}
        </p>
      ) : null}

      <div className="chal-actions">
        {challenge.status === 'active' && !overdue ? (
          <button type="button" className="chal-btn chal-play" onClick={onPlay}>
            ▶ Play {game?.game === 'solitaire' ? game.label : (game?.label ?? 'game')}
          </button>
        ) : null}
        {challenge.status === 'pending' && challenge.role === 'opponent' && !overdue ? (
          <>
            <button type="button" className="chal-btn chal-accept" disabled={busy || full || wagerableCash(cash) < challenge.wager} onClick={onAccept}>
              {busy ? '...' : `Accept · ${formatCubCash(challenge.wager)}`}
            </button>
            <button type="button" className="chal-btn chal-light" disabled={busy} onClick={onDecline}>
              Decline
            </button>
          </>
        ) : null}
        {challenge.status === 'pending' && challenge.role === 'challenger' && !overdue ? (
          <button type="button" className="chal-btn chal-light" disabled={busy} onClick={onCancel}>
            {busy ? '...' : 'Cancel challenge'}
          </button>
        ) : null}
        {closed ? (
          <button type="button" className="chal-btn chal-light" onClick={onRematch}>
            Challenge again
          </button>
        ) : null}
      </div>
      {challenge.status === 'pending' && challenge.role === 'opponent' && full ? (
        <p className="chal-note">You have {MAX_OPEN_CHALLENGES} challenges going. Finish one to accept this.</p>
      ) : challenge.status === 'pending' && challenge.role === 'opponent' && wagerableCash(cash) < challenge.wager ? (
        <p className="chal-note">
          You need {formatCubCash(challenge.wager + STARTER_CASH)} Cub Cash to accept. Your first {STARTER_CASH} can't be wagered.
        </p>
      ) : null}
      {challenge.status === 'pending' && challenge.role === 'challenger' ? (
        <p className="chal-note">Your {formatCubCash(challenge.wager)} Cub Cash is held until {name} answers.</p>
      ) : null}
    </article>
  )
}

/** Finished challenges between any players, newest first. */
function CommunityResults({
  query,
  onVisit,
  onChallenge,
}: {
  /** Only results where either player's name contains this. */
  query: string
  onVisit: (profile: PlayerProfile) => void
  onChallenge: (username: string) => void
}) {
  const [rows, setRows] = useState<CommunityResult[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<string | null>(null)
  const ask = useRef(0)
  const text = query.trim()

  const load = (offset: number) => {
    const id = ++ask.current
    setLoading(true)
    setError(null)
    void loadCommunityResults(offset, text)
      .then((page) => {
        if (id !== ask.current) return
        setRows((old) => (offset === 0 ? page.rows : [...old, ...page.rows]))
        setMore(page.more)
      })
      .catch((reason: unknown) => {
        if (id === ask.current) setError(reason instanceof Error ? reason.message : 'Could not load results.')
      })
      .finally(() => {
        if (id === ask.current) setLoading(false)
      })
  }

  useEffect(() => {
    const timer = window.setTimeout(() => load(0), text ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [text])

  const side = (player: CommunityResult['challenger'], won: boolean) => (
    <button type="button" className={won ? 'chal-side won' : 'chal-side'} onClick={() => setProfile(player.username)}>
      <Avatar photoUrl={player.photoUrl} name={player.username} />
      <strong>{player.username}</strong>
      <span className="chal-side-score">{score(player.best)}</span>
      {won ? <span className="chal-side-crown">Winner</span> : null}
    </button>
  )

  return (
    <>
      {error ? <p className="chal-message">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="chal-empty">{text ? `No results for "${text}".` : 'No finished challenges yet. Be the first!'}</p>
      ) : null}
      {rows.map((row) => (
        <article key={row.id} className={row.mine ? 'daily-task chal-card chal-community mine' : 'daily-task chal-card chal-community'}>
          <p className="chal-community-head">
            <span className="chal-game">{boardLabel(row.board)}</span>
            <small>{new Date(row.closedAt).toLocaleDateString()}</small>
          </p>
          <div className="chal-versus">
            {side(row.challenger, row.winner === row.challenger.username)}
            <span className="chal-vs-mark">VS</span>
            {side(row.opponent, row.winner === row.opponent.username)}
          </div>
          <p className="chal-community-foot">
            <img src={coinUrl} alt="" />
            {row.draw
              ? `Draw · both got their ${formatCubCash(row.wager)} back`
              : `${row.winner ?? 'Winner'} won ${formatCubCash(row.wager * 2)} Cub Cash`}
          </p>
        </article>
      ))}
      {loading ? <p className="chal-empty">Loading results...</p> : null}
      {!loading && more ? (
        <button type="button" className="chal-btn chal-light" onClick={() => load(rows.length)}>
          Load more
        </button>
      ) : null}
      {profile ? (
        <PlayerProfileCard
          key={profile}
          username={profile}
          mine={false}
          onClose={() => setProfile(null)}
          onVisit={(found) => {
            setProfile(null)
            onVisit(found)
          }}
          onChallenge={(name) => {
            setProfile(null)
            onChallenge(name)
          }}
        />
      ) : null}
    </>
  )
}

/** Everyone on the all-time overall leaderboard, with a search. */
function FindPlayers({
  onBack,
  onChallenge,
  onVisit,
}: {
  onBack: () => void
  onChallenge: (username: string) => void
  onVisit: (profile: PlayerProfile) => void
}) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<ChallengePlayer[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<string | null>(null)
  const ask = useRef(0)

  const load = (text: string, offset: number) => {
    const id = ++ask.current
    setLoading(true)
    setError(null)
    void findPlayers(text, offset)
      .then((page) => {
        if (id !== ask.current) return
        setRows((old) => (offset === 0 ? page.rows : [...old, ...page.rows]))
        setTotal(page.total)
      })
      .catch((reason: unknown) => {
        if (id === ask.current) setError(reason instanceof Error ? reason.message : 'Could not load players.')
      })
      .finally(() => {
        if (id === ask.current) setLoading(false)
      })
  }

  useEffect(() => {
    const timer = window.setTimeout(() => load(query.trim(), 0), query ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [query])

  return (
    <section className="game-screen game-picks-screen daily-screen challenges-screen">
      <header className="top chal-top">
        <button type="button" className="chal-back" onClick={onBack} aria-label="Back to challenges">
          ‹ Back
        </button>
        <h1>Find players</h1>
        <span />
      </header>
      <div className="chal-search">
        <input
          type="search"
          value={query}
          placeholder="Search by username"
          aria-label="Search players by username"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="daily-list chal-list">
        {error ? <p className="chal-message">{error}</p> : null}
        {!loading && rows.length === 0 && !error ? <p className="chal-empty">No players found.</p> : null}
        <ul className="chal-players">
          {rows.map((row) => (
            <li key={row.username}>
              <button type="button" className="chal-player" onClick={() => setProfile(row.username)}>
                <span className="chal-rank">#{row.rank}</span>
                <Avatar photoUrl={row.photoUrl} name={row.username} />
                <span className="chal-player-name">
                  <strong>{row.username}</strong>
                  <small>{row.score.toLocaleString('en-US')} all-time</small>
                </span>
              </button>
              <button type="button" className="chal-btn chal-small" onClick={() => onChallenge(row.username)}>
                Challenge
              </button>
            </li>
          ))}
        </ul>
        {loading ? <p className="chal-empty">Loading players...</p> : null}
        {!loading && rows.length < total ? (
          <button type="button" className="chal-btn chal-light" onClick={() => load(query.trim(), rows.length)}>
            Load more
          </button>
        ) : null}
      </div>
      {profile ? (
        <PlayerProfileCard
          key={profile}
          username={profile}
          mine={false}
          onClose={() => setProfile(null)}
          onVisit={(found) => {
            setProfile(null)
            onVisit(found)
          }}
          onChallenge={(name) => {
            setProfile(null)
            onChallenge(name)
          }}
        />
      ) : null}
    </section>
  )
}
