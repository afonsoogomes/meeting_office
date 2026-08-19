export const ACTIONS = ['idle', 'walk', 'run', 'wave', 'talk', 'sit', 'sleep'] as const;
export const FACINGS = ['down', 'right', 'up', 'left'] as const;

export type Action = (typeof ACTIONS)[number];
export type Facing = (typeof FACINGS)[number];

export type Appearance = {
  skin: number;
  hair: number;
  hairColor: number;
  shirt: number;
  pants: number;
  hat: number;
  accessory: number;
};

export type Pose = {
  x: number;
  y: number;
  facing: Facing;
  action: Action;
  step: number;
  depthBias: number;
};

export type Peer = {
  guestId: string;
  name: string;
  appearance: Appearance;
  pose: Pose;
};

export type FurniturePlacement = {
  id: string;
  item: string;
  col: number;
  row: number;
  facing?: Facing;
};

export type ClientMessage =
  | { type: 'join'; guestId: string; name: string; appearance: Appearance; pose: Pose }
  | { type: 'state'; pose: Pose }
  | { type: 'meta'; name: string; appearance: Appearance }
  | { type: 'chat'; text: string }
  | { type: 'tv'; tvId: string; platform: TvPlatform | null; videoId: string | null }
  | { type: 'furniture_add'; item: string; col: number; row: number; facing?: Facing }
  | { type: 'furniture_update'; id: string; col: number; row: number; facing?: Facing }
  | { type: 'furniture_remove'; id: string }
  | { type: 'furniture_reset' };

export type ServerMessage =
  | { type: 'welcome'; peers: Peer[]; tvs: TvScreen[]; furniture: FurniturePlacement[] }
  | { type: 'join'; peer: Peer }
  | { type: 'leave'; guestId: string }
  | { type: 'state'; guestId: string; pose: Pose }
  | { type: 'meta'; guestId: string; name: string; appearance: Appearance }
  | { type: 'chat'; guestId: string; name: string; text: string }
  | { type: 'tv'; tvId: string; platform: TvPlatform | null; videoId: string | null }
  | { type: 'furniture'; places: FurniturePlacement[] };

export type TvPlatform = 'youtube';

export type TvScreen = {
  tvId: string;
  platform: TvPlatform;
  videoId: string;
};

const GUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TV_ID_RE = /^[a-z][a-z0-9-]{0,47}:[0-9]{1,3}:[0-9]{1,3}$/i;
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const ITEM_RE = /^[a-z][a-z0-9-]{0,47}$/;
const MAP_PAD = 8000;
const TILE_MAX = 96;

export const MAX_PEERS = 24;
export const MAX_TVS = 32;
export const MAX_FURNITURE = 400;
export const CHAT_MAX = 80;
export const NAME_MAX = 18;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function asAction(value: unknown): Action | null {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value) ? (value as Action) : null;
}

function asFacing(value: unknown): Facing | null {
  return typeof value === 'string' && (FACINGS as readonly string[]).includes(value) ? (value as Facing) : null;
}

export function sanitizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().slice(0, NAME_MAX);
  return name.length >= 2 ? name : null;
}

export function sanitizeGuestId(value: unknown): string | null {
  return typeof value === 'string' && GUEST_ID_RE.test(value) ? value : null;
}

export function sanitizeAppearance(value: unknown): Appearance | null {
  if (!isRecord(value)) return null;
  const skin = asNumber(value.skin, 0, 64);
  const hair = asNumber(value.hair, 0, 64);
  const hairColor = asNumber(value.hairColor, 0, 64);
  const shirt = asNumber(value.shirt, 0, 64);
  const pants = asNumber(value.pants, 0, 64);
  const hat = asNumber(value.hat, 0, 64);
  const accessory = asNumber(value.accessory, 0, 64);
  if (
    skin === null ||
    hair === null ||
    hairColor === null ||
    shirt === null ||
    pants === null ||
    hat === null ||
    accessory === null
  ) {
    return null;
  }
  return { skin, hair, hairColor, shirt, pants, hat, accessory };
}

