import {
  HIT_PAD_X,
  MAX_VX,
  PAD_CHANCE,
  PAD_DRAW_W,
  PAD_FORWARD_SHARE,
  PLAYER_RADIUS,
  RAPIDS_CHANCE,
  RAPIDS_HW,
  RIVER_LEFT,
  RIVER_RIGHT,
  WHIRL_CATCH_R,
  WHIRL_CHANCE,
} from '../constants';
import { curve, gapWidth, hazardChance, movingChance, riverSpeed, rowSpacing } from './Difficulty';
import { clamp } from '../math';
import type { GemSpawn, ObstacleKind, ObstacleSpawn, PadSpawn, RapidsSpawn, WhirlSpawn } from '../types';

interface KindDef {
  /** Texture key, loaded in BootScene. */
  kind: ObstacleKind;
  /** Hit box size in world units, covering the object itself rather than its faded water. */
  w: number;
  h: number;
  /** Width the art is drawn at; its height follows the image. */
  drawW: number;
  /** Where the hit box sits on the art, from its top (0) to bottom (1). The faded water is at the bottom. */
  originY: number;
  /** Narrowest stretch of river this fits in. */
  minSpan: number;
  /** Hazards stay out of the calm opening and grow more common further down. */
  hazard: boolean;
  /** How often it is picked compared with the others. */
  weight: number;
  /** Can sway side to side once the river gets going. */
  drifts: boolean;
  /** Turns while it floats, in radians a second. */
  spin: number;
  /** Mirrored at random for variety. */
  flips: boolean;
  /** Grows from this bank: the art's root end touches the bank edge, and it never drifts. */
  bank?: 'left' | 'right';
}

/** Gap between a bank tree's hit box and the bank, so the roots at the very edge are not solid. */
const BANK_ROOT_GAP = 6;
/** How far a bank tree's roots lie over the bank. */
const BANK_OVERLAP = 18;

/** Every obstacle the river can spawn. All of them end the run on contact. */
const KINDS: KindDef[] = [
  { kind: 'rock-small', w: 60, h: 40, drawW: 82, originY: 0.46, minSpan: 72, hazard: false, weight: 1.25, drifts: false, spin: 0, flips: true },
  { kind: 'barrel-upright', w: 46, h: 50, drawW: 62, originY: 0.45, minSpan: 60, hazard: false, weight: 1, drifts: true, spin: 0, flips: true },
  { kind: 'barrel-side', w: 66, h: 42, drawW: 86, originY: 0.45, minSpan: 78, hazard: false, weight: 1, drifts: true, spin: 0, flips: true },
  { kind: 'rock-large', w: 100, h: 52, drawW: 132, originY: 0.46, minSpan: 112, hazard: false, weight: 0.85, drifts: false, spin: 0, flips: true },
  { kind: 'log', w: 150, h: 36, drawW: 172, originY: 0.42, minSpan: 160, hazard: false, weight: 0.9, drifts: true, spin: 0, flips: true },
  { kind: 'tree-left', w: 180, h: 42, drawW: 200, originY: 0.48, minSpan: 186, hazard: false, weight: 1.3, drifts: false, spin: 0, flips: false, bank: 'left' },
  { kind: 'tree-right', w: 180, h: 42, drawW: 200, originY: 0.48, minSpan: 186, hazard: false, weight: 1.3, drifts: false, spin: 0, flips: false, bank: 'right' },
];

export type RowLayout = 'flank' | 'left' | 'right' | 'scatter' | 'wide';

export interface Row {
  lastGapX: number;
  layout: RowLayout;
  obstacles: ObstacleSpawn[];
  gems: GemSpawn[];
  pads: PadSpawn[];
  rapids: RapidsSpawn[];
  whirls: WhirlSpawn[];
}

/**
 * Builds one river row with a gap the player can always reach from the previous gap.
 * Obstacles stay outside that gap, including ones that drift sideways.
 */
