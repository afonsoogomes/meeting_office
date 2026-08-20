import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { GamesService, type GameResult } from './games.service';
import { MemoryGameStore } from './memory-store';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const E = '55555555-5555-4555-8555-555555555555';
const F = '66666666-6666-4666-8666-666666666666';

const previousRomDir = process.env.GAMES_ROM_DIR;
const previousNetplayPort = process.env.NETPLAY_PORT;

before(() => {
  const romDir = mkdtempSync(join(tmpdir(), 'office-roms-'));
  mkdirSync(join(romDir, 'snes'), { recursive: true });
  writeFileSync(join(romDir, 'snes/super-mario-kart.sfc'), 'fake-rom');
  writeFileSync(join(romDir, 'snes/game.sfc'), 'fake-rom');
  writeFileSync(join(romDir, 'snes/super-bomberman-5.smc'), 'fake-rom');
  process.env.GAMES_ROM_DIR = romDir;
  delete process.env.NETPLAY_PORT;
});

after(() => {
  if (previousRomDir === undefined) delete process.env.GAMES_ROM_DIR;
  else process.env.GAMES_ROM_DIR = previousRomDir;
  if (previousNetplayPort === undefined) delete process.env.NETPLAY_PORT;
  else process.env.NETPLAY_PORT = previousNetplayPort;
});

function service(): GamesService {
  return new GamesService(new MemoryGameStore());
}

function data<T>(result: GameResult<T>): T {
  assert.equal(result.ok, true, result.ok ? '' : `${result.error}: ${result.message}`);
  if (!result.ok) throw new Error('unreachable');
  return result.data;
}

function err<T>(result: GameResult<T>, error: string, status?: number): void {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, error);
  if (status !== undefined) assert.equal(result.status, status);
}

test('create session assigns host as player 1', () => {
  const games = service();
  const session = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  assert.equal(session.status, 'waiting');
  assert.equal(session.hostGuestId, A);
  assert.equal(session.maxPlayers, 2);
  assert.equal(session.minPlayers, 1);
  assert.equal(session.players.length, 1);
  assert.equal(session.players[0].playerNumber, 1);
  assert.equal(session.players[0].role, 'player');
  assert.equal(session.players[0].guestId, A);
  assert.equal(session.players[0].status, 'waiting');
});

test('join assigns the next free player number', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  const session = data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  assert.deepEqual(
    session.players.map((player) => [player.playerNumber, player.name]),
    [
      [1, 'Afonso'],
      [2, 'João'],
    ],
  );
});

test('session full rejects a third player', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  err(games.join({ sessionId: created.id, guestId: C, name: 'Caio' }), 'SESSION_FULL', 409);
});

test('same guest cannot occupy two seats', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  const again = data(games.join({ sessionId: created.id, guestId: A, name: 'Afonso' }));
  assert.equal(again.players.length, 1);
  assert.equal(again.players[0].playerNumber, 1);
});

test('frontend cannot pick player 1 — join always takes the next seat', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  const session = data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  assert.equal(session.players.find((player) => player.guestId === B)?.playerNumber, 2);
  assert.equal(session.hostGuestId, A);
});

test('unknown session cannot be joined', () => {
  const games = service();
  err(
    games.join({ sessionId: '99999999-9999-4999-8999-999999999999', guestId: A, name: 'Afonso' }),
    'SESSION_UNKNOWN',
    404,
  );
});

test('ready then start when the lobby is full', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  const first = data(games.ready({ sessionId: created.id, guestId: A }));
  assert.equal(first.status, 'waiting');
  assert.equal(first.players[0].status, 'ready');
  const second = data(games.ready({ sessionId: created.id, guestId: B }));
  assert.equal(second.status, 'starting');
  assert.ok(second.startedAt);
});

test('start is rejected until everyone is ready', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  data(games.ready({ sessionId: created.id, guestId: A }));
  err(games.start({ sessionId: created.id, guestId: A }), 'NOT_READY', 409);
});

test('bomberman accepts five seats and can start with two ready', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-bomberman-5' }));
  assert.equal(created.maxPlayers, 5);
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  data(games.join({ sessionId: created.id, guestId: C, name: 'Caio' }));
  data(games.join({ sessionId: created.id, guestId: D, name: 'Nina' }));
  const five = data(games.join({ sessionId: created.id, guestId: E, name: 'Rafa' }));
  assert.equal(five.players.filter((player) => player.role === 'player').length, 5);
  err(games.join({ sessionId: created.id, guestId: F, name: 'Lina' }), 'SESSION_FULL', 409);
});

test('host can start bomberman with two of five when both are ready', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-bomberman-5' }));
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  data(games.ready({ sessionId: created.id, guestId: A }));
  const waiting = data(games.ready({ sessionId: created.id, guestId: B }));
  assert.equal(waiting.status, 'waiting');
  const started = data(games.start({ sessionId: created.id, guestId: A }));
  assert.equal(started.status, 'starting');
  assert.equal(started.players.length, 2);
});

