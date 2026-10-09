import { useEffect, useState, type ReactNode } from 'react'
import dashThumb from '../assets/galactic-dash-cover.jpg'
import archerThumb from '../assets/cupid-archer/cover.jpg'
import hoopsThumb from '../assets/lazy-hoops/cover-select.jpg'
import dojoBg from '../assets/lazy-dojo/backgrounds/dojo-1.png'
import dojoCover from '../assets/lazy-dojo/ui/ninja-cub-cover.png'
import controllerUrl from '../assets/controller-icon.png'
import dropUrl from '../assets/drop-ui.png'
import moonUrl from '../assets/moon-ui.png'
import meatOldUrl from '../assets/feed-carton-centered.png'
import meatYoungUrl from '../assets/feed-bottle-ui.png'
import shirtUrl from '../assets/shirt-ui.png'
import lionPawUrl from '../assets/lion-paw-clear.png'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import chestUrl from '../assets/daily-chest.png'
import { traitSlug, tryOnFromPicks } from '../game/cubTraits'
import { sanitizeOwnedOutfit } from '../game/traitShop'
import { getHomeCharacterAge, setHomeCharacter, type CharacterAge } from '../game/homeScene'
import {
  DAILY_TASKS,
  DAILY_WINDOW_MS,
  claimableCount,
  dailyView,
  formatResetCountdown,
  msUntilDailyReset,
  taskReady,
  taskScore,
} from '../game/dailyTasks'
import { barIsFull, levelProgress } from '../game/progress'
import { formatCubCash } from '../game/formatCubCash'
import type { CubController } from '../game/useCub'
import { CubStage } from './CubStage'
import { HomeButton } from './HomeButton'
import { WardrobeScreen } from './WardrobeScreen'

type Props = {
  cub: CubController
  onFlight: () => void
  onMatch: () => void
  onDojo: () => void
  onArcher: () => void
  onHoops: () => void
  startInGames?: boolean
}

function DailyResetClock({ startedAt, now }: { startedAt: number | null; now: number }) {
  const remain = msUntilDailyReset(startedAt, new Date(now))
  const label = formatResetCountdown(remain ?? DAILY_WINDOW_MS)
  const waiting = startedAt == null
  return (
    <p
      className="daily-reset"
      aria-label={waiting ? `Tasks reset in ${label} once you play a challenge` : `Tasks reset in ${label}`}
    >
      <span>Tasks reset in</span>
      <strong>{label}</strong>
    </p>
  )
}

