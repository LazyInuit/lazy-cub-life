import Phaser from 'phaser';
import {
  BACK_PUSH,
  FONT,
  GAME_HEIGHT,
  GAME_WIDTH,
  GOLD_POINTS,
  HIT_PAD_X,
  HIT_PAD_Y,
  NAV_CSS,
  PAD_DRAW_W,
  PAD_HH,
  PAD_HW,
  PAD_SURGE,
  PLAYER_RADIUS,
  RAPIDS_DRAW_W,
  RAPIDS_HH,
  RAPIDS_HW,
  RAPIDS_KICK,
  RAPIDS_PUSH,
  RAPIDS_SLOW,
  RIVER_LEFT,
  RIVER_RIGHT,
  SILVER_POINTS,
  TEXT_RES,
  WAVE_CATCHUP,
  WAVE_HEIGHT,
  WAVE_MAX_GAIN,
  WAVE_RECEDE,
  WHIRL_CATCH_R,
  WHIRL_COOLDOWN,
  WHIRL_DRAW_W,
  WHIRL_FLING,
  WHIRL_ORBIT_R,
  WHIRL_SECONDS,
  WHIRL_SLOW,
  WHIRL_SPIN,
} from '../constants';
import { FOAM_VARIANTS } from '../art/textures';
import { Player } from '../entities/Player';
import { clamp, lerp } from '../math';
import { bindAppEvents } from '../systems/appEvents';
import { audio } from '../systems/Audio';
import { curve, riverSpeed, rowSpacing } from '../systems/Difficulty';
import { haptics } from '../systems/Haptics';
import { SteerInput } from '../systems/Input';
import { buildRow, type RowLayout } from '../systems/rows';
import { Button } from '../ui/Button';
import { formatDistance, formatNumber } from '../ui/format';
import type {
  Bounds,
  GemSpawn,
  ObstacleKind,
  ObstacleSpawn,
  PadKind,
  PadSpawn,
  RapidsSpawn,
  RunResult,
  WhirlSpawn,
} from '../types';
import { Backdrop } from '../world/Backdrop';
import { PLAY_ON_BOOT } from './BootScene';

interface Obstacle {
  sprite: Phaser.GameObjects.Image;
  kind: ObstacleKind;
  x: number;
  y: number;
  hw: number;
  hh: number;
  moving: boolean;
  spanL: number;
  spanR: number;
  freq: number;
  phase: number;
  spin: number;
  artDX: number;
  passed: boolean;
  active: boolean;
}

interface Gem {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  points: number;
  gold: boolean;
  active: boolean;
  taken: boolean;
  phase: number;
}

interface Pad {
  sprite: Phaser.GameObjects.Image;
  /** A brightened copy over the stream that pulses. */
  glow: Phaser.GameObjects.Image;
  kind: PadKind;
  x: number;
  y: number;
  phase: number;
  /** Scale that draws the stream PAD_DRAW_W wide. */
  baseScale: number;
  fxAcc: number;
  used: boolean;
  active: boolean;
}

interface Whirl {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  dir: 1 | -1;
  /** Seconds before it can catch the cub again after letting go. */
  cooldown: number;
  baseScale: number;
  fxAcc: number;
  active: boolean;
}

/**
 * A small effect living on a stream, rapids or whirlpool. It sits at an offset from its owner,
 * so it scrolls with it. Streaks run along a stream, foam churns on rapids, bubbles spiral into a whirlpool.
 */
interface Ambient {
  sprite: Phaser.GameObjects.Image;
  kind: 'streak' | 'churn' | 'spiral';
  owner: { x: number; y: number; active: boolean };
  lx: number;
  ly: number;
  vx: number;
  vy: number;
  /** Spiral only: angle and distance from the owner's centre, and turn direction. */
  angle: number;
  radius: number;
  startRadius: number;
  dir: number;
  width: number;
  height: number;
  grow: number;
  alpha: number;
  life: number;
  max: number;
  active: boolean;
}

/** A whirlpool sweeping the cub round its centre. */
interface WhirlHold {
  whirl: Whirl;
  angle: number;
  radius: number;
  time: number;
}

interface Rapids {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  phase: number;
  /** Scale that draws the rapids RAPIDS_DRAW_W wide. */
  baseScale: number;
  fxAcc: number;
  active: boolean;
}

/** A pad's push: the river speed bends toward the pad's peak and back over its seconds. */
interface Surge {
  kind: PadKind;
  left: number;
  total: number;
}

interface Particle {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  active: boolean;
}

/** The cub's wake: ripple rings left behind the ring and spray peeling off its sides, carried off by the current. */
interface Trail {
  sprite: Phaser.GameObjects.Image;
  kind: 'ripple' | 'wake';
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  growW: number;
  growH: number;
  alpha: number;
  life: number;
  max: number;
  active: boolean;
}

/** A clump of foam churning on the wave's white crest. It rides its spot on the image as the wave moves. */
interface Foam {
  sprite: Phaser.GameObjects.Image;
  /** Spot on the wave image, as fractions of its width and height. */
  u: number;
  v: number;
  vu: number;
  /** Offset from that spot: negative bubbles up out of the foam. */
  rise: number;
  riseV: number;
  tilt: number;
  width: number;
  grow: number;
  alpha: number;
  life: number;
  max: number;
  active: boolean;
}

interface Floater {
  text: Phaser.GameObjects.Text;
  life: number;
  active: boolean;
}

/** idle: the start screen, the river drifts with the cub bobbing and nothing to hit. */
type Phase = 'idle' | 'play' | 'paused' | 'dying' | 'done';

export interface GameSceneData {
  play?: boolean;
}

/** Fired on game.events once a run ends, with the run's totals. */
export const RUN_OVER = 'river-over';

/**
 * How far the wave spills onto each bank, as a share of the bank's width. Above 1 its faded tips
 * run off the screen edges, so the solid foam spans the river and both banks.
 */
const WAVE_BANK_SHARE = 1.7;
/** How far the wave's crest swells up and settles, as it did when the art was only the crest. */
const WAVE_SWELL_PX = 140;

/**
 * Footprints are the drawn art, trimmed by these shares of its size on every side: streams and
 * rapids fade out softly at their edges, the obstacle art only a little.
 */
const PAD_INSET = 0.14;
const RAPIDS_INSET = 0.14;
const WHIRL_INSET = 0.16;
const OBSTACLE_INSET = 0.06;
/** Open water kept between any two footprints. */
const SPAWN_MARGIN = 6;
/** How far a coin or gem keeps from any footprint. */
const GEM_CLEARANCE = 22;

