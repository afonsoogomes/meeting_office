import { poseCell } from './catalog';
import type { Action, Appearance, Direction } from './appearance';
import {
  ACC_H,
  ACC_PER_ROW,
  ACC_W,
  ARM_OFFSET,
  SECONDARY_ARM_OFFSET,
  BODY_H,
  BODY_W,
  BODY_X,
  BODY_Y,
  FRAME_H,
  FRAME_W,
  HAIR_COLORS,
  HAIR_COLS,
  HAIR_GROUP_H,
  HATS_PER_ROW,
  HAT_H,
  HAT_STACK,
  HAT_W,
  PANTS_H,
  PANTS_PER_ROW,
  PANTS_W,
  SHIRTS_PER_ROW,
  SHIRT_H,
  SHIRT_W,
  SKINS,
} from './sheets';

export { FRAME_H, FRAME_W };

const images = new Map<string, HTMLImageElement>();
const tintCache = new Map<string, HTMLCanvasElement>();
const LAYER_PAD_X = 2;
const LAYER_PAD_Y = 4;
const layerCanvas = document.createElement('canvas');
layerCanvas.width = BODY_W + LAYER_PAD_X * 2;
layerCanvas.height = BODY_H + LAYER_PAD_Y + 2;

export async function loadPaperImages(files: Array<{ key: string; url: string }>): Promise<void> {
  await Promise.all(
    files.map(async (file) => {
      const image = new Image();
      image.src = `/${file.url.replace(/^\//, '')}`;
      await image.decode();
      images.set(file.key, image);
    }),
  );
}

function sheet(key: string): HTMLImageElement | undefined {
  return images.get(key);
}

function blit(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
): void {
  if (sx < 0 || sy < 0 || sx + sw > image.naturalWidth || sy + sh > image.naturalHeight) return;
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, sw, sh);
}

function tintedHair(
  image: HTMLImageElement,
  sx: number,
  sy: number,
  color: [number, number, number],
): HTMLCanvasElement {
  const key = `${sx},${sy},${color.join(',')}`;
  const cached = tintCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = BODY_W;
  canvas.height = BODY_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.drawImage(image, sx, sy, BODY_W, BODY_H, 0, 0, BODY_W, BODY_H);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  ctx.fillRect(0, 0, BODY_W, BODY_H);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(image, sx, sy, BODY_W, BODY_H, 0, 0, BODY_W, BODY_H);

  tintCache.set(key, canvas);
  return canvas;
}

function shirtDirY(row: number): number {
  if (row === 0) return 0;
  if (row === 2) return 24;
  return 8;
}

function hairDirY(row: number): number {
  if (row === 0) return 0;
  if (row === 2) return 64;
  return 32;
}

function hatDirY(row: number): number {
  if (row === 0) return 0;
  if (row === 2) return 60;
  return 20;
}

function shirtDestY(row: number, headBob: number): number {
  // Stardew: 14 + featureYOffset. Front idle is +1 (15); back idle is 0 (14).
  // Back torso starts higher, so the shirt must sit higher, not lower.
  const base = row === 2 ? 14 : 15;
  return base + headBob;
}

