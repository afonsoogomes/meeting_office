import { MediaMixer, type MixerAudio } from './mediaMixer';
import type { TvAudioState } from '../media/youtubePlayer';

const STORAGE = 'meeting-office-tv-audio-v1';

type TvAudioHandlers = {
  onChange: (audio: TvAudioState) => void;
};

export class TvAudioHud {
  private readonly mixer: MediaMixer;

  constructor(handlers: TvAudioHandlers) {
    const root = document.querySelector('#tv-audio');
    if (!(root instanceof HTMLElement)) throw new Error('TV audio markup missing');
    this.mixer = new MediaMixer(STORAGE, { muted: true, volume: 80 }, {
      onChange: (audio) => handlers.onChange(toTvAudio(audio)),
    });
    this.mixer.attach(root);
  }

  state(): TvAudioState {
    return toTvAudio(this.mixer.state());
  }

  unmuteIntent(): void {
    this.mixer.unmuteIntent();
  }

  setActive(active: boolean): void {
    this.mixer.setActive(active);
  }
}

function toTvAudio(audio: MixerAudio): TvAudioState {
  return { muted: audio.muted, volume: audio.volume };
}
