import * as THREE from 'three'
import machineEmptyUrl from '../../assets/baseball/machine-empty.png'
import machineLoadedUrl from '../../assets/baseball/machine-loaded.png'
import { canvasRatio } from '../frameScale'
import { buildBatModel } from './batModel'
import { batBarrelRadius, type BatDesign } from './bats'
import { BAT, CANVAS_RATIO, FIELD, MACHINE, type Vec3 } from './config'
import type { Calibration } from './layout'
import { machineFrame } from './pitch'

export type BaseballScene = {
  resize: (width: number, height: number) => void
  setBall: (pos: Vec3, radius: number, visible: boolean, spin: number) => void
  setBat: (dir: Vec3, hands: Vec3) => void
  /** Glow while the player is holding the bat. */
  setBatHeld: (held: boolean) => void
  /** Swaps the bat's look, keeping its current pose. */
  setBatDesign: (design: BatDesign) => void
  /** Hands and barrel tip in canvas pixels, plus the barrel's on-screen half-thickness. */
  batOnScreen: () => { hands: { x: number; y: number }; tip: { x: number; y: number }; halfWidth: number }
  setMachineLoaded: (loaded: boolean) => void
  /** Where the machine's base sits on the ground (it drives between firing spots). */
  setMachineBase: (base: Vec3) => void
  /** Machine recoil and puff. Call in the same frame the ball is first shown. */
  fire: () => void
  flash: (pos: Vec3, strength: number) => void
  /** World point to canvas pixels (CSS size passed to resize). */
  project: (pos: Vec3) => { x: number; y: number }
  render: () => void
  dispose: () => void
}

type Track = <T extends { dispose: () => void }>(item: T) => T

