/**
 * Redraws the Spellitaire screen for the replay from where its pieces are on screen: the table art, the
 * score bar, empty piles, every card in stacking order (moves, drags and flips included), and the toasts,
 * coin pops and win banner. Works for all six modes and the sideways layout alike.
 */
import type { DomCanvas, Box } from '../../game/replay/domPaint'

function opacityOf(el: Element) {
  return parseFloat(getComputedStyle(el).opacity) || 0
}

function paintSlot(dc: DomCanvas, slot: HTMLElement) {
  const { ctx } = dc
  const art = slot.querySelector<HTMLImageElement>('img')
  if (art) {
    dc.image(art)
    return
  }
  const mark = slot.firstElementChild ?? slot
  const b = dc.of(slot)
  dc.roundRect(b, (b.w / dc.scale) * 0.1)
  ctx.fillStyle = 'rgba(20, 10, 40, 0.45)'
  ctx.fill()
  ctx.setLineDash([6 * dc.scale, 4 * dc.scale])
  ctx.lineWidth = 1.5 * dc.scale
  ctx.strokeStyle = slot.classList.contains('hint-target') ? '#ffe680' : 'rgba(255, 208, 96, 0.6)'
  ctx.stroke()
  ctx.setLineDash([])
  const letter = dc.pseudoText(mark, '::after')
  if (letter) {
    ctx.fillStyle = 'rgba(255, 220, 140, 0.75)'
    ctx.font = `700 ${Math.round(b.w * (letter.length > 1 ? 0.22 : 0.4))}px Fredoka, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(letter, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.9)
  }
}

/** Number-card faces already drawn, kept per face element and size. */
const faceCache = new WeakMap<Element, { w: number; h: number; canvas: HTMLCanvasElement }>()

function paintCard(dc: DomCanvas, card: HTMLElement, rect: DOMRect) {
  const { ctx } = dc
  const b = dc.box(rect)
  if (b.w < 1) return
  const radius = (b.w / dc.scale) * 0.1
  const face = card.firstElementChild as HTMLElement | null
  // During a flip only the face squeezes, so it is drawn where it is now; otherwise it fills the card.
  const flipping = card.classList.contains('flipping')
  const at: Box = face && flipping ? dc.of(face) : b
  // Text spots are measured once per card size and reused, except mid-flip when they move.
  const anchor = flipping ? undefined : rect
  ctx.save()
  dc.roundRect(b, radius)
  ctx.clip()
  if (face instanceof HTMLImageElement) dc.image(face, at)
  else if (face?.classList.contains('sol-face')) {
    const w = Math.round(b.w)
    const h = Math.round(b.h)
    const saved = faceCache.get(face)
    if (!flipping && saved && saved.w === w && saved.h === h) ctx.drawImage(saved.canvas, b.x, b.y, b.w, b.h)
    else {
      ctx.fillStyle = '#fbf6ea'
      ctx.fillRect(b.x, b.y, b.w, b.h)
      dc.image(face.querySelector<HTMLImageElement>('.sol-face-bg'), at)
      for (const corner of face.querySelectorAll('.sol-corner')) dc.allText(corner, { flip: corner.classList.contains('sol-corner-low'), shadow: false, anchor })
      dc.allText(face.querySelector('.sol-pip'), { shadow: false, anchor })
      // A number card's face never changes, so it is kept as a picture and stamped from then on.
      const onCanvas = b.x >= 0 && b.y >= 0 && b.x + b.w <= dc.canvas.width && b.y + b.h <= dc.canvas.height
      if (!flipping && onCanvas && w > 0 && h > 0) {
        const canvas = saved?.canvas ?? document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')?.drawImage(dc.canvas, b.x, b.y, b.w, b.h, 0, 0, w, h)
        faceCache.set(face, { w, h, canvas })
      }
    }
  } else {
    // The plain back, where no card-back art exists.
    ctx.fillStyle = '#3a1f6b'
    ctx.fillRect(b.x, b.y, b.w, b.h)
  }
  if (card.classList.contains('covered')) {
    ctx.fillStyle = 'rgba(10, 4, 24, 0.4)'
    ctx.fillRect(b.x, b.y, b.w, b.h)
  }
  ctx.restore()
  if (card.classList.contains('selected') || card.classList.contains('glow') || card.classList.contains('hinted')) {
    dc.roundRect(b, radius)
    ctx.lineWidth = 3 * dc.scale
    ctx.strokeStyle = '#ffd84a'
    ctx.stroke()
  } else if (card.classList.contains('denied-a') || card.classList.contains('denied-b')) {
    dc.roundRect(b, radius)
    ctx.lineWidth = 3 * dc.scale
    ctx.strokeStyle = '#ff5a5a'
    ctx.stroke()
  }
  const value = card.querySelector('.sol-card-value')
  if (value) dc.text(value, { shadow: false, anchor })
}

/** True when `top` hides all of `under`, as in a stacked stock or a finished pile. */
function covers(top: DOMRect, under: DOMRect) {
  return top.left <= under.left + 0.5 && top.top <= under.top + 0.5 && top.right >= under.right - 0.5 && top.bottom >= under.bottom - 0.5
}

function paintControl(dc: DomCanvas, button: HTMLElement) {
  const { ctx } = dc
  const b = dc.of(button)
  ctx.save()
  if (button.matches(':disabled')) ctx.globalAlpha = 0.42
  const art = button.querySelector<HTMLImageElement>('.sol-control-bg')
  if (art) dc.image(art)
  else {
    dc.roundRect(b, 12)
    ctx.fillStyle = '#4b2a86'
    ctx.fill()
    ctx.lineWidth = 2 * dc.scale
    ctx.strokeStyle = '#ffd060'
    ctx.stroke()
  }
  const icon = button.querySelector<HTMLElement>('.sol-control-icon, .sol-control-ph')
  if (icon instanceof HTMLImageElement) dc.image(icon)
  else if (icon) {
    const glyph = dc.pseudoText(icon, '::before')
    if (glyph) {
      const ib = dc.of(icon)
      ctx.fillStyle = '#ffe08a'
      ctx.font = `700 ${Math.round(Math.min(ib.w, ib.h) * 0.8)}px Fredoka, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(glyph, ib.x + ib.w / 2, ib.y + ib.h / 2)
    }
  }
  dc.text(button.querySelector('.sol-control-label'))
  ctx.restore()
}

