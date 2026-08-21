import type Phaser from 'phaser';
import { TILE_SIZE, TILESET_SCALE, WALLPAPER_TILES } from './constants';
import {
  FURNITURE_SLICES,
  GENERATED_CATALOG,
  type CatalogEntry,
  type FurnitureGroup,
  type FurnitureSlice,
} from './furnitureData';

export type FurnitureLayer = 'floor' | 'object' | 'wall';
export type FurnitureFacing = 'down' | 'up' | 'left' | 'right';
export type FurnitureUse = 'sit' | 'sleep' | 'watch' | 'play';
export type FurnitureKind = CatalogEntry;
export type { FurnitureGroup };

/** A placed item. `col`,`row` is the north-west tile of the footprint. `facing` picks the directional sprite. */
export type FurniturePlace = {
  id?: string;
  item: string;
  col: number;
  row: number;
  facing?: FurnitureFacing;
};

const EXTRAS: CatalogEntry[] = [
  {
    id: 'plant',
    label: 'Vaso',
    group: 'plant',
    w: 1,
    h: 1,
    collide: true,
    layer: 'object',
    sprites: { down: 'plant' },
  },
  {
    id: 'plant-fern',
    label: 'Samambaia',
    group: 'plant',
    w: 1,
    h: 1,
    collide: true,
    layer: 'object',
    sprites: { down: 'plant-fern' },
  },
  {
    id: 'counter',
    label: 'Balcão',
    group: 'kitchen',
    w: 1,
    h: 1,
    collide: true,
    layer: 'object',
    sprites: { down: 'counter' },
  },
  {
    id: 'stove',
    label: 'Fogão',
    group: 'kitchen',
    w: 1,
    h: 1,
    collide: true,
    layer: 'object',
    sprites: { down: 'stove' },
  },
  {
    id: 'sink',
    label: 'Pia',
    group: 'kitchen',
    w: 1,
    h: 1,
    collide: true,
    layer: 'object',
    sprites: { down: 'sink' },
  },
  {
    id: 'fridge',
    label: 'Geladeira',
    group: 'kitchen',
    w: 1,
    h: 1,
    collide: true,
    layer: 'object',
    sprites: { down: 'fridge' },
  },
  {
    id: 'tv',
    label: 'TV de madeira',
    group: 'kitchen',
    w: 2,
    h: 1,
    collide: true,
    layer: 'object',
    use: 'watch',
    sprites: { down: 'tv' },
  },
  {
    id: 'arcade',
    label: 'Fliperama',
    group: 'decor',
    w: 1,
    h: 1,
    collide: true,
    layer: 'object',
    use: 'play',
    sprites: { down: 'arcade' },
  },
  {
    id: 'arcade-junimo',
    label: 'Fliperama Junimo',
    group: 'decor',
    w: 1,
    h: 1,
    collide: true,
    layer: 'object',
    use: 'play',
    sprites: { down: 'arcade-junimo' },
  },
];

function isWallHangingEntry(item: { id: string; group?: string; layer?: string }): boolean {
  if (item.layer === 'wall' || item.group === 'wall') return true;
  return item.id.includes('wall') || item.id.includes('decal');
}

export const CATALOG: Record<string, FurnitureKind> = Object.fromEntries(
  [...EXTRAS, ...GENERATED_CATALOG].map((item) => {
    const kind = isWallHangingEntry(item) ? { ...item, layer: 'wall' as const, collide: false } : item;
    return [kind.id, withSitLayout(kind)];
  }),
);

function withSitLayout(kind: FurnitureKind): FurnitureKind {
  if (kind.use !== 'sit' || kind.slotAnchors?.length || kind.slots != null) return kind;
  if (kind.side && kind.w >= 3) {
    const slots = kind.w >= 4 ? 3 : 2;
    const anchors = Array.from({ length: slots }, (_, slot) => ({
      u: (slot + 0.5) / slots,
      v: 1,
    }));
    return { ...kind, slots, slotAnchors: anchors };
  }
  return kind;
}

const SLICE_BY_KEY: Record<string, FurnitureSlice> = Object.fromEntries(
  FURNITURE_SLICES.map((slice) => [slice.key, slice]),
);

