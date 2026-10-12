import { useEffect, useRef, useState } from 'react'
import landingUrl from './assets/home/landing.jpg'
import landingDoorsUrl from './assets/home/landing-doors.jpg'
import landingPawUrl from './assets/home/landing-paw.png'
import landingPlayUrl from './assets/home/landing-play.png'
import { setActivityArea } from './game/activity'
import { AccountGate } from './components/AccountGate'
import { AdminScreen } from './components/AdminScreen'
import { CareScreen } from './components/CareScreen'
import { CupidArcher } from './components/CupidArcher'
import { LazyHoops } from './components/LazyHoops'
import { LazyDojo } from './components/LazyDojo'
import { SafariFlight } from './components/SafariFlight'
import { TraitMatch } from './components/TraitMatch'
import { accountIsBanned, signOutAccount } from './game/account'
import { playClick } from './game/clickAudio'
import { startLandingBgm, stopLandingBgm } from './game/landingAudio'
import { wakeStoredCub } from './game/storage'
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

function PlayGate() {
  const [phase, setPhase] = useState<'splash' | 'gate' | 'play'>('splash')
  const [notice, setNotice] = useState<string | null>(null)
  const next = useRef<'gate' | 'play' | null>(null)
  const pressed = useRef(false)

  const openNext = () => {
    if (pressed.current && next.current) setPhase(next.current)
  }

  const play = () => {
    stopLandingBgm()
    playClick()
    wakeStoredCub()
    pressed.current = true
    openNext()
  }

  useEffect(() => {
    const client = supabase
    if (!client) {
      next.current = 'gate'
      openNext()
      return
    }
    let ignore = false
    const enter = async () => {
      const { data } = await client.auth.getSession()
      const userId = data.session?.user.id
      if (!userId) {
        if (!ignore) {
          next.current = 'gate'
          openNext()
        }
        return
      }
      if (await accountIsBanned(userId)) {
        await signOutAccount()
        if (!ignore) {
          setNotice('This account is banned.')
          next.current = 'gate'
          openNext()
        }
        return
      }
      if (!ignore) {
        next.current = 'play'
        openNext()
      }
    }
    void enter()
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setPhase('gate')
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
          setPhase('gate')
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

  if (phase === 'splash') return <LandingScreen onPlay={play} />
  if (phase === 'gate') {
    return (
      <AccountGate
        notice={notice}
        onEnter={() => {
          setNotice(null)
          setPhase('play')
        }}
      />
    )
  }
  return <Game />
}

function Game() {
  const cub = useCub()
  const [screen, setScreen] = useState<Screen>('home')
  const [openGames, setOpenGames] = useState(false)
  const [openShop, setOpenShop] = useState(false)

  useEffect(() => {
    setActivityArea(screen)
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

  return (
    <main className="phone">
      {screen === 'home' ? (
        <CareScreen
          cub={cub}
          startInGames={openGames}
          startInShop={openShop}
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
          energy={cub.save.energy}
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
          energy={cub.save.energy}
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
          energy={cub.save.energy}
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
          energy={cub.save.energy}
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
          energy={cub.save.energy}
          onShop={goShop}
        />
      ) : null}
    </main>
  )
}
