import type Phaser from 'phaser';

export function bindAppEvents(
  scene: Phaser.Scene,
  handlers: {
    hidden?: () => void;
    visible?: () => void;
    viewport?: () => void;
  },
): void {
  const hidden = () => handlers.hidden?.();
  const visible = () => handlers.visible?.();
  const viewport = () => handlers.viewport?.();
  scene.game.events.on('app-hidden', hidden);
  scene.game.events.on('app-visible', visible);
  scene.game.events.on('viewport-changed', viewport);
  scene.events.once('shutdown', () => {
    scene.game.events.off('app-hidden', hidden);
    scene.game.events.off('app-visible', visible);
    scene.game.events.off('viewport-changed', viewport);
  });
}
