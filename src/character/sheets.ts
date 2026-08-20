export const BODY_W = 16;
export const BODY_H = 32;

export const FRAME_W = 24;
export const FRAME_H = 40;
export const BODY_X = 4;
export const BODY_Y = 6;

export const SHEETS = {
  farmer: '/assets/sprites/farmer-base.png',
  pants: '/assets/sprites/pants.png',
  shirts: '/assets/sprites/shirts.png',
  hair: '/assets/sprites/hairstyles.png',
  hats: '/assets/sprites/hats.png',
  accessories: '/assets/sprites/accessories.png',
} as const;

/** Four farmer-base body banks (layout), not skin tones — all use the same peach pixels. */
export const SKINS = [
  { x: 0, y: 0 },
  { x: 0, y: 672 },
  { x: 288, y: 0 },
  { x: 288, y: 672 },
] as const;

export const ARM_OFFSET = 96;
/** Second arm bank on farmer-base (FarmerRenderer.secondaryArmOffset). */
export const SECONDARY_ARM_OFFSET = 192;

export const HAIR_COLORS: Array<[number, number, number]> = [
  [62, 42, 32],
  [216, 176, 72],
  [26, 24, 28],
  [188, 78, 44],
  [96, 58, 148],
  [92, 60, 38],
  [214, 96, 132],
  [58, 128, 176],
];

export function rgbKey(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

/** Highlight peach on farmer-base; index 0 of `SKIN_TONES` keeps the sheet as-is. */
export const SKIN_REF: [number, number, number] = [249, 174, 137];

/**
 * Exact RGB values painted as flesh on farmer-base (face, arms, legs).
 * Outline, eyes, and iris are omitted so they stay put.
 */
export const SKIN_PIXEL_KEYS = new Set<number>([
  rgbKey(249, 174, 137),
  rgbKey(224, 107, 101),
  rgbKey(228, 153, 90),
  rgbKey(181, 97, 59),
  rgbKey(173, 71, 27),
  rgbKey(142, 31, 12),
  rgbKey(127, 54, 28),
  rgbKey(121, 42, 7),
  rgbKey(119, 41, 26),
  rgbKey(112, 23, 24),
  rgbKey(91, 35, 13),
  rgbKey(91, 31, 36),
  rgbKey(74, 12, 6),
  rgbKey(61, 17, 35),
  rgbKey(56, 12, 3),
  rgbKey(45, 18, 6),
]);

/** Index 0 is the original peach (no remap). */
export const SKIN_TONES: Array<[number, number, number]> = [
  SKIN_REF,
  [255, 220, 192],
  [242, 190, 156],
  [224, 164, 122],
  [196, 132, 90],
  [158, 98, 62],
  [118, 70, 42],
  [72, 42, 26],
];

export function isOriginalSkinTone(color: [number, number, number]): boolean {
  return color[0] === SKIN_REF[0] && color[1] === SKIN_REF[1] && color[2] === SKIN_REF[2];
}

/** Index 0 is white = keep the sheet color (multiply identity). */
export const CLOTHES_COLORS: Array<[number, number, number]> = [
  [255, 255, 255],
  [220, 56, 56],
  [232, 132, 48],
  [232, 196, 64],
  [72, 168, 88],
  [56, 156, 196],
  [72, 96, 212],
  [156, 80, 196],
  [216, 80, 140],
  [44, 44, 52],
  [196, 196, 204],
  [132, 84, 52],
];

export function colorCss(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

export const SHIRT_COLS = 16;
export const SHIRT_W = 8;
export const SHIRT_H = 8;
export const SHIRTS_PER_ROW = 16;

export const PANTS_W = 96;
export const PANTS_H = 688;
export const PANTS_PER_ROW = 20;

export const HAIR_COLS = 16;
export const HAIR_GROUP_H = 96;

export const HAT_W = 20;
export const HAT_H = 20;
export const HAT_STACK = 80;
export const HATS_PER_ROW = 12;

export const ACC_W = 16;
export const ACC_H = 16;
export const ACC_PER_ROW = 8;