/** Phaser origin so extra source pixels hang outside the footprint instead of shifting the piece. */
export function spriteAnchor(place: FurniturePlace, key: string): { x: number; y: number } {
  const slice = SLICE_BY_KEY[key];
  if (!slice) return { x: 0.5, y: 1 };
  const footW = placedSize(place).w * TILE_SIZE;
  const spriteW = slice.w * TILESET_SCALE;
  const x = spriteW > footW + 0.5 ? footW / 2 / spriteW : 0.5;
  // Drop: origin at the tabletop/leg line so the back of the top hangs north (walk-behind).
  const y = slice.drop ? (slice.h - slice.drop) / slice.h : 1;
  return { x, y };
}

export const FACINGS: FurnitureFacing[] = ['down', 'right', 'up', 'left'];

export function furnitureKind(id: string): FurnitureKind {
  const kind = CATALOG[id];
  if (!kind) throw new Error(`Unknown furniture: ${id}`);
  return kind;
}

export function hangsOnWall(target: string | FurniturePlace | FurnitureKind): boolean {
  if (typeof target === 'string') return CATALOG[target]?.layer === 'wall' || isWallHangingEntry({ id: target });
  if ('group' in target) return target.layer === 'wall';
  return hangsOnWall(target.item);
}

export function catalogList(): FurnitureKind[] {
  return Object.values(CATALOG);
}

export const CATALOG_GROUPS: Array<{ id: FurnitureGroup | 'all'; label: string }> = [
  { id: 'all', label: 'Tudo' },
  { id: 'seat', label: 'Assentos' },
  { id: 'table', label: 'Mesas' },
  { id: 'storage', label: 'Armários' },
  { id: 'kitchen', label: 'Cozinha' },
  { id: 'plant', label: 'Plantas' },
  { id: 'light', label: 'Luzes' },
  { id: 'decor', label: 'Decoração' },
  { id: 'wall', label: 'Parede' },
  { id: 'rug', label: 'Tapetes' },
  { id: 'bed', label: 'Camas' },
];

export function catalogInGroup(group: FurnitureGroup | 'all', query = ''): FurnitureKind[] {
  const needle = query.trim().toLowerCase();
  return catalogList().filter((item) => {
    if (group !== 'all' && item.group !== group) return false;
    if (!needle) return true;
    return item.label.toLowerCase().includes(needle) || item.id.includes(needle);
  });
}

export function clonePlaces(places: FurniturePlace[]): FurniturePlace[] {
  return places.map((place) => ({ ...place }));
}

export function nextFacing(facing?: FurnitureFacing, step = 1): FurnitureFacing {
  const current = facing ?? 'down';
  const index = FACINGS.indexOf(current);
  const span = FACINGS.length;
  return FACINGS[(((index + step) % span) + span) % span];
}

/** Floor footprint for this placement (sofas/benches shrink when turned sideways). */
export function placedSize(place: FurniturePlace): { w: number; h: number } {
  const kind = furnitureKind(place.item);
  const facing = place.facing ?? 'down';
  if (kind.side && (facing === 'left' || facing === 'right')) return kind.side;
  return { w: kind.w, h: kind.h };
}

export function furniturePlaceKey(place: FurniturePlace): string {
  return place.id ?? `${place.item}:${place.col},${place.row}`;
}

/** How many people can sit or sleep on this placement. Count is per item, not per tile. */
export function occupantSlots(place: FurniturePlace): number {
  const kind = furnitureKind(place.item);
  if (kind.slotAnchors?.length) return kind.slotAnchors.length;
  if (kind.slots != null) return Math.max(1, kind.slots);
  if (kind.use === 'sleep') return kind.w >= 3 ? 2 : 1;
  if (kind.use !== 'sit') return 0;
  if (!kind.side && kind.w >= 2) return 1;
  if (kind.w >= 4) return 3;
  if (kind.w >= 3) return 2;
  return Math.max(1, kind.w);
}

export type SlotAnchor = { u: number; v: number };

