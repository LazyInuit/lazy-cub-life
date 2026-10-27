import { clamp } from './math';

export const GAME_HEIGHT = 960;
export const RIVER_WIDTH = 416;

/**
 * The world is always 960 tall. Its width follows the screen (540 to 640) so the canvas fills
 * the phone with no side bars; the river keeps its width and the extra goes to the banks.
 */
export let GAME_WIDTH = 540;
export let RIVER_LEFT = 62;
export let RIVER_RIGHT = 478;

export function setGameWidth(width: number): void {
  GAME_WIDTH = Math.round(clamp(width, 540, 640));
  RIVER_LEFT = Math.round((GAME_WIDTH - RIVER_WIDTH) / 2);
  RIVER_RIGHT = RIVER_LEFT + RIVER_WIDTH;
}

/** The Home and Games buttons over the canvas, in CSS pixels. The score bar starts to their right. */
export const NAV_CSS = { left: 10, top: 10, size: 50, gap: 8 } as const;

export const PLAYER_RADIUS = 36;
export const HIT_PAD_X = 32;
export const HIT_PAD_Y = 24;
export const MAX_VX = 540;
export const MAX_VY = 240;

export const STEER_STIFFNESS = 50;
export const STEER_DAMPING = 14;
export const KEY_SPEED_X = 280;
export const KEY_SPEED_Y = 140;
export const KEY_RESPONSE = 4.2;
export const COAST_DECAY_X = 3.2;
export const COAST_DECAY_Y = 5.2;
/** How far the cub moves for each unit the finger drags: across, and (more gently) up and down. */
export const HORIZONTAL_DRAG = 0.8;
export const VERTICAL_DRAG = 0.46;

export const GOLD_POINTS = 50;
export const SILVER_POINTS = 25;
export const NEAR_MISS_POINTS = 25;

/** Chance a row past the calm start has a water pad in its gap, and how many of those push forward. */
export const PAD_CHANCE = 0.16;
export const PAD_FORWARD_SHARE = 0.6;
/** Pads are tall water streams. Drawn this wide; the trigger is the stream's middle, without the splashes. */
export const PAD_DRAW_W = 104;
export const PAD_HW = 36;
export const PAD_HH = 96;
/**
 * A forward pad makes the river run up to 1.9x its speed for 2.4 seconds: more metres, less time to react.
 * A backward pad reverses the current to -0.7x for 1.4 seconds, washing the cub back and costing metres.
 */
export const PAD_SURGE = {
  forward: { peak: 1.9, seconds: 2.4 },
  back: { peak: -0.7, seconds: 1.4 },
} as const;

/**
 * Chance a row past the calm start has rapids in its gap. Inside them the river slows to RAPIDS_SLOW
 * of its speed and the cub is shoved about at random and dragged down toward the wave.
 * Drawn RAPIDS_DRAW_W wide; the hit area is the churning middle, without the faded edges.
 */
export const RAPIDS_CHANCE = 0.09;
export const RAPIDS_DRAW_W = 140;
export const RAPIDS_HW = 45;
export const RAPIDS_HH = 78;
export const RAPIDS_SLOW = 0.45;
export const RAPIDS_PUSH = 70;
export const RAPIDS_KICK = 340;

/**
 * Chance a row past the calm start has a whirlpool in its gap. A cub that strays within
 * WHIRL_CATCH_R of its centre is swept round it WHIRL_ORBIT_R out, clockwise or anticlockwise,
 * for WHIRL_SECONDS. The cub makes almost no headway meanwhile (WHIRL_SLOW of the river's
 * speed), so the wave closes in. Then it is flung WHIRL_FLING further along the circuit and
 * can't be caught by the same whirlpool again for WHIRL_COOLDOWN seconds.
 */
export const WHIRL_CHANCE = 0.07;
export const WHIRL_DRAW_W = 180;
export const WHIRL_CATCH_R = 58;
export const WHIRL_ORBIT_R = 60;
export const WHIRL_SPIN = 4.4;
export const WHIRL_SECONDS = 1.8;
export const WHIRL_SLOW = 0.08;
export const WHIRL_FLING = 70;
export const WHIRL_COOLDOWN = 1.4;

/**
 * A wave chases the cub up the river from the bottom of the screen. Touching it ends the run.
 * It keeps the river's cruising pace, so whenever the cub is slower (washed back by a stream or
 * held up in rapids) it closes in by WAVE_CATCHUP of the shortfall. Once the cub is back up to
 * pace it falls back by WAVE_RECEDE a second, faster during a forward stream.
 * A backward stream also pushes the cub down toward it.
 */
export const WAVE_HEIGHT = 74;
export const WAVE_CATCHUP = 0.22;
export const WAVE_RECEDE = 24;
export const WAVE_MAX_GAIN = 260;
export const BACK_PUSH = 170;

/** Cub Cash for each gold Kovu coin picked up, paid when the run ends. */
export const CASH_PER_COIN = 1;
/** Matches Bubble Blast and the dojo: 0.5 XP per 100 points. */
export const RIVER_XP_PER_SCORE = 0.005;

export const FONT = 'Fredoka, Trebuchet MS, Verdana, sans-serif';
export const TEXT_RES = 2;
