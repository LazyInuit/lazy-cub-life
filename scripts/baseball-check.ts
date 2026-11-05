import { ART, BAT, CONTACT_Z, DIFFICULTY, FIELD, FIT, FLICK, MACHINE_SPOTS, MIN_FLIGHT, MOUND_PITCHES, STRIKE_ZONE, WINDOWS, type Vec3 } from '../src/game/baseball/config'
import { calibrate, fitArt, projectArt } from '../src/game/baseball/layout'
import { BAT_DESIGNS, DEFAULT_BAT, batBarrelRadius } from '../src/game/baseball/bats'
import { MOUND_SPOT, arrivalTime, machineFrame, makePitch, pitchBallRadius, pitchPosition, spotBase, spotForPitch } from '../src/game/baseball/pitch'
import { REST_DIR, aimBat, batRig, createMotionTracker, sweptThrough, swipePower } from '../src/game/baseball/swing'
import { judgeTiming, launchFor } from '../src/game/baseball/contact'
import { carryDistance, hitKind, simulateFlight } from '../src/game/baseball/flight'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
const f3 = (n: number) => n.toFixed(3)

const cam = calibrate()
console.log(
  `camera height ${f3(cam.height)}m, ${f3(cam.distance)}m behind plate, pitch ${f3((cam.pitch * 180) / Math.PI)} deg, fov ${f3(cam.fov)} deg`,
)
check('camera is a plausible catcher view', cam.height > 0.6 && cam.height < 2.2 && cam.distance > 1 && cam.distance < 5)

const far = projectArt(cam, { x: 0, y: 0, z: -1e6 })
check('horizon row', near(far.y, ART.horizonY, 0.002), f3(far.y))
const rubber = projectArt(cam, { x: 0, y: 0, z: FIELD.rubberZ })
check('rubber row', near(rubber.y, ART.rubberY, 0.002), f3(rubber.y))
const plateFront = projectArt(cam, { x: 0, y: 0, z: 0 })
check('plate front row', near(plateFront.y, ART.plateFrontY, 0.002), f3(plateFront.y))
const plateEdge = projectArt(cam, { x: FIELD.plateWidth / 2, y: 0, z: 0 })
check('plate width', near((plateEdge.x - 0.5) * 2, ART.plateWidthFrac, 0.002), f3((plateEdge.x - 0.5) * 2))
const plateBack = projectArt(cam, { x: 0, y: 0, z: FIELD.plateDepth })
check('plate back point (unsolved, art check)', near(plateBack.y, ART.plateBackY, 0.02), f3(plateBack.y))
const mound = projectArt(cam, { x: 0, y: 0, z: machineFrame().centre.z })
check('machine stands on the mound centre', near(mound.y, ART.moundY, 0.001), `${f3(mound.y)}, ${f3(machineFrame().centre.z)}m`)
const fence = projectArt(cam, { x: 0, y: 0, z: FIELD.fenceZ })
check('fence foot sits near the painted wall', near(fence.y, ART.horizonY, 0.012), f3(fence.y))

const zone = projectArt(cam, { x: 0, y: STRIKE_ZONE.centreY, z: CONTACT_Z })
check('strike zone sits mid-screen, clear of the scoreboard', zone.y > ART.board.bottom + 0.1 && zone.y < ART.plateFrontY, f3(zone.y))

for (const [w, h, label, fullWidth] of [
  [393, 852, 'iPhone full height', true],
  [393, 660, 'iPhone Safari with bars', true],
  [390, 664, 'iPhone 13 Safari', true],
  [430, 740, 'iPhone Pro Max Safari', true],
  [393, 641, 'app frame', true],
  [520, 920, 'desktop frame', true],
  [375, 560, 'small iPhone Safari', false],
] as const) {
  const box = fitArt(w, h)
  const top = (0 - box.y) / box.h
  const bottom = (h - box.y) / box.h
  const ok =
    near(box.w / box.h, ART.aspect, 1e-6) &&
    top <= FIT.hardTop + 1e-6 &&
    bottom >= FIT.hardBottom - 1e-6 &&
    (!fullWidth || !box.sideFill)
  const cropSides = box.w > w + 0.5 ? `, ${Math.round((box.w - w) / 2)}px cropped each side` : ''
  check(`fit ${label} ${w}x${h}`, ok, `rows ${f3(top)}-${f3(bottom)}, width ${Math.round(box.w)}${box.sideFill ? ' + side fill' : ''}${cropSides}`)
}

check('perfect window', judgeTiming(0) === 'perfect' && judgeTiming(WINDOWS.perfect) === 'perfect' && judgeTiming(-WINDOWS.perfect - 0.001) === 'good')
check('good window', judgeTiming(WINDOWS.good) === 'good' && judgeTiming(WINDOWS.good + 0.001) === 'weak')
check('weak window', judgeTiming(-WINDOWS.weak) === 'weak' && judgeTiming(WINDOWS.weak + 0.001) === 'miss')

