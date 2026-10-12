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

async function pushCloudSave(save: CubSave) {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) return
  pendingSave = null
  await supabase.from('profiles').update({
    save,
    updated_at: new Date().toISOString(),
  }).eq('id', session.user.id)
}

export function scheduleCloudSave(save: CubSave) {
  if (!supabase || !cloudReady) return
  pendingSave = save
  if (syncTimer !== null) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    const next = pendingSave
    if (next) void pushCloudSave(next)
  }, 12000)
}

export function flushCloudSave() {
  if (syncTimer !== null) window.clearTimeout(syncTimer)
  syncTimer = null
  const next = pendingSave
  if (next) void pushCloudSave(next)
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

/** Cloud save wins when it is newer. Returns null when the local cub should stay. */
export async function reconcileCloudSave(local: CubSave): Promise<CubSave | null> {
  if (!supabase) {
    cloudReady = true
    return null
  }
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) {
    cloudReady = true
    return null
  }
  const loaded = await loadProfile(session.user.id)
  if (!loaded) {
    await pushCloudSave(local)
    cloudReady = true
    return null
  }
  const remote = withLockedCash(sanitizeSave(loaded.save), loaded.cubCash)
  if (remote.lastVisit > local.lastVisit) {
    cloudReady = true
    return remote
  }
  await pushCloudSave(local)
  cloudReady = true
  if (loaded.cubCash == null) return null
  return withLockedCash(local, loaded.cubCash)
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
  const next = pendingSave
  pendingSave = null
  if (next) await pushCloudSave(next)
  clearLockedCash()
  cloudReady = false
  await supabase.auth.signOut()
  cloudReady = true
}
