import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { DEFAULT_OFFICE_SLUG } from '../../../shared/office';
import { GAME_CATALOG, gameDefinition } from '../../../shared/game-catalog';
import {
  isActiveSession,
  isWatchReady,
  MAX_GAME_SPECTATORS,
  seatedPlayers,
  spectatorMembers,
  type EmulatorSessionConfig,
  type GameCatalogItem,
  type GameIceServer,
  type GameSessionView,
} from '../../../shared/game-session';
import { PresenceService } from '../presence/presence.service';
import { GamesRepository } from './games.repository';
import type { GameStore, StoredPlayer, StoredSession } from './game-store';

export type GameFailure = {
  ok: false;
  status: number;
  error: string;
  message: string;
};

export type GameOk<T> = { ok: true; data: T };
export type GameResult<T> = GameOk<T> | GameFailure;

const DEFAULT_ICE: GameIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const DEFAULT_EJS_CDN = 'https://cdn.emulatorjs.org/latest/data/';
const NETPLAY_ROOM_RE = /^[A-Za-z0-9_-]{4,80}$/;

@Injectable()
export class GamesService {
  private readonly romDir: string;

  constructor(
    @Inject(GamesRepository) private readonly store: GameStore,
    @Optional() @Inject(forwardRef(() => PresenceService)) private readonly presence?: PresenceService | null,
  ) {
    this.romDir = process.env.GAMES_ROM_DIR?.trim() || join(process.cwd(), 'data', 'roms');
  }

  listCatalog(): GameCatalogItem[] {
    return GAME_CATALOG.map((game) => ({
      id: game.id,
      name: game.name,
      platform: game.platform,
      core: game.core,
      minPlayers: game.minPlayers ?? 1,
      maxPlayers: game.maxPlayers,
      enabled: this.romExists(game.romFile),
    }));
  }

  list(officeSlug = DEFAULT_OFFICE_SLUG): GameSessionView[] {
    return this.store.listActive(officeSlug).flatMap((session) => {
      const view = this.toView(session);
      return view ? [view] : [];
    });
  }

  current(officeSlug = DEFAULT_OFFICE_SLUG): GameSessionView | null {
    return this.list(officeSlug)[0] ?? null;
  }

  viewOfOffice(officeSlug = DEFAULT_OFFICE_SLUG): GameSessionView[] {
    return this.list(officeSlug);
  }

  create(input: { guestId: string; name: string; gameId: string; officeSlug?: string }): GameResult<GameSessionView> {
    const officeSlug = input.officeSlug ?? DEFAULT_OFFICE_SLUG;
    const game = gameDefinition(input.gameId);
    if (!game) return fail(404, 'GAME_UNKNOWN', 'Jogo não existe no catálogo.');
    if (!this.romExists(game.romFile)) {
      return fail(409, 'GAME_DISABLED', 'Esse jogo não tem ROM no servidor. Coloque o ficheiro em data/roms/.');
    }

    const mine = this.store.findActiveForGuest(input.guestId);
    if (mine) return ok(this.toView(mine)!);

    const now = Date.now();
    const session: StoredSession = {
      id: randomUUID(),
      officeSlug,
      gameId: game.id,
      gameName: game.name,
      platform: game.platform,
      status: 'waiting',
      hostGuestId: input.guestId,
      maxPlayers: game.maxPlayers,
      netplayRoomId: null,
      netplayPassword: randomBytes(12).toString('base64url'),
      createdAt: now,
      startedAt: null,
      players: [
        {
          guestId: input.guestId,
          name: input.name,
          role: 'player',
          playerNumber: 1,
          status: 'waiting',
          readyAt: null,
        },
      ],
    };
    return this.persist(session);
  }

