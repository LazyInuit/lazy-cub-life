import { useEffect, useState } from 'react'
import { loadPlayerProfile, type PlayerProfile } from './leaderboard'
import {
  allEarnedTiers,
  hasProfileCard,
  mergeBests,
  onBadgesSeen,
  seenBadges,
  type GameBests,
} from './profileArt'
import type { CubSave } from './types'

/** Bests saved on this phone, which can be ahead of the leaderboard right after a run. */
export function saveBests(save: CubSave | null): GameBests {
  if (!save) return {}
  return {
    flight: save.flightBest,
    match: save.matchBest,
    dojo: save.dojoBest,
    archer: save.archerBest,
    hoops: save.hoopsBest,
    bubble: save.bubbleBest,
  }
}

/**
 * The signed-in player's own profile for the home screen: their photo for the name pill,
 * and how many earned badges they have not looked at yet. Reloads when refresh changes.
 */
export function useOwnProfile(username: string | null, save: CubSave | null, refresh: number) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [seenTick, setSeenTick] = useState(0)
  const enabled = hasProfileCard(username)

  useEffect(() => {
    if (!enabled || !username) {
      setProfile(null)
      return
    }
    let cancel = false
    void loadPlayerProfile(username)
      .then((next) => {
        if (!cancel) setProfile(next)
      })
      .catch(() => {
        // The pill falls back to the default picture.
      })
    return () => {
      cancel = true
    }
  }, [enabled, username, refresh])

  useEffect(() => onBadgesSeen(() => setSeenTick((value) => value + 1)), [])

  const bests = mergeBests(profile?.bests ?? {}, saveBests(save))
  const seen = enabled && username ? seenBadges(username) : new Set<string>()
  void seenTick
  const unseen = enabled ? allEarnedTiers(bests).filter((id) => !seen.has(id)).length : 0

  return { enabled, photoUrl: profile?.photoUrl ?? null, bests, unseen }
}