export function buildRow(
  y: number,
  distance: number,
  lastGapX: number,
  calm: boolean,
  previous: RowLayout | null,
): Row {
  const t = calm ? 0 : curve(distance);
  const gapW = calm ? 220 : gapWidth(t);
  const speed = Math.max(120, riverSpeed(t));
  const spacing = rowSpacing(t);
  const reach = MAX_VX * (spacing / speed) * 0.62;
  const minCenter = RIVER_LEFT + gapW / 2 + 8;
  const maxCenter = RIVER_RIGHT - gapW / 2 - 8;
  const gapX = nextGap(lastGapX, minCenter, maxCenter, reach, calm);
  const gapL = gapX - gapW / 2;
  const gapR = gapX + gapW / 2;
  const leftSpan: [number, number] = [RIVER_LEFT, gapL - HIT_PAD_X];
  const rightSpan: [number, number] = [gapR + HIT_PAD_X, RIVER_RIGHT];
  const yRoomEarly = calm ? 10 : Math.max(10, Math.min(32, (spacing - 160) * 0.28));
  // Rapids win first; otherwise a whirlpool may take one edge of the gap.
  const rapidsRow = !calm && Math.random() < RAPIDS_CHANCE;
  const whirl = !rapidsRow && !calm && Math.random() < WHIRL_CHANCE ? placeWhirl(gapL, gapR, gapW, y, yRoomEarly) : null;
  // Obstacles on the whirlpool's side keep clear of it.
  if (whirl?.side === 'left') leftSpan[1] = Math.min(leftSpan[1], whirl.x - WHIRL_CLEAR);
  if (whirl?.side === 'right') rightSpan[0] = Math.max(rightSpan[0], whirl.x + WHIRL_CLEAR);
  const leftWidth = leftSpan[1] - leftSpan[0];
  const rightWidth = rightSpan[1] - rightSpan[0];
  const layout = pickLayout(t, calm, previous, leftWidth, rightWidth);
  const wideSide: 'left' | 'right' = leftWidth >= rightWidth ? (Math.random() < 0.72 ? 'left' : 'right') : Math.random() < 0.72 ? 'right' : 'left';
  const pairSide: 'left' | 'right' | null = Math.random() < 0.5 ? 'left' : 'right';
  const yRoom = yRoomEarly;
  const stagger = calm ? 0 : (Math.random() < 0.5 ? -1 : 1) * yRoom * 0.55;
  const obstacles: ObstacleSpawn[] = [];
  const used: ObstacleKind[] = [];

  if (layout === 'left' || layout === 'flank' || layout === 'scatter' || layout === 'wide') {
    fillSide(obstacles, leftSpan[0], leftSpan[1], y + stagger, yRoom, t, calm, sideStyle(layout, 'left', wideSide, pairSide), used);
  }
  if (layout === 'right' || layout === 'flank' || layout === 'scatter' || layout === 'wide') {
    fillSide(obstacles, rightSpan[0], rightSpan[1], y - stagger, yRoom, t, calm, sideStyle(layout, 'right', wideSide, pairSide), used);
  }
  if (layout === 'left' && Math.random() < 0.28) {
    fillSide(obstacles, rightSpan[0], rightSpan[1], y - stagger, yRoom, t, calm, 'small', used);
  }
  if (layout === 'right' && Math.random() < 0.28) {
    fillSide(obstacles, leftSpan[0], leftSpan[1], y + stagger, yRoom, t, calm, 'small', used);
  }

  const gems: GemSpawn[] = [];
  const pads: PadSpawn[] = [];
  const rapids: RapidsSpawn[] = [];
  const whirls: WhirlSpawn[] = [];
  if (rapidsRow) {
    // Rapids sit in the gap, off to one side where there is room, so a quick cub can skirt them.
    const room = Math.max(0, gapW - RAPIDS_HW * 2 - 8);
    rapids.push({
      x: clamp(gapL + RAPIDS_HW + 4 + Math.random() * room, RIVER_LEFT + RAPIDS_HW, RIVER_RIGHT - RAPIDS_HW),
      y: y + (Math.random() * 2 - 1) * yRoom * 0.3,
    });
  } else if (whirl) {
    whirls.push({ x: whirl.x, y: whirl.y, dir: whirl.dir });
  } else if (!calm && Math.random() < PAD_CHANCE) {
    // A pad takes the gap's pickup slot, so it is always reachable and never under a coin.
    const room = Math.max(0, gapW - PAD_DRAW_W - 8);
    pads.push({
      x: gapL + PAD_DRAW_W / 2 + 4 + Math.random() * room,
      y: y + (Math.random() * 2 - 1) * yRoom * 0.3,
      kind: Math.random() < PAD_FORWARD_SHARE ? 'forward' : 'back',
    });
  } else if (!calm && Math.random() < 0.58) {
    const along = 0.16 + Math.random() * 0.68;
    gems.push({
      x: clamp(gapL + 22 + along * (gapW - 44), gapL + 20, gapR - 20),
      y: y + (Math.random() * 2 - 1) * yRoom * 0.4,
      kind: Math.random() < 0.4 ? 'gold' : 'silver',
    });
  }

  return { lastGapX: gapX, layout, obstacles, gems, pads, rapids, whirls };
}

