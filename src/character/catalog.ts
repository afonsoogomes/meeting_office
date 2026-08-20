import type { Action, Direction } from './appearance';
import { CLOTHES_COLORS, HAIR_COLORS, SKINS, SKIN_TONES } from './sheets';

export const CATALOG = {
  skinColor: { label: 'Pele', count: SKIN_TONES.length, optional: false },
  hairColor: { label: 'Cabelo', count: HAIR_COLORS.length, optional: false },
  shirtColor: { label: 'Camisa', count: CLOTHES_COLORS.length, optional: false },
  pantsColor: { label: 'Calça', count: CLOTHES_COLORS.length, optional: false },
  skin: { label: 'Corpo', count: SKINS.length, optional: false },
  hair: { label: 'Corte', count: 32, optional: false },
  shirt: { label: 'Modelo da camisa', count: 48, optional: false },
  pants: { label: 'Modelo da calça', count: 20, optional: false },
  hat: { label: 'Chapéu', count: 24, optional: true },
  accessory: { label: 'Acessório', count: 16, optional: true },
} as const;

export type CatalogSlot = keyof typeof CATALOG;

export type PoseCell = {
  col: number;
  row: number;
  /** Shirt/hair/hat facing: 0 down, 1 side, 2 up. Body/pants/arms use `row`. */
  faceRow: number;
  flip: boolean;
  bob: number;
  /** Sit-facing-down uses the secondary arm bank (x+192). */
  secondaryArm?: boolean;
};

type RunFrame = {
  col: number;
  row: number;
  faceRow: number;
  bob: number;
  ms: number;
};

const WALK_FRAME_MS = 200;

function faceRowOf(facing: Direction): number {
  return facing === 'up' ? 2 : facing === 'down' ? 0 : 1;
}

function runFrame(index: number, ms: number, bob = 0): RunFrame {
  const col = index % 6;
  const row = Math.floor(index / 6);
  const faceRow = row <= 2 ? row : col <= 1 ? 0 : col <= 3 ? 1 : 2;
  return { col, row, faceRow, bob, ms };
}

/** Stardew Farmer.EmoteType("hi") — frames 3 and 85 on farmer-base. */
const WAVE_FRAMES: RunFrame[] = [
  runFrame(3, 250, -1),
  runFrame(85, 250, -2),
  runFrame(3, 250, -1),
  runFrame(85, 250, -2),
];

export const WAVE_MS = WAVE_FRAMES.reduce((sum, frame) => sum + frame.ms, 0);

/** Stardew FarmerSprite run cycles (sheet index + duration). */
const RUN_FRAMES: Record<'down' | 'right' | 'up', RunFrame[]> = {
  down: [
    runFrame(0, 90),
    runFrame(1, 60, 1),
    runFrame(18, 120, 2),
    runFrame(1, 60, 1),
    runFrame(0, 90),
    runFrame(2, 60, 1),
    runFrame(19, 120, 2),
    runFrame(2, 60, 1),
  ],
  right: [
    runFrame(6, 90),
    runFrame(20, 140, 1),
    runFrame(11, 100),
    runFrame(6, 90),
    runFrame(21, 140, 1),
    runFrame(8, 100, 1),
  ],
  up: [
    runFrame(12, 90),
    runFrame(13, 60, 1),
    runFrame(22, 120, 2),
    runFrame(13, 60, 1),
    runFrame(12, 90),
    runFrame(14, 60, 1),
    runFrame(23, 120, 2),
    runFrame(14, 60, 1),
  ],
};

function runCycle(facing: Direction): RunFrame[] {
  return RUN_FRAMES[facing === 'left' ? 'right' : facing];
}

function frameAt(frames: RunFrame[], time: number): number {
  const total = frames.reduce((sum, frame) => sum + frame.ms, 0);
  let t = time % total;
  for (let i = 0; i < frames.length; i += 1) {
    if (t < frames[i].ms) return i;
    t -= frames[i].ms;
  }
  return 0;
}

export function poseStep(action: Action, facing: Direction, time: number): number {
  if (action === 'run') return frameAt(runCycle(facing), time);
  if (action === 'walk') return Math.floor(time / WALK_FRAME_MS) % 4;
  if (action === 'wave') return frameAt(WAVE_FRAMES, time);
  return 0;
}

export function poseCell(action: Action, facing: Direction, step = 0): PoseCell {
  const flip = facing === 'left';
  const faceRow = faceRowOf(facing);

  if (action === 'run') {
    const frames = runCycle(facing);
    const frame = frames[step % frames.length];
    return { col: frame.col, row: frame.row, faceRow, flip, bob: frame.bob };
  }

  if (action === 'walk') {
    const cols = [1, 0, 2, 0];
    const col = cols[step & 3];
    return { col, row: faceRow, faceRow, flip, bob: col === 0 ? 0 : 1 };
  }

  if (action === 'wave') {
    const frame = WAVE_FRAMES[step % WAVE_FRAMES.length];
    return { col: frame.col, row: frame.row, faceRow: 0, flip: false, bob: frame.bob };
  }

  if (action === 'sit') {
    if (facing === 'down') {
      return { col: 5, row: 17, faceRow, flip, bob: -5, secondaryArm: true };
    }
    if (facing === 'up') {
      return { col: 5, row: 18, faceRow, flip, bob: -4 };
    }
    return { col: 3, row: 19, faceRow, flip, bob: -4 };
  }

  if (action === 'sleep') {
    return { col: 0, row: 1, faceRow: 1, flip: false, bob: 0 };
  }

  return { col: 0, row: faceRow, faceRow, flip, bob: 0 };
}

export function characterSheetFiles(): Array<{ key: string; url: string }> {
  return [
    { key: 'farmer', url: 'assets/sprites/farmer-base.png' },
    { key: 'pants', url: 'assets/sprites/pants.png' },
    { key: 'shirts', url: 'assets/sprites/shirts.png' },
    { key: 'hair', url: 'assets/sprites/hairstyles.png' },
    { key: 'hats', url: 'assets/sprites/hats.png' },
    { key: 'accessories', url: 'assets/sprites/accessories.png' },
  ];
}
