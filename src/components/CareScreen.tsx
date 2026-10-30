import { useEffect, useState, type ReactNode } from 'react'
import dashThumb from '../assets/galactic-dash-cover.jpg'
import archerThumb from '../assets/cupid-archer/cover.jpg'
import hoopsThumb from '../assets/lazy-hoops/cover-select.jpg'
import bubbleThumb from '../assets/bubble-blast/thumb.jpg'
import riverThumb from '../assets/lazy-river/game-thumb-cub.jpg'
import dojoBg from '../assets/lazy-dojo/backgrounds/dojo-1.png'
import dojoCover from '../assets/lazy-dojo/ui/ninja-cub-cover.png'
import controllerUrl from '../assets/controller-icon.png'
import dropUrl from '../assets/drop-ui.png'
import moonUrl from '../assets/moon-ui.png'
import shirtUrl from '../assets/shirt-ui.png'
import lionPawUrl from '../assets/lion-paw-clear.png'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import diceIconUrl from '../assets/dice-ui.png'
import chestUrl from '../assets/daily-chest.png'
import shopFaceUrl from '../assets/home/shop-badge.png'
import { traitSlug, tryOnFromPicks, type TraitCategory } from '../game/cubTraits'
import { isTraitUnlocked, sanitizeOwnedOutfit } from '../game/traitShop'
import { activityArea, setActivityArea } from '../game/activity'
import { getHomeCharacterAge, setHomeCharacter, type CharacterAge } from '../game/homeScene'
import {
  BONUS_TRAIT_CHANCE,
  BONUS_TASKS_REQUIRED,
  DAILY_TASKS,
  pickBonusTrait,
  rollBonusCoins,
  type BonusTrait,
  type DailyGame,
  bonusReady,
  dailyNeedsAttention,
  dailyView,
  formatResetCountdown,
  msUntilDailyReset,
  taskReady,
  taskScore,
  tasksComplete,
} from '../game/dailyTasks'
import { playDiceRattle } from '../game/diceAudio'
import { startHalloweenBgm, stopHalloweenBgm } from '../game/halloweenBgm'
import { pumpkinLit } from '../game/halloween'
import { playCoin } from '../game/flightAudio'
import { barIsFull, energyFillColor, levelProgress, PLAY_ENERGY_COST, playEnergyCost } from '../game/progress'
import { formatCubCash } from '../game/formatCubCash'
import type { CubController } from '../game/useCub'
import { CubStage } from './CubStage'
import { HomeButton } from './HomeButton'
import { DailyTraitRoll, ageCubLabel, traitsFromManifest } from './DailyTraitRoll'
import { AccountPanel } from './AccountPanel'
import { AchievementsPanel } from './AchievementsPanel'
import { CubPowerPanel, multiplierText } from './CubPowerPanel'
import cubPowerUiUrl from '../assets/home/cub-power-plate.png'
import { PowerNoticePop } from './PowerNoticePop'
import { PROFILE_PICTURES } from '../game/profileArt'
import { useOwnProfile } from '../game/useOwnProfile'
import { isDemo, requestSignUp } from '../game/demo'
import { DemoLockBanner } from './DemoLockBanner'
import { LeaderboardScreen } from './LeaderboardScreen'
import { WardrobeScreen } from './WardrobeScreen'
import { ShopScreen } from './ShopScreen'

type Props = {
  cub: CubController
  onFlight: () => void
  onMatch: () => void
  onDojo: () => void
  onArcher: () => void
  onHoops: () => void
  onBubble: () => void
  onRiver: () => void
  startInGames?: boolean
  startInShop?: boolean
  /** Open the Achievements list straight away, from the badge-earned pop-up. */
  startInAchievements?: boolean
}

function DailyResetClock({ startedAt, now }: { startedAt: number | null; now: number }) {
  const remain = msUntilDailyReset(startedAt, new Date(now))
  if (remain == null || remain <= 0) return <span className="daily-reset-gap" aria-hidden="true" />
  const label = formatResetCountdown(remain)
  return (
    <p className="daily-reset" aria-label={`Tasks reset in ${label}`}>
      <span>Tasks reset in</span>
      <strong>{label}</strong>
    </p>
  )
}