/** The box a piece's art covers on the water. */
interface Footprint {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** The art box for a piece drawn w by h at (x, y) with the given vertical origin, widened by any sideways drift. */
function footprint(x: number, y: number, w: number, h: number, originY: number, inset: number, sweepL = 0, sweepR = 0): Footprint {
  return {
    l: x - w / 2 + w * inset - sweepL,
    r: x + w / 2 - w * inset + sweepR,
    t: y - h * originY + h * inset,
    b: y + h * (1 - originY) - h * inset,
  };
}

/** 0 to 1 with soft shoulders at both ends. */
function smooth(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Whether something at y is on screen or just about to be, so effects aren't spent on it otherwise. */
function onScreen(y: number): boolean {
  return y > -160 && y < GAME_HEIGHT + 80;
}

function touches(a: Footprint, b: Footprint, margin: number): boolean {
  return a.l < b.r + margin && b.l < a.r + margin && a.t < b.b + margin && b.t < a.b + margin;
}

/** Speed the river drifts on the start screen. */
const IDLE_SPEED = 46;

export class GameScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private player!: Player;
  private rider!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Image;
  private steer = new SteerInput();
  private obstacles: Obstacle[] = [];
  private freeObstacles: Obstacle[] = [];
  private gems: Gem[] = [];
  private freeGems: Gem[] = [];
  private pads: Pad[] = [];
  private freePads: Pad[] = [];
  private surge: Surge | null = null;
  private rapids: Rapids[] = [];
  private freeRapids: Rapids[] = [];
  /** How hard the rapids are buffeting the cub, 0 to 1: rises inside them, settles once clear. */
  private buffet = 0;
  private kickIn = 0;
  private inRapids = false;
  private whirls: Whirl[] = [];
  private freeWhirls: Whirl[] = [];
  private whirlHold: WhirlHold | null = null;
  /** How held up the cub is by a whirlpool, 0 to 1, eased so the river slows and recovers smoothly. */
  private whirlEase = 0;
  /** Extra turn on the cub from being spun round, eased back upright once free. */
  private riderSpin = 0;
  private particles: Particle[] = [];
  private ambient: Ambient[] = [];
  private trail: Trail[] = [];
  private rippleAcc = 0;
  private wakeAcc = 0;
  private foam: Foam[] = [];
  private foamAcc = 0;
  private floaters: Floater[] = [];
  private scoreLabel!: Phaser.GameObjects.Text;
  private scoreValue!: Phaser.GameObjects.Text;
  private distLabel!: Phaser.GameObjects.Text;
  private distValue!: Phaser.GameObjects.Text;
  private coinLabel!: Phaser.GameObjects.Text;
  private coinValue!: Phaser.GameObjects.Text;
  private hudBar!: Phaser.GameObjects.Graphics;
  private waveChase!: Phaser.GameObjects.Image;
  private waveRoll!: Phaser.GameObjects.Image;
  private caughtLabel!: Phaser.GameObjects.Text;
  private waveTime = 0;
  private rollTime = 0;
  /** How far the wave has closed in above its resting line, from the cub falling behind the river's pace. */
  private waveGain = 0;
  private caughtByWave = false;
  private paw!: Phaser.GameObjects.Image;
  private overlay!: Phaser.GameObjects.Graphics;
  private pauseTitle!: Phaser.GameObjects.Text;
  private resume!: Button;
  private phase: Phase = 'idle';
  private distance = 0;
  private points = 0;
  private coins = 0;
  private collectibles = 0;
  private shownScore = -1;
  private shownDistance = -1;
  private shownCoins = -1;
  private lastGapX = 0;
  private lastLayout: RowLayout | null = null;
  private deathSpeed = 0;
  private acc = 0;
  private bob = 0;
  private hintDone = false;
  private bounds: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  constructor() {
    super('game');
  }

  init(data: GameSceneData): void {
    // Play may have been pressed while this scene was still starting up.
    const queued = this.registry.get(PLAY_ON_BOOT) === true;
    this.registry.set(PLAY_ON_BOOT, false);
    this.phase = data.play || queued ? 'play' : 'idle';
  }

  create(): void {
    this.distance = 0;
    this.points = 0;
    this.coins = 0;
    this.collectibles = 0;
    this.shownScore = -1;
    this.shownDistance = -1;
    this.shownCoins = -1;
    this.acc = 0;
    this.bob = 0;
    this.hintDone = this.phase !== 'play';
    this.steer = new SteerInput();
    this.steer.attach(this);
    this.obstacles = [];
    this.freeObstacles = [];
    this.gems = [];
    this.freeGems = [];
    this.pads = [];
    this.freePads = [];
    this.surge = null;
    this.rapids = [];
    this.freeRapids = [];
    this.buffet = 0;
    this.kickIn = 0;
    this.inRapids = false;
    this.whirls = [];
    this.freeWhirls = [];
    this.whirlHold = null;
    this.whirlEase = 0;
    this.riderSpin = 0;
    this.waveTime = 0;
    this.rollTime = 0;
    this.waveGain = 0;
    this.caughtByWave = false;
    this.particles = [];
    this.ambient = [];
    this.trail = [];
    this.rippleAcc = 0;
    this.wakeAcc = 0;
    this.foam = [];
    this.foamAcc = 0;
    this.floaters = [];
    this.backdrop = new Backdrop(this);
    this.shadow = this.add.image(0, 0, 'shadow').setDisplaySize(100, 32).setDepth(2);
    const frame = this.textures.get('player').getSourceImage() as HTMLImageElement;
    const aspect = frame.width / Math.max(1, frame.height);
    const riderH = 112;
    this.rider = this.add
      .image(0, 0, 'player')
      .setDisplaySize(riderH * aspect, riderH)
      .setOrigin(0.5, 0.78)
      .setDepth(4);

    this.createPools();
    this.createHud();
    this.layout();
    this.placePlayer();
    if (this.phase === 'play') this.seedRiver();

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);

    bindAppEvents(this, {
      hidden: () => {
        if (this.phase === 'play') this.setPaused(true);
      },
      viewport: () => this.layout(),
    });
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.input.off('pointerdown', this.onDown, this);
      this.input.off('pointermove', this.onMove, this);
      this.input.off('pointerup', this.onUp, this);
      this.input.off('pointerupoutside', this.onUp, this);
      this.scale.off('resize', this.layout, this);
      this.steer.cancel();
    });
  }

  update(_time: number, delta: number): void {
    if (this.phase === 'paused') return;
    this.acc += Math.min(delta, 40);
    const step = 1000 / 60;
    let steps = 0;
    while (this.acc >= step && steps < 3) {
      this.tick(step / 1000);
      this.acc -= step;
      steps += 1;
    }
    if (steps === 3) this.acc = 0;
  }

  /** Ends a run that is still going, as if the cub had crashed, so leaving mid-run still counts. */
  endRun(): void {
    if (this.phase === 'play' || this.phase === 'paused' || this.phase === 'dying') this.finishRun();
  }

  private tick(dt: number): void {
    const speed = this.currentSpeed(dt);
    if (this.phase === 'play') {
      // A whirlpool steers the cub itself while it has hold of it.
      if (!this.whirlHold) this.applySteer(dt);
      this.distance = Math.max(0, this.distance + (speed * dt) / 28);
      this.ensureRows();
      this.stepSurge(dt);
      if (!this.hintDone && (this.steer.totalDrag > 26 || Math.abs(this.player.vx) > 50)) {
        this.dismissHint();
      }
    }

    this.backdrop.scroll(speed * dt);
    this.stepPads(dt, speed);
    this.stepRapids(dt, speed);
    this.stepWhirls(dt, speed);
    this.stepObstacles(dt, speed);
    this.stepGems(dt, speed);
    this.stepParticles(dt, speed);
    this.stepAmbient(dt);
    this.stepTrail(dt, speed);
    this.stepFloaters(dt);
    this.syncRider(dt);
    this.stepWave(dt, speed);
    this.syncHint();
    this.syncHud();
  }

  private currentSpeed(dt: number): number {
    if (this.phase === 'idle') return IDLE_SPEED;
    const cruising = riverSpeed(curve(this.distance));
    if (this.phase === 'dying' || this.phase === 'done') {
      this.deathSpeed = Math.max(0, this.deathSpeed - 860 * dt);
      return this.deathSpeed;
    }
    const speed =
      cruising * this.surgeFactor() * (1 - (1 - RAPIDS_SLOW) * this.buffet) * (1 - (1 - WHIRL_SLOW) * this.whirlEase);
    this.deathSpeed = Math.max(0, speed);
    return speed;
  }

  /** How strongly the current pad is pushing, 0 to 1: eases in quickly, holds, then eases off over the last 30%. */
  private surgeEase(): number {
    if (!this.surge) return 0;
    const p = 1 - this.surge.left / this.surge.total;
    return p < 0.15 ? p / 0.15 : p > 0.7 ? (1 - p) / 0.3 : 1;
  }

  /** River speed multiplier: 1 with no pad active. */
  private surgeFactor(): number {
    if (!this.surge) return 1;
    return 1 + (PAD_SURGE[this.surge.kind].peak - 1) * this.surgeEase();
  }

  /** Width at rest: the wave spans the river and spills over both banks. */
  private waveBaseW(): number {
    return RIVER_RIGHT - RIVER_LEFT + RIVER_LEFT * WAVE_BANK_SHARE * 2;
  }

  private waveBaseH(): number {
    const frame = this.textures.getFrame('wave-chase');
    return (this.waveBaseW() * frame.height) / Math.max(1, frame.width);
  }

  /**
   * The foam line: WAVE_HEIGHT above the screen bottom at rest, higher by however far the wave has
   * closed in. It bobs, and swells up and settles unevenly.
   */
  private waveLine(): number {
    const bob = Math.sin(this.waveTime * 1.6) * 5 + Math.sin(this.waveTime * 3.7 + 0.6) * 2;
    const swell = (Math.sin(this.waveTime * 2.3) * 0.035 + Math.sin(this.waveTime * 0.9 + 1) * 0.02) * WAVE_SWELL_PX;
    return GAME_HEIGHT - WAVE_HEIGHT + bob - swell - this.waveGain;
  }

  /**
   * Where the image's bottom sits. The art's water runs on well below its crest, so this stays off
   * screen as the wave closes in; past that it never rises above the edge, and the wave grows instead.
   */
  private waveBottom(): number {
    const profile = waveProfile(this);
    return Math.max(this.waveLine() + (1 - profile.mean) * this.waveBaseH(), GAME_HEIGHT + 12);
  }

  /** How much the wave has grown to reach its foam line from the bottom of the screen. It keeps its shape. */
  private waveGrow(): number {
    const profile = waveProfile(this);
    return Math.max(1, (this.waveBottom() - this.waveLine()) / Math.max(1, (1 - profile.mean) * this.waveBaseH()));
  }

  private waveDrawW(): number {
    return this.waveBaseW() * this.waveGrow();
  }

  private waveDrawH(): number {
    return this.waveBaseH() * this.waveGrow();
  }

  private waveCentreX(): number {
    return (RIVER_LEFT + RIVER_RIGHT) / 2 + Math.sin(this.waveTime * 0.8) * 6;
  }

  /** Top of the solid foam at x, read from the image so the catch matches what is drawn. */
  private waveTop(x: number): number {
    const profile = waveProfile(this);
    const w = this.waveDrawW();
    const h = this.waveDrawH();
    const u = clamp((x - (this.waveCentreX() - w / 2)) / w, 0, 1);
    const i = Math.min(profile.top.length - 1, Math.floor(u * profile.top.length));
    return this.waveBottom() - h * (1 - profile.top[i]);
  }

  private stepWave(dt: number, speed: number): void {
    this.waveTime += dt;
    const back = this.surge?.kind === 'back' ? this.surgeEase() : 0;
    if (this.phase === 'play') {
      // The river speeds up a touch every metre, so a lag of a few units still counts as keeping pace.
      const lag = riverSpeed(curve(this.distance)) - speed;
      const change = lag > 4 ? lag * WAVE_CATCHUP : Math.min(0, lag) * WAVE_CATCHUP - WAVE_RECEDE;
      this.waveGain = clamp(this.waveGain + change * dt, 0, WAVE_MAX_GAIN);
    }
    if (this.phase === 'play' && this.player.y + 20 > this.waveTop(this.player.x)) this.crash(true);

    const w = this.waveDrawW();
    const bottom = this.waveBottom();
    const x = this.waveCentreX();
    this.waveChase.setPosition(x, bottom).setDisplaySize(w, this.waveDrawH());
    this.stepFoam(dt, back);
    // Caught: the curling wave fades in and rises up over the cub, keeping its shape. Its water runs
    // on far below its crest, so the bottom stays off screen; it only stretches if it ever wouldn't.
    if (this.caughtByWave) {
      this.rollTime += dt;
      const p = Math.min(1, this.rollTime / 0.6);
      const rise = 1 - (1 - p) * (1 - p);
      const rollFrame = this.textures.getFrame('wave-roll');
      const rollH = (w * rollFrame.height) / Math.max(1, rollFrame.width);
      const startTop = this.waveLine() - 40;
      const top = startTop + (this.player.y - 150 - startTop) * rise;
      const h = Math.max(rollH, GAME_HEIGHT + 12 - top);
      this.waveRoll.setVisible(true).setAlpha(Math.min(1, p * 3)).setPosition(x, top + h).setDisplaySize(w, h);
      this.waveChase.setAlpha(1 - Math.min(1, p * 3));
    }
  }

  /** Foam churns up along the crest, more when a backward stream feeds the wave or the cub is close to it. */
  private stepFoam(dt: number, back: number): void {
    if (!this.caughtByWave) {
      const gap = this.waveTop(this.player.x) - this.player.y;
      const near = this.phase === 'play' ? clamp(1 - (gap - 20) / 180, 0, 1) : 0;
      this.foamAcc += dt * (12 + back * 18 + near * 12);
      while (this.foamAcc >= 1) {
        this.foamAcc -= 1;
        this.emitFoam();
      }
    }
    const w = this.waveDrawW();
    const h = this.waveDrawH();
    const left = this.waveCentreX() - w / 2;
    const bottom = this.waveBottom();
    for (const clump of this.foam) {
      if (!clump.active) continue;
      clump.life -= dt;
      if (clump.life <= 0) {
        clump.active = false;
        clump.sprite.setVisible(false);
        continue;
      }
      clump.u += clump.vu * dt;
      clump.rise += clump.riseV * dt;
      clump.riseV *= 1 - Math.min(1, dt * 1.6);
      clump.width += clump.grow * dt;
      const x = left + clump.u * w;
      const age = clump.max - clump.life;
      // The wave image fades out at its sides; the foam fades with it.
      const side = clamp(Math.min(clump.u, 1 - clump.u) / 0.2, 0, 1);
      const fade = Math.min(1, age / 0.25) * Math.min(1, clump.life / (clump.max * 0.5)) * side;
      clump.sprite
        .setPosition(x, bottom - h * (1 - clump.v) + clump.rise)
        .setRotation(this.crestAngle(x) + clump.tilt)
        .setDisplaySize(clump.width, clump.width * 0.5)
        .setAlpha(clump.alpha * fade);
    }
  }

  /** Slope of the crest at x, so foam sits along it rather than flat. */
  private crestAngle(x: number): number {
    const reach = 18;
    return clamp(Math.atan2(this.waveTop(x + reach) - this.waveTop(x - reach), reach * 2), -0.75, 0.75);
  }

  private emitFoam(): void {
    const clump = this.foam.find((item) => !item.active);
    const spots = waveProfile(this).foam;
    if (!clump || spots.length === 0) return;
    const spot = spots[Math.floor(Math.random() * spots.length)];
    if (!spot) return;
    clump.active = true;
    clump.u = spot.u;
    clump.v = spot.v;
    clump.vu = ((Math.random() - 0.5) * 16) / this.waveDrawW();
    clump.rise = 6 + Math.random() * 6;
    clump.riseV = -(10 + Math.random() * 14);
    clump.tilt = (Math.random() - 0.5) * 0.12;
    clump.width = 30 + Math.random() * 26;
    clump.grow = 10 + Math.random() * 10;
    clump.alpha = 0.8 + Math.random() * 0.2;
    clump.max = 0.8 + Math.random() * 0.6;
    clump.life = clump.max;
    clump.sprite
      .setTexture(`foam-${Math.floor(Math.random() * FOAM_VARIANTS)}`)
      .setFlipX(Math.random() < 0.5)
      .setVisible(true)
      .setAlpha(0);
  }

  private stepSurge(dt: number): void {
    if (!this.surge) return;
    this.surge.left -= dt;
    // Spray off the ring while the current pushes.
    if (Math.random() < 0.6) {
      const ahead = this.surge.kind === 'forward' ? 26 : -40;
      this.burst(this.player.x + (Math.random() - 0.5) * 50, this.player.y + ahead, this.surge.kind === 'forward' ? 0xe9fff4 : 0xffe1dc, 1, 110);
    }
    if (this.surge.left <= 0) this.surge = null;
  }

  private stepPads(dt: number, speed: number): void {
    for (const pad of this.pads) {
      if (!pad.active) continue;
      pad.y += speed * dt;
      pad.phase += dt;
      // A gentle shimmer that keeps the stream fully visible.
      if (!pad.used) pad.sprite.setScale(pad.baseScale * (1 + 0.025 * Math.sin(pad.phase * 6)), pad.baseScale);
      pad.sprite.setPosition(pad.x, pad.y);
      const pulse = 0.03 + 0.11 * (0.5 + 0.5 * Math.sin(pad.phase * 2.6));
      pad.glow.setPosition(pad.x, pad.y).setScale(pad.sprite.scaleX, pad.sprite.scaleY).setAlpha(pad.sprite.alpha * pulse);
      if (!pad.used && onScreen(pad.y)) {
        pad.fxAcc += dt * 5;
        while (pad.fxAcc >= 1) {
          pad.fxAcc -= 1;
          this.emitStreak(pad);
        }
      }
      if (
        this.phase === 'play' &&
        !pad.used &&
        Math.abs(this.player.x - pad.x) < PAD_HW + 8 &&
        Math.abs(this.player.y - pad.y) < PAD_HH + 6
      ) {
        this.triggerPad(pad);
      }
      if (pad.y > GAME_HEIGHT + 80) this.releasePad(pad);
    }
  }

  private triggerPad(pad: Pad): void {
    pad.used = true;
    const look = PAD_SURGE[pad.kind];
    this.surge = { kind: pad.kind, left: look.seconds, total: look.seconds };
    const forward = pad.kind === 'forward';
    if (forward) audio.boost();
    else audio.washBack();
    haptics.near();
    this.floatText(this.player.x, this.player.y - 74, forward ? 'WHOOSH!' : 'WASHED BACK!', forward ? '#9cffc8' : '#ffb3a6');
    this.tweens.add({
      targets: pad.sprite,
      alpha: 0,
      scaleX: pad.sprite.scaleX * 1.12,
      scaleY: pad.sprite.scaleY * 1.04,
      duration: 1400,
      ease: 'Sine.easeIn',
    });
  }

  private activatePad(spec: PadSpawn): void {
    if (!this.isClear(this.padFootprint(spec.kind, spec.x, spec.y))) return;
    const pad = this.freePads.pop();
    if (!pad) return;
    pad.active = true;
    pad.used = false;
    pad.kind = spec.kind;
    pad.x = spec.x;
    pad.y = spec.y;
    pad.phase = Math.random() * Math.PI * 2;
    pad.fxAcc = Math.random();
    const key = spec.kind === 'forward' ? 'pad-forward' : 'pad-back';
    pad.sprite.setTexture(key);
    pad.baseScale = PAD_DRAW_W / Math.max(1, pad.sprite.width);
    pad.sprite.setScale(pad.baseScale);
    pad.sprite.setAlpha(1);
    pad.sprite.setVisible(true);
    pad.sprite.setPosition(spec.x, spec.y);
    pad.glow.setTexture(key).setScale(pad.baseScale).setAlpha(0).setVisible(true).setPosition(spec.x, spec.y);
  }

  private releasePad(pad: Pad): void {
    if (!pad.active) return;
    this.tweens.killTweensOf(pad.sprite);
    pad.active = false;
    pad.sprite.setVisible(false);
    pad.glow.setVisible(false);
    this.freePads.push(pad);
  }

  /** A bright streak running along a stream the way it pushes: up a forward one, down a backward one. */
  private emitStreak(pad: Pad): void {
    const fx = this.takeAmbient(pad, 'streak');
    if (!fx) return;
    const half = this.drawnHeight(pad.kind === 'forward' ? 'pad-forward' : 'pad-back', PAD_DRAW_W) * 0.36;
    const up = pad.kind === 'forward' ? -1 : 1;
    fx.lx = (Math.random() - 0.5) * PAD_DRAW_W * 0.42;
    fx.ly = -up * half * (0.6 + Math.random() * 0.4);
    fx.vx = 0;
    fx.vy = up * (120 + Math.random() * 60);
    fx.width = 3 + Math.random() * 2;
    fx.height = 18 + Math.random() * 10;
    fx.grow = 0;
    fx.alpha = 0.3 + Math.random() * 0.2;
    fx.max = (half * 1.5) / Math.abs(fx.vy);
    fx.life = fx.max;
    fx.sprite.setTexture('particle').setBlendMode(Phaser.BlendModes.ADD).setTint(0xeafcff).setRotation(0).setFlipX(false);
  }

  /** A clump of foam bubbling up somewhere on the rapids. */
  private emitChurn(patch: Rapids): void {
    const fx = this.takeAmbient(patch, 'churn');
    if (!fx) return;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    fx.lx = Math.cos(a) * r * RAPIDS_HW * 1.05;
    fx.ly = Math.sin(a) * r * RAPIDS_HH * 0.95;
    fx.vx = (Math.random() - 0.5) * 30;
    fx.vy = 10 + Math.random() * 24;
    fx.width = 20 + Math.random() * 12;
    fx.height = fx.width * 0.5;
    fx.grow = 12 + Math.random() * 8;
    fx.alpha = 0.45 + Math.random() * 0.2;
    fx.max = 0.9 + Math.random() * 0.6;
    fx.life = fx.max;
    fx.sprite
      .setTexture(`foam-${Math.floor(Math.random() * FOAM_VARIANTS)}`)
      .setBlendMode(Phaser.BlendModes.NORMAL)
      .clearTint()
      .setRotation((Math.random() - 0.5) * 0.5)
      .setFlipX(Math.random() < 0.5);
  }

  /** A bubble or fleck of foam drawn round and down into a whirlpool. */
  private emitSpiral(whirl: Whirl): void {
    const fx = this.takeAmbient(whirl, 'spiral');
    if (!fx) return;
    const bubble = Math.random() < 0.3;
    fx.angle = Math.random() * Math.PI * 2;
    fx.startRadius = WHIRL_DRAW_W * (0.32 + Math.random() * 0.1);
    fx.radius = fx.startRadius;
    fx.dir = whirl.dir;
    fx.width = bubble ? 7 + Math.random() * 4 : 18 + Math.random() * 10;
    fx.height = bubble ? fx.width : fx.width * 0.5;
    fx.grow = 0;
    fx.alpha = bubble ? 0.5 : 0.6;
    fx.max = 1.4 + Math.random() * 0.6;
    fx.life = fx.max;
    fx.sprite
      .setTexture(bubble ? 'particle' : `foam-${Math.floor(Math.random() * FOAM_VARIANTS)}`)
      .setBlendMode(Phaser.BlendModes.NORMAL)
      .setFlipX(false);
    if (bubble) fx.sprite.setTint(0xffffff);
    else fx.sprite.clearTint();
  }

  /** Leaves ripples and side spray behind the cub's ring. The faster the river, the busier the wake. */
  private stepTrail(dt: number, speed: number): void {
    const moving = (this.phase === 'play' || this.phase === 'idle') && !this.caughtByWave;
    if (moving) {
      const pace = clamp(Math.abs(speed) / 140, 0.35, 1.6);
      this.rippleAcc += dt * 3.2 * pace;
      this.wakeAcc += dt * 14 * pace;
      while (this.rippleAcc >= 1) {
        this.rippleAcc -= 1;
        this.emitTrail('ripple', this.player.x + (Math.random() - 0.5) * 8, this.player.y + 20);
      }
      while (this.wakeAcc >= 1) {
        this.wakeAcc -= 1;
        // Mostly off the sides of the ring, some straight out the back.
        const side = Math.random() < 0.3 ? 0 : Math.random() < 0.5 ? -1 : 1;
        const x = this.player.x + side * (34 + Math.random() * 8) + (side === 0 ? (Math.random() - 0.5) * 20 : 0);
        this.emitTrail('wake', x, this.player.y + (side === 0 ? 26 : 14), side);
      }
    }
    for (const bit of this.trail) {
      if (!bit.active) continue;
      bit.life -= dt;
      if (bit.life <= 0) {
        bit.active = false;
        bit.sprite.setVisible(false);
        continue;
      }
      bit.x += bit.vx * dt;
      bit.y += (bit.vy + speed) * dt;
      bit.vx *= 1 - Math.min(1, dt * 1.8);
      bit.w += bit.growW * dt;
      bit.h += bit.growH * dt;
      const age = bit.max - bit.life;
      const fade = smooth(age / (bit.max * 0.15)) * smooth(bit.life / (bit.max * 0.75));
      bit.sprite.setPosition(bit.x, bit.y).setDisplaySize(bit.w, bit.h).setAlpha(bit.alpha * fade);
    }
  }

  private emitTrail(kind: Trail['kind'], x: number, y: number, side = 0): void {
    const bit = this.trail.find((item) => !item.active);
    if (!bit) return;
    bit.active = true;
    bit.kind = kind;
    bit.x = x;
    bit.y = y;
    if (kind === 'ripple') {
      bit.vx = 0;
      bit.vy = 12;
      bit.w = 64;
      bit.h = 22;
      bit.growW = 70;
      bit.growH = 20;
      bit.alpha = 0.6;
      bit.max = 1.3;
      bit.sprite.setTexture('ripple').setFlipX(false);
    } else {
      bit.vx = side * (40 + Math.random() * 40);
      bit.vy = 20 + Math.random() * 20;
      bit.w = (side === 0 ? 18 : 22) + Math.random() * 12;
      bit.h = bit.w * 0.5;
      bit.growW = 16;
      bit.growH = 6;
      bit.alpha = 0.6 + Math.random() * 0.2;
      bit.max = 0.7 + Math.random() * 0.4;
      bit.sprite.setTexture(`foam-${Math.floor(Math.random() * FOAM_VARIANTS)}`).setFlipX(Math.random() < 0.5);
    }
    bit.life = bit.max;
    bit.sprite.setVisible(true).setAlpha(0).setPosition(x, y).setDisplaySize(bit.w, bit.h);
  }

  private takeAmbient(owner: Ambient['owner'], kind: Ambient['kind']): Ambient | null {
    const fx = this.ambient.find((item) => !item.active);
    if (!fx) return null;
    fx.active = true;
    fx.kind = kind;
    fx.owner = owner;
    fx.sprite.setVisible(true).setAlpha(0);
    return fx;
  }

  private stepAmbient(dt: number): void {
    for (const fx of this.ambient) {
      if (!fx.active) continue;
      fx.life -= dt;
      if (fx.life <= 0 || !fx.owner.active) {
        fx.active = false;
        fx.sprite.setVisible(false);
        continue;
      }
      // Eases in over its first third and out over its last half, so nothing pops on or off.
      const age = fx.max - fx.life;
      let fade = smooth(age / (fx.max * 0.35)) * smooth(fx.life / (fx.max * 0.5));
      let x: number;
      let y: number;
      let w = fx.width;
      let h = fx.height;
      if (fx.kind === 'spiral') {
        // Drawn in faster the closer it gets, shrinking as it sinks.
        const depth = fx.radius / fx.startRadius;
        fx.radius = Math.max(4, fx.radius - (18 + 30 * (1 - depth)) * dt);
        fx.angle += fx.dir * (2.4 + 3.2 * (1 - depth)) * dt;
        x = fx.owner.x + Math.cos(fx.angle) * fx.radius;
        y = fx.owner.y + Math.sin(fx.angle) * fx.radius;
        w *= 0.35 + 0.65 * depth;
        h *= 0.35 + 0.65 * depth;
        fade *= smooth(depth * 2);
        fx.sprite.setRotation(fx.angle + (fx.dir * Math.PI) / 2);
        if (depth < 0.12) fx.life = 0;
      } else {
        fx.lx += fx.vx * dt;
        fx.ly += fx.vy * dt;
        fx.width += fx.grow * dt;
        fx.height += fx.grow * dt * (fx.kind === 'churn' ? 0.5 : 0);
        w = fx.width;
        h = fx.height;
        x = fx.owner.x + fx.lx;
        y = fx.owner.y + fx.ly;
      }
      fx.sprite.setPosition(x, y).setDisplaySize(w, h).setAlpha(fx.alpha * fade);
    }
  }

  private stepRapids(dt: number, speed: number): void {
    let inside = false;
    for (const patch of this.rapids) {
      if (!patch.active) continue;
      patch.y += speed * dt;
      patch.phase += dt;
      // The churn swells across and along, out of step, so the water looks restless.
      patch.sprite.setScale(
        patch.baseScale * (1 + 0.03 * Math.sin(patch.phase * 5)),
        patch.baseScale * (1 + 0.02 * Math.sin(patch.phase * 4 + 1.3)),
      );
      patch.sprite.setPosition(patch.x, patch.y);
      if (onScreen(patch.y)) {
        patch.fxAcc += dt * 6;
        while (patch.fxAcc >= 1) {
          patch.fxAcc -= 1;
          this.emitChurn(patch);
        }
      }
      const dx = (this.player.x - patch.x) / (RAPIDS_HW + PLAYER_RADIUS * 0.5);
      const dy = (this.player.y - patch.y) / (RAPIDS_HH + PLAYER_RADIUS * 0.5);
      if (this.phase === 'play' && dx * dx + dy * dy < 1) inside = true;
      if (patch.y > GAME_HEIGHT + 200) this.releaseRapids(patch);
    }
    if (inside && !this.inRapids) {
      audio.rapids();
      haptics.near();
      this.floatText(this.player.x, this.player.y - 74, 'RAPIDS!', '#bfefff');
    }
    this.inRapids = inside;
    this.buffet += ((inside ? 1 : 0) - this.buffet) * Math.min(1, dt * (inside ? 6 : 2.2));
    if (this.buffet < 0.01) {
      this.buffet = 0;
      return;
    }
    if (this.phase !== 'play') return;
    // Shoves in random directions, leaning downstream; the steering spring pulls the cub back each time.
    this.kickIn -= dt;
    if (this.kickIn <= 0) {
      this.kickIn = 0.09 + Math.random() * 0.1;
      const angle = Math.random() * Math.PI * 2;
      this.player.vx += Math.cos(angle) * RAPIDS_KICK * this.buffet;
      this.player.vy += (Math.sin(angle) * 0.5 + 0.3) * RAPIDS_KICK * this.buffet;
      this.burst(this.player.x + (Math.random() - 0.5) * 60, this.player.y + 10, 0xf4fbff, 3, 150);
    }
  }

  private activateRapids(spec: RapidsSpawn): void {
    if (!this.isClear(this.rapidsFootprint(spec.x, spec.y))) return;
    const patch = this.freeRapids.pop();
    if (!patch) return;
    patch.active = true;
    patch.x = spec.x;
    patch.y = spec.y;
    patch.phase = Math.random() * Math.PI * 2;
    patch.fxAcc = Math.random();
    patch.baseScale = RAPIDS_DRAW_W / Math.max(1, patch.sprite.width);
    patch.sprite.setScale(patch.baseScale).setFlipX(Math.random() < 0.5).setAlpha(1).setVisible(true).setPosition(spec.x, spec.y);
  }

  private stepWhirls(dt: number, speed: number): void {
    for (const whirl of this.whirls) {
      if (!whirl.active) continue;
      whirl.y += speed * dt;
      whirl.cooldown = Math.max(0, whirl.cooldown - dt);
      const held = this.whirlHold?.whirl === whirl;
      whirl.sprite.rotation += whirl.dir * (held ? 3.2 : 1.3) * dt;
      whirl.sprite.setPosition(whirl.x, whirl.y);
      if (onScreen(whirl.y)) {
        whirl.fxAcc += dt * (held ? 12 : 6);
        while (whirl.fxAcc >= 1) {
          whirl.fxAcc -= 1;
          this.emitSpiral(whirl);
        }
      }
      if (this.phase === 'play' && !this.whirlHold && whirl.cooldown <= 0) {
        const dx = this.player.x - whirl.x;
        const dy = this.player.y - whirl.y;
        if (dx * dx + dy * dy < WHIRL_CATCH_R * WHIRL_CATCH_R) this.catchInWhirl(whirl, dx, dy);
      }
      if (whirl.y > GAME_HEIGHT + 200 && !held) this.releaseWhirl(whirl);
    }
    this.whirlEase += ((this.whirlHold ? 1 : 0) - this.whirlEase) * Math.min(1, dt * (this.whirlHold ? 5 : 2.5));
    if (this.whirlHold) this.stepWhirlHold(dt);
    else if (this.riderSpin !== 0) {
      this.riderSpin *= 1 - Math.min(1, dt * 7);
      if (Math.abs(this.riderSpin) < 0.01) this.riderSpin = 0;
    }
  }

  private catchInWhirl(whirl: Whirl, dx: number, dy: number): void {
    this.whirlHold = { whirl, angle: Math.atan2(dy, dx), radius: Math.max(24, Math.hypot(dx, dy)), time: 0 };
    this.surge = null;
    audio.whirl();
    haptics.near();
    this.floatText(this.player.x, this.player.y - 74, 'WHIRLPOOL!', '#bfe4ff');
  }

  /** Sweeps the cub round the centre, speeding up as it settles onto the circuit, then flings it out. */
  private stepWhirlHold(dt: number): void {
    const hold = this.whirlHold;
    if (!hold) return;
    if (this.phase !== 'play') {
      this.whirlHold = null;
      return;
    }
    const { whirl } = hold;
    hold.time += dt;
    const spin = WHIRL_SPIN * (0.45 + 0.55 * Math.min(1, hold.time / 0.35));
    hold.angle += whirl.dir * spin * dt;
    hold.radius += (WHIRL_ORBIT_R - hold.radius) * Math.min(1, dt * 6);
    // Kept inside the cub's usual area so it never jumps when steering takes over again.
    const x = clamp(whirl.x + Math.cos(hold.angle) * hold.radius, this.bounds.minX, this.bounds.maxX);
    const y = clamp(whirl.y + Math.sin(hold.angle) * hold.radius, this.bounds.minY, this.bounds.maxY);
    // Velocity along the circuit, so the cub leans into the turn.
    this.player.vx = (x - this.player.x) / Math.max(dt, 1e-3);
    this.player.vy = 0;
    this.player.x = x;
    this.player.y = y;
    this.riderSpin += whirl.dir * spin * dt;
    if (Math.random() < 0.35) this.burst(x, y + 16, 0xeaf8ff, 1, 90);
    if (hold.time < WHIRL_SECONDS) return;

    // Let go: the cub carries on along the circuit and steering picks up from there.
    const tx = -Math.sin(hold.angle) * whirl.dir;
    const ty = Math.cos(hold.angle) * whirl.dir;
    const goX = clamp(x + tx * WHIRL_FLING, this.bounds.minX, this.bounds.maxX);
    const goY = clamp(y + ty * WHIRL_FLING, this.bounds.minY, this.bounds.maxY);
    this.player.vx = tx * 260;
    this.player.vy = ty * 160;
    this.player.targetX = goX;
    this.player.targetY = goY;
    this.steer.targetX = goX;
    this.steer.targetY = goY;
    // Leave the cub upright the short way round.
    this.riderSpin = Math.atan2(Math.sin(this.riderSpin), Math.cos(this.riderSpin));
    whirl.cooldown = WHIRL_COOLDOWN;
    this.whirlHold = null;
  }

  private activateWhirl(spec: WhirlSpawn): void {
    if (!this.isClear(this.whirlFootprint(spec.x, spec.y))) return;
    const whirl = this.freeWhirls.pop();
    if (!whirl) return;
    whirl.active = true;
    whirl.x = spec.x;
    whirl.y = spec.y;
    whirl.dir = spec.dir;
    whirl.cooldown = 0;
    whirl.fxAcc = Math.random();
    whirl.baseScale = WHIRL_DRAW_W / Math.max(1, whirl.sprite.width);
    // The art swirls clockwise; mirrored, it swirls the other way.
    whirl.sprite
      .setScale(whirl.baseScale)
      .setFlipX(spec.dir < 0)
      .setRotation(Math.random() * Math.PI * 2)
      .setAlpha(1)
      .setVisible(true)
      .setPosition(spec.x, spec.y);
  }

  private releaseWhirl(whirl: Whirl): void {
    if (!whirl.active) return;
    whirl.active = false;
    whirl.sprite.setVisible(false);
    this.freeWhirls.push(whirl);
  }

  /** It turns, so its footprint is the square its longer side sweeps. */
  private whirlFootprint(x: number, y: number): Footprint {
    const size = Math.max(WHIRL_DRAW_W, this.drawnHeight('whirlpool', WHIRL_DRAW_W));
    return footprint(x, y, size, size, 0.5, WHIRL_INSET);
  }

  /** Height a texture is drawn at when scaled to the given width. */
  private drawnHeight(key: string, width: number): number {
    const frame = this.textures.getFrame(key);
    return (width * frame.height) / Math.max(1, frame.width);
  }

  private padFootprint(kind: PadKind, x: number, y: number): Footprint {
    const key = kind === 'forward' ? 'pad-forward' : 'pad-back';
    return footprint(x, y, PAD_DRAW_W, this.drawnHeight(key, PAD_DRAW_W), 0.5, PAD_INSET);
  }

  private rapidsFootprint(x: number, y: number): Footprint {
    return footprint(x, y, RAPIDS_DRAW_W, this.drawnHeight('rapids', RAPIDS_DRAW_W), 0.5, RAPIDS_INSET);
  }

  /** Where an obstacle's art can be: everywhere along its drift for one that moves, unless `now` asks for where it is this frame. */
  private obstacleFootprint(
    o: Pick<Obstacle, 'kind' | 'x' | 'y' | 'artDX' | 'moving' | 'spanL' | 'spanR'>,
    drawW: number,
    originY: number,
    now = false,
  ): Footprint {
    const sweepL = o.moving && !now ? Math.max(0, o.x - o.spanL) : 0;
    const sweepR = o.moving && !now ? Math.max(0, o.spanR - o.x) : 0;
    return footprint(o.x + o.artDX, o.y, drawW, this.drawnHeight(o.kind, drawW), originY, OBSTACLE_INSET, sweepL, sweepR);
  }

  private activeObstacleFootprint(obstacle: Obstacle, now = false): Footprint {
    return this.obstacleFootprint(obstacle, obstacle.sprite.displayWidth, obstacle.sprite.originY, now);
  }

  /** Everything on the water: obstacles, streams (fading ones too) and rapids. */
  private footprints(): Footprint[] {
    const list: Footprint[] = [];
    for (const obstacle of this.obstacles) if (obstacle.active) list.push(this.activeObstacleFootprint(obstacle));
    for (const pad of this.pads) if (pad.active) list.push(this.padFootprint(pad.kind, pad.x, pad.y));
    for (const patch of this.rapids) if (patch.active) list.push(this.rapidsFootprint(patch.x, patch.y));
    for (const whirl of this.whirls) if (whirl.active) list.push(this.whirlFootprint(whirl.x, whirl.y));
    return list;
  }

  /** Nothing is ever drawn on top of anything else: a new piece only appears where the water is clear. */
  private isClear(box: Footprint): boolean {
    return !this.footprints().some((other) => touches(box, other, SPAWN_MARGIN));
  }

  private releaseRapids(patch: Rapids): void {
    if (!patch.active) return;
    patch.active = false;
    patch.sprite.setVisible(false);
    this.freeRapids.push(patch);
  }

  private applySteer(dt: number): void {
    // A backward stream washes the cub down toward the wave; dragging up fights it.
    if (this.surge?.kind === 'back') {
      const push = BACK_PUSH * this.surgeEase() * dt;
      this.player.y += push;
      this.player.targetY += push;
      this.steer.targetY = Math.min(this.bounds.maxY, this.steer.targetY + push);
    }
    // Rapids drag the cub down too, more gently.
    if (this.buffet > 0.01) {
      const push = RAPIDS_PUSH * this.buffet * dt;
      this.player.y += push;
      this.player.targetY += push;
      this.steer.targetY = Math.min(this.bounds.maxY, this.steer.targetY + push);
    }
    if (this.steer.dragging) {
      this.player.targetX = this.steer.targetX;
      this.player.targetY = this.steer.targetY;
      this.player.update(dt, { type: 'drag' }, this.bounds);
      return;
    }
    const x = this.steer.axisX();
    const y = this.steer.axisY();
    this.player.update(dt, { type: 'keys', x, y }, this.bounds);
  }

  private stepObstacles(dt: number, speed: number): void {
    for (const obstacle of this.obstacles) {
      if (!obstacle.active) continue;
      obstacle.y += speed * dt;
      if (obstacle.moving) {
        obstacle.phase += dt * obstacle.freq;
        const mid = (obstacle.spanL + obstacle.spanR) / 2;
        const amp = Math.max(0, (obstacle.spanR - obstacle.spanL) / 2);
        obstacle.x = mid + Math.sin(obstacle.phase) * amp;
      }
      if (obstacle.spin !== 0) obstacle.sprite.rotation += dt * obstacle.spin;
      obstacle.sprite.setPosition(obstacle.x + obstacle.artDX, obstacle.y);
      obstacle.sprite.setDepth(1.2 + obstacle.y / GAME_HEIGHT);

      if (this.phase === 'play' && overlaps(this.player.x, this.player.y, obstacle)) {
        this.crash();
      } else if (this.phase === 'play' && !obstacle.passed && obstacle.y > this.player.y) {
        obstacle.passed = true;
        this.tryNearMiss(obstacle);
      }

      if (obstacle.y > GAME_HEIGHT + 120) this.releaseObstacle(obstacle);
    }
  }

  private stepGems(dt: number, speed: number): void {
    for (const gem of this.gems) {
      if (!gem.active) continue;
      gem.y += speed * dt;
      gem.phase += dt * 3;
      if (!gem.taken) {
        gem.x += gem.vx * dt;
        const minX = RIVER_LEFT + 28;
        const maxX = RIVER_RIGHT - 28;
        if (gem.x < minX) {
          gem.x = minX;
          gem.vx = Math.abs(gem.vx);
        } else if (gem.x > maxX) {
          gem.x = maxX;
          gem.vx = -Math.abs(gem.vx);
        }
        this.bounceGem(gem, minX, maxX);
        // A coin rocks gently; a silver gem spins.
        gem.sprite.rotation = gem.gold ? Math.sin(gem.phase) * 0.18 : gem.phase;
      }
      gem.sprite.setPosition(gem.x, gem.y + Math.sin(gem.phase) * 12);
      gem.sprite.setDepth(1.3 + gem.y / GAME_HEIGHT);
      if (!gem.taken) {
        const dx = this.player.x - gem.x;
        const dy = this.player.y - gem.y;
        if (this.phase === 'play' && dx * dx + dy * dy < 46 * 46) this.collect(gem);
      }
      if (gem.y > GAME_HEIGHT + 80 && !gem.taken) this.releaseGem(gem);
    }
  }

  private stepParticles(dt: number, speed: number): void {
    for (const particle of this.particles) {
      if (!particle.active) continue;
      particle.vy += 260 * dt;
      particle.x += particle.vx * dt;
      particle.y += (particle.vy + speed * 0.25) * dt;
      particle.life -= dt;
      particle.sprite.setPosition(particle.x, particle.y);
      particle.sprite.setAlpha(clamp(particle.life / particle.max, 0, 1));
      if (particle.life <= 0) {
        particle.active = false;
        particle.sprite.setVisible(false);
      }
    }
  }

  private stepFloaters(dt: number): void {
    for (const floater of this.floaters) {
      if (!floater.active) continue;
      floater.life -= dt;
      floater.text.y -= 28 * dt;
      floater.text.setAlpha(clamp(floater.life / 0.6, 0, 1));
      if (floater.life <= 0) {
        floater.active = false;
        floater.text.setVisible(false);
      }
    }
  }

  private syncRider(dt: number): void {
    this.bob += dt;
    // Rapids add a quick rattle on top of the gentle bob.
    const rattle = this.buffet * (Math.sin(this.bob * 17) * 5 + Math.sin(this.bob * 29) * 3);
    const y = this.player.y + Math.sin(this.bob * 3.1) * 4 + rattle;
    this.rider.setPosition(this.player.x, y);
    const tilt = this.phase === 'idle' ? Math.sin(this.bob * 1.3) * 0.08 : clamp(this.player.vx / 720, -0.28, 0.28);
    this.rider.setRotation(tilt + this.buffet * Math.sin(this.bob * 23) * 0.16 + this.riderSpin);
    this.rider.setDepth(2 + this.player.y / GAME_HEIGHT);
    this.shadow.setPosition(this.player.x, this.player.y + 22);
    this.shadow.setDepth(1.9 + this.player.y / GAME_HEIGHT);
  }

  /** The lion paw presses under the cub and sweeps left and right until the first steer. */
  private syncHint(): void {
    if (this.hintDone || !this.paw.visible) return;
    const sweep = Math.sin(this.bob * 2.4) * 70;
    this.paw.setPosition(this.player.x + sweep, Math.min(GAME_HEIGHT - 70, this.player.y + 60));
  }

  private syncHud(): void {
    const roundedDistance = Math.floor(this.distance);
    const score = this.points + roundedDistance;
    if (score !== this.shownScore) {
      this.shownScore = score;
      this.scoreValue.setText(formatNumber(score));
    }
    if (roundedDistance !== this.shownDistance) {
      this.shownDistance = roundedDistance;
      this.distValue.setText(formatDistance(this.distance));
    }
    if (this.coins !== this.shownCoins) {
      this.shownCoins = this.coins;
      this.coinValue.setText(formatNumber(this.coins));
    }
  }

  private ensureRows(): void {
    let highest = Number.POSITIVE_INFINITY;
    for (const obstacle of this.obstacles) {
      if (obstacle.active) highest = Math.min(highest, obstacle.y);
    }
    for (const gem of this.gems) {
      if (gem.active) highest = Math.min(highest, gem.y);
    }
    let guard = 0;
    while ((highest === Number.POSITIVE_INFINITY || highest > -50) && guard < 3) {
      const spacing = rowSpacing(curve(this.distance));
      const y = (highest === Number.POSITIVE_INFINITY ? 40 : highest) - spacing;
      this.spawnBuilt(buildRow(y, this.distance, this.lastGapX, false, this.lastLayout));
      highest = y;
      guard += 1;
    }
  }

  private seedRiver(): void {
    this.lastGapX = this.player.x;
    this.lastLayout = null;
    let y = this.player.y - 300;
    for (let i = 0; i < 5; i += 1) {
      this.spawnBuilt(buildRow(y, 0, this.lastGapX, true, this.lastLayout));
      y -= rowSpacing(0) * 0.92;
    }
  }

  private spawnBuilt(row: ReturnType<typeof buildRow>): void {
    this.lastGapX = row.lastGapX;
    this.lastLayout = row.layout;
    for (const spec of row.obstacles) this.activateObstacle(spec);
    for (const spec of row.gems) this.activateGem(spec);
    for (const spec of row.pads) this.activatePad(spec);
    for (const spec of row.rapids) this.activateRapids(spec);
    for (const spec of row.whirls) this.activateWhirl(spec);
  }

  private activateObstacle(spec: ObstacleSpawn): void {
    // Dropping a piece only widens the way through, so a row stays passable.
    if (!this.isClear(this.obstacleFootprint(spec, spec.drawW, spec.originY))) return;
    const obstacle = this.freeObstacles.pop();
    if (!obstacle) return;
    obstacle.active = true;
    obstacle.passed = false;
    obstacle.kind = spec.kind;
    obstacle.x = spec.x;
    obstacle.y = spec.y;
    obstacle.hw = spec.hw;
    obstacle.hh = spec.hh;
    obstacle.moving = spec.moving;
    obstacle.spanL = spec.spanL;
    obstacle.spanR = spec.spanR;
    obstacle.freq = spec.freq;
    obstacle.phase = spec.phase;
    obstacle.spin = spec.spin;
    obstacle.sprite.setTexture(spec.kind);
    obstacle.sprite.setOrigin(0.5, spec.originY);
    obstacle.sprite.setDisplaySize(spec.drawW, (spec.drawW * obstacle.sprite.height) / Math.max(1, obstacle.sprite.width));
    obstacle.sprite.setFlipX(spec.flip);
    obstacle.sprite.setRotation(0);
    obstacle.sprite.setVisible(true);
    obstacle.sprite.setAlpha(1);
    obstacle.sprite.clearTint();
    obstacle.artDX = spec.artDX;
    obstacle.sprite.setPosition(spec.x + spec.artDX, spec.y);
  }

  private activateGem(spec: GemSpawn): void {
    const gem = this.freeGems.pop();
    if (!gem) return;
    const gold = spec.kind === 'gold';
    gem.active = true;
    gem.taken = false;
    gem.gold = gold;
    gem.x = spec.x;
    gem.y = spec.y;
    gem.points = gold ? GOLD_POINTS : SILVER_POINTS;
    const drift = lerp(62, 168, curve(this.distance));
    gem.vx = (Math.random() < 0.5 ? -1 : 1) * drift * (0.8 + Math.random() * 0.4);
    gem.phase = Math.random() * Math.PI * 2;
    gem.sprite.setTexture(gold ? 'coin' : 'gem-silver');
    fitSprite(gem.sprite, gold ? 46 : 40, gold ? 46 : 40, 1.15);
    gem.sprite.setAlpha(1);
    gem.sprite.setVisible(true);
    gem.sprite.setPosition(spec.x, spec.y);
    this.bounceGem(gem, RIVER_LEFT + 28, RIVER_RIGHT - 28);
  }

  private bounceGem(gem: Gem, minX: number, maxX: number): void {
    // Pickups slide off everything on the water, so nothing ever hides or covers a coin.
    const blockers: Footprint[] = [];
    for (const obstacle of this.obstacles) if (obstacle.active) blockers.push(this.activeObstacleFootprint(obstacle, true));
    for (const pad of this.pads) if (pad.active && !pad.used) blockers.push(this.padFootprint(pad.kind, pad.x, pad.y));
    for (const patch of this.rapids) if (patch.active) blockers.push(this.rapidsFootprint(patch.x, patch.y));
    for (const whirl of this.whirls) if (whirl.active) blockers.push(this.whirlFootprint(whirl.x, whirl.y));
    const radius = GEM_CLEARANCE;
    for (let pass = 0; pass < 2; pass += 1) {
      for (const block of blockers) {
        if (gem.y <= block.t - radius || gem.y >= block.b + radius) continue;
        const left = block.l - radius;
        const right = block.r + radius;
        if (gem.x <= left || gem.x >= right) continue;
        const leftOpen = left >= minX && left <= maxX;
        const rightOpen = right >= minX && right <= maxX;
        const goLeft = leftOpen && (!rightOpen || gem.x < (block.l + block.r) / 2);
        gem.x = goLeft ? left : right;
        gem.vx = (goLeft ? -1 : 1) * Math.abs(gem.vx);
      }
      if (gem.x < minX) {
        gem.x = minX;
        gem.vx = Math.abs(gem.vx);
      } else if (gem.x > maxX) {
        gem.x = maxX;
        gem.vx = -Math.abs(gem.vx);
      }
    }
  }

  private releaseObstacle(obstacle: Obstacle): void {
    if (!obstacle.active) return;
    obstacle.active = false;
    obstacle.sprite.setVisible(false);
    this.freeObstacles.push(obstacle);
  }

  private releaseGem(gem: Gem): void {
    if (!gem.active) return;
    gem.active = false;
    gem.taken = false;
    gem.sprite.setVisible(false);
    gem.sprite.setAlpha(1);
    this.freeGems.push(gem);
  }

  private collect(gem: Gem): void {
    gem.taken = true;
    this.collectibles += 1;
    this.points += gem.points;
    if (gem.gold) this.coins += 1;
    audio.collect();
    haptics.collect();
    this.burst(gem.x, gem.y, gem.gold ? 0xffd56a : 0xd5e2ea, 10, 160);
    this.floatText(gem.x, gem.y - 20, `+${gem.points}`, gem.gold ? '#ffd56a' : '#e7eef3');
    this.popScore();
    this.tweens.add({
      targets: gem.sprite,
      scaleX: gem.sprite.scaleX * 1.45,
      scaleY: gem.sprite.scaleY * 1.45,
      alpha: 0,
      duration: 140,
      onComplete: () => this.releaseGem(gem),
    });
  }

  private tryNearMiss(obstacle: Obstacle): void {
    const dx = Math.abs(this.player.x - obstacle.x);
    const limit = obstacle.hw + HIT_PAD_X;
    if (dx < limit || dx > limit + 34) return;
    audio.near();
    haptics.near();
    obstacle.sprite.setTint(0xffffff);
    this.time.delayedCall(120, () => {
      if (obstacle.active) obstacle.sprite.clearTint();
    });
  }

  private crash(byWave = false): void {
    if (this.phase !== 'play') return;
    this.phase = 'dying';
    this.surge = null;
    this.caughtByWave = byWave;
    this.steer.cancel();
    this.deathSpeed = riverSpeed(curve(this.distance));
    this.cameras.main.shake(180, 0.012);
    this.cameras.main.flash(120, 220, 244, 255, false);
    this.burst(this.player.x, this.player.y, 0xf4fbff, 12, 220);
    this.burst(this.player.x, this.player.y, 0x7fd4ef, 8, 140);
    if (byWave) {
      this.caughtLabel.setVisible(true).setAlpha(0).setScale(0.6);
      this.tweens.add({ targets: this.caughtLabel, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    }
    audio.crash();
    haptics.crash();
    this.hidePaw();
    this.time.delayedCall(720, () => this.finishRun());
  }

  private finishRun(): void {
    if (this.phase === 'done' || this.phase === 'idle') return;
    this.phase = 'done';
    this.surge = null;
    this.steer.cancel();
    this.hidePaw();
    this.overlay.setVisible(false);
    this.pauseTitle.setVisible(false);
    this.resume.setVisible(false);
    const distance = Math.floor(this.distance);
    const result: RunResult = {
      score: this.points + distance,
      distance,
      coins: this.coins,
      collectibles: this.collectibles,
    };
    this.game.events.emit(RUN_OVER, result);
  }

  private burst(x: number, y: number, tint: number, count: number, speed: number): void {
    let spawned = 0;
    for (const particle of this.particles) {
      if (particle.active) continue;
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.4 + Math.random() * 0.7);
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * velocity;
      particle.vy = Math.sin(angle) * velocity - 40;
      particle.max = 0.28 + Math.random() * 0.22;
      particle.life = particle.max;
      particle.sprite.setVisible(true);
      particle.sprite.setTint(tint);
      particle.sprite.setAlpha(1);
      particle.sprite.setDisplaySize(8 + Math.random() * 8, 8 + Math.random() * 8);
      particle.sprite.setPosition(x, y);
      spawned += 1;
      if (spawned >= count) break;
    }
  }

  private floatText(x: number, y: number, message: string, color: string): void {
    const floater = this.floaters.find((item) => !item.active);
    if (!floater) return;
    floater.active = true;
    floater.life = 0.65;
    floater.text.setText(message);
    floater.text.setColor(color);
    floater.text.setPosition(x, y);
    floater.text.setAlpha(1);
    floater.text.setVisible(true);
  }

  private popScore(): void {
    this.tweens.killTweensOf(this.scoreValue);
    this.scoreValue.setScale(1.18);
    this.tweens.add({ targets: this.scoreValue, scale: 1, duration: 160 });
  }

  private dismissHint(): void {
    if (this.hintDone) return;
    this.hintDone = true;
    this.tweens.add({
      targets: this.paw,
      alpha: 0,
      duration: 380,
      onComplete: () => this.hidePaw(),
    });
  }

  private hidePaw(): void {
    this.hintDone = true;
    this.paw.setVisible(false);
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.phase !== 'play') return;
    audio.unlock();
    this.steer.begin(pointer, this.player.x, this.player.y);
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (this.phase !== 'play') return;
    this.steer.move(pointer, this.bounds);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    this.steer.end(pointer);
  }

  private setPaused(paused: boolean): void {
    if (this.phase !== 'play' && this.phase !== 'paused') return;
    this.phase = paused ? 'paused' : 'play';
    this.steer.cancel();
    this.acc = 0;
    this.overlay.setVisible(paused);
    this.pauseTitle.setVisible(paused);
    this.resume.setVisible(paused);
    if (!paused) return;
    this.overlay.clear();
    this.overlay.fillStyle(0x062433, 0.55);
    this.overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  private placePlayer(): void {
    const x = (RIVER_LEFT + RIVER_RIGHT) / 2;
    // On the start screen the cub floats high, above the Play panel. In a run it starts with room above the wave.
    const safeY = GAME_HEIGHT - WAVE_HEIGHT - 20;
    const y = this.phase === 'idle' ? GAME_HEIGHT * 0.3 : this.bounds.minY + (safeY - this.bounds.minY) * 0.5;
    this.player = new Player(x, y);
    this.rider.setPosition(x, y);
    this.shadow.setPosition(x, y + 24);
  }

  /** Game units per CSS pixel, so the score bar can line up with the Home and Games buttons. */
  private cssScale(): number {
    const height = this.game.canvas?.getBoundingClientRect().height ?? 0;
    return height > 2 ? GAME_HEIGHT / height : 1.5;
  }

  private layout = (): void => {
    this.bounds = {
      minX: RIVER_LEFT + PLAYER_RADIUS,
      maxX: RIVER_RIGHT - PLAYER_RADIUS,
      minY: GAME_HEIGHT * 0.52,
      maxY: GAME_HEIGHT - 30,
    };
    if (this.player) {
      this.player.x = clamp(this.player.x, this.bounds.minX, this.bounds.maxX);
      if (this.phase !== 'idle') this.player.y = clamp(this.player.y, this.bounds.minY, this.bounds.maxY);
      this.player.targetX = clamp(this.player.targetX, this.bounds.minX, this.bounds.maxX);
      this.player.targetY = clamp(this.player.targetY, this.bounds.minY, this.bounds.maxY);
    }

    const css = this.cssScale();
    const top = NAV_CSS.top * css;
    const height = NAV_CSS.size * css;
    const left = (NAV_CSS.left + NAV_CSS.size * 2 + NAV_CSS.gap + 8) * css;
    const right = GAME_WIDTH - NAV_CSS.left * css;
    const col = (right - left) / 3;
    this.hudBar.clear();
    this.hudBar.fillStyle(0x0c3142, 0.82);
    this.hudBar.fillRoundedRect(left, top, right - left, height, 18);
    this.hudBar.lineStyle(4, 0x1b2830, 0.9);
    this.hudBar.strokeRoundedRect(left, top, right - left, height, 18);
    const statTop = top + Math.max(4, (height - 52) / 2);
    this.placeStat(this.scoreLabel, this.scoreValue, left + col * 0.5, statTop);
    this.placeStat(this.distLabel, this.distValue, left + col * 1.5, statTop);
    this.placeStat(this.coinLabel, this.coinValue, left + col * 2.5, statTop);
    this.pauseTitle.setPosition(GAME_WIDTH / 2, GAME_HEIGHT * 0.4);
    this.resume.setPosition(GAME_WIDTH / 2, GAME_HEIGHT * 0.52);
  };

  private placeStat(label: Phaser.GameObjects.Text, value: Phaser.GameObjects.Text, x: number, y: number): void {
    label.setPosition(x, y);
    value.setPosition(x, y + 20);
  }

  private createHud(): void {
    const labelStyle = {
      fontFamily: FONT,
      fontSize: '13px',
      color: '#d7f3ff',
      fontStyle: 'bold',
    };
    const valueStyle = {
      fontFamily: FONT,
      fontSize: '25px',
      color: '#f7fbff',
      fontStyle: 'bold',
    };
    const scoreStyle = { ...valueStyle, color: '#ffe08a' };
    const coinStyle = { ...valueStyle, color: '#ffd56a' };
    this.scoreLabel = this.add.text(0, 0, 'SCORE', labelStyle).setOrigin(0.5, 0).setResolution(TEXT_RES).setDepth(20);
    this.scoreValue = this.add.text(0, 0, '0', scoreStyle).setOrigin(0.5, 0).setResolution(TEXT_RES).setDepth(20);
    this.distLabel = this.add.text(0, 0, 'DISTANCE', labelStyle).setOrigin(0.5, 0).setResolution(TEXT_RES).setDepth(20);
    this.distValue = this.add.text(0, 0, '0 m', valueStyle).setOrigin(0.5, 0).setResolution(TEXT_RES).setDepth(20);
    this.coinLabel = this.add.text(0, 0, 'COINS', labelStyle).setOrigin(0.5, 0).setResolution(TEXT_RES).setDepth(20);
    this.coinValue = this.add.text(0, 0, '0', coinStyle).setOrigin(0.5, 0).setResolution(TEXT_RES).setDepth(20);
    this.hudBar = this.add.graphics().setDepth(19);
    this.waveChase = this.add.image(0, GAME_HEIGHT, 'wave-chase').setOrigin(0.5, 1).setDepth(15);
    this.waveRoll = this.add.image(0, GAME_HEIGHT, 'wave-roll').setOrigin(0.5, 1).setDepth(15.5).setVisible(false);
    // Above the wave as it rolls up, so it reads against open water.
    this.caughtLabel = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.42, 'CAUGHT BY\nTHE WAVE!', {
        fontFamily: FONT,
        fontSize: '42px',
        color: '#f7fbff',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setResolution(TEXT_RES)
      .setStroke('#0b3e56', 8)
      .setDepth(21)
      .setVisible(false);

    const pawFrame = this.textures.get('paw').getSourceImage() as HTMLImageElement;
    const pawH = 74;
    this.paw = this.add
      .image(0, 0, 'paw')
      .setDisplaySize((pawH * pawFrame.width) / Math.max(1, pawFrame.height), pawH)
      .setOrigin(0.5, 0.2)
      .setDepth(18)
      .setVisible(!this.hintDone);
    this.overlay = this.add.graphics().setDepth(30).setVisible(false);
    this.pauseTitle = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.4, 'PAUSED', {
        fontFamily: FONT,
        fontSize: '48px',
        color: '#f7fbff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(TEXT_RES)
      .setDepth(31)
      .setVisible(false);
    this.resume = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.52, 320, 84, 'RESUME', 0xffc857, () => {
      this.setPaused(false);
    }, 30);
    this.resume.setDepth(32);
    this.resume.setVisible(false);
  }

  private createPools(): void {
    for (let i = 0; i < 30; i += 1) {
      const sprite = this.add.image(0, -400, 'particle').setVisible(false);
      const obstacle: Obstacle = {
        sprite,
        kind: 'particle',
        x: 0,
        y: 0,
        hw: 20,
        hh: 20,
        moving: false,
        spanL: 0,
        spanR: 0,
        freq: 1,
        phase: 0,
        spin: 0,
        artDX: 0,
        passed: false,
        active: false,
      };
      this.obstacles.push(obstacle);
      this.freeObstacles.push(obstacle);
    }
    for (let i = 0; i < 6; i += 1) {
      const sprite = this.add.image(0, -400, 'pad-forward').setVisible(false).setDepth(1.05);
      const glow = this.add.image(0, -400, 'pad-forward').setVisible(false).setDepth(1.051).setBlendMode(Phaser.BlendModes.ADD);
      const pad: Pad = { sprite, glow, kind: 'forward', x: 0, y: 0, phase: 0, baseScale: 1, fxAcc: 0, used: false, active: false };
      this.pads.push(pad);
      this.freePads.push(pad);
    }
    for (let i = 0; i < 3; i += 1) {
      const sprite = this.add.image(0, -400, 'whirlpool').setVisible(false).setDepth(1.03);
      const whirl: Whirl = { sprite, x: 0, y: 0, dir: 1, cooldown: 0, baseScale: 1, fxAcc: 0, active: false };
      this.whirls.push(whirl);
      this.freeWhirls.push(whirl);
    }
    for (let i = 0; i < 3; i += 1) {
      const sprite = this.add.image(0, -400, 'rapids').setVisible(false).setDepth(1.04);
      const patch: Rapids = { sprite, x: 0, y: 0, phase: 0, baseScale: 1, fxAcc: 0, active: false };
      this.rapids.push(patch);
      this.freeRapids.push(patch);
    }
    for (let i = 0; i < 14; i += 1) {
      const sprite = this.add.image(0, -400, 'coin').setVisible(false);
      const gem: Gem = { sprite, x: 0, y: 0, vx: 0, points: 0, gold: false, active: false, taken: false, phase: 0 };
      this.gems.push(gem);
      this.freeGems.push(gem);
    }
    // Above the water features, under obstacles and the cub.
    for (let i = 0; i < 48; i += 1) {
      const sprite = this.add.image(0, -400, 'particle').setVisible(false).setDepth(1.15);
      this.trail.push({ sprite, kind: 'wake', x: 0, y: 0, vx: 0, vy: 0, w: 0, h: 0, growW: 0, growH: 0, alpha: 1, life: 0, max: 1, active: false });
    }
    for (let i = 0; i < 90; i += 1) {
      const sprite = this.add.image(0, -400, 'particle').setVisible(false).setDepth(1.06);
      const owner = { x: 0, y: 0, active: false };
      this.ambient.push({
        sprite,
        kind: 'streak',
        owner,
        lx: 0,
        ly: 0,
        vx: 0,
        vy: 0,
        angle: 0,
        radius: 0,
        startRadius: 1,
        dir: 1,
        width: 0,
        height: 0,
        grow: 0,
        alpha: 1,
        life: 0,
        max: 1,
        active: false,
      });
    }
    for (let i = 0; i < 42; i += 1) {
      const sprite = this.add.image(0, 0, 'particle').setVisible(false).setDepth(8);
      this.particles.push({ sprite, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, active: false });
    }
    for (let i = 0; i < 32; i += 1) {
      const sprite = this.add.image(0, 0, 'foam-0').setVisible(false).setDepth(15.2);
      this.foam.push({ sprite, u: 0, v: 0, vu: 0, rise: 0, riseV: 0, tilt: 0, width: 0, grow: 0, alpha: 1, life: 0, max: 1, active: false });
    }
    for (let i = 0; i < 8; i += 1) {
      const text = this.add
        .text(0, 0, '', {
          fontFamily: FONT,
          fontSize: '22px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setResolution(TEXT_RES)
        .setDepth(16)
        .setVisible(false);
      this.floaters.push({ text, life: 0, active: false });
    }
  }
}

interface WaveProfile {
  /** Top of the solid foam in each column, as a fraction of the image height. */
  top: number[];
  mean: number;
  /** White foam near the crest, as fractions of the image's width and height. */
  foam: { u: number; v: number }[];
}

let cachedWave: { source: unknown; profile: WaveProfile } | null = null;

/** How far below the solid foam top, in image pixels, crest foam is looked for. */
const CREST_FOAM_DEPTH = 54;

/**
 * Reads the chasing wave image once: where its solid foam starts in each column (loose bubbles above
 * it don't count), and where the white foam on the crest is.
 */
function waveProfile(scene: Phaser.Scene): WaveProfile {
  const source = scene.textures.get('wave-chase').getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  if (cachedWave && cachedWave.source === source) return cachedWave.profile;
  const columns = 72;
  const w = source.width;
  const h = source.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const found: (number | null)[] = [];
  let data: Uint8ClampedArray | null = null;
  if (ctx && w > 0 && h > 0) {
    ctx.drawImage(source, 0, 0);
    data = ctx.getImageData(0, 0, w, h).data;
    const run = Math.max(4, Math.round(h * 0.05));
    for (let c = 0; c < columns; c += 1) {
      const x = Math.min(w - 1, Math.floor(((c + 0.5) / columns) * w));
      let solid = 0;
      let top: number | null = null;
      for (let y = 0; y < h; y += 1) {
        solid = (data[(y * w + x) * 4 + 3] ?? 0) > 150 ? solid + 1 : 0;
        if (solid >= run) {
          top = (y - run + 1) / h;
          break;
        }
      }
      found.push(top);
    }
  }
  const known = found.filter((value): value is number => value !== null);
  const fallback = known.length > 0 ? known.reduce((sum, value) => sum + value, 0) / known.length : 0.45;
  // The faded side columns have no solid foam; give them the average so the wave edge still catches.
  const raw = Array.from({ length: columns }, (_, i) => found[i] ?? fallback);
  const top = raw.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let k = i - 2; k <= i + 2; k += 1) {
      if (k < 0 || k >= raw.length) continue;
      sum += raw[k] ?? fallback;
      count += 1;
    }
    return sum / Math.max(1, count);
  });
  const foam: { u: number; v: number }[] = [];
  if (data) {
    for (let y = 0; y < h; y += 3) {
      for (let x = 0; x < w; x += 3) {
        const i = (y * w + x) * 4;
        if ((data[i + 3] ?? 0) < 210 || Math.min(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0) < 215) continue;
        const column = top[Math.min(columns - 1, Math.floor((x / w) * columns))] ?? fallback;
        // Only the crest: the water below has light caustic lines that aren't foam.
        if (y - column * h > CREST_FOAM_DEPTH) continue;
        foam.push({ u: x / w, v: y / h });
      }
    }
  }
  const profile = { top, mean: top.reduce((sum, value) => sum + value, 0) / top.length, foam };
  cachedWave = { source, profile };
  return profile;
}

function fitSprite(sprite: Phaser.GameObjects.Image, boxW: number, boxH: number, scale: number): void {
  const aspect = sprite.width / Math.max(1, sprite.height);
  const boxAspect = boxW / boxH;
  if (aspect > boxAspect) {
    const width = boxW * scale;
    sprite.setDisplaySize(width, width / aspect);
  } else {
    const height = boxH * scale;
    sprite.setDisplaySize(height * aspect, height);
  }
}

function overlaps(px: number, py: number, obstacle: Obstacle): boolean {
  const dx = px - obstacle.x;
  const dy = py - obstacle.y;
  const rx = obstacle.hw + HIT_PAD_X;
  const ry = obstacle.hh + HIT_PAD_Y;
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) < 1;
}
