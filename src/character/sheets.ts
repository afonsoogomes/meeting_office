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