/** Open gap the cub's centre always keeps beside a whirlpool, since being caught ends the run. */
const WHIRL_LANE = 64;
/** How far obstacles on the whirlpool's side stay from its centre. */
const WHIRL_CLEAR = 90;

/**
 * A whirlpool on one edge of the gap: its catch circle reaches into the gap no further than
 * leaves WHIRL_LANE open on the other side. Null if neither edge has room.
 * The lane is measured where the cub's centre can actually go, so a gap against a bank counts
 * only the part away from it.
 */
function placeWhirl(
  gapL: number,
  gapR: number,
  _gapW: number,
  y: number,
  yRoom: number,
): (WhirlSpawn & { side: 'left' | 'right' }) | null {
  const openL = Math.max(gapL, RIVER_LEFT + PLAYER_RADIUS);
  const openR = Math.min(gapR, RIVER_RIGHT - PLAYER_RADIUS);
  const reach = Math.min(WHIRL_CATCH_R + 10, openR - openL - WHIRL_LANE);
  if (reach <= 0) return null;
  const sides: ('left' | 'right')[] = Math.random() < 0.5 ? ['left', 'right'] : ['right', 'left'];
  for (const side of sides) {
    const x = side === 'left' ? openL - WHIRL_CATCH_R + reach : openR + WHIRL_CATCH_R - reach;
    if (x < RIVER_LEFT + 24 || x > RIVER_RIGHT - 24) continue;
    return { x, y: y + (Math.random() * 2 - 1) * yRoom * 0.3, dir: Math.random() < 0.5 ? 1 : -1, side };
  }
  return null;
}

function nextGap(last: number, minCenter: number, maxCenter: number, reach: number, calm: boolean): number {
  const mid = (minCenter + maxCenter) / 2;
  const away = last - mid;
  let sign = Math.random() < 0.5 ? -1 : 1;
  if (Math.abs(away) > 28 && Math.random() < (calm ? 0.8 : 0.62)) sign = away > 0 ? -1 : 1;
  const roll = Math.random();
  const magnitude = calm
    ? roll < 0.3 ? 42 : 125
    : reach * (roll < 0.28 ? 0.18 + Math.random() * 0.14 : roll < 0.62 ? 0.42 + Math.random() * 0.2 : 0.76 + Math.random() * 0.24);
  return clamp(last + sign * magnitude, minCenter, maxCenter);
}

function pickLayout(
  t: number,
  calm: boolean,
  previous: RowLayout | null,
  leftSpan: number,
  rightSpan: number,
): RowLayout {
  const wideOk = leftSpan >= 150 || rightSpan >= 150;
  let options: RowLayout[] = calm
    ? ['flank', 'left', 'right', 'left', 'right']
    : ['flank', 'left', 'right', 'scatter', 'wide'];
  if (!wideOk) options = options.filter((layout) => layout !== 'wide');
  if (t < 0.18) options = options.filter((layout) => layout !== 'scatter');
  const fresh = options.filter((layout) => layout !== previous);
  const bag = fresh.length > 0 ? fresh : options;
  return bag[Math.floor(Math.random() * bag.length)] ?? 'flank';
}

function sideStyle(
  layout: RowLayout,
  side: 'left' | 'right',
  wideSide: 'left' | 'right',
  pairSide: 'left' | 'right',
): 'mixed' | 'small' | 'wide' | 'pair' | 'scatter' {
  if (layout === 'scatter') return side === pairSide ? 'scatter' : 'small';
  if (layout === 'wide') return side === wideSide ? 'wide' : 'small';
  if (layout === 'flank' && side === pairSide && Math.random() < 0.45) return 'pair';
  return 'mixed';
}

