import '@fontsource/fredoka/700.css';
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, setGameWidth } from './constants';
import { BootScene, PLAY_ON_BOOT } from './scenes/BootScene';
import { GameScene, RUN_OVER } from './scenes/GameScene';
import { audio } from './systems/Audio';
import type { RunResult } from './types';

export type { RunResult } from './types';

export interface RiverController {
  /** Starts a fresh run. Waits for the art to load if it has not yet. */
  play(): void;
  /** Ends the current run now and reports it, for leaving mid-run. */
  endRun(): void;
  destroy(): void;
}

/** Mounts the river in host. The start screen drifts behind the app's panels until play(). */
export async function createLazyRiver(host: HTMLElement, onOver: (result: RunResult) => void): Promise<RiverController> {
  try {
    await document.fonts.load('700 32px Fredoka');
  } catch {
    // The fallback font still reads fine.
  }

  const rect = host.getBoundingClientRect();
  setGameWidth((GAME_HEIGHT * rect.width) / Math.max(1, rect.height));

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#1e8cbc',
    banner: false,
    audio: { noAudio: true },
    fps: { target: 60 },
    input: { activePointers: 2 },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      autoRound: true,
    },
    render: {
      antialias: true,
      pixelArt: false,
      powerPreference: 'high-performance',
    },
    scene: [BootScene, GameScene],
  });

  if (import.meta.env.DEV) (window as Window & { __river?: Phaser.Game }).__river = game;
  game.events.on(RUN_OVER, onOver);
  game.events.once(Phaser.Core.Events.READY, () => {
    game.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    game.canvas.style.touchAction = 'none';
  });

  const onVisibility = () => game.events.emit(document.hidden ? 'app-hidden' : 'app-visible');
  document.addEventListener('visibilitychange', onVisibility);
  const unlock = () => audio.unlock();
  host.addEventListener('pointerdown', unlock, { passive: true });
  const resize = new ResizeObserver(() => {
    game.scale.refresh();
    game.events.emit('viewport-changed');
  });
  resize.observe(host);

  return {
    play() {
      audio.unlock();
      if (game.scene.isActive('game')) game.scene.start('game', { play: true });
      else game.registry.set(PLAY_ON_BOOT, true);
    },
    endRun() {
      const scene = game.scene.getScene('game') as GameScene | null;
      if (scene && game.scene.isActive('game')) scene.endRun();
    },
    destroy() {
      resize.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      host.removeEventListener('pointerdown', unlock);
      game.events.off(RUN_OVER, onOver);
      game.destroy(true);
    },
  };
}
