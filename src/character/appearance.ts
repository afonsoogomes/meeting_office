import { CATALOG, type CatalogSlot } from './catalog';
import { HAIR_COLORS } from './sheets';

export type Direction = 'down' | 'right' | 'up' | 'left';
export type Action = 'idle' | 'walk' | 'run' | 'wave' | 'talk' | 'sit' | 'sleep';

export type Appearance = {
  [K in CatalogSlot]: number;
};

const STORAGE_KEY = 'meeting-office-avatar-v7';
const LEGACY_STORAGE_KEY = 'meeting-office-avatar-v6';
const PRESENCE_KEY = 'meeting-office-presence-id';
const PLACEHOLDER_NAME = 'Você';
const GUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rand(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function defaultAppearance(): Appearance {
  return {
    skin: 1,
    hair: 2,
    hairColor: 1,
    shirt: 2,
    pants: 3,
    hat: 0,
    accessory: 0,
  };
}

export function randomAppearance(): Appearance {
  const pick = (slot: CatalogSlot, chance = 1): number => {
    const spec = CATALOG[slot];
    if (spec.optional && Math.random() > chance) return 0;
    return rand(spec.optional ? 1 : 0, spec.count - (spec.optional ? 0 : 1));
  };

  return {
    skin: pick('skin'),
    hair: pick('hair'),
    hairColor: rand(0, HAIR_COLORS.length - 1),
    shirt: pick('shirt'),
    pants: pick('pants'),
    hat: pick('hat', 0.35),
    accessory: pick('accessory', 0.25),
  };
}

export function cycleSlot(appearance: Appearance, slot: CatalogSlot, step: 1 | -1): Appearance {
  const spec = CATALOG[slot];
  const min = spec.optional ? 0 : 0;
  const max = spec.optional ? spec.count : spec.count - 1;
  const span = max - min + 1;
  const current = appearance[slot];
  const next = min + ((((current - min + step) % span) + span) % span);
  return { ...appearance, [slot]: next };
}

export type SavedAvatar = {
  guestId: string;
  name: string;
  appearance: Appearance;
};

function newGuestId(): string {
  return crypto.randomUUID();
}

function isGuestId(value: unknown): value is string {
  return typeof value === 'string' && GUEST_ID_RE.test(value);
}

function asAppearance(value: unknown): Appearance | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Appearance;
  if (typeof raw.skin !== 'number') return null;
  return raw;
}

function hydrate(parsed: { guestId?: unknown; name?: unknown; appearance?: unknown }): SavedAvatar {
  const appearance = asAppearance(parsed.appearance) ?? defaultAppearance();
  const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : PLACEHOLDER_NAME;
  return {
    guestId: isGuestId(parsed.guestId) ? parsed.guestId : newGuestId(),
    name,
    appearance,
  };
}

export function loadPresenceId(): string {
  const existing = sessionStorage.getItem(PRESENCE_KEY);
  if (isGuestId(existing)) return existing;
  const id = newGuestId();
  sessionStorage.setItem(PRESENCE_KEY, id);
  return id;
}

export function needsName(avatar: SavedAvatar): boolean {
  const name = avatar.name.trim();
  return name.length < 2 || name === PLACEHOLDER_NAME;
}

export function loadAvatar(): SavedAvatar {
  const fresh = readStored(STORAGE_KEY) ?? readStored(LEGACY_STORAGE_KEY);
  if (!fresh) return { guestId: newGuestId(), name: PLACEHOLDER_NAME, appearance: defaultAppearance() };
  const avatar = hydrate(fresh);
  if (!readStored(STORAGE_KEY) || avatar.guestId !== fresh.guestId) saveAvatar(avatar);
  return avatar;
}

function readStored(key: string): { guestId?: unknown; name?: unknown; appearance?: unknown } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { guestId?: unknown; name?: unknown; appearance?: unknown };
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAvatar(avatar: SavedAvatar): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(avatar));
}

export function facingFromScreen(vx: number, vy: number): Direction {
  if (vx === 0 && vy === 0) return 'down';
  if (Math.abs(vx) > Math.abs(vy)) return vx > 0 ? 'right' : 'left';
  return vy > 0 ? 'down' : 'up';
}
