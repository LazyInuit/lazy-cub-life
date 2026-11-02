import { useId, useState } from 'react'

type Props = {
  title?: string
  sub?: string
  onOpen: () => void
  className?: string
}

/** The gold-framed leaderboard button with the trophy and podium, shared by every leaderboard entrance. */
export function LeaderboardOpenButton({ title = 'Leaderboards', sub = 'Weekly • All-Time • Global Rankings', onOpen, className = '' }: Props) {
  const [pressed, setPressed] = useState(false)
  const id = useId()
  return (
    <button
      type="button"
      className={`leaderboard-open${pressed ? ' is-pressed' : ''}${className ? ` ${className}` : ''}`}
      onPointerDown={() => setPressed(true)}
      onPointerCancel={() => setPressed(false)}
      onClick={() =>
        window.setTimeout(() => {
          setPressed(false)
          onOpen()
        }, 110)
      }
    >
      <span className="leaderboard-open-shine" aria-hidden="true" />
      <span className="leaderboard-open-face">
        <span className="leaderboard-open-trophy" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M7.2 3.5h9.6v2.4c0 3.1-1.9 5.4-4.8 6-2.9-.6-4.8-2.9-4.8-6V3.5z" fill="#fffaf2" stroke="#6a3c12" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M7.2 5.4H5.2c-.9 0-1.5.6-1.5 1.5 0 1.7 1.3 3 3.2 3.2" stroke="#6a3c12" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M16.8 5.4h2c.9 0 1.5.6 1.5 1.5 0 1.7-1.3 3-3.2 3.2" stroke="#6a3c12" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M12 12v2.4" stroke="#6a3c12" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M8.2 16.6h7.6c.5 1.1.2 2.2-1.4 2.2H9.6c-1.6 0-1.9-1.1-1.4-2.2z" fill="#fffaf2" stroke="#6a3c12" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="leaderboard-open-copy">
          <span className="leaderboard-open-title">{title}</span>
          <span className="leaderboard-open-sub">{sub}</span>
        </span>
        <span className="leaderboard-open-podium" aria-hidden="true">
          <svg viewBox="0 0 48 32">
            <defs>
              <linearGradient id={`${id}-silver`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f7f9fc" />
                <stop offset="0.4" stopColor="#d5deea" />
                <stop offset="1" stopColor="#8e9aab" />
              </linearGradient>
              <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff0b8" />
                <stop offset="0.4" stopColor="#f0c14a" />
                <stop offset="1" stopColor="#b67a1e" />
              </linearGradient>
              <linearGradient id={`${id}-bronze`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f3c296" />
                <stop offset="0.45" stopColor="#d4894a" />
                <stop offset="1" stopColor="#8a4e22" />
              </linearGradient>
            </defs>
            <rect x="1" y="13" width="14" height="18" rx="2" fill={`url(#${id}-silver)`} stroke="#5c6b80" strokeWidth="1" />
            <text x="8" y="25" textAnchor="middle" fill="#243044" fontSize="9" fontWeight="800">2</text>
            <rect x="17" y="1" width="14" height="30" rx="2" fill={`url(#${id}-gold)`} stroke="#7a4e12" strokeWidth="1" />
            <text x="24" y="19" textAnchor="middle" fill="#5a3010" fontSize="11" fontWeight="800">1</text>
            <rect x="33" y="17" width="14" height="14" rx="2" fill={`url(#${id}-bronze)`} stroke="#6a3818" strokeWidth="1" />
            <text x="40" y="27" textAnchor="middle" fill="#4a2410" fontSize="8" fontWeight="800">3</text>
          </svg>
        </span>
      </span>
    </button>
  )
}
