import type { PlayerRole, PlayerStatus, SessionStatus } from '../../../shared/game-session';

export type StoredPlayer = {
  guestId: string;
  name: string;
  role: PlayerRole;
  playerNumber: number;
  status: PlayerStatus;
  readyAt: number | null;
};

export type StoredSession = {
  id: string;
  officeSlug: string;
  gameId: string;
  gameName: string;
  platform: 'snes';
  status: SessionStatus;
  hostGuestId: string;
  maxPlayers: number;
  netplayRoomId: string | null;
  netplayPassword: string;
  createdAt: number;
  startedAt: number | null;
  players: StoredPlayer[];
};

export type GameStore = {
  listActive(officeSlug: string): StoredSession[];
  loadById(id: string): StoredSession | null;
  findActiveForGuest(guestId: string): StoredSession | null;
  save(session: StoredSession): void;
};
