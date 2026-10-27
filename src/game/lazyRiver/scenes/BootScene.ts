import Phaser from 'phaser';
import coinUrl from '../../../assets/lazy-dojo/sprites/bonuses/kovu-coin.png';
import pawUrl from '../../../assets/lion-paw-ui.png';
import bankUrl from '../../../assets/lazy-river/bank.png';
import gemSilverUrl from '../../../assets/lazy-river/gem-silver.png';
import glintUrl from '../../../assets/lazy-river/glint.png';
import barrelSideUrl from '../../../assets/lazy-river/obstacles/barrel-side.png';
import barrelUprightUrl from '../../../assets/lazy-river/obstacles/barrel-upright.png';
import logUrl from '../../../assets/lazy-river/obstacles/log.png';
import rockLargeUrl from '../../../assets/lazy-river/obstacles/rock-large.png';
import rockSmallUrl from '../../../assets/lazy-river/obstacles/rock-small.png';
import treeLeftUrl from '../../../assets/lazy-river/obstacles/tree-left.png';
import treeRightUrl from '../../../assets/lazy-river/obstacles/tree-right.png';
import padBackUrl from '../../../assets/lazy-river/stream-back-faded.png';
import padForwardUrl from '../../../assets/lazy-river/stream-forward-faded.png';
import rapidsUrl from '../../../assets/lazy-river/rapids-faded.png';
import whirlpoolUrl from '../../../assets/lazy-river/whirlpool-soft.png';
import playerUrl from '../../../assets/lazy-river/player-gargling.png';
import waterUrl from '../../../assets/lazy-river/water.png';
import waveChaseUrl from '../../../assets/lazy-river/wave-chase-v4b-long.png';
import waveRollUrl from '../../../assets/lazy-river/wave-roll-v4-long.png';
import { buildTextures } from '../art/textures';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../constants';

/** Registry flag set when Play is pressed before loading finishes. */
export const PLAY_ON_BOOT = 'playOnBoot';

export class BootScene extends Phaser.Scene {
  private failed = false;

  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.on('loaderror', () => {
      this.failed = true;
    });
    this.load.image('player', playerUrl);
    this.load.image('water', waterUrl);
    this.load.image('bank', bankUrl);
    this.load.image('glint', glintUrl);
    // Obstacles, under the texture keys used in the KINDS list in rows.ts.
    this.load.image('rock-small', rockSmallUrl);
    this.load.image('rock-large', rockLargeUrl);
    this.load.image('barrel-upright', barrelUprightUrl);
    this.load.image('barrel-side', barrelSideUrl);
    this.load.image('log', logUrl);
    this.load.image('tree-left', treeLeftUrl);
    this.load.image('tree-right', treeRightUrl);
    this.load.image('coin', coinUrl);
    this.load.image('wave-chase', waveChaseUrl);
    this.load.image('wave-roll', waveRollUrl);
    this.load.image('pad-forward', padForwardUrl);
    this.load.image('pad-back', padBackUrl);
    this.load.image('rapids', rapidsUrl);
    this.load.image('whirlpool', whirlpoolUrl);
    this.load.image('gem-silver', gemSilverUrl);
    this.load.image('paw', pawUrl);
  }

  create(): void {
    if (this.failed || !this.textures.exists('player')) {
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Could not load the river. Check your connection and try again.', {
          fontFamily: FONT,
          fontSize: '22px',
          color: '#f7fbff',
          align: 'center',
          wordWrap: { width: 420 },
        })
        .setOrigin(0.5);
      return;
    }
    buildTextures(this);
    this.scene.start('game', { play: false });
  }
}
