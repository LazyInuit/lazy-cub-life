import * as THREE from 'three'
import ballUrl from '../../assets/lazy-hoops/ball-wrap.png'
import boardUrl from '../../assets/lazy-hoops/board.png'
import courtUrl from '../../assets/lazy-hoops/court.png'
import postUrl from '../../assets/lazy-hoops/post.png'
import {
  BACKBOARD_Z,
  BALL_RADIUS,
  lookTarget,
  RIM_RADIUS,
  RIM_TUBE,
  RIM_Y,
  RIM_Z,
} from './config'
import { buildStadium } from './stadium'
import type { Vec3 } from './sim'

export type Court = {
  resize: (width: number, height: number) => void
  setCamera: (pos: Vec3, lookAt?: Vec3) => void
  setBall: (pos: Vec3, vel: Vec3, visible: boolean) => void
  setFlash: (kind: 'normal' | 'perfect' | null) => void
  project: (pos: Vec3, width: number, height: number) => { x: number; y: number }
  render: () => void
  dispose: () => void
}

export function createCourt(canvas: HTMLCanvasElement): Court {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setClearColor(0x000000, 1)

  const scene = new THREE.Scene()
  scene.fog = null
  scene.background = new THREE.Color(0x000000)

  const camera = new THREE.PerspectiveCamera(48, 1, 0.08, 100)
  camera.position.set(0, 1.72, 4.2)
  const redraw = () => renderer.render(scene, camera)

  const hemi = new THREE.HemisphereLight(0xffe2b8, 0x2a1c12, 0.55)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.05)
  sun.position.set(4, 12, 7)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.near = 2
  sun.shadow.camera.far = 32
  sun.shadow.camera.left = -12
  sun.shadow.camera.right = 12
  sun.shadow.camera.top = 12
  sun.shadow.camera.bottom = -8
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0xffc878, 0.32)
  fill.position.set(-5, 5, 3)
  scene.add(fill)
  const rimLight = new THREE.DirectionalLight(0xffe8c0, 0.22)
  rimLight.position.set(0, 6, -8)
  scene.add(rimLight)

  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item)
    return item
  }

  const floorW = 12
  const floorD = 21
  const floorX = floorW * 0.015
  const floorZ = 6.2
  const floorTex = artTexture(courtUrl, track, redraw)
  floorTex.center.set(0.5, 0.5)
  floorTex.rotation = Math.PI / 2
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(floorW, floorD)),
    track(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0.08 })),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(floorX, 0, floorZ)
  floor.receiveShadow = true
  scene.add(floor)

  const apron = new THREE.Mesh(
    track(new THREE.PlaneGeometry(48, 48)),
    track(new THREE.MeshStandardMaterial({ color: 0x100e0b, roughness: 1 })),
  )
  apron.rotation.x = -Math.PI / 2
  apron.position.set(0, -0.02, 6)
  apron.receiveShadow = true
  scene.add(apron)

  const stadium = buildStadium(scene, track, redraw, { x: floorX, z: floorZ, w: floorW, d: floorD })
  const { rimMat } = buildHoop(scene, track, artTexture(boardUrl, track, redraw), artTexture(postUrl, track, redraw))

  const ballTex = artTexture(ballUrl, track, redraw)
  ballTex.wrapS = THREE.RepeatWrapping
  ballTex.wrapT = THREE.ClampToEdgeWrapping
  ballTex.anisotropy = 16
  const ball = new THREE.Mesh(
    track(new THREE.SphereGeometry(BALL_RADIUS, 48, 32)),
    track(new THREE.MeshStandardMaterial({
      map: ballTex,
      roughness: 0.42,
      metalness: 0.05,
      emissive: 0xffffff,
      emissiveMap: ballTex,
      emissiveIntensity: 0.28,
    })),
  )
  ball.rotation.y = 1.15
  ball.castShadow = true
  ball.position.set(0, 1.08, 2.9)
  scene.add(ball)

  const projectVec = new THREE.Vector3()
  let flash = 0

  const court: Court = {
    resize(width, height) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
      renderer.setPixelRatio(dpr)
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(1, height)
      camera.fov = width / height < 0.62 ? 54 : 52
      camera.updateProjectionMatrix()
    },
    setCamera(pos, lookAt) {
      camera.position.set(pos.x, pos.y, pos.z)
      camera.up.set(0, 1, 0)
      const look = lookAt ?? lookTarget(pos)
      camera.lookAt(look.x, look.y, look.z)
      stadium.setView(pos)
    },
    setBall(pos, vel, visible) {
      ball.visible = visible
      ball.position.set(pos.x, pos.y, pos.z)
      const spin = 4.5
      ball.rotation.x += vel.z * spin * 0.016
      ball.rotation.z -= vel.x * spin * 0.016
    },
    setFlash(kind) {
      flash = kind ? 1 : 0
      if (kind === 'perfect') rimMat.emissive.set(0xffc44d)
      else if (kind === 'normal') rimMat.emissive.set(0xfff2cc)
      else rimMat.emissive.set(0x000000)
    },
    project(pos, width, height) {
      projectVec.set(pos.x, pos.y, pos.z).project(camera)
      return {
        x: (projectVec.x * 0.5 + 0.5) * width,
        y: (-projectVec.y * 0.5 + 0.5) * height,
      }
    },
    render() {
      stadium.update(performance.now())
      if (flash > 0) {
        flash = Math.max(0, flash - 0.04)
        rimMat.emissiveIntensity = flash * 0.85
        if (flash === 0) rimMat.emissive.set(0x000000)
      }
      renderer.render(scene, camera)
    },
    dispose() {
      disposables.forEach((item) => item.dispose())
      renderer.dispose()
    },
  }
  return court
}

