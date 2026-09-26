import controllerUrl from '../assets/controller-icon.png'

function flashPress(event: { currentTarget: HTMLElement }) {
  const button = event.currentTarget
  button.classList.remove('press-glow')
  void button.offsetWidth
  button.classList.add('press-glow')
}

function clearPressGlow(event: { currentTarget: HTMLElement }) {
  event.currentTarget.classList.remove('press-glow')
}

export function HomeButton({ className, onClick }: { className?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={className}
      aria-label="Home"
      onPointerDown={flashPress}
      onPointerUp={clearPressGlow}
      onPointerCancel={clearPressGlow}
      onClick={onClick}
    >
      <span className="wood-btn">
        <HouseIcon />
      </span>
    </button>
  )
}

export function GamesButton({ className, onClick }: { className?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={className}
      aria-label="Games"
      onPointerDown={flashPress}
      onPointerUp={clearPressGlow}
      onPointerCancel={clearPressGlow}
      onClick={onClick}
    >
      <span className="wood-btn">
        <img className="controller" src={controllerUrl} alt="" />
      </span>
    </button>
  )
}

export function HouseIcon() {
  return (
    <svg className="house" viewBox="0 0 48 48" aria-hidden="true">
      <path className="roof" d="M8 22 24 8l16 14H8z" />
      <path className="wall" d="M12 22h24v18H12z" />
      <path className="chimney" d="M31 12h5v8h-5z" />
      <path className="smoke" d="M33 10c2-3 5-2 4-5" />
      <rect className="window" x="16" y="26" width="6" height="6" rx="1" />
      <path className="door" d="M26 40V28h7v12" />
    </svg>
  )
}