export function paintSpellitaire(dc: DomCanvas, screen: HTMLElement): HTMLCanvasElement | null {
  if (!dc.begin(screen)) return null
  const { ctx, canvas } = dc
  ctx.fillStyle = '#150a26'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  dc.image(screen.querySelector<HTMLImageElement>('.sol-art-img'))
  for (const value of screen.querySelectorAll('.sol-art-value')) dc.text(value)

  const board = screen.querySelector('.sol-board')
  if (board) {
    for (const slot of board.querySelectorAll<HTMLElement>('.sol-slot')) paintSlot(dc, slot)
    // Cards stack by their z-index, not by page order (the stock comes first in the page but sits low).
    const cards = [...board.querySelectorAll<HTMLElement>('.sol-card')]
      .map((card, order) => ({ card, order, z: Number(card.style.zIndex) || 0, rect: card.getBoundingClientRect() }))
      .sort((a, b) => a.z - b.z || a.order - b.order)
    for (let i = 0; i < cards.length; i += 1) {
      const { card, rect } = cards[i]
      // Cards wholly hidden by one drawn later (above) are skipped; Spider's stock alone is 50 of them.
      let hidden = false
      for (let j = i + 1; j < cards.length && !hidden; j += 1) {
        const above = cards[j].card
        if (above.classList.contains('flipping') || above.classList.contains('dragging')) continue
        hidden = covers(cards[j].rect, rect)
      }
      if (!hidden) paintCard(dc, card, rect)
    }

    for (const note of board.querySelectorAll('.sol-table-note span')) dc.text(note)
    const count = board.querySelector('.sol-stock-count span')
    if (count) {
      const b = dc.of(count)
      dc.roundRect(b, b.h / 2 / dc.scale)
      ctx.fillStyle = 'rgba(20, 8, 40, 0.85)'
      ctx.fill()
      dc.text(count, { shadow: false })
    }
    for (const pop of board.querySelectorAll<HTMLElement>('.sol-coin-pop')) {
      ctx.save()
      ctx.globalAlpha = opacityOf(pop)
      dc.image(pop.querySelector('img'))
      dc.text(pop.querySelector('span'))
      ctx.restore()
    }
  }

  for (const button of screen.querySelectorAll<HTMLElement>('.sol-controls .sol-control')) paintControl(dc, button)

  const toast = screen.querySelector('.sol-toast')
  if (toast) {
    const b = dc.of(toast)
    ctx.save()
    ctx.globalAlpha = opacityOf(toast)
    dc.roundRect(b, 14)
    ctx.fillStyle = 'rgba(28, 12, 52, 0.92)'
    ctx.fill()
    dc.text(toast)
    ctx.restore()
  }
  const banner = screen.querySelector<HTMLImageElement>('.sol-win-img')
  if (banner) {
    ctx.save()
    ctx.globalAlpha = opacityOf(banner)
    dc.image(banner)
    ctx.restore()
  }
  return canvas
}
