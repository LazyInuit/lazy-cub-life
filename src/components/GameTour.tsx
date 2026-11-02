import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import guideUrl from '../assets/tour/guide-cub.png'

type TourStep = {
  /** What to highlight on the home screen. None: a message in the middle. */
  target?: string
  title: string
  text: string
  /** Text for demo players instead, where it differs. */
  demoText?: string
  /** The player taps the highlighted thing to carry on, rather than pressing Next. */
  tap?: boolean
}

const STEPS: TourStep[] = [
  {
    title: 'Welcome to Lazy Cub Life!',
    text: "Hi! I'll show you around your cub's home. It only takes a minute.",
  },
  { target: '[aria-label="Pet your cub"]', title: 'Say hello', text: 'Give your cub a pet! Tap your cub.', tap: true },
  {
    target: '[aria-label="Tap the window"]',
    title: 'A room full of surprises',
    text: 'Tap the window. The plant and the table do things too!',
    tap: true,
  },
  {
    target: '[data-tour="play"]',
    title: 'Mood and games',
    text: "Playing games keeps your cub happy. This bar is your cub's mood. Tap Play to pick from all the games.",
  },
  {
    target: '[data-tour="sleep"]',
    title: 'Energy',
    text: 'Games use energy. Tap the moon to put your cub to sleep and win it back.',
  },
  { target: '[data-tour="wash"]', title: 'Wash', text: 'Keep your cub clean. A clean cub is a happy cub!' },
  {
    target: '[data-tour="shop"]',
    title: 'Shop',
    text: 'Buy milk and juice with Cub Cash to top up energy straight away.',
  },
  {
    target: '[data-tour="cash"]',
    title: 'Cub Cash',
    text: 'Earn coins by playing games and finishing challenges, then spend them in the shop and the wardrobe.',
    demoText: 'Demo players get 10,000 practice coins to try everything. Real accounts earn Cub Cash by playing.',
  },
  {
    target: '[data-tour="level"]',
    title: 'Your level',
    text: 'Earn XP by playing and looking after your cub to level up. Tap the badge any time to see your XP.',
  },
  {
    target: '[data-tour="wardrobe"]',
    title: 'Wardrobe',
    text: 'Dress your cub in new styles, and unlock more with Cub Cash.',
  },
  {
    target: '[data-tour="daily"]',
    title: 'Daily challenges',
    text: 'New challenges every day, with Cub Cash and bonus rolls for wardrobe prizes.',
  },
  {
    target: '.power-plate',
    title: 'Cub Power',
    text: 'Your Cub Power grows with your level, badges and daily logins, and boosts the rewards you earn.',
    demoText: 'With an account, your Cub Power grows with your level, badges and daily logins, and boosts your rewards.',
  },
  { target: '[data-tour="age"]', title: 'Young or old', text: 'Switch between your young cub and your grown-up cub here.' },
  {
    title: "That's the tour!",
    text: 'You can take this tour again any time from your account. Want a look around the wardrobe next?',
    demoText: 'Create an account to save your cub and earn real Cub Cash. Want a look around the wardrobe next?',
  },
]