export function CareScreen({ cub, onFlight, onMatch, onDojo, onArcher, onHoops, startInGames = false }: Props) {
  const [gamesOpen, setGamesOpen] = useState(startInGames)
  const [dailyOpen, setDailyOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [coinBurst, setCoinBurst] = useState<{ id: string; key: number } | null>(null)
  const [wardrobeOpen, setWardrobeOpen] = useState(false)
  const [age, setAge] = useState<CharacterAge>(() => getHomeCharacterAge())
  const save = cub.save

  useEffect(() => {
    setHomeCharacter(age)
  }, [age])

  useEffect(() => {
    if (!dailyOpen) return
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [dailyOpen])

  useEffect(() => {
    // Home room and wardrobe both show the LVL badge; the games picker does not.
    cub.setLevelUiVisible(!gamesOpen && !dailyOpen)
    return () => cub.setLevelUiVisible(false)
  }, [cub.setLevelUiVisible, dailyOpen, gamesOpen])

  const flashPress = (event: { currentTarget: HTMLElement }) => {
    const button = event.currentTarget
    button.classList.remove('press-glow')
    void button.offsetWidth
    button.classList.add('press-glow')
  }

  const clearPressGlow = (event: { currentTarget: HTMLElement }) => {
    event.currentTarget.classList.remove('press-glow')
  }

  const flashSilverPress = (event: { currentTarget: HTMLElement }) => {
    const button = event.currentTarget
    button.classList.remove('press-glow-silver')
    void button.offsetWidth
    button.classList.add('press-glow-silver')
  }

  const clearSilverPressGlow = (event: { currentTarget: HTMLElement }) => {
    event.currentTarget.classList.remove('press-glow-silver')
  }

  if (!save) return null

  if (gamesOpen) {
    return (
      <section className="game-screen game-picks-screen">
        <header className="top">
          <HomeButton className="game-home" onClick={() => setGamesOpen(false)} />
          <h1>Select a game</h1>
        </header>
        <div className="game-picks">
          <button
            type="button"
            className="game-pick"
            onPointerDown={flashSilverPress}
            onPointerUp={clearSilverPressGlow}
            onPointerCancel={clearSilverPressGlow}
            onClick={onFlight}
          >
            <span className="game-thumb thumb-flight" aria-hidden="true">
              <img src={dashThumb} alt="" />
            </span>
            <span>Kovu's Space Dash</span>
          </button>
          <button
            type="button"
            className="game-pick"
            onPointerDown={flashSilverPress}
            onPointerUp={clearSilverPressGlow}
            onPointerCancel={clearSilverPressGlow}
            onClick={onMatch}
          >
            <span className="game-thumb thumb-match" aria-hidden="true">
              <PrideThumbBack />
              <PrideThumbCell body="Zebra" />
              <PrideThumbCell body="Zebra" />
              <PrideThumbBack />
            </span>
            <span>Pride Pairs</span>
          </button>
          <button
            type="button"
            className="game-pick"
            onPointerDown={flashSilverPress}
            onPointerUp={clearSilverPressGlow}
            onPointerCancel={clearSilverPressGlow}
            onClick={onDojo}
          >
            <span className="game-thumb thumb-dojo" aria-hidden="true">
              <img className="thumb-dojo-bg" src={dojoBg} alt="" />
              <img className="thumb-dojo-cover" src={dojoCover} alt="" />
            </span>
            <span>Ninja Cub Dojo</span>
          </button>
          <button
            type="button"
            className="game-pick"
            onPointerDown={flashSilverPress}
            onPointerUp={clearSilverPressGlow}
            onPointerCancel={clearSilverPressGlow}
            onClick={onArcher}
          >
            <span className="game-thumb thumb-archer" aria-hidden="true">
              <img src={archerThumb} alt="" />
            </span>
            <span>Cupid Archery</span>
          </button>
          <button
            type="button"
            className="game-pick"
            onPointerDown={flashSilverPress}
            onPointerUp={clearSilverPressGlow}
            onPointerCancel={clearSilverPressGlow}
            onClick={onHoops}
          >
            <span className="game-thumb thumb-hoops" aria-hidden="true">
              <img src={hoopsThumb} alt="" />
            </span>
            <span>Lazy Hoops</span>
          </button>
        </div>
      </section>
    )
  }

  if (dailyOpen) {
    const daily = dailyView(save.daily, new Date(now))
    const done = DAILY_TASKS.filter((task) => daily.claimed.includes(task.id)).length
    return (
      <section className="game-screen game-picks-screen daily-screen">
        <header className="top">
          <HomeButton className="game-home" onClick={() => setDailyOpen(false)} />
          <h1>Daily Tasks</h1>
          <DailyResetClock startedAt={daily.startedAt} now={now} />
        </header>
        <div className="daily-list">
          {DAILY_TASKS.map((task) => {
            const score = taskScore(daily, task)
            const claimed = daily.claimed.includes(task.id)
            const ready = taskReady(daily, task)
            const play =
              task.game === 'flight'
                ? onFlight
                : task.game === 'hoops'
                  ? onHoops
                  : task.game === 'archer'
                    ? onArcher
                    : task.game === 'dojo'
                      ? onDojo
                      : onMatch
            return (
              <article key={task.id} className="daily-task">
                <h2>{task.gameLabel}</h2>
                <p>{task.detail}</p>
                <p className="daily-count">
                  {score} / {task.goal}
                </p>
                <div className="daily-meter" aria-hidden="true">
                  <span style={{ width: `${(score / task.goal) * 100}%` }} />
                </div>
                <div className="daily-row">
                  <span className="daily-reward">
                    <img src={coinUrl} alt="" />
                    {task.reward}
                  </span>
                  {claimed ? (
                    <button type="button" className="daily-claim" disabled>
                      Claimed
                    </button>
                  ) : ready ? (
                    <button
                      type="button"
                      className="daily-claim"
                      onClick={() => {
                        if (!cub.claimDaily(task.id)) return
                        setCoinBurst((current) => ({ id: task.id, key: (current?.key ?? 0) + 1 }))
                      }}
                    >
                      Claim
                    </button>
                  ) : (
                    <button type="button" className="daily-play" onClick={play}>
                      Play
                    </button>
                  )}
                  {coinBurst?.id === task.id ? <CoinBurst key={coinBurst.key} /> : null}
                </div>
              </article>
            )
          })}
          <p className="daily-note">
            {daily.startedAt == null
              ? 'Play a challenge to start the 24 hour timer.'
              : done === DAILY_TASKS.length
                ? 'All claimed for this round.'
                : 'Same challenges until the timer ends.'}
          </p>
        </div>
      </section>
    )
  }

  if (wardrobeOpen) {
    return (
      <WardrobeScreen
        cub={cub}
        age={age}
        onAge={(next) => {
          setAge(next)
          setHomeCharacter(next)
        }}
        onBack={() => setWardrobeOpen(false)}
      />
    )
  }

  const feedFull = barIsFull(save.hunger)
  const cleanFull = barIsFull(save.cleanliness)
  const energyFull = barIsFull(save.energy)
  const progress = levelProgress(cub.presentedXp)
  const asleep = cub.asleep
  const xpPct = (progress.into / Math.max(1, progress.next)) * 100
  const ringR = 36
  const ringC = 2 * Math.PI * ringR

  return (
    <section className="home-room">
      <CubStage
        appearance={save.appearance}
        pose={cub.pose}
        dim={asleep}
        onPet={cub.pet}
        tryOn={tryOnFromPicks(sanitizeOwnedOutfit(save, age, save.outfits[age]))}
      />
      <div className="room-ui">
        <div className="age-switch" role="group" aria-label="Character age">
          <button
            type="button"
            className={age === 'young' ? 'on' : ''}
            aria-pressed={age === 'young'}
            onClick={() => {
              setAge('young')
              setHomeCharacter('young')
            }}
          >
            Young
          </button>
          <button
            type="button"
            className={age === 'old' ? 'on' : ''}
            aria-pressed={age === 'old'}
            onClick={() => {
              setAge('old')
              setHomeCharacter('old')
            }}
          >
            Old
          </button>
        </div>
        <div className="top-stats">
          <div
            className={cub.levelUp ? 'level-badge level-up' : 'level-badge'}
            key={cub.levelUp ?? 'level'}
            aria-label={`Level ${progress.level}, ${progress.into} of ${progress.next} experience`}
          >
            <svg className="xp-ring" viewBox="0 0 84 84" aria-hidden="true">
              <circle className="xp-ring-track" cx="42" cy="42" r={ringR} />
              {xpPct > 0 ? (
                <circle
                  className="xp-ring-fill"
                  cx="42"
                  cy="42"
                  r={ringR}
                  strokeDasharray={`${(xpPct / 100) * ringC} ${ringC}`}
                />
              ) : null}
            </svg>
            <span className="lvl-face">
              <span className="lvl-kicker">LVL</span>
              <strong>{progress.level}</strong>
            </span>
          </div>
          <div className="cub-cash" aria-label={`${formatCubCash(save.cubCash)} Cub Cash`}>
            <span className="cub-cash-inner">
              <img src={coinUrl} alt="" />
              <strong>{formatCubCash(save.cubCash)}</strong>
            </span>
          </div>
        </div>
        {cub.toast ? <p className="home-toast">{cub.toast}</p> : null}
        <button
          type="button"
          className="daily-open"
          aria-label={claimableCount(dailyView(save.daily)) > 0 ? 'Daily Bonus, reward ready' : 'Daily Bonus'}
          onPointerDown={flashPress}
          onPointerUp={clearPressGlow}
          onPointerCancel={clearPressGlow}
          onClick={() => setDailyOpen(true)}
        >
          <span className="wood-btn-wrap">
            {claimableCount(dailyView(save.daily)) > 0 ? <span className="daily-alert">!</span> : null}
            <img className="daily-chest" src={chestUrl} alt="" />
          </span>
        </button>
        <button
          type="button"
          className="wardrobe-open"
          aria-label="Wardrobe"
          onPointerDown={flashPress}
          onPointerUp={clearPressGlow}
          onPointerCancel={clearPressGlow}
          onClick={() => setWardrobeOpen(true)}
        >
          <span className="wood-btn">
            <ShirtIcon />
          </span>
        </button>
        <div className="room-dock">
          <button
            type="button"
            className="room-action"
            disabled={cub.busy || asleep || feedFull}
            onPointerDown={flashPress}
            onPointerUp={clearPressGlow}
            onPointerCancel={clearPressGlow}
            onClick={() => cub.care('feed')}
          >
            <span className="wood-btn-wrap">
              {save.hunger < 30 ? <span className="need-alert" aria-label="Energy needs attention">!</span> : null}
              <span className="wood-btn">
                <img className={age === 'young' ? 'meat-mouth' : 'meat-mouth meat-old'} src={age === 'young' ? meatYoungUrl : meatOldUrl} alt="" />
              </span>
            </span>
            <WoodLabel value={save.hunger} color="#e08a3c">
              Energy
            </WoodLabel>
          </button>
          <button
            type="button"
            className="room-action"
            disabled={cub.busy || asleep}
            onPointerDown={flashPress}
            onPointerUp={clearPressGlow}
            onPointerCancel={clearPressGlow}
            onClick={() => setGamesOpen(true)}
          >
            <span className="wood-btn-wrap">
              {save.happiness < 30 ? <span className="need-alert" aria-label="Mood needs attention">!</span> : null}
              <span className="wood-btn">
                <PlayIcon />
              </span>
            </span>
            <WoodLabel value={save.happiness} color="#d45d78">
              Mood
            </WoodLabel>
          </button>
          <button
            type="button"
            className="room-action"
            disabled={cub.busy || (!asleep && energyFull)}
            onPointerDown={flashPress}
            onPointerUp={clearPressGlow}
            onPointerCancel={clearPressGlow}
            onClick={cub.toggleSleep}
          >
            <span className="wood-btn-wrap">
              {save.energy < 30 ? <span className="need-alert" aria-label="Sleep needs attention">!</span> : null}
              <span className="wood-btn">
                <MoonIcon />
              </span>
            </span>
            <WoodLabel value={save.energy} color="#3d8fba">
              {asleep ? 'Wake' : 'Sleep'}
            </WoodLabel>
          </button>
          <button
            type="button"
            className="room-action"
            disabled={cub.busy || asleep || cleanFull}
            onPointerDown={flashPress}
            onPointerUp={clearPressGlow}
            onPointerCancel={clearPressGlow}
            onClick={() => cub.care('clean')}
          >
            <span className="wood-btn-wrap">
              {save.cleanliness < 30 ? <span className="need-alert" aria-label="Wash needs attention">!</span> : null}
              <span className="wood-btn">
                <DropIcon />
              </span>
            </span>
            <WoodLabel value={save.cleanliness} color="#3f9a78">
              Wash
            </WoodLabel>
          </button>
        </div>
      </div>
    </section>
  )
}

function CoinBurst() {
  return (
    <span className="daily-coins" aria-hidden="true">
      <img src={coinUrl} alt="" />
      <img src={coinUrl} alt="" />
      <img src={coinUrl} alt="" />
      <img src={coinUrl} alt="" />
      <img src={coinUrl} alt="" />
    </span>
  )
}

function WoodLabel({ value, color, children }: { value: number; color: string; children: ReactNode }) {
  const amount = Math.max(0, Math.min(100, value))
  const low = amount < 25
  return (
    <span className="wood-label">
      <span className="need-fill" style={{ width: `${low ? Math.max(amount, 8) : amount}%`, background: low ? '#c4473a' : color }} />
      <span>{children}</span>
    </span>
  )
}

function PlayIcon() {
  return <img className="controller" src={controllerUrl} alt="" />
}

function ShirtIcon() {
  return <img className="shirt" src={shirtUrl} alt="" />
}

function MoonIcon() {
  return <img className="moon" src={moonUrl} alt="" />
}

function DropIcon() {
  return <img className="drop" src={dropUrl} alt="" />
}

function prideLayer(part: string, name: string) {
  return `/traits/layers/old/${part}/${traitSlug(name)}.png`
}

function PrideThumbCell({ body }: { body: string }) {
  return (
    <span className="pride-thumb-cell">
      <span className="pride-thumb-bust">
        <img src={prideLayer('body', body)} alt="" />
        <img src={prideLayer('mouth', 'Smirk')} alt="" />
        <img src={prideLayer('eyes', 'Surprised')} alt="" />
        <img src={prideLayer('mane', 'Black')} alt="" />
      </span>
    </span>
  )
}

function PrideThumbBack() {
  return (
    <span className="pride-thumb-cell pride-thumb-back">
      <img className="pride-thumb-paw" src={lionPawUrl} alt="" />
    </span>
  )
}
