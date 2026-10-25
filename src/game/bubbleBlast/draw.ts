/**
 * Placeholder art for Bubble Blast. Reads the engine state and draws it; nothing here
 * changes the game, so final artwork can replace any part of this file.
 */
import {
  ART_ABOVE,
  ART_H,
  ART_SIGN_BOTTOM,
  ART_SIGN_TOP,
  BUBBLE_D,
  BUBBLE_R,
  CEILING_DROP_SECONDS,
  CUB_ASPECT,
  CUB_H,
  CUB_MOUTH_FX,
  CUB_MOUTH_FY,
  CUB_TOP,
  GUM_BLOW_SECONDS,
  GUM_LIP_OFFSET,
  GUM_SCALE,
  MOUTH_X,
  MOUTH_Y,
  DANGER_Y,
  FIELD_H,
  FIELD_W,
  LAUNCH_X,
  LAUNCH_Y,
  MEGA_BUTTON_R,
  MEGA_FILL,
  MEGA_X,
  MEGA_Y,
  MIN_VISIBLE_BOTTOM,
  ROW_H,
  SIDE_BORDER,
} from './config'
import backgroundUrl from '../../assets/bubble-blast/background-sign.jpg'
import cubUrl from '../../assets/bubble-blast/cub.png'
import { comboMultiplier, missLimit } from './engine'
import coinUrl from '../../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import { cellX, cellY } from './grid'
import type { BubbleKind, BubbleState, CubMood } from './types'

/** Candy-apple colours: a bright core, the main colour, a deep edge, and a darker rim line. */
type Paint = { base: string; light: string; dark: string; rim: string }

export const BUBBLE_PAINT: Record<BubbleKind, Paint> = {
  blue: { base: '#1a7ff0', light: '#7cc8ff', dark: '#0b3d94', rim: '#082f73' },
  red: { base: '#e0102a', light: '#ff6b6b', dark: '#8a0010', rim: '#7a0010' },
  green: { base: '#1db94c', light: '#86f2a0', dark: '#0b6127', rim: '#084a1d' },
  purple: { base: '#8f3ff0', light: '#d0a6ff', dark: '#4a1594', rim: '#3a0f75' },
  yellow: { base: '#f7c316', light: '#fff2a0', dark: '#b07c06', rim: '#8f6000' },
  gold: { base: '#f2b01e', light: '#fff1b0', dark: '#a86a00', rim: '#7a4c00' },
}

/** The candy body: lit from just up and left of centre, deepening to the edge. */
function candyFill(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, paint: Paint) {
  const fill = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r)
  fill.addColorStop(0, paint.light)
  fill.addColorStop(0.55, paint.base)
  fill.addColorStop(1, paint.dark)
  return fill
}