/** Sit point in the placed footprint (0–1). Transforms down-facing catalog anchors with `facing`. */
export function slotAnchor(place: FurniturePlace, slot: number, slots = occupantSlots(place)): SlotAnchor {
  const kind = furnitureKind(place.item);
  const facing = place.facing ?? 'down';
  const custom = kind.slotAnchors;
  if (custom && custom.length === slots) {
    const local = custom[Math.max(0, Math.min(slots - 1, slot))];
    return faceAnchor(local, facing);
  }
  const t = (slot + 0.5) / Math.max(1, slots);
  // One-person seats (chair, stool, armchair): the pan is inside the tile.
  // Mapping "front" to v=0 when facing up puts feet on the desk to the north;
  // the doll draws upward from the feet, so they look seated on the table.
  if (kind.use === 'sit' && slots === 1) return { u: 0.5, v: 1 };
  if (facing === 'down') return { u: t, v: 1 };
  if (facing === 'up') return { u: 1 - t, v: 0 };
  if (facing === 'right') return { u: 1, v: t };
  return { u: 0, v: 1 - t };
}

function faceAnchor(anchor: SlotAnchor, facing: FurnitureFacing): SlotAnchor {
  if (facing === 'down') return anchor;
  if (facing === 'up') return { u: 1 - anchor.u, v: 1 - anchor.v };
  if (facing === 'right') return { u: 1 - anchor.v, v: anchor.u };
  return { u: anchor.v, v: 1 - anchor.u };
}

export function slotWorld(place: FurniturePlace, slot: number, slots = occupantSlots(place)): { x: number; y: number } {
  const size = placedSize(place);
  const anchor = slotAnchor(place, slot, slots);
  return {
    x: (place.col + anchor.u * size.w) * TILE_SIZE,
    y: (place.row + anchor.v * size.h) * TILE_SIZE,
  };
}

export function placeWorldRect(place: FurniturePlace): { x: number; y: number; w: number; h: number } {
  const size = placedSize(place);
  return {
    x: place.col * TILE_SIZE,
    y: place.row * TILE_SIZE,
    w: size.w * TILE_SIZE,
    h: size.h * TILE_SIZE,
  };
}

export function footprintCells(place: FurniturePlace): Array<{ col: number; row: number }> {
  const size = placedSize(place);
  const cells: Array<{ col: number; row: number }> = [];
  for (let dr = 0; dr < size.h; dr += 1) {
    for (let dc = 0; dc < size.w; dc += 1) {
      cells.push({ col: place.col + dc, row: place.row + dr });
    }
  }
  return cells;
}

/** Front apron/legs drawn south of the bbox. */
export function dropTiles(place: FurniturePlace): number {
  const slice = SLICE_BY_KEY[spriteFor(place).key];
  if (!slice?.drop) return 0;
  return Math.max(1, Math.ceil((slice.drop * TILESET_SCALE) / TILE_SIZE));
}

/** Tiles the player cannot enter (footprint + front drop). Chairs may still sit in the drop. */
export function collisionCells(place: FurniturePlace): Array<{ col: number; row: number }> {
  const cells = footprintCells(place);
  const drop = dropTiles(place);
  if (!drop) return cells;
  const size = placedSize(place);
  for (let dr = 0; dr < drop; dr += 1) {
    for (let dc = 0; dc < size.w; dc += 1) {
      cells.push({ col: place.col + dc, row: place.row + size.h + dr });
    }
  }
  return cells;
}

/** Bottom-center of the footprint — sprite origin (0.5, 1). Wall pieces sit on the wallpaper, slightly off the floor line. */
export function furnitureOrigin(place: FurniturePlace): { x: number; y: number } {
  const size = placedSize(place);
  return {
    x: place.col * TILE_SIZE + (size.w * TILE_SIZE) / 2,
    y: (place.row + size.h) * TILE_SIZE + (hangsOnWall(place) ? -6 : 0),
  };
}

export function spriteFor(place: FurniturePlace): { key: string; flipX: boolean } {
  const kind = furnitureKind(place.item);
  const facing = place.facing ?? 'down';
  const sprites = kind.sprites;
  if (facing === 'down') return { key: sprites.down, flipX: false };
  if (facing === 'up') return { key: sprites.up ?? sprites.down, flipX: false };
  if (facing === 'right') return { key: sprites.right ?? sprites.down, flipX: false };
  return { key: sprites.right ?? sprites.down, flipX: true };
}