export function createBaseballScene(canvas: HTMLCanvasElement, cal: Calibration, startDesign: BatDesign): BaseballScene {
  let design = startDesign
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(cal.fov, cal.aspect, 0.05, 400)
  camera.position.set(0, cal.height, cal.distance)
  camera.rotation.set(-cal.pitch, 0, 0)
  /** Off-centre lens: never call updateProjectionMatrix, which would re-centre it. */
  const applyLens = () => {
    const n = camera.near
    const halfW = (n * 0.5 * cal.aspect) / cal.focal
    camera.projectionMatrix.makePerspective(-halfW, halfW, (n * cal.centreY) / cal.focal, (-n * (1 - cal.centreY)) / cal.focal, n, camera.far)
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  }
  applyLens()

  let width = 1
  let height = 1

  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6b4a2c, 1.05))
  const sun = new THREE.DirectionalLight(0xfff2da, 1.45)
  sun.position.set(-3, 8, 6)
  scene.add(sun)
  const rim = new THREE.DirectionalLight(0xcfe4ff, 0.4)
  rim.position.set(4, 3, -6)
  scene.add(rim)

  const disposables: { dispose: () => void }[] = []
  const track: Track = (item) => {
    disposables.push(item)
    return item
  }

  const frame = machineFrame()
  const loadedTex = artTexture(machineLoadedUrl, track)
  const emptyTex = artTexture(machineEmptyUrl, track)
  const machineGeo = track(new THREE.PlaneGeometry(frame.width, frame.height))
  machineGeo.translate(0, frame.height / 2 - (1 - MACHINE.baseFrac) * frame.height, 0)
  const machineMat = track(new THREE.MeshBasicMaterial({ map: loadedTex, transparent: true, alphaTest: 0.04, toneMapped: false }))
  const machine = new THREE.Mesh(machineGeo, machineMat)
  let machineBase: Vec3 = { ...frame.base }
  let puffAt: Vec3 = { ...frame.chute }
  machine.position.set(machineBase.x, machineBase.y, machineBase.z)
  scene.add(machine)

  const softTex = track(radialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.55, 'rgba(255,255,255,0.55)'],
    [1, 'rgba(255,255,255,0)'],
  ]))
  const puffs = Array.from({ length: 5 }, () => {
    const sprite = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: softTex, color: 0xf4efe6, transparent: true, depthWrite: false, opacity: 0 })))
    sprite.visible = false
    scene.add(sprite)
    return { sprite, dx: 0, dy: 0 }
  })

  const ballTex = track(stitchedBallTexture())
  const ball = new THREE.Mesh(
    track(new THREE.SphereGeometry(1, 32, 20)),
    track(new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveMap: ballTex, emissiveIntensity: 0.22 })),
  )
  ball.rotation.set(0.4, 1.2, 0)
  ball.visible = false
  scene.add(ball)

  const shadowTex = track(radialTexture([
    [0, 'rgba(0,0,0,0.75)'],
    [0.6, 'rgba(0,0,0,0.35)'],
    [1, 'rgba(0,0,0,0)'],
  ]))
  const shadowMat = track(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.4 }))
  const shadow = new THREE.Mesh(track(new THREE.PlaneGeometry(2, 2)), shadowMat)
  shadow.rotation.x = -Math.PI / 2
  shadow.visible = false
  scene.add(shadow)

  let batModel = buildBatModel(design)
  let bat = batModel.group
  bat.position.set(BAT.hands.x, BAT.hands.y, BAT.hands.z)
  scene.add(bat)

  const flashTex = track(radialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.25, 'rgba(255,246,196,0.95)'],
    [0.6, 'rgba(255,196,80,0.35)'],
    [1, 'rgba(255,170,40,0)'],
  ]))
  const flashMat = track(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }))
  const flashSprite = new THREE.Sprite(flashMat)
  flashSprite.visible = false
  flashSprite.renderOrder = 10
  scene.add(flashSprite)

  const up = new THREE.Vector3(0, 1, 0)
  const dirVec = new THREE.Vector3()
  const projectVec = new THREE.Vector3()
  let firedAt = -1
  let loadedAt = -1
  let flashAt = -1
  let flashStrength = 1

  const api: BaseballScene = {
    resize(w, h) {
      width = Math.max(1, w)
      height = Math.max(1, h)
      renderer.setPixelRatio(canvasRatio(CANVAS_RATIO))
      renderer.setSize(width, height, false)
      applyLens()
    },
    setBall(pos, radius, visible, spin) {
      ball.visible = visible
      shadow.visible = visible
      if (!visible) return
      ball.position.set(pos.x, pos.y, pos.z)
      ball.scale.setScalar(radius)
      ball.rotation.x += spin
      const lift = Math.max(0, pos.y - radius)
      shadow.position.set(pos.x, FIELD.groundY + 0.004, pos.z)
      shadow.scale.setScalar(radius * (1.05 + Math.min(lift, 10) * 0.06))
      shadowMat.opacity = 0.42 * Math.max(0.18, 1 - lift / 14)
    },
    setBat(dir, hands) {
      dirVec.set(dir.x, dir.y, dir.z).normalize()
      bat.quaternion.setFromUnitVectors(up, dirVec)
      bat.position.set(hands.x, hands.y, hands.z)
    },
    setBatHeld(held) {
      batModel.setHeld(held)
    },
    setBatDesign(next) {
      if (next.id === design.id) return
      const pose = { position: bat.position.clone(), quaternion: bat.quaternion.clone() }
      scene.remove(bat)
      batModel.dispose()
      design = next
      batModel = buildBatModel(design)
      bat = batModel.group
      bat.position.copy(pose.position)
      bat.quaternion.copy(pose.quaternion)
      scene.add(bat)
    },
    batOnScreen() {
      const h = bat.position
      const L = design.length
      const hands = api.project(h)
      const tipWorld = { x: h.x + dirVec.x * L, y: h.y + dirVec.y * L, z: h.z + dirVec.z * L }
      const tip = api.project(tipWorld)
      const midWorld = { x: (h.x + tipWorld.x) / 2, y: (h.y + tipWorld.y) / 2, z: (h.z + tipWorld.z) / 2 }
      const mid = api.project(midWorld)
      const edge = api.project({ ...midWorld, y: midWorld.y + batBarrelRadius(design) })
      return { hands, tip, halfWidth: Math.hypot(edge.x - mid.x, edge.y - mid.y) }
    },
    setMachineLoaded(loaded) {
      const map = loaded ? loadedTex : emptyTex
      if (machineMat.map === map) return
      machineMat.map = map
      if (loaded) loadedAt = performance.now()
    },
    setMachineBase(base) {
      machineBase = { ...base }
    },
    fire() {
      firedAt = performance.now()
      puffAt = machineFrame(machineBase).chute
      machineMat.map = emptyTex
      puffs.forEach((puff, i) => {
        const angle = (i / puffs.length) * Math.PI * 2
        puff.dx = Math.cos(angle) * 0.35
        puff.dy = Math.sin(angle) * 0.22 + 0.1
        puff.sprite.visible = true
      })
    },
    flash(pos, strength) {
      flashAt = performance.now()
      flashStrength = strength
      flashSprite.position.set(pos.x, pos.y, pos.z + 0.05)
      flashSprite.visible = true
    },
    project(pos) {
      projectVec.set(pos.x, pos.y, pos.z).project(camera)
      return { x: (projectVec.x * 0.5 + 0.5) * width, y: (-projectVec.y * 0.5 + 0.5) * height }
    },
    render() {
      const now = performance.now()
      animateMachine(now)
      animateFlash(now)
      renderer.render(scene, camera)
    },
    dispose() {
      disposables.forEach((item) => item.dispose())
      batModel.dispose()
      renderer.dispose()
    },
  }
  return api

  function animateMachine(now: number) {
    let sx = 1
    let sy = 1
    let kick = 0
    const fireK = (now - firedAt) / 1000 / MACHINE.recoil
    if (firedAt >= 0 && fireK < 1) {
      const pulse = Math.sin(Math.PI * fireK) * (1 - fireK * 0.4)
      sy = 1 - 0.07 * pulse
      sx = 1 + 0.035 * pulse
      kick = -0.35 * pulse
    }
    const loadK = (now - loadedAt) / 1000 / MACHINE.reload
    if (loadedAt >= 0 && loadK < 1) {
      const pop = Math.sin(Math.PI * loadK) * 0.045
      sx += pop
      sy += pop
    }
    machine.scale.set(sx, sy, 1)
    machine.position.set(machineBase.x, machineBase.y, machineBase.z + kick)

    const puffK = (now - firedAt) / 1000 / 0.5
    puffs.forEach((puff) => {
      if (firedAt < 0 || puffK >= 1) {
        puff.sprite.visible = false
        return
      }
      const ease = 1 - (1 - puffK) * (1 - puffK)
      puff.sprite.position.set(puffAt.x + puff.dx * ease, puffAt.y + puff.dy * ease, puffAt.z + 0.1)
      puff.sprite.scale.setScalar(0.18 + ease * 0.55)
      puff.sprite.material.opacity = 0.75 * (1 - puffK)
    })
  }

  function animateFlash(now: number) {
    if (flashAt < 0) return
    const k = (now - flashAt) / 1000 / 0.26
    if (k >= 1) {
      flashSprite.visible = false
      flashAt = -1
      return
    }
    flashSprite.scale.setScalar((0.35 + (1 - (1 - k) * (1 - k)) * 0.85) * flashStrength)
    flashMat.opacity = 1 - k * k
  }
}

