export const TILE_SIZE = 32;
export const TILESET_SCALE = 2;
/** 16×48 wallpaper covers this many collision tiles above the floor line. */
export const WALLPAPER_TILES = 3;

export const Tile = {
  Wood: 0,
  Wall: 11,
  Void: 12,
} as const;

export type TileId = (typeof Tile)[keyof typeof Tile];

export const SOLID_TILES: TileId[] = [Tile.Wall, Tile.Void];

export function isWalkable(tile: TileId): boolean {
  return tile === Tile.Wood;
}
