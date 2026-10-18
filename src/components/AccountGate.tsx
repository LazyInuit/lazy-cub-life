import { useRef, useState } from 'react'
import {
  ACCOUNT_CREATED_SIGN_IN,
  pullAccountCub,
  signInAccount,
  signUpAccount,
  takeAdoptedSave,
} from '../game/account'
import { defaultSave } from '../game/progress'
import { writeSave } from '../game/storage'
import { supabase } from '../game/supabase'

const SUPPORT_URL = 'https://x.com/lazyinuit?s=11&t=Uu1nn2ISeprcwO8HUVWq4A'

export function ForgotPasswordNote() {
  return (
    <p className="account-forgot">
      Forgot your password? Message{' '}
      <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
        LazyInuit on X
      </a>
      .
    </p>
  )
}

type Props = {
  onEnter: () => void
  notice?: string | null
  startMode?: 'in' | 'up'
  /** Back to the screen with Create an account and Play demo. */
  onBack?: () => void
}

export function AccountGate({ onEnter, notice = null, startMode = 'up', onBack }: Props) {
  const [mode, setMode] = useState<'in' | 'up'>(startMode)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [ethAddress, setEthAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<'ready' | 'signin' | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const openCub = async () => {
    const adopted = takeAdoptedSave()
    const cub = adopted ?? (await pullAccountCub())
    if (!cub) return 'Could not open your cub.'
    writeSave(cub)
    return null
  }

  const submit = async () => {
    setError(null)
    if (mode === 'up' && password !== confirmPassword) {
      setError('Those passwords do not match.')
      formRef.current?.scrollTo({ top: 0 })
      return
    }
    setBusy(true)
    const message =
      mode === 'up'
        ? await signUpAccount(username, password, defaultSave(), ethAddress)
        : await signInAccount(username, password)
    if (message === ACCOUNT_CREATED_SIGN_IN) {
      setBusy(false)
      setPassword('')
      setConfirmPassword('')
      setCreated('signin')
      setMode('in')
      formRef.current?.scrollTo({ top: 0 })
      return
    }
    if (message) {
      setBusy(false)
      setError(message)
      formRef.current?.scrollTo({ top: 0 })
      return
    }
    const stored = await openCub()
    setBusy(false)
    formRef.current?.scrollTo({ top: 0 })
    if (stored) {
      setError(stored)
      return
    }
    if (mode === 'up' || created === 'signin') {
      setCreated('ready')
      return
    }
    onEnter()
  }

  const chosenName = username.trim() || 'your account'

  if (!supabase) {
    return (
      <main className="phone">
        <p className="boot">Accounts are not connected.</p>
      </main>
    )
  }

  return (
    <main className="phone">
      <div className="account-panel">
        <form
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault()
            if (!busy) void submit()
          }}
        >
          <h2>{created ? 'Account created' : mode === 'up' ? 'Create account' : 'Sign in'}</h2>
          {notice && !created && !error ? <p className="account-error">{notice}</p> : null}
          {created === 'ready' ? (
            <>
              <p className="account-success">You're signed in as {chosenName}.</p>
              <p>This cub is saved to your account.</p>
              <button type="button" className="account-submit" onClick={onEnter}>
                Start playing
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
          ) : (
            <>
              <p>{mode === 'up' ? 'Create an account to play.' : 'Sign in to play.'}</p>
              {error ? <p className="account-error">{error}</p> : null}
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
              ) : (
                <p>No email needed.</p>
              )}
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
              {onBack ? (
                <button type="button" className="account-switch" onClick={onBack}>
                  Back
                </button>
              ) : null}
              {mode === 'in' ? <ForgotPasswordNote /> : null}
            </>
          )}
        </form>
      </div>
    </main>
  )
}
