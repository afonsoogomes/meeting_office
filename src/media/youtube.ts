const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;

export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (YOUTUBE_ID.test(trimmed)) return trimmed;

  const raw = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  if (host === 'youtu.be') {
    return validId(url.pathname.split('/').filter(Boolean)[0]);
  }
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com' && host !== 'music.youtube.com') {
    return null;
  }

  const fromQuery = url.searchParams.get('v');
  if (fromQuery) return validId(fromQuery);

  const parts = url.pathname.split('/').filter(Boolean);
  const named = ['embed', 'shorts', 'live', 'v'];
  for (const key of named) {
    const index = parts.indexOf(key);
    if (index >= 0) return validId(parts[index + 1]);
  }
  return null;
}

function validId(value: string | undefined): string | null {
  return value && YOUTUBE_ID.test(value) ? value : null;
}