function buildHoop(
  scene: THREE.Scene,
  track: <T extends { dispose: () => void }>(item: T) => T,
  boardMap: THREE.Texture,
  postMap: THREE.Texture,
) {
  const metal = track(new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.62, roughness: 0.38 }))
  const gold = track(new THREE.MeshStandardMaterial({
    color: 0xe2b04a,
    metalness: 0.7,
    roughness: 0.32,
    emissive: 0x6a4a10,
    emissiveIntensity: 0.25,
  }))
  const rimMat = track(new THREE.MeshStandardMaterial({ color: 0xf15a12, metalness: 0.72, roughness: 0.28, emissive: 0x000000 }))

  const boardH = 1.48
  const boardW = boardH * (1024 / 576)
  const boardY = RIM_Y + boardH * 0.5
  const board = new THREE.Mesh(
    track(new THREE.PlaneGeometry(boardW, boardH)),
    track(new THREE.MeshStandardMaterial({ map: boardMap, transparent: true, alphaTest: 0.08, roughness: 0.42 })),
  )
  board.position.set(0, boardY, BACKBOARD_Z + 0.05)
  board.castShadow = true
  scene.add(board)
  const edge = new THREE.Mesh(track(new THREE.BoxGeometry(boardW * 0.78, boardH * 0.7, 0.07)), metal)
  edge.position.set(0, boardY + 0.06, BACKBOARD_Z - 0.02)
  scene.add(edge)

  const postH = 3.22
  const postW = postH * (515 / 1024)
  const postZ = BACKBOARD_Z - 0.045
  const post = new THREE.Mesh(
    track(new THREE.PlaneGeometry(postW, postH)),
    track(new THREE.MeshStandardMaterial({ map: postMap, transparent: true, alphaTest: 0.08, roughness: 0.45, metalness: 0.2 })),
  )
  post.position.set(0, postH / 2, postZ)
  post.castShadow = true
  scene.add(post)

  const block = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    scene.add(mesh)
  }
  block(0.72, 0.2, 0.72, 0, 0.1, BACKBOARD_Z - 0.43, metal)
  block(0.42, 0.95, 0.52, 0, 0.68, BACKBOARD_Z - 0.35, metal)
  block(0.18, 2.4, 0.34, 0, 2.05, BACKBOARD_Z - 0.23, metal)
  block(0.24, 0.5, 0.28, 0, 3.0, BACKBOARD_Z - 0.15, metal)
  block(0.44, 0.018, 0.52, 0, 1.16, BACKBOARD_Z - 0.35, gold)
  block(0.2, 0.018, 0.34, 0, 2.82, BACKBOARD_Z - 0.23, gold)

  const rim = new THREE.Mesh(track(new THREE.TorusGeometry(RIM_RADIUS, RIM_TUBE * 1.3, 16, 48)), rimMat)
  rim.rotation.x = Math.PI / 2
  rim.position.set(0, RIM_Y, RIM_Z)
  rim.castShadow = true
  scene.add(rim)

  const armNear = RIM_Z - (RIM_RADIUS - RIM_TUBE)
  const armFar = BACKBOARD_Z + 0.04
  const arm = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.048, armNear - armFar)), rimMat)
  arm.position.set(0, RIM_Y, (armNear + armFar) / 2)
  scene.add(arm)

  const netLines = new THREE.LineSegments(
    track(netGeometry()),
    track(new THREE.LineBasicMaterial({ color: 0xf4f0e8 })),
  )
  scene.add(netLines)
  return { rimMat }
}

function netGeometry() {
  const positions: number[] = []
  const count = 14
  const twist = 0.4
  const topDrop = RIM_TUBE * 1.3 + 0.012
  // Net length tracks rim scale (was authored for RIM_RADIUS 0.8132).
  const bottomDrop = 1.452 * (RIM_RADIUS / 0.8132)
  const topRadius = RIM_RADIUS - RIM_TUBE
  const bottomRadius = RIM_RADIUS * 0.38
  const rings = [
    { drop: topDrop, radius: topRadius, twist: 0 },
    { drop: bottomDrop, radius: bottomRadius, twist },
  ]
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2
    positions.push(
      Math.cos(a) * topRadius,
      RIM_Y - topDrop,
      Math.sin(a) * topRadius + RIM_Z,
      Math.cos(a + twist) * bottomRadius,
      RIM_Y - bottomDrop,
      Math.sin(a + twist) * bottomRadius + RIM_Z,
    )
  }
  for (const ring of rings) {
    for (let i = 0; i < count; i += 1) {
      const a0 = (i / count) * Math.PI * 2 + ring.twist
      const a1 = ((i + 1) / count) * Math.PI * 2 + ring.twist
      positions.push(
        Math.cos(a0) * ring.radius,
        RIM_Y - ring.drop,
        Math.sin(a0) * ring.radius + RIM_Z,
        Math.cos(a1) * ring.radius,
        RIM_Y - ring.drop,
        Math.sin(a1) * ring.radius + RIM_Z,
      )
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geo
}

function artTexture(
  url: string,
  track: <T extends { dispose: () => void }>(item: T) => T,
  redraw: () => void,
) {
  const tex = track(new THREE.TextureLoader().load(url, redraw))
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

