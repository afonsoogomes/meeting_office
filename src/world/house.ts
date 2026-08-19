import type Phaser from 'phaser';
import { TILE_SIZE, Tile, WALLPAPER_TILES, isWalkable, type TileId } from './constants';
import type { FurniturePlace } from './furniture';

export type RoomSpec = {
  id: string;
  name: string;
  /** Walkable floor, in tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
  floor: string;
  wallpaper: string;
  /** Absolute columns that use `window` instead of `wallpaper`. Facade rooms only. */
  windows?: number[];
  window?: string;
};

export type DoorSpec = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Walkable steps between floor plates (replaces a punched wallpaper tunnel). */
export type StairSpec = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type HouseLabel = {
  text: string;
  col: number;
  row: number;
};

export type HouseSpec = {
  id: string;
  mapCols: number;
  mapRows: number;
  rooms: RoomSpec[];
  doors: DoorSpec[];
  stairs?: StairSpec[];
  furniture: FurniturePlace[];
  spawn: { col: number; row: number };
  labels?: HouseLabel[];
};

export type CellRole = 'void' | 'floor' | 'back' | 'south' | 'ns' | 'door' | 'stair';

export type BuiltHouse = {
  spec: HouseSpec;
  grid: TileId[][];
  role: CellRole[][];
  floorKey: string[][];
};

function inBounds(spec: HouseSpec, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < spec.mapCols && row < spec.mapRows;
}

function fillRole(
  built: BuiltHouse,
  col: number,
  row: number,
  role: Exclude<CellRole, 'void' | 'floor' | 'door' | 'stair'>,
): void {
  if (!inBounds(built.spec, col, row)) return;
  if (built.grid[row][col] === Tile.Wood) return;
  built.grid[row][col] = Tile.Wall;
  built.role[row][col] = role;
}

export function buildHouse(spec: HouseSpec): BuiltHouse {
  const grid: TileId[][] = Array.from({ length: spec.mapRows }, () =>
    Array.from({ length: spec.mapCols }, () => Tile.Void),
  );
  const role: CellRole[][] = Array.from({ length: spec.mapRows }, () =>
    Array.from({ length: spec.mapCols }, () => 'void' as CellRole),
  );
  const floorKey: string[][] = Array.from({ length: spec.mapRows }, () =>
    Array.from({ length: spec.mapCols }, () => ''),
  );
  const built: BuiltHouse = { spec, grid, role, floorKey };

  for (const room of spec.rooms) {
    for (let row = room.y; row < room.y + room.h; row += 1) {
      for (let col = room.x; col < room.x + room.w; col += 1) {
        if (!inBounds(spec, col, row)) continue;
        grid[row][col] = Tile.Wood;
        role[row][col] = 'floor';
        floorKey[row][col] = room.floor;
      }
    }
  }

  for (const room of spec.rooms) {
    for (let dy = 1; dy <= WALLPAPER_TILES; dy += 1) {
      for (let col = room.x; col < room.x + room.w; col += 1) {
        fillRole(built, col, room.y - dy, 'back');
      }
    }
    for (let row = room.y - WALLPAPER_TILES; row < room.y + room.h; row += 1) {
      fillRole(built, room.x - 1, row, 'ns');
      fillRole(built, room.x + room.w, row, 'ns');
    }
    for (let col = room.x - 1; col <= room.x + room.w; col += 1) {
      fillRole(built, col, room.y + room.h, 'south');
    }
  }

  for (const door of spec.doors) {
    punchOpening(built, door, 'door');
  }
  for (const stair of spec.stairs ?? []) {
    punchOpening(built, stair, 'stair');
  }

  return built;
}

function punchOpening(built: BuiltHouse, rect: DoorSpec, role: 'door' | 'stair'): void {
  const { spec, grid, floorKey } = built;
  for (let row = rect.y; row < rect.y + rect.h; row += 1) {
    for (let col = rect.x; col < rect.x + rect.w; col += 1) {
      if (!inBounds(spec, col, row)) continue;
      grid[row][col] = Tile.Wood;
      built.role[row][col] = role;
      if (!floorKey[row][col]) {
        floorKey[row][col] = nearestFloor(spec, col, row);
      }
    }
  }
}

function nearestFloor(spec: HouseSpec, col: number, row: number): string {
  let best = spec.rooms[0];
  let bestDist = Infinity;
  for (const room of spec.rooms) {
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    const dist = Math.hypot(cx - col, cy - row);
    if (dist < bestDist) {
      best = room;
      bestDist = dist;
    }
  }
  return best.floor;
}

