import { aimDots, pullPower } from './engine'
import { CUB_SRC, cubRect } from './layout'
import type { ArcherRound } from './types'

function cover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  w: number,
  h: number,
) {
  const scale = Math.max(w / image.width, h / image.height)
  const dw = image.width * scale
  const dh = image.height * scale
  ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

/** Same heart path as the lives HUD (viewBox 0 0 32 30). */
const LIFE_HEART =
  'M16 27.2C16 27.2 3.2 19.4 3.2 10.6 3.2 6.4 6.4 3.5 10.2 3.5c2.4 0 4.5 1.2 5.8 3.1C17.3 4.7 19.4 3.5 21.8 3.5c3.8 0 7 2.9 7 7.1 0 8.8-12.8 16.6-12.8 16.6z'
const LIFE_HEART_SHINE = 'M9.2 8.2c1.4-1.5 3.4-1.7 4.2-.6'

function drawLifeHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  // size ≈ half-width; viewBox is 32×30 centered at (16, 15)
  const scale = (size * 2) / 30
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.translate(-16, -15)

  const body = new Path2D(LIFE_HEART)
  const fill = ctx.createLinearGradient(16, 3.5, 16, 27.2)
  fill.addColorStop(0, '#ff6b6b')
  fill.addColorStop(0.45, '#e03131')
  fill.addColorStop(1, '#c92a2a')
  ctx.fillStyle = fill
  ctx.fill(body)

  const stroke = ctx.createLinearGradient(3.2, 3.5, 28.8, 27.2)
  stroke.addColorStop(0, '#fff3bf')
  stroke.addColorStop(0.4, '#ffd43b')
  stroke.addColorStop(1, '#e67700')
  ctx.strokeStyle = stroke
  ctx.lineWidth = 2.2
  ctx.lineJoin = 'round'
  ctx.stroke(body)

  ctx.strokeStyle = 'rgba(255, 227, 227, 0.85)'
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  ctx.stroke(new Path2D(LIFE_HEART_SHINE))
  ctx.restore()
}

