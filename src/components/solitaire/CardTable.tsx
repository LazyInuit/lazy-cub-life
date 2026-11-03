import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import coinUrl from '../../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import { playCoin } from '../../game/flightAudio'
import type { PileId, TableHint, TableRules, TableState } from '../../game/solitaire/table'
import { SOLITAIRE_LAYOUT as L } from '../../game/solitaire/theme'
import { CardFace } from './CardView'
import { SolAsset } from './SolAsset'

type Props<S extends TableState> = {
  state: S
  rules: TableRules<S>
  hint: TableHint | null
  /** True while the game is over: cards cannot be touched. */
  locked?: boolean
  onMove: (from: PileId, index: number, to: PileId) => boolean
  onDraw: () => void
  /** Shows a short message on the table, such as why some cards can't be picked up. */
  onNotice?: (text: string) => void
}

const DRAG_START_PX = 6
/** Length of the shake for a card that can't be played. */
const DENIED_MS = 380
/** Length of the flip when a card turns face up. */
const FLIP_MS = 340

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

const hintNumbers = new WeakMap<TableHint, number>()
let hintCount = 0

/**
 * Each new hint flips between two identical animations, so pressing Hint again for the same move
 * replays the slide instead of leaving the old one finished.
 */
function hintAnimation(hint: TableHint) {
  let n = hintNumbers.get(hint)
  if (n === undefined) {
    hintCount += 1
    n = hintCount
    hintNumbers.set(hint, n)
  }
  return n % 2 ? 'hint-move-a' : 'hint-move-b'
}