function roleAt(built: BuiltHouse, col: number, row: number): CellRole {
  if (!inBounds(built.spec, col, row)) return 'void';
  return built.role[row][col];
}

function isSolidWall(role: CellRole): boolean {
  return role === 'back' || role === 'south' || role === 'ns';
}

function wallpaperPunched(built: BuiltHouse, col: number, floorRow: number): boolean {
  for (let dy = 1; dy <= WALLPAPER_TILES; dy += 1) {
    const cell = roleAt(built, col, floorRow - dy);
    if (cell === 'door' || cell === 'stair') return true;
  }
  return false;
}

export function drawHouse(scene: Phaser.Scene, built: BuiltHouse): void {
  const { spec, grid, floorKey } = built;

  const painted = new Set<string>();
  const stampFloor = (key: string, col: number, row: number) => {
    scene.add
      .image(col * TILE_SIZE, row * TILE_SIZE, key)
      .setOrigin(0, 0)
      .setDisplaySize(TILE_SIZE * 2 + 1, TILE_SIZE * 2 + 1)
      .setDepth(0);
    painted.add(`${col},${row}`);
    painted.add(`${col + 1},${row}`);
    painted.add(`${col},${row + 1}`);
    painted.add(`${col + 1},${row + 1}`);
  };

  for (const room of spec.rooms) {
    for (let dr = 0; dr < room.h; dr += 2) {
      for (let dc = 0; dc < room.w; dc += 2) {
        const col = room.x + dc;
        const row = room.y + dr;
        if (!inBounds(spec, col, row)) continue;
        if (built.role[row][col] === 'stair') continue;
        stampFloor(room.floor, col, row);
      }
    }
  }

  for (let row = 0; row < spec.mapRows; row += 1) {
    for (let col = 0; col < spec.mapCols; col += 1) {
      if (!isWalkable(grid[row][col])) continue;
      if (built.role[row][col] === 'stair') continue;
      if (painted.has(`${col},${row}`)) continue;
      stampFloor(floorKey[row][col] || spec.rooms[0].floor, col, row);
    }
  }

  for (const room of spec.rooms) {
    for (let col = room.x; col < room.x + room.w; col += 1) {
      if (wallpaperPunched(built, col, room.y)) continue;
      const useWindow = Boolean(room.window && room.windows?.includes(col));
      const key = useWindow ? room.window! : room.wallpaper;
      scene.add
        .image(col * TILE_SIZE, room.y * TILE_SIZE, key)
        .setOrigin(0, 1)
        .setDepth(3);
    }
  }

  for (let row = 0; row < spec.mapRows; row += 1) {
    for (let col = 0; col < spec.mapCols; col += 1) {
      const cell = built.role[row][col];
      if (cell === 'back' || cell === 'void' || cell === 'floor' || cell === 'door' || cell === 'stair') continue;

      const depth = row * TILE_SIZE + 6;
      const wallW = isSolidWall(roleAt(built, col - 1, row));
      const wallE = isSolidWall(roleAt(built, col + 1, row));
      const wallS = isSolidWall(roleAt(built, col, row + 1));

      let key = 'cap-top';
      if (cell === 'south') {
        if (!wallW && !wallE) key = 'cap-end-s';
        else if (!wallW) key = 'rim-s-w';
        else if (!wallE) key = 'rim-s-e';
        else key = 'rim-s';
      } else if (!wallS) {
        key = 'cap-end-s';
      } else if (roleAt(built, col, row - 1) === 'void') {
        key = 'cap-top-n';
      }

      scene.add
        .image(col * TILE_SIZE, row * TILE_SIZE, key)
        .setOrigin(0, 0)
        .setDisplaySize(TILE_SIZE + 1, TILE_SIZE + 1)
        .setDepth(depth);
    }
  }

  for (const stair of spec.stairs ?? []) {
    for (let row = stair.y; row < stair.y + stair.h; row += 1) {
      for (let col = stair.x; col < stair.x + stair.w; col += 1) {
        scene.add
          .image(col * TILE_SIZE, row * TILE_SIZE, 'stair')
          .setOrigin(0, 0)
          .setDisplaySize(TILE_SIZE, TILE_SIZE)
          .setDepth(1);
      }
    }
  }

  for (const label of spec.labels ?? []) {
    const x = label.col * TILE_SIZE + TILE_SIZE / 2;
    const y = label.row * TILE_SIZE;
    scene.add
      .text(x, y, label.text, {
        fontFamily: 'Pixelify Sans, monospace',
        fontSize: '12px',
        color: '#f7f3ea',
        stroke: '#1a1410',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.7)
      .setResolution(2)
      .setDepth(7);
  }
}