export type PlaceOpts = {
  skip?: FurniturePlace;
  occupied?: Array<{ col: number; row: number }>;
  /** Wallpaper tiles (`role === 'back'`). Required to hang wall pieces. */
  wall?: boolean[][];
};

export function canPlace(
  floor: boolean[][],
  places: FurniturePlace[],
  draft: FurniturePlace,
  opts: PlaceOpts = {},
): boolean {
  const kind = CATALOG[draft.item];
  if (!kind) return false;
  const hang = hangsOnWall(kind);
  const support = hang ? opts.wall : floor;
  if (!support) return false;
  const cells = footprintCells(draft);
  for (const cell of cells) {
    if (cell.row < 0 || cell.col < 0 || cell.row >= support.length || cell.col >= support[0].length) {
      return false;
    }
    if (!support[cell.row][cell.col]) return false;
  }
  const { skip, occupied } = opts;
  if (!hang && kind.collide && occupied) {
    const skipKeys = skip
      ? new Set(footprintCells(skip).map((cell) => `${cell.col},${cell.row}`))
      : null;
    for (const cell of cells) {
      const key = `${cell.col},${cell.row}`;
      if (skipKeys?.has(key)) continue;
      if (occupied.some((tile) => tile.col === cell.col && tile.row === cell.row)) return false;
    }
  }
  for (const other of places) {
    if (other === skip) continue;
    const otherHang = hangsOnWall(other.item);
    if (hang !== otherHang) continue;
    if (hang) {
      if (overlaps(draft, other)) return false;
      continue;
    }
    if (kind.layer === 'floor' && furnitureKind(other.item).layer === 'floor') {
      if (overlaps(draft, other)) return false;
      continue;
    }
    if (kind.collide && furnitureKind(other.item).collide && overlaps(draft, other)) return false;
  }
  return true;
}

function overlaps(a: FurniturePlace, b: FurniturePlace): boolean {
  const left = new Set(footprintCells(a).map((cell) => `${cell.col},${cell.row}`));
  return footprintCells(b).some((cell) => left.has(`${cell.col},${cell.row}`));
}

export function onWallTiles(place: FurniturePlace, wall: boolean[][]): boolean {
  return footprintCells(place).every((cell) => Boolean(wall[cell.row]?.[cell.col]));
}

/** If the pointer is on the floor, hang the piece on the wallpaper north of that column. */
export function snapWallPlace(place: FurniturePlace, wall: boolean[][]): FurniturePlace {
  if (!hangsOnWall(place) || onWallTiles(place, wall)) return place;
  for (let dy = 1; dy <= WALLPAPER_TILES + 3; dy += 1) {
    const lifted = { ...place, row: place.row - dy };
    if (onWallTiles(lifted, wall)) return lifted;
  }
  return place;
}

export function liftWallHangings(places: FurniturePlace[], wall: boolean[][]): FurniturePlace[] {
  return places.map((place) => snapWallPlace(place, wall));
}

export function furnitureAt(places: FurniturePlace[], col: number, row: number): FurniturePlace | null {
  for (let i = places.length - 1; i >= 0; i -= 1) {
    const place = places[i];
    if (hitCells(place).some((cell) => cell.col === col && cell.row === row)) return place;
  }
  return null;
}

/** Footprint plus the wallpaper tiles the sprite covers, so clicking a painting still selects it. */
function hitCells(place: FurniturePlace): Array<{ col: number; row: number }> {
  const cells = footprintCells(place);
  if (!hangsOnWall(place)) return cells;
  const size = placedSize(place);
  const { key } = spriteFor(place);
  const slice = SLICE_BY_KEY[key];
  const spriteTiles = slice ? Math.max(1, Math.ceil((slice.h * TILESET_SCALE) / TILE_SIZE)) : size.h;
  const extra = Math.max(0, spriteTiles - size.h);
  const seen = new Set(cells.map((cell) => `${cell.col},${cell.row}`));
  for (let dr = 1; dr <= extra; dr += 1) {
    for (let dc = 0; dc < size.w; dc += 1) {
      const cell = { col: place.col + dc, row: place.row + size.h - 1 - dr };
      const keyCell = `${cell.col},${cell.row}`;
      if (seen.has(keyCell)) continue;
      seen.add(keyCell);
      cells.push(cell);
    }
  }
  return cells;
}

