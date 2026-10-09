import { useState } from 'react'
import { CareScreen } from './components/CareScreen'
import { CupidArcher } from './components/CupidArcher'
import { LazyHoops } from './components/LazyHoops'
import { LazyDojo } from './components/LazyDojo'
import { SafariFlight } from './components/SafariFlight'
import { TraitMatch } from './components/TraitMatch'
import { useCub } from './game/useCub'

type Screen = 'home' | 'flight' | 'match' | 'dojo' | 'archer' | 'hoops'

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
          onExit={goHome}
          onGames={goGames}
        />
      ) : null}
    </main>
  )
}