const WARDROBE_STEPS: TourStep[] = [
  {
    title: 'Welcome to the wardrobe!',
    text: "This is where you style your cub. Let me show you how it works.",
  },
  {
    target: '.wardrobe-rail',
    title: 'Pick a part',
    text: 'Body, mane, eyes, mouth, headgear, bodygear and earring. Tap one to change it!',
    tap: true,
  },
  {
    target: '[aria-label="Next style"]',
    title: 'Flick through styles',
    text: 'Tap the arrow to see the next style. Your cub tries it on straight away.',
    tap: true,
  },
  {
    target: '.wardrobe-trait',
    title: 'Style and price',
    text: "Here's the style's name. A padlock means it's locked, with its price in Cub Cash and the bonus XP you get for buying it.",
  },
  {
    target: '.wardrobe-buy-wrap, .wardrobe-power',
    title: 'Buy or wear',
    text: 'Buy a style to unlock it for good. Styles you own have ON and OFF to wear them or take them off.',
  },
  {
    target: '.wardrobe-random',
    title: 'Feeling lucky?',
    text: 'Roll the dice for a random look. It only tries it on, so nothing is bought.',
    tap: true,
  },
  {
    target: '.wardrobe-reset',
    title: 'Reset',
    text: "Reset puts the try-on back to what your cub is wearing.",
  },
  {
    target: '.wardrobe-room .age-switch',
    title: 'Young and old',
    text: 'Your young cub and your grown-up cub each have their own outfits.',
  },
  {
    target: '.wardrobe-room .cub-cash',
    title: 'Cub Cash',
    text: 'Play games and finish daily challenges to earn Cub Cash for more styles.',
    demoText: 'Spend your practice coins on anything you like. Create an account to keep the styles you unlock.',
  },
  {
    target: '.wardrobe-home',
    title: 'Looking good!',
    text: 'Tap the house to head home when you are done. Have fun styling your cub!',
  },
]

const GAMES_STEPS: TourStep[] = [
  {
    title: 'Time to play!',
    text: 'This is where all the games live. Every game earns Cub Cash and XP.',
  },
  {
    target: '.game-picks .game-pick',
    title: 'Pick a game',
    text: 'Tap any game to play it. Each one uses a little energy, and new best scores win badges. Spellitaire has six card games inside!',
    demoText: 'Tap any game to play it. Spellitaire has six card games inside! Sign up to save your scores and win badges.',
  },
  {
    target: '.game-picks-screen .leaderboard-open',
    title: 'Leaderboards',
    text: 'See how you rank against everyone. Tap Leaderboards!',
    tap: true,
  },
]

const BOARD_STEPS: TourStep[] = [
  {
    target: '.leaderboard-select',
    title: 'Choose a leaderboard',
    text: 'Overall adds up all your games. You can also pick any single game.',
  },
  {
    target: '.leaderboard-switch',
    title: 'This week or all time',
    text: 'This Week starts fresh every week, so everyone gets a new chance. All Time keeps the best scores ever.',
  },
  {
    target: '.leaderboard-prize-banner',
    title: 'Weekly prizes',
    text: 'Finish near the top of the Overall weekly board to win Cub Cash and a Cub Power boost for next week.',
  },
  {
    target: '.leaderboard-heading',
    title: 'The rankings',
    text: 'Everyone is ranked by score, and your row says You. Tap a player to visit their cub!',
  },
  {
    target: '.leaderboard-nav .game-home:last-child',
    title: 'Good luck!',
    text: 'Tap here to head back to the games. Go and set some high scores!',
  },
]

/** Space around the highlighted thing. */
const PAD = 6

type Box = { x: number; y: number; w: number; h: number }

function boxOf(selector: string | undefined): Box | null {
  if (!selector) return null
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }
}

/** Where a canvas has actually drawn something, on screen. */
function drawnBounds(selector: string): Box | null {
  const canvas = document.querySelector<HTMLCanvasElement>(selector)
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx || !canvas.width || !canvas.height) return null
  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  } catch {
    return null
  }
  const w = canvas.width
  const h = canvas.height
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      if (data[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null
  const rect = canvas.getBoundingClientRect()
  const sx = rect.width / w
  const sy = rect.height / h
  return { x: rect.left + x0 * sx, y: rect.top + y0 * sy, w: (x1 - x0) * sx, h: (y1 - y0) * sy }
}

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y) && Math.round(a.w) === Math.round(b.w) && Math.round(a.h) === Math.round(b.h))

export type TourKind = 'home' | 'wardrobe' | 'games' | 'board'

const TOURS: Record<TourKind, TourStep[]> = { home: STEPS, wardrobe: WARDROBE_STEPS, games: GAMES_STEPS, board: BOARD_STEPS }

