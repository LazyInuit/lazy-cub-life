import { useEffect, useRef, useState } from 'react'
import { drawCubEffects, drawHalloweenPumpkin, drawHomeBackground, drawHomeChair, drawHomeTable, homeCharacterBox } from '../game/drawCub'
import { HALLOWEEN_THEME, pumpkinLit, togglePumpkin } from '../game/halloween'
import { characterLayers, type TryOn } from '../game/cubTraits'
import { artSize, coverPlacement, fitInBox, homeArt, homeItem, slotBox, slotScale } from '../game/homeScene'
import { playPlantRuffle } from '../game/plantAudio'
import { playPumpkinLight, playPumpkinOut } from '../game/pumpkinAudio'
import { startHalloweenBgm, stopHalloweenBgm } from '../game/halloweenBgm'
import { playTableKnock } from '../game/tableAudio'
import { playWindowTap } from '../game/windowAudio'
import type { CubAppearance, CubPose } from '../game/types'

type Props = {
  appearance: CubAppearance
  pose: CubPose
  dim?: boolean
  onPet?: () => void
  /** Visit draws another player's home: their room and outfit, no care looks, no pumpkin tap. */
  mode?: 'home' | 'wardrobe' | 'visit'
  tryOn?: TryOn | null
  /** Paint the cub on the desk canvas, over the room picture. */
  overPicture?: boolean
  /** Called after the pumpkin is toggled so the choice is saved with the cub. */
  onPumpkinChange?: (on: boolean) => void
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
  const placed = coverPlacement(stageW, stageH, pixelW, pixelH)
  ctx.drawImage(image, placed.x, placed.y, placed.w, placed.h)
}

