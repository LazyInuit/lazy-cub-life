import { useEffect, useState } from 'react'
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
import { useCub } from './game/useCub'
import { supabase } from './game/supabase'

type Screen = 'home' | 'flight' | 'match' | 'dojo' | 'archer' | 'hoops'

export default function App() {
  if (window.location.pathname === '/admin' || window.location.pathname === '/admin/') {
    return <AdminScreen />
  }
  return <PlayGate />
}

function PlayGate() {
  const [phase, setPhase] = useState<'loading' | 'gate' | 'play'>('loading')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const client = supabase
    if (!client) {
      setPhase('gate')
      return
    }
    let ignore = false
    const enter = async () => {
      const { data } = await client.auth.getSession()
      const userId = data.session?.user.id
      if (!userId) {
        if (!ignore) setPhase('gate')
        return
      }
      if (await accountIsBanned(userId)) {
        await signOutAccount()
        if (!ignore) {
          setNotice('This account is banned.')
          setPhase('gate')
        }
        return
      }
      if (!ignore) setPhase('play')
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

  if (phase === 'loading') {
    return (
      <main className="phone">
        <p className="boot">Waking your cub...</p>
      </main>
    )
  }
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

  useEffect(() => {
    setActivityArea(screen)
  }, [screen])

  if (!cub.save) {
    return (
      <main className="phone">
        <p className="boot">Waking your cub...</p>
      </main>
    )
  }

  const goHome = () => {
    setOpenGames(false)
    setScreen('home')
  }

  const goGames = () => {
    setOpenGames(true)
    setScreen('home')
  }

  return (
    <main className="phone">
      {screen === 'home' ? (
        <CareScreen
          cub={cub}
          startInGames={openGames}
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
        />
      ) : null}
    </main>
  )
}
