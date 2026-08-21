export type MixerAudio = {
  muted: boolean;
  volume: number;
};

type MixerHandlers = {
  onChange: (audio: MixerAudio) => void;
};

type MixerBindings = {
  root: HTMLElement;
  mute: HTMLButtonElement;
  slider: HTMLInputElement;
  level: HTMLElement | null;
};

export function mixerGain(audio: MixerAudio): number {
  if (audio.muted || audio.volume <= 0) return 0;
  return audio.volume / 100;
}

export class MediaMixer {
  private readonly bindings: MixerBindings[] = [];
  private audio: MixerAudio;
  private active = false;
  private rootVisible: (root: HTMLElement) => boolean = () => this.active;

  constructor(
    private readonly storage: string,
    fallback: MixerAudio,
    private readonly handlers: MixerHandlers,
  ) {
    this.audio = loadMixer(storage, fallback);
  }

  attach(root: HTMLElement): void {
    const mute = root.querySelector('[data-mixer="mute"]');
    const slider = root.querySelector('[data-mixer="slider"]');
    if (!(mute instanceof HTMLButtonElement) || !(slider instanceof HTMLInputElement)) {
      throw new Error('media mixer markup missing');
    }
    const level = root.querySelector('[data-mixer="level"]');
    const binding: MixerBindings = {
      root,
      mute,
      slider,
      level: level instanceof HTMLElement ? level : null,
    };
    this.bindings.push(binding);
    mute.addEventListener('click', () => {
      this.setAudio({ ...this.audio, muted: !this.audio.muted });
    });
    slider.addEventListener('input', () => {
      const volume = Number(slider.value);
      this.setAudio({ muted: volume <= 0, volume });
    });
    this.paintBinding(binding);
  }

  state(): MixerAudio {
    return { ...this.audio };
  }

  unmuteIntent(): void {
    this.setAudio({ muted: false, volume: Math.max(this.audio.volume, 40) });
  }

  setActive(active: boolean): void {
    this.active = active;
    this.paint();
  }

  setRootVisible(fn: (root: HTMLElement) => boolean): void {
    this.rootVisible = fn;
    this.paint();
  }

  private setAudio(next: MixerAudio): void {
    this.audio = {
      muted: next.muted || next.volume <= 0,
      volume: Math.max(0, Math.min(100, Math.round(next.volume))),
    };
    saveMixer(this.storage, this.audio);
    this.paint();
    this.handlers.onChange(this.audio);
  }

  private paint(): void {
    for (const binding of this.bindings) this.paintBinding(binding);
  }

  private paintBinding(binding: MixerBindings): void {
    const quiet = this.audio.muted;
    binding.root.classList.toggle('hidden', !this.rootVisible(binding.root));
    binding.root.classList.toggle('is-muted', quiet);
    binding.mute.classList.toggle('is-off', quiet);
    binding.mute.setAttribute('aria-pressed', quiet ? 'true' : 'false');
    const label = binding.root.dataset.mixerLabel || 'volume';
    binding.mute.setAttribute('aria-label', quiet ? `Ativar som · ${label}` : `Mudo · ${label}`);
    binding.mute.title = quiet ? 'Ativar som' : 'Mudo só pra você';
    if (document.activeElement !== binding.slider) {
      binding.slider.value = String(this.audio.volume);
    }
    binding.slider.disabled = !this.active;
    binding.slider.style.setProperty('--fill', `${this.audio.volume}%`);
    if (binding.level) binding.level.textContent = quiet ? 'Mudo' : `${this.audio.volume}%`;
  }
}

function loadMixer(storage: string, fallback: MixerAudio): MixerAudio {
  try {
    const raw = localStorage.getItem(storage);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw) as Partial<MixerAudio>;
    const volume =
      typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
        ? Math.max(0, Math.min(100, Math.round(parsed.volume)))
        : fallback.volume;
    const muted = parsed.muted === undefined ? fallback.muted : Boolean(parsed.muted) || volume <= 0;
    return { muted, volume };
  } catch {
    return { ...fallback };
  }
}

function saveMixer(storage: string, audio: MixerAudio): void {
  localStorage.setItem(storage, JSON.stringify(audio));
}
