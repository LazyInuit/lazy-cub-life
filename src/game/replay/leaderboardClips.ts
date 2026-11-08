/**
 * Replays on the all-time leaderboards. When a run's score is saved and puts the player in a board's
 * all-time top 3, its replay (and its first-frame still) is uploaded to the public `replays` bucket.
 * Clips that dropped out of the top 3 are deleted on the way. Boards then list their top 3's clips.
 * See supabase/leaderboard-replays.sql.
 */
import type { LeaderboardGame } from '../leaderboard'
import { supabase } from '../supabase'
import { replayRun } from './recorder'
import { replayState } from './store'

const BUCKET = 'replays'
/** How long to wait for the run's replay to finish being made before giving up. */
const WAIT_MS = 60_000

export type LeaderboardClip = { username: string; score: number; url: string; poster: string | null }

async function signedInId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/** The run's finished replay and still, or null if it was thrown away or another run started first. */
async function readyReplay(run: number): Promise<{ video: Blob; poster: Blob | null } | null> {
  const until = performance.now() + WAIT_MS
  while (performance.now() < until) {
    if (replayRun() !== run) return null
    const state = replayState()
    if (state.status === 'ready') {
      let poster: Blob | null = null
      if (state.poster) poster = await fetch(state.poster).then((res) => res.blob()).catch(() => null)
      return { video: state.blob, poster }
    }
    if (state.status === 'off' || state.status === 'idle') return null
    await new Promise((resolve) => window.setTimeout(resolve, 250))
  }
  return null
}

/**
 * Called once a run's score is saved. If it is the player's best on `board` and in the all-time top 3,
 * uploads that run's replay for the leaderboard. Quietly does nothing otherwise, or on any failure.
 */
export async function offerLeaderboardReplay(board: LeaderboardGame, score: number, run: number) {
  try {
    if (!supabase || run === 0) return
    const uid = await signedInId()
    if (!uid) return
    const { data } = await supabase.rpc('replay_standing', { p_board: board })
    const standing = data as { best?: number; place?: number | null } | null
    if (!standing || standing.best !== score || !standing.place || standing.place > 3) return
    const replay = await readyReplay(run)
    if (!replay) return
    const files = supabase.storage.from(BUCKET)
    const { error } = await files.upload(`${board}/${uid}.mp4`, replay.video, { upsert: true, contentType: 'video/mp4', cacheControl: '3600' })
    if (error) return
    if (replay.poster) await files.upload(`${board}/${uid}.jpg`, replay.poster, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
    const saved = await supabase.rpc('replay_saved', { p_board: board, p_score: score })
    const stale = (saved.data as { stale?: unknown } | null)?.stale
    if (Array.isArray(stale) && stale.length > 0) await files.remove(stale.filter((name): name is string => typeof name === 'string'))
  } catch {
    // A leaderboard clip is a bonus; the run is already scored.
  }
}

/** The top 3's clips for a board, by username. Empty where the board has none or the database lacks them. */
export async function loadLeaderboardClips(board: LeaderboardGame): Promise<Map<string, LeaderboardClip>> {
  const clips = new Map<string, LeaderboardClip>()
  if (!supabase) return clips
  const { data, error } = await supabase.rpc('leaderboard_replays', { p_board: board })
  if (error || !Array.isArray(data)) return clips
  const files = supabase.storage.from(BUCKET)
  for (const item of data as unknown[]) {
    if (!item || typeof item !== 'object') continue
    const entry = item as { username?: unknown; score?: unknown; path?: unknown; poster?: unknown; version?: unknown }
    if (typeof entry.username !== 'string' || typeof entry.path !== 'string') continue
    const version = Number(entry.version) || 0
    const url = `${files.getPublicUrl(entry.path).data.publicUrl}?v=${version}`
    const poster = typeof entry.poster === 'string' ? `${files.getPublicUrl(entry.poster).data.publicUrl}?v=${version}` : null
    clips.set(entry.username, { username: entry.username, score: Number(entry.score) || 0, url, poster })
  }
  return clips
}
