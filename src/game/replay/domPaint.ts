/**
 * For games built from page elements rather than a canvas (Pride Pairs, Spellitaire): a canvas the
 * replay can record, redrawn from where the game's elements are on screen. Each game paints its own
 * pieces with these helpers; positions come from getBoundingClientRect, so moves and drags show as they
 * animate. Only same-origin images are drawn, so the canvas stays readable.
 */
import { useEffect, useRef } from 'react'
import { captureReplay, notePaintMs, replayFrameDue } from './recorder'

export type Box = { x: number; y: number; w: number; h: number }

type TextStyle = { font: string; size: number; color: string; upper: boolean; shadow: string; at: number }

/** How long a text style read from the page is reused before it is read again. */
const STYLE_TTL = 1000

export class DomCanvas {
  readonly canvas = document.createElement('canvas')
  readonly ctx: CanvasRenderingContext2D
  private originX = 0
  private originY = 0
  scale = 1
  private styles = new WeakMap<Element, TextStyle>()
  private now = 0

  constructor() {
    const ctx = this.canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('No 2D canvas')
    this.ctx = ctx
  }

  /** Sizes the canvas to `root` (at most 720 wide) and starts a frame. False if `root` has no size. */
  begin(root: Element, maxWidth = 720): boolean {
    const rect = root.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return false
    this.originX = rect.left
    this.originY = rect.top
    this.scale = Math.min(2.5, maxWidth / rect.width)
    const w = Math.round(rect.width * this.scale)
    const h = Math.round(rect.height * this.scale)
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.now = performance.now()
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    return true
  }

  /** Where a page rectangle is on the canvas. */
  box(rect: { left: number; top: number; width: number; height: number }): Box {
    return { x: (rect.left - this.originX) * this.scale, y: (rect.top - this.originY) * this.scale, w: rect.width * this.scale, h: rect.height * this.scale }
  }

  of(el: Element): Box {
    return this.box(el.getBoundingClientRect())
  }

  roundRect(b: Box, radius: number) {
    const ctx = this.ctx
    const r = Math.max(0, Math.min(radius * this.scale, b.w / 2, b.h / 2))
    ctx.beginPath()
    ctx.roundRect(b.x, b.y, b.w, b.h, r)
  }

  /** Draws an image element where it sits, if it has loaded. */
  image(img: HTMLImageElement | null | undefined, b?: Box) {
    if (!img || !img.complete || !img.naturalWidth) return
    const at = b ?? this.of(img)
    if (at.w < 1 || at.h < 1) return
    this.ctx.drawImage(img, at.x, at.y, at.w, at.h)
  }

  private style(el: Element): TextStyle {
    const cached = this.styles.get(el)
    if (cached && this.now - cached.at < STYLE_TTL) return cached
    const cs = getComputedStyle(el)
    const size = parseFloat(cs.fontSize) || 14
    const style: TextStyle = {
      font: `${cs.fontStyle === 'italic' ? 'italic ' : ''}${cs.fontWeight} ${size}px ${cs.fontFamily}`,
      size,
      color: cs.color,
      upper: cs.textTransform === 'uppercase',
      shadow: cs.textShadow,
      at: this.now,
    }
    this.styles.set(el, style)
    return style
  }

  private textSpots = new WeakMap<Node, { anchorW: number; anchorH: number; x: number; y: number; w: number; h: number }>()

  /** Where a text node is on the page. With an anchor (its card), the spot is measured once and reused. */
  private textRect(node: Node, anchor?: DOMRect): { left: number; top: number; width: number; height: number } {
    if (anchor) {
      const spot = this.textSpots.get(node)
      if (spot && Math.abs(spot.anchorW - anchor.width) < 0.5 && Math.abs(spot.anchorH - anchor.height) < 0.5) {
        return { left: anchor.left + spot.x, top: anchor.top + spot.y, width: spot.w, height: spot.h }
      }
    }
    const range = document.createRange()
    range.selectNodeContents(node)
    const rect = range.getBoundingClientRect()
    if (anchor && rect.width > 0) {
      this.textSpots.set(node, { anchorW: anchor.width, anchorH: anchor.height, x: rect.left - anchor.left, y: rect.top - anchor.top, w: rect.width, h: rect.height })
    }
    return rect
  }

  /**
   * Draws the text directly inside `el` (not its children's) where the page shows it, in the page's
   * font and colour. `flip` draws it upside down, for the low card corners. `anchor` is the box of
   * something the text never moves within (a card), so its spot need only be measured once.
   */
  text(el: Element | null | undefined, options: { flip?: boolean; shadow?: boolean; anchor?: DOMRect } = {}) {
    if (!el) return
    const ctx = this.ctx
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue
      const raw = node.textContent?.trim()
      if (!raw) continue
      const rect = this.textRect(node, options.anchor)
      if (rect.width < 0.5 || rect.height < 0.5) continue
      const b = this.box(rect)
      const style = this.style(el)
      const text = style.upper ? raw.toUpperCase() : raw
      ctx.save()
      ctx.font = style.font.replace(`${style.size}px`, `${style.size * this.scale}px`)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2)
      if (options.flip) ctx.rotate(Math.PI)
      if (options.shadow !== false && style.shadow && style.shadow !== 'none') {
        ctx.fillStyle = 'rgba(30, 18, 6, 0.55)'
        ctx.fillText(text, 0, 1.5 * this.scale, Math.max(1, b.w * 1.05))
      }
      ctx.fillStyle = style.color
      // Squeezed to the space the page gives it, so wrapped or substituted-font text stays inside.
      ctx.fillText(text, 0, 0, Math.max(1, b.w * 1.05))
      ctx.restore()
    }
  }

  /** A pseudo-element's `content` text (such as a slot's "A"), read once per element and remembered. */
  pseudoText(el: Element, which: '::before' | '::after'): string {
    const key = which === '::before' ? this.beforeText : this.afterText
    let text = key.get(el)
    if (text === undefined) {
      const content = getComputedStyle(el, which).content
      text = content && content !== 'none' && content !== 'normal' ? content.replace(/^["']|["']$/g, '') : ''
      key.set(el, text)
    }
    return text
  }

  private beforeText = new WeakMap<Element, string>()
  private afterText = new WeakMap<Element, string>()

  /** `text` for `el` and every element inside it. */
  allText(el: Element | null | undefined, options: { flip?: boolean; shadow?: boolean; anchor?: DOMRect } = {}) {
    if (!el) return
    this.text(el, options)
    for (const child of el.querySelectorAll('*')) this.text(child, options)
  }
}

/**
 * While `live`, redraws the game into a canvas whenever the replay wants a frame and hands it over.
 * `paint` draws the frame and returns the canvas (or null to skip).
 */
export function useDomReplay(live: boolean, paint: () => HTMLCanvasElement | null) {
  const paintRef = useRef(paint)
  paintRef.current = paint
  useEffect(() => {
    if (!live) return
    let frame = 0
    const loop = () => {
      frame = requestAnimationFrame(loop)
      if (!replayFrameDue()) return
      try {
        const began = performance.now()
        const canvas = paintRef.current()
        notePaintMs(performance.now() - began)
        captureReplay(canvas)
      } catch {
        // A failed paint just skips this frame.
      }
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [live])
}
