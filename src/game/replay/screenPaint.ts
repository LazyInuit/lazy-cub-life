/**
 * For canvas games whose score, time and lives sit in a page bar above the play area (Lazy Hoops, Cupid
 * Archery, Ninja Cub Dojo, Kovu's Space Dash): records the whole game screen rather than the canvas alone.
 * Each frame the bar is redrawn (background, text, images and SVG hearts), the game canvas is drawn where
 * it sits, and any page pop-ups over it (toasts, coins) on top. Call it right after the game draws, since
 * a WebGL canvas can only be read in the same frame.
 */
import { DomCanvas, type Box } from './domPaint'
import { captureReplay, notePaintMs, replayFrameDue } from './recorder'

export type ScreenParts = {
  screen: HTMLElement | null
  /** The bar above the play area. */
  bar: HTMLElement | null
  canvas: HTMLCanvasElement | null
  /** The screen's own background, behind everything. */
  screenColour: string
  /** The bar's background, top to bottom. */
  barColours: string[]
  /** Corner radius and edge colour, for a bar drawn as a rounded panel. */
  barRadius?: number
  barEdge?: string
  /** Page elements over the play area to copy, as a CSS selector within the screen. */
  overlays?: string
}

const painters = new WeakMap<HTMLElement, DomCanvas>()

function opacityOf(el: Element) {
  return parseFloat(getComputedStyle(el).opacity) || 0
}

/** Draws an inline SVG's paths where it sits. Gradient fills use their first colour. */
function paintSvg(dc: DomCanvas, svg: SVGSVGElement) {
  const { ctx } = dc
  const box = dc.of(svg)
  const view = svg.viewBox.baseVal
  if (!view || view.width === 0 || box.w < 1) return
  // A heart in a "life" slot that is not on is drawn dark, as the page greys it out.
  const slot = svg.closest('[class*="life"]')
  const spent = slot ? !slot.classList.contains('on') : false
  ctx.save()
  ctx.globalAlpha *= slot ? opacityOf(slot) || 1 : 1
  ctx.translate(box.x, box.y)
  ctx.scale(box.w / view.width, box.h / view.height)
  ctx.translate(-view.x, -view.y)
  for (const path of svg.querySelectorAll('path')) {
    const d = path.getAttribute('d')
    if (!d) continue
    const shape = new Path2D(d)
    let fill = path.getAttribute('fill') ?? '#000'
    const ref = /^url\(#(.+)\)$/.exec(fill)
    if (ref) fill = svg.querySelector(`[id="${ref[1]}"] stop`)?.getAttribute('stop-color') ?? '#e03131'
    if (fill !== 'none') {
      ctx.fillStyle = spent ? '#4a3a30' : fill
      ctx.fill(shape)
    }
    const stroke = path.getAttribute('stroke')
    if (stroke && stroke !== 'none') {
      const strokeRef = /^url\(#(.+)\)$/.exec(stroke)
      ctx.strokeStyle = strokeRef ? (svg.querySelector(`[id="${strokeRef[1]}"] stop`)?.getAttribute('stop-color') ?? '#ffd43b') : stroke
      ctx.lineWidth = parseFloat(path.getAttribute('stroke-width') ?? '1') || 1
      if (spent) ctx.globalAlpha *= 0.5
      ctx.stroke(shape)
    }
  }
  ctx.restore()
}

function paintBar(dc: DomCanvas, parts: ScreenParts, bar: HTMLElement) {
  const { ctx } = dc
  const b: Box = dc.of(bar)
  const fill = ctx.createLinearGradient(0, b.y, 0, b.y + b.h)
  parts.barColours.forEach((colour, i) => fill.addColorStop(parts.barColours.length > 1 ? i / (parts.barColours.length - 1) : 0, colour))
  dc.roundRect(b, parts.barRadius ?? 0)
  ctx.fillStyle = fill
  ctx.fill()
  if (parts.barEdge) {
    ctx.lineWidth = 1.5 * dc.scale
    ctx.strokeStyle = parts.barEdge
    ctx.stroke()
  }
  // The Home and Games buttons are left out: they are for the player, not the viewer. Without them the
  // rest of the bar (scores, time, lives) is moved to the middle, so the left side is not left empty.
  const shown = [...bar.children].filter((child) => !child.querySelector('.game-home') && !child.classList.contains('game-home'))
  let left = Infinity
  let right = -Infinity
  for (const child of shown) {
    const r = child.getBoundingClientRect()
    if (r.width < 1) continue
    left = Math.min(left, r.left)
    right = Math.max(right, r.right)
  }
  ctx.save()
  if (right > left) {
    const content = dc.box({ left, top: 0, width: right - left, height: 0 })
    ctx.translate(b.x + b.w / 2 - (content.x + content.w / 2), 0)
  }
  for (const img of bar.querySelectorAll<HTMLImageElement>('img')) {
    if (img.closest('.game-home')) continue
    dc.image(img)
  }
  for (const svg of bar.querySelectorAll<SVGSVGElement>('svg')) {
    if (svg.closest('.game-home')) continue
    paintSvg(dc, svg)
  }
  for (const el of bar.querySelectorAll('*')) {
    if (el.closest('.game-home') || el.closest('svg')) continue
    dc.text(el)
  }
  ctx.restore()
}

/** Records one frame of the whole game screen, if the replay wants a frame now. */
export function captureScreen(parts: ScreenParts) {
  const { screen, canvas } = parts
  if (!screen || !canvas || !replayFrameDue()) return
  const began = performance.now()
  let dc = painters.get(screen)
  if (!dc) {
    dc = new DomCanvas()
    painters.set(screen, dc)
  }
  if (!dc.begin(screen)) return
  const { ctx } = dc
  ctx.fillStyle = parts.screenColour
  ctx.fillRect(0, 0, dc.canvas.width, dc.canvas.height)
  const play = dc.of(canvas)
  if (play.w > 0 && play.h > 0) ctx.drawImage(canvas, play.x, play.y, play.w, play.h)
  if (parts.bar) paintBar(dc, parts, parts.bar)
  if (parts.overlays) {
    for (const el of screen.querySelectorAll(parts.overlays)) {
      ctx.save()
      ctx.globalAlpha = opacityOf(el)
      if (el instanceof HTMLImageElement) dc.image(el)
      else dc.allText(el)
      ctx.restore()
    }
  }
  notePaintMs(performance.now() - began)
  captureReplay(dc.canvas)
}