export function CareScreen({
  cub,
  onFlight,
  onMatch,
  onDojo,
  onArcher,
  onHoops,
  onBubble,
  onRiver,
  startInGames = false,
  startInShop = false,
  startInAchievements = false,
}: Props) {
  const [gamesOpen, setGamesOpen] = useState(startInGames && !startInShop)
  const [boardOpen, setBoardOpen] = useState(false)
  const [boardPressed, setBoardPressed] = useState(false)
  const [dailyOpen, setDailyOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [coinBurst, setCoinBurst] = useState<{ id: string; key: number } | null>(null)
  const [wardrobeOpen, setWardrobeOpen] = useState(false)
  const [shopOpen, setShopOpen] = useState(startInShop)
  /** Energy the picked game needs, while its "Recover energy" popup is open. */
  const [energyWarn, setEnergyWarn] = useState<number | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [achievementsOpen, setAchievementsOpen] = useState(startInAchievements)
  const [powerOpen, setPowerOpen] = useState(false)
  const [bonusRoll, setBonusRoll] = useState<{ prize: BonusTrait | null; coins: number } | null>(null)
  const [diceShake, setDiceShake] = useState(false)
  const [age, setAge] = useState<CharacterAge>(() => getHomeCharacterAge())
  const save = cub.save
  const [profileRefresh, setProfileRefresh] = useState(0)
  const own = useOwnProfile(cub.accountName, save, profileRefresh)

  useEffect(() => {
    setHomeCharacter(age)
  }, [age])

  const onCubHome = !gamesOpen && !shopOpen && !wardrobeOpen && !boardOpen && !dailyOpen && !cub.asleep

  useEffect(() => {
    if (!onCubHome) {
      stopHalloweenBgm()
      return
    }
    const sync = () => {
      if (pumpkinLit()) startHalloweenBgm()
    }
    sync()
    window.addEventListener('pointerdown', sync)
    return () => {
      window.removeEventListener('pointerdown', sync)
      stopHalloweenBgm()
    }
  }, [onCubHome])

  useEffect(() => {
    if (!dailyOpen) return
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [dailyOpen])

  useEffect(() => {
    if (!wardrobeOpen) return
    setActivityArea('wardrobe')
    return () => {
      if (activityArea() === 'wardrobe') setActivityArea('home')
    }
  }, [wardrobeOpen])

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

  const demo = isDemo()

  const tryGame = (game: DailyGame, start: () => void) => {
    const cost = playEnergyCost(game)
    if (!demo && save.energy < cost) {
      setEnergyWarn(cost)
      return
    }
    setEnergyWarn(null)
    start()
  }

  if (boardOpen) {
    return (
      <LeaderboardScreen
        onHome={() => { setBoardOpen(false); setGamesOpen(false) }}
        onGames={() => setBoardOpen(false)}
        onSettlePrize={cub.collectWeeklyPrize}
      />
    )
  }

  if (gamesOpen) {
    return (
      <section className="game-screen game-picks-screen">
        <header className="top">
          <HomeButton className="game-home" onClick={() => setGamesOpen(false)} />
          <h1>Select a game</h1>
        </header>
        <button
          type="button"
          className={`leaderboard-open${boardPressed ? ' is-pressed' : ''}`}
          onPointerDown={() => setBoardPressed(true)}
          onPointerCancel={() => setBoardPressed(false)}
          onClick={() => window.setTimeout(() => setBoardOpen(true), 110)}
        >
          <span className="leaderboard-open-shine" aria-hidden="true" />
          <span className="leaderboard-open-face">
            <span className="leaderboard-open-trophy" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M7.2 3.5h9.6v2.4c0 3.1-1.9 5.4-4.8 6-2.9-.6-4.8-2.9-4.8-6V3.5z" fill="#fffaf2" stroke="#6a3c12" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M7.2 5.4H5.2c-.9 0-1.5.6-1.5 1.5 0 1.7 1.3 3 3.2 3.2" stroke="#6a3c12" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M16.8 5.4h2c.9 0 1.5.6 1.5 1.5 0 1.7-1.3 3-3.2 3.2" stroke="#6a3c12" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M12 12v2.4" stroke="#6a3c12" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M8.2 16.6h7.6c.5 1.1.2 2.2-1.4 2.2H9.6c-1.6 0-1.9-1.1-1.4-2.2z" fill="#fffaf2" stroke="#6a3c12" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="leaderboard-open-copy">
              <span className="leaderboard-open-title">Leaderboards</span>
              <span className="leaderboard-open-sub">Weekly • All-Time • Global Rankings</span>
            </span>
            <span className="leaderboard-open-podium" aria-hidden="true">
              <svg viewBox="0 0 48 32">
                <defs>
                  <linearGradient id="lb-silver" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#f7f9fc" />
                    <stop offset="0.4" stopColor="#d5deea" />
                    <stop offset="1" stopColor="#8e9aab" />
                  </linearGradient>
                  <linearGradient id="lb-gold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fff0b8" />
                    <stop offset="0.4" stopColor="#f0c14a" />
                    <stop offset="1" stopColor="#b67a1e" />
                  </linearGradient>
                  <linearGradient id="lb-bronze" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#f3c296" />
                    <stop offset="0.45" stopColor="#d4894a" />
                    <stop offset="1" stopColor="#8a4e22" />
                  </linearGradient>
                </defs>
                <rect x="1" y="13" width="14" height="18" rx="2" fill="url(#lb-silver)" stroke="#5c6b80" strokeWidth="1" />
                <text x="8" y="25" textAnchor="middle" fill="#243044" fontSize="9" fontWeight="800">2</text>
                <rect x="17" y="1" width="14" height="30" rx="2" fill="url(#lb-gold)" stroke="#7a4e12" strokeWidth="1" />
                <text x="24" y="19" textAnchor="middle" fill="#5a3010" fontSize="11" fontWeight="800">1</text>
                <rect x="33" y="17" width="14" height="14" rx="2" fill="url(#lb-bronze)" stroke="#6a3818" strokeWidth="1" />
                <text x="40" y="27" textAnchor="middle" fill="#4a2410" fontSize="8" fontWeight="800">3</text>
              </svg>
            </span>
          </span>
        </button>
        {energyWarn != null ? (
          <div className="energy-pop" role="presentation" onClick={() => setEnergyWarn(null)}>
            <div
              className="energy-pop-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="energy-pop-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="energy-pop-face">
                <h2 id="energy-pop-title">Recover energy</h2>
                <p>You need {energyWarn} energy to play. Buy a drink in the shop to fill the bar, or put your cub to sleep.</p>
                <button
                  type="button"
                  className="energy-pop-shop"
                  onClick={() => {
                    setEnergyWarn(null)
                    setGamesOpen(false)
                    setShopOpen(true)
                  }}
                >
                  Visit the shop
                </button>
                <button type="button" className="energy-pop-close" onClick={() => setEnergyWarn(null)}>
                  Not now
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="game-picks">
          <button
            type="button"
            className="game-pick"
            onPointerDown={flashSilverPress}
            onPointerUp={clearSilverPressGlow}
            onPointerCancel={clearSilverPressGlow}
            onClick={() => tryGame('river', onRiver)}
          >
            <span className="game-thumb thumb-river" aria-hidden="true">
              <img src={riverThumb} alt="" />
              <span className="game-new-sash">New</span>
            </span>
            <span>Lazy River</span>
          </button>
          <button
            type="button"
            className="game-pick"
            onPointerDown={flashSilverPress}
            onPointerUp={clearSilverPressGlow}
            onPointerCancel={clearSilverPressGlow}
            onClick={() => tryGame('bubble', onBubble)}
          >
            <span className="game-thumb thumb-bubble" aria-hidden="true">
              <img src={bubbleThumb} alt="" />
              <span className="game-new-sash">New</span>
            </span>
            <span>Bubble Blast</span>
          </button>
          <button
            type="button"
            className="game-pick"
            onPointerDown={flashSilverPress}
            onPointerUp={clearSilverPressGlow}
            onPointerCancel={clearSilverPressGlow}
            onClick={() => tryGame('flight', onFlight)}
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
            onClick={() => tryGame('hoops', onHoops)}
          >
            <span className="game-thumb thumb-hoops" aria-hidden="true">
              <img src={hoopsThumb} alt="" />
            </span>
            <span>Lazy Hoops</span>
          </button>
          <button
            type="button"
            className="game-pick"
            onPointerDown={flashSilverPress}
            onPointerUp={clearSilverPressGlow}
            onPointerCancel={clearSilverPressGlow}
            onClick={() => tryGame('dojo', onDojo)}
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
            onClick={() => tryGame('archer', onArcher)}
          >
            <span
              className="game-thumb thumb-archer"
              aria-hidden="true"
              style={{ backgroundImage: `url("${archerThumb}")` }}
            />
            <span>Cupid Archery</span>
          </button>
          <button
            type="button"
            className="game-pick"
            onPointerDown={flashSilverPress}
            onPointerUp={clearSilverPressGlow}
            onPointerCancel={clearSilverPressGlow}
            onClick={() => tryGame('match', onMatch)}
          >
            <span className="game-thumb thumb-match" aria-hidden="true">
              <PrideThumbBack />
              <PrideThumbCell body="Zebra" />
              <PrideThumbCell body="Zebra" />
              <PrideThumbBack />
            </span>
            <span>Pride Pairs</span>
          </button>
        </div>
      </section>
    )
  }

  if (dailyOpen) {
    const daily = dailyView(save.daily, new Date(now))
    const done = DAILY_TASKS.filter((task) => daily.claimed.includes(task.id)).length
    const complete = tasksComplete(daily)
    const bonusClaimed = daily.bonusClaimed
    const bonusTrait = daily.bonusTrait
    const bonusCoins = daily.bonusCoins
    const canSpin = bonusReady(daily)
      const spinBonus = () => {
        if (!canSpin || bonusRoll) return
        playDiceRattle()
        setDiceShake(false)
        requestAnimationFrame(() => setDiceShake(true))
        void (async () => {
          const spun = await cub.rollDailyBonus()
          if (spun) {
            setBonusRoll({ prize: spun.trait, coins: spun.coins })
            return
          }
          if (spun === false) {
            setDiceShake(false)
            return
          }
          try {
            const res = await fetch('/traits/manifest.json')
            const manifest = (await res.json()) as Record<TraitCategory, Record<CharacterAge, string[]>>
            const catalog = traitsFromManifest(manifest)
            const unowned = catalog.filter((trait) => !isTraitUnlocked(save, trait.age, trait.category, trait.name))
            const prize = unowned.length > 0 && Math.random() < BONUS_TRAIT_CHANCE ? pickBonusTrait(unowned) : null
            setBonusRoll({ prize, coins: prize ? 0 : rollBonusCoins() })
          } catch {
            setDiceShake(false)
          }
        })()
      }
    return (
      <section className={demo ? 'game-screen game-picks-screen daily-screen demo-locked' : 'game-screen game-picks-screen daily-screen'}>
        <header className="top">
          <HomeButton className="game-home" onClick={() => setDailyOpen(false)} />
          <h1>Daily Tasks</h1>
          <DailyResetClock startedAt={daily.startedAt} now={now} />
        </header>
        <div className="daily-list">
          {demo ? <DemoLockBanner text="Create an account to complete daily challenges and win their prizes." /> : null}
          <article className="daily-task daily-bonus">
            <h2>Daily Bonus Prize</h2>
            <p>Complete any 3 challenges</p>
            <p className="daily-count">
              {Math.min(complete, BONUS_TASKS_REQUIRED)} / {BONUS_TASKS_REQUIRED}
            </p>
            <div className="daily-meter" aria-hidden="true">
              <span style={{ width: `${(Math.min(complete, BONUS_TASKS_REQUIRED) / BONUS_TASKS_REQUIRED) * 100}%` }} />
            </div>
            <div className="daily-row">
              {bonusClaimed && bonusTrait ? (
                <span className="daily-won">
                  <strong>{bonusTrait.name}</strong>
                  <span>
                    {ageCubLabel(bonusTrait.age)} · {bonusTrait.category}
                  </span>
                </span>
              ) : bonusClaimed && bonusCoins > 0 ? (
                <span className="daily-reward">
                  <img src={coinUrl} alt="" />
                  {bonusCoins}
                </span>
              ) : (
                <span className="daily-reward">Bonus Roll! - Win Wardrobe Items or Coins</span>
              )}
              {bonusClaimed ? (
                <button type="button" className="daily-claim" disabled>
                  Won
                </button>
              ) : (
                <button
                  type="button"
                  className="daily-dice"
                  aria-label={canSpin && !demo ? 'Spin the bonus dice' : 'Complete any 3 challenges to spin'}
                  disabled={!canSpin || demo}
                  onClick={spinBonus}
                >
                  <span className="wood-btn">
                    <img
                      className={diceShake ? 'dice shake' : 'dice'}
                      src={diceIconUrl}
                      alt=""
                      onAnimationEnd={(event) => {
                        event.stopPropagation()
                        setDiceShake(false)
                      }}
                    />
                  </span>
                </button>
              )}
            </div>
          </article>
          {[...DAILY_TASKS]
            .sort((a, b) => Number(daily.claimed.includes(a.id)) - Number(daily.claimed.includes(b.id)))
            .map((task) => {
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
                      : task.game === 'bubble'
                        ? onBubble
                        : task.game === 'river'
                          ? onRiver
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
                      disabled={demo}
                      onClick={() => {
                        void (async () => {
                          if (!(await cub.claimDaily(task.id))) return
                          playCoin()
                          setCoinBurst((current) => ({ id: task.id, key: (current?.key ?? 0) + 1 }))
                        })()
                      }}
                    >
                      Claim
                    </button>
                  ) : (
                    <button type="button" className="daily-play" onClick={play} disabled={demo}>
                      Play
                    </button>
                  )}
                  {coinBurst?.id === task.id ? <CoinBurst key={coinBurst.key} /> : null}
                </div>
              </article>
            )
          })}
          {bonusRoll ? (
            <DailyTraitRoll
              cub={cub}
              appearance={save.appearance}
              homeAge={age}
              prize={bonusRoll.prize}
              coins={bonusRoll.coins}
              onDone={() => setBonusRoll(null)}
            />
          ) : null}
          <p className="daily-note">
            {daily.startedAt == null
              ? 'Play a challenge to start the 24 hour timer.'
              : done === DAILY_TASKS.length && bonusClaimed
                ? 'All claimed for this round.'
                : 'Same challenges until the timer ends.'}
          </p>
        </div>
      </section>
    )
  }

  if (shopOpen) {
    return (
      <ShopScreen
        cub={cub}
        onBack={() => setShopOpen(false)}
        onGames={() => {
          setShopOpen(false)
          setGamesOpen(true)
        }}
      />
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

  const daily = dailyView(save.daily)
  const dailyWaiting = dailyNeedsAttention(daily)
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
        onPumpkinChange={cub.rememberHalloween}
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
          {demo ? (
            <div className="demo-account">
              <button type="button" className="account-open demo-signup" onClick={requestSignUp}>
                Create account
              </button>
              <span className="demo-ribbon">Demo</span>
            </div>
          ) : (
            <button
              type="button"
              className={own.enabled ? 'account-open account-open-profile' : 'account-open'}
              onClick={() => setAccountOpen(true)}
              aria-label={
                own.unseen > 0
                  ? `${cub.accountName ?? 'Account'}, profile and ${own.unseen} new badge${own.unseen === 1 ? '' : 's'}`
                  : undefined
              }
            >
              {own.enabled ? (
                <img className="account-open-photo" src={own.photoUrl ?? PROFILE_PICTURES.paw.src} alt="" />
              ) : null}
              <span className="account-open-name">{cub.accountName ?? 'Account'}</span>
              {own.unseen > 0 ? <span className="account-open-dot" aria-hidden="true" /> : null}
            </button>
          )}
          <div className="cub-cash" aria-label={`${formatCubCash(save.cubCash)} Cub Cash`}>
            <span className="cub-cash-inner">
              <img src={coinUrl} alt="" />
              <strong>{formatCubCash(save.cubCash)}</strong>
            </span>
          </div>
        </div>
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
        {demo ? (
          <button
            type="button"
            className="power-plate power-plate-locked"
            onClick={requestSignUp}
            aria-label="Cub Power. Create an account to start building it."
          >
            <img src={cubPowerUiUrl} alt="" />
            <span className="power-plate-total power-plate-signup">Sign up</span>
            <span className="power-plate-mult">{multiplierText(100)}</span>
          </button>
        ) : cub.cubPower ? (
          <button
            type="button"
            className="power-plate"
            onClick={() => setPowerOpen(true)}
            aria-label={`Cub Power ${cub.cubPower.total}, ${cub.cubPower.percent}% bonuses, login streak ${multiplierText(
              cub.cubPower.streakMultiplier,
            )}${cub.cubPower.streakCount > 0 ? `, day ${cub.cubPower.streakCount}` : ''}`}
          >
            <img src={cubPowerUiUrl} alt="" />
            <span className="power-plate-total">{cub.cubPower.total.toLocaleString('en-US')}</span>
            <span className="power-plate-mult">{multiplierText(cub.cubPower.streakMultiplier)}</span>
            {cub.powerNewGame ? <span className="account-open-dot" aria-hidden="true" /> : null}
          </button>
        ) : null}
        {cub.toast ? <p className="home-toast">{cub.toast}</p> : null}
        {powerOpen ? (
          <CubPowerPanel
            power={cub.cubPower}
            newGame={cub.powerNewGame}
            onSeenNewGame={cub.dismissPowerNewGame}
            onRefresh={cub.refreshCubPower}
            onClose={() => setPowerOpen(false)}
          />
        ) : null}
        {cub.powerNotice &&
        !powerOpen &&
        !accountOpen &&
        !achievementsOpen &&
        !dailyOpen &&
        !gamesOpen &&
        !shopOpen &&
        !boardOpen &&
        !bonusRoll ? (
          <PowerNoticePop notice={cub.powerNotice} onClose={cub.dismissPowerNotice} />
        ) : null}
        {accountOpen ? (
          <AccountPanel
            cub={cub}
            unseenBadges={own.unseen}
            localBests={own.bests}
            onClose={() => {
              setAccountOpen(false)
              setProfileRefresh((value) => value + 1)
            }}
          />
        ) : null}
        {achievementsOpen && cub.accountName ? (
          <AchievementsPanel
            username={cub.accountName}
            localBests={own.bests}
            onClose={() => setAchievementsOpen(false)}
          />
        ) : null}
        <button
          type="button"
          className="daily-open"
          aria-label={dailyWaiting ? 'Daily Bonus, challenges or prizes waiting' : 'Daily Bonus'}
          onPointerDown={flashPress}
          onPointerUp={clearPressGlow}
          onPointerCancel={clearPressGlow}
          onClick={() => setDailyOpen(true)}
        >
          <span className="wood-btn-wrap">
            {dailyWaiting ? <span className="daily-alert" aria-hidden="true">!</span> : null}
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
            className="room-action shop-action"
            aria-label="Shop"
            disabled={cub.busy || asleep}
            onPointerDown={flashPress}
            onPointerUp={clearPressGlow}
            onPointerCancel={clearPressGlow}
            onClick={() => setShopOpen(true)}
          >
            <span className="wood-btn shop-face">
              <img className="shop-mark" src={shopFaceUrl} alt="" />
            </span>
            <span className="wood-label"><span>Shop</span></span>
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
            <WoodLabel value={save.happiness} color={energyFillColor(save.happiness)} keepColor className="band-meter">
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
              {save.energy < PLAY_ENERGY_COST ? <span className="need-alert" aria-label="Energy needs attention">!</span> : null}
              <span className="wood-btn">
                <MoonIcon />
              </span>
            </span>
            <WoodLabel value={save.energy} color={energyFillColor(save.energy)} keepColor className="band-meter">
              Energy
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
            <WoodLabel value={save.cleanliness} color={energyFillColor(save.cleanliness)} keepColor className="band-meter">
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

function WoodLabel({ value, color, keepColor = false, className, children }: { value: number; color: string; keepColor?: boolean; className?: string; children: ReactNode }) {
  const amount = Math.max(0, Math.min(100, value))
  const low = !keepColor && amount < 25
  return (
    <span className={className ? `wood-label ${className}` : 'wood-label'}>
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
