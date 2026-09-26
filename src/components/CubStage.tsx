import { useEffect, useRef } from 'react'
import { drawCubEffects, drawHomeBackground, drawHomeChair, drawHomeTable, homeCharacterBox } from '../game/drawCub'
import { characterLayers, type TryOn } from '../game/cubTraits'
import { artSize, fitInBox, homeArt, homeItem, slotBox, slotScale } from '../game/homeScene'
import { playPlantRuffle } from '../game/plantAudio'
import { playTableKnock } from '../game/tableAudio'
import { playWindowTap } from '../game/windowAudio'
import type { CubAppearance, CubPose } from '../game/types'

type Props = {
  appearance: CubAppearance
  pose: CubPose
  dim?: boolean
  onPet?: () => void
  mode?: 'home' | 'wardrobe'
  tryOn?: TryOn | null
}

type Motion = {
  x: number
  y: number
  rot: number
}

function poseMotion(pose: CubPose, time: number): Motion {
  switch (pose) {
    case 'eat':
      return { x: 0, y: 6, rot: 0.06 }
    case 'sleep':
      return { x: 0, y: 0, rot: 0 }
    case 'wash':
      return { x: Math.sin(time * 5) * 6, y: 0, rot: 0 }
    case 'react':
      return { x: 0, y: 0, rot: 0 }
    case 'happy':
      return { x: 0, y: -Math.abs(Math.sin(time * 7)) * 8, rot: Math.sin(time * 5) * 0.04 }
    case 'sad':
      return { x: 0, y: 0, rot: 0 }
    default:
      return { x: 0, y: 0, rot: 0 }
  }
}

function coverRoom(ctx: CanvasRenderingContext2D, image: CanvasImageSource, stageW: number, stageH: number, pixelW: number, pixelH: number) {
  const cover = Math.max(stageW / pixelW, stageH / pixelH)
  const w = pixelW * cover
  const h = pixelH * cover
  const x = Math.min(0, Math.max(stageW - w, stageW * 0.5 - w * 0.5))
  const y = Math.min(0, Math.max(stageH - h, stageH * 0.36 - h * 0.4))
  ctx.drawImage(image, x, y, w, h)
}

