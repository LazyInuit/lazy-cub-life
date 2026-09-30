import * as THREE from 'three'
import panoramaUrl from '../../assets/lazy-hoops/stadium/panorama-v4.png'

/**
 * Fixed cylindrical bowl around the court (world-space, no camera follow).
 * Crops the panorama's solid black floor strip so seats sit above the 3D court.
 * Bowl centred on the court; image centre (banner) sits behind the post.
 */
type Track = <T extends { dispose: () => void }>(item: T) => T

export type Stadium = {
  update: (_timeMs: number) => void
  setView: (_cam: { x: number; z: number }) => void
}

export function buildStadium(
  scene: THREE.Scene,
  track: Track,
  redraw: () => void,
  floor: { x: number; z: number; w: number; d: number },
): Stadium {
  const group = new THREE.Group()
  group.name = 'stadium'
  scene.add(group)

  const tex = track(new THREE.TextureLoader().load(panoramaUrl, () => redraw()))
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  // Skip the solid black floor strip; keep seats + upper bowl.
  const blackFrac = 0.28
  tex.offset.y = blackFrac
  tex.repeat.y = 1 - blackFrac
  tex.offset.x = 0

  const mat = track(new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    fog: false,
    toneMapped: false,
    depthWrite: false,
  }))

  // Height matched to cropped image aspect so seats aren’t vertically squashed.
  const radius = 20
  const height = Math.PI * radius * (1 - blackFrac)
  const mesh = new THREE.Mesh(
    track(new THREE.CylinderGeometry(radius, radius, height, 72, 1, true)),
    mat,
  )
  // Centre on the court; seats just above the apron.
  mesh.position.set(floor.x, height * 0.5 + 0.35, floor.z)
  // Image centre (u=0.5) is local -Z — keep yaw 0 so the centre banner sits behind the post.
  mesh.rotation.y = 0
  mesh.renderOrder = -1
  mesh.frustumCulled = false
  group.add(mesh)

  const lid = new THREE.Mesh(
    track(new THREE.CircleGeometry(radius * 0.98, 48)),
    track(new THREE.MeshBasicMaterial({
      color: 0x0a0a0c,
      side: THREE.BackSide,
      fog: false,
      toneMapped: false,
      depthWrite: false,
    })),
  )
  lid.rotation.x = Math.PI / 2
  lid.position.set(mesh.position.x, mesh.position.y + height * 0.5 - 0.05, mesh.position.z)
  lid.renderOrder = -1
  lid.frustumCulled = false
  group.add(lid)

  return {
    update() {},
    setView() {},
  }
}
