import { supabase } from './supabase'

/**
 * What a player did with a scorecard or replay, counted per game per UK day for the admin page.
 * share-image and share-replay go through the phone's share menu, where the player picks the app.
 */
export type ShareEvent = 'save-image' | 'save-replay' | 'x-post' | 'share-image' | 'share-replay'

/** Adds one to today's count. Nothing about the player is sent. Never throws and never holds the game up. */
export function countShare(game: string, event: ShareEvent) {
  if (!supabase) return
  void supabase.rpc('count_share', { p_game: game, p_event: event }).then(
    () => undefined,
    () => undefined,
  )
}