const along = (dir: Vec3, s: number): Vec3 => ({ x: BAT.hands.x + dir.x * s, y: BAT.hands.y + dir.y * s, z: BAT.hands.z + dir.z * s })
const first = makePitch(0, 0, () => 0.5)

for (const g of [0.4, 0.65, 0.9].map((share) => share * DEFAULT_BAT.length)) {
  const held = projectArt(cam, along(REST_DIR, g))
  const aimed = aimBat(cam, held.x, held.y, g)
  check(`grabbing the bat ${f3(g)}m up does not make it jump`, near(aimed.x, REST_DIR.x, 1e-6) && near(aimed.y, REST_DIR.y, 1e-6) && near(aimed.z, REST_DIR.z, 1e-6))
}
{
  const g = DEFAULT_BAT.length * 0.7
  const finger = { x: 0.62, y: 0.7 }
  const dir = aimBat(cam, finger.x, finger.y, g)
  const under = projectArt(cam, along(dir, g))
  check('the held point stays under the finger', near(under.x, finger.x, 1e-4) && near(under.y, finger.y, 1e-4), `${f3(under.x)}, ${f3(under.y)}`)
  check('the handle end never moves', near(Math.hypot(dir.x, dir.y, dir.z), 1, 1e-9))
}
{
  const ball = projectArt(cam, pitchPosition(first, first.flightTime))
  const dir = aimBat(cam, ball.x, ball.y, DEFAULT_BAT.length * 0.8)
  const sweet = projectArt(cam, along(dir, DEFAULT_BAT.length * 0.8))
  check('the barrel can be put on the arriving ball', near(sweet.x, ball.x, 0.01) && near(sweet.y, ball.y, 0.01), `ball ${f3(ball.x)}, ${f3(ball.y)}`)
}
{
  const pivot = { x: 340, y: 600 }
  const ball = { x: 200, y: 510 }
  check('a sweep across the ball connects', sweptThrough(pivot, { x: 320, y: 360 }, { x: 110, y: 560 }, ball, 30))
  check('a fast jump right over the ball still connects', sweptThrough(pivot, { x: 260, y: 360 }, { x: 120, y: 640 }, ball, 20))
  check('a sweep that stops short of the ball misses', !sweptThrough(pivot, { x: 320, y: 360 }, { x: 270, y: 380 }, ball, 30))
  check('a bat too short to reach misses', !sweptThrough(pivot, { x: 330, y: 540 }, { x: 290, y: 600 }, ball, 20))
}
{
  const tracker = createMotionTracker()
  tracker.reset(300, 500, 0)
  for (let i = 1; i <= 10; i += 1) tracker.push(300 - i * 16, 500 - i * 2, i / 120)
  const m = tracker.motion()
  check('swipe speed is measured', near(m.speed, 16 * Math.hypot(1, 0.125) * 120, 1) && m.dx < 0, `${Math.round(m.speed)}px/s`)
  check('swipe power is clamped', swipePower(20000) === FLICK.maxPower && swipePower(10) === FLICK.minPower)
  check('a quick swipe is fast enough to hit', m.speed >= FLICK.minSpeed)
}

for (const level of DIFFICULTY) {
  const pitch = makePitch(level.score, 10, () => 0.5)
  const at = pitchPosition(pitch, pitch.flightTime)
  check(
    `pitch from ${level.score} points reaches the plane on time`,
    near(at.z, CONTACT_Z, 1e-9) && near(arrivalTime(pitch) - 10, pitch.flightTime, 1e-9),
    `${f3(pitch.flightTime)}s, ${f3(Math.abs(CONTACT_Z - pitch.start.z) / pitch.flightTime)}m/s`,
  )
}
check('first pitches are slow, straight and centred', DIFFICULTY[0].flightTime >= 1.4 && DIFFICULTY[0].curveChance === 0 && DIFFICULTY[0].spread === 0)
{
  const harder = DIFFICULTY.every((row, i) => {
    const prev = DIFFICULTY[i - 1]
    if (!prev) return true
    return (
      row.score > prev.score &&
      row.flightTime < prev.flightTime &&
      row.curveChance >= prev.curveChance &&
      row.curve[1] >= prev.curve[1] &&
      row.fastScale <= prev.fastScale &&
      row.spread >= prev.spread
    )
  })
  check('every score band is faster with more curve than the one before', harder)
}
{
  let seed = 5
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const count = (score: number, previous: 'normal' | 'fast') => {
    const kinds = { normal: 0, fast: 0, slow: 0 }
    let curved = 0
    let quickest = Infinity
    for (let i = 0; i < 4000; i += 1) {
      const pitch = makePitch(score, 0, rng, { previous })
      kinds[pitch.type] += 1
      if (pitch.controlX !== (pitch.start.x + pitch.end.x) / 2) curved += 1
      quickest = Math.min(quickest, pitch.flightTime)
    }
    return { ...kinds, curved, quickest }
  }
  const early = count(0, 'normal')
  const late = count(7000, 'normal')
  const afterFast = count(7000, 'fast')
  check('opening pitches are all plain', early.fast === 0 && early.slow === 0 && early.curved === 0)
  check('high scores mix in fastballs, change-ups and curves', late.fast > 800 && late.slow > 500 && late.curved > 2000, `${late.fast} fast, ${late.slow} slow, ${late.curved} curved of 4000`)
  check('a change-up is likelier straight after a fastball', afterFast.slow > late.slow * 1.8, `${afterFast.slow} vs ${late.slow}`)
  check('no pitch is unfairly quick', late.quickest >= MIN_FLIGHT - 1e-9, `${f3(late.quickest)}s`)
  const slow = makePitch(7000, 0, () => 0.01)
  const fast = makePitch(7000, 0, () => 0.3)
  check('change-ups are slower than fastballs', slow.type === 'slow' && fast.type === 'fast' && slow.flightTime > fast.flightTime * 1.6, `${f3(slow.flightTime)}s vs ${f3(fast.flightTime)}s`)
}

