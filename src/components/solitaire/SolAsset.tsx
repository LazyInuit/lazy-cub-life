import { useState, type CSSProperties, type ReactNode } from 'react'
import { SOLITAIRE_ASSETS, solitaireAsset, type SolitaireAssetName } from '../../game/solitaire/theme'

type Props = {
  name: SolitaireAssetName
  /** Shown when the artwork has not been added yet, or fails to load. */
  fallback: ReactNode
  className?: string
  style?: CSSProperties
  alt?: string
}

/** One replaceable picture: the artwork if it exists, otherwise the placeholder. */
export function SolAsset({ name, fallback, className, style, alt = '' }: Props) {
  const url = solitaireAsset(SOLITAIRE_ASSETS[name].file)
  const [broken, setBroken] = useState(false)
  if (!url || broken) return <>{fallback}</>
  return (
    <img
      className={className}
      style={style}
      src={url}
      alt={alt}
      draggable={false}
      onError={() => setBroken(true)}
    />
  )
}

/** True once a piece of artwork has been added, for styling that changes with real art. */
export function hasSolAsset(name: SolitaireAssetName) {
  return solitaireAsset(SOLITAIRE_ASSETS[name].file) !== null
}
