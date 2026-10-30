import type { ReactNode } from 'react'
import cubPowerUiUrl from '../assets/home/cub-power-plate.png'
import { multiplierText } from './CubPowerPanel'

type Props = {
  /** The Cub Power figure, or a short word such as "Sign up". */
  value: string
  /** Login streak multiplier as a whole percentage: 100 to 135. */
  multiplier: number
  label: string
  className?: string
  /** Shrinks the value to fit a word rather than a number. */
  wordy?: boolean
  onClick?: () => void
  children?: ReactNode
}

/** The Cub Power artwork with the total and streak multiplier in its two bars. */
export function PowerPlate({ value, multiplier, label, className = '', wordy = false, onClick, children }: Props) {
  const inner = (
    <>
      <img src={cubPowerUiUrl} alt="" />
      <span className={wordy ? 'power-plate-total power-plate-signup' : 'power-plate-total'}>{value}</span>
      <span className="power-plate-mult">{multiplierText(multiplier)}</span>
      {children}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className={`power-plate ${className}`} onClick={onClick} aria-label={label}>
        {inner}
      </button>
    )
  }
  return (
    <div className={`power-plate ${className}`} role="img" aria-label={label}>
      {inner}
    </div>
  )
}