const restBat = Array.from({ length: 9 }, (_, j) => projectArt(cam, along(REST_DIR, (DEFAULT_BAT.length * (j + 2)) / 10)))
for (const spot of MACHINE_SPOTS) {
  const base = spotBase(spot)
  const frame = machineFrame(base)
  const foot = projectArt(cam, base)
  const top = projectArt(cam, { x: base.x, y: base.y + frame.height, z: base.z })
  const left = projectArt(cam, { x: base.x - frame.width / 2, y: base.y, z: base.z })
  const right = projectArt(cam, { x: base.x + frame.width / 2, y: base.y, z: base.z })
  const onField = foot.y > ART.horizonY + 0.02 && foot.y < 0.75 && left.x > 0.04 && right.x < 0.96
  const clearOfBoard = top.y > ART.board.bottom + 0.03
  const clearOfBat = restBat.every((p) => p.x < left.x || p.x > right.x || p.y < top.y || p.y > foot.y)
  const pitch = makePitch(0, 0, () => 0.5, { base })
  const lands = near(pitchPosition(pitch, pitch.flightTime).z, CONTACT_Z, 1e-9)
  check(
    `machine spot ${spot.id} stands on the field, clear of the scoreboard and bat`,
    onField && clearOfBoard && clearOfBat && lands,
    `foot ${f3(foot.x)}, ${f3(foot.y)}; first-level flight ${f3(pitch.flightTime)}s`,
  )
}
{
  const lefty = batRig(true)
  const handsL = projectArt(cam, lefty.hands)
  check('a left-hander holds the bat in the bottom-left', handsL.x > 0.02 && handsL.x < 0.25 && near(handsL.y, projectArt(cam, BAT.hands).y, 1e-9), `${f3(handsL.x)}, ${f3(handsL.y)}`)
  const leftBat = Array.from({ length: 9 }, (_, j) => projectArt(cam, { x: lefty.hands.x + lefty.rest.x * DEFAULT_BAT.length * ((j + 2) / 10), y: lefty.hands.y + lefty.rest.y * DEFAULT_BAT.length * ((j + 2) / 10), z: lefty.hands.z + lefty.rest.z * DEFAULT_BAT.length * ((j + 2) / 10) }))
  const clear = MACHINE_SPOTS.every((spot) => {
    const base = spotBase(spot, true)
    const frame = machineFrame(base)
    const foot = projectArt(cam, base)
    const top = projectArt(cam, { x: base.x, y: base.y + frame.height, z: base.z })
    const left = projectArt(cam, { x: base.x - frame.width / 2, y: base.y, z: base.z })
    const right = projectArt(cam, { x: base.x + frame.width / 2, y: base.y, z: base.z })
    return leftBat.every((p) => p.x < left.x || p.x > right.x || p.y < top.y || p.y > foot.y)
  })
  check("a left-hander's machine spots are mirrored clear of the bat", clear)
  const early = launchFor('good', -0.07, { dx: 1, dy: 0, speed: 1100, power: 1, at: 0 }, 1, () => 0.5, true)
  check('a left-hander pulls early hits to the right', early.spray > 0, `${Math.round(early.spray)} deg`)
}
{
  let openingOnMound = true
  let repeats = 0
  let seed = 3
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let game = 0; game < 100; game += 1) {
    let previous = MOUND_SPOT.id
    for (let i = 0; i < 20; i += 1) {
      const spot = spotForPitch(i, i * 300, previous, rng)
      if (i < MOUND_PITCHES && spot.id !== MOUND_SPOT.id) openingOnMound = false
      if (i >= MOUND_PITCHES && spot.id === previous) repeats += 1
      previous = spot.id
    }
  }
  check(`the first ${MOUND_PITCHES} pitches all come from the mound`, openingOnMound)
  check('after that the machine moves every pitch', repeats === 0)
}
check('ball leaves the chute at the painted size', near(pitchBallRadius(first, 0), machineFrame().ballRadius, 1e-9))
const chute = pitchPosition(first, 0)
const frame = machineFrame()
check('ball starts at the chute', near(chute.x, frame.chute.x, 1e-9) && near(chute.y, frame.chute.y, 1e-9))

