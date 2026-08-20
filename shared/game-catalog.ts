import type { GameDefinition } from './game-session';

/**
 * SNES titles the office can host. Bytes stay in GAMES_ROM_DIR (see docs/games/NETPLAY.md).
 * A row is only playable when that file exists on disk — nothing commercial is shipped.
 */
export const GAME_CATALOG: GameDefinition[] = [
  {
    id: 'super-bomberman-5',
    name: 'Super Bomberman 5',
    platform: 'snes',
    core: 'snes',
    romFile: 'snes/super-bomberman-5.smc',
    minPlayers: 1,
    maxPlayers: 4,
    ejsGameId: 3,
  },
  {
    id: 'super-mario-kart',
    name: 'Super Mario Kart',
    platform: 'snes',
    core: 'snes',
    romFile: 'snes/super-mario-kart.sfc',
    minPlayers: 1,
    maxPlayers: 2,
    ejsGameId: 1,
  },
  {
    id: 'snes-2p',
    name: 'SNES (2 jogadores)',
    platform: 'snes',
    core: 'snes',
    romFile: 'snes/game.sfc',
    minPlayers: 1,
    maxPlayers: 2,
    ejsGameId: 2,
  },
];

export function gameDefinition(id: string): GameDefinition | null {
  return GAME_CATALOG.find((game) => game.id === id) ?? null;
}
