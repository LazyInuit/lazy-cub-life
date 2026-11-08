import logoUrl from '../assets/scorecard/logo-long.png'

/** Everything one scorecard shows. Built from a finished run by scorecardFor() in scorecardGames. */
export type ScorecardSpec = {
  title: string
  emoji: string
  /** A real gameplay frame (or the game's selection picture), drawn behind everything. */
  background: string
  username: string
  score: number
  /** The tier this one score reaches, or null below Bronze. */
  badge: { src: string; tier: BadgeTier; name: string } | null
  /** Score the first badge needs, shown on the unranked placeholder. */
  firstBadgeAt: number | null
  /** A cub for the bottom-left corner: the whole square trait-layer frame as a transparent PNG. Optional. */
  character?: string
}

export type BadgeTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond'

export const SCORECARD_SIZE = 1200
export const SITE_URL = 'https://lazycub.life'
const SITE_LABEL = 'lazycub.life'
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif'
const OUTLINE = '#1d0e00'
const TIER_COLOURS: Record<BadgeTier, [string, string]> = {
  Bronze: ['#ffd2a6', '#c9773a'],
  Silver: ['#ffffff', '#a9b8c9'],
  Gold: ['#fff1a8', '#f0a800'],
  Platinum: ['#e8fbff', '#79c9e6'],
  Diamond: ['#f1fdff', '#5fd6ff'],
}

/** The post that goes with the picture. */
export function scorecardPost(spec: Pick<ScorecardSpec, 'emoji' | 'title' | 'score'>) {
  return `${spec.emoji} I just scored ${spec.score.toLocaleString('en-US')} on ${spec.title}! Think you can beat me? 🏆\n\nPlay free: ${SITE_URL}\n\n@lazycublife #LazyCubLife`
}

export function xPostUrl(text: string) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load ${src}`))
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Largest font size from `size` down to `min` at which `text` fits `maxWidth`. Below that the text is
 * cut short with an ellipsis, so a very long name never runs off the card.
 */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, min: number, weight = 900) {
  let px = size
  ctx.font = `${weight} ${px}px ${FONT}`
  while (px > min && ctx.measureText(text).width > maxWidth) {
    px -= 2
    ctx.font = `${weight} ${px}px ${FONT}`
  }
  let shown = text
  while (shown.length > 1 && ctx.measureText(shown).width > maxWidth) shown = shown.slice(0, -1)
  if (shown !== text) shown = `${shown.slice(0, -1).trimEnd()}…`
  return { text: shown, px, width: ctx.measureText(shown).width }
}

/** Cartoon text: thick dark outline, a glossy two-tone fill and a soft drop shadow. */
function cartoonText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  px: number,
  fill: [string, string],
  align: CanvasTextAlign = 'center',
) {
  ctx.save()
  ctx.font = `900 ${px}px ${FONT}`
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
  ctx.shadowBlur = px * 0.14
  ctx.shadowOffsetY = px * 0.06
  ctx.lineWidth = Math.max(6, px * 0.17)
  ctx.strokeStyle = OUTLINE
  ctx.strokeText(text, x, y)
  ctx.shadowColor = 'transparent'
  const grad = ctx.createLinearGradient(0, y - px * 0.85, 0, y)
  grad.addColorStop(0, fill[0])
  grad.addColorStop(1, fill[1])
  ctx.fillStyle = grad
  ctx.fillText(text, x, y)
  ctx.restore()
}

/** Plain bold text with a dark outline, for the smaller labels. */
function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, colour: string, weight = 800) {
  ctx.save()
  ctx.font = `${weight} ${px}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(4, px * 0.14)
  ctx.strokeStyle = 'rgba(4, 10, 30, 0.9)'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = colour
  ctx.fillText(text, x, y)
  ctx.restore()
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number) {
  const scale = Math.max(size / img.width, size / img.height)
  const w = img.width * scale
  const h = img.height * scale
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
}

/**
 * Draws the scorecard on a 1200 × 1200 canvas: the logo across the top, the gameplay picture through the
 * middle, and the results panel (name plate, "<game> Score", badge) along the bottom.
 */
