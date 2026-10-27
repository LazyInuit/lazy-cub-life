import Phaser from 'phaser';
import { HORIZONTAL_DRAG, VERTICAL_DRAG } from '../constants';
import { clamp } from '../math';
import type { Bounds } from '../types';

export class SteerInput {
  dragging = false;
  totalDrag = 0;
  targetX = 0;
  targetY = 0;

  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private left?: Phaser.Input.Keyboard.Key;
  private right?: Phaser.Input.Keyboard.Key;
  private up?: Phaser.Input.Keyboard.Key;
  private down?: Phaser.Input.Keyboard.Key;
  private leftArrow?: Phaser.Input.Keyboard.Key;
  private rightArrow?: Phaser.Input.Keyboard.Key;
  private upArrow?: Phaser.Input.Keyboard.Key;
  private downArrow?: Phaser.Input.Keyboard.Key;

  attach(scene: Phaser.Scene): void {
    const keyboard = scene.input.keyboard;
    if (!keyboard) return;
    const codes = Phaser.Input.Keyboard.KeyCodes;
    this.left = keyboard.addKey(codes.A);
    this.right = keyboard.addKey(codes.D);
    this.up = keyboard.addKey(codes.W);
    this.down = keyboard.addKey(codes.S);
    this.leftArrow = keyboard.addKey(codes.LEFT);
    this.rightArrow = keyboard.addKey(codes.RIGHT);
    this.upArrow = keyboard.addKey(codes.UP);
    this.downArrow = keyboard.addKey(codes.DOWN);
    keyboard.addCapture([
      codes.A,
      codes.D,
      codes.W,
      codes.S,
      codes.LEFT,
      codes.RIGHT,
      codes.UP,
      codes.DOWN,
      codes.SPACE,
    ]);
  }

  begin(pointer: Phaser.Input.Pointer, x: number, y: number): void {
    if (this.dragging) return;
    this.dragging = true;
    this.pointerId = pointer.id;
    this.lastX = pointer.x;
    this.lastY = pointer.y;
    this.targetX = x;
    this.targetY = y;
  }

  move(pointer: Phaser.Input.Pointer, bounds: Bounds): void {
    if (!this.dragging || pointer.id !== this.pointerId) return;
    const dx = pointer.x - this.lastX;
    const dy = pointer.y - this.lastY;
    this.lastX = pointer.x;
    this.lastY = pointer.y;
    this.totalDrag += Math.hypot(dx, dy);
    this.targetX = clamp(this.targetX + dx * HORIZONTAL_DRAG, bounds.minX, bounds.maxX);
    this.targetY = clamp(this.targetY + dy * VERTICAL_DRAG, bounds.minY, bounds.maxY);
  }

  end(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging || pointer.id !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
  }

  cancel(): void {
    this.dragging = false;
    this.pointerId = null;
  }

  axisX(): number {
    const left = this.held(this.left) || this.held(this.leftArrow);
    const right = this.held(this.right) || this.held(this.rightArrow);
    return (right ? 1 : 0) - (left ? 1 : 0);
  }

  axisY(): number {
    const up = this.held(this.up) || this.held(this.upArrow);
    const down = this.held(this.down) || this.held(this.downArrow);
    return (down ? 1 : 0) - (up ? 1 : 0);
  }

  private held(key?: Phaser.Input.Keyboard.Key): boolean {
    return key?.isDown ?? false;
  }
}
