import bungalowUrl from '../../Lazy Bungalow.jpeg'
import bungalowNightUrl from '../../bungalow night.jpeg'
import cubUrl from '../assets/cub-generic.png'
import crownUrl from '../../Galactic Dash Cub 1.png'
import { artSize, fitInBox, homeArt, homeCatalog, homeItem, slotBox, type SceneBox } from './homeScene'
import type { CubAppearance, CubPose } from './types'

const bungalow = new Image()
bungalow.src = bungalowUrl
const bungalowNight = new Image()
bungalowNight.src = bungalowNightUrl
const cubSprite = new Image()
cubSprite.src = cubUrl
const flightCub = new Image()
flightCub.src = crownUrl

export type CubFrame = {
  appearance: CubAppearance
  pose: CubPose
  time: number
  width: number
  height: number
}

type Motion = {
  y: number
  rot: number
  sx: number
  sy: number
  earDroop: number
  tail: number
}

function motionFor(pose: CubPose, time: number): Motion {
  const idleBob = Math.sin(time * 2.4) * 6
  const tail = Math.sin(time * 3.1) * 16
  switch (pose) {
    case 'eat':
      return { y: 10, rot: 0.16, sx: 1, sy: 1 + Math.sin(time * 9) * 0.02, earDroop: 0, tail: tail * 0.4 }
    case 'sleep':
      return { y: 16, rot: -0.05, sx: 1.03, sy: 0.95, earDroop: 0.35, tail: Math.sin(time * 1.2) * 6 }
    case 'wash':
      return {
        y: Math.sin(time * 11) * 4,
        rot: Math.sin(time * 13) * 0.1,
        sx: 1,
        sy: 1,
        earDroop: 0,
        tail: Math.sin(time * 13) * 22,
      }
    case 'happy':
    case 'react':
      return {
        y: -Math.abs(Math.sin(time * (pose === 'react' ? 9 : 7))) * 24,
        rot: Math.sin(time * 7) * 0.06,
        sx: 1.02,
        sy: 0.98,
        earDroop: -0.08,
        tail: tail * 1.4,
      }
    case 'sad':
      return { y: 18, rot: 0.03, sx: 1.03, sy: 0.94, earDroop: 0.45, tail: Math.sin(time * 1.4) * 5 }
    default:
      return { y: idleBob, rot: Math.sin(time * 1.5) * 0.03, sx: 1, sy: 1, earDroop: 0, tail }
  }
}

function drawZzz(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  ctx.save()
  ctx.fillStyle = '#8a5a32'
  ctx.font = '700 22px Segoe UI, sans-serif'
  ctx.textAlign = 'center'
  for (let i = 0; i < 3; i += 1) {
    const rise = ((time * 28 + i * 22) % 70)
    ctx.globalAlpha = 1 - rise / 70
    ctx.fillText('z', width * 0.68, height * 0.28 - rise)
  }
  ctx.restore()
}

