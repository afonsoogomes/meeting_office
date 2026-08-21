import { decodeYouTubeRef } from '../../shared/protocol';

export type TvAudioState = {
  muted: boolean;
  volume: number;
};

type YtPlayer = {
  mute: () => void;
  unMute: () => void;
  setVolume: (value: number) => void;
  setSize?: (width: number, height: number) => void;
  playVideo?: () => void;
  loadVideoById: (videoId: string) => void;
  loadPlaylist?: (args: { list: string; listType?: string; index?: number }) => void;
  destroy: () => void;
  getIframe?: () => HTMLIFrameElement;
};

type YtNamespace = {
  Player: new (
    element: HTMLElement | string,
    config: {
      width: number;
      height: number;
      videoId?: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
      };
    },
  ) => YtPlayer;
};

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;

let api: Promise<YtNamespace> | null = null;

function loadYouTubeApi(): Promise<YtNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (api) return api;

  api = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube API missing Player'));
    };

    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (existing) {
      if (window.YT?.Player) resolve(window.YT);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      api = null;
      reject(new Error('YouTube API failed to load'));
    };
    document.head.append(script);
  });

  return api;
}

function unlockIframe(player: YtPlayer | null): void {
  const iframe = player?.getIframe?.();
  if (!iframe) return;
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
  iframe.setAttribute('playsinline', 'true');
  iframe.setAttribute('allowfullscreen', 'true');
}

export type YouTubeHandle = {
  applyAudio: (audio: TvAudioState) => void;
  setSize: (width: number, height: number) => void;
  resume: () => void;
  destroy: () => void;
};

export async function mountYouTubePlayer(
  host: HTMLElement,
  ref: string,
  audio: TvAudioState,
  onPlayback?: (playing: boolean) => void,
): Promise<YouTubeHandle> {
  const media = decodeYouTubeRef(ref);
  if (!media || (!media.videoId && !media.playlistId)) {
    throw new Error('Invalid YouTube ref');
  }

  const YT = await loadYouTubeApi();
  let player: YtPlayer | null = null;
  let pending = { ...audio };
  let ready = false;
  let playing = false;
  let stall: number | null = null;

  const report = (): void => {
    onPlayback?.(playing);
  };

  const apply = (forceUnmute = false): void => {
    if (!player || !ready) return;
    player.setVolume(Math.round(pending.volume));
    const silent = pending.muted || pending.volume <= 0;
    if (silent) player.mute();
    else if (playing || forceUnmute) player.unMute();
    else player.mute();
  };

  const resume = (fromGesture = false): void => {
    if (!player || !ready) return;
    try {
      player.playVideo?.();
    } catch {
      /* Safari may reject until the next tap */
    }
    apply(fromGesture);
  };

  const playerVars: Record<string, string | number> = {
    autoplay: 1,
    mute: 1,
    controls: 0,
    rel: 0,
    modestbranding: 1,
    playsinline: 1,
    fs: 0,
    disablekb: 1,
    iv_load_policy: 3,
    cc_load_policy: 0,
    loop: 1,
    origin: location.origin,
    enablejsapi: 1,
  };

  if (media.playlistId) {
    playerVars.listType = 'playlist';
    playerVars.list = media.playlistId;
    if (media.index !== null) playerVars.index = media.index;
  } else if (media.videoId) {
    playerVars.playlist = media.videoId;
  }

  player = new YT.Player(host, {
    width: 320,
    height: 180,
    ...(media.videoId ? { videoId: media.videoId } : {}),
    host: 'https://www.youtube-nocookie.com',
    playerVars,
    events: {
      onReady: () => {
        ready = true;
        unlockIframe(player);
        if (media.playlistId && media.index !== null) {
          try {
            player?.loadPlaylist?.({
              list: media.playlistId,
              listType: 'playlist',
              index: media.index,
            });
          } catch {
            /* constructor playerVars already loaded the list */
          }
        }
        apply();
        resume(false);
        if (stall !== null) window.clearTimeout(stall);
        stall = window.setTimeout(() => {
          stall = null;
          if (!playing) report();
        }, 900);
      },
      onStateChange: (event) => {
        const state = event.data;
        playing = state === YT_PLAYING || state === YT_BUFFERING;
        if (playing) {
          apply();
          report();
          return;
        }
        if (state === YT_PAUSED || state === YT_ENDED) report();
      },
    },
  });

  return {
    applyAudio(next) {
      pending = { ...next };
      apply();
    },
    setSize(width, height) {
      try {
        player?.setSize?.(Math.round(width), Math.round(height));
      } catch {
        /* player not ready */
      }
    },
    resume() {
      resume(true);
    },
    destroy() {
      ready = false;
      playing = false;
      if (stall !== null) window.clearTimeout(stall);
      stall = null;
      try {
        player?.destroy();
      } catch {
        /* iframe already gone */
      }
      player = null;
    },
  };
}