export function sanitizePose(value: unknown): Pose | null {
  if (!isRecord(value)) return null;
  const x = asNumber(value.x, 0, MAP_PAD);
  const y = asNumber(value.y, 0, MAP_PAD);
  const facing = asFacing(value.facing);
  const action = asAction(value.action);
  const step = asNumber(value.step, 0, 32);
  const depthBias = asNumber(value.depthBias, -200, 200);
  if (x === null || y === null || !facing || !action || step === null || depthBias === null) return null;
  return { x, y, facing, action, step: Math.round(step), depthBias };
}

export function sanitizeChat(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
  return text.length > 0 ? text : null;
}

export function sanitizeTvId(value: unknown): string | null {
  return typeof value === 'string' && TV_ID_RE.test(value) ? value : null;
}

export function sanitizeYouTubeId(value: unknown): string | null {
  return typeof value === 'string' && YOUTUBE_ID_RE.test(value) ? value : null;
}

export function sanitizeFurnitureId(value: unknown): string | null {
  return typeof value === 'string' && GUEST_ID_RE.test(value) ? value : null;
}

export function sanitizeFurnitureItem(value: unknown): string | null {
  return typeof value === 'string' && ITEM_RE.test(value) ? value : null;
}

export function sanitizeTileIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > TILE_MAX) return null;
  return value;
}

export function sanitizeFurniturePlacement(value: unknown): FurniturePlacement | null {
  if (!isRecord(value)) return null;
  const id = sanitizeFurnitureId(value.id);
  const item = sanitizeFurnitureItem(value.item);
  const col = sanitizeTileIndex(value.col);
  const row = sanitizeTileIndex(value.row);
  if (!id || !item || col === null || row === null) return null;
  const facing = value.facing === undefined ? undefined : asFacing(value.facing);
  if (value.facing !== undefined && !facing) return null;
  return facing ? { id, item, col, row, facing } : { id, item, col, row };
}

function parseFurnitureList(value: unknown): FurniturePlacement[] {
  if (!Array.isArray(value)) return [];
  const places: FurniturePlacement[] = [];
  for (const item of value) {
    const place = sanitizeFurniturePlacement(item);
    if (place) places.push(place);
    if (places.length >= MAX_FURNITURE) break;
  }
  return places;
}

export function sanitizeTvScreen(value: unknown): TvScreen | null {
  if (!isRecord(value)) return null;
  const tvId = sanitizeTvId(value.tvId);
  const videoId = sanitizeYouTubeId(value.videoId);
  if (!tvId || value.platform !== 'youtube' || !videoId) return null;
  return { tvId, platform: 'youtube', videoId };
}

function sanitizeTvPayload(value: Record<string, unknown>): Extract<ClientMessage, { type: 'tv' }> | null {
  const tvId = sanitizeTvId(value.tvId);
  if (!tvId) return null;
  if (value.platform === null || value.videoId === null) {
    return { type: 'tv', tvId, platform: null, videoId: null };
  }
  if (value.platform !== 'youtube') return null;
  const videoId = sanitizeYouTubeId(value.videoId);
  return videoId ? { type: 'tv', tvId, platform: 'youtube', videoId } : null;
}