function drawBubbles(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  ctx.save()
  for (let i = 0; i < 6; i += 1) {
    const phase = time * 1.4 + i
    const x = width * 0.5 + Math.sin(phase * 1.7) * width * 0.22
    const y = height * 0.55 - ((phase * 40) % (height * 0.4))
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 8 + (i % 3) * 4, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawBowl(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const x = width * 0.68
  const y = height * 0.7
  ctx.save()
  ctx.fillStyle = '#f4f7fb'
  ctx.beginPath()
  ctx.ellipse(x, y, 28, 12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#d7dee8'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(x, y, 26, 0.1 * Math.PI, 0.9 * Math.PI)
  ctx.stroke()
  ctx.fillStyle = '#e7a15a'
  ctx.beginPath()
  ctx.ellipse(x, y - 2, 16, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function readyImage(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0
}

function drawBungalow(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const dw = image.naturalWidth * scale
  const dh = image.naturalHeight * scale
  ctx.drawImage(image, (width - dw) * 0.5, height - dh, dw, dh)
}

export function drawRoom(ctx: CanvasRenderingContext2D, width: number, height: number, night = false) {
  const scene = night && readyImage(bungalowNight) ? bungalowNight : bungalow
  if (readyImage(scene)) {
    drawBungalow(ctx, scene, width, height)
    return
  }
  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#f7c56e')
  sky.addColorStop(0.42, '#f6d7ae')
  sky.addColorStop(1, '#e8c08a')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = 'rgba(255, 244, 210, 0.95)'
  ctx.beginPath()
  ctx.arc(width * 0.8, height * 0.16, Math.min(width, height) * 0.075, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#efc98a'
  ctx.beginPath()
  ctx.moveTo(0, height * 0.58)
  ctx.quadraticCurveTo(width * 0.45, height * 0.42, width, height * 0.56)
  ctx.lineTo(width, height)
  ctx.lineTo(0, height)
  ctx.fill()

  ctx.fillStyle = '#e0ae68'
  ctx.beginPath()
  ctx.moveTo(0, height * 0.7)
  ctx.quadraticCurveTo(width * 0.5, height * 0.6, width, height * 0.72)
  ctx.lineTo(width, height)
  ctx.lineTo(0, height)
  ctx.fill()
}

function spriteBox(heightPx: number): { w: number; h: number } {
  const aspect = cubSprite.naturalWidth / cubSprite.naturalHeight
  return { w: heightPx * aspect, h: heightPx }
}

/** Crown flyer. This sprite is only used in Galactic Dash. */
export function drawFlightLion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilt: number,
  scale: number,
) {
  if (!readyImage(flightCub)) return
  const height = 105 * scale
  const width = height * (flightCub.naturalWidth / flightCub.naturalHeight)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  ctx.drawImage(flightCub, -width * 0.72, -height * 0.48, width, height)
  ctx.restore()
}

export function drawCub(ctx: CanvasRenderingContext2D, frame: CubFrame) {
  const { appearance, pose, time, width, height } = frame
  if (!readyImage(cubSprite)) return
  const ageScale = appearance.traits.Age === 'Old' ? 1.06 : 0.94
  const motion = motionFor(pose, time)
  const size = spriteBox(height * 0.64 * ageScale)

  ctx.save()
  ctx.translate(width / 2, height * 0.94 + motion.y * (size.h / 280))
  ctx.rotate(motion.rot)
  ctx.scale(motion.sx, motion.sy)
  ctx.drawImage(cubSprite, -size.w / 2, -size.h, size.w, size.h)
  ctx.restore()

  if (pose === 'sleep') drawZzz(ctx, width, height, time)
  if (pose === 'wash') drawBubbles(ctx, width, height, time)
  if (pose === 'eat') drawBowl(ctx, width, height)
}

function drawFitted(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  box: SceneBox,
  clip?: { seatCut: number },
) {
  const size = artSize(image)
  const fitted = fitInBox(size.w, size.h, box)
  ctx.save()
  if (clip) {
    const inset = fitted.w * 0.14
    const cut = fitted.y + fitted.h * clip.seatCut
    ctx.beginPath()
    ctx.rect(inset + fitted.x, cut, fitted.w - inset * 2, fitted.h)
    ctx.clip()
  }
  ctx.drawImage(image, fitted.x, fitted.y, fitted.w, fitted.h)
  ctx.restore()
}

export function drawHomeBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  night = false,
) {
  ctx.fillStyle = night ? '#1a2744' : '#c4843e'
  ctx.fillRect(0, 0, width, height)
  const item = homeItem('background', night)
  const image = homeArt(item.id)
  if (!image) return
  drawFitted(ctx, image, slotBox('background', width, height))
}

export function drawHomeChair(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  part: 'back' | 'seat',
  yOffset = 0,
) {
  const item = homeItem('chair')
  const image = homeArt(item.id)
  if (!image) return
  const box = slotBox('chair', width, height)
  const placed = { ...box, y: box.y + yOffset }
  if (part === 'back') {
    drawFitted(ctx, image, placed)
    return
  }
  drawFitted(ctx, image, placed, { seatCut: item.seatCut ?? 0.66 })
}

export function homeCharacterBox(width: number, height: number): SceneBox | null {
  const item = homeItem('character')
  const image = homeArt(item.id)
  if (!image) return null
  return fitInBox(artSize(image).w, artSize(image).h, slotBox('character', width, height))
}

export function drawHomeTable(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  id = 'table-1',
  yOffset = 0,
) {
  const item = homeCatalog.find((entry) => entry.id === id)
  const image = item ? homeArt(item.id) : null
  if (!image) return
  const box = slotBox('table', width, height)
  drawFitted(ctx, image, { ...box, y: box.y + yOffset })
}

export function drawCubEffects(
  ctx: CanvasRenderingContext2D,
  pose: CubPose,
  time: number,
  width: number,
  height: number,
) {
  if (pose === 'sleep') drawZzz(ctx, width, height, time)
  if (pose === 'wash') drawBubbles(ctx, width, height, time)
}

