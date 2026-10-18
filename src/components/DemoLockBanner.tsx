import { requestSignUp } from '../game/demo'

/** Shown over parts of the demo that need an account, with a way to make one. */
export function DemoLockBanner({ text }: { text: string }) {
  return (
    <div className="demo-lock-banner">
      <p>{text}</p>
      <button type="button" onClick={requestSignUp}>
        Create account
      </button>
    </div>
  )
}
