import background1 from '../assets/home/background-1.png'
import backgroundNight from '../assets/home/background-2-night.png'
import bedroom2 from '../assets/home/bedroom-2.png'
import kovuUrl from '../assets/kovu-old.png'
import kovuYoungUrl from '../assets/kovu-young.png'
import chair1 from '../assets/home/chair-1.png'
import table1 from '../assets/home/table-1.png'
import chest1 from '../assets/home/chest-draws-1.png'

export type HomeSlot = 'background' | 'chair' | 'character' | 'table'

/** Draw order, back to front. The chair seat is drawn again after the character. */
export const HOME_SLOTS: HomeSlot[] = ['background', 'chair', 'character', 'table']

export type Fit = 'cover' | 'contain'

/**
 * Size shared by every image in a slot, taken from the first file.
 * A later image is fitted inside this box. Its own pixel size does not change how big it looks.
 */
export type SlotScale = {
  /** Horizontal center of the box, as a fraction of the stage width. */
  anchorX: number
  /**
   * Background: point in the source image (0–1) that stays in view.
   * Other slots: stored for the record; the stack fields below place the box.
   */
  anchorY: number
  /** Display width of the reference image, as a fraction of the stage width. */
  width: number
  sourceWidth: number
  sourceHeight: number
  fit: Fit
  /** Background only. Where anchorY should land, as a fraction of the stage height. */
  focusY?: number
  /** Table only. 0 sits the box on the bottom of the stage. */
  pinBottom?: number
  /** Table only. Fraction of the character height the tabletop covers, hiding the cut-off body. */
  cover?: number
  /** Chair only. Chair top, as a fraction down the character, so the crown stays above the back. */
  crownClear?: number
  /** Character only. Radians added so the bust sits upright. Negative leans the head left. */
  restRot?: number
}

export type HomeItem = {
  id: string
  slot: HomeSlot
  src: string
  /** Chair art: where the cushion starts, as a fraction down the image. */
  seatCut?: number
  /** Table art: drop a solid white backdrop once, on load. */
  keyWhite?: boolean
}

export type SceneBox = {
  x: number
  y: number
  w: number
  h: number
}

export const slotScale: Record<HomeSlot, SlotScale> = {
  background: {
    anchorX: 0.5,
    anchorY: 0.4,
    width: 1,
    sourceWidth: 852,
    sourceHeight: 1846,
    fit: 'cover',
    focusY: 0.36,
  },
  chair: {
    anchorX: 0.5,
    anchorY: 0.5,
    width: 1.02,
    sourceWidth: 1342,
    sourceHeight: 1172,
    fit: 'contain',
    crownClear: 0.34,
  },
  character: {
    anchorX: 0.5,
    anchorY: 0.42,
    width: 0.924,
    sourceWidth: 1254,
    sourceHeight: 1254,
    fit: 'contain',
  },
  table: {
    anchorX: 0.5,
    anchorY: 0.74,
    width: 1.22,
    sourceWidth: 1748,
    sourceHeight: 794,
    fit: 'contain',
    pinBottom: 0,
    cover: 0.1,
  },
}

export const homeCatalog: HomeItem[] = [
  { id: 'background-1', slot: 'background', src: background1 },
  { id: 'background-2-night', slot: 'background', src: backgroundNight },
  { id: 'bedroom-2', slot: 'background', src: bedroom2 },
  { id: 'chair-1', slot: 'chair', src: chair1, seatCut: 0.66 },
  { id: 'kovu-old', slot: 'character', src: kovuUrl },
  { id: 'kovu-young', slot: 'character', src: kovuYoungUrl },
  { id: 'table-1', slot: 'table', src: table1, keyWhite: true },
  { id: 'chest-1', slot: 'table', src: chest1, keyWhite: true },
]

/** Current room. Swap a piece by pointing its slot at another catalog id. */
export const homeScene: Record<HomeSlot, string> = {
  background: 'background-1',
  chair: 'chair-1',
  character: 'kovu-young',
  table: 'table-1',
}

export type CharacterAge = 'old' | 'young'

export function setHomeCharacter(age: CharacterAge) {
  homeScene.character = age === 'young' ? 'kovu-young' : 'kovu-old'
}

