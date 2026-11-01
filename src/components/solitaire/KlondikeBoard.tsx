import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Card } from '../../game/cards/deck'
import {
  canMove,
  canPickUp,
  FOUNDATIONS,
  foundationFor,
  pileCards,
  TABLEAU,
  type Hint,
  type KlondikeState,
  type PileId,
} from '../../game/solitaire/klondike'
import coinUrl from '../../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import { playCoin } from '../../game/flightAudio'
import { SOLITAIRE_LAYOUT as L } from '../../game/solitaire/theme'
import { CardFace } from './CardView'
import { SolAsset } from './SolAsset'

type Props = {
  state: KlondikeState
  hint: Hint | null
  /** True while auto-complete runs or the game is over: cards cannot be touched. */
  locked?: boolean
  onMove: (from: PileId, index: number, to: PileId) => boolean
  onDraw: () => void
}

type Spot = { x: number; y: number; z: number; pile: PileId; index: number }
type Rect = { x: number; y: number; w: number; h: number }

type Layout = {
  width: number
  cardW: number
  cardH: number
  spots: Map<string, Spot>
  /** Where each pile sits, and for tableau columns where the next card would go. */
  piles: Record<PileId, Rect & { dropY: number }>
}

const PAD = 4
const DRAG_START_PX = 6

/** Column index on the board for each top-row pile. */
const TOP_COLUMN: Record<'stock' | 'waste' | 'f0' | 'f1' | 'f2' | 'f3', number> = {
  stock: 0,
  waste: 1,
  f0: 3,
  f1: 4,
  f2: 5,
  f3: 6,
}

function computeLayout(state: KlondikeState, boxW: number, boxH: number): Layout {
  const width = Math.min(boxW, L.maxBoardWidth)
  const cardW = (width - PAD * 2) / (7 + 6 * L.columnGap)
  const cardH = cardW * L.cardAspect
  const gap = cardW * L.columnGap
  const colX = (col: number) => (boxW - width) / 2 + PAD + col * (cardW + gap)
  const tableauTop = cardH + cardW * 0.28
  const spots = new Map<string, Spot>()
  const piles = {} as Layout['piles']

  for (const pile of ['stock', 'waste', ...FOUNDATIONS] as const) {
    const x = colX(TOP_COLUMN[pile])
    piles[pile] = { x, y: 0, w: cardW, h: cardH, dropY: 0 }
    const cards = pileCards(state, pile)
    // Drawing three: the last three waste cards fan out so the ones underneath show.
    const fanFrom = pile === 'waste' && state.drawCount === 3 ? cards.length - 3 : cards.length
    cards.forEach((card, index) => {
      const shift = Math.max(0, index - fanFrom) * cardW * L.wasteFan
      spots.set(card.id, { x: x + shift, y: 0, z: index + 1, pile, index })
    })
  }

  const room = Math.max(cardH, boxH - tableauTop - cardH - 4)
  TABLEAU.forEach((pile, col) => {
    const cards = pileCards(state, pile)
    const x = colX(col)
    const downs = cards.slice(0, -1).filter((card) => !card.faceUp).length
    const ups = Math.max(0, cards.length - 1 - downs)
    let down = cardH * L.faceDownOverlap
    let up = cardH * L.faceUpOverlap
    const need = downs * down + ups * up
    if (need > room) {
      const squeeze = room / need
      down = Math.max(cardH * L.minFaceDownOverlap, down * squeeze)
      up = Math.max(cardH * L.minFaceUpOverlap, up * squeeze)
    }
    let y = tableauTop
    cards.forEach((card, index) => {
      spots.set(card.id, { x, y, z: 10 + index, pile, index })
      if (index < cards.length - 1) y += card.faceUp ? up : down
    })
    const bottom = cards.length > 0 ? y : tableauTop
    piles[pile] = { x, y: tableauTop, w: cardW, h: bottom - tableauTop + cardH, dropY: bottom }
  })

  return { width, cardW, cardH, spots, piles }
}

type Press = {
  pointerId: number
  pile: PileId
  /** Card index in the pile, or -1 for an empty slot. */
  index: number
  cardId: string | null
  x0: number
  y0: number
  canDrag: boolean
}

