import type { Appearance } from '../character/appearance';
import {
  parseServerMessage,
  WS_HEARTBEAT_MS,
  type ClientMessage,
  type Facing,
  type ChannelMessage,
  type ChannelSummary,
  type FurniturePlacement,
  type NpcPlacement,
  type Peer,
  type Pose,
  type TvPlatform,
  type TvScreen,
} from '../../shared/protocol';
import type { GameSessionView } from '../../shared/game-session';

export type PresenceStatus = 'connecting' | 'online' | 'offline';

export type PresenceHandlers = {
  onWelcome: (
    peers: Peer[],
    tvs: TvScreen[],
    furniture: FurniturePlacement[],
    npcs: NpcPlacement[],
    games: GameSessionView[],
    channels: ChannelSummary[],
  ) => void;
  onJoin: (peer: Peer) => void;
  onLeave: (guestId: string) => void;
  onState: (guestId: string, pose: Pose) => void;
  onMeta: (guestId: string, name: string, appearance: Appearance) => void;
  onChat: (guestId: string, name: string, text: string) => void;
  onTv: (tvId: string, platform: TvPlatform | null, videoId: string | null) => void;
  onFurniture: (places: FurniturePlacement[]) => void;
  onNpcs: (npcs: NpcPlacement[]) => void;
  onChannels: (channels: ChannelSummary[]) => void;
  onChannelHistory: (channelId: string, messages: ChannelMessage[]) => void;
  onChannelMessage: (channelId: string, message: ChannelMessage) => void;
  onGame: (sessions: GameSessionView[]) => void;
  onStatus: (status: PresenceStatus) => void;
};

export class PresenceClient {
  private socket: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private retryTimer = 0;
  private heartbeatTimer = 0;
  private joinPayload: Extract<ClientMessage, { type: 'join' }> | null = null;

  constructor(private readonly handlers: PresenceHandlers) {}

  connect(join: Extract<ClientMessage, { type: 'join' }>): void {
    this.joinPayload = join;
    this.closed = false;
    this.open();
  }

  updateJoinPose(pose: Pose): void {
    if (this.joinPayload) this.joinPayload = { ...this.joinPayload, pose };
  }

  sendState(pose: Pose): void {
    this.send({ type: 'state', pose });
  }

  sendMeta(name: string, appearance: Appearance): void {
    if (this.joinPayload) this.joinPayload = { ...this.joinPayload, name, appearance };
    this.send({ type: 'meta', name, appearance });
  }

  sendChat(text: string): void {
    this.send({ type: 'chat', text });
  }

  sendTv(tvId: string, platform: TvPlatform | null, videoId: string | null): void {
    this.send({ type: 'tv', tvId, platform, videoId });
  }

  sendFurnitureAdd(item: string, col: number, row: number, facing?: Facing): void {
    this.send(facing ? { type: 'furniture_add', item, col, row, facing } : { type: 'furniture_add', item, col, row });
  }

  sendFurnitureUpdate(id: string, col: number, row: number, facing?: Facing): void {
    this.send(
      facing ? { type: 'furniture_update', id, col, row, facing } : { type: 'furniture_update', id, col, row },
    );
  }

  sendFurnitureRemove(id: string): void {
    this.send({ type: 'furniture_remove', id });
  }

  sendFurnitureReset(): void {
    this.send({ type: 'furniture_reset' });
  }

  sendNpcAdd(npc: Omit<NpcPlacement, 'id'>): void {
    this.send({ type: 'npc_add', ...npc });
  }

  sendNpcUpdate(npc: NpcPlacement): void {
    this.send({ type: 'npc_update', ...npc });
  }

  sendNpcRemove(id: string): void {
    this.send({ type: 'npc_remove', id });
  }

  sendChannelAdd(name: string): void {
    this.send({ type: 'channel_add', name });
  }

  sendChannelRename(id: string, name: string): void {
    this.send({ type: 'channel_rename', id, name });
  }

  sendChannelRemove(id: string): void {
    this.send({ type: 'channel_remove', id });
  }

  sendChannelHistory(channelId: string): void {
    this.send({ type: 'channel_history', channelId });
  }

  sendChannelChat(channelId: string, text: string): void {
    this.send({ type: 'channel_chat', channelId, text });
  }

  disconnect(): void {
    this.closed = true;
    window.clearTimeout(this.retryTimer);
    this.stopHeartbeat();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private open(): void {
    if (this.closed) return;
    this.handlers.onStatus('connecting');
    const socket = new WebSocket(wsUrl());
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.startHeartbeat();
      if (this.joinPayload) this.send(this.joinPayload);
      this.handlers.onStatus('online');
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      const message = parseServerMessage(String(event.data));
      if (!message || message.type === 'pong') return;
      if (message.type === 'welcome') {
        this.handlers.onWelcome(
          message.peers,
          message.tvs,
          message.furniture,
          message.npcs,
          message.games,
          message.channels,
        );
      }
      else if (message.type === 'join') this.handlers.onJoin(message.peer);
      else if (message.type === 'leave') this.handlers.onLeave(message.guestId);
      else if (message.type === 'state') this.handlers.onState(message.guestId, message.pose);
      else if (message.type === 'meta') this.handlers.onMeta(message.guestId, message.name, message.appearance);
      else if (message.type === 'chat') this.handlers.onChat(message.guestId, message.name, message.text);
      else if (message.type === 'tv') this.handlers.onTv(message.tvId, message.platform, message.videoId);
      else if (message.type === 'furniture') this.handlers.onFurniture(message.places);
      else if (message.type === 'npcs') this.handlers.onNpcs(message.npcs);
      else if (message.type === 'channels') this.handlers.onChannels(message.channels);
      else if (message.type === 'channel_history') this.handlers.onChannelHistory(message.channelId, message.messages);
      else if (message.type === 'channel_message') this.handlers.onChannelMessage(message.channelId, message.message);
      else if (message.type === 'game') this.handlers.onGame(message.sessions);
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopHeartbeat();
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.handlers.onStatus('offline');
    const delay = Math.min(8000, 600 * 2 ** this.attempt);
    this.attempt += 1;
    this.retryTimer = window.setTimeout(() => this.open(), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => this.send({ type: 'ping' }), WS_HEARTBEAT_MS);
    this.send({ type: 'ping' });
  }

  private stopHeartbeat(): void {
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = 0;
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }
}

function wsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL;
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}
