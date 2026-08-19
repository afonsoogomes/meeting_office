import { TILE_SIZE, Tile } from './layout';

export const FLOOR_KEYS: Record<number, string> = {
  [Tile.Wood]: 'floor-hall',
};

export function createWorldTextures(scene: Phaser.Scene): void {
  const hover = scene.textures.createCanvas('tile-hover', TILE_SIZE, TILE_SIZE);
  if (!hover) throw new Error('Could not create tile-hover');
  const hoverCtx = hover.getContext();
  hoverCtx.imageSmoothingEnabled = false;
  hoverCtx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  hoverCtx.fillRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
  hoverCtx.strokeStyle = '#ffffff';
  hoverCtx.lineWidth = 2;
  hoverCtx.strokeRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4);
  hover.refresh();

  const dot = scene.textures.createCanvas('origin-dot', 8, 8);
  if (!dot) throw new Error('Could not create origin-dot');
  const dotCtx = dot.getContext();
  dotCtx.fillStyle = '#ffffff';
  dotCtx.fillRect(0, 0, 8, 8);
  dot.refresh();
}