  join(input: { sessionId: string; guestId: string; name: string }): GameResult<GameSessionView> {
    const occupied = this.otherActiveSession(input.guestId, input.sessionId);
    if (occupied) return fail(409, 'ALREADY_IN_SESSION', 'Sai da outra sala antes de entrar nesta.');

    const session = this.store.loadById(input.sessionId);
    if (!session || !isActiveSession(session.status)) {
      return fail(404, 'SESSION_UNKNOWN', 'Essa sessão não existe ou já acabou.');
    }

    const existing = member(session, input.guestId);
    if (existing) {
      existing.name = input.name;
      if (existing.role === 'spectator') {
        return this.promoteSpectator(session, existing);
      }
      if (existing.status === 'disconnected' && (session.status === 'starting' || session.status === 'playing')) {
        existing.status = 'connected';
      }
      return this.persist(session);
    }

    if (session.status === 'starting' || session.status === 'playing') {
      return fail(409, 'SESSION_LOCKED', 'A partida já começou. Podes assistir.');
    }
    if (seatedPlayers(session.players).length >= session.maxPlayers) {
      return fail(409, 'SESSION_FULL', 'A sessão está cheia. Podes assistir.');
    }

    session.players.push({
      guestId: input.guestId,
      name: input.name,
      role: 'player',
      playerNumber: nextSeat(session),
      status: 'waiting',
      readyAt: null,
    });
    return this.persist(session);
  }

  watch(input: { sessionId: string; guestId: string; name: string }): GameResult<GameSessionView> {
    const occupied = this.otherActiveSession(input.guestId, input.sessionId);
    if (occupied) return fail(409, 'ALREADY_IN_SESSION', 'Sai da outra sala antes de assistir nesta.');

    const session = this.store.loadById(input.sessionId);
    if (!session || !isActiveSession(session.status)) {
      return fail(404, 'SESSION_UNKNOWN', 'Essa sessão não existe ou já acabou.');
    }

    const existing = member(session, input.guestId);
    if (existing) {
      existing.name = input.name;
      return this.persist(session);
    }

    if (spectatorMembers(session.players).length >= MAX_GAME_SPECTATORS) {
      return fail(409, 'WATCH_FULL', 'Já há demasiada gente a assistir.');
    }

    session.players.push({
      guestId: input.guestId,
      name: input.name,
      role: 'spectator',
      playerNumber: 0,
      status: session.status === 'playing' || session.status === 'starting' ? 'connected' : 'waiting',
      readyAt: null,
    });
    return this.persist(session);
  }

  ready(input: { sessionId: string; guestId: string }): GameResult<GameSessionView> {
    const session = this.requireMember(input.sessionId, input.guestId);
    if (!session.ok) return session;
    const player = member(session.data, input.guestId)!;
    if (player.role === 'spectator') {
      return fail(409, 'SPECTATOR_NO_READY', 'Quem assiste não marca pronto.');
    }
    if (session.data.status !== 'waiting' && session.data.status !== 'ready') {
      return fail(409, 'NOT_WAITING', 'Já não dá para marcar pronto.');
    }
    player.status = 'ready';
    player.readyAt = Date.now();
    this.maybeStart(session.data);
    return this.persist(session.data);
  }

  start(input: { sessionId: string; guestId: string }): GameResult<GameSessionView> {
    const session = this.requireHost(input.sessionId, input.guestId);
    if (!session.ok) return session;
    if (session.data.status === 'starting' || session.data.status === 'playing') {
      return this.persist(session.data);
    }
    if (session.data.status !== 'waiting' && session.data.status !== 'ready') {
      return fail(409, 'NOT_READY', 'A sessão não pode começar.');
    }
    const host = member(session.data, input.guestId);
    if (host && host.role === 'player' && host.status !== 'ready') {
      host.status = 'ready';
      host.readyAt = Date.now();
    }
    if (!this.maybeStart(session.data, true)) {
      return fail(409, 'NOT_READY', 'Faltam jogadores prontos.');
    }
    return this.persist(session.data);
  }