test('play config is host for P1 and guest for P2, without trusting the client', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  data(games.ready({ sessionId: created.id, guestId: A }));
  data(games.ready({ sessionId: created.id, guestId: B }));
  const host = data(games.playConfig({ sessionId: created.id, guestId: A }));
  const guest = data(games.playConfig({ sessionId: created.id, guestId: B }));
  assert.equal(host.role, 'host');
  assert.equal(host.playerNumber, 1);
  assert.equal(guest.role, 'guest');
  assert.equal(guest.playerNumber, 2);
  assert.equal(host.netplayPassword, guest.netplayPassword);
  assert.equal(host.netplayRoomId, null);
  assert.equal(host.netplayPort, 3000);
  assert.equal(host.multitap, false);
  err(games.playConfig({ sessionId: created.id, guestId: C }), 'NOT_IN_SESSION', 403);
});

test('bomberman play config enables snes multitap', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-bomberman-5' }));
  data(games.start({ sessionId: created.id, guestId: A }));
  const host = data(games.playConfig({ sessionId: created.id, guestId: A }));
  assert.equal(host.multitap, true);
  assert.ok(host.playerCount >= 5);
});

test('only the host can publish the EmulatorJS room id', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  data(games.ready({ sessionId: created.id, guestId: A }));
  data(games.ready({ sessionId: created.id, guestId: B }));
  err(games.reportNetplay({ sessionId: created.id, guestId: B, roomId: 'room-from-p2' }), 'NOT_HOST', 403);
  const playing = data(games.reportNetplay({ sessionId: created.id, guestId: A, roomId: 'ejs-room-1' }));
  assert.equal(playing.status, 'playing');
  assert.equal(playing.netplayRoomId, 'ejs-room-1');
  const guest = data(games.playConfig({ sessionId: created.id, guestId: B }));
  assert.equal(guest.netplayRoomId, 'ejs-room-1');
});

test('disconnect and reconnect keep the same player number', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  data(games.ready({ sessionId: created.id, guestId: A }));
  data(games.ready({ sessionId: created.id, guestId: B }));
  data(games.reportNetplay({ sessionId: created.id, guestId: A, roomId: 'ejs-room-1' }));
  const left = data(games.leave({ sessionId: created.id, guestId: B }));
  assert.ok(left);
  assert.equal(left.status, 'playing');
  assert.equal(left.players.find((player) => player.guestId === B)?.status, 'disconnected');
  const back = data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  const player = back.players.find((item) => item.guestId === B);
  assert.equal(player?.playerNumber, 2);
  assert.equal(player?.status, 'connected');
});

test('host leaving a live match finishes it', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  data(games.ready({ sessionId: created.id, guestId: A }));
  data(games.ready({ sessionId: created.id, guestId: B }));
  data(games.reportNetplay({ sessionId: created.id, guestId: A, roomId: 'ejs-room-1' }));
  const done = data(games.leave({ sessionId: created.id, guestId: A }));
  assert.equal(done?.status, 'finished');
  assert.equal(games.current(), null);
});

test('office websocket drop during a match does not finish it', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  data(games.ready({ sessionId: created.id, guestId: A }));
  data(games.ready({ sessionId: created.id, guestId: B }));
  data(games.reportNetplay({ sessionId: created.id, guestId: A, roomId: 'ejs-room-1' }));
  const dropped = games.presenceLost(A);
  assert.equal(dropped?.status, 'playing');
  assert.equal(dropped?.players.find((player) => player.guestId === A)?.status, 'disconnected');
  assert.equal(games.current()?.id, created.id);
  const back = games.presenceRestored(A);
  assert.equal(back?.players.find((player) => player.guestId === A)?.status, 'connected');
  assert.equal(games.current()?.status, 'playing');
});

test('office websocket drop while starting solo does not finish it', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-bomberman-5' }));
  data(games.start({ sessionId: created.id, guestId: A }));
  const dropped = games.presenceLost(A);
  assert.equal(dropped?.status, 'starting');
  assert.equal(dropped?.players.find((player) => player.guestId === A)?.status, 'disconnected');
  assert.equal(games.current()?.id, created.id);
});

test('office websocket drop in the lobby still closes an empty room', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  const dropped = games.presenceLost(A);
  assert.equal(dropped?.status, 'cancelled');
  assert.equal(games.current(), null);
});

test('cancel from the host closes the lobby', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  const cancelled = data(games.cancel({ sessionId: created.id, guestId: A }));
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(games.current(), null);
  err(games.join({ sessionId: created.id, guestId: B, name: 'João' }), 'SESSION_UNKNOWN', 404);
});

