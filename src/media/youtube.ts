import {
  decodeYouTubeRef,
  encodeYouTubeRef,
  YOUTUBE_PLAYLIST_RE,
  YOUTUBE_VIDEO_RE,
  type YouTubeRef,
} from '../../shared/protocol';

export type { YouTubeRef };

const HOSTS = new Set(['youtube.com', 'youtube-nocookie.com', 'music.youtube.com']);

export function parseYouTubeMedia(input: string): YouTubeRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const encoded = decodeYouTubeRef(trimmed);
  if (encoded) return encoded;

  const raw = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const list = url.searchParams.get('list');
  const playlistId = list && YOUTUBE_PLAYLIST_RE.test(list) ? list : null;
  const index = parsePlaylistIndex(url.searchParams.get('index'));

  if (host === 'youtu.be') {
    const videoId = validVideoId(url.pathname.split('/').filter(Boolean)[0]);
    return pack(videoId, playlistId, index);
  }
  if (!HOSTS.has(host)) return null;

  const fromQuery = validVideoId(url.searchParams.get('v') ?? undefined);
  if (fromQuery || playlistId) return pack(fromQuery, playlistId, index);

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'playlist' || (parts[0] === 'embed' && parts[1] === 'videoseries')) {
    return pack(null, playlistId, index);
  }

  const named = ['embed', 'shorts', 'live', 'v'];
  for (const key of named) {
    const at = parts.indexOf(key);
    if (at >= 0) return pack(validVideoId(parts[at + 1]), playlistId, index);
  }
  return pack(null, playlistId, index);
}

export function parseYouTubeId(input: string): string | null {
  return encodeYouTubeRef(parseYouTubeMedia(input));
}

function pack(videoId: string | null, playlistId: string | null, index: number | null): YouTubeRef | null {
  if (!videoId && !playlistId) return null;
  return { videoId, playlistId, index: videoId && playlistId ? index : null };
}

function validVideoId(value: string | undefined): string | null {
  return value && YOUTUBE_VIDEO_RE.test(value) ? value : null;
}

function parsePlaylistIndex(value: string | null): number | null {
  if (!value || !/^\d{1,3}$/.test(value)) return null;
  const parsed = Number(value);
  if (parsed <= 0) return 0;
  return Math.min(999, parsed - 1);
}