function artTexture(url: string, track: Track) {
  const tex = track(new THREE.TextureLoader().load(url))
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function radialTexture(stops: [number, string][]) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    stops.forEach(([at, color]) => grad.addColorStop(at, color))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Equirectangular leather with the figure-eight seam and red V stitches. */
function stitchedBallTexture() {
  const w = 512
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const base = ctx.createLinearGradient(0, 0, 0, h)
    base.addColorStop(0, '#f2ede3')
    base.addColorStop(0.5, '#fbf8f2')
    base.addColorStop(1, '#e9e2d4')
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    const seamY = (u: number) => h * (0.5 + 0.24 * Math.sin(u * Math.PI * 4))
    ctx.strokeStyle = 'rgba(170,40,40,0.55)'
    ctx.lineWidth = 3
    ctx.beginPath()
    for (let x = 0; x <= w; x += 2) {
      const y = seamY(x / w)
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.strokeStyle = '#d0262b'
    ctx.lineWidth = 3.2
    ctx.lineCap = 'round'
    const stitches = 56
    for (let i = 0; i < stitches; i += 1) {
      const u = (i + 0.5) / stitches
      const x = u * w
      const y = seamY(u)
      const slope = (seamY(u + 0.001) - seamY(u - 0.001)) / (0.002 * w)
      const nx = -slope / Math.hypot(1, slope)
      const ny = 1 / Math.hypot(1, slope)
      const tx = 1 / Math.hypot(1, slope)
      const ty = slope / Math.hypot(1, slope)
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(x + nx * 3 * side, y + ny * 3 * side)
        ctx.lineTo(x + nx * 11 * side + tx * 4, y + ny * 11 * side + ty * 4)
        ctx.stroke()
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
