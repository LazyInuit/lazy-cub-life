import { useEffect, useRef, useState } from 'react'
import landingUrl from './assets/home/landing.jpg'
import landingDoorsUrl from './assets/home/landing-doors.jpg'
import landingPawUrl from './assets/home/landing-paw.png'
import landingPlayUrl from './assets/home/landing-play.png'
import { setActivityArea } from './game/activity'
import { AccountGate } from './components/AccountGate'
import { AdminScreen } from './components/AdminScreen'
import { BadgeEarnedPop } from './components/BadgeShowcase'
import { CareScreen } from './components/CareScreen'
import { CupidArcher } from './components/CupidArcher'
import { LazyHoops } from './components/LazyHoops'
import { LazyDojo } from './components/LazyDojo'
import { SafariFlight } from './components/SafariFlight'
import { TraitMatch } from './components/TraitMatch'
import { accountIsBanned, clearLockedCash, signOutAccount } from './game/account'
import { playClick } from './game/clickAudio'
import { startLandingBgm, stopLandingBgm } from './game/landingAudio'
import { endDemo, isDemo, onSignUpRequest, requestSignUp, startDemo } from './game/demo'
import { openDemoCub, wakeStoredCub } from './game/storage'
import { DemoChoice } from './components/DemoChoice'
import { DemoScorePop } from './components/DemoScorePop'
import { useCub } from './game/useCub'
import { supabase } from './game/supabase'

type Screen = 'home' | 'flight' | 'match' | 'dojo' | 'archer' | 'hoops'

export default function App() {
  if (window.location.pathname === '/admin' || window.location.pathname === '/admin/') {
    return <AdminScreen />
  }
  return <PlayGate />
}

function LandingScreen({ onPlay }: { onPlay: () => void }) {
  const [opening, setOpening] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    return () => stopLandingBgm()
  }, [])

  const enter = () => {
    if (opening || open) return
    startLandingBgm()
    setOpening(true)
    window.setTimeout(() => setOpen(true), 980)
  }

  return (
    <main className="phone landing-screen">
      <img className="landing-art" src={landingUrl} alt="" />
      {open ? (
        <button type="button" className="landing-play" onClick={onPlay} aria-label="Play">
          <img src={landingPlayUrl} alt="" />
        </button>
      ) : (
        <div className={opening ? 'doors doors-open' : 'doors'}>
          <button type="button" className="door door-left" onClick={enter} aria-label="Open the doors">
            <img className="door-panel" src={landingDoorsUrl} alt="" />
          </button>
          <button type="button" className="door door-right" onClick={enter} aria-label="Open the doors">
            <img className="door-panel" src={landingDoorsUrl} alt="" />
          </button>
          <div className="door-paw" aria-hidden="true">
            <img src={landingPawUrl} alt="" />
          </div>
        </div>
      )}
    </main>
  )
}

const IN_APP_KEY = 'lazy-cub-in-app'

type Phase = 'splash' | 'choice' | 'gate' | 'play' | 'demo'

