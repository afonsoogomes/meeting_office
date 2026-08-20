import type { TvAudioState } from '../media/youtubePlayer';

const STORAGE = 'meeting-office-tv-audio-v1';

type TvAudioHandlers = {
  onChange: (audio: TvAudioState) => void;
};

export class TvAudioHud {
  private readonly root: HTMLElement;
  private readonly mute: HTMLButtonElement;
  private readonly slider: HTMLInputElement;
  private audio: TvAudioState;
  private active = false;

  constructor(private readonly handlers: TvAudioHandlers) {
    const root = document.querySelector('#tv-audio');
    const mute = document.querySelector('#tv-audio-mute');
    const slider = document.querySelector('#tv-audio-volume');
    if (
      !(root instanceof HTMLElement) ||
      !(mute instanceof HTMLButtonElement) ||
      !(slider instanceof HTMLInputElement)
    ) {
      throw new Error('TV audio markup missing');
    }
    this.root = root;
    this.mute = mute;
    this.slider = slider;
    this.audio = loadAudio();
    this.slider.value = String(this.audio.volume);
    this.render();

    this.mute.addEventListener('click', () => {
      this.setAudio({ ...this.audio, muted: !this.audio.muted });
    });
    this.slider.addEventListener('input', () => {
      const volume = Number(this.slider.value);
      this.setAudio({ muted: volume <= 0, volume });
    });
  }

  state(): TvAudioState {
    return { ...this.audio };
  }

  unmuteIntent(): void {
    this.setAudio({ muted: false, volume: Math.max(this.audio.volume, 40) });
  }

  setActive(active: boolean): void {
    this.active = active;
    this.render();
  }

  private setAudio(next: TvAudioState): void {
    this.audio = {
      muted: next.muted || next.volume <= 0,
      volume: Math.max(0, Math.min(100, Math.round(next.volume))),
    };
    saveAudio(this.audio);
    this.slider.value = String(this.audio.volume);
    this.render();
    this.handlers.onChange(this.audio);
  }

  private render(): void {
    this.root.classList.toggle('hidden', !this.active);
    this.mute.classList.toggle('pill-muted', this.audio.muted);
    this.mute.classList.toggle('pill-live', !this.audio.muted);
    this.mute.textContent = this.audio.muted ? 'TV mudo' : 'TV som';
    this.slider.disabled = !this.active;
  }
}

function loadAudio(): TvAudioState {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return { muted: true, volume: 80 };
    const parsed = JSON.parse(raw) as Partial<TvAudioState>;
    const volume =
      typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
        ? Math.max(0, Math.min(100, Math.round(parsed.volume)))
        : 80;
    return { muted: parsed.muted !== false, volume };
  } catch {
    return { muted: true, volume: 80 };
  }
}

function saveAudio(audio: TvAudioState): void {
  localStorage.setItem(STORAGE, JSON.stringify(audio));
}