export function CubStage({ pose, dim = false, onPet, mode = 'home', tryOn = null, overPicture = false, onPumpkinChange }: Props) {
  const roomRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<HTMLCanvasElement>(null)
  const poseRef = useRef(pose)
  const dimRef = useRef(dim)
  const modeRef = useRef(mode)
  const tryOnRef = useRef(tryOn)
  const overPictureRef = useRef(overPicture)
  const [pumpkinOn, setPumpkinOn] = useState(pumpkinLit)
  poseRef.current = pose
  dimRef.current = dim
  modeRef.current = mode
  tryOnRef.current = tryOn
  overPictureRef.current = overPicture

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
      const scene = (room.closest('.home-room') as HTMLElement | null) ?? room
      const rect = scene.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(rect.width * dpr))
      const height = Math.max(1, Math.floor(rect.height * dpr))
      for (const canvas of [room, view, fx]) {
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
      }
      const layoutW = rect.width
      const layoutH = rect.height
      const useFrame = (ctx: CanvasRenderingContext2D) => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      const wardrobe = modeRef.current === 'wardrobe'
      const wardrobeLift = wardrobe ? layoutH * 0.04 : 0
      const tableSlot = slotBox('table', layoutW, layoutH)
      const cubBox = homeCharacterBox(layoutW, layoutH)
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
        roomCtx.clearRect(0, 0, rect.width, rect.height)
        useFrame(roomCtx)
        if (wardrobe) {
          const bedroom = homeArt('bedroom-2')
          if (bedroom) {
            const size = artSize(bedroom)
            if (size.w > 0 && size.h > 0) coverRoom(roomCtx, bedroom, layoutW, layoutH, size.w, size.h)
          }
        } else {
          drawHomeBackground(roomCtx, layoutW, layoutH, dimRef.current)
          drawHomeChair(roomCtx, layoutW, layoutH, 'back', -homeSit)
        }
      }

      const viewCtx = view.getContext('2d')
      const time = (now - started) / 1000
      const overPicture = overPictureRef.current
      const drawCharacter = (ctx: CanvasRenderingContext2D, yExtra = 0) => {
        const layers = characterLayers(now, tryOnRef.current, { preview: wardrobe, visit: modeRef.current === 'visit' })
        const box = homeCharacterBox(layoutW, layoutH)
        if (!layers.length || !box) return
        const motion = poseMotion(poseRef.current, time)
        ctx.save()
        ctx.translate(box.x + box.w / 2 + motion.x, box.y + box.h + motion.y - wardrobeLift - homeSit + yExtra)
        ctx.rotate((slotScale.character.restRot ?? 0) + motion.rot)
        for (const layer of layers) {
          ctx.drawImage(layer, -box.w / 2, -box.h, box.w, box.h)
        }
        ctx.restore()
      }
      if (viewCtx && rect.width > 0 && rect.height > 0) {
        viewCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        viewCtx.clearRect(0, 0, rect.width, rect.height)
        if (!overPicture) {
          useFrame(viewCtx)
          drawCharacter(viewCtx)
        }
      }

      const fxCtx = fx.getContext('2d')
      if (fxCtx && rect.width > 0 && rect.height > 0) {
        fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        fxCtx.clearRect(0, 0, rect.width, rect.height)
        useFrame(fxCtx)
        // The room picture is one image behind this canvas. Draw the cub here so the head
        // covers that image, then the desk covers the cub's feet.
        if (overPicture) drawCharacter(fxCtx, 20)
        const table = slotBox('table', layoutW, layoutH)
        const cub = homeCharacterBox(layoutW, layoutH)
        const tableArt = homeArt(wardrobe ? 'chest-1' : homeItem('table').id)
        const fittedTop = tableArt ? fitInBox(artSize(tableArt).w, artSize(tableArt).h, table).y : table.y
        const sitDrop = wardrobe && cub ? cub.y + cub.h - fittedTop - wardrobeLift : 0
        drawHomeTable(fxCtx, layoutW, layoutH, wardrobe ? 'chest-1' : 'table-1', sitDrop)
        // A visitor cannot tap the pumpkin, so it never wobbles for attention there.
        const pumpkinClock = modeRef.current === 'visit' ? 0 : time
        const pumpkin = wardrobe ? null : drawHalloweenPumpkin(fxCtx, layoutW, layoutH, pumpkinClock)
        if (!wardrobe) drawCubEffects(fxCtx, poseRef.current, time, layoutW, layoutH)
        const dockBottom = rect.height - (table.y + table.h) + 36
        const roomEl = room.closest('.home-room') as HTMLElement | null
        roomEl?.style.setProperty('--dock-bottom', `${Math.max(0, dockBottom)}px`)
        roomEl?.style.setProperty('--table-top', `${fittedTop + sitDrop}px`)
        const bg = slotBox('background', layoutW, layoutH)
        const stage = room.parentElement
        if (stage && !wardrobe) {
          const windowY = bg.y + bg.h * 0.2
          const chair = slotBox('chair', layoutW, layoutH)
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
          stage.style.setProperty('--table-w', `${layoutW}px`)
          stage.style.setProperty('--table-h', '32px')
          if (pumpkin) {
            stage.style.setProperty('--pumpkin-x', `${pumpkin.x}px`)
            stage.style.setProperty('--pumpkin-y', `${pumpkin.y}px`)
            stage.style.setProperty('--pumpkin-w', `${pumpkin.w}px`)
            stage.style.setProperty('--pumpkin-h', `${pumpkin.h}px`)
          }
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
      {mode !== 'wardrobe' ? (
        <>
          <button type="button" className="window-hit" onClick={playWindowTap} aria-label="Tap the window" />
          <button type="button" className="plant-hit" onClick={playPlantRuffle} aria-label="Ruffle the plant" />
          <button type="button" className="table-hit" onClick={playTableKnock} aria-label="Knock the table" />
          {HALLOWEEN_THEME && mode === 'home' ? (
            <button
              type="button"
              className="pumpkin-hit"
              onClick={() => {
                togglePumpkin()
                const on = pumpkinLit()
                setPumpkinOn(on)
                onPumpkinChange?.(on)
                if (on) {
                  playPumpkinLight()
                  if (!dim) startHalloweenBgm()
                } else {
                  playPumpkinOut()
                  stopHalloweenBgm()
                }
              }}
              aria-label={pumpkinOn ? 'Turn the pumpkin off' : 'Light the pumpkin'}
            />
          ) : null}
          {onPet ? (
            <button
              type="button"
              className="pet-hit"
              onClick={onPet}
              aria-label={mode === 'visit' ? 'Pet this cub' : 'Pet your cub'}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
