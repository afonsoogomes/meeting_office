import { TILE_SIZE, type TileId } from './constants';
import {
  CATALOG,
  clonePlaces,
  liftWallHangings,
  type FurnitureFacing,
  type FurniturePlace,
} from './furniture';
import { buildHouse, type BuiltHouse, type HouseSpec } from './house';
import { OFFICE_HOUSE } from './houses/office';
import type { OfficeSnapshot, OfficeSpec } from '../../shared/office';
import { DEFAULT_OFFICE_NAME } from '../../shared/office-default';
import { DEFAULT_OFFICE_SLUG, sanitizeNpcPlacement, type NpcPlacement } from '../../shared/protocol';

export { TILE_SIZE, Tile, SOLID_TILES, isWalkable } from './constants';
export type { TileId } from './constants';
export { blockWalkable, canPlace, catalogList, drawFurniture } from './furniture';
export type { FurniturePlace } from './furniture';

export const FURNITURE = OFFICE_HOUSE.furniture;

const FURNITURE_STORAGE = 'meeting-office-furniture-v5';
const FURNITURE_STORAGE_V4 = 'meeting-office-furniture-v4';
const NPC_STORAGE = 'meeting-office-npcs-v1';

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
    const next = liftWallHangings(nudgeChairsOffDiningTables(migrated), createWallGrid());
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
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : undefined;
  return { ...(id ? { id } : {}), item, col, row, facing };
}

export function saveOfficeFurniture(places: FurniturePlace[]): void {
  localStorage.setItem(FURNITURE_STORAGE, JSON.stringify(places));
}

export type RoomId = string;

export type Room = {
  id: RoomId;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Rect = { x: number; y: number; w: number; h: number };

export type FurnitureSync = 'remote' | 'local';

let activeHouse: HouseSpec = OFFICE_HOUSE;
let cached: BuiltHouse | null = null;
let furnitureSync: FurnitureSync = 'local';
let bootFurniture: FurniturePlace[] | null = null;
let bootNpcs: NpcPlacement[] | null = null;
let liveOfficeSlug = DEFAULT_OFFICE_SLUG;
let liveOfficeName = DEFAULT_OFFICE_NAME;

export function getBuiltHouse(): BuiltHouse {
  if (!cached || cached.spec !== activeHouse) cached = buildHouse(activeHouse);
  return cached;
}

export let MAP_COLS = OFFICE_HOUSE.mapCols;
export let MAP_ROWS = OFFICE_HOUSE.mapRows;

export let ROOMS: Room[] = roomsFrom(OFFICE_HOUSE);

export let DOORS: Rect[] = OFFICE_HOUSE.doors.map((door) => ({ ...door }));

export function applyHouseSpec(spec: OfficeSpec): void {
  activeHouse = {
    id: spec.id,
    mapCols: spec.mapCols,
    mapRows: spec.mapRows,
    spawn: { ...spec.spawn },
    rooms: spec.rooms.map((room) => ({ ...room })),
    doors: spec.doors.map((door) => ({ ...door })),
    stairs: spec.stairs?.map((stair) => ({ ...stair })),
    labels: spec.labels?.map((label) => ({ ...label })),
    furniture: [],
  };
  cached = null;
  MAP_COLS = spec.mapCols;
  MAP_ROWS = spec.mapRows;
  ROOMS = roomsFrom(activeHouse);
  DOORS = activeHouse.doors.map((door) => ({ ...door }));
  SPAWN = tileToWorld(spec.spawn.col, spec.spawn.row);
  MAP_WIDTH = MAP_COLS * TILE_SIZE;
  MAP_HEIGHT = MAP_ROWS * TILE_SIZE;
}

export function applyOfficeSnapshot(snapshot: OfficeSnapshot): void {
  applyHouseSpec(snapshot.spec);
  furnitureSync = 'remote';
  bootFurniture = clonePlaces(snapshot.furniture);
  bootNpcs = cloneNpcs(snapshot.npcs);
  liveOfficeSlug = snapshot.slug;
  liveOfficeName = snapshot.name;
}

export function currentOfficeSlug(): string {
  return liveOfficeSlug;
}

export function currentOfficeName(): string {
  return liveOfficeName;
}

export function setCurrentOfficeMeta(slug: string, name: string): void {
  liveOfficeSlug = slug;
  liveOfficeName = name;
}

export function useLocalOffice(): void {
  applyHouseSpec({
    id: OFFICE_HOUSE.id,
    mapCols: OFFICE_HOUSE.mapCols,
    mapRows: OFFICE_HOUSE.mapRows,
    spawn: OFFICE_HOUSE.spawn,
    rooms: OFFICE_HOUSE.rooms,
    doors: OFFICE_HOUSE.doors,
    stairs: OFFICE_HOUSE.stairs,
    labels: OFFICE_HOUSE.labels,
  });
  furnitureSync = 'local';
  bootFurniture = null;
  bootNpcs = null;
}

export function isFurnitureRemote(): boolean {
  return furnitureSync === 'remote';
}

export function initialFurniture(): FurniturePlace[] {
  const places = furnitureSync === 'remote' && bootFurniture ? clonePlaces(bootFurniture) : loadOfficeFurniture();
  return liftWallHangings(places, createWallGrid());
}

export function initialNpcs(): NpcPlacement[] {
  if (furnitureSync === 'remote' && bootNpcs) return cloneNpcs(bootNpcs);
  return loadLocalNpcs();
}

export function saveOfficeNpcs(npcs: NpcPlacement[]): void {
  try {
    localStorage.setItem(`${NPC_STORAGE}:${liveOfficeSlug}`, JSON.stringify(npcs));
  } catch {
    /* ignore quota */
  }
}

function loadLocalNpcs(): NpcPlacement[] {
  try {
    const raw = localStorage.getItem(`${NPC_STORAGE}:${liveOfficeSlug}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const npc = sanitizeNpcPlacement(item);
      return npc ? [npc] : [];
    });
  } catch {
    return [];
  }
}

function cloneNpcs(npcs: NpcPlacement[]): NpcPlacement[] {
  return npcs.map((npc) => ({ ...npc, appearance: { ...npc.appearance } }));
}

function roomsFrom(house: HouseSpec): Room[] {
  return house.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    x: room.x,
    y: room.y,
    w: room.w,
    h: room.h,
  }));
}

export function createGroundGrid(): TileId[][] {
  return getBuiltHouse().grid;
}

export function createFloorGrid(): boolean[][] {
  const { spec, role } = getBuiltHouse();
  return Array.from({ length: spec.mapRows }, (_, row) =>
    Array.from({ length: spec.mapCols }, (_, col) => role[row][col] === 'floor'),
  );
}

/** North wallpaper cells — paintings and sconces hang here, not on the floor. */
export function createWallGrid(): boolean[][] {
  const { spec, role } = getBuiltHouse();
  return Array.from({ length: spec.mapRows }, (_, row) =>
    Array.from({ length: spec.mapCols }, (_, col) => role[row][col] === 'back'),
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

export let SPAWN = tileToWorld(OFFICE_HOUSE.spawn.col, OFFICE_HOUSE.spawn.row);

export let MAP_WIDTH = MAP_COLS * TILE_SIZE;
export let MAP_HEIGHT = MAP_ROWS * TILE_SIZE;
