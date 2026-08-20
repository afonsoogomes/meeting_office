import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import { isActiveSession, isPlayerRole, isPlayerStatus, isSessionStatus } from '../../../shared/game-session';
import type { GameStore, StoredPlayer, StoredSession } from './game-store';

@Injectable()
export class GamesRepository implements GameStore {
  private readonly db: Database.Database;
  private readonly selectActive: Database.Statement;
  private readonly selectById: Database.Statement;
  private readonly selectByGuest: Database.Statement;
  private readonly upsertSession: Database.Statement;
  private readonly deletePlayers: Database.Statement;
  private readonly insertPlayer: Database.Statement;
  private readonly selectPlayers: Database.Statement;

  constructor() {
    const dbPath = resolveDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        office_slug TEXT NOT NULL,
        game_id TEXT NOT NULL,
        game_name TEXT NOT NULL,
        platform TEXT NOT NULL,
        status TEXT NOT NULL,
        host_guest_id TEXT NOT NULL,
        max_players INTEGER NOT NULL,
        netplay_room_id TEXT,
        netplay_password TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_game_sessions_office_status
        ON game_sessions(office_slug, status);
      CREATE TABLE IF NOT EXISTS game_session_players (
        session_id TEXT NOT NULL,
        guest_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'player',
        player_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        ready_at INTEGER,
        PRIMARY KEY (session_id, guest_id),
        FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_game_session_players_guest
        ON game_session_players(guest_id);
    `);
    this.ensurePlayerRoleColumn();

    this.selectActive = this.db.prepare(
      `SELECT * FROM game_sessions
       WHERE office_slug = ? AND status IN ('waiting','ready','starting','playing')
       ORDER BY created_at DESC`,
    );
    this.selectById = this.db.prepare('SELECT * FROM game_sessions WHERE id = ?');
    this.selectByGuest = this.db.prepare(
      `SELECT s.* FROM game_sessions s
       JOIN game_session_players p ON p.session_id = s.id
       WHERE p.guest_id = ? AND s.status IN ('waiting','ready','starting','playing')
       ORDER BY s.created_at DESC LIMIT 1`,
    );
    this.upsertSession = this.db.prepare(
      `INSERT INTO game_sessions (
        id, office_slug, game_id, game_name, platform, status, host_guest_id,
        max_players, netplay_room_id, netplay_password, created_at, started_at
      ) VALUES (@id, @officeSlug, @gameId, @gameName, @platform, @status, @hostGuestId,
        @maxPlayers, @netplayRoomId, @netplayPassword, @createdAt, @startedAt)
      ON CONFLICT(id) DO UPDATE SET
        office_slug = excluded.office_slug,
        game_id = excluded.game_id,
        game_name = excluded.game_name,
        platform = excluded.platform,
        status = excluded.status,
        host_guest_id = excluded.host_guest_id,
        max_players = excluded.max_players,
        netplay_room_id = excluded.netplay_room_id,
        netplay_password = excluded.netplay_password,
        created_at = excluded.created_at,
        started_at = excluded.started_at`,
    );
    this.deletePlayers = this.db.prepare('DELETE FROM game_session_players WHERE session_id = ?');
    this.insertPlayer = this.db.prepare(
      `INSERT INTO game_session_players (
        session_id, guest_id, name, role, player_number, status, ready_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.selectPlayers = this.db.prepare(
      `SELECT guest_id, name, role, player_number, status, ready_at
       FROM game_session_players
       WHERE session_id = ?
       ORDER BY CASE role WHEN 'player' THEN 0 ELSE 1 END, player_number`,
    );
  }

  listActive(officeSlug: string): StoredSession[] {
    const rows = this.selectActive.all(officeSlug) as SessionRow[];
    return rows.flatMap((row) => {
      const session = this.hydrate(row);
      return session ? [session] : [];
    });
  }

  loadById(id: string): StoredSession | null {
    return this.hydrate(this.selectById.get(id) as SessionRow | undefined);
  }

  findActiveForGuest(guestId: string): StoredSession | null {
    return this.hydrate(this.selectByGuest.get(guestId) as SessionRow | undefined);
  }

  save(session: StoredSession): void {
    const write = this.db.transaction(() => {
      this.upsertSession.run({
        id: session.id,
        officeSlug: session.officeSlug,
        gameId: session.gameId,
        gameName: session.gameName,
        platform: session.platform,
        status: session.status,
        hostGuestId: session.hostGuestId,
        maxPlayers: session.maxPlayers,
        netplayRoomId: session.netplayRoomId,
        netplayPassword: session.netplayPassword,
        createdAt: session.createdAt,
        startedAt: session.startedAt,
      });
      this.deletePlayers.run(session.id);
      for (const player of session.players) {
        this.insertPlayer.run(
          session.id,
          player.guestId,
          player.name,
          player.role,
          player.playerNumber,
          player.status,
          player.readyAt,
        );
      }
    });
    write();
  }

  private ensurePlayerRoleColumn(): void {
    const cols = this.db.pragma('table_info(game_session_players)') as Array<{ name: string }>;
    if (cols.some((col) => col.name === 'role')) return;
    this.db.exec(`ALTER TABLE game_session_players ADD COLUMN role TEXT NOT NULL DEFAULT 'player'`);
  }

  private hydrate(row: SessionRow | undefined): StoredSession | null {
    if (!row || !isSessionStatus(row.status)) return null;
    const players = (this.selectPlayers.all(row.id) as PlayerRow[]).flatMap((item) => {
      if (!isPlayerStatus(item.status)) return [];
      const player: StoredPlayer = {
        guestId: item.guest_id,
        name: item.name,
        role: isPlayerRole(item.role) ? item.role : 'player',
        playerNumber: item.player_number,
        status: item.status,
        readyAt: item.ready_at,
      };
      return [player];
    });
    if (!isActiveSession(row.status) && players.length === 0 && row.status !== 'cancelled' && row.status !== 'finished') {
      return null;
    }
    return {
      id: row.id,
      officeSlug: row.office_slug,
      gameId: row.game_id,
      gameName: row.game_name,
      platform: row.platform === 'snes' ? 'snes' : 'snes',
      status: row.status,
      hostGuestId: row.host_guest_id,
      maxPlayers: row.max_players,
      netplayRoomId: row.netplay_room_id,
      netplayPassword: row.netplay_password,
      createdAt: row.created_at,
      startedAt: row.started_at,
      players,
    };
  }
}

type SessionRow = {
  id: string;
  office_slug: string;
  game_id: string;
  game_name: string;
  platform: string;
  status: string;
  host_guest_id: string;
  max_players: number;
  netplay_room_id: string | null;
  netplay_password: string;
  created_at: number;
  started_at: number | null;
};

type PlayerRow = {
  guest_id: string;
  name: string;
  role?: string | null;
  player_number: number;
  status: string;
  ready_at: number | null;
};

function resolveDbPath(): string {
  const fromEnv = process.env.OFFICE_DB_PATH;
  if (fromEnv && fromEnv.length > 0) {
    return isAbsolute(fromEnv) ? fromEnv : join(process.cwd(), fromEnv);
  }
  return join(process.cwd(), 'data', 'office.db');
}