  reportNetplay(input: { sessionId: string; guestId: string; roomId: string }): GameResult<GameSessionView> {
    if (!NETPLAY_ROOM_RE.test(input.roomId)) {
      return fail(400, 'ROOM_INVALID', 'Id da sala Netplay inválido.');
    }
    const session = this.requireHost(input.sessionId, input.guestId);
    if (!session.ok) return session;
    if (session.data.status !== 'starting' && session.data.status !== 'playing') {
      return fail(409, 'NOT_STARTING', 'A sessão ainda não está a arrancar.');
    }
    session.data.netplayRoomId = input.roomId;
    session.data.status = 'playing';
    const host = member(session.data, input.guestId);
    if (host) host.status = 'connected';
    return this.persist(session.data);
  }

  connected(input: { sessionId: string; guestId: string }): GameResult<GameSessionView> {
    const session = this.requireMember(input.sessionId, input.guestId);
    if (!session.ok) return session;
    if (session.data.status !== 'starting' && session.data.status !== 'playing') {
      return fail(409, 'NOT_STARTING', 'A sessão ainda não está a arrancar.');
    }
    const player = member(session.data, input.guestId)!;
    player.status = 'connected';
    return this.persist(session.data);
  }

  leave(input: { sessionId: string; guestId: string }): GameResult<GameSessionView | null> {
    const loaded = this.store.loadById(input.sessionId);
    if (!loaded) return fail(404, 'SESSION_UNKNOWN', 'Essa sessão não existe ou já acabou.');
    if (!loaded.players.some((player) => player.guestId === input.guestId)) {
      return ok(this.toView(loaded));
    }
    return this.removeOrDisconnect(loaded, input.guestId);
  }

  cancel(input: { sessionId: string; guestId: string }): GameResult<GameSessionView> {
    const session = this.requireHost(input.sessionId, input.guestId);
    if (!session.ok) return session;
    if (session.data.status === 'playing') {
      return fail(409, 'ALREADY_PLAYING', 'Use terminar para encerrar a partida.');
    }
    session.data.status = 'cancelled';
    for (const player of session.data.players) player.status = 'finished';
    return this.persist(session.data);
  }

  finish(input: { sessionId: string; guestId: string }): GameResult<GameSessionView> {
    const session = this.requireHost(input.sessionId, input.guestId);
    if (!session.ok) return session;
    session.data.status = 'finished';
    session.data.startedAt = session.data.startedAt ?? Date.now();
    for (const player of session.data.players) player.status = 'finished';
    return this.persist(session.data);
  }

  presenceLost(guestId: string): GameSessionView | null {
    const session = this.store.findActiveForGuest(guestId);
    if (!session) return null;
    const result = this.removeOrDisconnect(session, guestId);
    return result.ok ? result.data : this.toView(session);
  }

  playConfig(input: { sessionId: string; guestId: string }): GameResult<EmulatorSessionConfig> {
    const session = this.requireMember(input.sessionId, input.guestId);
    if (!session.ok) return session;
    if (session.data.status !== 'starting' && session.data.status !== 'playing') {
      return fail(409, 'NOT_STARTING', 'Espera que todos fiquem prontos.');
    }
    const game = gameDefinition(session.data.gameId);
    if (!game || !this.romExists(game.romFile)) {
      return fail(409, 'GAME_DISABLED', 'A ROM deste jogo não está no servidor.');
    }
    const player = member(session.data, input.guestId)!;
    if (player.role === 'spectator' && !isWatchReady(session.data)) {
      return fail(409, 'SPECTATE_WAIT', 'Espera os jogadores abrirem o fliperama.');
    }
    const host = player.role === 'player' && player.playerNumber === 1;
    return ok({
      sessionId: session.data.id,
      gameId: game.id,
      gameName: game.name,
      platform: game.platform,
      core: game.core,
      romUrl: `/games/${game.id}/rom?guestId=${encodeURIComponent(input.guestId)}`,
      ejsGameId: game.ejsGameId,
      ejsCdn: process.env.EJS_CDN?.trim() || DEFAULT_EJS_CDN,
      netplayServer: process.env.NETPLAY_PUBLIC_URL?.trim() || '',
      iceServers: parseIceServers(),
      role: player.role === 'spectator' ? 'spectator' : host ? 'host' : 'guest',
      playerNumber: player.playerNumber,
      playerCount: session.data.maxPlayers + MAX_GAME_SPECTATORS,
      playerName: player.name,
      netplayRoomId: session.data.netplayRoomId,
      netplayPassword: session.data.netplayPassword,
      netplayRoomName: `${game.name} · ${session.data.id.slice(0, 8)}`,
    });
  }

