const STORAGE = 'meeting-office-peer-volume-v1';
const GUEST_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clampPeerVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function loadPeerVolumes(): Map<string, number> {
  const levels = new Map<string, number>();
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return levels;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return levels;
    for (const [guestId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!GUEST_RE.test(guestId) || typeof value !== 'number') continue;
      const level = clampPeerVolume(value / 100);
      if (level !== 1) levels.set(guestId, level);
    }
  } catch {
    return levels;
  }
  return levels;
}

export function savePeerVolumes(levels: Map<string, number>): void {
  const payload: Record<string, number> = {};
  for (const [guestId, level] of levels) {
    const rounded = Math.round(clampPeerVolume(level) * 100);
    if (rounded !== 100) payload[guestId] = rounded;
  }
  localStorage.setItem(STORAGE, JSON.stringify(payload));
}