type Drag = { pile: PileId; index: number; dx: number; dy: number }
type Selection = { pile: PileId; index: number }
type Sparkle = { key: number; x: number; y: number }

const hintNumbers = new WeakMap<Hint, number>()
let hintCount = 0

/**
 * Each new hint flips between two identical animations, so pressing Hint again for the same move
 * replays the slide instead of leaving the old one finished.
 */
function hintAnimation(hint: Hint) {
  let n = hintNumbers.get(hint)
  if (n === undefined) {
    hintCount += 1
    n = hintCount
    hintNumbers.set(hint, n)
  }
  return n % 2 ? 'hint-move-a' : 'hint-move-b'
}

/** The Klondike table: lays out the piles and turns drags and taps into moves. */
export function KlondikeBoard({ state, hint, locked = false, onMove, onDraw }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 360, h: 560 })
  const [drag, setDragState] = useState<Drag | null>(null)
  /** The drag as of the latest pointer event, ahead of the next render. */
  const dragRef = useRef<Drag | null>(null)
  const setDrag = (next: Drag | null) => {
    dragRef.current = next
    setDragState(next)
  }
  const [selected, setSelected] = useState<Selection | null>(null)
  const [sparkles, setSparkles] = useState<Sparkle[]>([])
  const press = useRef<Press | null>(null)
  const lastTap = useRef<{ id: string; at: number } | null>(null)
  const homeCounts = useRef(state.foundations.map((pile) => pile.length))
  const sparkleKey = useRef(0)
  const [coinPops, setCoinPops] = useState<Sparkle[]>([])
  const coinCardsSeen = useRef(state.coinCards)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(() => computeLayout(state, box.w, box.h), [state, box])

  // Clear a selection that no longer points at movable cards.
  useEffect(() => {
    if (selected && !canPickUp(state, selected.pile, selected.index)) setSelected(null)
  }, [state, selected])

  // A sparkle over a foundation each time a card lands on it.
  useEffect(() => {
    const counts = state.foundations.map((pile) => pile.length)
    const fresh: Sparkle[] = []
    counts.forEach((count, i) => {
      if (count > homeCounts.current[i]) {
        const rect = layout.piles[FOUNDATIONS[i]]
        sparkleKey.current += 1
        fresh.push({ key: sparkleKey.current, x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 })
      }
    })
    homeCounts.current = counts
    if (fresh.length > 0) setSparkles((list) => [...list, ...fresh].slice(-8))
  }, [state.foundations, layout])

  // A coin pops over each card the moment it earns Cub Cash, with the coin sound. Undo only shrinks
  // the list, so it never pops one.
  useEffect(() => {
    const seen = coinCardsSeen.current
    coinCardsSeen.current = state.coinCards
    const fresh = state.coinCards.filter((id) => !seen.includes(id))
    if (fresh.length === 0) return
    const pops = fresh.flatMap((id) => {
      const spot = layout.spots.get(id)
      if (!spot) return []
      sparkleKey.current += 1
      return [{ key: sparkleKey.current, x: spot.x + layout.cardW / 2, y: spot.y + layout.cardH / 2 }]
    })
    playCoin()
    setCoinPops((list) => [...list, ...pops].slice(-6))
  }, [state.coinCards, layout])

  /** The legal pile nearest to where the dragged run's top card was let go. */
  const dropTarget = (from: PileId, index: number, cx: number, cy: number): PileId | null => {
    let best: PileId | null = null
    let bestScore = Number.POSITIVE_INFINITY
    for (const pile of [...FOUNDATIONS, ...TABLEAU] as PileId[]) {
      if (!canMove(state, from, index, pile)) continue
      const rect = layout.piles[pile]
      const px = rect.x + layout.cardW / 2
      const py = (pile[0] === 't' ? rect.dropY : rect.y) + layout.cardH / 2
      const dx = Math.abs(cx - px)
      const dy = cy - py
      if (dx > layout.cardW * 1.05) continue
      if (pile[0] === 'f' && Math.abs(dy) > layout.cardH * 1.1) continue
      if (pile[0] === 't' && cy < rect.y - layout.cardH * 0.6) continue
      const score = dx * dx + dy * dy * 0.25
      if (score < bestScore) {
        bestScore = score
        best = pile
      }
    }
    return best
  }

  const startPress = (event: ReactPointerEvent, pile: PileId, index: number, cardId: string | null) => {
    if (locked || press.current) return
    event.preventDefault()
    try {
      boxRef.current?.setPointerCapture(event.pointerId)
    } catch {
      // The pointer may already be gone (a very quick tap); the press still works without capture.
    }
    press.current = {
      pointerId: event.pointerId,
      pile,
      index,
      cardId,
      x0: event.clientX,
      y0: event.clientY,
      canDrag: index >= 0 && canPickUp(state, pile, index),
    }
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const p = press.current
    if (!p || p.pointerId !== event.pointerId) return
    const dx = event.clientX - p.x0
    const dy = event.clientY - p.y0
    if (!dragRef.current && (!p.canDrag || Math.hypot(dx, dy) < DRAG_START_PX)) return
    setDrag({ pile: p.pile, index: p.index, dx, dy })
  }

  const tryMove = (from: PileId, index: number, to: PileId) => {
    const ok = onMove(from, index, to)
    if (ok) setSelected(null)
    return ok
  }

  const tap = (p: Press) => {
    if (p.pile === 'stock') {
      setSelected(null)
      onDraw()
      return
    }
    const now = performance.now()
    const cardId = p.cardId
    const doubleTap = cardId !== null && lastTap.current?.id === cardId && now - lastTap.current.at < L.doubleTapMs
    lastTap.current = cardId ? { id: cardId, at: now } : null
    if (doubleTap && p.index >= 0) {
      const home = foundationFor(state, p.pile, p.index)
      if (home && tryMove(p.pile, p.index, home)) {
        lastTap.current = null
        return
      }
    }
    if (selected && selected.pile !== p.pile && tryMove(selected.pile, selected.index, p.pile)) return
    if (p.index >= 0 && canPickUp(state, p.pile, p.index)) {
      setSelected(selected && selected.pile === p.pile && selected.index === p.index ? null : { pile: p.pile, index: p.index })
      return
    }
    setSelected(null)
  }

  const endPress = (event: ReactPointerEvent, cancelled: boolean) => {
    const p = press.current
    if (!p || p.pointerId !== event.pointerId) return
    press.current = null
    try {
      if (boxRef.current?.hasPointerCapture(event.pointerId)) boxRef.current.releasePointerCapture(event.pointerId)
    } catch {
      // Already released.
    }
    const dragged = dragRef.current
    if (dragged) {
      const lead = pileCards(state, dragged.pile)[dragged.index]
      const spot = lead ? layout.spots.get(lead.id) : null
      setDrag(null)
      if (cancelled || !spot) return
      const to = dropTarget(dragged.pile, dragged.index, spot.x + dragged.dx + layout.cardW / 2, spot.y + dragged.dy + layout.cardH / 2)
      if (to) tryMove(dragged.pile, dragged.index, to)
      return
    }
    if (!cancelled) tap(p)
  }

  const dragging = (pile: PileId, index: number) => drag !== null && drag.pile === pile && index >= drag.index
  const chosen = (pile: PileId, index: number) => selected !== null && selected.pile === pile && index >= selected.index
  const hinted = (pile: PileId, index: number) =>
    hint?.kind === 'move' && hint.from === pile && index >= hint.index
  const hintTarget = hint?.kind === 'draw' || hint?.kind === 'recycle' ? 'stock' : null

  // A move hint slides the cards to where they would go and back.
  const hintShift = (() => {
    if (hint?.kind !== 'move') return null
    const lead = pileCards(state, hint.from)[hint.index]
    const from = lead ? layout.spots.get(lead.id) : undefined
    if (!from) return null
    const target = layout.piles[hint.to]
    const below = pileCards(state, hint.to)
    const y = hint.to[0] === 't' && below.length > 0 ? target.dropY + layout.cardH * L.faceUpOverlap : target.y
    return { dx: target.x - from.x, dy: y - from.y, name: hintAnimation(hint) }
  })()

  const allCards: Card[] = [
    ...state.stock,
    ...state.waste,
    ...state.foundations.flat(),
    ...state.tableau.flat(),
  ]

  const slot = (pile: PileId) => {
    const rect = layout.piles[pile]
    const name =
      pile === 'stock'
        ? state.waste.length > 0
          ? 'slotStock'
          : 'slotStockEmpty'
        : pile === 'waste'
          ? 'slotWaste'
          : pile[0] === 'f'
            ? 'slotFoundation'
            : 'slotTableau'
    const placeholderClass =
      pile === 'stock' ? (state.waste.length > 0 ? 'sol-slot-ph recycle' : 'sol-slot-ph') : pile[0] === 'f' ? 'sol-slot-ph home' : 'sol-slot-ph'
    return (
      <div
        key={`slot-${pile}`}
        className={hintTarget === pile ? 'sol-slot hint-target' : 'sol-slot'}
        style={{ width: layout.cardW, height: layout.cardH, transform: `translate3d(${rect.x}px, ${rect.y}px, 0)` }}
        onPointerDown={(event) => startPress(event, pile, -1, null)}
      >
        <SolAsset name={name} className="sol-slot-img" fallback={<span className={placeholderClass} />} />
      </div>
    )
  }

  return (
    <div
      ref={boxRef}
      className={locked ? 'sol-board locked' : 'sol-board'}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endPress(event, false)}
      onPointerCancel={(event) => endPress(event, true)}
      style={{ ['--sol-card-w' as string]: `${layout.cardW}px`, ['--sol-move-ms' as string]: `${L.moveMs}ms` }}
    >
      {(['stock', 'waste', ...FOUNDATIONS, ...TABLEAU] as PileId[]).map(slot)}
      {allCards.map((card) => {
        const spot = layout.spots.get(card.id)
        if (!spot) return null
        const isDrag = dragging(spot.pile, spot.index)
        const x = spot.x + (isDrag && drag ? drag.dx : 0)
        const y = spot.y + (isDrag && drag ? drag.dy : 0)
        const classes = ['sol-card']
        if (isDrag) classes.push('dragging')
        if (chosen(spot.pile, spot.index)) classes.push('selected')
        const showMove = hintShift !== null && !isDrag && hinted(spot.pile, spot.index)
        if (showMove) classes.push(hintShift.name)
        if (spot.pile === 'stock' && hintTarget === 'stock' && spot.index === state.stock.length - 1) classes.push('hinted')
        return (
          <div
            key={card.id}
            className={classes.join(' ')}
            style={{
              width: layout.cardW,
              height: layout.cardH,
              transform: `translate3d(${x}px, ${y}px, 0)`,
              zIndex: isDrag ? 500 + spot.index : showMove ? 450 + spot.index : spot.z,
              ...(showMove
                ? {
                    ['--x' as string]: `${x}px`,
                    ['--y' as string]: `${y}px`,
                    ['--hx' as string]: `${hintShift.dx}px`,
                    ['--hy' as string]: `${hintShift.dy}px`,
                  }
                : null),
            }}
            onPointerDown={(event) => startPress(event, spot.pile, spot.index, card.id)}
          >
            <CardFace card={card} />
          </div>
        )
      })}
      {sparkles.map((sparkle) => (
        <div
          key={sparkle.key}
          className="sol-sparkle"
          style={{ transform: `translate3d(${sparkle.x}px, ${sparkle.y}px, 0)` }}
          onAnimationEnd={() => setSparkles((list) => list.filter((item) => item.key !== sparkle.key))}
        >
          <SolAsset name="sparkle" className="sol-sparkle-img" fallback={<span className="sol-sparkle-ph" />} />
        </div>
      ))}
      {coinPops.map((pop) => (
        <div
          key={pop.key}
          className="sol-coin-pop"
          style={{ transform: `translate3d(${pop.x}px, ${pop.y}px, 0)` }}
          onAnimationEnd={() => setCoinPops((list) => list.filter((item) => item.key !== pop.key))}
        >
          <img src={coinUrl} alt="" draggable={false} />
          <span>+1</span>
        </div>
      ))}
    </div>
  )
}