/** The canvas the cub is drawn on, which the bubble keeps clear of where it can. */
const KEEP_CLEAR: Partial<Record<TourKind, string>> = { wardrobe: '.wardrobe-room canvas.cub-3d' }

/**
 * A guided tour of a screen: everything but one thing is dimmed, with the guide cub talking about
 * it. Some steps ask the player to tap the real thing; the rest have Next. Skip ends it at any point.
 */
type TourProps = {
  demo: boolean
  onDone: () => void
  kind?: TourKind
  /** A second choice beside Done on the last step, such as going on to the next tour. */
  onMore?: { label: string; onPress: () => void }
}

export function GameTour({ demo, onDone, kind = 'home', onMore }: TourProps) {
  const steps = TOURS[kind]
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const step = steps[index]
  const last = index === steps.length - 1

  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const next = useCallback(() => {
    if (index >= steps.length - 1) doneRef.current()
    else setIndex(index + 1)
  }, [index, steps])

  // Follow the highlighted thing (it can move or animate). A step whose thing isn't there is skipped.
  useLayoutEffect(() => {
    if (step.target && !document.querySelector(step.target)) {
      next()
      return
    }
    let timer = 0
    const measure = () => {
      const fresh = boxOf(step.target)
      setBox((current) => (sameBox(current, fresh) ? current : fresh))
      timer = window.setTimeout(measure, 200)
    }
    measure()
    return () => window.clearTimeout(timer)
  }, [step, next])

  // A tap step carries on once the player taps the real thing, after a moment to enjoy it.
  useEffect(() => {
    if (!step.tap || !step.target) return
    const el = document.querySelector(step.target)
    if (!el) return
    let done = false
    let timer = 0
    const onTap = () => {
      if (done) return
      done = true
      timer = window.setTimeout(next, 900)
    }
    el.addEventListener('click', onTap, true)
    el.addEventListener('pointerup', onTap, true)
    return () => {
      el.removeEventListener('click', onTap, true)
      el.removeEventListener('pointerup', onTap, true)
      window.clearTimeout(timer)
    }
  }, [step, next])

  // The guide cub says each line a letter at a time.
  const words = demo && step.demoText ? step.demoText : step.text
  const [said, setSaid] = useState(0)
  useEffect(() => {
    setSaid(0)
    const timer = window.setInterval(() => {
      setSaid((count) => {
        if (count >= words.length) window.clearInterval(timer)
        return Math.min(words.length, count + 1)
      })
    }, 22)
    return () => window.clearInterval(timer)
  }, [words])
  const talking = said < words.length

  const bubbleRef = useRef<HTMLDivElement>(null)
  const [bubbleH, setBubbleH] = useState(210)
  useLayoutEffect(() => {
    const h = bubbleRef.current?.offsetHeight
    if (h && Math.abs(h - bubbleH) > 1) setBubbleH(h)
  })

  // Where the cub is, looked up once a step (a tapped style can change its shape).
  const clearOf = KEEP_CLEAR[kind]
  const [cubBox, setCubBox] = useState<Box | null>(null)
  useEffect(() => {
    if (!clearOf) return
    let timer = 0
    const look = () => {
      const found = drawnBounds(clearOf)
      if (found) setCubBox(found)
      else timer = window.setTimeout(look, 250)
    }
    timer = window.setTimeout(look, 60)
    return () => window.clearTimeout(timer)
  }, [clearOf, index])

  const vw = window.innerWidth
  const vh = window.innerHeight
  const bubbleW = Math.min(330, vw - 24)
  const edge = 12
  // Below the highlight if it fits, else above, else wherever there's more room, but always on screen.
  let top: number
  let left = (vw - bubbleW) / 2
  const onScreen = (y: number) => Math.max(edge, Math.min(vh - bubbleH - edge, y))
  if (box) {
    left = Math.max(edge, Math.min(vw - bubbleW - edge, box.x + box.w / 2 - bubbleW / 2))
    const below = box.y + box.h + 12
    const above = box.y - 12 - bubbleH
    if (below + bubbleH <= vh - edge) top = below
    else if (above >= edge) top = above
    else top = vh - below > box.y ? below : above
  } else {
    top = vh * 0.32
  }
  top = onScreen(top)
  if (cubBox) {
    // Next to the highlight, else the top or bottom of the screen: whichever hides the least of the
    // cub without ever covering the highlight.
    const tries = [top, ...(box ? [box.y + box.h + 12, box.y - 12 - bubbleH] : []), edge, vh - bubbleH - edge]
    let best = Infinity
    for (const y of tries.map(onScreen)) {
      const at = { x: left, y, w: bubbleW, h: bubbleH }
      const cost = (box ? overlap(at, box) * 50 : 0) + overlap(at, cubBox)
      if (cost < best) {
        best = cost
        top = y
      }
    }
  }
  const bubbleStyle: CSSProperties = {
    width: bubbleW,
    left,
    top: `max(${top}px, calc(env(safe-area-inset-top, 0px) + ${edge}px))`,
  }

  return createPortal(
    <div className={clearOf ? 'tour light' : 'tour'} role="dialog" aria-modal="true" aria-label="Game tour">
      {box ? (
        <>
          <div className="tour-shade" style={{ left: 0, top: 0, width: vw, height: Math.max(0, box.y) }} />
          <div className="tour-shade" style={{ left: 0, top: box.y + box.h, width: vw, height: Math.max(0, vh - box.y - box.h) }} />
          <div className="tour-shade" style={{ left: 0, top: box.y, width: Math.max(0, box.x), height: box.h }} />
          <div className="tour-shade" style={{ left: box.x + box.w, top: box.y, width: Math.max(0, vw - box.x - box.w), height: box.h }} />
          <div className={step.tap ? 'tour-ring tap' : 'tour-ring'} style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />
          {step.tap ? null : <div className="tour-block" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
        </>
      ) : (
        <div className="tour-shade" style={{ inset: 0 }} />
      )}
      <div className="tour-bubble" style={bubbleStyle} ref={bubbleRef}>
        <div className="tour-talk">
          <img className={talking ? 'tour-guide talking' : 'tour-guide'} src={guideUrl} alt="" />
          <div className="tour-words">
            <p className="tour-count">
              {index + 1} / {steps.length}
            </p>
            <h3>{step.title}</h3>
            <p aria-label={words}>
              {words.slice(0, said)}
              <span className="tour-unsaid">{words.slice(said)}</span>
            </p>
          </div>
        </div>
        <div className="tour-actions">
          {last ? (
            onMore ? (
              <button type="button" className="tour-next tour-more" onClick={onMore.onPress}>
                {onMore.label}
              </button>
            ) : (
              <span />
            )
          ) : (
            <button type="button" className="tour-skip" onClick={onDone}>
              Skip tour
            </button>
          )}
          {step.tap ? (
            <span className="tour-tap">Tap it! 👆</span>
          ) : (
            <button type="button" className="tour-next" onClick={next}>
              {last ? 'Done' : index === 0 ? "Let's go" : 'Next'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const SEEN_PREFIX: Record<TourKind, string> = {
  home: 'lazy-cub-tour-seen:',
  wardrobe: 'lazy-cub-wardrobe-tour-seen:',
  games: 'lazy-cub-games-tour-seen:',
  board: 'lazy-cub-board-tour-seen:',
}

/** Whether this player (an account name, or the demo) has seen that tour on this phone. */
export function tourSeen(who: string, kind: TourKind = 'home') {
  try {
    return window.localStorage.getItem(SEEN_PREFIX[kind] + who) === '1'
  } catch {
    return true
  }
}

export function markTourSeen(who: string, kind: TourKind = 'home') {
  try {
    window.localStorage.setItem(SEEN_PREFIX[kind] + who, '1')
  } catch {
    // Private browsing: the tour may be offered again.
  }
}
