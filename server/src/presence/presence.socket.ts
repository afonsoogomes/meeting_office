import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import type { Server } from 'node:http';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { parseClientMessage, type ClientMessage, type FurniturePlacement, type NpcPlacement, WS_HEARTBEAT_MS } from '../../../shared/protocol';
import { GamesService } from '../games/games.service';
import { OfficeService } from '../office/office.service';
import { PresenceService } from './presence.service';

@Injectable()
export class PresenceSocket {
  private readonly logger = new Logger(PresenceSocket.name);
  private wss: WebSocketServer | null = null;
  private readonly lastChatAt = new Map<WebSocket, number>();
  private readonly lastTvAt = new Map<WebSocket, number>();
  private readonly lastFurnitureAt = new Map<WebSocket, number>();
  private readonly lastNpcAt = new Map<WebSocket, number>();
  private readonly lastChannelAt = new Map<WebSocket, number>();
  private readonly pings = new Map<WebSocket, ReturnType<typeof setInterval>>();

  constructor(
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Inject(OfficeService) private readonly offices: OfficeService,
    @Optional() @Inject(forwardRef(() => GamesService)) private readonly games?: GamesService | null,
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
    for (const ping of this.pings.values()) clearInterval(ping);
    this.pings.clear();
  }

  private bind(socket: WebSocket): void {
    socket.on('error', (error) => this.logger.warn(error.message));
    socket.on('message', (data) => this.onMessage(socket, data));
    this.pings.set(
      socket,
      setInterval(() => {
        if (socket.readyState === socket.OPEN) socket.ping();
      }, WS_HEARTBEAT_MS),
    );
    socket.on('close', () => {
      const ping = this.pings.get(socket);
      if (ping) clearInterval(ping);
      this.pings.delete(socket);
      this.lastChatAt.delete(socket);
      this.lastTvAt.delete(socket);
      this.lastFurnitureAt.delete(socket);
      this.lastNpcAt.delete(socket);
      this.lastChannelAt.delete(socket);
      const guest = this.presence.leave(socket);
      if (guest) {
        this.games?.presenceLost(guest.guestId);
        this.presence.broadcastOffice(guest.officeSlug, { type: 'leave', guestId: guest.guestId }, guest.guestId);
      }
    });
  }

