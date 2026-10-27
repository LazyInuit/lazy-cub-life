import { defaultSave, sanitizeSave } from './progress'
import { supabase } from './supabase'
import type { CubSave } from './types'

const ACCOUNT_DOMAIN = 'users.lazycub.life'
const USERNAME_PATTERN = /^[a-z0-9_]{3,12}$/

/** Account exists, but this browser did not get a session yet. */
export const ACCOUNT_CREATED_SIGN_IN = 'ACCOUNT_CREATED_SIGN_IN'

let cloudReady = false
let pendingSave: CubSave | null = null
let syncTimer: number | null = null
let lockedCash: number | null = null
let adoptedSave: CubSave | null = null

export function lockedCubCash() {
  return lockedCash
}

export function noteLockedCash(cash: number) {
  lockedCash = Math.max(0, Math.floor(cash))
}

/** Keep a newer earn if an older server reply comes back afterwards. */
export function noteEarnedCash(cash: number) {
  const next = Math.max(0, Math.floor(cash))
  if (lockedCash != null && next < lockedCash) return lockedCash
  noteLockedCash(next)
  return lockedCash ?? next
}

export function clearLockedCash() {
  lockedCash = null
}

export function takeAdoptedSave() {
  const next = adoptedSave
  adoptedSave = null
  return next
}

type BoardBests = { flight: number; match: number; dojo: number; archer: number; hoops: number; bubble: number; river: number }

/**
 * This account's best ever score in each game, from the leaderboard. Every run is sent
 * there, so it is the true best. A phone save can be lower (a newer copy won) or higher
 * (another account was signed in on this phone), so the save follows the board.
 */
async function loadBoardBests(username: string | null): Promise<BoardBests | null> {
  if (!supabase || !username) return null
  try {
    const { data, error } = await supabase.rpc('player_profile', { p_username: username })
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null
    const entry = data as { username?: unknown; bests?: unknown }
    if (typeof entry.username !== 'string' || entry.username.toLowerCase() !== username.toLowerCase()) return null
    const raw = entry.bests && typeof entry.bests === 'object' && !Array.isArray(entry.bests)
      ? (entry.bests as Record<string, unknown>)
      : {}
    const read = (value: unknown) => {
      const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
      return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0
    }
    return {
      flight: read(raw.flight),
      match: read(raw.match),
      dojo: read(raw.dojo),
      archer: read(raw.archer),
      hoops: read(raw.hoops),
      bubble: read(raw.bubble),
      river: read(raw.river),
    }
  } catch {
    return null
  }
}

function withBoardBests(save: CubSave, board: BoardBests | null): CubSave {
  if (!board) return save
  return {
    ...save,
    flightBest: board.flight,
    matchBest: board.match,
    dojoBest: board.dojo,
    archerBest: board.archer,
    hoopsBest: board.hoops,
    bubbleBest: board.bubble,
    riverBest: board.river,
  }
}

function sameBests(a: CubSave, b: CubSave) {
  return (
    a.flightBest === b.flightBest &&
    a.matchBest === b.matchBest &&
    a.dojoBest === b.dojoBest &&
    a.archerBest === b.archerBest &&
    a.hoopsBest === b.hoopsBest &&
    a.bubbleBest === b.bubbleBest &&
    a.riverBest === b.riverBest
  )
}

export function accountEmail(username: string) {
  return `${username}@${ACCOUNT_DOMAIN}`
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

export function usernameError(value: string) {
  const username = normalizeUsername(value)
  if (!USERNAME_PATTERN.test(username)) {
    return 'Use 3 to 12 letters, numbers, or underscores.'
  }
  return null
}

/** Stored as text only. The game never connects a wallet or sends a transaction. */
export function normalizeEthAddress(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const body = /^0x/i.test(trimmed) ? trimmed.slice(2) : trimmed
  return `0x${body.toLowerCase()}`
}

export function ethAddressError(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const body = /^0x/i.test(trimmed) ? trimmed.slice(2) : trimmed
  if (!/^[\da-f]{40}$/i.test(body)) return 'Use a full ETH address, starting with 0x.'
  return null
}

export function ethFromUser(user: Parameters<typeof usernameFromUser>[0]) {
  const meta = user?.user_metadata?.eth_address
  return typeof meta === 'string' ? normalizeEthAddress(meta) : null
}

export function usernameFromUser(user: { email?: string | null; user_metadata?: { username?: unknown; eth_address?: unknown } } | null | undefined) {
  const meta = user?.user_metadata?.username
  if (typeof meta === 'string' && meta.trim()) return meta.trim()
  const email = user?.email ?? ''
  const name = email.split('@')[0]
  return name || null
}

function plainAuthError(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes('banned')) return 'This account is banned.'
  if (lower.includes('already registered') || lower.includes('already been registered')) return 'That username is taken.'
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) return 'Username or password is wrong.'
  if (lower.includes('password')) return 'Use at least 6 characters for the password.'
  return 'Could not reach your account. Try again.'
}

