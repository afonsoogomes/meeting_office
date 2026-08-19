import { TILE_SIZE, type TileId } from './constants';
import { CATALOG, clonePlaces, type FurnitureFacing, type FurniturePlace } from './furniture';
import { buildHouse, type BuiltHouse } from './house';
import { OFFICE_HOUSE } from './houses/office';

export { TILE_SIZE, Tile, SOLID_TILES, isWalkable } from './constants';
export type { TileId } from './constants';
export { blockWalkable, canPlace, catalogList, drawFurniture } from './furniture';
export type { FurniturePlace } from './furniture';

export const FURNITURE = OFFICE_HOUSE.furniture;

const FURNITURE_STORAGE = 'meeting-office-furniture-v5';
const FURNITURE_STORAGE_V4 = 'meeting-office-furniture-v4';

export function defaultFurniture(): FurniturePlace[] {
  return clonePlaces(OFFICE_HOUSE.furniture);
}

const FACING_SET = new Set<FurnitureFacing>(['down', 'up', 'left', 'right']);

export function loadOfficeFurniture(): FurniturePlace[] {
  try {
    const current = localStorage.getItem(FURNITURE_STORAGE);
    const raw = current ?? localStorage.getItem(FURNITURE_STORAGE_V4);
    if (!raw) return defaultFurniture();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultFurniture();
    const places = parsed.flatMap((entry) => {
      const place = parseStoredPlace(entry);
      return place ? [place] : [];
    });
    const migrated = current ? places : shiftShrunkTables(places);
    const next = nudgeChairsOffDiningTables(migrated);
    if (!current) saveOfficeFurniture(next);
    return next;
  } catch {
    return defaultFurniture();
  }
}

const DINING_TABLES = new Set([
  'table',
  'winter-dining-table',
  'modern-dining-table',
  'festive-dining-table',
]);

/** v4 catalog used h:2 on these; shrinking to h:1 keeps the south edge in place. */
const TABLES_SHRUNK_FROM_H2 = new Set([
  'furniture-catalogue',
  'pub-table',
  'birch-table',
  'birch-tea-table',
  'oak-tea-table',
  'modern-tea-table',
  'mahogany-tea-table',
  'walnut-tea-table',
  'winter-table',
  'mahogany-table',
  'walnut-table',
  'diviner-table',
  'candy-table',
  'dark-table',
  'moon-table',
  'luau-table',
  'luxury-table',
  'modern-table',
  'neolithic-table',
  'puzzle-table',
  'sun-table',
]);

function shiftShrunkTables(places: FurniturePlace[]): FurniturePlace[] {
  return places.map((place) =>
    TABLES_SHRUNK_FROM_H2.has(place.item) ? { ...place, row: place.row + 1 } : place,
  );
}

/** Dining tables grew from 4 to 5 tiles; slide the east chair off the extra top. */
function nudgeChairsOffDiningTables(places: FurniturePlace[]): FurniturePlace[] {
  const tables = places.filter(
    (place) => DINING_TABLES.has(place.item) && (place.facing ?? 'down') === 'down',
  );
  return places.map((place) => {
    if (place.item !== 'chair' || place.facing !== 'left') return place;
    for (const table of tables) {
      const width = CATALOG[table.item]?.w ?? 0;
      if (place.row === table.row && place.col === table.col + width - 1) {
        return { ...place, col: table.col + width };
      }
    }
    return place;
  });
}

function parseStoredPlace(entry: unknown): FurniturePlace | null {
  if (!entry || typeof entry !== 'object') return null;
  const raw = entry as Partial<FurniturePlace>;
  const item = raw.item === 'desk' ? 'oak-table' : raw.item;
  if (typeof item !== 'string' || !CATALOG[item]) return null;
  const col = raw.col;
  const row = raw.row;
  if (typeof col !== 'number' || typeof row !== 'number' || !Number.isInteger(col) || !Number.isInteger(row)) {
    return null;
  }
  const facing = raw.facing && FACING_SET.has(raw.facing) ? raw.facing : undefined;
  return { item, col, row, facing };
}

export function saveOfficeFurniture(places: FurniturePlace[]): void {
  localStorage.setItem(FURNITURE_STORAGE, JSON.stringify(places));
}

export type RoomId = 'office' | 'meeting' | 'lounge' | 'cafe' | 'hall';

export type Room = {
  id: RoomId;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Rect = { x: number; y: number; w: number; h: number };

let cached: BuiltHouse | null = null;

export function getBuiltHouse(): BuiltHouse {
  if (!cached || cached.spec !== OFFICE_HOUSE) cached = buildHouse(OFFICE_HOUSE);
  return cached;
}

export const MAP_COLS = OFFICE_HOUSE.mapCols;
export const MAP_ROWS = OFFICE_HOUSE.mapRows;

export const ROOMS: Room[] = OFFICE_HOUSE.rooms.map((room) => ({
  id: room.id as RoomId,
  name: room.name,
  x: room.x,
  y: room.y,
  w: room.w,
  h: room.h,
}));

export const DOORS: Rect[] = OFFICE_HOUSE.doors;

export function createGroundGrid(): TileId[][] {
  return getBuiltHouse().grid;
}

export function createFloorGrid(): boolean[][] {
  const { spec, role } = getBuiltHouse();
  return Array.from({ length: spec.mapRows }, (_, row) =>
    Array.from({ length: spec.mapCols }, (_, col) => role[row][col] === 'floor'),
  );
}

export function inRect(col: number, row: number, rect: Rect): boolean {
  return col >= rect.x && col < rect.x + rect.w && row >= rect.y && row < rect.y + rect.h;
}

export function isDoorCell(col: number, row: number): boolean {
  return DOORS.some((door) => inRect(col, row, door));
}

export function tileToWorld(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function worldToTile(x: number, y: number): { col: number; row: number } {
  return {
    col: Math.floor(x / TILE_SIZE),
    row: Math.floor(y / TILE_SIZE),
  };
}

export function roomAt(x: number, y: number): Room {
  const col = Math.floor(x / TILE_SIZE);
  const row = Math.floor(y / TILE_SIZE);
  const found = ROOMS.find(
    (room) => col >= room.x && col < room.x + room.w && row >= room.y && row < room.y + room.h,
  );
  if (found) return found;

  let nearest = ROOMS[0];
  let best = Infinity;
  for (const room of ROOMS) {
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    const dist = Math.hypot(cx - col, cy - row);
    if (dist < best) {
      nearest = room;
      best = dist;
    }
  }
  return nearest;
}

export const SPAWN = tileToWorld(OFFICE_HOUSE.spawn.col, OFFICE_HOUSE.spawn.row);

export const MAP_WIDTH = MAP_COLS * TILE_SIZE;
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE;