  private onMessage(socket: WebSocket, data: RawData): void {
    const message = parseClientMessage(String(data));
    if (!message) return;

    if (message.type === 'ping') {
      this.presence.send(socket, { type: 'pong' });
      return;
    }

    if (message.type === 'join') {
      if (!this.offices.exists(message.office)) {
        socket.close(4004, 'unknown office');
        return;
      }
      const peer = {
        guestId: message.guestId,
        name: message.name,
        appearance: message.appearance,
        pose: message.pose,
      };
      if (this.presence.join(socket, peer, message.office) === 'full') {
        socket.close(4000, 'office full');
        return;
      }
      this.games?.presenceRestored(peer.guestId);
      this.presence.send(socket, {
        type: 'welcome',
        peers: this.presence.peersExcept(message.office, peer.guestId),
        tvs: this.presence.listTvs(message.office),
        furniture: this.offices.listFurniture(message.office) ?? [],
        npcs: this.offices.listNpcs(message.office) ?? [],
        channels: this.offices.listChannels(message.office) ?? [],
        games: this.games?.viewOfOffice(message.office) ?? [],
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
      const officeSlug = this.presence.officeOf(socket);
      if (!officeSlug) return;
      const next = this.presence.setTv(officeSlug, message.tvId, message.platform, message.videoId);
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

    if (message.type === 'npc_add' || message.type === 'npc_update' || message.type === 'npc_remove') {
      this.onNpc(socket, message);
      return;
    }

    if (
      message.type === 'channel_add' ||
      message.type === 'channel_rename' ||
      message.type === 'channel_remove' ||
      message.type === 'channel_history' ||
      message.type === 'channel_chat'
    ) {
      this.onChannel(socket, message);
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
    const officeSlug = this.presence.officeOf(socket);
    if (!officeSlug) return;
    const now = Date.now();
    const last = this.lastFurnitureAt.get(socket) ?? 0;
    if (now - last < 80) return;
    this.lastFurnitureAt.set(socket, now);

    let places: FurniturePlacement[] | null = null;
    if (message.type === 'furniture_add') {
      places = this.offices.addFurniture(officeSlug, {
        item: message.item,
        col: message.col,
        row: message.row,
        facing: message.facing,
      });
    } else if (message.type === 'furniture_update') {
      places = this.offices.updateFurniture(officeSlug, message.id, {
        col: message.col,
        row: message.row,
        facing: message.facing,
      });
    } else if (message.type === 'furniture_remove') {
      places = this.offices.removeFurniture(officeSlug, message.id);
    } else {
      places = this.offices.resetFurniture(officeSlug);
    }

    const next = places ?? this.offices.listFurniture(officeSlug) ?? [];
    this.presence.broadcastOffice(officeSlug, { type: 'furniture', places: next });
  }

  private onNpc(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: 'npc_add' } | { type: 'npc_update' } | { type: 'npc_remove' }>,
  ): void {
    const officeSlug = this.presence.officeOf(socket);
    if (!officeSlug) return;
    const now = Date.now();
    const last = this.lastNpcAt.get(socket) ?? 0;
    if (now - last < 80) return;
    this.lastNpcAt.set(socket, now);

    let npcs: NpcPlacement[] | null = null;
    if (message.type === 'npc_add') {
      npcs = this.offices.addNpc(officeSlug, {
        name: message.name,
        line: message.line,
        appearance: message.appearance,
        col: message.col,
        row: message.row,
        facing: message.facing,
      });
    } else if (message.type === 'npc_update') {
      npcs = this.offices.updateNpc(officeSlug, {
        id: message.id,
        name: message.name,
        line: message.line,
        appearance: message.appearance,
        col: message.col,
        row: message.row,
        facing: message.facing,
      });
    } else {
      npcs = this.offices.removeNpc(officeSlug, message.id);
    }

    const next = npcs ?? this.offices.listNpcs(officeSlug) ?? [];
    this.presence.broadcastOffice(officeSlug, { type: 'npcs', npcs: next });
  }

  private onChannel(
    socket: WebSocket,
    message: Extract<
      ClientMessage,
      | { type: 'channel_add' }
      | { type: 'channel_rename' }
      | { type: 'channel_remove' }
      | { type: 'channel_history' }
      | { type: 'channel_chat' }
    >,
  ): void {
    const officeSlug = this.presence.officeOf(socket);
    if (!officeSlug) return;

    if (message.type === 'channel_history') {
      const messages = this.offices.listChannelMessages(officeSlug, message.channelId);
      if (!messages) return;
      this.presence.send(socket, { type: 'channel_history', channelId: message.channelId, messages });
      return;
    }

    const now = Date.now();
    const last = this.lastChannelAt.get(socket) ?? 0;
    if (now - last < 80) return;
    this.lastChannelAt.set(socket, now);

    if (message.type === 'channel_chat') {
      const speaker = this.presence.speaker(socket);
      if (!speaker) return;
      const lastChat = this.lastChatAt.get(socket) ?? 0;
      if (now - lastChat < 400) return;
      this.lastChatAt.set(socket, now);
      const posted = this.offices.addChannelMessage(
        officeSlug,
        message.channelId,
        speaker.guestId,
        speaker.name,
        message.text,
      );
      if (!posted) return;
      this.presence.broadcastOffice(officeSlug, {
        type: 'channel_message',
        channelId: message.channelId,
        message: posted.message,
      });
      this.presence.broadcastOffice(officeSlug, { type: 'channels', channels: posted.channels });
      return;
    }

    let channels = null;
    if (message.type === 'channel_add') channels = this.offices.addChannel(officeSlug, message.name);
    else if (message.type === 'channel_rename') {
      channels = this.offices.renameChannel(officeSlug, message.id, message.name);
    } else {
      channels = this.offices.removeChannel(officeSlug, message.id);
    }
    const next = channels ?? this.offices.listChannels(officeSlug) ?? [];
    this.presence.broadcastOffice(officeSlug, { type: 'channels', channels: next });
  }
}
