import type Phaser from 'phaser';
import { TILESET_SCALE } from './constants';
import { SLICES } from './atlas';
import { FURNITURE_SLICES } from './furnitureData';
import {
  footprintCells,
  furnitureKind,
  furnitureOrigin,
  placedSize,
  spriteAnchor,
  spriteFor,
  type FurniturePlace,
} from './furniture';
import type { TilePos } from './path';

export type TvSpot = {
  id: string;
  place: FurniturePlace;
  label: string;
  approach: TilePos;
};

/** Inner glass rect in native sprite pixels (before TILESET_SCALE). Inset from the bezel. */
const SCREEN: Record<string, { x: number; y: number; w: number; h: number }> = {
  tv: { x: 7, y: 17, w: 19, h: 12 },
  'budget-tv': { x: 7, y: 17, w: 19, h: 12 },
  'floor-tv': { x: 7, y: 14, w: 19, h: 12 },
  'plasma-tv': { x: 5, y: 9, w: 38, h: 26 },
  'tropical-tv': { x: 5, y: 12, w: 38, h: 24 },
};

const SLICE_SIZE: Record<string, { w: number; h: number }> = Object.fromEntries(
  [...SLICES, ...FURNITURE_SLICES].map((slice) => [slice.key, { w: slice.w, h: slice.h }]),
);

export function isTvItem(item: string): boolean {
  return furnitureKind(item).use === 'watch';
}

export function tvId(place: FurniturePlace): string {
  return `${place.item}:${place.col}:${place.row}`;
}

export function listTvs(places: FurniturePlace[], walkable?: boolean[][]): TvSpot[] {
  return places.flatMap((place) => {
    if (!isTvItem(place.item)) return [];
    return [
      {
        id: tvId(place),
        place,
        label: furnitureKind(place.item).label,
        approach: tvApproach(place, walkable),
      },
    ];
  });
}

export function tvAt(tvs: TvSpot[], col: number, row: number): TvSpot | null {
  for (const tv of tvs) {
    if (footprintCells(tv.place).some((cell) => cell.col === col && cell.row === row)) return tv;
  }
  return null;
}

export function nearestTv(tvs: TvSpot[], tile: TilePos, maxTiles = 1.6): TvSpot | null {
  let best: TvSpot | null = null;
  let bestDist = maxTiles;
  for (const tv of tvs) {
    const dist = distanceToPlace(tile, tv.place);
    if (dist < bestDist) {
      best = tv;
      bestDist = dist;
    }
  }
  return best;
}

export function isNearTv(tile: TilePos, tv: TvSpot): boolean {
  return distanceToPlace(tile, tv.place) <= 1.6;
}

export function distanceToPlace(tile: TilePos, place: FurniturePlace): number {
  let best = Infinity;
  for (const cell of footprintCells(place)) {
    const dist = Math.max(Math.abs(cell.col - tile.col), Math.abs(cell.row - tile.row));
    if (dist < best) best = dist;
  }
  return best;
}

export function tvScreenWorld(place: FurniturePlace): { x: number; y: number; w: number; h: number } | null {
  if (!isTvItem(place.item)) return null;
  const { key, flipX } = spriteFor(place);
  const size = SLICE_SIZE[key];
  const box = SCREEN[key] ?? SCREEN[place.item];
  if (!size || !box) return null;

  const origin = furnitureOrigin(place);
  const anchor = spriteAnchor(place, key);
  const spriteW = size.w * TILESET_SCALE;
  const spriteH = size.h * TILESET_SCALE;
  const left = origin.x - anchor.x * spriteW;
  const top = origin.y - anchor.y * spriteH;
  const w = box.w * TILESET_SCALE;
  const h = box.h * TILESET_SCALE;
  const localX = box.x * TILESET_SCALE;
  const x = flipX ? left + spriteW - localX - w : left + localX;
  return { x, y: top + box.y * TILESET_SCALE, w, h };
}

function tvApproach(place: FurniturePlace, walkable?: boolean[][]): TilePos {
  const size = placedSize(place);
  const preferred = {
    col: place.col + Math.floor((size.w - 1) / 2),
    row: place.row + size.h,
  };
  if (isWalkableTile(preferred, walkable)) return preferred;

  const dirs = [
    { col: 0, row: 1 },
    { col: 0, row: -1 },
    { col: 1, row: 0 },
    { col: -1, row: 0 },
  ];
  let best: TilePos | null = null;
  let bestDist = Infinity;
  for (const cell of footprintCells(place)) {
    for (const dir of dirs) {
      const next = { col: cell.col + dir.col, row: cell.row + dir.row };
      if (!isWalkableTile(next, walkable)) continue;
      const dist = Math.abs(next.col - preferred.col) + Math.abs(next.row - preferred.row);
      if (dist < bestDist) {
        best = next;
        bestDist = dist;
      }
    }
  }
  return best ?? preferred;
}

function isWalkableTile(tile: TilePos, walkable?: boolean[][]): boolean {
  if (!walkable) return true;
  return Boolean(walkable[tile.row]?.[tile.col]);
}

export function worldToCanvas(scene: Phaser.Scene, x: number, y: number): { x: number; y: number } {
  const cam = scene.cameras.main;
  const topLeft = cam.getWorldPoint(0, 0);
  const bottomRight = cam.getWorldPoint(cam.width, cam.height);
  const canvas = scene.game.canvas;
  const sx = ((x - topLeft.x) / (bottomRight.x - topLeft.x)) * canvas.clientWidth;
  const sy = ((y - topLeft.y) / (bottomRight.y - topLeft.y)) * canvas.clientHeight;
  const game = canvas.parentElement;
  const gameRect = game?.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: sx + (gameRect ? canvasRect.left - gameRect.left : 0),
    y: sy + (gameRect ? canvasRect.top - gameRect.top : 0),
  };
}
