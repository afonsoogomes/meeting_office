import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';
import { MAX_PEERS, MAX_TVS, type Peer, type ServerMessage, type TvScreen } from '../../../shared/protocol';

type Connection = {
  guestId: string;
  socket: WebSocket;
  peer: Peer;
};

@Injectable()
export class PresenceService {
  private readonly byGuest = new Map<string, Connection>();
  private readonly bySocket = new Map<WebSocket, string>();
  private readonly tvs = new Map<string, TvScreen>();

  peersExcept(guestId: string): Peer[] {
    const peers: Peer[] = [];
    for (const connection of this.byGuest.values()) {
      if (connection.guestId !== guestId) peers.push(connection.peer);
    }
    return peers;
  }

  join(socket: WebSocket, peer: Peer): 'ok' | 'full' {
    if (this.byGuest.size >= MAX_PEERS && !this.byGuest.has(peer.guestId)) return 'full';

    const previous = this.byGuest.get(peer.guestId);
    if (previous && previous.socket !== socket) {
      this.bySocket.delete(previous.socket);
      previous.socket.on('error', () => undefined);
      previous.socket.close(4001, 'replaced');
    }

    this.dropSocket(socket);
    const connection = { guestId: peer.guestId, socket, peer };
    this.byGuest.set(peer.guestId, connection);
    this.bySocket.set(socket, peer.guestId);
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

  leave(socket: WebSocket): string | null {
    const guestId = this.bySocket.get(socket);
    if (!guestId) return null;
    const current = this.byGuest.get(guestId);
    if (!current || current.socket !== socket) {
      this.bySocket.delete(socket);
      return null;
    }
    this.byGuest.delete(guestId);
    this.bySocket.delete(socket);
    return guestId;
  }

  speaker(socket: WebSocket): Peer | null {
    return this.connectionOf(socket)?.peer ?? null;
  }

  listTvs(): TvScreen[] {
    return [...this.tvs.values()];
  }

  setTv(
    tvId: string,
    platform: TvScreen['platform'] | null,
    videoId: string | null,
  ): Extract<ServerMessage, { type: 'tv' }> | null {
    if (!platform || !videoId) {
      this.tvs.delete(tvId);
      return { type: 'tv', tvId, platform: null, videoId: null };
    }
    if (!this.tvs.has(tvId) && this.tvs.size >= MAX_TVS) return null;
    const screen: TvScreen = { tvId, platform, videoId };
    this.tvs.set(tvId, screen);
    return { type: 'tv', ...screen };
  }

  send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  broadcast(fromGuestId: string, message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const connection of this.byGuest.values()) {
      if (connection.guestId === fromGuestId) continue;
      if (connection.socket.readyState !== connection.socket.OPEN) continue;
      connection.socket.send(payload);
    }
  }

  broadcastAll(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const connection of this.byGuest.values()) {
      if (connection.socket.readyState !== connection.socket.OPEN) continue;
      connection.socket.send(payload);
    }
  }

  private connectionOf(socket: WebSocket): Connection | null {
    const guestId = this.bySocket.get(socket);
    if (!guestId) return null;
    const connection = this.byGuest.get(guestId);
    if (!connection || connection.socket !== socket) return null;
    return connection;
  }

  private dropSocket(socket: WebSocket): void {
    const guestId = this.bySocket.get(socket);
    if (!guestId) return;
    const current = this.byGuest.get(guestId);
    if (current?.socket === socket) this.byGuest.delete(guestId);
    this.bySocket.delete(socket);
  }
}