let closest = Infinity
for (let i = 0; i <= 20; i += 1) {
  const ball = projectArt(cam, pitchPosition(first, (first.flightTime * i) / 20))
  for (let j = 2; j <= 10; j += 1) {
    const bat = projectArt(cam, along(REST_DIR, (DEFAULT_BAT.length * j) / 10))
    closest = Math.min(closest, Math.hypot((ball.x - bat.x) * ART.aspect, ball.y - bat.y))
  }
}
check('resting bat stays clear of the pitch path', closest > 0.03, `closest ${f3(closest)} of picture height`)
const hands = projectArt(cam, BAT.hands)
check('handle end is in the bottom-right foreground', hands.x > 0.75 && hands.x < 0.98 && hands.y > 0.65 && hands.y < FIT.hardBottom, `${f3(hands.x)}, ${f3(hands.y)}`)
const restTip = projectArt(cam, along(REST_DIR, DEFAULT_BAT.length))
for (const design of BAT_DESIGNS) {
  const tip = projectArt(cam, along(REST_DIR, design.length))
  const ok = design.profile[0][1] === 0 && design.profile[design.profile.length - 1][1] === 1 && design.profile.every(([r, s], i) => r >= 0 && (i === 0 || s >= design.profile[i - 1][1]))
  check(`bat design ${design.id} ${design.name} is well formed and clear of the scoreboard`, ok && tip.y > ART.board.bottom + 0.05, `${design.length}m, barrel ${f3(batBarrelRadius(design))}m`)
}
check('resting bat stays below the scoreboard', restTip.y > ART.board.bottom + 0.08, `tip ${f3(restTip.x)}, ${f3(restTip.y)}`)


const contactPos: Vec3 = { x: 0, y: STRIKE_ZONE.centreY, z: CONTACT_Z }
const straight = { dx: -1, dy: 0, speed: 1100, power: 1, at: 0 }
for (const [quality, error, power] of [
  ['perfect', 0, 1],
  ['perfect', 0, FLICK.minPower],
  ['perfect', 0, FLICK.maxPower],
  ['good', -0.07, 1],
  ['good', 0.07, 1],
  ['weak', -0.13, 1],
  ['weak', 0.13, 1],
] as const) {
  const launch = launchFor(quality, error, straight, power, () => 0.5)
  const flight = simulateFlight(contactPos, launch.velocity)
  console.log(
    `     ${quality} ${error >= 0 ? '+' : ''}${error}s power ${power}: ${hitKind(flight)}, ${Math.round(flight.landedAt ?? 0)}m, spray ${Math.round(launch.spray)} deg`,
  )
}
const perfectRun = simulateFlight(contactPos, launchFor('perfect', 0, straight, 1, () => 0.5).velocity)
check('a normal perfect hit is a home run', hitKind(perfectRun) === 'homeRun')
check('a home run carries past the fence', carryDistance(perfectRun) > Math.abs(FIELD.fenceZ) + 5, `${Math.round(carryDistance(perfectRun))}m`)
const goodRun = simulateFlight(contactPos, launchFor('good', -0.07, straight, 1, () => 0.5).velocity)
check('a good hit goes deep but stays in', hitKind(goodRun) === 'deep' || hitKind(goodRun) === 'short', hitKind(goodRun))
const weakRun = simulateFlight(contactPos, launchFor('weak', -0.13, straight, 1, () => 0.5).velocity)
check('an early weak hit is a ground ball', hitKind(weakRun) === 'ground')
const earlySpray = launchFor('good', -0.07, straight, 1, () => 0.5).spray
const lateSpray = launchFor('good', 0.07, straight, 1, () => 0.5).spray
check('early pulls left, late pushes right', earlySpray < 0 && lateSpray > 0 && Math.abs(lateSpray) < 45)

if (failures > 0) {
  console.log(`\n${failures} baseball check(s) failed`)
  process.exit(1)
}
console.log('\nAll baseball checks passed')
