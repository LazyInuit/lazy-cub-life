import { useState } from 'react'
import { CareScreen } from './components/CareScreen'
import { LazyDojo } from './components/LazyDojo'
import { SafariFlight } from './components/SafariFlight'
import { TraitMatch } from './components/TraitMatch'
import { useCub } from './game/useCub'

type Screen = 'home' | 'flight' | 'match' | 'dojo'

export default function App() {
  const cub = useCub()
  const [screen, setScreen] = useState<Screen>('home')
  const [openGames, setOpenGames] = useState(false)

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
        />
      ) : null}
      {screen === 'flight' ? (
        <SafariFlight
          best={cub.save.flightBest}
          onBest={cub.recordFlightBest}
          onReward={cub.reward}
          onExit={goHome}
          onGames={goGames}
        />
      ) : null}
      {screen === 'match' ? (
        <TraitMatch
          best={cub.save.matchBest}
          onBest={cub.recordMatchBest}
          onReward={cub.reward}
          onExit={goHome}
          onGames={goGames}
        />
      ) : null}
      {screen === 'dojo' ? (
        <LazyDojo
          best={cub.save.dojoBest}
          onBest={cub.recordDojoBest}
          onReward={cub.reward}
          onExit={goHome}
          onGames={goGames}
        />
      ) : null}
    </main>
  )
}