/** The candy shine: a curved white streak round the upper left and a bright dot above it. */
function candyShine(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineWidth = r * 0.16
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.beginPath()
  ctx.arc(x, y, r * 0.66, Math.PI * 1.08, Math.PI * 1.42)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.beginPath()
  ctx.arc(x - r * 0.08, y - r * 0.68, r * 0.07, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** A whole candy-apple ball: body, shine and rim. */
function drawCandy(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, paint: Paint) {
  ctx.fillStyle = candyFill(ctx, x, y, r, paint)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  candyShine(ctx, x, y, r)
  ctx.lineWidth = Math.max(1, r * 0.08)
  ctx.strokeStyle = paint.rim
  ctx.beginPath()
  ctx.arc(x, y, r - ctx.lineWidth / 2, 0, Math.PI * 2)
  ctx.stroke()
}

/** Where the score plate and the multiplier pill sit on the sign, as shares of the picture. */
const SIGN = {
  score: { x: 420 / 853, y: 166 / 1847 },
  /** Centre of the plain plank right of the score plate, and its width. */
  multiplier: { x: 683 / 853, w: 146 / 853 },
  /** The plain plank left of the score plate, where Home and Games sit. */
  nav: { right: 232 / 853, top: 86 / 1847, bottom: 250 / 1847 },
}
/** The picture fills the field's width and runs from above the screen to the bottom. */
const BG_W = FIELD_W
const BG_H = ART_H
const BG_TOP = -ART_ABOVE
const BG_LEFT = 0
const SKY = '#0066fb'
const DECK = '#3a1a08'
/** Field units above the ceiling that must stay on screen: the sign. */
const SIGN_SPACE = (ART_SIGN_BOTTOM - ART_SIGN_TOP) * ART_H

/**
 * Where the logical field sits on a canvas of this CSS size. The picture fills the width with
 * its sign at the very top of the screen; the sky above the sign is cut off, and a short
 * screen cuts off the bottom of the deck. If even that would hide the cub's mouth or the
 * Mega button, everything is shrunk a little.
 */
export function fitField(width: number, height: number) {
  const scale = (width - SIDE_BORDER * 2) / FIELD_W
  const y = SIGN_SPACE * scale
  if (y + MIN_VISIBLE_BOTTOM * scale > height) {
    const fitted = height / (SIGN_SPACE + MIN_VISIBLE_BOTTOM)
    return { scale: fitted, x: (width - FIELD_W * fitted) / 2, y: SIGN_SPACE * fitted }
  }
  return { scale, x: (width - FIELD_W * scale) / 2, y }
}

/** Home and Games side by side at full size: two 50px buttons, an 8px gap, and a 4px shadow. */
const NAV_BUTTON = 50
const NAV_W = NAV_BUTTON * 2 + 8
const NAV_H = NAV_BUTTON + 4

/**
 * Where Home and Games sit, in CSS pixels on a canvas of this size: scaled down to fit the
 * sign's left plank and centred in it. The multiplier pill matches their size and line.
 */
export function signNav(width: number, height: number) {
  const view = fitField(width, height)
  const top = BG_TOP + SIGN.nav.top * BG_H
  const bottom = BG_TOP + SIGN.nav.bottom * BG_H
  const areaW = SIGN.nav.right * BG_W * view.scale
  const areaH = (bottom - top) * view.scale
  const scale = Math.min(1, (areaW - 6) / NAV_W, (areaH - 10) / NAV_H)
  return {
    left: view.x + BG_LEFT * view.scale + (areaW - NAV_W * scale) / 2,
    top: view.y + top * view.scale + (areaH - NAV_H * scale) / 2,
    scale,
  }
}

let backgroundImage: HTMLImageElement | null = null

function backgroundArt() {
  if (!backgroundImage) {
    backgroundImage = new Image()
    backgroundImage.src = backgroundUrl
  }
  return backgroundImage.complete && backgroundImage.naturalWidth > 0 ? backgroundImage : null
}

function signPoint(fx: number, fy: number) {
  return { x: BG_LEFT + fx * BG_W, y: BG_TOP + fy * BG_H }
}

/** The beach picture, with sky behind its top and deck below it if the screen is taller. */
function drawBackground(ctx: CanvasRenderingContext2D, top: number, bottom: number) {
  ctx.fillStyle = DECK
  ctx.fillRect(BG_LEFT - 60, DANGER_Y, BG_W + 120, bottom - DANGER_Y)
  ctx.fillStyle = SKY
  ctx.fillRect(BG_LEFT - 60, top, BG_W + 120, DANGER_Y - top)
  const art = backgroundArt()
  if (art) ctx.drawImage(art, BG_LEFT, BG_TOP, BG_W, BG_H)
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function signText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, outline: string | null) {
  ctx.font = `900 ${size}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (outline) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(2, size * 0.22)
    ctx.strokeStyle = outline
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

/** Score in the sign's plate with the ceiling bar under it, and the multiplier pill on the right. */
function drawSign(ctx: CanvasRenderingContext2D, sign: SignValues, pill: PillPlace) {
  const score = signPoint(SIGN.score.x, SIGN.score.y)
  signText(ctx, 'SCORE', score.x, score.y - 20, 8, 'rgba(255, 236, 200, 0.9)', null)
  signText(ctx, sign.score.toLocaleString('en-US'), score.x, score.y - 4, 23, '#fffaf0', 'rgba(60, 22, 4, 0.85)')
  drawCeilingBar(ctx, score.x, score.y + 18, sign.misses, missLimit(sign.successfulShots))
  drawMultiplierPill(ctx, pill, `×${comboMultiplier(sign.combo)}`)
}

/** What the sign shows: the run's score, misses toward the ceiling drop, how far along it is, and combo. */
type SignValues = Pick<BubbleState, 'score' | 'misses' | 'successfulShots' | 'combo'>

/** The multiplier pill in field units: as tall as the Home and Games buttons and on their line. */
type PillPlace = { cy: number; h: number; unit: number }

function pillPlace(width: number, height: number): PillPlace {
  const view = fitField(width, height)
  const nav = signNav(width, height)
  const unit = nav.scale / view.scale
  return { cy: (nav.top + (NAV_BUTTON / 2) * nav.scale - view.y) / view.scale, h: NAV_BUTTON * unit, unit }
}

/** A small carved plank like the score plate: dark grained wood, a gold inner rim, and corner nails. */
function drawMultiplierPill(ctx: CanvasRenderingContext2D, pill: PillPlace, text: string) {
  const u = pill.unit
  const h = pill.h
  const w = Math.min(SIGN.multiplier.w * BG_W - 6, h * 1.5)
  const x = SIGN.multiplier.x * BG_W - w / 2
  const y = pill.cy - h / 2
  const r = h * 0.2

  roundedRect(ctx, x, y + 3 * u, w, h, r)
  ctx.fillStyle = 'rgba(30, 12, 2, 0.75)'
  ctx.fill()

  const wood = ctx.createLinearGradient(0, y, 0, y + h)
  wood.addColorStop(0, '#9a5523')
  wood.addColorStop(0.5, '#74380f')
  wood.addColorStop(1, '#4e2308')
  roundedRect(ctx, x, y, w, h, r)
  ctx.fillStyle = wood
  ctx.fill()

  ctx.save()
  roundedRect(ctx, x, y, w, h, r)
  ctx.clip()
  ctx.lineWidth = 0.9 * u
  ctx.strokeStyle = 'rgba(40, 16, 2, 0.45)'
  for (const [fy, bend] of [[0.24, 1.6], [0.47, -1.2], [0.7, 1.4], [0.88, -0.8]]) {
    const gy = y + h * fy
    ctx.beginPath()
    ctx.moveTo(x, gy)
    ctx.bezierCurveTo(x + w * 0.3, gy + bend * u, x + w * 0.65, gy - bend * u, x + w, gy + bend * 0.5 * u)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255, 220, 160, 0.16)'
  ctx.fillRect(x, y, w, h * 0.3)
  ctx.restore()

  roundedRect(ctx, x, y, w, h, r)
  ctx.lineWidth = 2.4 * u
  ctx.strokeStyle = '#2e1404'
  ctx.stroke()
  const inset = 3.4 * u
  roundedRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(1, r - inset))
  ctx.lineWidth = 1.5 * u
  ctx.strokeStyle = '#f0a43a'
  ctx.stroke()

  const nail = 1.3 * u
  for (const [nx, ny] of [[x + inset + 3.2 * u, y + inset + 3.2 * u], [x + w - inset - 3.2 * u, y + inset + 3.2 * u], [x + inset + 3.2 * u, y + h - inset - 3.2 * u], [x + w - inset - 3.2 * u, y + h - inset - 3.2 * u]]) {
    ctx.beginPath()
    ctx.arc(nx, ny, nail, 0, Math.PI * 2)
    ctx.fillStyle = '#2a1204'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(nx - nail * 0.3, ny - nail * 0.3, nail * 0.4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 220, 170, 0.6)'
    ctx.fill()
  }

  signText(ctx, text, x + w / 2, pill.cy + 1, h * 0.42, '#fffaf0', 'rgba(60, 22, 4, 0.9)')
}

/** A small wood pill with a gold rim, like the score plate: CEILING, then one bar per miss allowed. */
function drawCeilingBar(ctx: CanvasRenderingContext2D, cx: number, cy: number, misses: number, limit: number) {
  const h = 13
  const barW = 13
  const barH = 5.5
  const gap = 3
  const labelW = 36
  const w = 8 + labelW + 4 + limit * barW + (limit - 1) * gap + 7
  const x = cx - w / 2
  const y = cy - h / 2

  const wood = ctx.createLinearGradient(0, y, 0, y + h)
  wood.addColorStop(0, '#6b3510')
  wood.addColorStop(1, '#3d1c06')
  roundedRect(ctx, x, y, w, h, h / 2)
  ctx.fillStyle = wood
  ctx.fill()
  ctx.lineWidth = 1.2
  ctx.strokeStyle = '#f0a43a'
  ctx.stroke()

  signText(ctx, 'CEILING', x + 8 + labelW / 2, cy + 0.5, 7.5, '#ffecc8', null)

  const barsX = x + 8 + labelW + 4
  const barY = cy - barH / 2
  for (let i = 0; i < limit; i += 1) {
    const bx = barsX + i * (barW + gap)
    roundedRect(ctx, bx, barY, barW, barH, barH / 2)
    if (i < misses) {
      const red = ctx.createLinearGradient(0, barY, 0, barY + barH)
      red.addColorStop(0, '#ff8a7a')
      red.addColorStop(1, '#d8322a')
      ctx.fillStyle = red
    } else {
      ctx.fillStyle = 'rgba(255, 236, 200, 0.2)'
    }
    ctx.fill()
  }
}

let coinImage: HTMLImageElement | null = null

/** The in-game Cub Cash coin, loaded the first time a coin bubble is drawn. */
function coinArt() {
  if (!coinImage) {
    coinImage = new Image()
    coinImage.src = coinUrl
  }
  return coinImage.complete && coinImage.naturalWidth > 0 ? coinImage : null
}

export function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, kind: BubbleKind, r = BUBBLE_R, alpha = 1) {
  const paint = BUBBLE_PAINT[kind]
  ctx.save()
  ctx.globalAlpha = alpha
  const coin = kind === 'gold' ? coinArt() : null
  if (coin) {
    const w = r * 2
    const h = (w * coin.naturalHeight) / coin.naturalWidth
    ctx.shadowColor = 'rgba(255, 210, 80, 0.75)'
    ctx.shadowBlur = r * 0.45
    ctx.drawImage(coin, x - w / 2, y - h / 2, w, h)
    ctx.restore()
    return
  }
  drawCandy(ctx, x, y, r - 0.5, paint)
  ctx.restore()
}

/** The Mega Bubble's own colour: candy hot pink with a gold rim, unlike any normal bubble. */
const MEGA_PAINT: Paint = { base: '#ff2c95', light: '#ff9fd2', dark: '#a3085a', rim: '#ffcf6b' }

/** A four-point star glint. */
function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha = 1) {
  if (size <= 0.2 || alpha <= 0) return
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(255, 255, 255, 0.9)'
  ctx.shadowBlur = size * 0.8
  const waist = size * 0.22
  ctx.beginPath()
  ctx.moveTo(x, y - size)
  ctx.quadraticCurveTo(x + waist, y - waist, x + size, y)
  ctx.quadraticCurveTo(x + waist, y + waist, x, y + size)
  ctx.quadraticCurveTo(x - waist, y + waist, x - size, y)
  ctx.quadraticCurveTo(x - waist, y - waist, x, y - size)
  ctx.fill()
  ctx.restore()
}

/** The twinkling glints that make a Mega Bubble feel special. */
function drawMegaSparkles(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, alpha = 1) {
  const twinkle = 0.75 + Math.sin(time * 5) * 0.25
  drawSparkle(ctx, x + r * 0.05, y + r * 0.05, r * 0.5 * twinkle, alpha)
  const orbit = time * 1.8
  drawSparkle(ctx, x + Math.cos(orbit) * r * 0.58, y + Math.sin(orbit) * r * 0.58, r * 0.2 * (1.2 - twinkle * 0.4), alpha)
}

/** A soft pink glow that breathes behind the Mega Bubble. */
function drawMegaGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number) {
  ctx.save()
  ctx.shadowColor = 'rgba(255, 90, 170, 0.9)'
  ctx.shadowBlur = r * (0.8 + Math.sin(time * 3) * 0.25)
  ctx.fillStyle = MEGA_PAINT.base
  ctx.beginPath()
  ctx.arc(x, y, r * 0.96, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** The Mega Bubble as a round ball: candy hot pink, gold rim, glow and twinkling glints. */
function drawMegaBubble(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, r = BUBBLE_R, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  if (alpha >= 1) drawMegaGlow(ctx, x, y, r, time)
  drawCandy(ctx, x, y, r, MEGA_PAINT)
  ctx.restore()
  drawMegaSparkles(ctx, x, y, r, time, alpha)
}
/** How far above its row the board is drawn while it slides down, with a small settle at the end. */
function ceilingLift(left: number) {
  if (left <= 0) return 0
  const p = 1 - left / CEILING_DROP_SECONDS
  const back = 1.2
  const eased = 1 + (back + 1) * Math.pow(p - 1, 3) + back * Math.pow(p - 1, 2)
  return ROW_H * (1 - eased)
}

let cubImage: HTMLImageElement | null = null

function cubArt() {
  if (!cubImage) {
    cubImage = new Image()
    cubImage.src = cubUrl
  }
  return cubImage.complete && cubImage.naturalWidth > 0 ? cubImage : null
}

/** The Bubble Blast cub. Leaning toward the aim pivots around the mouth, where the waiting bubble sits. */
function drawCub(ctx: CanvasRenderingContext2D, mood: CubMood, aimAngle: number) {
  const art = cubArt()
  if (!art) return
  const h = CUB_H
  const w = h * CUB_ASPECT
  const left = MOUTH_X - w * CUB_MOUTH_FX
  const top = CUB_TOP
  const mouthDx = w * CUB_MOUTH_FX
  const mouthDy = h * CUB_MOUTH_FY
  // Leaning toward the aim is the only movement. It holds through the blow so it does not snap back.
  const lean = mood === 'aiming' || mood === 'blowing' ? (Math.PI / 2 - aimAngle) * 0.12 : 0

  ctx.save()
  ctx.globalAlpha = mood === 'over' ? 0.8 : 1
  ctx.translate(left + mouthDx, top + mouthDy)
  ctx.rotate(lean)
  ctx.drawImage(art, -mouthDx, -mouthDy, w, h)
  ctx.restore()
}
/** Where the gum bubble's neck meets the lips: a little out from the mouth point, toward the bubble. */
const LIP_SPAN = Math.hypot(LAUNCH_X - MOUTH_X, LAUNCH_Y - MOUTH_Y) || 1
const LIP_X = MOUTH_X + ((LAUNCH_X - MOUTH_X) / LIP_SPAN) * GUM_LIP_OFFSET
const LIP_Y = MOUTH_Y + ((LAUNCH_Y - MOUTH_Y) / LIP_SPAN) * GUM_LIP_OFFSET

/** A #rrggbb colour as rgba with the given opacity. */
function withAlpha(hex: string, alpha: number) {
  const value = parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

/** 0 to 1 with a small overshoot, so the gum bubble puffs out and settles. */
function gumEase(p: number) {
  if (p <= 0) return 0
  if (p >= 1) return 1
  const back = 1.6
  return 1 + (back + 1) * Math.pow(p - 1, 3) + back * Math.pow(p - 1, 2)
}

/**
 * The waiting bubble, shaped like the Bubble Gum mouth trait and painted like the candy
 * bubbles, joined to the cub's lips. Once fired it flies as a round ball.
 */
function drawGumBubble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, paint: Paint) {
  const rimColour = paint.rim
  // One outline: the ball, narrowing smoothly into a pinched neck that ends at the lips.
  const toMouth = Math.atan2(LIP_Y - y, LIP_X - x)
  const ux = Math.cos(toMouth)
  const uy = Math.sin(toMouth)
  const nx = -uy
  const ny = ux
  const reach = Math.hypot(LIP_X - x, LIP_Y - y)
  const spread = 0.5
  const tip = Math.max(0.8, r * 0.07)
  const pinch = r * 0.03

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1, r * 0.1)
  ctx.strokeStyle = rimColour
  ctx.fillStyle = candyFill(ctx, x, y, r, paint)

  ctx.beginPath()
  if (reach > r * 1.05) {
    const neckX = x + ux * r * 1.12
    const neckY = y + uy * r * 1.12
    ctx.moveTo(LIP_X + nx * tip, LIP_Y + ny * tip)
    ctx.quadraticCurveTo(neckX + nx * pinch, neckY + ny * pinch, x + r * Math.cos(toMouth + spread), y + r * Math.sin(toMouth + spread))
    ctx.arc(x, y, r, toMouth + spread, toMouth - spread + Math.PI * 2)
    ctx.quadraticCurveTo(neckX - nx * pinch, neckY - ny * pinch, LIP_X - nx * tip, LIP_Y - ny * tip)
    ctx.closePath()
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2)
  }
  ctx.globalAlpha = 0.95
  ctx.fill()
  ctx.globalAlpha = 1
  if (reach > r * 1.05) {
    // The rim is solid round the ball and fades out along the neck toward the lips.
    const rim = ctx.createLinearGradient(x + ux * r * 0.55, y + uy * r * 0.55, LIP_X, LIP_Y)
    rim.addColorStop(0, withAlpha(rimColour, 1))
    rim.addColorStop(1, withAlpha(rimColour, 0))
    ctx.strokeStyle = rim
  }
  ctx.stroke()
  candyShine(ctx, x, y, r)
  ctx.restore()
}

function drawQueue(ctx: CanvasRenderingContext2D, state: BubbleState, time: number) {
  if (state.phase !== 'flying' && state.phase !== 'over') {
    // The cub blows the bubble out of its mouth: it swells from the lips to its resting spot.
    const blown = gumEase(1 - state.gumBlow / GUM_BLOW_SECONDS)
    const x = LIP_X + (LAUNCH_X - LIP_X) * Math.min(1, blown)
    const y = LIP_Y + (LAUNCH_Y - LIP_Y) * Math.min(1, blown)
    const r = BUBBLE_R * GUM_SCALE * blown
    if (r > 0.5) {
      if (state.megaArmed) {
        drawMegaGlow(ctx, x, y, r, time)
        drawGumBubble(ctx, x, y, r, MEGA_PAINT)
        drawMegaSparkles(ctx, x, y, r, time)
      } else {
        drawGumBubble(ctx, x, y, r, BUBBLE_PAINT[state.current])
      }
    }
  }
}

function drawMegaButton(ctx: CanvasRenderingContext2D, state: BubbleState, time: number) {
  const fill = Math.min(1, state.megaMeter / MEGA_FILL)
  const ready = fill >= 1
  ctx.save()
  ctx.fillStyle = state.megaArmed ? 'rgba(255, 255, 255, 0.95)' : 'rgba(20, 10, 4, 0.55)'
  ctx.beginPath()
  ctx.arc(MEGA_X, MEGA_Y, MEGA_BUTTON_R, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
  ctx.beginPath()
  ctx.arc(MEGA_X, MEGA_Y, MEGA_BUTTON_R - 3, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = ready ? `rgba(255, ${Math.round(120 + Math.sin(time * 5) * 50)}, 190, 1)` : '#ff8cc6'
  if (ready) {
    ctx.shadowColor = ctx.strokeStyle
    ctx.shadowBlur = 12 + Math.sin(time * 6) * 4
  }
  ctx.beginPath()
  ctx.arc(MEGA_X, MEGA_Y, MEGA_BUTTON_R - 3, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2)
  ctx.stroke()
  ctx.restore()
  if (ready || state.megaArmed) drawMegaBubble(ctx, MEGA_X, MEGA_Y, time, BUBBLE_R * 0.75)
  else drawMegaBubble(ctx, MEGA_X, MEGA_Y, 0, BUBBLE_R * 0.7, 0.45)
  ctx.fillStyle = '#fff6e3'
  ctx.font = '900 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(state.megaArmed ? 'ARMED' : ready ? 'TAP!' : 'MEGA', MEGA_X, MEGA_Y + MEGA_BUTTON_R + 11)
}

/** Before a run: the beach and the sign with a fresh score, empty ceiling bar and ×1. */
export function drawBubbleIdle(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const view = fitField(width, height)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = SKY
  ctx.fillRect(0, 0, width, height)
  ctx.save()
  ctx.translate(view.x, view.y)
  ctx.scale(view.scale, view.scale)
  drawBackground(ctx, -view.y / view.scale - 20, (height - view.y) / view.scale + 20)
  drawSign(ctx, { score: 0, misses: 0, successfulShots: 0, combo: 0 }, pillPlace(width, height))
  ctx.restore()
}

export function drawBubbleFrame(ctx: CanvasRenderingContext2D, state: BubbleState, width: number, height: number, time: number) {
  const view = fitField(width, height)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = SKY
  ctx.fillRect(0, 0, width, height)
  ctx.save()
  const shake = state.shake > 0 ? state.shake * 14 : 0
  ctx.translate(view.x + (shake ? (Math.random() - 0.5) * shake : 0), view.y + (shake ? (Math.random() - 0.5) * shake : 0))
  ctx.scale(view.scale, view.scale)
  drawBackground(ctx, -view.y / view.scale - 20, (height - view.y) / view.scale + 20)
  drawSign(ctx, state, pillPlace(width, height))

  // Bubbles stay under the sign, so a new ceiling row slides out from beneath it.
  ctx.save()
  ctx.beginPath()
  ctx.rect(-40, 0, FIELD_W + 80, FIELD_H + 40)
  ctx.clip()

  const lift = ceilingLift(state.ceilingDrop)
  state.grid.forEach((cells, row) =>
    cells.forEach((cell, col) => {
      if (cell) drawBubble(ctx, cellX(row, col, state.parity), cellY(row) - lift, cell.kind)
    }),
  )

  if (state.phase === 'aiming' && state.aimDots.length > 0) {
    const paint = state.megaArmed ? MEGA_PAINT.base : BUBBLE_PAINT[state.current].base
    state.aimDots.forEach((dot, index) => {
      ctx.globalAlpha = Math.max(0.25, 1 - index / (state.aimDots.length + 6))
      ctx.fillStyle = paint
      ctx.beginPath()
      ctx.arc(dot.x, dot.y, 3.4, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1
  }

  for (const pop of state.pops) {
    if (pop.t < 0) {
      drawBubble(ctx, pop.x, pop.y, pop.kind)
      continue
    }
    const k = pop.t / 0.32
    ctx.strokeStyle = BUBBLE_PAINT[pop.kind].light
    ctx.globalAlpha = 1 - k
    ctx.lineWidth = 4 * (1 - k) + 1
    ctx.beginPath()
    ctx.arc(pop.x, pop.y, BUBBLE_R * (0.8 + k * 0.9), 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  for (const fall of state.falls) drawBubble(ctx, fall.x, fall.y, fall.kind, BUBBLE_R, 0.9)
  for (const spark of state.sparks) drawSparkle(ctx, spark.x, spark.y, spark.size * (1 - spark.t / 0.45), 1 - spark.t / 0.45)

  if (state.shot) {
    // Grows from the gum bubble on the cub's lips to full size over its first stretch of travel.
    const out = Math.hypot(state.shot.x - LAUNCH_X, state.shot.y - LAUNCH_Y)
    const r = BUBBLE_R * Math.min(1, GUM_SCALE + (out / (BUBBLE_D * 1.2)) * (1 - GUM_SCALE))
    if (state.shot.mega) drawMegaBubble(ctx, state.shot.x, state.shot.y, time, r)
    else drawBubble(ctx, state.shot.x, state.shot.y, state.shot.colour, r)
  }

  drawCub(ctx, state.cubMood, state.aimAngle)
  drawQueue(ctx, state, time)
  drawMegaButton(ctx, state, time)

  for (const text of state.texts) {
    const life = text.big ? 1.5 : 1
    ctx.globalAlpha = Math.max(0, 1 - text.t / life)
    ctx.font = `900 ${text.big ? 26 : 17}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(30, 14, 4, 0.85)'
    ctx.strokeText(text.text, text.x, text.y)
    ctx.fillStyle = text.big ? '#ffe066' : '#fffaf0'
    ctx.fillText(text.text, text.x, text.y)
    ctx.globalAlpha = 1
  }

  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255, 245, 210, ${Math.min(0.5, state.flash)})`
    ctx.fillRect(-40, 0, FIELD_W + 80, FIELD_H + 40)
  }
  ctx.restore()
  ctx.restore()
}
