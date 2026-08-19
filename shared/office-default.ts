import type { OfficeSpec } from './office';
import type { Facing } from './protocol';

export type SeedFurniture = {
  item: string;
  col: number;
  row: number;
  facing?: Facing;
};

/** Geometry + starting furniture. Copied into SQLite on first boot. */
export const DEFAULT_OFFICE_NAME = 'Meeting Office';

export const DEFAULT_OFFICE_SPEC: OfficeSpec = {
  id: 'office',
  mapCols: 48,
  mapRows: 38,
  spawn: { col: 22, row: 18 },
  rooms: [
    {
      id: 'office',
      name: 'Open Office',
      x: 5,
      y: 5,
      w: 17,
      h: 9,
      floor: 'floor-office',
      wallpaper: 'wall-farm',
    },
    {
      id: 'meeting',
      name: 'Sala de Reunião',
      x: 23,
      y: 5,
      w: 18,
      h: 9,
      floor: 'floor-meeting',
      wallpaper: 'wall-blue',
    },
    {
      id: 'hall',
      name: 'Corredor',
      x: 5,
      y: 17,
      w: 36,
      h: 3,
      floor: 'floor-hall',
      wallpaper: 'wall-plank',
    },
    {
      id: 'lounge',
      name: 'Lounge',
      x: 5,
      y: 23,
      w: 17,
      h: 8,
      floor: 'floor-lounge',
      wallpaper: 'wall-red',
    },
    {
      id: 'cafe',
      name: 'Café',
      x: 23,
      y: 23,
      w: 18,
      h: 8,
      floor: 'floor-cafe',
      wallpaper: 'wall-wood',
    },
  ],
  doors: [
    { x: 22, y: 7, w: 1, h: 3 },
    { x: 22, y: 25, w: 1, h: 3 },
  ],
  stairs: [
    { x: 8, y: 14, w: 5, h: 3 },
    { x: 32, y: 14, w: 5, h: 3 },
    { x: 8, y: 20, w: 5, h: 3 },
    { x: 32, y: 20, w: 5, h: 3 },
  ],
};

/** Expanded from the old `desk()` / `tableSet()` helpers. */
export const DEFAULT_OFFICE_FURNITURE: SeedFurniture[] = [
  { item: 'oak-table', col: 7, row: 6 },
  { item: 'chair', col: 7, row: 8, facing: 'up' },
  { item: 'oak-table', col: 13, row: 6 },
  { item: 'chair', col: 13, row: 8, facing: 'up' },
  { item: 'oak-table', col: 19, row: 6 },
  { item: 'chair', col: 19, row: 8, facing: 'up' },
  { item: 'oak-table', col: 7, row: 10 },
  { item: 'chair', col: 7, row: 12, facing: 'up' },
  { item: 'oak-table', col: 13, row: 10 },
  { item: 'chair', col: 13, row: 12, facing: 'up' },
  { item: 'oak-table', col: 19, row: 10 },
  { item: 'chair', col: 19, row: 12, facing: 'up' },
  { item: 'bookshelf', col: 5, row: 5 },
  { item: 'plant', col: 21, row: 8 },
  { item: 'plant-fern', col: 21, row: 13 },
  { item: 'cabinet', col: 24, row: 5 },
  { item: 'bookshelf-light', col: 27, row: 5 },
  { item: 'bookshelf', col: 38, row: 5 },
  { item: 'plant-fern', col: 24, row: 12 },
  { item: 'plant', col: 40, row: 12 },
  { item: 'rug', col: 29, row: 9 },
  { item: 'table', col: 30, row: 8 },
  { item: 'chair', col: 32, row: 7, facing: 'down' },
  { item: 'chair', col: 29, row: 8, facing: 'right' },
  { item: 'chair', col: 35, row: 8, facing: 'left' },
  { item: 'chair', col: 32, row: 9, facing: 'up' },
  { item: 'tv', col: 14, row: 23 },
  { item: 'sofa', col: 7, row: 26 },
  { item: 'sofa', col: 15, row: 26 },
  { item: 'armchair', col: 6, row: 29 },
  { item: 'armchair', col: 17, row: 29 },
  { item: 'rug', col: 10, row: 26 },
  { item: 'plant', col: 5, row: 23 },
  { item: 'plant-fern', col: 20, row: 23 },
  { item: 'fridge', col: 24, row: 23 },
  { item: 'stove', col: 25, row: 23 },
  { item: 'sink', col: 26, row: 23 },
  { item: 'counter', col: 27, row: 23 },
  { item: 'table', col: 34, row: 27 },
  { item: 'chair', col: 36, row: 26, facing: 'down' },
  { item: 'chair', col: 33, row: 27, facing: 'right' },
  { item: 'chair', col: 39, row: 27, facing: 'left' },
  { item: 'chair', col: 36, row: 28, facing: 'up' },
  { item: 'plant', col: 40, row: 30 },
];
