import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LeaderboardOpenButton } from './LeaderboardOpenButton'
import { LevelInfoPop } from './LevelInfoPop'
import { GameTour, markTourSeen, tourSeen } from './GameTour'
import controllerUrl from '../assets/controller-icon.png'
import dropUrl from '../assets/drop-ui.png'
import moonUrl from '../assets/moon-ui.png'
import shirtUrl from '../assets/shirt-ui.png'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import diceIconUrl from '../assets/dice-ui.png'
import chestUrl from '../assets/daily-chest.png'
import challengesBadgeUrl from '../assets/challenges-badge.png'
import shopFaceUrl from '../assets/home/shop-badge.png'
import { tryOnFromPicks, type TraitCategory } from '../game/cubTraits'
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
  type DailyProgress,
  type DailyTask,
  bonusReady,
  dailyNeedsAttention,
  dailyView,
  extraReady,
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
import { cubCashPillSize, formatCubCash } from '../game/formatCubCash'
import type { CubController } from '../game/useCub'
import { CubStage } from './CubStage'
import { HomeButton } from './HomeButton'
import { DailyTraitRoll, ageCubLabel, traitsFromManifest } from './DailyTraitRoll'
import { AccountPanel } from './AccountPanel'
import { AchievementsPanel } from './AchievementsPanel'
import { CubPowerPanel, multiplierText } from './CubPowerPanel'
import { PowerPlate } from './PowerPlate'
import { PowerNoticePop } from './PowerNoticePop'
import { PROFILE_PICTURES } from '../game/profileArt'
import { useOwnProfile } from '../game/useOwnProfile'
import { isDemo, requestSignUp } from '../game/demo'
import { DemoLockBanner } from './DemoLockBanner'
import { LeaderboardScreen } from './LeaderboardScreen'
import { VisitHome } from './VisitHome'
import type { LeaderboardGame, PlayerProfile } from '../game/leaderboard'
import { WardrobeScreen } from './WardrobeScreen'
import { ShopScreen } from './ShopScreen'
import { GameThumb } from './GameThumb'
import { ChallengeCreate } from './ChallengeCreate'
import { ChallengesScreen } from './ChallengesScreen'
import { ChallengeNoticePop } from './ChallengeNoticePop'
import { challengeGame, challengesNeedingAttention } from '../game/challenges'

type Props = {
  cub: CubController
  onFlight: () => void
  onMatch: () => void
  onDojo: () => void
  onArcher: () => void
  onHoops: () => void
  onBubble: () => void
  onRiver: () => void
  onSolitaire: () => void
  onBaseball: () => void
  /** Opens a challenge's game, at its mode and difficulty. */
  onChallengePlay?: (board: LeaderboardGame) => void
  startInGames?: boolean
  startInShop?: boolean
  /** Open the Achievements list straight away, from the badge-earned pop-up. */
  startInAchievements?: boolean
}

