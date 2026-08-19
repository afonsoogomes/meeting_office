import { sanitizeFurniturePlacement, type FurniturePlacement } from './protocol';

export const DEFAULT_OFFICE_SLUG = 'default';

export type OfficeRect = { x: number; y: number; w: number; h: number };

export type OfficeRoom = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: string;
  wallpaper: string;
  windows?: number[];
  window?: string;
};

export type OfficeLabel = {
  text: string;
  col: number;
  row: number;
};

/** House geometry without furniture. Seed lives in `office-default.ts`; live copy in SQLite. */
export type OfficeSpec = {
  id: string;
  mapCols: number;
  mapRows: number;
  spawn: { col: number; row: number };
  rooms: OfficeRoom[];
  doors: OfficeRect[];
  stairs?: OfficeRect[];
  labels?: OfficeLabel[];
};

export type OfficeSnapshot = {
  slug: string;
  name: string;
  spec: OfficeSpec;
  furniture: FurniturePlacement[];
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const TILE_KEY_RE = /^[a-z][a-z0-9-]{0,47}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function parseRect(value: unknown, cols: number, rows: number): OfficeRect | null {
  if (!isRecord(value)) return null;
  const x = asInt(value.x, 0, cols - 1);
  const y = asInt(value.y, 0, rows - 1);
  const w = asInt(value.w, 1, cols);
  const h = asInt(value.h, 1, rows);
  if (x === null || y === null || w === null || h === null) return null;
  if (x + w > cols || y + h > rows) return null;
  return { x, y, w, h };
}

function parseRoom(value: unknown, cols: number, rows: number): OfficeRoom | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' && TILE_KEY_RE.test(value.id) ? value.id : null;
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 40) : '';
  const rect = parseRect(value, cols, rows);
  const floor = typeof value.floor === 'string' && TILE_KEY_RE.test(value.floor) ? value.floor : null;
  const wallpaper =
    typeof value.wallpaper === 'string' && TILE_KEY_RE.test(value.wallpaper) ? value.wallpaper : null;
  if (!id || !name || !rect || !floor || !wallpaper) return null;
  const room: OfficeRoom = { id, name, ...rect, floor, wallpaper };
  if (typeof value.window === 'string' && TILE_KEY_RE.test(value.window)) room.window = value.window;
  if (Array.isArray(value.windows)) {
    const windows = value.windows.filter((col): col is number => typeof col === 'number' && Number.isInteger(col));
    if (windows.length) room.windows = windows;
  }
  return room;
}

export function parseOfficeSpec(value: unknown): OfficeSpec | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' && TILE_KEY_RE.test(value.id) ? value.id : null;
  const mapCols = asInt(value.mapCols, 8, 96);
  const mapRows = asInt(value.mapRows, 8, 96);
  if (!id || mapCols === null || mapRows === null || !isRecord(value.spawn)) return null;
  const spawnCol = asInt(value.spawn.col, 0, mapCols - 1);
  const spawnRow = asInt(value.spawn.row, 0, mapRows - 1);
  if (spawnCol === null || spawnRow === null || !Array.isArray(value.rooms) || !Array.isArray(value.doors)) {
    return null;
  }
  const rooms: OfficeRoom[] = [];
  for (const item of value.rooms) {
    const room = parseRoom(item, mapCols, mapRows);
    if (!room) return null;
    rooms.push(room);
  }
  if (rooms.length === 0) return null;
  const doors: OfficeRect[] = [];
  for (const item of value.doors) {
    const door = parseRect(item, mapCols, mapRows);
    if (!door) return null;
    doors.push(door);
  }
  const spec: OfficeSpec = {
    id,
    mapCols,
    mapRows,
    spawn: { col: spawnCol, row: spawnRow },
    rooms,
    doors,
  };
  if (Array.isArray(value.stairs)) {
    const stairs: OfficeRect[] = [];
    for (const item of value.stairs) {
      const stair = parseRect(item, mapCols, mapRows);
      if (!stair) return null;
      stairs.push(stair);
    }
    spec.stairs = stairs;
  }
  if (Array.isArray(value.labels)) {
    const labels: OfficeLabel[] = [];
    for (const item of value.labels) {
      if (!isRecord(item) || typeof item.text !== 'string') return null;
      const col = asInt(item.col, 0, mapCols - 1);
      const row = asInt(item.row, 0, mapRows - 1);
      const text = item.text.trim().slice(0, 24);
      if (col === null || row === null || !text) return null;
      labels.push({ text, col, row });
    }
    spec.labels = labels;
  }
  return spec;
}

export function parseOfficeSlug(value: unknown): string | null {
  return typeof value === 'string' && SLUG_RE.test(value) ? value : null;
}

export function parseOfficeSnapshot(value: unknown): OfficeSnapshot | null {
  if (!isRecord(value)) return null;
  const slug = parseOfficeSlug(value.slug);
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 48) : '';
  const spec = parseOfficeSpec(value.spec);
  if (!slug || name.length < 2 || !spec || !Array.isArray(value.furniture)) return null;
  const furniture: FurniturePlacement[] = [];
  for (const item of value.furniture) {
    const place = sanitizeFurniturePlacement(item);
    if (place) furniture.push(place);
  }
  return { slug, name, spec, furniture };
}

export function specFromHouse(house: OfficeSpec): OfficeSpec {
  return {
    id: house.id,
    mapCols: house.mapCols,
    mapRows: house.mapRows,
    spawn: { ...house.spawn },
    rooms: house.rooms.map((room) => ({ ...room, windows: room.windows ? [...room.windows] : undefined })),
    doors: house.doors.map((door) => ({ ...door })),
    stairs: house.stairs?.map((stair) => ({ ...stair })),
    labels: house.labels?.map((label) => ({ ...label })),
  };
}
