import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';
import { MAX_PEERS, MAX_TVS, type Peer, type ServerMessage, type TvScreen } from '../../../shared/protocol';

type Connection = {
  guestId: string;
  officeSlug: string;
  socket: WebSocket;
  peer: Peer;
};

type OfficeRoom = {
  byGuest: Map<string, Connection>;
  tvs: Map<string, TvScreen>;
};

@Injectable()
export class PresenceService {
  private readonly rooms = new Map<string, OfficeRoom>();
  private readonly bySocket = new Map<WebSocket, Connection>();

  officeOf(socket: WebSocket): string | null {
    return this.bySocket.get(socket)?.officeSlug ?? null;
  }

  peersExcept(officeSlug: string, guestId: string): Peer[] {
    const peers: Peer[] = [];
    const room = this.rooms.get(officeSlug);
    if (!room) return peers;
    for (const connection of room.byGuest.values()) {
      if (connection.guestId !== guestId) peers.push(connection.peer);
    }
    return peers;
  }

  join(socket: WebSocket, peer: Peer, officeSlug: string): 'ok' | 'full' {
    const room = this.room(officeSlug);
    if (room.byGuest.size >= MAX_PEERS && !room.byGuest.has(peer.guestId)) return 'full';

    this.dropSocket(socket);
    this.replaceGuest(peer.guestId, socket);

    const connection: Connection = { guestId: peer.guestId, officeSlug, socket, peer };
    room.byGuest.set(peer.guestId, connection);
    this.bySocket.set(socket, connection);
    return 'ok';
  }

  updateState(socket: WebSocket, pose: Peer['pose']): string | null {
    const connection = this.connectionOf(socket);
    if (!connection) return null;
    connection.peer.pose = pose;
    return connection.guestId;
  }

  updateMeta(socket: WebSocket, name: string, appearance: Peer['appearance']): string | null {
    const connection = this.connectionOf(socket);
    if (!connection) return null;
    connection.peer.name = name;
    connection.peer.appearance = appearance;
    return connection.guestId;
  }

  leave(socket: WebSocket): { guestId: string; officeSlug: string } | null {
    const connection = this.bySocket.get(socket);
    if (!connection) return null;
    const room = this.rooms.get(connection.officeSlug);
    const current = room?.byGuest.get(connection.guestId);
    if (!current || current.socket !== socket) {
      this.bySocket.delete(socket);
      return null;
    }
    room?.byGuest.delete(connection.guestId);
    this.bySocket.delete(socket);
    return { guestId: connection.guestId, officeSlug: connection.officeSlug };
  }

  speaker(socket: WebSocket): Peer | null {
    return this.connectionOf(socket)?.peer ?? null;
  }

  listTvs(officeSlug: string): TvScreen[] {
    return [...(this.rooms.get(officeSlug)?.tvs.values() ?? [])];
  }

  setTv(
    officeSlug: string,
    tvId: string,
    platform: TvScreen['platform'] | null,
    videoId: string | null,
  ): Extract<ServerMessage, { type: 'tv' }> | null {
    const room = this.room(officeSlug);
    if (!platform || !videoId) {
      room.tvs.delete(tvId);
      return { type: 'tv', tvId, platform: null, videoId: null };
    }
    if (!room.tvs.has(tvId) && room.tvs.size >= MAX_TVS) return null;
    const screen: TvScreen = { tvId, platform, videoId };
    room.tvs.set(tvId, screen);
    return { type: 'tv', ...screen };
  }

  send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  broadcast(fromGuestId: string, message: ServerMessage): void {
    const connection = this.findGuest(fromGuestId);
    if (!connection) return;
    this.broadcastOffice(connection.officeSlug, message, fromGuestId);
  }

  broadcastOffice(officeSlug: string, message: ServerMessage, exceptGuestId?: string): void {
    const room = this.rooms.get(officeSlug);
    if (!room) return;
    const payload = JSON.stringify(message);
    for (const connection of room.byGuest.values()) {
      if (exceptGuestId && connection.guestId === exceptGuestId) continue;
      if (connection.socket.readyState !== connection.socket.OPEN) continue;
      connection.socket.send(payload);
    }
  }

  private room(slug: string): OfficeRoom {
    let room = this.rooms.get(slug);
    if (!room) {
      room = { byGuest: new Map(), tvs: new Map() };
      this.rooms.set(slug, room);
    }
    return room;
  }

  private findGuest(guestId: string): Connection | null {
    for (const room of this.rooms.values()) {
      const connection = room.byGuest.get(guestId);
      if (connection) return connection;
    }
    return null;
  }

  private connectionOf(socket: WebSocket): Connection | null {
    const connection = this.bySocket.get(socket);
    if (!connection) return null;
    const live = this.rooms.get(connection.officeSlug)?.byGuest.get(connection.guestId);
    if (!live || live.socket !== socket) return null;
    return live;
  }

  private dropSocket(socket: WebSocket): void {
    const connection = this.bySocket.get(socket);
    if (!connection) return;
    const room = this.rooms.get(connection.officeSlug);
    const current = room?.byGuest.get(connection.guestId);
    if (current?.socket === socket) room?.byGuest.delete(connection.guestId);
    this.bySocket.delete(socket);
  }

  private replaceGuest(guestId: string, incoming: WebSocket): void {
    for (const [slug, room] of this.rooms) {
      const previous = room.byGuest.get(guestId);
      if (!previous || previous.socket === incoming) continue;
      this.bySocket.delete(previous.socket);
      room.byGuest.delete(guestId);
      previous.socket.on('error', () => undefined);
      previous.socket.close(4001, 'replaced');
      this.broadcastOffice(slug, { type: 'leave', guestId }, guestId);
    }
  }
}
