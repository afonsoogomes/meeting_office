import { footprintCells, furnitureKind, placedSize, type FurniturePlace } from './furniture';
import type { TilePos } from './path';
import { distanceToPlace } from './tv';

export type ArcadeSpot = {
  id: string;
  place: FurniturePlace;
  label: string;
  approach: TilePos;
};

export function isArcadeItem(item: string): boolean {
  return furnitureKind(item).use === 'play';
}

export function arcadeId(place: FurniturePlace): string {
  return `${place.item}:${place.col}:${place.row}`;
}

export function listArcades(places: FurniturePlace[], walkable?: boolean[][]): ArcadeSpot[] {
  return places.flatMap((place) => {
    if (!isArcadeItem(place.item)) return [];
    return [
      {
        id: arcadeId(place),
        place,
        label: furnitureKind(place.item).label,
        approach: arcadeApproach(place, walkable),
      },
    ];
  });
}

export function arcadeAt(arcades: ArcadeSpot[], col: number, row: number): ArcadeSpot | null {
  for (const arcade of arcades) {
    if (footprintCells(arcade.place).some((cell) => cell.col === col && cell.row === row)) return arcade;
  }
  return null;
}

export function nearestArcade(arcades: ArcadeSpot[], tile: TilePos, maxTiles = 1.6): ArcadeSpot | null {
  let best: ArcadeSpot | null = null;
  let bestDist = maxTiles;
  for (const arcade of arcades) {
    const dist = distanceToPlace(tile, arcade.place);
    if (dist < bestDist) {
      best = arcade;
      bestDist = dist;
    }
  }
  return best;
}

export function isNearArcade(tile: TilePos, arcade: ArcadeSpot): boolean {
  return distanceToPlace(tile, arcade.place) <= 1.6;
}

function arcadeApproach(place: FurniturePlace, walkable?: boolean[][]): TilePos {
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
  for (const dir of dirs) {
    const next = { col: place.col + dir.col, row: place.row + dir.row };
    if (isWalkableTile(next, walkable)) return next;
  }
  return preferred;
}

function isWalkableTile(tile: TilePos, walkable?: boolean[][]): boolean {
  if (!walkable) return true;
  return Boolean(walkable[tile.row]?.[tile.col]);
}