export async function accountIsBanned(userId: string) {
  if (!supabase) return false
  const { data, error } = await supabase.from('profiles').select('banned').eq('id', userId).maybeSingle()
  if (error) return false
  return data?.banned === true
}

export async function profilesReady() {
  if (!supabase) return false
  const { error } = await supabase.from('profiles').select('id').limit(1)
  if (!error) return true
  if (error.code === 'PGRST205') return false
  const message = error.message.toLowerCase()
  return !message.includes('schema cache') && !message.includes('could not find the table')
}

/** Update or insert without touching cub_cash. Upsert is blocked once coins are server-owned. */
async function writeProfile(userId: string, username: string, save: CubSave) {
  if (!supabase) return { error: null }
  const row = {
    username,
    save,
    updated_at: new Date().toISOString(),
  }
  const updated = await supabase.from('profiles').update(row).eq('id', userId).select('id')
  if (updated.error || (updated.data && updated.data.length > 0)) return updated
  return supabase.from('profiles').insert({ id: userId, ...row })
}

let pushTail: Promise<void> = Promise.resolve()
/** lastVisit on the account when this copy last matched it. Opening the app must not move this. */
let syncedVisit = 0
let refreshing = false

export function cloudBaseVisit() {
  return syncedVisit
}

function noteSyncedVisit(visit: number) {
  if (Number.isFinite(visit)) syncedVisit = visit
}

async function sendCloudSave(save: CubSave): Promise<'ok' | 'stale' | 'skip'> {
  if (!supabase) return 'skip'
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) return 'skip'
  const loaded = await loadProfile(session.user.id)
  if (loaded && sanitizeSave(loaded.save).lastVisit > syncedVisit) return 'stale'
  const { error } = await supabase.from('profiles').update({
    save,
    updated_at: new Date().toISOString(),
  }).eq('id', session.user.id)
  if (error) throw error
  noteSyncedVisit(save.lastVisit)
  return 'ok'
}

/** One upload at a time, always sending the newest save so an older write cannot land last. */
function enqueueCloudSave() {
  const run = pushTail.then(async () => {
    while (pendingSave) {
      const next = pendingSave
      pendingSave = null
      try {
        const sent = await sendCloudSave(next)
        if (sent === 'stale') break
      } catch {
        if (!pendingSave) pendingSave = next
        break
      }
    }
  })
  pushTail = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function scheduleCloudSave(save: CubSave) {
  if (!supabase || !cloudReady || refreshing) return
  pendingSave = save
  // The home screen rewrites the save every second. Restarting this timer
  // each time meant the upload never left while the shortcut stayed open.
  if (syncTimer !== null) return
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    if (pendingSave) void enqueueCloudSave()
  }, 12000)
}

export function flushCloudSave() {
  if (syncTimer !== null) window.clearTimeout(syncTimer)
  syncTimer = null
  if (!pendingSave || !supabase) return
  void enqueueCloudSave()
}

/** Wait until this save is the latest one stored for the signed-in account. */
export function flushCloudSaveNow(save?: CubSave) {
  if (syncTimer !== null) window.clearTimeout(syncTimer)
  syncTimer = null
  if (save) pendingSave = save
  if (!pendingSave || !supabase || !cloudReady) return Promise.resolve()
  return enqueueCloudSave()
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    flushCloudSave()
  })
}