/** Where a challenge sits in the list: ready to claim first, then still going, then claimed. */
function taskRank(daily: DailyProgress, task: DailyTask) {
  if (taskReady(daily, task)) return 0
  return daily.claimed.includes(task.id) ? 2 : 1
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
  onSolitaire,
  onBaseball,
  onChallengePlay,
  startInGames = false,
  startInShop = false,
  startInAchievements = false,
}: Props) {
  const [gamesOpen, setGamesOpen] = useState(startInGames && !startInShop)
  const [boardOpen, setBoardOpen] = useState(false)
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
  /** The level details pop-up, opened from the level badge. */
  const [levelOpen, setLevelOpen] = useState(false)
  /** The guided tour of the home screen. */
  const [tourOn, setTourOn] = useState(false)
  const tourDemo = isDemo()
  const tourWho = tourDemo ? 'demo' : cub.accountName
  const tourXp = useRef(cub.presentedXp)
  tourXp.current = cub.presentedXp
  // New accounts and demo players get the tour once. Wait a moment so a saved cub has loaded first;
  // a player who already has XP has played before and isn't shown it.
  useEffect(() => {
    if (!tourWho || tourSeen(tourWho)) return
    const timer = window.setTimeout(() => {
      if (!tourDemo && tourXp.current >= 1) {
        markTourSeen(tourWho)
        markTourSeen(tourWho, 'wardrobe')
        markTourSeen(tourWho, 'games')
        markTourSeen(tourWho, 'board')
        return
      }
      setTourOn(true)
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [tourDemo, tourWho])
  const endTour = () => {
    if (tourWho) markTourSeen(tourWho)
    setTourOn(false)
  }
  /** The wardrobe tour, the first time a new player opens the wardrobe. */
  const [wardrobeTourOn, setWardrobeTourOn] = useState(false)
  useEffect(() => {
    if (!wardrobeOpen || !tourWho || tourSeen(tourWho, 'wardrobe')) return
    const timer = window.setTimeout(() => setWardrobeTourOn(true), 700)
    return () => window.clearTimeout(timer)
  }, [wardrobeOpen, tourWho])
  const endWardrobeTour = () => {
    if (tourWho) markTourSeen(tourWho, 'wardrobe')
    setWardrobeTourOn(false)
  }
  /** The games page tour, offered at the end of the wardrobe tour; it carries on into the leaderboard. */
  const [gamesTourOn, setGamesTourOn] = useState(false)
  const [boardTourOn, setBoardTourOn] = useState(false)
  useEffect(() => {
    if (!boardOpen || !gamesTourOn) return
    if (tourWho) markTourSeen(tourWho, 'board')
    setGamesTourOn(false)
    setBoardTourOn(true)
  }, [boardOpen, gamesTourOn, tourWho])
  useEffect(() => {
    if (!tourWho) return
    if (gamesTourOn) markTourSeen(tourWho, 'games')
    if (boardTourOn) markTourSeen(tourWho, 'board')
  }, [gamesTourOn, boardTourOn, tourWho])
  // The first visit to the games page, and to the leaderboard if the games tour didn't lead there.
  useEffect(() => {
    if (!gamesOpen || boardOpen || gamesTourOn || !tourWho || tourSeen(tourWho, 'games')) return
    const timer = window.setTimeout(() => {
      markTourSeen(tourWho, 'games')
      setGamesTourOn(true)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [gamesOpen, boardOpen, gamesTourOn, tourWho])
  useEffect(() => {
    if (!boardOpen || gamesTourOn || boardTourOn || !tourWho || tourSeen(tourWho, 'board')) return
    const timer = window.setTimeout(() => {
      markTourSeen(tourWho, 'board')
      setBoardTourOn(true)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [boardOpen, gamesTourOn, boardTourOn, tourWho])
  useEffect(() => {
    if (!boardOpen) setBoardTourOn(false)
    if (!gamesOpen) setGamesTourOn(false)
  }, [boardOpen, gamesOpen])
  /** A player's home opened from the Cub Power leaderboard. */
  const [visiting, setVisiting] = useState<PlayerProfile | null>(null)
  const [challengesOpen, setChallengesOpen] = useState(false)
  /** The player a new challenge is being set up against. */
  const [challengeWith, setChallengeWith] = useState<string | null>(null)
  const [bonusRoll, setBonusRoll] = useState<{ prize: BonusTrait | null; coins: number; extra: boolean } | null>(null)
  /** Which roll's dice is shaking. */
  const [diceShake, setDiceShake] = useState<'bonus' | 'extra' | null>(null)
  const [age, setAge] = useState<CharacterAge>(() => getHomeCharacterAge())
  const save = cub.save
  const [profileRefresh, setProfileRefresh] = useState(0)
  const own = useOwnProfile(cub.accountName, save, profileRefresh)

  useEffect(() => {
    setHomeCharacter(age)
  }, [age])

  const onCubHome = !gamesOpen && !shopOpen && !wardrobeOpen && !boardOpen && !dailyOpen && !challengesOpen && !cub.asleep

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

  const energyPop =
    energyWarn != null ? (
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
                setChallengesOpen(false)
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
    ) : null

  /** Challenges need a signed-in account; demo players are sent to Create account instead. */
  const openChallenge = (username: string) => {
    if (demo || !cub.accountName) {
      requestSignUp()
      return
    }
    setChallengeWith(username)
  }

  const playChallenge = (board: LeaderboardGame) => {
    const game = challengeGame(board)
    if (!game || !onChallengePlay) return
    tryGame(game.game, () => onChallengePlay(board))
  }

  const challengeSheet = challengeWith ? (
    <ChallengeCreate
      cub={cub}
      opponent={challengeWith}
      onClose={() => setChallengeWith(null)}
      onSent={() => {
        setChallengeWith(null)
        void cub.refreshChallenges()
      }}
    />
  ) : null

  if (visiting) {
    return (
      <>
        <VisitHome
          profile={visiting}
          onReturn={() => setVisiting(null)}
          onChallenge={demo || !cub.accountName ? undefined : () => openChallenge(visiting.username)}
        />
        {challengeSheet}
      </>
    )
  }

  if (boardOpen) {
    return (
      <>
        <LeaderboardScreen
          onHome={() => { setBoardOpen(false); setGamesOpen(false) }}
          onGames={() => setBoardOpen(false)}
          onSettlePrize={cub.collectWeeklyPrize}
          onChallenge={demo || !cub.accountName ? undefined : openChallenge}
        />
        {boardTourOn ? <GameTour kind="board" demo={demo} onDone={() => setBoardTourOn(false)} /> : null}
        {challengeSheet}
      </>
    )
  }

  if (challengesOpen) {
    return (
      <>
        <ChallengesScreen
          cub={cub}
          onHome={() => setChallengesOpen(false)}
          onGames={() => {
            setChallengesOpen(false)
            setGamesOpen(true)
          }}
          onPlay={playChallenge}
          onChallenge={openChallenge}
          onVisit={setVisiting}
        />
        {energyPop}
        {challengeSheet}
      </>
    )
  }

  if (gamesOpen) {
    return (
      <>
        <section className="game-screen game-picks-screen">
          <header className="top">
            <HomeButton className="game-home" onClick={() => setGamesOpen(false)} />
            <h1>Select a game</h1>
          </header>
          <LeaderboardOpenButton onOpen={() => setBoardOpen(true)} />
          <div className="game-picks">
            <button
              type="button"
              className="game-pick"
              onPointerDown={flashSilverPress}
              onPointerUp={clearSilverPressGlow}
              onPointerCancel={clearSilverPressGlow}
              onClick={() => tryGame('baseball', onBaseball)}
            >
              <GameThumb game="baseball" sash />
              <span>Baseball Blitz</span>
            </button>
            <button
              type="button"
              className="game-pick"
              onPointerDown={flashSilverPress}
              onPointerUp={clearSilverPressGlow}
              onPointerCancel={clearSilverPressGlow}
              onClick={() => tryGame('solitaire', onSolitaire)}
            >
              <GameThumb game="solitaire" sash />
              <span>Spellitaire</span>
            </button>
            <button
              type="button"
              className="game-pick"
              onPointerDown={flashSilverPress}
              onPointerUp={clearSilverPressGlow}
              onPointerCancel={clearSilverPressGlow}
              onClick={() => tryGame('river', onRiver)}
            >
              <GameThumb game="river" sash />
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
              <GameThumb game="bubble" sash />
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
              <GameThumb game="flight" />
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
              <GameThumb game="hoops" />
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
              <GameThumb game="dojo" />
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
              <GameThumb game="archer" />
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
              <GameThumb game="match" />
              <span>Pride Pairs</span>
            </button>
          </div>
          {gamesTourOn && energyWarn == null ? <GameTour kind="games" demo={demo} onDone={() => setGamesTourOn(false)} /> : null}
        </section>
        {energyPop}
      </>
    )
  }

  if (dailyOpen) {
    const daily = dailyView(save.daily, new Date(now))
    const done = DAILY_TASKS.filter((task) => daily.claimed.includes(task.id)).length
    const complete = tasksComplete(daily)
    const bonusClaimed = daily.bonusClaimed
    const allTasks = DAILY_TASKS.length
    /** The usual roll (any 3 challenges) or the extra one (every challenge). */
    const spinBonus = (extra: boolean) => {
      if (!(extra ? extraReady(daily) : bonusReady(daily)) || bonusRoll) return
      playDiceRattle()
      setDiceShake(null)
      requestAnimationFrame(() => setDiceShake(extra ? 'extra' : 'bonus'))
      void (async () => {
        const spun = await (extra ? cub.rollDailyExtraBonus() : cub.rollDailyBonus())
        if (spun) {
          setBonusRoll({ prize: spun.trait, coins: spun.coins, extra })
          return
        }
        if (spun === false) {
          setDiceShake(null)
          return
        }
        try {
          const res = await fetch('/traits/manifest.json')
          const manifest = (await res.json()) as Record<TraitCategory, Record<CharacterAge, string[]>>
          const catalog = traitsFromManifest(manifest)
          const unowned = catalog.filter((trait) => !isTraitUnlocked(save, trait.age, trait.category, trait.name))
          const prize = unowned.length > 0 && Math.random() < BONUS_TRAIT_CHANCE ? pickBonusTrait(unowned) : null
          setBonusRoll({ prize, coins: prize ? 0 : rollBonusCoins(), extra })
        } catch {
          setDiceShake(null)
        }
      })()
    }
    const rollCard = (extra: boolean) => {
      const need = extra ? allTasks : BONUS_TASKS_REQUIRED
      const progress = Math.min(complete, need)
      const claimed = extra ? daily.extraClaimed : daily.bonusClaimed
      const trait = extra ? daily.extraTrait : daily.bonusTrait
      const coins = extra ? daily.extraCoins : daily.bonusCoins
      const canSpin = extra ? extraReady(daily) : bonusReady(daily)
      return (
        <article className={extra ? 'daily-task daily-bonus daily-extra' : 'daily-task daily-bonus'}>
          <h2>{extra ? 'Extra Bonus Roll' : 'Daily Bonus Prize'}</h2>
          <p>{extra ? `Complete all ${allTasks} challenges` : `Complete any ${BONUS_TASKS_REQUIRED} challenges`}</p>
          <p className="daily-count">
            {progress} / {need}
          </p>
          <div className="daily-meter" aria-hidden="true">
            <span style={{ width: `${(progress / need) * 100}%` }} />
          </div>
          <div className="daily-row">
            {claimed && trait ? (
              <span className="daily-won">
                <strong>{trait.name}</strong>
                <span>
                  {ageCubLabel(trait.age)} · {trait.category}
                </span>
              </span>
            ) : claimed && coins > 0 ? (
              <span className="daily-reward">
                <img src={coinUrl} alt="" />
                {coins}
              </span>
            ) : (
              <span className="daily-reward">
                {extra ? 'Another Bonus Roll! - Win Wardrobe Items or Coins' : 'Bonus Roll! - Win Wardrobe Items or Coins'}
              </span>
            )}
            {claimed ? (
              <button type="button" className="daily-claim done" disabled>
                ✓ Won
              </button>
            ) : (
              <button
                type="button"
                className="daily-dice"
                aria-label={canSpin && !demo ? 'Spin the bonus dice' : `Complete ${extra ? 'all' : `any ${BONUS_TASKS_REQUIRED}`} challenges to spin`}
                disabled={!canSpin || demo}
                onClick={() => spinBonus(extra)}
              >
                <span className="wood-btn">
                  <img
                    className={diceShake === (extra ? 'extra' : 'bonus') ? 'dice shake' : 'dice'}
                    src={diceIconUrl}
                    alt=""
                    onAnimationEnd={(event) => {
                      event.stopPropagation()
                      setDiceShake(null)
                    }}
                  />
                </span>
              </button>
            )}
          </div>
        </article>
      )
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
          {rollCard(false)}
          {rollCard(true)}
          {[...DAILY_TASKS]
            // Ready to claim at the top, then those still going, then those already claimed.
            .sort((a, b) => taskRank(daily, a) - taskRank(daily, b))
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
                          : task.game === 'solitaire'
                            ? onSolitaire
                            : task.game === 'baseball'
                              ? onBaseball
                              : onMatch
            return (
              <article key={task.id} className="daily-task has-thumb">
                <span className="daily-thumb">
                  <GameThumb game={task.game} />
                </span>
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
                    <button type="button" className="daily-claim done" disabled>
                      ✓ Claimed
                    </button>
                  ) : ready ? (
                    <button
                      type="button"
                      className="daily-claim ready"
                      disabled={demo}
                      onClick={() => {
                        void (async () => {
                          if (!(await cub.claimDaily(task.id))) return
                          playCoin()
                          setCoinBurst((current) => ({ id: task.id, key: (current?.key ?? 0) + 1 }))
                        })()
                      }}
                    >
                      ★ Claim
                    </button>
                  ) : (
                    <button type="button" className="daily-play" onClick={play} disabled={demo}>
                      ▶ Play
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
              extra={bonusRoll.extra}
              onDone={() => setBonusRoll(null)}
            />
          ) : null}
          <p className="daily-note">
            {daily.startedAt == null
              ? 'Play a challenge to start the 24 hour timer.'
              : done === DAILY_TASKS.length && bonusClaimed && daily.extraClaimed
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
      <>
        <WardrobeScreen
          cub={cub}
          age={age}
          onAge={(next) => {
            setAge(next)
            setHomeCharacter(next)
          }}
          onBack={() => {
            if (wardrobeTourOn) endWardrobeTour()
            setWardrobeOpen(false)
          }}
        />
        {wardrobeTourOn ? (
          <GameTour
            kind="wardrobe"
            demo={demo}
            onDone={endWardrobeTour}
            onMore={{
              label: 'See the games',
              onPress: () => {
                endWardrobeTour()
                setWardrobeOpen(false)
                setGamesOpen(true)
                setGamesTourOn(true)
              },
            }}
          />
        ) : null}
      </>
    )
  }

  const daily = dailyView(save.daily)
  const dailyWaiting = dailyNeedsAttention(daily)
  const challengeAlerts = demo ? 0 : challengesNeedingAttention(cub.challenges)
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
      <div className={asleep ? 'room-ui asleep' : 'room-ui'}>
        <div className="age-switch" role="group" aria-label="Character age" data-tour="age">
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
          <div className="cub-cash" data-tour="cash" aria-label={`${formatCubCash(save.cubCash)} Cub Cash`}>
            <span className="cub-cash-inner">
              <img src={coinUrl} alt="" />
              <strong style={cubCashPillSize(formatCubCash(save.cubCash))}>{formatCubCash(save.cubCash)}</strong>
            </span>
          </div>
        </div>
        <button
          type="button"
          data-tour="level"
          className={cub.levelUp ? 'level-badge level-open level-up' : 'level-badge level-open'}
          key={cub.levelUp ?? 'level'}
          aria-label={`Level ${progress.level}, ${progress.into} of ${progress.next} experience. Show level details`}
          onClick={() => setLevelOpen(true)}
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
        </button>
        {demo ? (
          <PowerPlate
            className="power-plate-locked"
            value="Sign up"
            wordy
            multiplier={100}
            label="Cub Power. Create an account to start building it."
            onClick={requestSignUp}
          />
        ) : cub.cubPower ? (
          <PowerPlate
            value={cub.cubPower.total.toLocaleString('en-US')}
            multiplier={cub.cubPower.streakMultiplier}
            label={`Cub Power ${cub.cubPower.total}, ${cub.cubPower.percent}% bonuses, login streak ${multiplierText(
              cub.cubPower.streakMultiplier,
            )}${cub.cubPower.streakCount > 0 ? `, day ${cub.cubPower.streakCount}` : ''}`}
            onClick={() => setPowerOpen(true)}
          >
            {cub.powerNewGame ? <span className="account-open-dot" aria-hidden="true" /> : null}
          </PowerPlate>
        ) : null}
        {cub.toast ? <p className="home-toast">{cub.toast}</p> : null}
        {powerOpen ? (
          <CubPowerPanel
            power={cub.cubPower}
            newGame={cub.powerNewGame}
            onSeenNewGame={cub.dismissPowerNewGame}
            onRefresh={cub.refreshCubPower}
            onVisit={setVisiting}
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
        {cub.challengeNotice &&
        !cub.powerNotice &&
        !powerOpen &&
        !accountOpen &&
        !achievementsOpen &&
        !levelOpen &&
        !tourOn &&
        !bonusRoll ? (
          <ChallengeNoticePop
            notice={cub.challengeNotice}
            onClose={() => cub.dismissChallengeNotices([cub.challengeNotice!.id])}
            onOpen={() => {
              cub.dismissChallengeNotices((cub.challenges?.notices ?? []).map((notice) => notice.id))
              setChallengesOpen(true)
            }}
          />
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
            onTour={(area) => {
              setAccountOpen(false)
              if (area === 'wardrobe') {
                setWardrobeOpen(true)
                setWardrobeTourOn(true)
              } else if (area === 'games') {
                setGamesOpen(true)
                setGamesTourOn(true)
              } else {
                setTourOn(true)
              }
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
          data-tour="daily"
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
          className={demo ? 'challenges-open challenges-locked' : 'challenges-open'}
          data-tour="challenges"
          aria-label={
            demo
              ? 'Challenges. Create an account to challenge other players.'
              : challengeAlerts > 0
                ? `Challenges, ${challengeAlerts} waiting`
                : 'Challenges'
          }
          onPointerDown={flashPress}
          onPointerUp={clearPressGlow}
          onPointerCancel={clearPressGlow}
          onClick={() => (demo ? requestSignUp() : setChallengesOpen(true))}
        >
          <span className="wood-btn-wrap">
            {challengeAlerts > 0 ? <span className="daily-alert" aria-hidden="true">!</span> : null}
            <img className="challenges-badge" src={challengesBadgeUrl} alt="" />
          </span>
        </button>
        <button
          type="button"
          className="wardrobe-open"
          data-tour="wardrobe"
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
            data-tour="shop"
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
            data-tour="play"
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
            className="room-action sleep-action"
            disabled={cub.busy || (!asleep && energyFull)}
            onPointerDown={flashPress}
            onPointerUp={clearPressGlow}
            onPointerCancel={clearPressGlow}
            data-tour="sleep"
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
            data-tour="wash"
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
      {levelOpen ? <LevelInfoPop xp={cub.presentedXp} onClose={() => setLevelOpen(false)} /> : null}
      {tourOn && !levelOpen && !accountOpen && !powerOpen && !achievementsOpen ? <GameTour
          demo={demo}
          onDone={endTour}
          onMore={{
            label: 'See the wardrobe',
            onPress: () => {
              endTour()
              setWardrobeOpen(true)
              setWardrobeTourOn(true)
            },
          }}
        /> : null}
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