function paintLayers(ctx: CanvasRenderingContext2D, appearance: Appearance, cell: ReturnType<typeof poseCell>): void {
  const farmer = sheet('farmer');
  const pantsSheet = sheet('pants');
  const shirts = sheet('shirts');
  const hairSheet = sheet('hair');
  const hats = sheet('hats');
  const accessories = sheet('accessories');
  if (!farmer) return;

  const ox = LAYER_PAD_X;
  const oy = LAYER_PAD_Y;
  const headBob = cell.bob;
  const faceRow = cell.faceRow;

  const skin = SKINS[appearance.skin] ?? SKINS[0];
  const bodySx = skin.x + cell.col * BODY_W;
  const bodySy = skin.y + cell.row * BODY_H;
  blit(ctx, farmer, bodySx, bodySy, BODY_W, BODY_H, ox, oy);

  if (pantsSheet) {
    const pantsIndex = appearance.pants;
    const pantsSx = (pantsIndex % PANTS_PER_ROW) * PANTS_W + cell.col * BODY_W;
    const pantsSy = Math.floor(pantsIndex / PANTS_PER_ROW) * PANTS_H + cell.row * BODY_H;
    blit(ctx, pantsSheet, pantsSx, pantsSy, BODY_W, BODY_H, ox, oy);
  }

  if (shirts) {
    const shirtIndex = appearance.shirt;
    const shirtSx = (shirtIndex % SHIRTS_PER_ROW) * SHIRT_W;
    const shirtSy = Math.floor(shirtIndex / SHIRTS_PER_ROW) * 32 + shirtDirY(faceRow);
    blit(ctx, shirts, shirtSx, shirtSy, SHIRT_W, SHIRT_H, ox + 4, oy + shirtDestY(faceRow, headBob));
  }

  const facingBack = faceRow === 2;
  if (accessories && appearance.accessory > 0 && !facingBack) {
    const acc = appearance.accessory - 1;
    const accSx = (acc % ACC_PER_ROW) * ACC_W;
    const accSy = Math.floor(acc / ACC_PER_ROW) * 32 + (faceRow === 0 ? 0 : 16);
    blit(ctx, accessories, accSx, accSy, ACC_W, ACC_H, ox, oy + 3 + headBob);
  }

  if (hairSheet) {
    const group = Math.floor(appearance.hair / HAIR_COLS);
    const hairSx = (appearance.hair % HAIR_COLS) * BODY_W;
    const hairSy = group * HAIR_GROUP_H + hairDirY(faceRow);
    const color = HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[0];
    const tinted = tintedHair(hairSheet, hairSx, hairSy, color);
    ctx.globalAlpha = appearance.hat > 0 ? 0.85 : 1;
    ctx.drawImage(tinted, ox, oy + headBob);
    ctx.globalAlpha = 1;
  }

  if (hats && appearance.hat > 0) {
    const hat = appearance.hat - 1;
    const hatSx = (hat % HATS_PER_ROW) * HAT_W;
    const hatSy = Math.floor(hat / HATS_PER_ROW) * HAT_STACK + hatDirY(faceRow);
    blit(ctx, hats, hatSx, hatSy, HAT_W, HAT_H, ox - 2, oy - 2 + headBob);
  }

  const armBank = cell.secondaryArm ? SECONDARY_ARM_OFFSET : ARM_OFFSET;
  blit(
    ctx,
    farmer,
    skin.x + armBank + cell.col * BODY_W,
    skin.y + cell.row * BODY_H,
    BODY_W,
    BODY_H,
    ox,
    oy,
  );
}

export function paintPaperDoll(
  dest: CanvasRenderingContext2D,
  appearance: Appearance,
  action: Action,
  facing: Direction,
  step = 0,
): void {
  dest.clearRect(0, 0, FRAME_W, FRAME_H);
  dest.imageSmoothingEnabled = false;

  const cell = poseCell(action, facing, step);
  const layerCtx = layerCanvas.getContext('2d');
  if (!layerCtx) return;
  layerCtx.imageSmoothingEnabled = false;
  layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
  paintLayers(layerCtx, appearance, { ...cell, flip: false });

  dest.save();
  if (cell.flip) {
    dest.translate(BODY_X - LAYER_PAD_X + layerCanvas.width, BODY_Y - LAYER_PAD_Y);
    dest.scale(-1, 1);
    dest.drawImage(layerCanvas, 0, 0);
  } else {
    dest.drawImage(layerCanvas, BODY_X - LAYER_PAD_X, BODY_Y - LAYER_PAD_Y);
  }
  dest.restore();
}

export function paintProofStrip(appearance: Appearance, action: Action, facing: Direction, step = 0): void {
  const canvas = document.querySelector('#avatar-proof') as HTMLCanvasElement | null;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#243044';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const preview = document.createElement('canvas');
  preview.width = FRAME_W;
  preview.height = FRAME_H;
  const previewCtx = preview.getContext('2d');
  if (!previewCtx) return;

  paintPaperDoll(previewCtx, appearance, action, facing, step);
  const scale = 3;
  const x = Math.floor((canvas.width - FRAME_W * scale) / 2);
  const y = Math.floor((canvas.height - FRAME_H * scale) / 2);
  ctx.drawImage(preview, x, y, FRAME_W * scale, FRAME_H * scale);
}

export function paperDebug(): Array<{ key: string; width: number; height: number; tag: string }> {
  return Array.from(images.entries()).map(([key, image]) => ({
    key,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    tag: image.tagName,
  }));
}

export function paperSourceDataUrl(key: string): string | null {
  const image = images.get(key);
  if (!image) return null;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL('image/png');
}