  romFileFor(guestId: string, gameId: string): GameResult<{ path: string; name: string }> {
    const session = this.store.findActiveForGuest(guestId);
    if (!session || session.gameId !== gameId) {
      return fail(403, 'ROM_FORBIDDEN', 'Só quem está na sessão pode baixar esta ROM.');
    }
    if (session.status !== 'starting' && session.status !== 'playing') {
      return fail(409, 'NOT_STARTING', 'A ROM só é servida depois do start.');
    }
    const game = gameDefinition(gameId);
    if (!game) return fail(404, 'GAME_UNKNOWN', 'Jogo não existe no catálogo.');
    const path = join(this.romDir, game.romFile);
    if (!existsSync(path)) return fail(404, 'ROM_MISSING', 'Ficheiro da ROM não encontrado.');
    return ok({ path, name: game.romFile.split('/').pop() ?? `${game.id}.sfc` });
  }

  private maybeStart(session: StoredSession, allowPartial = false): boolean {
    const game = gameDefinition(session.gameId);
    const minPlayers = game?.minPlayers ?? 1;
    const seated = seatedPlayers(session.players);
    const allReady = seated.length > 0 && seated.every((player) => player.status === 'ready');
    if (!allReady || seated.length < minPlayers) return false;
    if (!allowPartial && seated.length < session.maxPlayers) return false;
    session.status = 'starting';
    session.startedAt = session.startedAt ?? Date.now();
    return true;
  }

  private promoteSpectator(session: StoredSession, existing: StoredPlayer): GameResult<GameSessionView> {
    if (session.status === 'starting' || session.status === 'playing') {
      return fail(409, 'SESSION_LOCKED', 'A partida já começou. Continua a assistir.');
    }
    if (seatedPlayers(session.players).length >= session.maxPlayers) {
      return fail(409, 'SESSION_FULL', 'A sessão está cheia. Continua a assistir.');
    }
    existing.role = 'player';
    existing.playerNumber = nextSeat(session);
    existing.status = 'waiting';
    existing.readyAt = null;
    return this.persist(session);
  }

  private otherActiveSession(guestId: string, sessionId: string): StoredSession | null {
    const mine = this.store.findActiveForGuest(guestId);
    if (!mine || mine.id === sessionId) return null;
    return mine;
  }

  private removeOrDisconnect(
    session: StoredSession,
    guestId: string,
  ): GameResult<GameSessionView | null> {
    const leaving = member(session, guestId);
    if (leaving?.role === 'spectator') {
      session.players = session.players.filter((player) => player.guestId !== guestId);
      if (seatedPlayers(session.players).length === 0) {
        session.status = 'cancelled';
        for (const player of session.players) player.status = 'finished';
      }
      return this.persist(session);
    }

    const isHost = session.hostGuestId === guestId;
    if (session.status === 'starting' || session.status === 'playing') {
      if (isHost) {
        session.status = 'finished';
        for (const player of session.players) player.status = 'finished';
        return this.persist(session);
      }
      const player = member(session, guestId);
      if (player) player.status = 'disconnected';
      return this.persist(session);
    }

    session.players = session.players.filter((player) => player.guestId !== guestId);
    if (seatedPlayers(session.players).length === 0) {
      session.status = 'cancelled';
      for (const player of session.players) player.status = 'finished';
      return this.persist(session);
    }
    recompact(session);
    for (const player of seatedPlayers(session.players)) {
      if (player.status === 'ready') continue;
      player.status = 'waiting';
      player.readyAt = null;
    }
    session.status = 'waiting';
    return this.persist(session);
  }