export function CubStage({ pose, dim = false, onPet, mode = 'home', tryOn = null }: Props) {
  const roomRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<HTMLCanvasElement>(null)
  const poseRef = useRef(pose)
  const dimRef = useRef(dim)
  const modeRef = useRef(mode)
  const tryOnRef = useRef(tryOn)
  poseRef.current = pose
  dimRef.current = dim
  modeRef.current = mode
  tryOnRef.current = tryOn

  useEffect(() => {
    const room = roomRef.current
    const view = viewRef.current
    const fx = fxRef.current
    if (!room || !view || !fx) return

    let alive = true
    const started = performance.now()
    let frame = 0
    const paint = (now: number) => {
      if (!alive) return
      const rect = room.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(rect.width * dpr))
      const height = Math.max(1, Math.floor(rect.height * dpr))
      for (const canvas of [room, view, fx]) {
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
      }
      const wardrobe = modeRef.current === 'wardrobe'
      const wardrobeLift = wardrobe ? rect.height * 0.04 : 0
      const tableSlot = slotBox('table', rect.width, rect.height)
      const cubBox = homeCharacterBox(rect.width, rect.height)
      const homeTableArt = homeArt('table-1')
      const homeTableTop = homeTableArt
        ? fitInBox(artSize(homeTableArt).w, artSize(homeTableArt).h, tableSlot).y
        : tableSlot.y
      // The table picture's wood starts below its fitted box. This keeps the cub on that edge.
      const tableLip = tableSlot.h * 0.072
      const homeSit = !wardrobe && cubBox ? Math.max(0, cubBox.y + cubBox.h - homeTableTop - tableLip) : 0
      const roomCtx = room.getContext('2d')
      if (roomCtx && rect.width > 0 && rect.height > 0) {
        roomCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        if (wardrobe) {
          roomCtx.clearRect(0, 0, rect.width, rect.height)
          const bedroom = homeArt('bedroom-2')
          if (bedroom) {
            const size = artSize(bedroom)
            if (size.w > 0 && size.h > 0) coverRoom(roomCtx, bedroom, rect.width, rect.height, size.w, size.h)
          }
        } else {
          drawHomeBackground(roomCtx, rect.width, rect.height, dimRef.current)
          drawHomeChair(roomCtx, rect.width, rect.height, 'back', -homeSit)
        }
      }

      const viewCtx = view.getContext('2d')
      const time = (now - started) / 1000
      if (viewCtx && rect.width > 0 && rect.height > 0) {
        viewCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        viewCtx.clearRect(0, 0, rect.width, rect.height)
        const layers = characterLayers(now, wardrobe ? tryOnRef.current : null)
        const box = homeCharacterBox(rect.width, rect.height)
        if (layers.length && box) {
          const motion = poseMotion(poseRef.current, time)
          viewCtx.save()
          viewCtx.translate(box.x + box.w / 2 + motion.x, box.y + box.h + motion.y - wardrobeLift - homeSit)
          viewCtx.rotate((slotScale.character.restRot ?? 0) + motion.rot)
          for (const layer of layers) {
            viewCtx.drawImage(layer, -box.w / 2, -box.h, box.w, box.h)
          }
          viewCtx.restore()
        }
      }

      const fxCtx = fx.getContext('2d')
      if (fxCtx && rect.width > 0 && rect.height > 0) {
        fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        fxCtx.clearRect(0, 0, rect.width, rect.height)
        const table = slotBox('table', rect.width, rect.height)
        const cub = homeCharacterBox(rect.width, rect.height)
        const tableArt = homeArt(wardrobe ? 'chest-1' : homeItem('table').id)
        const fittedTop = tableArt ? fitInBox(artSize(tableArt).w, artSize(tableArt).h, table).y : table.y
        const sitDrop = wardrobe && cub ? cub.y + cub.h - fittedTop - wardrobeLift : 0
        drawHomeTable(fxCtx, rect.width, rect.height, wardrobe ? 'chest-1' : 'table-1', sitDrop)
        if (!wardrobe) drawCubEffects(fxCtx, poseRef.current, time, rect.width, rect.height)
        const dockBottom = rect.height - (table.y + table.h) + 36
        const roomEl = room.closest('.home-room') as HTMLElement | null
        roomEl?.style.setProperty('--dock-bottom', `${Math.max(0, dockBottom)}px`)
        roomEl?.style.setProperty('--table-top', `${fittedTop + sitDrop}px`)
        const bg = slotBox('background', rect.width, rect.height)
        const stage = room.parentElement
        if (stage && !wardrobe) {
          const windowY = bg.y + bg.h * 0.2
          const chair = slotBox('chair', rect.width, rect.height)
          const chairTop = chair.y - homeSit
          const windowH = Math.max(40, Math.min(bg.h * 0.38, chairTop - windowY - chair.h * 0.12))
          stage.style.setProperty('--window-x', `${bg.x + bg.w * 0.15}px`)
          stage.style.setProperty('--window-y', `${windowY}px`)
          stage.style.setProperty('--window-w', `${bg.w * 0.72}px`)
          stage.style.setProperty('--window-h', `${windowH}px`)
          stage.style.setProperty('--plant-x', `${bg.x + bg.w * 0.01}px`)
          stage.style.setProperty('--plant-y', `${bg.y + bg.h * 0.43}px`)
          stage.style.setProperty('--plant-w', `${bg.w * 0.24}px`)
          stage.style.setProperty('--plant-h', `${bg.h * 0.2}px`)
          if (cub) {
            const cubTop = cub.y - homeSit
            const petBottom = Math.min(cub.y + cub.h - homeSit, table.y)
            stage.style.setProperty('--pet-x', `${cub.x}px`)
            stage.style.setProperty('--pet-y', `${cubTop}px`)
            stage.style.setProperty('--pet-w', `${cub.w * 0.76}px`)
            stage.style.setProperty('--pet-h', `${Math.max(0, petBottom - cubTop)}px`)
          }
          const tableTop = table.y + 22
          stage.style.setProperty('--table-x', '0px')
          stage.style.setProperty('--table-y', `${tableTop}px`)
          stage.style.setProperty('--table-w', `${rect.width}px`)
          stage.style.setProperty('--table-h', '32px')
        }
      }
      frame = requestAnimationFrame(paint)
    }
    frame = requestAnimationFrame(paint)

    return () => {
      alive = false
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div className="stage-wrap">
      <canvas ref={roomRef} className="stage" />
      <canvas ref={viewRef} className="stage cub-3d" />
      <canvas ref={fxRef} className="stage cub-fx" />
      {dim && mode !== 'wardrobe' ? <div className="sleep-dim" /> : null}
      {mode === 'home' ? (
        <>
          <button type="button" className="window-hit" onClick={playWindowTap} aria-label="Tap the window" />
          <button type="button" className="plant-hit" onClick={playPlantRuffle} aria-label="Ruffle the plant" />
          <button type="button" className="table-hit" onClick={playTableKnock} aria-label="Knock the table" />
          {onPet ? (
            <button type="button" className="pet-hit" onClick={onPet} aria-label="Pet your cub" />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
