import { useEffect, useRef, useState } from 'react'
import { frameScale } from '../game/frameScale'
import { PHOTO_SIZE } from '../game/profilePhoto'

type Props = {
  file: File
  busy: boolean
  error: string | null
  onCancel: () => void
  onSave: (photo: Blob) => void
}

/** Circle the player positions the photo in, in CSS pixels. */
const FRAME = 240
const MAX_ZOOM = 4

type View = { zoom: number; x: number; y: number }

/** Keep the photo covering the whole circle at any zoom or position. */
function clampView(view: View, width: number, height: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom))
  const base = FRAME / Math.min(width, height)
  const shownW = width * base * zoom
  const shownH = height * base * zoom
  const limitX = Math.max(0, (shownW - FRAME) / 2)
  const limitY = Math.max(0, (shownH - FRAME) / 2)
  return {
    zoom,
    x: Math.min(limitX, Math.max(-limitX, view.x)),
    y: Math.min(limitY, Math.max(-limitY, view.y)),
  }
}

export function PhotoCropper({ file, busy, error, onCancel, onSave }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ view: View; distance: number; midX: number; midY: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const next = new Image()
    next.onload = () => {
      setImage(next)
      setView({ zoom: 1, x: 0, y: 0 })
    }
    next.onerror = () => setLoadError('That file is not a photo this phone can open.')
    next.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const width = image?.naturalWidth ?? 1
  const height = image?.naturalHeight ?? 1
  const base = FRAME / Math.min(width, height)

  const startGesture = () => {
    const points = [...pointers.current.values()]
    if (points.length === 0) {
      gesture.current = null
      return
    }
    const [a, b] = points
    const midX = b ? (a.x + b.x) / 2 : a.x
    const midY = b ? (a.y + b.y) / 2 : a.y
    const distance = b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    gesture.current = { view, distance, midX, midY }
  }

  /** Finger position in the app's own pixels, so the photo moves with the finger on a scaled-up tablet. */
  const at = (event: React.PointerEvent<HTMLDivElement>) => ({ x: event.clientX / frameScale(), y: event.clientY / frameScale() })

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!image || busy) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, at(event))
    startGesture()
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return
    pointers.current.set(event.pointerId, at(event))
    const start = gesture.current
    const points = [...pointers.current.values()]
    const [a, b] = points
    const midX = b ? (a.x + b.x) / 2 : a.x
    const midY = b ? (a.y + b.y) / 2 : a.y
    const zoom = b && start.distance > 0 ? start.view.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / start.distance) : start.view.zoom
    const ratio = zoom / start.view.zoom
    setView(
      clampView(
        {
          zoom,
          x: start.view.x * ratio + (midX - start.midX),
          y: start.view.y * ratio + (midY - start.midY),
        },
        width,
        height,
      ),
    )
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    startGesture()
  }

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!image || busy) return
    const zoom = view.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08)
    const ratio = Math.min(MAX_ZOOM, Math.max(1, zoom)) / view.zoom
    setView(clampView({ zoom, x: view.x * ratio, y: view.y * ratio }, width, height))
  }

  const save = () => {
    if (!image || busy) return
    const scale = base * view.zoom
    const left = FRAME / 2 + view.x - (width * scale) / 2
    const top = FRAME / 2 + view.y - (height * scale) / 2
    const canvas = document.createElement('canvas')
    canvas.width = PHOTO_SIZE
    canvas.height = PHOTO_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, -left / scale, -top / scale, FRAME / scale, FRAME / scale, 0, 0, PHOTO_SIZE, PHOTO_SIZE)
    canvas.toBlob((blob) => {
      if (blob) onSave(blob)
    }, 'image/jpeg', 0.86)
  }

  const shownW = width * base * view.zoom
  const shownH = height * base * view.zoom

  return (
    <div
      className="photo-cropper"
      role="dialog"
      aria-modal="true"
      aria-label="Position your photo"
      onClick={(event) => event.stopPropagation()}
    >
      <h2>Position your photo</h2>
      <p className="photo-cropper-tip">Drag to move. Pinch or use the slider to zoom.</p>
      <div
        className="photo-cropper-frame"
        style={{ width: FRAME, height: FRAME }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {image ? (
          <img
            src={image.src}
            alt=""
            draggable={false}
            style={{
              width: shownW,
              height: shownH,
              transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`,
            }}
          />
        ) : (
          <span className="photo-cropper-wait">{loadError ?? 'Loading...'}</span>
        )}
      </div>
      <input
        className="photo-cropper-zoom"
        type="range"
        min={1}
        max={MAX_ZOOM}
        step={0.01}
        value={view.zoom}
        disabled={!image || busy}
        aria-label="Zoom"
        onChange={(event) => {
          const zoom = Number(event.target.value)
          const ratio = zoom / view.zoom
          setView(clampView({ zoom, x: view.x * ratio, y: view.y * ratio }, width, height))
        }}
      />
      {error ? <p className="profile-error">{error}</p> : null}
      <div className="photo-cropper-actions">
        <button type="button" className="photo-cropper-cancel" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="profile-visit" disabled={!image || busy} onClick={save}>
          {busy ? 'Saving...' : 'Save photo'}
        </button>
      </div>
    </div>
  )
}
