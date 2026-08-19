import { TILE_SIZE } from './constants';
import {
  footprintCells,
  furnitureKind,
  furnitureOrigin,
  placedSize,
  type FurnitureFacing,
  type FurniturePlace,
} from './furniture';
import type { TilePos } from './path';

export type UseKind = 'sit' | 'sleep';

export type Seat = {
  id: string;
  place: FurniturePlace;
  facing: FurnitureFacing;
  approach: TilePos;
  label: string;
  use: UseKind;
};

const BEHIND: Record<FurnitureFacing, TilePos> = {
  down: { col: 0, row: -1 },
  up: { col: 0, row: 1 },
  left: { col: 1, row: 0 },
  right: { col: -1, row: 0 },
};

export function isSeatItem(item: string): boolean {
  const use = furnitureKind(item).use;
  return use === 'sit' || use === 'sleep';
}

export function listSeats(places: FurniturePlace[], walkable?: boolean[][]): Seat[] {
  const seats: Seat[] = [];
  for (let index = 0; index < places.length; index += 1) {
    const place = places[index];
    if (!isSeatItem(place.item)) continue;
    const kind = furnitureKind(place.item);
    const facing = place.facing ?? 'down';
    const use = kind.use ?? 'sit';
    seats.push({
      id: `${place.item}:${place.col},${place.row}:${index}`,
      place,
      facing,
      approach: resolveApproach(place, facing, walkable, use),
      label: kind.label,
      use,
    });
  }
  return seats;
}

export function seatAt(seats: Seat[], col: number, row: number): Seat | null {
  for (const seat of seats) {
    if (footprintCells(seat.place).some((cell) => cell.col === col && cell.row === row)) {
      return seat;
    }
  }
  return null;
}

export function nearestSeat(seats: Seat[], tile: TilePos, maxTiles = 1.6): Seat | null {
  let best: Seat | null = null;
  let bestDist = maxTiles;
  for (const seat of seats) {
    const dist = distanceToSeat(tile, seat);
    if (dist < bestDist) {
      best = seat;
      bestDist = dist;
    }
  }
  return best;
}

export function isNearSeat(tile: TilePos, seat: Seat): boolean {
  return distanceToSeat(tile, seat) <= 1.6;
}

const SIT_OFFSET: Record<FurnitureFacing, { x: number; y: number; depthBias: number }> = {
  down: { x: 0, y: -8, depthBias: 20 },
  up: { x: 0, y: -10, depthBias: -18 },
  left: { x: 6, y: -4, depthBias: 20 },
  right: { x: -6, y: -4, depthBias: 20 },
};

export function sitAnchor(seat: Seat): { x: number; y: number; depthBias: number } {
  if (seat.use === 'sleep') return sleepAnchor(seat);
  const origin = furnitureOrigin(seat.place);
  const offset = SIT_OFFSET[seat.facing];
  return {
    x: origin.x + offset.x,
    y: origin.y + offset.y,
    depthBias: offset.depthBias,
  };
}

/** Head on the pillow; the bed-cover overlay hides everything below the fold. */
const SLEEP_OFFSET = { x: 0, y: -42, depthBias: 46 };

function sleepAnchor(seat: Seat): { x: number; y: number; depthBias: number } {
  const origin = furnitureOrigin(seat.place);
  return {
    x: origin.x + SLEEP_OFFSET.x,
    y: origin.y + SLEEP_OFFSET.y,
    depthBias: SLEEP_OFFSET.depthBias,
  };
}

function resolveApproach(
  place: FurniturePlace,
  facing: FurnitureFacing,
  walkable?: boolean[][],
  use: UseKind = 'sit',
): TilePos {
  const preferred = use === 'sleep' ? sleepApproachTile(place) : approachTile(place, facing);
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

function sleepApproachTile(place: FurniturePlace): TilePos {
  const size = placedSize(place);
  const midRow = place.row + Math.floor((size.h - 1) / 2);
  return { col: place.col - 1, row: midRow };
}

function approachTile(place: FurniturePlace, facing: FurnitureFacing): TilePos {
  const size = placedSize(place);
  const midCol = place.col + Math.floor((size.w - 1) / 2);
  const midRow = place.row + Math.floor((size.h - 1) / 2);
  let front: TilePos;
  if (facing === 'down') front = { col: midCol, row: place.row };
  else if (facing === 'up') front = { col: midCol, row: place.row + size.h - 1 };
  else if (facing === 'left') front = { col: place.col, row: midRow };
  else front = { col: place.col + size.w - 1, row: midRow };

  const behind = BEHIND[facing];
  return { col: front.col + behind.col, row: front.row + behind.row };
}

function distanceToSeat(tile: TilePos, seat: Seat): number {
  if (tile.col === seat.approach.col && tile.row === seat.approach.row) return 0;
  let best = Infinity;
  for (const cell of footprintCells(seat.place)) {
    const dist = Math.max(Math.abs(cell.col - tile.col), Math.abs(cell.row - tile.row));
    if (dist < best) best = dist;
  }
  return best;
}
