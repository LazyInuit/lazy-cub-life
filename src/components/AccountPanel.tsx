import { useRef, useState } from 'react'
import { ACCOUNT_CREATED_SIGN_IN, changeAccountPassword, usernameChangeNote } from '../game/account'
import { hasProfileCard, type GameBests } from '../game/profileArt'
import type { CubController } from '../game/useCub'
import { AchievementsPanel } from './AchievementsPanel'
import { CubPowerPanel } from './CubPowerPanel'
import { PlayerProfileCard } from './PlayerProfileCard'

type Props = {
  cub: CubController
  onClose: () => void
  /** Earned badges not looked at yet, for the dot on Achievements. */
  unseenBadges?: number
  localBests?: GameBests
}

export function AccountPanel({ cub, onClose, unseenBadges = 0, localBests }: Props) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [ethAddress, setEthAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<'ready' | 'signin' | null>(null)
  const [view, setView] = useState<'account' | 'settings' | 'password'>('account')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [settingsName, setSettingsName] = useState('')
  const [settingsEth, setSettingsEth] = useState('')
  const [settingsPassword, setSettingsPassword] = useState('')
  const [saved, setSaved] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [achievementsOpen, setAchievementsOpen] = useState(false)
  const [powerOpen, setPowerOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const submit = async () => {
    setError(null)
    if (mode === 'up' && password !== confirmPassword) {
      setError('Those passwords do not match.')
      formRef.current?.scrollTo({ top: 0 })
      return
    }
    setBusy(true)
    const message = mode === 'up' ? await cub.signUp(username, password, ethAddress) : await cub.signIn(username, password)
    setBusy(false)
    formRef.current?.scrollTo({ top: 0 })
    if (message === ACCOUNT_CREATED_SIGN_IN) {
      setPassword('')
      setConfirmPassword('')
      setCreated('signin')
      setMode('in')
      return
    }
    if (message) {
      setError(message)
      return
    }
    if (mode === 'up' || created === 'signin') {
      setCreated('ready')
      return
    }
    onClose()
  }

  const chosenName = cub.accountName ?? (username.trim() || 'your account')

  const openSettings = () => {
    setSettingsName(cub.accountName ?? '')
    setSettingsEth(cub.accountEth ?? '')
    setSettingsPassword('')
    setError(null)
    setSaved(false)
    setView('settings')
    formRef.current?.scrollTo({ top: 0 })
  }

  const saveSettings = async () => {
    setError(null)
    setSaved(false)
    setBusy(true)
    const message = await cub.updateAccount(settingsName, settingsEth, settingsPassword)
    setBusy(false)
    formRef.current?.scrollTo({ top: 0 })
    if (message) {
      setError(message)
      return
    }
    setSettingsPassword('')
    setSaved(true)
  }

  const openPassword = () => {
    setCurrentPassword('')
    setNewPassword('')
    setRepeatPassword('')
    setError(null)
    setSaved(false)
    setView('password')
    formRef.current?.scrollTo({ top: 0 })
  }

  const savePassword = async () => {
    setError(null)
    setSaved(false)
    setBusy(true)
    const message = await changeAccountPassword(currentPassword, newPassword, repeatPassword)
    setBusy(false)
    formRef.current?.scrollTo({ top: 0 })
    if (message) {
      setError(message)
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setRepeatPassword('')
    setSaved(true)
  }

  if (profileOpen && cub.accountName) {
    return <PlayerProfileCard username={cub.accountName} mine editable onClose={() => setProfileOpen(false)} />
  }

  if (achievementsOpen && cub.accountName) {
    return (
      <AchievementsPanel username={cub.accountName} localBests={localBests} onClose={() => setAchievementsOpen(false)} />
    )
  }

  if (powerOpen && cub.accountName) {
    return (
      <CubPowerPanel
        power={cub.cubPower}
        newGame={cub.powerNewGame}
        onSeenNewGame={cub.dismissPowerNewGame}
        onRefresh={cub.refreshCubPower}
        onClose={() => setPowerOpen(false)}
      />
    )
  }

  return (
    <div className="account-panel">
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          if (view === 'settings') void saveSettings()
          else if (view === 'password') void savePassword()
          else void submit()
        }}
      >
        <h2>
          {created
            ? 'Account created'
            : view === 'settings'
              ? 'Settings'
              : view === 'password'
                ? 'Reset password'
                : cub.accountName
                ? cub.accountName
                : mode === 'up'
                  ? 'Create account'
                  : 'Sign in'}
        </h2>
        {created === 'ready' ? (
          <>
            <p className="account-success">You're signed in as {chosenName}.</p>
            <p>This cub is saved to your account.</p>
            <button type="button" className="account-submit" onClick={onClose}>
              Back to the game
            </button>
          </>
        ) : created === 'signin' ? (
          <>
            <p className="account-success">Your account is ready. Sign in with the same username and password.</p>
            <label>
              Username
              <input
                value={username}
                autoComplete="username"
                autoCapitalize="none"
                maxLength={12}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? <p className="account-error">{error}</p> : null}
            <button type="submit" className="account-submit" disabled={busy}>
              {busy ? 'Please wait' : 'Sign in'}
            </button>
          </>
        ) : cub.accountName && view === 'settings' ? (
          <>
            <p className="account-eth">{usernameChangeNote(cub.usernameChangedAt)}</p>
            <label>
              Username
              <input
                value={settingsName}
                autoComplete="username"
                autoCapitalize="none"
                maxLength={12}
                onChange={(event) => setSettingsName(event.target.value)}
              />
            </label>
            <label className="account-eth-label">
              ETH Wallet Address (Optional)
              <input
                value={settingsEth}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => setSettingsEth(event.target.value)}
              />
            </label>
            <p className="account-eth">Leave the address blank to remove it. Never enter a private key.</p>
            <label>
              Current password
              <input
                type="password"
                value={settingsPassword}
                autoComplete="current-password"
                onChange={(event) => setSettingsPassword(event.target.value)}
              />
            </label>
            {error ? <p className="account-error">{error}</p> : null}
            {saved ? <p className="account-success">Settings updated.</p> : null}
            <button type="button" className="account-submit" disabled={busy} onClick={() => void saveSettings()}>
              {busy ? 'Please wait' : 'Save'}
            </button>
            <button type="button" className="account-submit" disabled={busy} onClick={openPassword}>
              Reset password
            </button>
            <button
              type="button"
              className="account-switch"
              onClick={() => {
                setView('account')
                setError(null)
                setSaved(false)
              }}
            >
              Back
            </button>
          </>
        ) : cub.accountName && view === 'password' ? (
          <>
            <label>
              Current password
              <input
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label>
              New password
              <input
                type="password"
                value={newPassword}
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label>
              Type the new password again
              <input
                type="password"
                value={repeatPassword}
                autoComplete="new-password"
                onChange={(event) => setRepeatPassword(event.target.value)}
              />
            </label>
            <p className="account-eth">Use at least 6 characters.</p>
            {error ? <p className="account-error">{error}</p> : null}
            {saved ? <p className="account-success">Password changed. Use your new password next time you sign in.</p> : null}
            <button type="submit" className="account-submit" disabled={busy}>
              {busy ? 'Please wait' : 'Change password'}
            </button>
            <button
              type="button"
              className="account-switch"
              onClick={() => {
                setView('settings')
                setError(null)
                setSaved(false)
              }}
            >
              Back
            </button>
          </>
        ) : cub.accountName ? (
          <>
            <p>This cub is saved to your account.</p>
            {cub.accountEth ? <p className="account-eth">Rewards address {cub.accountEth}</p> : null}
            {hasProfileCard(cub.accountName) ? (
              <>
                <button type="button" className="account-submit" onClick={() => setProfileOpen(true)}>
                  My Profile
                </button>
                <button type="button" className="account-submit account-achievements" onClick={() => setAchievementsOpen(true)}>
                  Achievements
                  {unseenBadges > 0 ? (
                    <span className="account-new" aria-label={`${unseenBadges} new`}>
                      {unseenBadges} new
                    </span>
                  ) : null}
                </button>
                {cub.cubPower ? (
                  <button type="button" className="account-submit account-achievements" onClick={() => setPowerOpen(true)}>
                    Cub Power · {cub.cubPower.total.toLocaleString('en-US')}
                    {cub.powerNewGame ? <span className="account-new">New game</span> : null}
                  </button>
                ) : null}
              </>
            ) : null}
            <button type="button" className="account-submit" onClick={openSettings}>
              Settings
            </button>
            <button
              type="button"
              className="account-submit"
              disabled={busy}
              onClick={() => {
                void cub.signOut()
                onClose()
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            {error ? <p className="account-error">{error}</p> : mode === 'in' ? <p>No email needed.</p> : null}
            <label>
              Username
              <input
                value={username}
                autoComplete="username"
                autoCapitalize="none"
                maxLength={12}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {mode === 'up' ? (
              <label>
                Confirm password
                <input
                  type="password"
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
            ) : null}
            {mode === 'up' ? (
              <>
                <label className="account-eth-label">
                  ETH Wallet Address (Optional)
                  <input
                    value={ethAddress}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(event) => setEthAddress(event.target.value)}
                  />
                </label>
                <div className="account-eth-note">
                  <p>Add your Ethereum (ETH) wallet address to receive any future rewards earned through gameplay.</p>
                  <p>Your address will be securely saved to your account, allowing us to manually send eligible rewards directly to your wallet.</p>
                  <p>Adding a wallet is completely optional and is not required to play the game.</p>
                  <p>No wallet connection or transaction approval is needed. Simply enter your public ETH address.</p>
                  <p>Never share your private keys or recovery phrase.</p>
                </div>
              </>
            ) : null}
            <button type="submit" className="account-submit" disabled={busy}>
              {busy ? 'Please wait' : mode === 'up' ? 'Create account' : 'Sign in'}
            </button>
            <button
              type="button"
              className="account-switch"
              onClick={() => {
                setMode(mode === 'up' ? 'in' : 'up')
                setConfirmPassword('')
                setError(null)
              }}
            >
              {mode === 'up' ? 'I already have an account' : 'Create a new account'}
            </button>
          </>
        )}
        <button type="button" className="account-switch" onClick={onClose}>
          Close
        </button>
      </form>
    </div>
  )
}
