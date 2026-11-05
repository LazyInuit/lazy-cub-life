import * as THREE from 'three'
import { batRadiusAt, type BatDesign, type BatPaint } from './bats'

/** Where the hands grip, in metres from the knob. The model's origin sits here. */
const GRIP = 0.06

/**
 * Turned bat from a design. Origin is the grip point and the barrel points along +Y.
 * The profile is resampled evenly so the painted texture runs true along the length.
 */
export function buildBatModel(design: BatDesign) {
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item)
    return item
  }
  const L = design.length
  const steps = 64
  const points = [new THREE.Vector2(0, 0)]
  for (let i = 0; i <= steps; i += 1) {
    const share = Math.min(0.999, Math.max(0.001, i / steps))
    points.push(new THREE.Vector2(batRadiusAt(design, share), share * L))
  }
  points.push(new THREE.Vector2(0, L))
  const geometry = track(new THREE.LatheGeometry(points, 32))
  geometry.translate(0, -GRIP, 0)

  const map = track(paintTexture(design.paint))
  const material = track(
    new THREE.MeshStandardMaterial({
      map,
      roughness: design.finish.roughness,
      metalness: design.finish.metalness,
      emissive: new THREE.Color(design.finish.emissive),
      emissiveIntensity: design.finish.emissiveIntensity,
    }),
  )
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geometry, material))

  if (design.grip) {
    const { from, to, color } = design.grip
    const r = Math.max(batRadiusAt(design, from + 0.03), batRadiusAt(design, to)) * 1.1
    const tape = new THREE.Mesh(
      track(new THREE.CylinderGeometry(r, r, (to - from) * L, 24, 1, true)),
      track(new THREE.MeshStandardMaterial({ color, roughness: 0.8 })),
    )
    tape.position.y = ((from + to) / 2) * L - GRIP
    group.add(tape)
  }

  const rest = { emissive: new THREE.Color(design.finish.emissive), intensity: design.finish.emissiveIntensity }
  return {
    group,
    setHeld(held: boolean) {
      material.emissive.set(held ? 0xffe2a0 : rest.emissive)
      material.emissiveIntensity = held ? 0.22 : rest.intensity
      group.scale.setScalar(held ? 1.05 : 1)
    },
    dispose() {
      disposables.forEach((item) => item.dispose())
    },
  }
}

const thumbs = new Map<string, string>()

/** Picture of each bat for the picker, drawn once with a single throwaway renderer. */
export function batThumbnails(designs: BatDesign[], size = 220): Map<string, string> {
  const missing = designs.filter((design) => !thumbs.has(design.id))
  if (missing.length === 0) return thumbs
  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(1)
  renderer.setSize(size, size, false)
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6b4a2c, 1.05))
  const sun = new THREE.DirectionalLight(0xfff2da, 1.45)
  sun.position.set(-3, 8, 6)
  scene.add(sun)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20)
  camera.position.set(0, 0.42, 1.5)
  camera.lookAt(0, 0.42, 0)
  for (const design of missing) {
    const model = buildBatModel(design)
    model.group.rotation.z = -0.75
    model.group.rotation.y = 0.5
    model.group.position.set(-0.27, 0.12, 0)
    scene.add(model.group)
    renderer.render(scene, camera)
    thumbs.set(design.id, canvas.toDataURL('image/png'))
    scene.remove(model.group)
    model.dispose()
  }
  renderer.dispose()
  renderer.forceContextLoss()
  return thumbs
}

/** Texture runs knob (bottom) to cap (top); across is around the bat. */
function paintTexture(paint: BatPaint) {
  const w = 128
  const h = 512
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const row = (share: number) => (1 - share) * h
  if (ctx) {
    ctx.fillStyle = paint.base
    ctx.fillRect(0, 0, w, h)
    if (paint.barrel) {
      const top = row(1)
      const start = row(paint.barrel.from)
      const fade = ctx.createLinearGradient(0, start + 18, 0, start - 18)
      fade.addColorStop(0, paint.base)
      fade.addColorStop(1, paint.barrel.color)
      ctx.fillStyle = fade
      ctx.fillRect(0, start - 18, w, 36)
      ctx.fillStyle = paint.barrel.color
      ctx.fillRect(0, top, w, start - 18 - top)
    }
    if (paint.grain) {
      let seed = 7
      const rand = () => {
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
      }
      for (let i = 0; i < 26; i += 1) {
        ctx.strokeStyle = `rgba(60, 30, 10, ${0.06 + rand() * 0.1})`
        ctx.lineWidth = 1 + rand() * 2
        const x = rand() * w
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.bezierCurveTo(x + (rand() - 0.5) * 14, h * 0.33, x + (rand() - 0.5) * 14, h * 0.66, x + (rand() - 0.5) * 10, h)
        ctx.stroke()
      }
    }
    if (paint.stripes) {
      ctx.strokeStyle = paint.stripes.color
      const pitch = h / paint.stripes.count
      ctx.lineWidth = pitch * 0.42
      for (let i = -2; i < paint.stripes.count + 2; i += 1) {
        const y = i * pitch
        ctx.beginPath()
        ctx.moveTo(-10, y)
        ctx.lineTo(w + 10, y + pitch)
        ctx.stroke()
      }
    }
    for (const band of paint.bands ?? []) {
      ctx.fillStyle = band.color
      ctx.fillRect(0, row(band.at + band.width / 2), w, band.width * h)
    }
    if (paint.knob) {
      ctx.fillStyle = paint.knob
      ctx.fillRect(0, row(0.05), w, 0.05 * h)
    }
    if (paint.cap) {
      ctx.fillStyle = paint.cap
      ctx.fillRect(0, 0, w, 0.025 * h)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