function fillSide(
  out: ObstacleSpawn[],
  left: number,
  right: number,
  y: number,
  yRoom: number,
  t: number,
  calm: boolean,
  style: 'mixed' | 'small' | 'wide' | 'pair' | 'scatter',
  used: ObstacleKind[],
): void {
  const span = right - left;
  if (span < 60) return;
  const count = (style === 'pair' && span > 150) || (style === 'scatter' && span > 130 && Math.random() < 0.6) ? 2 : 1;
  if (count === 1) {
    const single = style === 'pair' || style === 'scatter' ? 'small' : style;
    placeOne(out, left, right, y, yRoom, t, calm, single, used);
    return;
  }
  const cut = left + span * (0.38 + Math.random() * 0.24);
  placeOne(out, left, cut, y, yRoom, t, calm, 'small', used);
  placeOne(out, cut, right, y, yRoom, t, calm, 'small', used);
}

function placeOne(
  out: ObstacleSpawn[],
  left: number,
  right: number,
  y: number,
  yRoom: number,
  t: number,
  calm: boolean,
  style: 'mixed' | 'small' | 'wide',
  used: ObstacleKind[],
): void {
  const span = right - left;
  const onLeftBank = left <= RIVER_LEFT;
  const onRightBank = right >= RIVER_RIGHT;
  const kind = pickKind(span, t, calm, style, used, onLeftBank, onRightBank);
  if (!kind) return;

  const hw = Math.min(kind.w / 2, span / 2 - 6);
  const hh = kind.h / 2;
  if (hw < 18) return;

  const spanL = left + hw;
  const spanR = right - hw;
  const room = Math.max(0, spanR - spanL);
  const lean = Math.random();
  const bias = lean < 0.4 ? 0.16 : lean < 0.7 ? 0.5 : 0.84;
  let cx = clamp(spanL + room * (bias + (Math.random() - 0.5) * 0.22), spanL, spanR);
  const scale = hw / (kind.w / 2);
  const halfArt = (kind.drawW * scale) / 2;
  let artDX = 0;
  if (kind.bank === 'left') {
    cx = left - BANK_OVERLAP + BANK_ROOT_GAP + hw;
    artDX = left - BANK_OVERLAP + halfArt - cx;
  }
  if (kind.bank === 'right') {
    cx = right + BANK_OVERLAP - BANK_ROOT_GAP - hw;
    artDX = right + BANK_OVERLAP - halfArt - cx;
  }
  const moving = !calm && !kind.bank && kind.drifts && room > 18 && Math.random() < movingChance(t);

  used.push(kind.kind);
  out.push({
    kind: kind.kind,
    x: cx,
    y: y + (Math.random() * 2 - 1) * yRoom * 0.45,
    hw,
    hh,
    moving,
    spanL,
    spanR,
    freq: 0.7 + Math.random() * 1.5,
    phase: Math.random() * Math.PI * 2,
    spin: kind.spin,
    // A squeezed hit box draws the art smaller to match.
    drawW: kind.drawW * scale,
    originY: kind.originY,
    flip: kind.flips && Math.random() < 0.5,
    artDX,
  });
}

function pickKind(
  span: number,
  t: number,
  calm: boolean,
  style: 'mixed' | 'small' | 'wide',
  used: ObstacleKind[],
  onLeftBank: boolean,
  onRightBank: boolean,
): KindDef | null {
  let options = KINDS.filter(
    (kind) =>
      kind.minSpan <= span + 8 &&
      (kind.bank !== 'left' || onLeftBank) &&
      (kind.bank !== 'right' || onRightBank),
  );
  if (calm) options = options.filter((kind) => !kind.hazard && kind.w <= 80);
  else if (Math.random() > hazardChance(t)) options = options.filter((kind) => !kind.hazard);
  if (style === 'small') options = options.filter((kind) => kind.w <= 80);
  if (style === 'wide') {
    const broad = options.filter((kind) => kind.w >= 100);
    if (broad.length > 0) options = broad;
  }
  if (options.length === 0) return null;

  const fresh = options.filter((kind) => !used.includes(kind.kind));
  const bag = fresh.length > 0 ? fresh : options;
  let total = 0;
  const weights = bag.map((kind) => {
    let weight = kind.weight;
    if (span > 190 && kind.w >= 116) weight *= 2.1;
    total += weight;
    return weight;
  });
  let roll = Math.random() * total;
  for (let i = 0; i < bag.length; i += 1) {
    roll -= weights[i] ?? 0;
    if (roll <= 0) return bag[i] ?? null;
  }
  return bag[bag.length - 1] ?? null;
}
