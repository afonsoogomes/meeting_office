import {
  footprintCells,
  furnitureKind,
  furniturePlaceKey,
  occupantSlots,
  placedSize,
  slotAnchor,
  slotWorld,
  type FurnitureFacing,
  type FurniturePlace,
} from './furniture';
import type { TilePos } from './path';

export type UseKind = 'sit' | 'sleep';

export type Seat = {
  id: string;
  placeKey: string;
  slot: number;
  slots: number;
  tile: TilePos;
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

const OCCUPY_PX = 22;

export function isSeatItem(item: string): boolean {
  const use = furnitureKind(item).use;
  return use === 'sit' || use === 'sleep';
}

export function listSeats(places: FurniturePlace[], walkable?: boolean[][]): Seat[] {
  const seats: Seat[] = [];
  for (const place of places) {
    if (!isSeatItem(place.item)) continue;
    const kind = furnitureKind(place.item);
    const facing = place.facing ?? 'down';
    const use: UseKind = kind.use === 'sleep' ? 'sleep' : 'sit';
    const slots = occupantSlots(place);
    const placeKey = furniturePlaceKey(place);
    for (let slot = 0; slot < slots; slot += 1) {
      const tile = slotTile(place, slot, slots);
      seats.push({
        id: `${placeKey}:${slot}`,
        placeKey,
        slot,
        slots,
        tile,
        place,
        facing,
        approach: resolveApproach(place, facing, walkable, use, tile),
        label: kind.label,
        use,
      });
    }
  }
  return seats;
}

export function seatAt(seats: Seat[], col: number, row: number): Seat | null {
  const covering = seats.filter((seat) =>
    footprintCells(seat.place).some((cell) => cell.col === col && cell.row === row),
  );
  if (covering.length === 0) return null;
  const exact = covering.find((seat) => seat.tile.col === col && seat.tile.row === row);
  if (exact) return exact;
  return nearestByTile(covering, { col, row });
}

export function nearestSeat(seats: Seat[], tile: TilePos, maxTiles = 1.6): Seat | null {
  let best: Seat | null = null;
  let bestDist = Infinity;
  for (const seat of seats) {
    if (distanceToFurniture(tile, seat) > maxTiles) continue;
    const dist = distanceToSlot(tile, seat);
    if (dist < bestDist) {
      best = seat;
      bestDist = dist;
    }
  }
  return best;
}

export function isNearSeat(tile: TilePos, seat: Seat): boolean {
  return distanceToFurniture(tile, seat) <= 1.6;
}

const SIT_OFFSET: Record<FurnitureFacing, { x: number; y: number; depthBias: number }> = {
  down: { x: 0, y: -8, depthBias: 20 },
  up: { x: 0, y: -8, depthBias: -18 },
  left: { x: 6, y: -4, depthBias: 20 },
  right: { x: -6, y: -4, depthBias: 20 },
};

export function sitAnchor(seat: Seat): { x: number; y: number; depthBias: number } {
  if (seat.use === 'sleep') return sleepAnchor(seat);
  const origin = slotOrigin(seat);
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
  const origin = slotOrigin(seat);
  return {
    x: origin.x + SLEEP_OFFSET.x,
    y: origin.y + SLEEP_OFFSET.y,
    depthBias: SLEEP_OFFSET.depthBias,
  };
}

export function occupiedSeatIds(
  seats: Seat[],
  occupants: Array<{ x: number; y: number }>,
): Set<string> {
  const taken = new Set<string>();
  for (const who of occupants) {
    const open = seats.filter((seat) => !taken.has(seat.id));
    const seat = seatAtAnchor(open, who.x, who.y);
    if (seat) taken.add(seat.id);
  }
  return taken;
}

export function claimSeat(
  preferred: Seat,
  seats: Seat[],
  occupied: Set<string>,
  near: TilePos,
): Seat | null {
  const group = seats.filter((seat) => seat.placeKey === preferred.placeKey);
  const free = group.filter((seat) => !occupied.has(seat.id));
  if (free.length === 0) return null;
  return nearestSeat(free, near, 99) ?? free[0];
}

function seatAtAnchor(seats: Seat[], x: number, y: number, maxPx = OCCUPY_PX): Seat | null {
  let best: Seat | null = null;
  let bestDist = maxPx;
  for (const seat of seats) {
    const anchor = sitAnchor(seat);
    const dist = Math.hypot(anchor.x - x, anchor.y - y);
    if (dist < bestDist) {
      best = seat;
      bestDist = dist;
    }
  }
  return best;
}

function slotOrigin(seat: Seat): { x: number; y: number } {
  return slotWorld(seat.place, seat.slot, seat.slots);
}

function slotTile(place: FurniturePlace, slot: number, slots: number): TilePos {
  const size = placedSize(place);
  const anchor = slotAnchor(place, slot, slots);
  return {
    col: place.col + Math.min(size.w - 1, Math.max(0, Math.floor(anchor.u * size.w - 1e-6))),
    row: place.row + Math.min(size.h - 1, Math.max(0, Math.floor(anchor.v * size.h - 1e-6))),
  };
}

function resolveApproach(
  place: FurniturePlace,
  facing: FurnitureFacing,
  walkable: boolean[][] | undefined,
  use: UseKind,
  tile: TilePos,
): TilePos {
  const preferred = use === 'sleep' ? sleepApproachTile(place) : approachTile(place, facing, tile);
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

function approachTile(place: FurniturePlace, facing: FurnitureFacing, slot: TilePos): TilePos {
  const size = placedSize(place);
  let front: TilePos;
  if (facing === 'down') front = { col: slot.col, row: place.row };
  else if (facing === 'up') front = { col: slot.col, row: place.row + size.h - 1 };
  else if (facing === 'left') front = { col: place.col, row: slot.row };
  else front = { col: place.col + size.w - 1, row: slot.row };

  const behind = BEHIND[facing];
  return { col: front.col + behind.col, row: front.row + behind.row };
}

function distanceToSlot(tile: TilePos, seat: Seat): number {
  if (tile.col === seat.approach.col && tile.row === seat.approach.row) return 0;
  return Math.max(Math.abs(seat.tile.col - tile.col), Math.abs(seat.tile.row - tile.row));
}

function distanceToFurniture(tile: TilePos, seat: Seat): number {
  if (tile.col === seat.approach.col && tile.row === seat.approach.row) return 0;
  let best = Infinity;
  for (const cell of footprintCells(seat.place)) {
    const dist = Math.max(Math.abs(cell.col - tile.col), Math.abs(cell.row - tile.row));
    if (dist < best) best = dist;
  }
  return best;
}

function nearestByTile(seats: Seat[], tile: TilePos): Seat {
  let best = seats[0];
  let bestDist = Infinity;
  for (const seat of seats) {
    const dist = Math.max(Math.abs(seat.tile.col - tile.col), Math.abs(seat.tile.row - tile.row));
    if (dist < bestDist) {
      best = seat;
      bestDist = dist;
    }
  }
  return best;
}
