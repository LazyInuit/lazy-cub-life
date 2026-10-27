import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, RIVER_LEFT, RIVER_RIGHT } from '../constants';

export class Backdrop {
  readonly water: Phaser.GameObjects.TileSprite;
  readonly glint: Phaser.GameObjects.TileSprite;
  readonly bankL: Phaser.GameObjects.TileSprite;
  readonly bankR: Phaser.GameObjects.TileSprite;

  constructor(scene: Phaser.Scene) {
    const riverW = RIVER_RIGHT - RIVER_LEFT;
    this.bankL = scene.add.tileSprite(RIVER_LEFT / 2, GAME_HEIGHT / 2, RIVER_LEFT, GAME_HEIGHT, 'bank');
    this.bankR = scene.add
      .tileSprite((GAME_WIDTH + RIVER_RIGHT) / 2, GAME_HEIGHT / 2, GAME_WIDTH - RIVER_RIGHT, GAME_HEIGHT, 'bank')
      .setFlipX(true);
    this.water = scene.add.tileSprite(RIVER_LEFT + riverW / 2, GAME_HEIGHT / 2, riverW, GAME_HEIGHT, 'water');
    this.glint = scene.add.tileSprite(RIVER_LEFT + riverW / 2, GAME_HEIGHT / 2, riverW, GAME_HEIGHT, 'glint');
    this.bankL.setDepth(0);
    this.bankR.setDepth(0);
    this.water.setDepth(0);
    this.glint.setDepth(0.2);
    this.glint.setAlpha(0.55);
    const bankScale = RIVER_LEFT / this.bankL.frame.width;
    this.bankL.setTileScale(bankScale, bankScale);
    this.bankR.setTileScale(bankScale, bankScale);
    const waterScale = 240 / this.water.frame.width;
    this.water.setTileScale(waterScale, waterScale);
    const glintScale = 240 / this.glint.frame.width;
    this.glint.setTileScale(glintScale, glintScale);
  }

  scroll(dy: number): void {
    this.water.tilePositionY -= dy * 0.65;
    this.glint.tilePositionY -= dy;
    this.bankL.tilePositionY -= dy * 0.82;
    this.bankR.tilePositionY -= dy * 0.82;
  }
}
