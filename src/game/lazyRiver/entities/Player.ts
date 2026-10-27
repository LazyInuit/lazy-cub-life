import {
  COAST_DECAY_X,
  COAST_DECAY_Y,
  KEY_RESPONSE,
  KEY_SPEED_X,
  KEY_SPEED_Y,
  MAX_VX,
  MAX_VY,
  STEER_DAMPING,
  STEER_STIFFNESS,
} from '../constants';
import { clamp } from '../math';
import type { Bounds } from '../types';

export type SteerMode =
  | { type: 'drag' }
  | { type: 'keys'; x: number; y: number }
  | { type: 'coast' };

export class Player {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  targetX: number;
  targetY: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
  }

  update(dt: number, mode: SteerMode, bounds: Bounds): void {
    if (mode.type === 'drag') {
      this.spring(dt);
    } else if (mode.type === 'keys') {
      this.easeVelocity(mode.x * KEY_SPEED_X, mode.y * KEY_SPEED_Y, dt);
    } else {
      this.coast(dt);
    }

    this.vx = clamp(this.vx, -MAX_VX, MAX_VX);
    this.vy = clamp(this.vy, -MAX_VY, MAX_VY);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.x < bounds.minX) {
      this.x = bounds.minX;
      this.vx = Math.max(0, this.vx);
    } else if (this.x > bounds.maxX) {
      this.x = bounds.maxX;
      this.vx = Math.min(0, this.vx);
    }
    if (this.y < bounds.minY) {
      this.y = bounds.minY;
      this.vy = Math.max(0, this.vy);
    } else if (this.y > bounds.maxY) {
      this.y = bounds.maxY;
      this.vy = Math.min(0, this.vy);
    }
  }

  private easeVelocity(goalVx: number, goalVy: number, dt: number): void {
    const blend = 1 - Math.exp(-KEY_RESPONSE * dt);
    this.vx += (goalVx - this.vx) * blend;
    this.vy += (goalVy - this.vy) * blend;
    this.targetX = this.x;
    this.targetY = this.y;
    if (goalVx === 0 && Math.abs(this.vx) < 6) this.vx = 0;
    if (goalVy === 0 && Math.abs(this.vy) < 6) this.vy = 0;
  }

  private spring(dt: number): void {
    this.vx += ((this.targetX - this.x) * STEER_STIFFNESS - this.vx * STEER_DAMPING) * dt;
    this.vy += ((this.targetY - this.y) * STEER_STIFFNESS - this.vy * STEER_DAMPING) * dt;
  }

  private coast(dt: number): void {
    this.vx *= Math.exp(-COAST_DECAY_X * dt);
    this.vy *= Math.exp(-COAST_DECAY_Y * dt);
    if (Math.abs(this.vx) < 6) this.vx = 0;
    if (Math.abs(this.vy) < 6) this.vy = 0;
  }
}
