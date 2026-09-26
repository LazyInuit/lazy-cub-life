import type { DojoSprites } from './assets'
import type { EngineState } from './types'

export function drawDojoFrame(
  ctx: CanvasRenderingContext2D,
  state: EngineState,
  bg: HTMLImageElement | null,
  sprites: DojoSprites | null,
) {
  const { width, height } = state
  ctx.clearRect(0, 0, width, height)

  if (bg && bg.complete && bg.naturalWidth > 0) {
    const scale = Math.max(width / bg.naturalWidth, height / bg.naturalHeight)
    const w = bg.naturalWidth * scale
    const h = bg.naturalHeight * scale
    ctx.drawImage(bg, (width - w) / 2, (height - h) / 2, w, h)
    ctx.fillStyle = 'rgba(10, 20, 8, 0.18)'
    ctx.fillRect(0, 0, width, height)
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, height)
    g.addColorStop(0, '#3d5a40')
    g.addColorStop(1, '#1b2e1c')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, width, height)
  }

  for (const half of state.halves) {
    drawHalf(ctx, half, sprites)
  }

  for (const body of state.bodies) {
    if (!body.alive) continue
    drawBody(ctx, body, sprites)
  }

  for (const p of state.particles) {
    const a = Math.max(0, p.life / p.max)
    ctx.globalAlpha = a
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  if (state.trail.length > 1) {
    drawSilverBlade(ctx, state.trail)
  }

  for (const f of state.floats) {
    const a = Math.max(0, f.life / f.max)
    ctx.globalAlpha = a
    ctx.fillStyle = f.color
    ctx.font = '800 18px Trebuchet MS, Segoe UI, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(f.text, f.x, f.y)
    ctx.globalAlpha = 1
  }

  if (state.comboFlash) {
    const a = Math.min(1, state.comboFlash.life * 1.4)
    ctx.globalAlpha = a
    ctx.fillStyle = '#ffe066'
    ctx.strokeStyle = '#5c3416'
    ctx.lineWidth = 4
    ctx.font = '800 28px Trebuchet MS, Segoe UI, sans-serif'
    ctx.textAlign = 'center'
    ctx.strokeText(state.comboFlash.label, width / 2, height * 0.22)
    ctx.fillText(state.comboFlash.label, width / 2, height * 0.22)
    ctx.globalAlpha = 1
  }
}

function drawSilverBlade(
  ctx: CanvasRenderingContext2D,
  trail: { x: number; y: number; life: number }[],
) {
  const maxLife = 0.28
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalCompositeOperation = 'lighter'

  const layers = [
    { color: (a: number) => `rgba(140, 170, 210, ${0.12 + a * 0.28})`, width: (a: number) => 14 + a * 10 },
    { color: (a: number) => `rgba(190, 210, 230, ${0.18 + a * 0.4})`, width: (a: number) => 7 + a * 6 },
    { color: (a: number) => `rgba(255, 255, 255, ${0.35 + a * 0.65})`, width: (a: number) => 1.5 + a * 2.5 },
  ]

  for (const layer of layers) {
    for (let i = 1; i < trail.length; i += 1) {
      const a = trail[i - 1]
      const b = trail[i]
      const alpha = Math.min(a.life, b.life) / maxLife
      if (alpha <= 0.02) continue
      ctx.strokeStyle = layer.color(alpha)
      ctx.lineWidth = layer.width(alpha)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }

  const tip = trail[trail.length - 1]
  if (tip && tip.life > maxLife * 0.35) {
    const a = tip.life / maxLife
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 + a * 0.55})`
    ctx.beginPath()
    ctx.arc(tip.x, tip.y, 2 + a * 3, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.globalCompositeOperation = 'source-over'
}

function ready(img: HTMLImageElement | null | undefined): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  radius: number,
  scale = 1,
) {
  const size = radius * 2.35 * scale
  const aspect = img.naturalWidth / img.naturalHeight
  let w = size
  let h = size
  if (aspect >= 1) h = size / aspect
  else w = size * aspect
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  body: {
    x: number
    y: number
    rot: number
    radius: number
    color: string
    accent: string
    kind: string
    fruitId?: string
    bonusId?: string
    scale: number
  },
  sprites: DojoSprites | null,
) {
  ctx.save()
  ctx.translate(body.x, body.y)
  ctx.rotate(body.rot)
  const r = body.radius

  let sprite: HTMLImageElement | null | undefined
  if (body.kind === 'bomb') sprite = sprites?.bomb
  else if (body.kind === 'bonus' && body.bonusId === 'lazyCoin') sprite = sprites?.lazyCoin
  else if (body.kind === 'bonus' && body.bonusId === 'golden') sprite = sprites?.golden
  else if (body.fruitId) sprite = sprites?.fruit[body.fruitId as keyof NonNullable<DojoSprites>['fruit']]

  if (ready(sprite)) {
    drawSprite(ctx, sprite, r, body.scale)
    ctx.restore()
    return
  }

  if (body.kind === 'bomb') {
    ctx.fillStyle = body.color
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = body.accent
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = '#fa5252'
    ctx.fillRect(-3, -r - 10, 6, 12)
    ctx.beginPath()
    ctx.arc(0, -r - 14, 5, 0, Math.PI * 2)
    ctx.fill()
  } else if (body.kind === 'bonus' && body.bonusId === 'lazyCoin') {
    ctx.fillStyle = body.color
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = body.accent
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.fillStyle = body.accent
    ctx.font = `800 ${Math.floor(r * 0.7)}px Trebuchet MS, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('$', 0, 1)
  } else {
    ctx.fillStyle = body.color
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = body.accent
    ctx.globalAlpha = 0.35
    ctx.beginPath()
    ctx.arc(-r * 0.25, -r * 0.25, r * 0.35, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    if (body.kind === 'bonus') {
      ctx.strokeStyle = '#fff3bf'
      ctx.lineWidth = 3
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawHalf(
  ctx: CanvasRenderingContext2D,
  half: {
    x: number
    y: number
    rot: number
    radius: number
    color: string
    accent: string
    side: 'left' | 'right'
    fruitId?: string
    bonusId?: string
  },
  sprites: DojoSprites | null,
) {
  ctx.save()
  ctx.translate(half.x, half.y)
  ctx.rotate(half.rot)

  let sprite: HTMLImageElement | null | undefined
  if (half.bonusId === 'golden') sprite = sprites?.golden
  else if (half.fruitId) {
    const pair = sprites?.fruitSliced[half.fruitId as keyof NonNullable<DojoSprites>['fruitSliced']]
    sprite = pair?.[half.side]
  }

  if (ready(sprite)) {
    drawSprite(ctx, sprite, half.radius, 1.05)
    ctx.restore()
    return
  }

  ctx.beginPath()
  if (half.side === 'left') {
    ctx.arc(0, 0, half.radius, Math.PI * 0.5, Math.PI * 1.5)
  } else {
    ctx.arc(0, 0, half.radius, -Math.PI * 0.5, Math.PI * 0.5)
  }
  ctx.closePath()
  ctx.fillStyle = half.color
  ctx.fill()
  ctx.fillStyle = half.accent
  ctx.globalAlpha = 0.45
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.restore()
}
