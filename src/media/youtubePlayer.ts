export type TvAudioState = {
  muted: boolean;
  volume: number;
};

type YtPlayer = {
  mute: () => void;
  unMute: () => void;
  setVolume: (value: number) => void;
  setSize?: (width: number, height: number) => void;
  loadVideoById: (videoId: string) => void;
  destroy: () => void;
  getIframe?: () => HTMLIFrameElement;
};

type YtNamespace = {
  Player: new (
    element: HTMLElement | string,
    config: {
      width: number;
      height: number;
      videoId: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: { onReady?: () => void };
    },
  ) => YtPlayer;
};

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

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

export type YouTubeHandle = {
  applyAudio: (audio: TvAudioState) => void;
  setSize: (width: number, height: number) => void;
  destroy: () => void;
};

export async function mountYouTubePlayer(
  host: HTMLElement,
  videoId: string,
  audio: TvAudioState,
): Promise<YouTubeHandle> {
  const YT = await loadYouTubeApi();
  let player: YtPlayer | null = null;
  let pending = { ...audio };
  let ready = false;

  const apply = (): void => {
    if (!player || !ready) return;
    player.setVolume(Math.round(pending.volume));
    if (pending.muted || pending.volume <= 0) player.mute();
    else player.unMute();
  };

  player = new YT.Player(host, {
    width: 320,
    height: 180,
    videoId,
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      autoplay: 1,
      mute: 1,
      controls: 0,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      fs: 0,
      disablekb: 1,
      iv_load_policy: 3,
      origin: location.origin,
    },
    events: {
      onReady: () => {
        ready = true;
        try {
          player?.getIframe?.().setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
        } catch {
          /* ignore */
        }
        apply();
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
    destroy() {
      ready = false;
      try {
        player?.destroy();
      } catch {
        /* iframe already gone */
      }
      player = null;
    },
  };
}
