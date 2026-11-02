import { levelProgress } from '../game/progress'

/** The highest level a cub can reach. */
const MAX_LEVEL = 99

const xpText = (xp: number) => (Number.isInteger(xp) ? xp : Math.round(xp * 10) / 10).toLocaleString('en-US')

/** Opened from the level badge: total XP, progress through this level, and XP to the next one. */
export function LevelInfoPop({ xp, onClose }: { xp: number; onClose: () => void }) {
  const { level, into, next } = levelProgress(xp)
  const top = level >= MAX_LEVEL
  const left = Math.max(0, next - into)
  return (
    <div className="energy-pop" role="presentation" onClick={onClose}>
      <div
        className="energy-pop-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-pop-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="energy-pop-face level-pop">
          <h2 id="level-pop-title">Level {level}</h2>
          <dl className="level-pop-stats">
            <div>
              <dt>Total XP</dt>
              <dd>{xpText(xp)}</dd>
            </div>
            {top ? null : (
              <>
                <div>
                  <dt>This level</dt>
                  <dd>
                    {xpText(into)} / {xpText(next)}
                  </dd>
                </div>
                <div>
                  <dt>To level {level + 1}</dt>
                  <dd>{xpText(left)} XP</dd>
                </div>
              </>
            )}
          </dl>
          {top ? (
            <p>Top level reached!</p>
          ) : (
            <div className="level-pop-meter" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (into / next) * 100)}%` }} />
            </div>
          )}
          <p className="level-pop-tip">Earn XP by playing games and looking after your cub.</p>
          <button type="button" className="energy-pop-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
