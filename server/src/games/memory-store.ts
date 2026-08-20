import { isActiveSession } from '../../../shared/game-session';
import type { GameStore, StoredSession } from './game-store';

export class MemoryGameStore implements GameStore {
  private readonly sessions = new Map<string, StoredSession>();

  listActive(officeSlug: string): StoredSession[] {
    const active: StoredSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.officeSlug === officeSlug && isActiveSession(session.status)) active.push(clone(session));
    }
    return active.sort((a, b) => b.createdAt - a.createdAt);
  }

  loadById(id: string): StoredSession | null {
    const session = this.sessions.get(id);
    return session ? clone(session) : null;
  }

  findActiveForGuest(guestId: string): StoredSession | null {
    for (const session of this.sessions.values()) {
      if (!isActiveSession(session.status)) continue;
      if (session.players.some((player) => player.guestId === guestId)) return clone(session);
    }
    return null;
  }

  save(session: StoredSession): void {
    this.sessions.set(session.id, clone(session));
  }
}

function clone(session: StoredSession): StoredSession {
  return {
    ...session,
    players: session.players.map((player) => ({ ...player })),
  };
}
