import { energyBand, PLAY_ENERGY_COST } from '../game/progress'

export function EnergyBar({ energy }: { energy: number }) {
  const percent = Math.max(0, Math.min(100, Math.round(energy)))
  const band = energyBand(percent)
  return (
    <div
      className={`shop-energy shop-energy-${band}`}
      role="meter"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Energy ${percent} percent`}
    >
      <span className="shop-energy-shine" aria-hidden="true" />
      <div className="shop-energy-face">
        <div className="shop-energy-head">
          <span className="shop-energy-name">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M9.2 1.2 3.4 9.1h3.2L6.2 14.8l6.2-8.4H9.1l.1-5.2z" />
            </svg>
            Energy
          </span>
          <span>{percent}%</span>
        </div>
        <div className="shop-energy-track">
          <span className="shop-energy-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  )
}

export function RunEnergy({ energy, onShop, cost = PLAY_ENERGY_COST }: { energy: number; onShop: () => void; cost?: number }) {
  const low = energy < cost
  return (
    <div className="run-energy">
      <EnergyBar energy={energy} />
      {low ? (
        <p className="run-energy-note">
          You need {cost} energy to play.{' '}
          <button type="button" onClick={onShop}>
            Visit the shop
          </button>{' '}
          to buy a drink and recover energy.
        </p>
      ) : null}
    </div>
  )
}
