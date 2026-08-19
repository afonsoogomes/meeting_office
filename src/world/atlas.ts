/**
 * Named crops from the interior tilesets.
 * Coordinates are native pixels on the PNG (16×16 grid unless noted).
 * See docs/sprites/ATLAS.md for how to pick new tiles.
 */
import { FURNITURE_SLICES } from './furnitureData';

export const TILESET_FILES = [
  { key: 'sheet-walls', url: 'assets/tiles/walls-floors.png' },
  { key: 'sheet-farm', url: 'assets/tiles/farmhouse.png' },
  { key: 'sheet-furn', url: 'assets/tiles/furniture.png' },
  { key: 'sheet-craft', url: 'assets/tiles/craftables.png' },
  { key: 'sheet-flooring', url: 'assets/tiles/flooring.png' },
] as const;

export type SheetKey = (typeof TILESET_FILES)[number]['key'];

export type Slice = {
  key: string;
  sheet: SheetKey;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Punch near-black so the floor shows through L-shaped caps. */
  knockBlack?: boolean;
  /** Stamp the Farmhouse wood crown on top of a 16×48 wallpaper. */
  crown?: boolean;
};

export const SLICES: Slice[] = [
  // --- Floors (32×32 from Walls & Floors, after the 16×48 wallpaper block) ---
  { key: 'floor-hall', sheet: 'sheet-walls', x: 0, y: 432, w: 32, h: 32 },
  { key: 'floor-office', sheet: 'sheet-walls', x: 0, y: 496, w: 32, h: 32 },
  { key: 'floor-meeting', sheet: 'sheet-walls', x: 32, y: 496, w: 32, h: 32 },
  { key: 'floor-lounge', sheet: 'sheet-walls', x: 160, y: 432, w: 32, h: 32 },
  { key: 'floor-cafe', sheet: 'sheet-walls', x: 0, y: 464, w: 32, h: 32 },
  { key: 'floor-honey', sheet: 'sheet-flooring', x: 0, y: 0, w: 32, h: 32 },

  // --- North walls: 16×48 wallpaper (bottom aligns to the floor line) ---
  { key: 'wall-farm', sheet: 'sheet-farm', x: 32, y: 16, w: 16, h: 48, crown: true },
  { key: 'wall-farm-window', sheet: 'sheet-farm', x: 48, y: 16, w: 16, h: 48, crown: true },
  { key: 'wall-wood', sheet: 'sheet-walls', x: 0, y: 0, w: 16, h: 48, crown: true },
  { key: 'wall-panel', sheet: 'sheet-walls', x: 176, y: 0, w: 16, h: 48, crown: true },
  { key: 'wall-blue', sheet: 'sheet-walls', x: 0, y: 48, w: 16, h: 48, crown: true },
  { key: 'wall-plank', sheet: 'sheet-walls', x: 32, y: 48, w: 16, h: 48, crown: true },
  { key: 'wall-stripe', sheet: 'sheet-walls', x: 176, y: 48, w: 16, h: 48, crown: true },
  { key: 'wall-red', sheet: 'sheet-walls', x: 112, y: 96, w: 16, h: 48, crown: true },
  { key: 'wall-wainscot', sheet: 'sheet-walls', x: 128, y: 96, w: 16, h: 48, crown: true },

  // --- Farmhouse 2.5D kit (16×16). Do not use Town Interiors rims for this. ---
  { key: 'cap-top', sheet: 'sheet-farm', x: 48, y: 128, w: 16, h: 16 },
  { key: 'rim-s', sheet: 'sheet-farm', x: 48, y: 144, w: 16, h: 16 },
  { key: 'cap-end-s', sheet: 'sheet-farm', x: 48, y: 176, w: 16, h: 16, knockBlack: true },
  { key: 'cap-se', sheet: 'sheet-farm', x: 64, y: 128, w: 16, h: 16, knockBlack: true },
  { key: 'cap-sw', sheet: 'sheet-farm', x: 80, y: 128, w: 16, h: 16, knockBlack: true },
  { key: 'stair', sheet: 'sheet-farm', x: 16, y: 240, w: 16, h: 16 },

  ...FURNITURE_SLICES.map((slice) => ({ ...slice, sheet: 'sheet-furn' as const })),

  { key: 'plant', sheet: 'sheet-craft', x: 0, y: 0, w: 16, h: 32 },
  { key: 'plant-fern', sheet: 'sheet-craft', x: 32, y: 0, w: 16, h: 32 },
  { key: 'counter', sheet: 'sheet-farm', x: 32, y: 192, w: 16, h: 48 },
  { key: 'stove', sheet: 'sheet-farm', x: 48, y: 192, w: 16, h: 48 },
  { key: 'sink', sheet: 'sheet-farm', x: 64, y: 192, w: 16, h: 48 },
  { key: 'fridge', sheet: 'sheet-farm', x: 80, y: 192, w: 16, h: 48 },
  { key: 'tv', sheet: 'sheet-farm', x: 96, y: 192, w: 32, h: 48 },
];
