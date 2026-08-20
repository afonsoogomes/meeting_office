import { poseCell } from './catalog';
import type { Action, Appearance, Direction } from './appearance';
import {
  ACC_H,
  ACC_PER_ROW,
  ACC_W,
  ARM_OFFSET,
  CLOTHES_COLORS,
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
  SKIN_PIXEL_KEYS,
  SKIN_REF,
  SKIN_TONES,
  isOriginalSkinTone,
  rgbKey,
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

function isIdentityTint(color: [number, number, number]): boolean {
  return color[0] >= 250 && color[1] >= 250 && color[2] >= 250;
}

function tintedPatch(
  image: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  color: [number, number, number],
): HTMLCanvasElement {
  const key = `${sx},${sy},${sw},${sh},${color.join(',')}`;
  const cached = tintCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  ctx.fillRect(0, 0, sw, sh);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

  tintCache.set(key, canvas);
  return canvas;
}

function blitTinted(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  color: [number, number, number],
): void {
  if (isIdentityTint(color)) {
    blit(ctx, image, sx, sy, sw, sh, dx, dy);
    return;
  }
  if (sx < 0 || sy < 0 || sx + sw > image.naturalWidth || sy + sh > image.naturalHeight) return;
  ctx.drawImage(tintedPatch(image, sx, sy, sw, sh, color), dx, dy);
}

function skinPatch(
  image: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  color: [number, number, number],
): HTMLCanvasElement {
  const key = `skin:${sx},${sy},${sw},${sh},${color.join(',')}`;
  const cached = tintCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  const pixels = ctx.getImageData(0, 0, sw, sh);
  const data = pixels.data;
  const [tr, tg, tb] = color;
  const [fr, fg, fb] = SKIN_REF;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    if (!SKIN_PIXEL_KEYS.has(rgbKey(data[i], data[i + 1], data[i + 2]))) continue;
    data[i] = Math.min(255, Math.round((data[i] * tr) / fr));
    data[i + 1] = Math.min(255, Math.round((data[i + 1] * tg) / fg));
    data[i + 2] = Math.min(255, Math.round((data[i + 2] * tb) / fb));
  }
  ctx.putImageData(pixels, 0, 0);
  tintCache.set(key, canvas);
  return canvas;
}

function blitSkin(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  color: [number, number, number],
): void {
  if (isOriginalSkinTone(color)) {
    blit(ctx, image, sx, sy, sw, sh, dx, dy);
    return;
  }
  if (sx < 0 || sy < 0 || sx + sw > image.naturalWidth || sy + sh > image.naturalHeight) return;
  ctx.drawImage(skinPatch(image, sx, sy, sw, sh, color), dx, dy);
}

function tintedHair(
  image: HTMLImageElement,
  sx: number,
  sy: number,
  color: [number, number, number],
): HTMLCanvasElement {
  return tintedPatch(image, sx, sy, BODY_W, BODY_H, color);
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
  const tone = SKIN_TONES[appearance.skinColor] ?? SKIN_TONES[0];
  const bodySx = skin.x + cell.col * BODY_W;
  const bodySy = skin.y + cell.row * BODY_H;
  blitSkin(ctx, farmer, bodySx, bodySy, BODY_W, BODY_H, ox, oy, tone);

  if (pantsSheet) {
    const pantsIndex = appearance.pants;
    const pantsSx = (pantsIndex % PANTS_PER_ROW) * PANTS_W + cell.col * BODY_W;
    const pantsSy = Math.floor(pantsIndex / PANTS_PER_ROW) * PANTS_H + cell.row * BODY_H;
    const dye = CLOTHES_COLORS[appearance.pantsColor] ?? CLOTHES_COLORS[0];
    blitTinted(ctx, pantsSheet, pantsSx, pantsSy, BODY_W, BODY_H, ox, oy, dye);
  }

  if (shirts) {
    const shirtIndex = appearance.shirt;
    const shirtSx = (shirtIndex % SHIRTS_PER_ROW) * SHIRT_W;
    const shirtSy = Math.floor(shirtIndex / SHIRTS_PER_ROW) * 32 + shirtDirY(faceRow);
    const dye = CLOTHES_COLORS[appearance.shirtColor] ?? CLOTHES_COLORS[0];
    blitTinted(
      ctx,
      shirts,
      shirtSx,
      shirtSy,
      SHIRT_W,
      SHIRT_H,
      ox + 4,
      oy + shirtDestY(faceRow, headBob),
      dye,
    );
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
  blitSkin(
    ctx,
    farmer,
    skin.x + armBank + cell.col * BODY_W,
    skin.y + cell.row * BODY_H,
    BODY_W,
    BODY_H,
    ox,
    oy,
    tone,
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

export function paintAvatarPreview(
  canvas: HTMLCanvasElement,
  appearance: Appearance,
  facing: Direction,
  action: Action = 'idle',
  step = 0,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#1a2030';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const preview = document.createElement('canvas');
  preview.width = FRAME_W;
  preview.height = FRAME_H;
  const previewCtx = preview.getContext('2d');
  if (!previewCtx) return;
  paintPaperDoll(previewCtx, appearance, action, facing, step);
  const scale = Math.max(1, Math.floor(Math.min(canvas.width / FRAME_W, canvas.height / FRAME_H)));
  const x = Math.floor((canvas.width - FRAME_W * scale) / 2);
  const y = Math.floor((canvas.height - FRAME_H * scale) / 2);
  ctx.drawImage(preview, x, y, FRAME_W * scale, FRAME_H * scale);
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
