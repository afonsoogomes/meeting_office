export const SESSION_STATUSES = [
  'waiting',
  'ready',
  'starting',
  'playing',
  'finished',
  'cancelled',
] as const;

export const PLAYER_STATUSES = ['waiting', 'ready', 'connected', 'disconnected', 'finished'] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];
export type GamePlatform = 'snes';

export const PLAYER_ROLES = ['player', 'spectator'] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

/** Extra EmulatorJS Netplay seats so watchers can join after seated players. */
export const MAX_GAME_SPECTATORS = 8;

export type GameDefinition = {
  id: string;
  name: string;
  platform: GamePlatform;
  core: string;
  romFile: string;
  minPlayers?: number;
  maxPlayers: number;
  ejsGameId: number;
};

export type GameCatalogItem = {
  id: string;
  name: string;
  platform: GamePlatform;
  core: string;
  minPlayers: number;
  maxPlayers: number;
  enabled: boolean;
};

export type GameSessionPlayerView = {
  guestId: string;
  name: string;
  role: PlayerRole;
  playerNumber: number;
  status: PlayerStatus;
  readyAt: number | null;
};

export type GameSessionView = {
  id: string;
  gameId: string;
  gameName: string;
  platform: GamePlatform;
  status: SessionStatus;
  hostGuestId: string;
  minPlayers: number;
  maxPlayers: number;
  createdAt: number;
  startedAt: number | null;
  netplayRoomId: string | null;
  watchReady: boolean;
  players: GameSessionPlayerView[];
};

export type EmulatorSessionConfig = {
  sessionId: string;
  gameId: string;
  gameName: string;
  platform: GamePlatform;
  core: string;
  romUrl: string;
  ejsGameId: number;
  ejsCdn: string;
  netplayServer: string;
  /** Host port published by docker compose when `netplayServer` is empty. */
  netplayPort: number;
  iceServers: GameIceServer[];
  role: 'host' | 'guest' | 'spectator';
  playerNumber: number;
  playerCount: number;
  playerName: string;
  netplayRoomId: string | null;
  netplayPassword: string;
  netplayRoomName: string;
};

export type GameIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export const ACTIVE_SESSION_STATUSES: SessionStatus[] = ['waiting', 'ready', 'starting', 'playing'];

export function isActiveSession(status: SessionStatus): boolean {
  return ACTIVE_SESSION_STATUSES.includes(status);
}

export function isSessionStatus(value: unknown): value is SessionStatus {
  return typeof value === 'string' && (SESSION_STATUSES as readonly string[]).includes(value);
}

export function isPlayerStatus(value: unknown): value is PlayerStatus {
  return typeof value === 'string' && (PLAYER_STATUSES as readonly string[]).includes(value);
}

export function isPlayerRole(value: unknown): value is PlayerRole {
  return value === 'player' || value === 'spectator';
}

export function seatedPlayers<T extends { role?: PlayerRole }>(players: T[]): T[] {
  return players.filter((player) => (player.role ?? 'player') === 'player');
}

export function spectatorMembers<T extends { role?: PlayerRole }>(players: T[]): T[] {
  return players.filter((player) => player.role === 'spectator');
}

export function isWatchReady(session: {
  status: SessionStatus;
  netplayRoomId: string | null;
  players: Array<{ role?: PlayerRole; status: PlayerStatus }>;
}): boolean {
  if (session.status !== 'playing' || !session.netplayRoomId) return false;
  const live = seatedPlayers(session.players).filter(
    (player) => player.status !== 'disconnected' && player.status !== 'finished',
  );
  return live.length > 0 && live.every((player) => player.status === 'connected');
}