async function loadProfile(userId: string): Promise<{ save: unknown; cubCash: number | null } | null> {
  if (!supabase) return null
  const full = await supabase.from('profiles').select('save, cub_cash').eq('id', userId).maybeSingle()
  if (!full.error && full.data?.save) {
    const cash = typeof full.data.cub_cash === 'number' && Number.isFinite(full.data.cub_cash) ? Math.floor(full.data.cub_cash) : null
    return { save: full.data.save, cubCash: cash }
  }
  const basic = await supabase.from('profiles').select('save').eq('id', userId).maybeSingle()
  if (basic.error || !basic.data?.save) return null
  return { save: basic.data.save, cubCash: null }
}

function withLockedCash(save: CubSave, cash: number | null) {
  if (cash == null) return save
  noteLockedCash(cash)
  return { ...save, cubCash: cash }
}

/**
 * The account cub wins when it was saved later than this copy's real last visit.
 * storedVisit must be the visit from before this open refreshed the clock,
 * because Safari and the home-screen shortcut keep separate copies.
 */
export async function reconcileCloudSave(local: CubSave, storedVisit = local.lastVisit): Promise<CubSave | null> {
  refreshing = true
  if (syncTimer !== null) window.clearTimeout(syncTimer)
  syncTimer = null
  try {
    if (!supabase) return null
    const { data } = await supabase.auth.getSession()
    const session = data.session
    if (!session) return null
    const loaded = await loadProfile(session.user.id)
    if (!loaded) {
      noteSyncedVisit(storedVisit)
      pendingSave = local
      await enqueueCloudSave()
      return null
    }
    const remote = withLockedCash(sanitizeSave(loaded.save), loaded.cubCash)
    const board = await loadBoardBests(usernameFromUser(session.user))
    if (remote.lastVisit > storedVisit) {
      noteSyncedVisit(remote.lastVisit)
      return withBoardBests(remote, board)
    }
    noteSyncedVisit(remote.lastVisit)
    const fixed = withBoardBests(local, board)
    pendingSave = fixed
    await enqueueCloudSave()
    if (loaded.cubCash != null) noteLockedCash(loaded.cubCash)
    // This copy wins the upload. Still hand back the bests if the board changed them.
    return sameBests(fixed, local) ? null : fixed
  } finally {
    refreshing = false
    cloudReady = true
  }
}

export async function signUpAccount(usernameInput: string, password: string, save: CubSave, ethInput = '') {
  if (!supabase) return 'Accounts are not connected.'
  const loginName = normalizeUsername(usernameInput)
  const displayName = usernameInput.trim()
  const nameError = usernameError(loginName)
  if (nameError) return nameError
  const ethError = ethAddressError(ethInput)
  if (ethError) return ethError
  const ethAddress = normalizeEthAddress(ethInput)
  if (password.length < 6) return 'Use at least 6 characters for the password.'
  if (!(await profilesReady())) return 'Account storage is not ready yet.'
  const { data, error } = await supabase.auth.signUp({
    email: accountEmail(loginName),
    password,
    options: { data: { username: displayName, ...(ethAddress ? { eth_address: ethAddress } : {}) } },
  })
  if (error) return plainAuthError(error.message)
  if (!data.session) return ACCOUNT_CREATED_SIGN_IN
  const { error: saveError } = await writeProfile(data.session.user.id, displayName, save)
  if (saveError) {
    await supabase.auth.signOut()
    return 'Could not store your cub on the account.'
  }
  const loaded = await loadProfile(data.session.user.id)
  if (loaded) adoptedSave = withLockedCash(sanitizeSave(loaded.save), loaded.cubCash)
  cloudReady = true
  return null
}

/** The cub stored on the signed-in account. Does not keep a guest save from this device. */
export async function pullAccountCub(): Promise<CubSave | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const session = data.session
  const username = usernameFromUser(session?.user)
  if (!session || !username) return null
  let loaded = await loadProfile(session.user.id)
  if (!loaded) {
    const fresh = defaultSave()
    const { error } = await writeProfile(session.user.id, username, fresh)
    if (error) return null
    loaded = await loadProfile(session.user.id)
  }
  if (!loaded) return null
  cloudReady = true
  return withLockedCash(sanitizeSave(loaded.save), loaded.cubCash)
}

export async function signInAccount(usernameInput: string, password: string) {
  if (!supabase) return 'Accounts are not connected.'
  const username = normalizeUsername(usernameInput)
  const nameError = usernameError(username)
  if (nameError) return nameError
  if (!password) return 'Enter your password.'
  const { error } = await supabase.auth.signInWithPassword({
    email: accountEmail(username),
    password,
  })
  if (error) return plainAuthError(error.message)
  cloudReady = true
  return null
}