  private requireMember(sessionId: string, guestId: string): GameResult<StoredSession> {
    const session = this.store.loadById(sessionId);
    if (!session || !isActiveSession(session.status)) {
      return fail(404, 'SESSION_UNKNOWN', 'Essa sessão não existe ou já acabou.');
    }
    if (!member(session, guestId)) {
      return fail(403, 'NOT_IN_SESSION', 'Você não está nesta sessão.');
    }
    return ok(session);
  }

  private requireHost(sessionId: string, guestId: string): GameResult<StoredSession> {
    const session = this.requireMember(sessionId, guestId);
    if (!session.ok) return session;
    if (session.data.hostGuestId !== guestId) {
      return fail(403, 'NOT_HOST', 'Só o Player 1 pode fazer isso.');
    }
    return session;
  }

  private persist(session: StoredSession): GameResult<GameSessionView> {
    this.store.save(session);
    const view = this.toView(session)!;
    this.presence?.broadcastAll({ type: 'game', sessions: this.list(session.officeSlug) });
    return ok(view);
  }

  private toView(session: StoredSession | null): GameSessionView | null {
    if (!session) return null;
    const game = gameDefinition(session.gameId);
    const minPlayers = game?.minPlayers ?? 1;
    const players = session.players.slice().sort((a, b) => {
      if (a.role !== b.role) return a.role === 'player' ? -1 : 1;
      return a.playerNumber - b.playerNumber;
    });
    return {
      id: session.id,
      gameId: session.gameId,
      gameName: session.gameName,
      platform: session.platform,
      status: session.status,
      hostGuestId: session.hostGuestId,
      minPlayers,
      maxPlayers: session.maxPlayers,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      netplayRoomId: session.netplayRoomId,
      watchReady: isWatchReady(session),
      players: players.map((player) => ({
        guestId: player.guestId,
        name: player.name,
        role: player.role,
        playerNumber: player.playerNumber,
        status: player.status,
        readyAt: player.readyAt,
      })),
    };
  }

  private romExists(romFile: string): boolean {
    return existsSync(join(this.romDir, romFile));
  }
}

function ok<T>(data: T): GameOk<T> {
  return { ok: true, data };
}

function fail(status: number, error: string, message: string): GameFailure {
  return { ok: false, status, error, message };
}

function member(session: StoredSession, guestId: string): StoredPlayer | undefined {
  return session.players.find((player) => player.guestId === guestId);
}

function nextSeat(session: StoredSession): number {
  const taken = new Set(seatedPlayers(session.players).map((player) => player.playerNumber));
  for (let seat = 1; seat <= session.maxPlayers; seat += 1) {
    if (!taken.has(seat)) return seat;
  }
  return seatedPlayers(session.players).length + 1;
}

function recompact(session: StoredSession): void {
  const seated = seatedPlayers(session.players).sort((a, b) => a.playerNumber - b.playerNumber);
  seated.forEach((player, index) => {
    player.playerNumber = index + 1;
  });
  session.hostGuestId = seated[0]?.guestId ?? session.hostGuestId;
}

function parseIceServers(): GameIceServer[] {
  const raw = process.env.NETPLAY_ICE_JSON?.trim();
  if (!raw) return DEFAULT_ICE;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_ICE;
    const servers: GameIceServer[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || !('urls' in item)) continue;
      const urls = (item as GameIceServer).urls;
      if (typeof urls !== 'string' && !Array.isArray(urls)) continue;
      const server: GameIceServer = { urls };
      if (typeof (item as GameIceServer).username === 'string') server.username = (item as GameIceServer).username;
      if (typeof (item as GameIceServer).credential === 'string') {
        server.credential = (item as GameIceServer).credential;
      }
      servers.push(server);
    }
    return servers.length > 0 ? servers : DEFAULT_ICE;
  } catch {
    return DEFAULT_ICE;
  }
}
