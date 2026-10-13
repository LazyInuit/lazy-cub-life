import { useEffect, useState } from 'react'
import { isStandalone, pageHeightForWidth } from '../game/homeFrame'
import { roomScale, slotBox } from '../game/homeScene'

/**
 * Temporary readout for the Safari / home-screen comparison.
 * Remove once the phone confirms the game frame matches.
 */
export function LayoutProbe() {
  const [text, setText] = useState('')

  useEffect(() => {
    const tick = () => {
      const game = document.querySelector('.home-room') ?? document.querySelector('.phone')
      const rect = game?.getBoundingClientRect()
      const width = rect?.width ?? 0
      const height = rect?.height ?? 0
      const view = window.visualViewport
      const bg = width > 0 ? slotBox('background', width, height) : null
      const table = width > 0 ? slotBox('table', width, height) : null
      const cub = width > 0 ? slotBox('character', width, height) : null
      const n = (value: number) => String(Math.round(value))
      const lines = [
        `inner ${n(window.innerWidth)}×${n(window.innerHeight)}`,
        `visual ${n(view?.width ?? 0)}×${n(view?.height ?? 0)}`,
        `game ${n(width)}×${n(height)}`,
        `top ${n(rect?.top ?? 0)}`,
        `scale ${width > 0 ? roomScale(width, height).toFixed(3) : '0'}`,
        `frame ${width > 0 && width < 520 ? n(pageHeightForWidth(width)) : n(height)}`,
        `standalone ${isStandalone() ? 'yes' : 'no'}`,
        `bg ${bg ? n(bg.y) : '-'}`,
        `table ${table ? n(table.y) : '-'}`,
        `cub ${cub ? n(cub.y) : '-'}`,
      ]
      setText(lines.join('\n'))
    }
    tick()
    const id = window.setInterval(tick, 400)
    window.addEventListener('resize', tick)
    window.visualViewport?.addEventListener('resize', tick)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', tick)
      window.visualViewport?.removeEventListener('resize', tick)
    }
  }, [])

  return <pre className="layout-probe">{text}</pre>
}