function PlayGate() {
  const returning = useRef(sessionStorage.getItem(IN_APP_KEY) === '1')
  const [phase, setPhase] = useState<Phase>('splash')
  const [gateMode, setGateMode] = useState<'in' | 'up'>('up')
  /** Where Back on the account screen goes: the choice screen, or the demo cub it was opened from. */
  const [gateFrom, setGateFrom] = useState<'choice' | 'demo'>('choice')
  const [notice, setNotice] = useState<string | null>(null)
  const next = useRef<Phase | null>(null)
  const pressed = useRef(false)

  useEffect(
    () =>
      onSignUpRequest(() => {
        endDemo()
        setGateMode('up')
        setGateFrom('demo')
        setPhase('gate')
      }),
    [],
  )

  const openNext = () => {
    if (pressed.current && next.current) setPhase(next.current)
  }

  const play = () => {
    sessionStorage.setItem(IN_APP_KEY, '1')
    stopLandingBgm()
    playClick()
    wakeStoredCub()
    pressed.current = true
    openNext()
  }

  useEffect(() => {
    const client = supabase
    if (!client) {
      next.current = 'choice'
      openNext()
      return
    }
    let ignore = false
    const enter = async () => {
      const { data } = await client.auth.getSession()
      const userId = data.session?.user.id
      if (returning.current) pressed.current = true
      if (!userId) {
        if (!ignore) {
          // A refresh during the demo stays in the demo.
          next.current = isDemo() ? 'demo' : 'choice'
          if (returning.current) setPhase(next.current)
          else openNext()
        }
        return
      }
      endDemo()
      if (await accountIsBanned(userId)) {
        await signOutAccount()
        if (!ignore) {
          setNotice('This account is banned.')
          sessionStorage.removeItem(IN_APP_KEY)
          next.current = 'choice'
          if (returning.current) setPhase('choice')
          else openNext()
        }
        return
      }
      if (!ignore) {
        next.current = 'play'
        if (returning.current) setPhase('play')
        else openNext()
      }
    }
    void enter()
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return
      // A resume in the home-screen app can report a sign-out while the session is still there.
      window.setTimeout(() => {
        if (ignore) return
        void client.auth.getSession().then(async ({ data: sessionData }) => {
          if (ignore || sessionData.session || !pressed.current) return
          try {
            const { data: refreshed } = await client.auth.refreshSession()
            if (refreshed.session) return
          } catch {
            // The session is gone. Leave the game below.
          }
          if (ignore || isDemo()) return
          sessionStorage.removeItem(IN_APP_KEY)
          setPhase('choice')
        })
      }, 0)
    })
    return () => {
      ignore = true
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const client = supabase
    if (phase !== 'play' || !client) return
    let stop = false
    const look = async () => {
      const { data } = await client.auth.getSession()
      const userId = data.session?.user.id
      if (!userId || stop) return
      if (await accountIsBanned(userId)) {
        await signOutAccount()
        if (!stop) {
          setNotice('This account is banned.')
          setPhase('choice')
        }
      }
    }
    const timer = window.setInterval(() => void look(), 30000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void look()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [phase])

  if (phase === 'splash' && returning.current) {
    return (
      <main className="phone landing-screen">
        <img className="landing-art" src={landingUrl} alt="" />
      </main>
    )
  }
  if (phase === 'splash') return <LandingScreen onPlay={play} />
  if (phase === 'choice') {
    return (
      <DemoChoice
        notice={notice}
        onCreate={() => {
          setGateMode('up')
          setGateFrom('choice')
          setPhase('gate')
        }}
        onSignIn={() => {
          setGateMode('in')
          setGateFrom('choice')
          setPhase('gate')
        }}
        onDemo={() => {
          setNotice(null)
          clearLockedCash()
          startDemo()
          openDemoCub()
          setPhase('demo')
        }}
      />
    )
  }
  if (phase === 'gate') {
    return (
      <AccountGate
        key={gateMode}
        notice={notice}
        startMode={gateMode}
        onBack={() => {
          if (gateFrom === 'demo') {
            // Back to the same demo cub, keeping its coins and wardrobe as they were.
            startDemo()
            setPhase('demo')
            return
          }
          setPhase('choice')
        }}
        onEnter={() => {
          endDemo()
          setNotice(null)
          setPhase('play')
        }}
      />
    )
  }
  return <Game key={phase} />
}

function Game() {
  const cub = useCub()
  const [screen, setScreen] = useState<Screen>('home')
  const [openGames, setOpenGames] = useState(false)
  const [openShop, setOpenShop] = useState(false)
  const [openAchievements, setOpenAchievements] = useState(false)

  useEffect(() => {
    setActivityArea(screen)
    if (screen !== 'home') setOpenAchievements(false)
  }, [screen])

  if (!cub.save) {
    return (
      <main className="phone landing-screen">
        <img className="landing-art" src={landingUrl} alt="" />
      </main>
    )
  }

  const goHome = () => {
    setOpenGames(false)
    setOpenShop(false)
    setScreen('home')
  }

  const goGames = () => {
    setOpenGames(true)
    setOpenShop(false)
    setScreen('home')
  }

  const goShop = () => {
    setOpenGames(false)
    setOpenShop(true)
    setScreen('home')
  }

  // Runs in the demo never cost energy, so play buttons always stay on.
  const playEnergy = isDemo() ? 100 : cub.save.energy

  return (
    <main className={isDemo() ? 'phone demo-mode' : 'phone'}>
      {screen === 'home' ? (
        <CareScreen
          cub={cub}
          startInGames={openGames}
          startInShop={openShop}
          startInAchievements={openAchievements}
          onFlight={() => {
            setOpenGames(false)
            setScreen('flight')
          }}
          onMatch={() => {
            setOpenGames(false)
            setScreen('match')
          }}
          onDojo={() => {
            setOpenGames(false)
            setScreen('dojo')
          }}
          onArcher={() => {
            setOpenGames(false)
            setScreen('archer')
          }}
          onHoops={() => {
            setOpenGames(false)
            setScreen('hoops')
          }}
        />
      ) : null}
      {screen === 'flight' ? (
        <SafariFlight
          best={cub.save.flightBest}
          onBest={cub.recordFlightBest}
          onDailyStart={cub.startDaily}
          onDaily={(score) => cub.noteDaily('flight', score)}
          onReward={cub.reward}
          onCoins={(amount) => cub.addCubCash(amount, 'flight')}
          onExit={goHome}
          onGames={goGames}
          energy={playEnergy}
          onShop={goShop}
        />
      ) : null}
      {screen === 'match' ? (
        <TraitMatch
          best={cub.save.matchBest}
          onBest={cub.recordMatchBest}
          onDailyStart={cub.startDaily}
          onDaily={(score) => cub.noteDaily('match', score)}
          onReward={cub.reward}
          onCoins={(amount) => cub.addCubCash(amount, 'match')}
          onExit={goHome}
          onGames={goGames}
          energy={playEnergy}
          onShop={goShop}
        />
      ) : null}
      {screen === 'dojo' ? (
        <LazyDojo
          best={cub.save.dojoBest}
          onBest={cub.recordDojoBest}
          onDailyStart={cub.startDaily}
          onDaily={(score) => cub.noteDaily('dojo', score)}
          onReward={cub.reward}
          onCoins={(amount) => cub.addCubCash(amount, 'dojo')}
          onExit={goHome}
          onGames={goGames}
          energy={playEnergy}
          onShop={goShop}
        />
      ) : null}
      {screen === 'archer' ? (
        <CupidArcher
          best={cub.save.archerBest}
          onBest={cub.recordArcherBest}
          onDailyStart={cub.startDaily}
          onDaily={(score) => cub.noteDaily('archer', score)}
          onReward={cub.reward}
          onCoins={(amount) => cub.addCubCash(amount, 'archer')}
          onExit={goHome}
          onGames={goGames}
          energy={playEnergy}
          onShop={goShop}
        />
      ) : null}
      {screen === 'hoops' ? (
        <LazyHoops
          best={cub.save.hoopsBest}
          onBest={cub.recordHoopsBest}
          onDailyStart={cub.startDaily}
          onDaily={(score) => cub.noteDaily('hoops', score)}
          onReward={cub.reward}
          onCoins={(amount) => cub.addCubCash(amount, 'hoops')}
          onExit={goHome}
          onGames={goGames}
          energy={playEnergy}
          onShop={goShop}
        />
      ) : null}
      {cub.earnedBadge ? (
        <BadgeEarnedPop
          id={cub.earnedBadge}
          onClose={cub.dismissEarnedBadge}
          onView={() => {
            cub.dismissEarnedBadge()
            setOpenGames(false)
            setOpenShop(false)
            setOpenAchievements(true)
            setScreen('home')
          }}
        />
      ) : null}
      {cub.demoScore ? (
        <DemoScorePop
          game={cub.demoScore.game}
          score={cub.demoScore.score}
          onClose={cub.dismissDemoScore}
          onSignUp={() => {
            cub.dismissDemoScore()
            requestSignUp()
          }}
        />
      ) : null}
    </main>
  )
}
