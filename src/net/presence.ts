import type { Appearance } from '../character/appearance';
import {
  parseServerMessage,
  type ClientMessage,
  type Facing,
  type FurniturePlacement,
  type Peer,
  type Pose,
  type TvPlatform,
  type TvScreen,
} from '../../shared/protocol';

export type PresenceStatus = 'connecting' | 'online' | 'offline';

export type PresenceHandlers = {
  onWelcome: (peers: Peer[], tvs: TvScreen[], furniture: FurniturePlacement[]) => void;
  onJoin: (peer: Peer) => void;
  onLeave: (guestId: string) => void;
  onState: (guestId: string, pose: Pose) => void;
  onMeta: (guestId: string, name: string, appearance: Appearance) => void;
  onChat: (guestId: string, name: string, text: string) => void;
  onTv: (tvId: string, platform: TvPlatform | null, videoId: string | null) => void;
  onFurniture: (places: FurniturePlacement[]) => void;
  onStatus: (status: PresenceStatus) => void;
};

export class PresenceClient {
  private socket: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private retryTimer = 0;
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

  disconnect(): void {
    this.closed = true;
    window.clearTimeout(this.retryTimer);
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
      if (this.joinPayload) this.send(this.joinPayload);
      this.handlers.onStatus('online');
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      const message = parseServerMessage(String(event.data));
      if (!message) return;
      if (message.type === 'welcome') this.handlers.onWelcome(message.peers, message.tvs, message.furniture);
      else if (message.type === 'join') this.handlers.onJoin(message.peer);
      else if (message.type === 'leave') this.handlers.onLeave(message.guestId);
      else if (message.type === 'state') this.handlers.onState(message.guestId, message.pose);
      else if (message.type === 'meta') this.handlers.onMeta(message.guestId, message.name, message.appearance);
      else if (message.type === 'chat') this.handlers.onChat(message.guestId, message.name, message.text);
      else if (message.type === 'tv') this.handlers.onTv(message.tvId, message.platform, message.videoId);
      else if (message.type === 'furniture') this.handlers.onFurniture(message.places);
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
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