function settingsError(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes('could not find the function') || lower.includes('schema cache') || lower.includes('username_changed_at')) {
    return 'Settings are not connected yet.'
  }
  const week = message.match(/Username can be changed again on [^.]+/i)
  if (week) return `${week[0].replace(/\.$/, '')}.`
  if (lower.includes('taken')) return 'That username is taken.'
  if (lower.includes('password')) return 'Password is wrong.'
  if (lower.includes('eth')) return 'Use a full ETH address, starting with 0x.'
  if (lower.includes('3 to 12') || lower.includes('letters')) return 'Use 3 to 12 letters, numbers, or underscores.'
  return 'Could not save those changes. Try again.'
}

/** Keeps the typed capitals. Sign-in still matches any capitalisation. */
export async function updateAccountSettings(usernameInput: string, ethInput: string, password: string) {
  if (!supabase) return 'Accounts are not connected.'
  const loginName = normalizeUsername(usernameInput)
  const displayName = usernameInput.trim()
  const nameError = usernameError(loginName)
  if (nameError) return nameError
  const ethError = ethAddressError(ethInput)
  if (ethError) return ethError
  if (!password) return 'Enter your password to save changes.'
  const ethAddress = normalizeEthAddress(ethInput) ?? ''
  const { error } = await supabase.rpc('update_account_settings', {
    p_username: displayName,
    p_eth: ethAddress,
    p_password: password,
  })
  if (error) return settingsError(error.message)
  await supabase.auth.refreshSession()
  return null
}

/** Check the current password, then set the new one. Returns an error to show, or null. */
export async function changeAccountPassword(current: string, next: string, confirm: string) {
  if (!supabase) return 'Accounts are not connected.'
  if (!current) return 'Enter your current password.'
  if (next.length < 6) return 'Use at least 6 characters for the new password.'
  if (next !== confirm) return 'The new passwords do not match.'
  if (next === current) return 'Choose a new password that is different from your current one.'
  const { data } = await supabase.auth.getSession()
  const email = data.session?.user.email
  if (!email) return 'Sign in again to change your password.'
  const check = await supabase.auth.signInWithPassword({ email, password: current })
  if (check.error) return 'Current password is wrong.'
  const { error } = await supabase.auth.updateUser({ password: next })
  if (!error) return null
  const lower = error.message.toLowerCase()
  if (lower.includes('different')) return 'Choose a new password that is different from your current one.'
  if (lower.includes('weak') || lower.includes('characters')) return 'That password is too weak. Try a longer one.'
  return 'Could not change your password. Try again.'
}

const USERNAME_CHANGE_WAIT_MS = 7 * 24 * 60 * 60 * 1000

/** Shown in Settings. A blank date means the next change is available now. */
export function usernameChangeNote(changedAt: string | null) {
  if (!changedAt) return 'Username can be changed once a week.'
  const at = new Date(changedAt).getTime()
  if (!Number.isFinite(at)) return 'Username can be changed once a week.'
  const next = at + USERNAME_CHANGE_WAIT_MS
  if (next <= Date.now()) return 'Username can be changed once a week.'
  const label = new Date(next).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `Username can be changed again on ${label}.`
}

/** The name plate uses the casing from account creation. Sign-in still ignores case. */
export async function loadDisplayedUsername(userId: string) {
  if (!supabase) return null
  const { data } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle()
  return typeof data?.username === 'string' && data.username.trim() ? data.username.trim() : null
}

export async function loadUsernameChangedAt(userId: string) {
  if (!supabase) return null
  const { data, error } = await supabase.from('profiles').select('username_changed_at').eq('id', userId).maybeSingle()
  if (error || typeof data?.username_changed_at !== 'string') return null
  return data.username_changed_at
}

export async function signOutAccount() {
  if (!supabase) return
  if (syncTimer !== null) window.clearTimeout(syncTimer)
  syncTimer = null
  if (pendingSave) await enqueueCloudSave()
  clearLockedCash()
  syncedVisit = 0
  cloudReady = false
  await supabase.auth.signOut()
  cloudReady = true
}