export function blockWalkable(walkable: boolean[][], places: FurniturePlace[]): void {
  for (const place of places) {
    if (!furnitureKind(place.item).collide) continue;
    for (const cell of collisionCells(place)) {
      if (cell.row >= 0 && cell.col >= 0 && cell.row < walkable.length && cell.col < walkable[0].length) {
        walkable[cell.row][cell.col] = false;
      }
    }
  }
}

export function drawFurniture(scene: Phaser.Scene, places: FurniturePlace[]): Phaser.GameObjects.Image[] {
  const order: Record<FurnitureLayer, number> = { floor: 0, wall: 1, object: 2 };
  const drawn = [...places].sort((a, b) => {
    const ka = furnitureKind(a.item);
    const kb = furnitureKind(b.item);
    if (ka.layer !== kb.layer) return order[ka.layer] - order[kb.layer];
    const sa = placedSize(a);
    const sb = placedSize(b);
    return a.row + sa.h - (b.row + sb.h) || a.col - b.col;
  });

  const images: Phaser.GameObjects.Image[] = [];
  for (const place of drawn) {
    const kind = furnitureKind(place.item);
    const { x, y } = furnitureOrigin(place);
    const { key, flipX } = spriteFor(place);
    const origin = spriteAnchor(place, key);
    const depth = kind.layer === 'floor' ? 1 : kind.layer === 'wall' ? 4 : y;
    images.push(
      scene.add
        .image(x, y, key)
        .setOrigin(origin.x, origin.y)
        .setFlipX(flipX)
        .setDepth(depth),
    );
    if (kind.use === 'sleep') {
      images.push(drawBedCovers(scene, key, x, y, origin, flipX));
    }
  }
  return images;
}

/** Source Y of the blanket fold on a 64px-tall bed sprite (below the pillows). */
const BED_COVER_SRC_Y = 28;
/** Just above a sleeper, still behind anyone standing south of the bed. */
const BED_COVER_DEPTH = 8;

function drawBedCovers(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  origin: { x: number; y: number },
  flipX: boolean,
): Phaser.GameObjects.Image {
  return scene.add
    .image(x, y, bedCoversKey(scene, key))
    .setOrigin(origin.x, origin.y)
    .setFlipX(flipX)
    .setDepth(y + BED_COVER_DEPTH);
}

function bedCoversKey(scene: Phaser.Scene, key: string): string {
  const coverKey = `${key}-covers`;
  if (scene.textures.exists(coverKey)) return coverKey;

  const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement | HTMLImageElement;
  const cropY = Math.round(src.height * (BED_COVER_SRC_Y / 64));
  const width = src.width;
  const height = src.height - cropY;
  const texture = scene.textures.createCanvas(coverKey, width, height);
  if (!texture) throw new Error(`Could not slice covers for ${key}`);
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, cropY, width, height, 0, 0, width, height);
  texture.refresh();
  return coverKey;
}

export function desk(col: number, row: number): FurniturePlace[] {
  const table: FurniturePlace = { item: 'oak-table', col, row };
  const kind = furnitureKind('oak-table');
  const mid = col + Math.floor((kind.w - 1) / 2);
  return [
    table,
    { item: 'chair', col: mid, row: row + kind.h + dropTiles(table), facing: 'up' },
  ];
}

export function tableSet(col: number, row: number): FurniturePlace[] {
  const kind = CATALOG.table;
  const mid = col + Math.floor((kind.w - 1) / 2);
  return [
    { item: 'table', col, row },
    { item: 'chair', col: mid, row: row - 1, facing: 'down' },
    { item: 'chair', col: col - 1, row, facing: 'right' },
    { item: 'chair', col: col + kind.w, row, facing: 'left' },
    { item: 'chair', col: mid, row: row + kind.h, facing: 'up' },
  ];
}
