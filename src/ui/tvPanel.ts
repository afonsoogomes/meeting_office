import { parseYouTubeId } from '../media/youtube';
import type { TvSpot } from '../world/tv';

export type TvPlatformOption = {
  id: 'youtube' | 'vimeo' | 'twitch';
  label: string;
  enabled: boolean;
};

export const TV_PLATFORMS: TvPlatformOption[] = [
  { id: 'youtube', label: 'YouTube', enabled: true },
  { id: 'vimeo', label: 'Vimeo', enabled: false },
  { id: 'twitch', label: 'Twitch', enabled: false },
];

type TvPanelHandlers = {
  onPlay: (tv: TvSpot, videoId: string) => void;
  onStop: (tv: TvSpot) => void;
};

export class TvPanel {
  private readonly panel: HTMLElement;
  private readonly url: HTMLInputElement;
  private readonly error: HTMLElement;
  private readonly platforms: HTMLElement;
  private tv: TvSpot | null = null;
  private platform: TvPlatformOption['id'] = 'youtube';

  constructor(private readonly handlers: TvPanelHandlers) {
    const panel = document.querySelector('#tv-panel');
    const url = document.querySelector('#tv-url');
    const error = document.querySelector('#tv-error');
    const platforms = document.querySelector('#tv-platforms');
    if (
      !(panel instanceof HTMLElement) ||
      !(url instanceof HTMLInputElement) ||
      !(error instanceof HTMLElement) ||
      !(platforms instanceof HTMLElement)
    ) {
      throw new Error('TV panel markup missing');
    }
    this.panel = panel;
    this.url = url;
    this.error = error;
    this.platforms = platforms;

    this.platforms.replaceChildren();
    for (const option of TV_PLATFORMS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.disabled = !option.enabled;
      button.className = 'catalog-group';
      if (option.id === this.platform) button.classList.add('selected');
      if (!option.enabled) button.title = 'Em breve';
      button.addEventListener('click', () => {
        if (!option.enabled) return;
        this.platform = option.id;
        for (const child of this.platforms.children) child.classList.remove('selected');
        button.classList.add('selected');
      });
      this.platforms.append(button);
    }

    document.querySelector('#tv-stop')?.addEventListener('click', () => {
      if (!this.tv) return;
      this.handlers.onStop(this.tv);
      this.setOpen(false);
    });
    document.querySelector('#close-tv')?.addEventListener('click', () => this.setOpen(false));

    const form = document.querySelector('#tv-form');
    if (form instanceof HTMLFormElement) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        this.submit();
      });
    }
  }

  open(tv: TvSpot): void {
    this.tv = tv;
    this.setError('');
    this.setOpen(true);
    this.url.focus();
    this.url.select();
  }

  isOpen(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  setOpen(open: boolean): void {
    this.panel.classList.toggle('hidden', !open);
    if (!open) {
      this.tv = null;
      this.url.blur();
    }
  }

  private submit(): void {
    if (!this.tv) return;
    if (this.platform !== 'youtube') {
      this.setError('Por enquanto só o YouTube está ligado.');
      return;
    }
    const videoId = parseYouTubeId(this.url.value);
    if (!videoId) {
      this.setError('Cola um link do YouTube (watch, youtu.be ou shorts).');
      return;
    }
    this.setError('');
    this.handlers.onPlay(this.tv, videoId);
    this.setOpen(false);
  }

  private setError(message: string): void {
    this.error.textContent = message;
    this.error.classList.toggle('hidden', message.length === 0);
  }
}
