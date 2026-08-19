import type Phaser from 'phaser';
import { SLICES } from './atlas';
import { TILESET_SCALE } from './constants';

export { TILESET_FILES } from './atlas';
export { TILESET_SCALE } from './constants';

export function installTilesetTextures(scene: Phaser.Scene): void {
  for (const slice of SLICES) {
    const image = scene.textures.get(slice.sheet).getSourceImage() as HTMLImageElement;
    if (!image || image.width < slice.x + slice.w || image.height < slice.y + slice.h) {
      throw new Error(`Tileset crop out of range: ${slice.key}`);
    }
    const width = slice.w * TILESET_SCALE;
    const height = slice.h * TILESET_SCALE;
    if (scene.textures.exists(slice.key)) scene.textures.remove(slice.key);
    const coversKey = `${slice.key}-covers`;
    if (scene.textures.exists(coversKey)) scene.textures.remove(coversKey);
    const texture = scene.textures.createCanvas(slice.key, width, height);
    if (!texture) throw new Error(`Could not slice ${slice.key}`);
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, slice.x, slice.y, slice.w, slice.h, 0, 0, width, height);
    if (slice.crown) crownWallpaper(ctx, scene, width);
    if (slice.knockBlack) knockBlack(ctx, width, height);
    texture.refresh();
  }

  makeSouthRim(scene);
  makeSouthRimEnd(scene, 'rim-s-w', 'w');
  makeSouthRimEnd(scene, 'rim-s-e', 'e');
  makeCapTopNorth(scene);
  makeStair(scene);
}

function knockBlack(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 28 && data[i + 1] < 24 && data[i + 2] < 24) data[i + 3] = 0;
  }
  ctx.putImageData(image, 0, 0);
}

/** Honey wood top plate (looking down), from Farmhouse cap-top center. */
function crownWallpaper(ctx: CanvasRenderingContext2D, scene: Phaser.Scene, width: number): void {
  const farm = scene.textures.get('sheet-farm').getSourceImage() as HTMLImageElement;
  const scale = TILESET_SCALE;
  for (let y = 0; y < 5; y += 1) {
    ctx.drawImage(farm, 50, 128 + y, 12, 1, 0, y * scale, width, scale);
  }
  ctx.drawImage(farm, 50, 143, 12, 1, 0, 5 * scale, width, scale);
}

/**
 * South 2.5D rim: honey top plate (from cap-top center) + dark face.
 * Using the raw (48,144) tile alone is only the vertical face — no top surface.
 */
function paintSouthRim(ctx: CanvasRenderingContext2D, farm: HTMLImageElement, scale: number, size: number): void {
  for (let y = 0; y < 6; y += 1) {
    ctx.drawImage(farm, 50, 128 + y, 12, 1, 0, y * scale, size, scale);
  }
  ctx.drawImage(farm, 50, 143, 12, 1, 0, 6 * scale, size, scale);
  ctx.drawImage(farm, 48, 151, 16, 9, 0, 7 * scale, size, 9 * scale);
}

function makeSouthRim(scene: Phaser.Scene): void {
  const farm = scene.textures.get('sheet-farm').getSourceImage() as HTMLImageElement;
  const scale = TILESET_SCALE;
  const size = 16 * scale;
  if (scene.textures.exists('rim-s')) scene.textures.remove('rim-s');
  const texture = scene.textures.createCanvas('rim-s', size, size);
  if (!texture) throw new Error('Could not create rim-s');
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;
  paintSouthRim(ctx, farm, scale, size);
  texture.refresh();
}

/** West/east end of a south rim: same 2.5D plate, U-round from cap-end-s on the outer side. */
function makeSouthRimEnd(scene: Phaser.Scene, key: string, side: 'w' | 'e'): void {
  const farm = scene.textures.get('sheet-farm').getSourceImage() as HTMLImageElement;
  const scale = TILESET_SCALE;
  const size = 16 * scale;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.createCanvas(key, size, size);
  if (!texture) throw new Error(`Could not create ${key}`);
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;
  paintSouthRim(ctx, farm, scale, size);

  const dest = ctx.getImageData(0, 0, size, size);
  for (const [nx, ny] of SOUTH_END_ROUND) {
    const x = side === 'w' ? nx : 15 - nx;
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        const i = ((ny * scale + dy) * size + (x * scale + dx)) * 4;
        dest.data[i + 3] = 0;
      }
    }
  }
  ctx.putImageData(dest, 0, 0);
  texture.refresh();
}

/** Native pixels that cap-end-s knocks out on the west (mirror x for east). */
const SOUTH_END_ROUND: Array<[number, number]> = [
  [0, 11],
  [0, 12],
  [0, 13],
  [1, 13],
  [0, 14],
  [1, 14],
  [2, 14],
  [0, 15],
  [1, 15],
  [2, 15],
  [3, 15],
  [4, 15],
];

/** N–S wall with a honey lip on the north edge (top of the pillar). */
function makeCapTopNorth(scene: Phaser.Scene): void {
  const source = scene.textures.get('cap-top').getSourceImage() as HTMLCanvasElement;
  const farm = scene.textures.get('sheet-farm').getSourceImage() as HTMLImageElement;
  const scale = TILESET_SCALE;
  const size = 16 * scale;
  if (scene.textures.exists('cap-top-n')) scene.textures.remove('cap-top-n');
  const texture = scene.textures.createCanvas('cap-top-n', size, size);
  if (!texture) throw new Error('Could not create cap-top-n');
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0);
  ctx.drawImage(farm, 50, 143, 12, 1, 2 * scale, 0, 12 * scale, scale);
  ctx.drawImage(farm, 50, 128, 12, 1, 2 * scale, scale, 12 * scale, scale);
  texture.refresh();
}

/** One tile = one tread, from the upper half of Farmhouse (16, 240). */
function makeStair(scene: Phaser.Scene): void {
  const farm = scene.textures.get('sheet-farm').getSourceImage() as HTMLImageElement;
  const scale = TILESET_SCALE;
  const size = 16 * scale;
  if (scene.textures.exists('stair')) scene.textures.remove('stair');
  const texture = scene.textures.createCanvas('stair', size, size);
  if (!texture) throw new Error('Could not create stair');
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(farm, 16, 240, 16, 8, 0, 0, size, size);
  texture.refresh();
}
