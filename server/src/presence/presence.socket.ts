import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Server } from 'node:http';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { DEFAULT_OFFICE_SLUG } from '../../../shared/office';
import { parseClientMessage, type ClientMessage, type FurniturePlacement } from '../../../shared/protocol';
import { OfficeService } from '../office/office.service';
import { PresenceService } from './presence.service';

@Injectable()
export class PresenceSocket {
  private readonly logger = new Logger(PresenceSocket.name);
  private wss: WebSocketServer | null = null;
  private readonly lastChatAt = new Map<WebSocket, number>();
  private readonly lastTvAt = new Map<WebSocket, number>();
  private readonly lastFurnitureAt = new Map<WebSocket, number>();

  constructor(
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Inject(OfficeService) private readonly offices: OfficeService,
  ) {}

  attach(server: Server): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (socket) => this.bind(socket));
    this.wss.on('error', (error) => this.logger.error(error.message));
    this.logger.log('websocket attached at /ws');
  }

  detach(): void {
    this.wss?.close();
    this.wss = null;
  }

  private bind(socket: WebSocket): void {
    socket.on('error', (error) => this.logger.warn(error.message));
    socket.on('message', (data) => this.onMessage(socket, data));
    socket.on('close', () => {
      this.lastChatAt.delete(socket);
      this.lastTvAt.delete(socket);
      this.lastFurnitureAt.delete(socket);
      const guestId = this.presence.leave(socket);
      if (guestId) this.presence.broadcast(guestId, { type: 'leave', guestId });
    });
  }

  private onMessage(socket: WebSocket, data: RawData): void {
    const message = parseClientMessage(String(data));
    if (!message) return;

    if (message.type === 'join') {
      const peer = {
        guestId: message.guestId,
        name: message.name,
        appearance: message.appearance,
        pose: message.pose,
      };
      if (this.presence.join(socket, peer) === 'full') {
        socket.close(4000, 'office full');
        return;
      }
      this.presence.send(socket, {
        type: 'welcome',
        peers: this.presence.peersExcept(peer.guestId),
        tvs: this.presence.listTvs(),
        furniture: this.offices.listFurniture(DEFAULT_OFFICE_SLUG) ?? [],
      });
      this.presence.broadcast(peer.guestId, { type: 'join', peer });
      return;
    }

    if (message.type === 'state') {
      const guestId = this.presence.updateState(socket, message.pose);
      if (guestId) this.presence.broadcast(guestId, { type: 'state', guestId, pose: message.pose });
      return;
    }

    if (message.type === 'chat') {
      const now = Date.now();
      const last = this.lastChatAt.get(socket) ?? 0;
      if (now - last < 400) return;
      const speaker = this.presence.speaker(socket);
      if (!speaker) return;
      this.lastChatAt.set(socket, now);
      this.presence.broadcast(speaker.guestId, {
        type: 'chat',
        guestId: speaker.guestId,
        name: speaker.name,
        text: message.text,
      });
      return;
    }

    if (message.type === 'tv') {
      const speaker = this.presence.speaker(socket);
      if (!speaker) return;
      const now = Date.now();
      const last = this.lastTvAt.get(socket) ?? 0;
      if (now - last < 400) return;
      const next = this.presence.setTv(message.tvId, message.platform, message.videoId);
      if (!next) return;
      this.lastTvAt.set(socket, now);
      this.presence.broadcast(speaker.guestId, next);
      return;
    }

    if (
      message.type === 'furniture_add' ||
      message.type === 'furniture_update' ||
      message.type === 'furniture_remove' ||
      message.type === 'furniture_reset'
    ) {
      this.onFurniture(socket, message);
      return;
    }

    if (message.type !== 'meta') return;
    const guestId = this.presence.updateMeta(socket, message.name, message.appearance);
    if (guestId) {
      this.presence.broadcast(guestId, {
        type: 'meta',
        guestId,
        name: message.name,
        appearance: message.appearance,
      });
    }
  }

  private onFurniture(
    socket: WebSocket,
    message: Extract<
      ClientMessage,
      { type: 'furniture_add' } | { type: 'furniture_update' } | { type: 'furniture_remove' } | { type: 'furniture_reset' }
    >,
  ): void {
    if (!this.presence.speaker(socket)) return;
    const now = Date.now();
    const last = this.lastFurnitureAt.get(socket) ?? 0;
    if (now - last < 80) return;
    this.lastFurnitureAt.set(socket, now);

    let places: FurniturePlacement[] | null = null;
    if (message.type === 'furniture_add') {
      places = this.offices.addFurniture(DEFAULT_OFFICE_SLUG, {
        item: message.item,
        col: message.col,
        row: message.row,
        facing: message.facing,
      });
    } else if (message.type === 'furniture_update') {
      places = this.offices.updateFurniture(DEFAULT_OFFICE_SLUG, message.id, {
        col: message.col,
        row: message.row,
        facing: message.facing,
      });
    } else if (message.type === 'furniture_remove') {
      places = this.offices.removeFurniture(DEFAULT_OFFICE_SLUG, message.id);
    } else {
      places = this.offices.resetFurniture(DEFAULT_OFFICE_SLUG);
    }

    const next = places ?? this.offices.listFurniture(DEFAULT_OFFICE_SLUG) ?? [];
    this.presence.broadcastAll({ type: 'furniture', places: next });
  }
}