/** A solitaire table for any mode: lays out its piles and turns drags and taps into moves. */
export function CardTable<S extends TableState>({ state, rules, hint, locked = false, onMove, onDraw, onNotice }: Props<S>) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ w: number; h: number; centreX?: number }>({ w: 360, h: 560 })
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
  /** Cards giving a short shake because they couldn't be played. */
  const [denied, setDenied] = useState<{ ids: string[]; key: number } | null>(null)
  const shake = (ids: (string | null | undefined)[]) => {
    sparkleKey.current += 1
    setDenied({ ids: ids.filter((id): id is string => Boolean(id)), key: sparkleKey.current })
  }
  useEffect(() => {
    if (!denied) return
    const timer = window.setTimeout(() => setDenied(null), DENIED_MS)
    return () => window.clearTimeout(timer)
  }, [denied])
  /** Cards that have just turned face up, given a quick flip. */
  const [flipping, setFlipping] = useState<ReadonlySet<string>>(new Set())
  const faceUpSeen = useRef(new Map<string, boolean>())
  const flipTimer = useRef(0)
  useLayoutEffect(() => {
    const seen = faceUpSeen.current
    const turned: string[] = []
    for (const card of rules.allCards(state)) {
      if (card.faceUp && seen.get(card.id) === false) turned.push(card.id)
      seen.set(card.id, card.faceUp)
    }
    if (turned.length === 0) return
    setFlipping(new Set(turned))
    window.clearTimeout(flipTimer.current)
    flipTimer.current = window.setTimeout(() => setFlipping(new Set()), FLIP_MS)
  }, [rules, state])
  useEffect(() => () => window.clearTimeout(flipTimer.current), [])
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    let last: { w: number; h: number } | null = null
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (last && last.w === w && last.h === h) return
      if (last) {
        // The table changed shape (the phone turned) mid-press: drop the press and any drag, so the
        // cards stay where they are rather than landing somewhere the new layout doesn't expect.
        const p = press.current
        if (p) {
          press.current = null
          try {
            if (el.hasPointerCapture(p.pointerId)) el.releasePointerCapture(p.pointerId)
          } catch {
            // Already released.
          }
        }
        if (dragRef.current) {
          dragRef.current = null
          setDragState(null)
        }
      }
      last = { w, h }
      const screen = (el.closest('.sol-screen') ?? document.documentElement).getBoundingClientRect()
      const centreX = screen.left + screen.width / 2 - (el.getBoundingClientRect().left + el.clientLeft)
      setBox({ w, h, centreX })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(() => rules.layout(state, box.w, box.h, box.centreX), [rules, state, box])
  const isColumn = (pile: PileId) => rules.columns.includes(pile)

  // Clear a selection that no longer points at movable cards.
  useEffect(() => {
    if (selected && !rules.canPickUp(state, selected.pile, selected.index)) setSelected(null)
  }, [rules, state, selected])

  // A sparkle over a foundation each time a card lands on it.
  useEffect(() => {
    const counts = state.foundations.map((pile) => pile.length)
    const fresh: Sparkle[] = []
    counts.forEach((count, i) => {
      if (count > (homeCounts.current[i] ?? 0)) {
        const rect = layout.piles[rules.foundations[i]]
        if (!rect) return
        sparkleKey.current += 1
        fresh.push({ key: sparkleKey.current, x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 })
      }
    })
    homeCounts.current = counts
    if (fresh.length > 0) setSparkles((list) => [...list, ...fresh].slice(-8))
  }, [state.foundations, layout, rules])

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
    for (const pile of rules.dropTargets ?? [...rules.foundations, ...rules.columns]) {
      if (!rules.canMove(state, from, index, pile)) continue
      const rect = layout.piles[pile]
      if (!rect) continue
      const column = isColumn(pile)
      const px = rect.x + layout.cardW / 2
      const py = (column ? rect.dropY : rect.y) + layout.cardH / 2
      const dx = Math.abs(cx - px)
      const dy = cy - py
      if (dx > layout.cardW * 1.05) continue
      if (!column && Math.abs(dy) > layout.cardH * 1.1) continue
      if (column && cy < rect.y - layout.cardH * 0.6) continue
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
      canDrag: index >= 0 && rules.canPickUp(state, pile, index),
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
    if (p.pile === rules.stock) {
      setSelected(null)
      onDraw()
      return
    }
    const now = performance.now()
    const cardId = p.cardId
    const doubleTap = cardId !== null && lastTap.current?.id === cardId && now - lastTap.current.at < L.doubleTapMs
    lastTap.current = cardId ? { id: cardId, at: now } : null
    // A single tap only picks a card up; it takes a double tap to send one to its best spot.
    if (doubleTap && p.index >= 0) {
      lastTap.current = null
      const target = rules.tapMove ? rules.tapMove(state, p.pile, p.index) : rules.foundationFor(state, p.pile, p.index)
      if (target && tryMove(p.pile, p.index, target)) return
      if (rules.tapFeedback) {
        shake([cardId])
        explainBlocked(p)
        setSelected(null)
        return
      }
    }
    if (selected && selected.pile !== p.pile && tryMove(selected.pile, selected.index, p.pile)) return
    if (rules.tapFeedback && p.index >= 0 && selected && selected.pile !== p.pile) {
      const first = rules.pileCards(state, selected.pile)[selected.index]
      shake([first?.id, cardId])
      setSelected(null)
      return
    }
    if (p.index >= 0 && rules.canPickUp(state, p.pile, p.index)) {
      setSelected(selected && selected.pile === p.pile && selected.index === p.index ? null : { pile: p.pile, index: p.index })
      return
    }
    if (rules.tapFeedback && p.index >= 0) shake([cardId])
    explainBlocked(p)
    setSelected(null)
  }

  /** Tells the player why these cards can't be picked up, when the mode says. */
  const explainBlocked = (p: Press) => {
    if (p.index < 0 || rules.canPickUp(state, p.pile, p.index)) return
    const why = rules.blockedPickUp?.(state, p.pile, p.index)
    if (why) onNotice?.(why)
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
      const lead = rules.pileCards(state, dragged.pile)[dragged.index]
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
  const hintTarget = hint?.kind === 'draw' || hint?.kind === 'recycle' ? rules.stock : null
  const stockCards = rules.pileCards(state, rules.stock)
  const stockLeft = rules.stockCount ? rules.stockCount(state) : stockCards.length

  // A move hint slides the cards to where they would go and back.
  const hintShift = (() => {
    if (hint?.kind !== 'move') return null
    const lead = rules.pileCards(state, hint.from)[hint.index]
    const from = lead ? layout.spots.get(lead.id) : undefined
    const target = layout.piles[hint.to]
    if (!from || !target) return null
    const below = rules.pileCards(state, hint.to)
    const y = isColumn(hint.to) && below.length > 0 ? target.dropY + layout.cardH * L.faceUpOverlap : target.y
    return { dx: target.x - from.x, dy: y - from.y, name: hintAnimation(hint) }
  })()

  return (
    <div
      ref={boxRef}
      className={locked ? 'sol-board locked' : 'sol-board'}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endPress(event, false)}
      onPointerCancel={(event) => endPress(event, true)}
      style={{ ['--sol-card-w' as string]: `${layout.cardW}px`, ['--sol-move-ms' as string]: `${L.moveMs}ms` }}
    >
      {rules.slots(state).map((slot) => {
        const rect = layout.piles[slot.pile]
        if (!rect) return null
        return (
          <div
            key={`slot-${slot.pile}`}
            className={hintTarget === slot.pile ? 'sol-slot hint-target' : 'sol-slot'}
            style={{ width: layout.cardW, height: layout.cardH, transform: `translate3d(${rect.x}px, ${rect.y}px, 0)` }}
            onPointerDown={(event) => startPress(event, slot.pile, -1, null)}
          >
            <SolAsset name={slot.art} className="sol-slot-img" fallback={<span className={slot.placeholder} />} />
          </div>
        )
      })}
      {rules.allCards(state).map((card) => {
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
        if (spot.pile === rules.stock && hintTarget === rules.stock && spot.index === stockCards.length - 1) classes.push('hinted')
        if (rules.dimmed?.(state, spot.pile, spot.index)) classes.push('covered')
        if (rules.glowing?.(state, spot.pile, spot.index)) classes.push('glow')
        if (flipping.has(card.id)) classes.push('flipping')
        const shaking = !showMove && !isDrag && denied !== null && denied.ids.includes(card.id)
        const value = card.faceUp ? rules.cardValue?.(card) : null
        if (shaking) classes.push(denied.key % 2 ? 'denied-a' : 'denied-b')
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
              ...(shaking ? { ['--x' as string]: `${x}px`, ['--y' as string]: `${y}px` } : null),
            }}
            onPointerDown={(event) => startPress(event, spot.pile, spot.index, card.id)}
          >
            <CardFace card={card} />
            {value ? (
              <span className="sol-card-value" aria-hidden="true">
                {value}
              </span>
            ) : null}
          </div>
        )
      })}
      {layout.note && rules.note ? (
        <div
          className="sol-table-note"
          style={{
            left: layout.note.x,
            top: layout.note.y,
            width: layout.note.w,
            height: layout.note.h,
            ['--sol-note-scale' as string]: String(layout.noteScale ?? 1),
          }}
          aria-live="polite"
        >
          {rules.note(state).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : null}
      {stockLeft > 0 && layout.piles[rules.stock] ? (
        <div
          className="sol-stock-count"
          style={{
            width: layout.cardW,
            height: layout.cardH,
            transform: `translate3d(${layout.piles[rules.stock].x}px, ${layout.piles[rules.stock].y}px, 0)`,
          }}
          aria-label={rules.stockCount ? `${stockLeft} deals left` : `${stockLeft} cards left in the stock`}
        >
          <span>{stockLeft}</span>
        </div>
      ) : null}
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
