import type {
  EmulatorSessionConfig,
  GameCatalogItem,
  GameSessionView,
} from '../../shared/game-session';

export class GamesApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchGameCatalog(): Promise<GameCatalogItem[]> {
  const data = await gamesRequest<GameCatalogItem[]>('/games');
  return Array.isArray(data) ? data : [];
}

export async function fetchGameSessions(): Promise<GameSessionView[]> {
  const data = await gamesRequest<{ sessions?: GameSessionView[]; session?: GameSessionView | null }>(
    '/games/sessions',
  );
  if (Array.isArray(data.sessions)) return data.sessions;
  return data.session ? [data.session] : [];
}

export async function fetchCurrentGameSession(): Promise<GameSessionView | null> {
  const sessions = await fetchGameSessions();
  return sessions[0] ?? null;
}

export async function createGameSession(
  guestId: string,
  name: string,
  gameId: string,
): Promise<GameSessionView> {
  return gamesRequest('/games/sessions', {
    method: 'POST',
    body: JSON.stringify({ guestId, name, gameId }),
  });
}

export async function joinGameSession(sessionId: string, guestId: string, name: string): Promise<GameSessionView> {
  return gamesRequest(`/games/sessions/${sessionId}/join`, {
    method: 'POST',
    body: JSON.stringify({ guestId, name }),
  });
}

export async function watchGameSession(sessionId: string, guestId: string, name: string): Promise<GameSessionView> {
  return gamesRequest(`/games/sessions/${sessionId}/watch`, {
    method: 'POST',
    body: JSON.stringify({ guestId, name }),
  });
}

export async function readyGameSession(sessionId: string, guestId: string): Promise<GameSessionView> {
  return gamesRequest(`/games/sessions/${sessionId}/ready`, {
    method: 'POST',
    body: JSON.stringify({ guestId }),
  });
}

export async function startGameSession(sessionId: string, guestId: string): Promise<GameSessionView> {
  return gamesRequest(`/games/sessions/${sessionId}/start`, {
    method: 'POST',
    body: JSON.stringify({ guestId }),
  });
}

export async function reportNetplayRoom(
  sessionId: string,
  guestId: string,
  roomId: string,
): Promise<GameSessionView> {
  return gamesRequest(`/games/sessions/${sessionId}/netplay`, {
    method: 'POST',
    body: JSON.stringify({ guestId, roomId }),
  });
}

export async function markGameConnected(sessionId: string, guestId: string): Promise<GameSessionView> {
  return gamesRequest(`/games/sessions/${sessionId}/connected`, {
    method: 'POST',
    body: JSON.stringify({ guestId }),
  });
}

export async function leaveGameSession(sessionId: string, guestId: string): Promise<GameSessionView | null> {
  const data = await gamesRequest<{ session: GameSessionView | null }>(`/games/sessions/${sessionId}/leave`, {
    method: 'POST',
    body: JSON.stringify({ guestId }),
  });
  return data.session ?? null;
}

export async function cancelGameSession(sessionId: string, guestId: string): Promise<GameSessionView> {
  return gamesRequest(`/games/sessions/${sessionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ guestId }),
  });
}

export async function finishGameSession(sessionId: string, guestId: string): Promise<GameSessionView> {
  return gamesRequest(`/games/sessions/${sessionId}/finish`, {
    method: 'POST',
    body: JSON.stringify({ guestId }),
  });
}

export async function fetchPlayConfig(sessionId: string, guestId: string): Promise<EmulatorSessionConfig> {
  return gamesRequest(`/games/sessions/${sessionId}/play?guestId=${encodeURIComponent(guestId)}`);
}

async function gamesRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | T
    | { message?: string | string[]; error?: string }
    | null;
  if (!response.ok) {
    const body = payload && typeof payload === 'object' ? payload : {};
    const message = Array.isArray((body as { message?: string[] }).message)
      ? (body as { message: string[] }).message.join(', ')
      : typeof (body as { message?: string }).message === 'string'
        ? (body as { message: string }).message
        : `HTTP ${response.status}`;
    throw new GamesApiError(response.status, (body as { error?: string }).error ?? 'HTTP_ERROR', message);
  }
  return payload as T;
}