export function sanitizePeer(value: unknown): Peer | null {
  if (!isRecord(value)) return null;
  const guestId = sanitizeGuestId(value.guestId);
  const name = sanitizeName(value.name);
  const appearance = sanitizeAppearance(value.appearance);
  const pose = sanitizePose(value.pose);
  if (!guestId || !name || !appearance || !pose) return null;
  return { guestId, name, appearance, pose };
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string') return null;
  if (parsed.type === 'join') {
    const guestId = sanitizeGuestId(parsed.guestId);
    const name = sanitizeName(parsed.name);
    const appearance = sanitizeAppearance(parsed.appearance);
    const pose = sanitizePose(parsed.pose);
    if (!guestId || !name || !appearance || !pose) return null;
    return { type: 'join', guestId, name, appearance, pose };
  }
  if (parsed.type === 'state') {
    const pose = sanitizePose(parsed.pose);
    return pose ? { type: 'state', pose } : null;
  }
  if (parsed.type === 'meta') {
    const name = sanitizeName(parsed.name);
    const appearance = sanitizeAppearance(parsed.appearance);
    if (!name || !appearance) return null;
    return { type: 'meta', name, appearance };
  }
  if (parsed.type === 'chat') {
    const text = sanitizeChat(parsed.text);
    return text ? { type: 'chat', text } : null;
  }
  if (parsed.type === 'tv') return sanitizeTvPayload(parsed);
  if (parsed.type === 'furniture_add') {
    const item = sanitizeFurnitureItem(parsed.item);
    const col = sanitizeTileIndex(parsed.col);
    const row = sanitizeTileIndex(parsed.row);
    if (!item || col === null || row === null) return null;
    const facing = parsed.facing === undefined ? undefined : asFacing(parsed.facing);
    if (parsed.facing !== undefined && !facing) return null;
    return facing
      ? { type: 'furniture_add', item, col, row, facing }
      : { type: 'furniture_add', item, col, row };
  }
  if (parsed.type === 'furniture_update') {
    const id = sanitizeFurnitureId(parsed.id);
    const col = sanitizeTileIndex(parsed.col);
    const row = sanitizeTileIndex(parsed.row);
    if (!id || col === null || row === null) return null;
    const facing = parsed.facing === undefined ? undefined : asFacing(parsed.facing);
    if (parsed.facing !== undefined && !facing) return null;
    return facing
      ? { type: 'furniture_update', id, col, row, facing }
      : { type: 'furniture_update', id, col, row };
  }
  if (parsed.type === 'furniture_remove') {
    const id = sanitizeFurnitureId(parsed.id);
    return id ? { type: 'furniture_remove', id } : null;
  }
  if (parsed.type === 'furniture_reset') return { type: 'furniture_reset' };
  return null;
}

export function parseServerMessage(raw: string): ServerMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string') return null;
  if (parsed.type === 'welcome') {
    if (!Array.isArray(parsed.peers)) return null;
    const peers: Peer[] = [];
    for (const item of parsed.peers) {
      const peer = sanitizePeer(item);
      if (peer) peers.push(peer);
    }
    const tvs: TvScreen[] = [];
    if (Array.isArray(parsed.tvs)) {
      for (const item of parsed.tvs) {
        const screen = sanitizeTvScreen(item);
        if (screen) tvs.push(screen);
      }
    }
    return { type: 'welcome', peers, tvs, furniture: parseFurnitureList(parsed.furniture) };
  }
  if (parsed.type === 'join') {
    const peer = sanitizePeer(parsed.peer);
    return peer ? { type: 'join', peer } : null;
  }
  if (parsed.type === 'leave') {
    const guestId = sanitizeGuestId(parsed.guestId);
    return guestId ? { type: 'leave', guestId } : null;
  }
  if (parsed.type === 'state') {
    const guestId = sanitizeGuestId(parsed.guestId);
    const pose = sanitizePose(parsed.pose);
    if (!guestId || !pose) return null;
    return { type: 'state', guestId, pose };
  }
  if (parsed.type === 'meta') {
    const guestId = sanitizeGuestId(parsed.guestId);
    const name = sanitizeName(parsed.name);
    const appearance = sanitizeAppearance(parsed.appearance);
    if (!guestId || !name || !appearance) return null;
    return { type: 'meta', guestId, name, appearance };
  }
  if (parsed.type === 'chat') {
    const guestId = sanitizeGuestId(parsed.guestId);
    const name = sanitizeName(parsed.name);
    const text = sanitizeChat(parsed.text);
    if (!guestId || !name || !text) return null;
    return { type: 'chat', guestId, name, text };
  }
  if (parsed.type === 'tv') {
    const payload = sanitizeTvPayload(parsed);
    return payload
      ? { type: 'tv', tvId: payload.tvId, platform: payload.platform, videoId: payload.videoId }
      : null;
  }
  if (parsed.type === 'furniture') return { type: 'furniture', places: parseFurnitureList(parsed.places) };
  return null;
}