function drawTarget(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  // Matches scoring zones: cream (white) → blue → gold → red heart.
  const rings = [
    { s: 1, fill: '#fff4e8', stroke: '#d9c4a8' },
    { s: 0.62, fill: '#7ebae8', stroke: '#4a8fc4' },
    { s: 0.28, fill: '#f0c14a', stroke: '#c9922a' },
  ]

  // Soft glow around the outside of the target.
  const glow = ctx.createRadialGradient(x, y, r * 0.85, x, y, r * 1.45)
  glow.addColorStop(0, 'rgba(255, 180, 200, 0.55)')
  glow.addColorStop(0.45, 'rgba(255, 210, 140, 0.28)')
  glow.addColorStop(1, 'rgba(255, 210, 140, 0)')
  ctx.beginPath()
  ctx.arc(x, y, r * 1.45, 0, Math.PI * 2)
  ctx.fillStyle = glow
  ctx.fill()

  ctx.save()
  ctx.shadowColor = 'rgba(255, 140, 170, 0.55)'
  ctx.shadowBlur = Math.max(10, r * 0.35)
  ctx.beginPath()
  ctx.arc(x, y, r + 1, 0, Math.PI * 2)
  ctx.fillStyle = '#e8d4c0'
  ctx.fill()
  ctx.restore()

  for (const ring of rings) {
    const rr = r * ring.s
    ctx.beginPath()
    ctx.arc(x, y, rr, 0, Math.PI * 2)
    ctx.fillStyle = ring.fill
    ctx.fill()
    // Soft inset edge so rings read as separate score bands.
    ctx.lineWidth = Math.max(2, r * 0.028)
    ctx.strokeStyle = ring.stroke
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y - rr * 0.08, rr * 0.92, Math.PI * 1.05, Math.PI * 1.95)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.lineWidth = Math.max(1.5, r * 0.02)
    ctx.stroke()
  }

  // Same heart as the lives HUD, sized to the red hit zone.
  const redR = Math.max(5, r * 0.18)
  drawLifeHeart(ctx, x, y, redR * 0.95)
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, scale: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  const len = 34 * scale
  ctx.strokeStyle = '#8a4b22'
  ctx.lineWidth = 3 * scale
  ctx.beginPath()
  ctx.moveTo(-len * 0.45, 0)
  ctx.lineTo(len * 0.35, 0)
  ctx.stroke()
  ctx.fillStyle = '#f2d48a'
  ctx.beginPath()
  ctx.moveTo(len * 0.55, 0)
  ctx.lineTo(len * 0.28, -5 * scale)
  ctx.lineTo(len * 0.28, 5 * scale)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#d64545'
  ctx.beginPath()
  ctx.moveTo(-len * 0.45, 0)
  ctx.lineTo(-len * 0.7, -6 * scale)
  ctx.lineTo(-len * 0.55, 0)
  ctx.lineTo(-len * 0.7, 6 * scale)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawBullBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  scale: number,
) {
  const alpha = Math.max(0, 1 - t)
  ctx.save()
  // Expanding gold + red rings
  for (let i = 0; i < 3; i++) {
    const r = (18 + t * (70 + i * 28) + i * 10) * scale
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.strokeStyle =
      i % 2 === 0
        ? `rgba(255, 215, 90, ${alpha * (0.95 - i * 0.2)})`
        : `rgba(255, 70, 90, ${alpha * (0.85 - i * 0.18)})`
    ctx.lineWidth = Math.max(2, (4 - i) * scale)
    ctx.stroke()
  }
  // Spark rays
  const rays = 10
  for (let i = 0; i < rays; i++) {
    const ang = (i / rays) * Math.PI * 2 + t * 1.2
    const inner = (8 + t * 12) * scale
    const outer = (28 + t * 90) * scale
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(ang) * inner, y + Math.sin(ang) * inner)
    ctx.lineTo(x + Math.cos(ang) * outer, y + Math.sin(ang) * outer)
    ctx.strokeStyle = i % 2 === 0 ? `rgba(255, 230, 120, ${alpha * 0.9})` : `rgba(255, 90, 110, ${alpha * 0.75})`
    ctx.lineWidth = Math.max(1.5, 2.4 * scale)
    ctx.stroke()
  }
  // Soft core bloom
  const bloom = ctx.createRadialGradient(x, y, 0, x, y, 36 * scale * (1 + t))
  bloom.addColorStop(0, `rgba(255, 250, 200, ${alpha * 0.85})`)
  bloom.addColorStop(0.45, `rgba(255, 80, 100, ${alpha * 0.35})`)
  bloom.addColorStop(1, 'rgba(255, 80, 100, 0)')
  ctx.fillStyle = bloom
  ctx.beginPath()
  ctx.arc(x, y, 36 * scale * (1 + t), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function drawArcherFrame(
  ctx: CanvasRenderingContext2D,
  round: ArcherRound,
  background: HTMLImageElement | null,
  cub: HTMLImageElement | null,
) {
  const { w, h } = round
  ctx.clearRect(0, 0, w, h)
  if (background && background.complete && background.naturalWidth > 0) {
    cover(ctx, background, w, h)
  } else {
    ctx.fillStyle = '#87b8e8'
    ctx.fillRect(0, 0, w, h)
  }

  const scale = Math.min(w, h) / 780
  if (cub && cub.complete && cub.naturalWidth > 0) {
    const box = cubRect(w, h)
    ctx.drawImage(cub, CUB_SRC.x, CUB_SRC.y, CUB_SRC.w, CUB_SRC.h, box.x, box.y, box.w, box.h)
  }

  drawTarget(ctx, round.target.x, round.target.y, round.target.r)

  if (round.arrow) {
    drawArrow(ctx, round.arrow.x, round.arrow.y, Math.atan2(round.arrow.vy, round.arrow.vx), scale)
  }

  if (round.flash > 0) {
    ctx.fillStyle = `rgba(255, 236, 170, ${round.flash * 0.35})`
    ctx.fillRect(0, 0, w, h)
  }
  if (round.bullFlash > 0) {
    const t = round.bullFlash / 0.55
    ctx.fillStyle = `rgba(255, 70, 90, ${t * 0.28})`
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = `rgba(255, 220, 120, ${t * 0.18})`
    ctx.fillRect(0, 0, w, h)
  }

  for (const burst of round.bursts) {
    drawBullBurst(ctx, burst.x, burst.y, 1 - burst.life / burst.maxLife, scale)
  }

  ctx.font = `800 ${Math.max(18, 22 * scale)}px Nunito, sans-serif`
  ctx.textAlign = 'center'
  for (const pop of round.pops) {
    const maxLife = pop.bull ? 1.15 : 0.85
    const age = 1 - Math.max(0, Math.min(1, pop.life / maxLife))
    ctx.globalAlpha = Math.max(0, Math.min(1, pop.life > 0.2 ? 1 : pop.life / 0.2))
    const y = pop.y - age * (pop.bull ? 56 : 36)
    if (pop.bull) {
      ctx.font = `900 ${Math.max(22, 30 * scale)}px Nunito, sans-serif`
      ctx.fillStyle = '#ffe566'
      ctx.strokeStyle = 'rgba(120, 20, 30, 0.9)'
      ctx.lineWidth = 5
    } else {
      ctx.font = `800 ${Math.max(18, 22 * scale)}px Nunito, sans-serif`
      ctx.fillStyle = '#fffaf2'
      ctx.strokeStyle = 'rgba(40, 22, 8, 0.75)'
      ctx.lineWidth = 4
    }
    ctx.strokeText(pop.text, pop.x, y)
    ctx.fillText(pop.text, pop.x, y)
    ctx.globalAlpha = 1
  }

  const pull = pullPower(round)
  if (pull && pull.dist >= 8) {
    const dots = aimDots(round)
    ctx.fillStyle = 'rgba(255, 250, 236, 0.92)'
    dots.forEach((dot, i) => {
      const last = i === dots.length - 1
      const radius = (last ? 6.5 : Math.max(2.5, 5.2 - i * 0.22)) * scale
      ctx.beginPath()
      ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2)
      ctx.fill()
      if (last) {
        ctx.strokeStyle = 'rgba(255, 220, 120, 0.95)'
        ctx.lineWidth = Math.max(1.5, 2 * scale)
        ctx.stroke()
      }
    })
    const rot = Math.atan2(pull.vy, pull.vx)
    drawArrow(ctx, pull.ox + Math.cos(rot) * 18, pull.oy + Math.sin(rot) * 18, rot, scale)
    ctx.strokeStyle = 'rgba(255, 244, 214, 0.85)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 5])
    ctx.beginPath()
    ctx.moveTo(pull.ox, pull.oy)
    ctx.lineTo(round.pullX, round.pullY)
    ctx.stroke()
    ctx.setLineDash([])
  }
}
