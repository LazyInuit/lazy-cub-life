import Phaser from 'phaser';

function addCanvas(
  scene: Phaser.Scene,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  key: string,
): void {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  draw(ctx);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

/** Small effects that stay generated. Illustrated art is loaded in BootScene. */
export function buildTextures(scene: Phaser.Scene): void {
  addCanvas(scene, 32, 32, (ctx) => {
    const gradient = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();
  }, 'particle');

  addCanvas(scene, 160, 56, (ctx) => {
    ctx.fillStyle = 'rgba(8, 40, 58, 0.28)';
    ctx.beginPath();
    ctx.ellipse(80, 30, 62, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }, 'shadow');

  // A soft ripple ring: a few strokes of falling strength so its edge isn't hard.
  addCanvas(scene, 160, 64, (ctx) => {
    const strokes: [number, number][] = [
      [14, 0.16],
      [9, 0.32],
      [5, 0.85],
    ];
    for (const [width, alpha] of strokes) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.ellipse(80, 32, 70, 24, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, 'ripple');

  for (let variant = 0; variant < FOAM_VARIANTS; variant += 1) {
    addCanvas(scene, 120, 64, (ctx) => drawFoam(ctx, 120, 64, 7 + variant * 13), `foam-${variant}`);
  }
}

export const FOAM_VARIANTS = 3;

/** A clump of churning foam: overlapping bubbles, shaded blue underneath, with a few loose bubbles around it. */
function drawFoam(ctx: CanvasRenderingContext2D, width: number, height: number, seed: number): void {
  let state = seed;
  const rand = (): number => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  const blobs: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 22; i += 1) {
    const t = rand();
    const lift = Math.sin(t * Math.PI);
    blobs.push({
      x: width * (0.1 + t * 0.8),
      y: height * (0.7 - lift * 0.2) + (rand() - 0.5) * 10,
      r: 4 + lift * 6 + rand() * 4,
    });
  }
  ctx.strokeStyle = 'rgba(120, 196, 232, 0.55)';
  ctx.lineWidth = 2;
  for (const blob of blobs) {
    ctx.beginPath();
    ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const blob of blobs) {
    ctx.fillStyle = rand() < 0.3 ? '#e4f6ff' : '#ffffff';
    ctx.beginPath();
    ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pock-marks so it reads as bubbly foam rather than a solid puff.
  ctx.fillStyle = 'rgba(140, 208, 238, 0.75)';
  for (let i = 0; i < 9; i += 1) {
    const blob = blobs[Math.floor(rand() * blobs.length)];
    if (!blob) continue;
    ctx.beginPath();
    ctx.arc(blob.x + (rand() - 0.5) * blob.r, blob.y + (rand() - 0.2) * blob.r * 0.6, 1.2 + rand() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.arc(width * (0.12 + rand() * 0.76), height * (0.1 + rand() * 0.3), 1.4 + rand() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Feather the edges with an oval mask so the clump melts into the wave's own foam.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.translate(width / 2, height * 0.6);
  ctx.scale(1, (height * 0.62) / (width / 2));
  const mask = ctx.createRadialGradient(0, 0, 0, 0, 0, width / 2);
  mask.addColorStop(0, 'rgba(0, 0, 0, 1)');
  mask.addColorStop(0.45, 'rgba(0, 0, 0, 0.9)');
  mask.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = mask;
  ctx.fillRect(-width / 2, -width / 2, width, width);
  ctx.restore();
}