export async function drawScorecard(canvas: HTMLCanvasElement, spec: ScorecardSpec) {
  const S = SCORECARD_SIZE
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No canvas')
  await document.fonts?.ready
  const [bg, logo, badge, character] = await Promise.all([
    loadImage(spec.background),
    loadImage(logoUrl),
    spec.badge ? loadImage(spec.badge.src) : Promise.resolve(null),
    spec.character ? loadImage(spec.character) : Promise.resolve(null),
  ])

  // Gameplay, shaded only behind the header and the results so the middle stays bright.
  drawCover(ctx, bg, S)
  const top = ctx.createLinearGradient(0, 0, 0, 260)
  top.addColorStop(0, 'rgba(4, 10, 30, 0.6)')
  top.addColorStop(1, 'rgba(4, 10, 30, 0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, S, 260)
  const bottom = ctx.createLinearGradient(0, 620, 0, S)
  bottom.addColorStop(0, 'rgba(4, 10, 30, 0)')
  bottom.addColorStop(0.35, 'rgba(4, 10, 30, 0.45)')
  bottom.addColorStop(1, 'rgba(4, 10, 30, 0.85)')
  ctx.fillStyle = bottom
  ctx.fillRect(0, 620, S, S - 620)

  // Header: the hanging-sign logo, large and centred at the top of every card.
  const logoW = 783
  const logoH = (logo.height / logo.width) * logoW
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 10
  // The chains hang from the card's top edge.
  ctx.drawImage(logo, (S - logoW) / 2, 0, logoW, logoH)
  ctx.restore()

  // Results panel: centred, or moved right to make room for a character in the corner.
  const card = character ? { x: 380, y: 752, w: 790, h: 340, r: 44 } : { x: 190, y: 752, w: 820, h: 340, r: 44 }
  const centreX = card.x + card.w / 2
  ctx.save()
  ctx.shadowColor = 'rgba(255, 190, 60, 0.5)'
  ctx.shadowBlur = 34
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r)
  const face = ctx.createLinearGradient(0, card.y, 0, card.y + card.h)
  face.addColorStop(0, 'rgba(32, 72, 140, 0.94)')
  face.addColorStop(1, 'rgba(8, 21, 48, 0.96)')
  ctx.fillStyle = face
  ctx.fill()
  ctx.restore()
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r)
  ctx.lineWidth = 7
  ctx.strokeStyle = '#ffd060'
  ctx.stroke()

  // The cub stands in the bottom-left corner, in front of the panel. Every cut-out is the full
  // square layer frame, so all cubs share one size and spot.
  if (character) {
    const size = 785
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = 28
    ctx.shadowOffsetX = 6
    ctx.drawImage(character, -178, S - size, size, size)
    ctx.restore()
  }

  // Name plate across the panel's top edge: the player's name, large, in white-to-gold.
  const plateMax = character ? card.w + 20 : 1040
  const name = fitText(ctx, spec.username, plateMax - 110, 81, 40)
  const plateW = Math.min(plateMax, Math.max(420, name.width + 110))
  const plateH = 100
  const plateX = centreX - plateW / 2
  const plateY = card.y - plateH / 2
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
  ctx.shadowBlur = 22
  ctx.shadowOffsetY = 6
  roundRect(ctx, plateX, plateY, plateW, plateH, plateH / 2)
  const plate = ctx.createLinearGradient(0, plateY, 0, plateY + plateH)
  plate.addColorStop(0, '#1b2f63')
  plate.addColorStop(1, '#0a1530')
  ctx.fillStyle = plate
  ctx.fill()
  ctx.restore()
  roundRect(ctx, plateX, plateY, plateW, plateH, plateH / 2)
  const rim = ctx.createLinearGradient(0, plateY, 0, plateY + plateH)
  rim.addColorStop(0, '#fff1a8')
  rim.addColorStop(1, '#e09a00')
  ctx.lineWidth = 8
  ctx.strokeStyle = rim
  ctx.stroke()
  // Centred on the name's real height, so letters that hang below the line (g, y) stay inside the plate.
  ctx.font = `900 ${name.px}px ${FONT}`
  const nameBox = ctx.measureText(name.text)
  const nameBase = plateY + plateH / 2 + (nameBox.actualBoundingBoxAscent - nameBox.actualBoundingBoxDescent) / 2
  cartoonText(ctx, name.text, centreX, nameBase, name.px, ['#ffffff', '#ffe27a'])

  // Score on the left, badge on the right.
  const split = card.x + card.w - 320
  const scoreX = (card.x + split) / 2 + (character ? 14 : 0)
  const badgeX = (split + card.x + card.w) / 2
  // "<game> Score" and the score, centred as a block between the name plate's bottom and the panel's.
  const scoreW = split - card.x - (character ? 70 : 60)
  const label = fitText(ctx, `${spec.title} Score`, scoreW, 40, 24, 900)
  const labelAscent = ctx.measureText(label.text).actualBoundingBoxAscent
  const score = fitText(ctx, spec.score.toLocaleString('en-US'), scoreW, 150, 56)
  const scoreAscent = ctx.measureText(score.text).actualBoundingBoxAscent
  const gap = 26
  const spaceTop = plateY + plateH
  const spaceMid = (spaceTop + card.y + card.h) / 2
  const labelBase = spaceMid - (labelAscent + gap + scoreAscent) / 2 + labelAscent
  outlinedText(ctx, label.text, scoreX, labelBase, label.px, '#ffffff', 900)
  cartoonText(ctx, score.text, scoreX, labelBase + gap + scoreAscent, score.px, ['#fff6b8', '#ffc21a'])
  ctx.fillStyle = 'rgba(255, 208, 96, 0.35)'
  ctx.fillRect(split, card.y + 70, 3, card.h - 100)

  // Low enough to stay clear of the name plate even when a long name stretches it over this column.
  const badgeH = 148
  const badgeTop = card.y + 74
  if (spec.badge && badge) {
    const badgeW = (badge.width / badge.height) * badgeH
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
    ctx.shadowBlur = 18
    ctx.drawImage(badge, badgeX - badgeW / 2, badgeTop, badgeW, badgeH)
    ctx.restore()
    const tier = fitText(ctx, spec.badge.tier.toUpperCase(), 290, 50, 30)
    cartoonText(ctx, tier.text, badgeX, badgeTop + badgeH + 52, tier.px, TIER_COLOURS[spec.badge.tier])
    outlinedText(ctx, fitText(ctx, spec.badge.name, 290, 26, 18, 800).text, badgeX, badgeTop + badgeH + 86, 26, '#cfe6ff')
  } else {
    // A dashed, empty badge slot: no tier is awarded below Bronze.
    const cy = badgeTop + badgeH / 2
    ctx.save()
    ctx.beginPath()
    ctx.arc(badgeX, cy, badgeH / 2 - 10, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.fill()
    ctx.setLineDash([16, 12])
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(207, 230, 255, 0.6)'
    ctx.stroke()
    ctx.restore()
    outlinedText(ctx, '?', badgeX, cy + 32, 92, 'rgba(207, 230, 255, 0.8)', 900)
    cartoonText(ctx, 'UNRANKED', badgeX, badgeTop + badgeH + 52, 46, ['#ffffff', '#c9d6e4'])
    if (spec.firstBadgeAt) outlinedText(ctx, `Bronze at ${spec.firstBadgeAt.toLocaleString('en-US')}`, badgeX, badgeTop + badgeH + 86, 26, '#cfe6ff')
  }

  // Site address.
  ctx.save()
  const pillW = 400
  const pillH = 70
  const pillX = centreX - pillW / 2
  const pillY = S - pillH - 18
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 6
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2)
  const pill = ctx.createLinearGradient(0, pillY, 0, pillY + pillH)
  pill.addColorStop(0, '#ffe07a')
  pill.addColorStop(1, '#ffb300')
  ctx.fillStyle = pill
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = 4
  ctx.strokeStyle = '#7a4a00'
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = `900 44px ${FONT}`
  ctx.fillStyle = '#2a1800'
  ctx.fillText(SITE_LABEL, centreX, pillY + pillH / 2 + 15)
  ctx.restore()
}

/** The scorecard as a PNG. */
export async function renderScorecard(spec: ScorecardSpec): Promise<Blob> {
  const canvas = document.createElement('canvas')
  await drawScorecard(canvas, spec)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make the image'))), 'image/png')
  })
}