test('finish from the host ends a started match', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  data(games.ready({ sessionId: created.id, guestId: A }));
  data(games.ready({ sessionId: created.id, guestId: B }));
  const finished = data(games.finish({ sessionId: created.id, guestId: A }));
  assert.equal(finished.status, 'finished');
});

test('ROM is not served to outsiders or before start', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  err(games.romFileFor(A, 'super-mario-kart'), 'NOT_STARTING', 409);
  err(games.romFileFor(B, 'super-mario-kart'), 'ROM_FORBIDDEN', 403);
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  data(games.ready({ sessionId: created.id, guestId: A }));
  data(games.ready({ sessionId: created.id, guestId: B }));
  const file = data(games.romFileFor(A, 'super-mario-kart'));
  assert.match(file.path, /super-mario-kart\.sfc$/);
  err(games.romFileFor(C, 'super-mario-kart'), 'ROM_FORBIDDEN', 403);
});

test('disabled catalog game cannot be created', () => {
  const romDir = process.env.GAMES_ROM_DIR!;
  process.env.GAMES_ROM_DIR = join(romDir, 'empty');
  const blocked = new GamesService(new MemoryGameStore());
  err(blocked.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }), 'GAME_DISABLED', 409);
  process.env.GAMES_ROM_DIR = romDir;
});

test('host can start a match alone', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-bomberman-5' }));
  const started = data(games.start({ sessionId: created.id, guestId: A }));
  assert.equal(started.status, 'starting');
  assert.equal(started.players.filter((player) => player.role === 'player').length, 1);
  assert.equal(started.players[0].status, 'ready');
});

test('two groups can play the same game in different rooms', () => {
  const games = service();
  const first = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-bomberman-5' }));
  const second = data(games.create({ guestId: B, name: 'João', gameId: 'super-bomberman-5' }));
  assert.notEqual(first.id, second.id);
  assert.equal(games.list().length, 2);
  err(games.join({ sessionId: first.id, guestId: B, name: 'João' }), 'ALREADY_IN_SESSION', 409);
});

test('watch does not take a player seat', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  const watched = data(games.watch({ sessionId: created.id, guestId: C, name: 'Caio' }));
  assert.equal(watched.players.filter((player) => player.role === 'player').length, 1);
  assert.equal(watched.players.find((player) => player.guestId === C)?.role, 'spectator');
  assert.equal(watched.players.find((player) => player.guestId === C)?.playerNumber, 0);
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  err(
    games.join({ sessionId: created.id, guestId: '55555555-5555-4555-8555-555555555555', name: 'Rafa' }),
    'SESSION_FULL',
    409,
  );
  const still = data(
    games.watch({ sessionId: created.id, guestId: '66666666-6666-4666-8666-666666666666', name: 'Lina' }),
  );
  assert.equal(still.players.filter((player) => player.role === 'player').length, 2);
  assert.equal(still.players.filter((player) => player.role === 'spectator').length, 2);
});

test('spectator can promote to a free seat before start', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  data(games.watch({ sessionId: created.id, guestId: B, name: 'João' }));
  const joined = data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  assert.equal(joined.players.find((player) => player.guestId === B)?.role, 'player');
  assert.equal(joined.players.find((player) => player.guestId === B)?.playerNumber, 2);
});

test('spectators do not block start and wait for the host stream', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  data(games.watch({ sessionId: created.id, guestId: C, name: 'Caio' }));
  const started = data(games.start({ sessionId: created.id, guestId: A }));
  assert.equal(started.status, 'starting');
  err(games.playConfig({ sessionId: created.id, guestId: C }), 'SPECTATE_WAIT', 409);
  data(games.reportNetplay({ sessionId: created.id, guestId: A, roomId: 'ejs-solo-1' }));
  const watch = data(games.playConfig({ sessionId: created.id, guestId: C }));
  assert.equal(watch.role, 'spectator');
  assert.equal(watch.playerNumber, 0);
  assert.equal(watch.netplayRoomId, 'ejs-solo-1');
  assert.ok(watch.playerCount > 2);
});

test('spectators wait until every seated player is in the emulator', () => {
  const games = service();
  const created = data(games.create({ guestId: A, name: 'Afonso', gameId: 'super-mario-kart' }));
  data(games.join({ sessionId: created.id, guestId: B, name: 'João' }));
  data(games.watch({ sessionId: created.id, guestId: C, name: 'Caio' }));
  data(games.ready({ sessionId: created.id, guestId: A }));
  data(games.ready({ sessionId: created.id, guestId: B }));
  data(games.reportNetplay({ sessionId: created.id, guestId: A, roomId: 'ejs-room-2' }));
  err(games.playConfig({ sessionId: created.id, guestId: C }), 'SPECTATE_WAIT', 409);
  data(games.connected({ sessionId: created.id, guestId: B }));
  const watch = data(games.playConfig({ sessionId: created.id, guestId: C }));
  assert.equal(watch.role, 'spectator');
});
