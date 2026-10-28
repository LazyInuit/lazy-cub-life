import landingUrl from '../assets/home/landing.jpg'
import { DEMO_CASH } from '../game/demo'
import { SiteLinks } from './AccountGate'

type Props = {
  notice?: string | null
  onCreate: () => void
  onSignIn: () => void
  onDemo: () => void
}

/** First stop for anyone not signed in: make an account, sign in, or try the demo. */
export function DemoChoice({ notice = null, onCreate, onSignIn, onDemo }: Props) {
  return (
    <main className="phone landing-screen demo-choice">
      <img className="landing-art" src={landingUrl} alt="" />
      <div className="demo-choice-card">
        <h1>Welcome to Lazy Cub Life</h1>
        {notice ? <p className="account-error">{notice}</p> : null}
        <button type="button" className="demo-choice-login" onClick={onSignIn}>
          Existing user login
        </button>
        <button type="button" className="demo-choice-create" onClick={onCreate}>
          Create an account
          <span>Save your cub, earn Cub Cash, and climb the leaderboards</span>
        </button>
        <button type="button" className="demo-choice-demo" onClick={onDemo}>
          Play demo version
          <span>Try everything with {DEMO_CASH.toLocaleString('en-US')} demo coins. Nothing is saved.</span>
        </button>
        <SiteLinks />
      </div>
    </main>
  )
}
