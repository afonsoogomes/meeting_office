import { CATALOG, type CatalogSlot } from './catalog';
import { HAIR_COLORS } from './sheets';

export type Direction = 'down' | 'right' | 'up' | 'left';
export type Action = 'idle' | 'walk' | 'run' | 'wave' | 'talk' | 'sit' | 'sleep';

export type Appearance = {
  [K in CatalogSlot]: number;
};

const STORAGE_KEY = 'meeting-office-avatar-v6';

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
  name: string;
  appearance: Appearance;
};

export function loadAvatar(): SavedAvatar {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('empty');
    const parsed = JSON.parse(raw) as SavedAvatar;
    if (!parsed?.appearance || !parsed?.name) throw new Error('invalid');
    if (typeof parsed.appearance.skin !== 'number') throw new Error('stale');
    return parsed;
  } catch {
    return { name: 'Você', appearance: defaultAppearance() };
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
