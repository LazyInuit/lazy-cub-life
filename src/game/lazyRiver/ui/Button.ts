import Phaser from 'phaser';
import { FONT, TEXT_RES } from '../constants';
import { audio } from '../systems/Audio';

export class Button {
  readonly width: number;
  readonly height: number;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly zone: Phaser.GameObjects.Zone;
  private readonly fill: number;
  private x: number;
  private y: number;
  private armed = false;
  private shown = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    fill: number,
    onClick: () => void,
    fontSize = 28,
    textColor = '#083044',
  ) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.fill = fill;
    this.g = scene.add.graphics();
    this.label = scene.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${fontSize}px`,
        color: textColor,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(TEXT_RES);
    this.zone = scene.add.zone(x, y, width, height).setInteractive({ useHandCursor: true });
    this.redraw(false);

    this.zone.on('pointerdown', () => {
      if (!this.shown) return;
      this.armed = true;
      this.redraw(true);
      audio.unlock();
      audio.tap();
    });
    this.zone.on('pointerup', () => {
      if (!this.shown || !this.armed) return;
      this.armed = false;
      this.redraw(false);
      onClick();
    });
    this.zone.on('pointerout', () => {
      this.armed = false;
      this.redraw(false);
    });
  }

  get centerY(): number {
    return this.y;
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.label.setPosition(x, y);
    this.zone.setPosition(x, y);
    this.redraw(false);
  }

  setText(text: string): void {
    this.label.setText(text);
  }

  setVisible(visible: boolean): void {
    this.shown = visible;
    this.g.setVisible(visible);
    this.label.setVisible(visible);
    if (visible) this.zone.setInteractive({ useHandCursor: true });
    else this.zone.disableInteractive();
    this.redraw(false);
  }

  setDepth(depth: number): void {
    this.g.setDepth(depth);
    this.label.setDepth(depth + 1);
    this.zone.setDepth(depth + 2);
  }

  private redraw(pressed: boolean): void {
    this.g.clear();
    if (!this.shown) return;
    const lip = 8;
    const sink = pressed ? 5 : 0;
    const left = this.x - this.width / 2;
    const top = this.y - this.height / 2;
    const faceH = this.height - lip;
    this.g.fillStyle(darken(this.fill, 52), 1);
    this.g.fillRoundedRect(left, top + lip, this.width, faceH, 22);
    this.g.fillStyle(pressed ? darken(this.fill, 18) : this.fill, 1);
    this.g.fillRoundedRect(left, top + sink, this.width, faceH, 22);
    this.g.fillStyle(0xffffff, 0.28);
    this.g.fillRoundedRect(left + 16, top + sink + 6, this.width - 32, Math.max(8, faceH * 0.22), 10);
    this.g.lineStyle(5, 0x1b2830, 1);
    this.g.strokeRoundedRect(left, top + sink, this.width, faceH, 22);
    this.label.setY(this.y - lip / 2 + sink);
  }
}

function darken(color: number, amount: number): number {
  const r = Math.max(0, ((color >> 16) & 255) - amount);
  const g = Math.max(0, ((color >> 8) & 255) - amount);
  const b = Math.max(0, (color & 255) - amount);
  return (r << 16) | (g << 8) | b;
}