export function homeItem(slot: HomeSlot, night = false): HomeItem {
  const id = slot === 'background' && night ? 'background-2-night' : homeScene[slot]
  const item = homeCatalog.find((entry) => entry.id === id && entry.slot === slot)
  if (!item) throw new Error(`Missing home ${slot} "${id}"`)
  return item
}

function referenceSize(slot: HomeSlot): { w: number; h: number } {
  const scale = slotScale[slot]
  return { w: scale.sourceWidth, h: scale.sourceHeight }
}

/** The on-screen box for a slot. New art in that slot is fitted inside it. */
export function slotBox(slot: HomeSlot, stageW: number, stageH: number): SceneBox {
  const scale = slotScale[slot]
  if (scale.fit === 'cover') {
    const src = referenceSize(slot)
    const cover = Math.max(stageW / src.w, stageH / src.h)
    const w = src.w * cover
    const h = src.h * cover
    const focusY = scale.focusY ?? 0.5
    let x = stageW * 0.5 - w * scale.anchorX
    let y = stageH * focusY - h * scale.anchorY
    x = Math.min(0, Math.max(stageW - w, x))
    y = Math.min(0, Math.max(stageH - h, y))
    return { x, y, w, h }
  }

  const src = referenceSize(slot)
  const w = stageW * scale.width
  const h = w * (src.h / src.w)
  const x = stageW * scale.anchorX - w / 2

  if (slot === 'table') {
    const y = stageH - h - stageH * (scale.pinBottom ?? 0)
    return { x, y, w, h }
  }
  if (slot === 'character') {
    const table = slotBox('table', stageW, stageH)
    const cover = h * (slotScale.table.cover ?? 0)
    const y = table.y + cover - h
    return { x, y, w, h }
  }
  if (slot === 'chair') {
    const character = slotBox('character', stageW, stageH)
    const y = character.y + character.h * (scale.crownClear ?? 0)
    return { x, y, w, h }
  }

  const y = stageH * scale.anchorY - h / 2
  return { x, y, w, h }
}

/** Fit an image inside a slot box, keeping its aspect. */
export function fitInBox(imageW: number, imageH: number, box: SceneBox): SceneBox {
  const scale = Math.min(box.w / imageW, box.h / imageH)
  const w = imageW * scale
  const h = imageH * scale
  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w,
    h,
  }
}

type Art = HTMLImageElement | HTMLCanvasElement

const art = new Map<string, Art>()

export function homeArt(id: string): Art | null {
  return art.get(id) ?? null
}

export function artSize(image: Art): { w: number; h: number } {
  if (image instanceof HTMLCanvasElement) return { w: image.width, h: image.height }
  return { w: image.naturalWidth, h: image.naturalHeight }
}

function keyWhiteBackdrop(image: HTMLImageElement): HTMLCanvasElement {
  const w = image.naturalWidth
  const h = image.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas
  ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  const seen = new Uint8Array(w * h)
  const stack: number[] = []

  const isBackdrop = (index: number) => {
    if (px[index + 3] < 16) return true
    const red = px[index]
    const green = px[index + 1]
    const blue = px[index + 2]
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)
    return min > 170 && max - min < 18
  }

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const pixel = y * w + x
    if (seen[pixel]) return
    const index = pixel * 4
    if (!isBackdrop(index)) return
    seen[pixel] = 1
    px[index + 3] = 0
    stack.push(pixel)
  }

  for (let x = 0; x < w; x += 1) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y += 1) {
    push(0, y)
    push(w - 1, y)
  }
  while (stack.length > 0) {
    const pixel = stack.pop() as number
    const x = pixel % w
    const y = (pixel - x) / w
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }

  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (px[(y * w + x) * 4 + 3] < 16) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX || maxY < minY) return canvas

  const cropped = document.createElement('canvas')
  cropped.width = maxX - minX + 1
  cropped.height = maxY - minY + 1
  const croppedCtx = cropped.getContext('2d')
  if (!croppedCtx) return canvas
  ctx.putImageData(data, 0, 0)
  croppedCtx.drawImage(canvas, minX, minY, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height)
  return cropped
}

function loadItem(item: HomeItem) {
  const image = new Image()
  image.onload = () => {
    art.set(item.id, item.keyWhite ? keyWhiteBackdrop(image) : image)
  }
  image.src = item.src
}

for (const item of homeCatalog) loadItem(item)
