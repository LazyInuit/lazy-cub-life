import { useEffect } from 'react'
import { discardReplay } from './recorder'

export { captureReplay, discardReplay, finishReplay, startReplay, type ReplayStart } from './recorder'
export { useReplayState, type ReplayState } from './store'

/** For a game screen: throws the replay away when the player leaves the game. */
export function useDiscardReplayOnLeave() {
  useEffect(() => () => discardReplay(), [])
}
